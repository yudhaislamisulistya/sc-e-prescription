#!/usr/bin/env bash
#
# infra/besu/generate-keys.sh
# ---------------------------------------------------------------------------
# Bootstrap the cryptographic material for the Hyperledger Besu IBFT 2.0
# consortium defined in docker-compose.yml.
#
# What this produces:
#   1. A validator node key  -> ./infra/besu/validator-key   (mounted at /cfg/key)
#      and its derived address.
#   2. The IBFT 2.0 "extraData" RLP blob that encodes the initial validator
#      set, which must replace the "REPLACE_WITH_IBFT_EXTRA_DATA" placeholder
#      in genesis.json.
#   3. A funded deployer account whose address replaces
#      "REPLACE_WITH_DEPLOYER_ADDRESS" in the genesis "alloc" block.
#
# NOTE: genesis.json ships with JSON-VALID *string* placeholders
# ("REPLACE_WITH_IBFT_EXTRA_DATA" / "REPLACE_WITH_DEPLOYER_ADDRESS") so the
# file still parses. They are NOT valid on-chain values — Besu will refuse to
# start until you substitute the real values generated below.
#
# Requirements (NOT available in the CI/dev sandbox — run on a real host):
#   - Docker (to invoke the hyperledger/besu image), OR a local `besu` binary.
#   - `openssl` for the deployer key, and either `node`/`cast` to derive the
#     deployer address (instructions below). `jq` is optional but recommended.
#
# This script is intentionally conservative: it generates the validator key
# and prints copy-paste instructions for the genesis substitutions. It does
# NOT mutate genesis.json automatically (so a half-finished run can't corrupt
# a committed file). Re-running is safe; existing keys are not overwritten.
# ---------------------------------------------------------------------------

set -euo pipefail

# Resolve directory of this script so it works from any CWD.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BESU_IMAGE="hyperledger/besu:24.10"

# Allow overriding how Besu is invoked:
#   BESU_CMD="besu"  -> use a locally installed besu binary
#   (default)        -> run the pinned Docker image
BESU_CMD="${BESU_CMD:-}"

run_besu() {
  if [ -n "${BESU_CMD}" ]; then
    # shellcheck disable=SC2086
    ${BESU_CMD} "$@"
  else
    docker run --rm \
      -v "${SCRIPT_DIR}:/work" \
      -w /work \
      "${BESU_IMAGE}" "$@"
  fi
}

have() { command -v "$1" >/dev/null 2>&1; }

echo "==> Besu IBFT 2.0 key + genesis bootstrap"
echo "    Script dir: ${SCRIPT_DIR}"
echo

# ---------------------------------------------------------------------------
# Sanity: make sure we have a way to run Besu.
# ---------------------------------------------------------------------------
if [ -z "${BESU_CMD}" ] && ! have docker; then
  echo "ERROR: neither a local 'besu' binary (set BESU_CMD=besu) nor 'docker' is available." >&2
  echo "       Install Docker, or set BESU_CMD to a Besu binary, then re-run." >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# 1. Generate the validator set + IBFT extraData via `besu operator-tool`.
#
# We use a small config telling the operator-tool to create 1 validator
# node (scale up `blockchain.nodes.count` for a multi-validator consortium).
# ---------------------------------------------------------------------------
OUT_DIR="${SCRIPT_DIR}/networkFiles"
IBFT_CONFIG="${SCRIPT_DIR}/ibftConfigFile.json"

if [ ! -f "${IBFT_CONFIG}" ]; then
  echo "==> Writing operator-tool config: ${IBFT_CONFIG}"
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

if [ -d "${OUT_DIR}" ]; then
  echo "==> ${OUT_DIR} already exists; leaving it untouched (delete it to regenerate)."
else
  echo "==> Running 'besu operator generate-blockchain-config' ..."
  # Inside the container the script dir is mounted at /work.
  if [ -n "${BESU_CMD}" ]; then
    run_besu operator generate-blockchain-config \
      --config-file="${IBFT_CONFIG}" \
      --to="${OUT_DIR}" \
      --private-key-file-name=key
  else
    run_besu operator generate-blockchain-config \
      --config-file=/work/ibftConfigFile.json \
      --to=/work/networkFiles \
      --private-key-file-name=key
  fi
fi

# operator-tool emits:
#   networkFiles/genesis.json                 (with real extraData baked in)
#   networkFiles/keys/<address>/key           (validator private key)
#   networkFiles/keys/<address>/key.pub
GEN_GENESIS="${OUT_DIR}/genesis.json"

# ---------------------------------------------------------------------------
# 2. Install the validator key for docker-compose (mounted at /cfg/key).
# ---------------------------------------------------------------------------
VALIDATOR_KEY_DST="${SCRIPT_DIR}/validator-key"
if [ -f "${VALIDATOR_KEY_DST}" ]; then
  echo "==> Validator key already present at ${VALIDATOR_KEY_DST} (not overwriting)."
else
  FIRST_KEY="$(find "${OUT_DIR}/keys" -name key -type f 2>/dev/null | head -n1 || true)"
  if [ -n "${FIRST_KEY}" ]; then
    cp "${FIRST_KEY}" "${VALIDATOR_KEY_DST}"
    chmod 600 "${VALIDATOR_KEY_DST}"
    echo "==> Copied validator key -> ${VALIDATOR_KEY_DST}"
  else
    echo "WARN: could not locate a generated validator key under ${OUT_DIR}/keys." >&2
  fi
fi

# ---------------------------------------------------------------------------
# 3. Extract the IBFT extraData from the generated genesis.
# ---------------------------------------------------------------------------
EXTRA_DATA=""
if [ -f "${GEN_GENESIS}" ]; then
  if have jq; then
    EXTRA_DATA="$(jq -r '.extraData' "${GEN_GENESIS}")"
  else
    # Minimal grep/sed fallback if jq is unavailable.
    EXTRA_DATA="$(grep -o '"extraData"[[:space:]]*:[[:space:]]*"[^"]*"' "${GEN_GENESIS}" | sed 's/.*"\(0x[^"]*\)"$/\1/')"
  fi
fi

# ---------------------------------------------------------------------------
# 4. Generate a funded deployer account for genesis "alloc".
#
# The validator key above is for sealing blocks; the deployer is a separate
# EOA used by Hardhat/Ignition to deploy contracts on the free-gas chain.
# ---------------------------------------------------------------------------
DEPLOYER_KEY_FILE="${SCRIPT_DIR}/deployer-private-key.txt"
if [ -f "${DEPLOYER_KEY_FILE}" ]; then
  echo "==> Deployer key already present at ${DEPLOYER_KEY_FILE} (not overwriting)."
else
  if have openssl; then
    printf '0x%s\n' "$(openssl rand -hex 32)" >"${DEPLOYER_KEY_FILE}"
    chmod 600 "${DEPLOYER_KEY_FILE}"
    echo "==> Wrote deployer private key -> ${DEPLOYER_KEY_FILE}"
  else
    echo "WARN: openssl not found; supply your own deployer private key in ${DEPLOYER_KEY_FILE}." >&2
  fi
fi

# Derive the deployer ADDRESS from the private key. We try a few common tools.
DEPLOYER_ADDR=""
DEPLOYER_PK="$(cat "${DEPLOYER_KEY_FILE}" 2>/dev/null || true)"
if [ -n "${DEPLOYER_PK}" ]; then
  if have cast; then
    DEPLOYER_ADDR="$(cast wallet address --private-key "${DEPLOYER_PK}" 2>/dev/null || true)"
  elif have node; then
    DEPLOYER_ADDR="$(node -e '
      try {
        const { computeAddress } = require("ethers");
        process.stdout.write(computeAddress(process.argv[1].trim()));
      } catch (e) {
        // ethers v5 fallback
        try {
          const { utils } = require("ethers");
          process.stdout.write(utils.computeAddress(process.argv[1].trim()));
        } catch (_) { /* leave blank */ }
      }
    ' "${DEPLOYER_PK}" 2>/dev/null || true)"
  fi
fi

# ---------------------------------------------------------------------------
# 5. Print the substitution instructions.
# ---------------------------------------------------------------------------
echo
echo "============================================================================"
echo " NEXT STEPS — edit infra/besu/genesis.json and replace the placeholders:"
echo "============================================================================"
echo

if [ -n "${EXTRA_DATA}" ]; then
  echo "  \"extraData\": \"${EXTRA_DATA}\""
else
  echo "  \"extraData\": <copy the .extraData value from ${GEN_GENESIS}>"
fi
echo "      ^ replaces \"REPLACE_WITH_IBFT_EXTRA_DATA\""
echo

if [ -n "${DEPLOYER_ADDR}" ]; then
  echo "  \"alloc\": { \"${DEPLOYER_ADDR}\": { \"balance\": \"0x200...000\" } }"
  echo "      ^ replaces the \"REPLACE_WITH_DEPLOYER_ADDRESS\" key"
  echo
  echo "  Also set DEPLOYER_PRIVATE_KEY in .env to the value in:"
  echo "    ${DEPLOYER_KEY_FILE}"
else
  echo "  Derive your deployer address from ${DEPLOYER_KEY_FILE} (cast/ethers),"
  echo "  then use it as the \"alloc\" key replacing \"REPLACE_WITH_DEPLOYER_ADDRESS\"."
fi

echo
echo "Generated artifacts (all gitignored — never commit private keys):"
echo "  - validator key      : ${VALIDATOR_KEY_DST}"
echo "  - deployer key        : ${DEPLOYER_KEY_FILE}"
echo "  - operator-tool output: ${OUT_DIR}/ (genesis.json + keys/)"
echo
echo "Done."
