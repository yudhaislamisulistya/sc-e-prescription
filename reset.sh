#!/usr/bin/env bash
#
# reset.sh - wipe to a clean state and bring the infrastructure up, verified
# healthy. Use when the Besu material is inconsistent (e.g. Docker auto-created
# a phantom networkFiles/genesis.json directory). Safe: there is no real data yet.
#
# After this succeeds, run:
#   bash deploy-contracts.sh && docker compose up --build -d
set -euo pipefail
cd "$(dirname "$0")"

echo "==> Stopping stack + removing data volumes"
docker compose down -v --remove-orphans 2>/dev/null || true

echo "==> Removing half-generated / phantom Besu material"
rm -rf infra/besu/networkFiles infra/besu/validator-key \
       infra/besu/static-nodes.json infra/besu/deployer-private-key.txt \
       infra/besu/ibftConfigFile.json

echo "==> Bootstrap (secrets + .env + Besu keys + genesis)"
bash bootstrap.sh

echo "==> Verifying generated files exist (as files)"
for f in infra/besu/validator-key infra/besu/deployer-private-key.txt \
         infra/besu/static-nodes.json infra/besu/networkFiles/genesis.json; do
  if [ -f "$f" ]; then
    echo "    ok       $f"
  else
    echo "    MISSING  $f" >&2
    echo "ERROR: Besu key/genesis generation failed. Run it directly to see why:" >&2
    echo "  bash infra/besu/generate-keys.sh" >&2
    exit 1
  fi
done

echo "==> Refreshing .env from template (COMPOSE_PROFILES empty for phase 1)"
cp -f .env.example .env

echo "==> Starting infra (besu, postgres, redis, ipfs)"
docker compose up -d

RPC="http://127.0.0.1:${BESU_RPC_PORT:-13302}"
echo "==> Waiting for besu-rpc to produce blocks at ${RPC} ..."
ok=0
for _ in $(seq 1 30); do
  r="$(curl -s -X POST "$RPC" -H 'content-type: application/json' \
        -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' 2>/dev/null || true)"
  case "$r" in
    *'"result"'*0x*) echo "    chain up: $r"; ok=1; break ;;
    *) printf '.'; sleep 2 ;;
  esac
done
echo
if [ "$ok" != "1" ]; then
  echo "ERROR: besu-rpc did not respond after ~60s. Diagnose with:" >&2
  echo "  docker compose ps" >&2
  echo "  docker compose logs --tail=80 besu-validator besu-rpc" >&2
  exit 1
fi

echo
echo "Infra is healthy. Next:"
echo "  bash deploy-contracts.sh        # deploy contracts + fill .env"
echo "  docker compose up --build -d    # start the app tier (indexer, kms-signer, web)"
echo "  open  http://<host>:${WEB_PORT:-13300}"
