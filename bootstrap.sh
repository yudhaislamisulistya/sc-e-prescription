#!/usr/bin/env bash
#
# bootstrap.sh - one-time host setup before `docker compose up`. Idempotent:
# re-running never overwrites existing secrets/keys.
#
# Creates the gitignored files that docker-compose mounts but cannot ship:
#   - secrets/*.txt            (Postgres password, KMS keys, cluster secret)
#   - .env                     (from .env.example, if missing)
#   - Besu validator keys + the generated genesis (via generate-keys.sh)
#
# After this, run:  docker compose up -d   (see DEPLOY.md for the full flow).
set -euo pipefail
cd "$(dirname "$0")"

echo "==> 1/3  secrets"
mkdir -p secrets
mk() {
  if [ -f "secrets/$1" ]; then
    echo "    exists   secrets/$1"
  else
    openssl rand -hex "$2" > "secrets/$1"
    chmod 600 "secrets/$1"
    echo "    created  secrets/$1"
  fi
}
mk pg_password.txt 24       # Postgres password
mk kms_service_key.txt 32   # PATIENT_CUSTODIAN EOA private key (kms-signer)
mk kms_internal_token.txt 32 # app -> kms-signer bearer token
mk ipfs_cluster_secret.txt 32 # only used with --profile cluster

echo "==> 2/3  .env"
if [ -f .env ]; then
  echo "    exists   .env (unchanged)"
else
  cp .env.example .env
  echo "    created  .env (edit it after deploying the contracts)"
fi

echo "==> 3/3  Besu keys + genesis"
bash infra/besu/generate-keys.sh

echo
echo "Setup complete. Next:"
echo "  docker compose up -d            # phase 1: infra (besu, postgres, redis, ipfs)"
echo "  # deploy contracts (see DEPLOY.md), then in .env set the *_REGISTRY_ADDRESS"
echo "  # values and COMPOSE_PROFILES=app"
echo "  docker compose up --build -d    # phase 2: app tier (indexer, kms-signer, web)"
