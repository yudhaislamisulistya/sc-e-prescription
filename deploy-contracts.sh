#!/usr/bin/env bash
#
# deploy-contracts.sh
# Deploy the three registries to the running Besu node and write their addresses
# into .env (plus COMPOSE_PROFILES=app and the NEXT_PUBLIC_* mirror) so the app
# tier can start. Run AFTER `docker compose up -d` (infra) is healthy.
#
# Optional overrides:
#   ADMIN_ADDRESS=0x...   admin EOA for the registry (default: the deployer's own)
#   BESU_RPC_URL=...      RPC endpoint (default: http://127.0.0.1:13302)
set -euo pipefail
cd "$(dirname "$0")"

RPC="${BESU_RPC_URL:-http://127.0.0.1:13302}"
DEPLOYER_FILE="infra/besu/deployer-private-key.txt"

[ -f "$DEPLOYER_FILE" ] || { echo "ERROR: $DEPLOYER_FILE missing - run ./bootstrap.sh first." >&2; exit 1; }
DEPLOYER_PK="$(tr -d '[:space:]' < "$DEPLOYER_FILE")"

[ -d node_modules ] || { echo "==> npm install"; npm install; }

# Admin EOA for the registry (defaults to the deployer address).
ADMIN="${ADMIN_ADDRESS:-}"
if [ -z "$ADMIN" ]; then
  ADMIN="$(node -e 'const {Wallet}=require("ethers");process.stdout.write(new Wallet(process.argv[1]).address)' "$DEPLOYER_PK")"
fi
echo "==> admin = $ADMIN"
echo "==> rpc   = $RPC"

mkdir -p ignition
printf '{ "EPrescriptionSystem": { "adminAddress": "%s" } }\n' "$ADMIN" > ignition/params.json

echo "==> Deploying contracts ..."
echo y | BESU_RPC_URL="$RPC" DEPLOYER_PRIVATE_KEY="$DEPLOYER_PK" \
  npx hardhat ignition deploy ignition/modules/Deploy.ts --network besu --parameters ignition/params.json

ADDR_JSON="ignition/deployments/chain-1337/deployed_addresses.json"
[ -f "$ADDR_JSON" ] || { echo "ERROR: $ADDR_JSON not found (deploy failed)." >&2; exit 1; }

# Pull the three addresses out of the ignition deployment record.
eval "$(node -e '
const a = require(process.argv[1]);
const f = (k) => { const e = Object.entries(a).find(([n]) => n.endsWith("#" + k)); return e ? e[1] : ""; };
console.log("ID=" + f("IdentityRegistry"));
console.log("PR=" + f("PrescriptionRegistry"));
console.log("KA=" + f("KeyAccessRegistry"));
' "$PWD/$ADDR_JSON")"

[ -n "${ID:-}" ] && [ -n "${PR:-}" ] && [ -n "${KA:-}" ] \
  || { echo "ERROR: could not read all addresses from $ADDR_JSON" >&2; exit 1; }
echo "==> IdentityRegistry     = $ID"
echo "==> PrescriptionRegistry = $PR"
echo "==> KeyAccessRegistry    = $KA"

# Write the values into .env (create from example if missing; update in place).
[ -f .env ] || cp .env.example .env
set_env() {
  local key="$1" val="$2" tmp
  if grep -qE "^${key}=" .env; then
    tmp="$(mktemp)"; sed "s|^${key}=.*|${key}=${val}|" .env > "$tmp" && mv "$tmp" .env
  else
    printf '%s=%s\n' "$key" "$val" >> .env
  fi
}
set_env COMPOSE_PROFILES app
set_env IDENTITY_REGISTRY_ADDRESS "$ID"
set_env PRESCRIPTION_REGISTRY_ADDRESS "$PR"
set_env KEY_ACCESS_REGISTRY_ADDRESS "$KA"
set_env NEXT_PUBLIC_CHAIN_ID 1337
set_env NEXT_PUBLIC_IDENTITY_REGISTRY_ADDRESS "$ID"
set_env NEXT_PUBLIC_PRESCRIPTION_REGISTRY_ADDRESS "$PR"
set_env NEXT_PUBLIC_KEY_ACCESS_REGISTRY_ADDRESS "$KA"

echo
echo ".env updated (COMPOSE_PROFILES=app + the registry addresses)."
echo "Start the app tier:"
echo "  docker compose up --build -d"
echo
echo "Then open the web app:  http://<host>:\${WEB_PORT:-13300}"
echo "(For browser on-chain features, also set NEXT_PUBLIC_RPC_URL in .env to a"
echo " browser-reachable RPC and rebuild.)"
