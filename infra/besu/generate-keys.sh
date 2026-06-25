#!/usr/bin/env bash
#
# infra/besu/generate-keys.sh
# Bootstrap the Hyperledger Besu IBFT 2.0 validator material for the stack in
# docker-compose.yml.
#
# Produces (all gitignored):
#   - infra/besu/networkFiles/            operator-tool output, including the real
#                                         genesis.json (mounted by docker-compose)
#   - infra/besu/validator-key            validator sealing key (mounted at /cfg/key)
#   - infra/besu/static-nodes.json        besu-rpc -> validator peering
#   - infra/besu/deployer-private-key.txt EOA for the hardhat contract deploy
#
# docker-compose mounts infra/besu/networkFiles/genesis.json, which already has
# the real IBFT extraData (validator set) baked in. The chain is free-gas
# (gasPrice 0), so the deployer needs no funded balance and the genesis alloc is
# empty -> no address derivation required.
#
# Re-running is safe: existing keys/output are not overwritten.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BESU_IMAGE="hyperledger/besu:24.10.0"
BESU_CMD="${BESU_CMD:-}"   # set BESU_CMD=besu to use a local binary instead of Docker

run_besu() {
  if [ -n "${BESU_CMD}" ]; then
    # shellcheck disable=SC2086
    ${BESU_CMD} "$@"
  else
    docker run --rm -v "${SCRIPT_DIR}:/work" -w /work "${BESU_IMAGE}" "$@"
  fi
}
have() { command -v "$1" >/dev/null 2>&1; }

echo "==> Besu IBFT 2.0 key + genesis bootstrap"
echo "    dir: ${SCRIPT_DIR}"

if [ -z "${BESU_CMD}" ] && ! have docker; then
  echo "ERROR: need Docker (or set BESU_CMD=besu to a local binary), then re-run." >&2
  exit 1
fi

OUT_DIR="${SCRIPT_DIR}/networkFiles"
IBFT_CONFIG="${SCRIPT_DIR}/ibftConfigFile.json"

if [ ! -f "${IBFT_CONFIG}" ]; then
  cat >"${IBFT_CONFIG}" <<'JSON'
{
  "genesis": {
    "config": {
      "chainId": 1337,
      "berlinBlock": 0,
      "ibft2": {
        "blockperiodseconds": 2,
        "epochlength": 30000,
        "requesttimeoutseconds": 4,
        "blockreward": "0x0"
      }
    },
    "nonce": "0x0",
    "timestamp": "0x0",
    "gasLimit": "0x1fffffffffffff",
    "difficulty": "0x1",
    "mixHash": "0x63746963616c2062797a616e74696e65206661756c7420746f6c6572616e6365",
    "coinbase": "0x0000000000000000000000000000000000000000",
    "alloc": {}
  },
  "blockchain": {
    "nodes": {
      "generate": true,
      "count": 1
    }
  }
}
JSON
fi

GEN_GENESIS="${OUT_DIR}/genesis.json"
VALIDATOR_KEY_DST="${SCRIPT_DIR}/validator-key"

# Generate the validator set + genesis. The operator tool fails with "Output
# directory already exists" when --to points at a bind-mounted path that Docker
# (or a prior run) created, and besu runs as a non-root user that cannot write
# the root-owned mount. To be bulletproof: generate into a CONTAINER-LOCAL temp
# dir and copy the result onto the host, running the container as root. Skip
# entirely if the final outputs already exist.
if [ -f "${VALIDATOR_KEY_DST}" ] && [ -f "${GEN_GENESIS}" ]; then
  echo "==> validator-key + generated genesis already present; skipping operator tool."
elif [ -n "${BESU_CMD}" ]; then
  rm -rf "${OUT_DIR}"
  echo "==> Running operator tool (local besu) ..."
  ${BESU_CMD} operator generate-blockchain-config \
    --config-file="${IBFT_CONFIG}" --to="${OUT_DIR}" --private-key-file-name=key
else
  rm -rf "${OUT_DIR}"
  echo "==> Running operator tool (docker: generate-to-temp + copy) ..."
  docker run --rm -u 0:0 -v "${SCRIPT_DIR}:/work" --entrypoint /bin/sh "${BESU_IMAGE}" -c '
    set -e
    BESU_BIN="$(command -v besu 2>/dev/null || true)"
    [ -n "$BESU_BIN" ] || BESU_BIN=/opt/besu/bin/besu
    rm -rf /tmp/besu-nf
    "$BESU_BIN" operator generate-blockchain-config \
      --config-file=/work/ibftConfigFile.json --to=/tmp/besu-nf --private-key-file-name=key
    rm -rf /work/networkFiles
    cp -a /tmp/besu-nf /work/networkFiles
  '
fi

if [ ! -f "${GEN_GENESIS}" ]; then
  echo "ERROR: operator-tool did not produce ${GEN_GENESIS}." >&2
  exit 1
fi

# Install the validator key (mounted at /cfg/key by docker-compose).
if [ -f "${VALIDATOR_KEY_DST}" ]; then
  echo "==> validator-key present (not overwriting)."
else
  FIRST_KEY="$(find "${OUT_DIR}/keys" -name key -type f 2>/dev/null | head -n1 || true)"
  if [ -n "${FIRST_KEY}" ]; then
    cp "${FIRST_KEY}" "${VALIDATOR_KEY_DST}"
    chmod 600 "${VALIDATOR_KEY_DST}"
    echo "==> validator-key written."
  else
    echo "WARN: no validator key found under ${OUT_DIR}/keys." >&2
  fi
fi

# Static peering: besu-rpc dials the validator by its enode (DNS name besu-validator).
STATIC_NODES_DST="${SCRIPT_DIR}/static-nodes.json"
if [ -f "${STATIC_NODES_DST}" ]; then
  echo "==> static-nodes.json present (not overwriting)."
else
  PUB_FILE="$(find "${OUT_DIR}/keys" -name 'key.pub' -type f 2>/dev/null | head -n1 || true)"
  if [ -n "${PUB_FILE}" ]; then
    NODE_ID="$(tr -d '[:space:]' <"${PUB_FILE}")"
    NODE_ID="${NODE_ID#0x}"
    printf '[\n  "enode://%s@besu-validator:30303"\n]\n' "${NODE_ID}" >"${STATIC_NODES_DST}"
    echo "==> static-nodes.json written (enode -> besu-validator:30303)."
  else
    echo "WARN: no key.pub found; static-nodes.json not written (besu-rpc will not peer)." >&2
  fi
fi

# Deployer EOA for the hardhat contract deploy. Free-gas chain -> no funding needed.
DEPLOYER_KEY_FILE="${SCRIPT_DIR}/deployer-private-key.txt"
if [ -f "${DEPLOYER_KEY_FILE}" ]; then
  echo "==> deployer key present (not overwriting)."
elif have openssl; then
  printf '0x%s\n' "$(openssl rand -hex 32)" >"${DEPLOYER_KEY_FILE}"
  chmod 600 "${DEPLOYER_KEY_FILE}"
  echo "==> deployer key written."
else
  echo "WARN: openssl missing; put a 0x private key in ${DEPLOYER_KEY_FILE}." >&2
fi

echo
echo "Done. docker-compose mounts ${GEN_GENESIS} (real validator set baked in)."
echo "Deploy contracts with: DEPLOYER_PRIVATE_KEY=\$(cat ${DEPLOYER_KEY_FILE})"
