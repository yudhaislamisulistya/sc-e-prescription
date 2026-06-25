#!/usr/bin/env bash
#
# deploy-contracts.sh
# Deploy the three registries to the running Besu node and write their addresses
# into .env (plus COMPOSE_PROFILES=app and the NEXT_PUBLIC_* mirror) so the app
# tier can start. Run AFTER `docker compose up -d` (infra) is healthy.
#
# How it stays reliable (no more peer-dependency whack-a-mole):
#   * All deploy tooling lives in ./deploy with its OWN committed package-lock.json
#     (a tiny, fixed dependency tree: hardhat + ignition + openzeppelin + viem).
#   * We install with `npm ci`, which reproduces that lockfile EXACTLY and never
#     re-resolves peers - so what passed locally is what runs here.
#   * The heavy app dependencies (Next.js, web3.storage, ...) are never touched.
#
# Optional overrides:
#   ADMIN_ADDRESS=0x...   admin EOA for the registry (default: the deployer's own)
#   BESU_RPC_URL=...      RPC endpoint (default: http://127.0.0.1:13302)
set -euo pipefail
cd "$(dirname "$0")"
ROOT="$PWD"

# If Node/npm is not on this host, re-run the WHOLE deploy inside a node:20
# container. The repo is bind-mounted (so .env / deployed_addresses.json land on
# the host) and --network host lets it reach besu-rpc on 127.0.0.1. Keeps the
# host Docker-only - no need to install Node.
if ! command -v npm >/dev/null 2>&1; then
  echo "==> npm not found on host - running the deploy inside a node:20 container ..."
  exec docker run --rm -v "$ROOT:/app" -w /app --network host \
    -e ADMIN_ADDRESS="${ADMIN_ADDRESS:-}" \
    -e BESU_RPC_URL="${BESU_RPC_URL:-http://127.0.0.1:13302}" \
    node:20 bash deploy-contracts.sh
fi

RPC="${BESU_RPC_URL:-http://127.0.0.1:13302}"
DEPLOYER_FILE="infra/besu/deployer-private-key.txt"

[ -f "$DEPLOYER_FILE" ] || { echo "ERROR: $DEPLOYER_FILE missing - run ./bootstrap.sh first." >&2; exit 1; }
DEPLOYER_PK="$(tr -d '[:space:]' < "$DEPLOYER_FILE")"

# ---------------------------------------------------------------------------
# 1) Install the isolated deploy toolchain (deterministic, from the lockfile).
# ---------------------------------------------------------------------------
cd "$ROOT/deploy"
if [ ! -x node_modules/.bin/hardhat ]; then
  echo "==> npm ci (deploy toolchain, from committed lockfile)"
  npm ci
fi

# ---------------------------------------------------------------------------
# 2) Sync the Solidity into ./deploy/contracts (single source of truth lives at
#    the repo root; Hardhat v2 refuses sources outside its project root).
# ---------------------------------------------------------------------------
echo "==> syncing contracts/ -> deploy/contracts/"
rm -rf contracts
cp -R "$ROOT/contracts" ./contracts

# ---------------------------------------------------------------------------
# 3) Admin EOA for the registry (defaults to the deployer address).
# ---------------------------------------------------------------------------
ADMIN="${ADMIN_ADDRESS:-}"
if [ -z "$ADMIN" ]; then
  ADMIN="$(node -e 'const {privateKeyToAccount}=require("viem/accounts");process.stdout.write(privateKeyToAccount(process.argv[1]).address)' "$DEPLOYER_PK")"
fi
echo "==> admin = $ADMIN"
echo "==> rpc   = $RPC"

mkdir -p ignition
printf '{ "EPrescriptionSystem": { "adminAddress": "%s" } }\n' "$ADMIN" > ignition/params.json

# ---------------------------------------------------------------------------
# 4) Deploy via Ignition.
# ---------------------------------------------------------------------------
echo "==> Deploying contracts ..."
echo y | BESU_RPC_URL="$RPC" DEPLOYER_PRIVATE_KEY="$DEPLOYER_PK" \
  npx hardhat --config hardhat.config.cjs ignition deploy ignition/modules/Deploy.cjs \
    --network besu --parameters ignition/params.json

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

# ---------------------------------------------------------------------------
# 5) Write the values into the repo-root .env (create from example if missing).
# ---------------------------------------------------------------------------
cd "$ROOT"
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
