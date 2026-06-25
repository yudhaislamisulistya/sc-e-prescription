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

Idempotent. Creates the gitignored files docker-compose mounts but cannot ship:
`secrets/*.txt`, `.env` (from `.env.example`), and the Besu validator keys +
generated genesis (via `infra/besu/generate-keys.sh`).

## 2. Start the infrastructure

```bash
docker compose up -d
```

Starts `besu-validator`, `besu-rpc`, `postgres`, `redis`, `ipfs`. The app tier is
behind the `app` profile and stays down until step 3 enables it.

Sanity-check the chain (the block number should grow every ~2s):

```bash
curl -s -X POST http://127.0.0.1:13302 -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}'
```

## 3. Deploy the contracts and fill .env

```bash
bash deploy-contracts.sh
```

Deploys the three registries to Besu and writes their addresses into `.env`
together with `COMPOSE_PROFILES=app` and the `NEXT_PUBLIC_*` mirror. The admin
defaults to the deployer's own address (override with `ADMIN_ADDRESS=0x...`). It
is a free-gas chain, so the deployer needs no funded balance.

## 4. Build + start the app tier

```bash
docker compose up --build -d
```

(`COMPOSE_PROFILES=app` is now in `.env`, so this includes `indexer`,
`kms-signer`, `nextjs-app`.)

## 5. Use it

- Web app: `http://<host>:13300` (override with `WEB_PORT`)
- IPFS gateway: `http://<host>:13301`

Server-side API features work over the internal Docker network. Browser-side
wallet/on-chain features additionally need `NEXT_PUBLIC_RPC_URL` (in `.env`) to be
browser-reachable, e.g. a TLS reverse proxy in front of besu-rpc; then rebuild
with `docker compose up --build -d`. The kms-signer and Postgres stay
internal-only.

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
  directly) before issuing prescriptions. The deployer/admin EOA private key is
  in `infra/besu/deployer-private-key.txt` (import it into a wallet to act as
  admin).
- For grants to work, the `kms_service_key` EOA must hold
  `PATIENT_CUSTODIAN_ROLE` and be set as the patient's custodian.
- Re-running any step is safe. To wipe and start clean:
  `docker compose down -v && rm -rf infra/besu/networkFiles && bash bootstrap.sh`.
