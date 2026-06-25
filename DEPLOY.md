# Deploy runbook

The app services need the deployed contract addresses, but the contracts are
deployed to the Besu node that lives in this same stack. So the boot is two
phases: **infra first, deploy contracts, then the app tier**.

Prerequisites: Docker + Docker Compose, `openssl`; Node 20 + npm on the host for
the contract-deploy step.

## 1. One-time setup

```bash
bash bootstrap.sh
```

Idempotent. It creates the gitignored files docker-compose mounts but cannot
ship: the `secrets/*.txt` (Postgres password, KMS keys), `.env` (from
`.env.example`), and the Besu validator keys + generated genesis (it runs
`infra/besu/generate-keys.sh`, which pulls the `hyperledger/besu` image to run
the operator tool).

## 2. Start the infrastructure (no app tier yet)

```bash
docker compose up -d
```

Starts `besu-validator`, `besu-rpc`, `postgres`, `redis`, `ipfs`. The app tier
(indexer, kms-signer, nextjs-app) is behind the `app` profile and stays down
until you enable it in step 4.

Sanity-check the chain:

```bash
curl -s -X POST http://127.0.0.1:13302 -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}'
```

## 3. Deploy the contracts to Besu

```bash
npm install
echo '{ "EPrescriptionSystem": { "adminAddress": "0xYOUR_ADMIN_EOA" } }' > ignition/params.json

BESU_RPC_URL=http://127.0.0.1:13302 \
DEPLOYER_PRIVATE_KEY=$(cat infra/besu/deployer-private-key.txt) \
npx hardhat ignition deploy ignition/modules/Deploy.ts \
  --network besu --parameters ignition/params.json
```

It is a free-gas chain, so the deployer needs no funded balance. The addresses
are printed and saved to `ignition/deployments/chain-1337/deployed_addresses.json`.

## 4. Put the addresses in .env and enable the app profile

Edit `.env`:

```dotenv
COMPOSE_PROFILES=app

IDENTITY_REGISTRY_ADDRESS=0x...
PRESCRIPTION_REGISTRY_ADDRESS=0x...
KEY_ACCESS_REGISTRY_ADDRESS=0x...

# Client-side (same addresses, inlined into the browser bundle at build time).
# NEXT_PUBLIC_RPC_URL must be reachable by the BROWSER (e.g. a TLS reverse proxy
# in front of besu-rpc), not the loopback RPC.
NEXT_PUBLIC_RPC_URL=https://rpc.your-domain
NEXT_PUBLIC_IDENTITY_REGISTRY_ADDRESS=0x...
NEXT_PUBLIC_PRESCRIPTION_REGISTRY_ADDRESS=0x...
NEXT_PUBLIC_KEY_ACCESS_REGISTRY_ADDRESS=0x...

# Optional: skip scanning empty history (use the contract deploy block).
START_BLOCK=0
```

## 5. Build + start the app tier

```bash
docker compose up --build -d
```

(`COMPOSE_PROFILES=app` in `.env` makes this include the app tier. Equivalent:
`docker compose --profile app up --build -d`.)

## 6. Use it

- Web app: `http://<host>:13300` (override with `WEB_PORT`)
- IPFS gateway: `http://<host>:13301`

Server-side API features work over the internal Docker network. Browser-side
wallet/on-chain features additionally need `NEXT_PUBLIC_RPC_URL` to be
browser-reachable. The kms-signer and Postgres stay internal-only.

## Host ports (133xx block, override in .env)

| Var | Default | Service |
|-----|---------|---------|
| `WEB_PORT` | 13300 | web app |
| `IPFS_GATEWAY_PORT` | 13301 | IPFS gateway |
| `BESU_RPC_PORT` | 13302 | besu JSON-RPC (loopback) |
| `IPFS_API_PORT` | 13303 | kubo admin API (loopback) |
| `BESU_P2P_PORT` | 13304 | besu devp2p |
| `IPFS_CLUSTER_PORT` | 13305 | ipfs-cluster (profile) |

## Notes

- Onboard actors/patients from the admin console (or `IdentityRegistry`
  directly) before issuing prescriptions.
- For grants to work, the `kms_service_key` EOA must hold
  `PATIENT_CUSTODIAN_ROLE` and be set as the patient's custodian.
- Re-running `docker compose up -d` is safe; only changed services are recreated.
- To wipe and start clean: `docker compose down -v` then `bash bootstrap.sh`.
