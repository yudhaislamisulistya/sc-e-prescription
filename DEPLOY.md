# Deploy runbook

The app services need the deployed contract addresses, but the contracts are
deployed to the Besu node that lives in this same stack. So the boot is two
phases: **infra first, deploy contracts, then the app tier**.

Prerequisites: Docker + Docker Compose; Node 20 + npm on the host for the
contract deploy step.

## 1. Generate Besu keys and fill the genesis

```bash
bash infra/besu/generate-keys.sh
```

This writes the validator key, a deployer key (`infra/besu/deployer-private-key.txt`),
`static-nodes.json`, and substitutes the genesis placeholders (extraData + the
deployer's funded alloc). All of it is gitignored.

## 2. Create the file secrets

```bash
openssl rand -hex 24  > secrets/pg_password.txt
openssl rand -hex 32  > secrets/kms_service_key.txt        # PATIENT_CUSTODIAN EOA key
openssl rand -hex 32  > secrets/kms_internal_token.txt     # app -> kms bearer token
# only if you enable the cluster profile:
# openssl rand -hex 32 > secrets/ipfs_cluster_secret.txt
```

## 3. Prepare .env

```bash
cp .env.example .env
```

Leave `COMPOSE_PROFILES` empty for now. Override the `*_PORT` values only if the
default `133xx` ports clash on this host.

## 4. Start the infrastructure (no app tier yet)

```bash
docker compose up -d
```

Starts `besu-validator`, `besu-rpc`, `postgres`, `redis`, `ipfs`. The app tier
(indexer, kms-signer, nextjs-app) is behind the `app` profile and stays down.

Check the chain is up: `curl -s -X POST http://127.0.0.1:13302 -H 'content-type: application/json' -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}'`

## 5. Deploy the contracts to Besu

```bash
npm install
echo '{ "EPrescriptionSystem": { "adminAddress": "0xYOUR_ADMIN_EOA" } }' > ignition/params.json

BESU_RPC_URL=http://127.0.0.1:13302 \
DEPLOYER_PRIVATE_KEY=$(cat infra/besu/deployer-private-key.txt) \
npx hardhat ignition deploy ignition/modules/Deploy.ts \
  --network besu --parameters ignition/params.json
```

The deployed addresses are printed and saved to
`ignition/deployments/chain-1337/deployed_addresses.json`.

## 6. Fill .env with the addresses and enable the app profile

```dotenv
COMPOSE_PROFILES=app

IDENTITY_REGISTRY_ADDRESS=0x...
PRESCRIPTION_REGISTRY_ADDRESS=0x...
KEY_ACCESS_REGISTRY_ADDRESS=0x...

# Client-side (same addresses). NEXT_PUBLIC_RPC_URL must be reachable by the
# BROWSER (e.g. a TLS reverse proxy in front of besu-rpc), not the loopback RPC.
NEXT_PUBLIC_RPC_URL=https://rpc.your-domain
NEXT_PUBLIC_IDENTITY_REGISTRY_ADDRESS=0x...
NEXT_PUBLIC_PRESCRIPTION_REGISTRY_ADDRESS=0x...
NEXT_PUBLIC_KEY_ACCESS_REGISTRY_ADDRESS=0x...

# Optional: skip scanning empty history (use the contract deploy block).
START_BLOCK=0
```

## 7. Build + start the app tier

With `COMPOSE_PROFILES=app` in `.env`:

```bash
docker compose up --build -d
```

(Equivalent without the .env switch: `docker compose --profile app up --build -d`.)

## 8. Use it

- Web app: `http://<host>:13300` (override with `WEB_PORT`)
- IPFS gateway: `http://<host>:13301`

Server-side API features work over the internal Docker network. Browser-side
wallet/on-chain features additionally need `NEXT_PUBLIC_RPC_URL` to be
browser-reachable. The kms-signer and Postgres stay internal-only.

## Notes

- Onboard actors/patients from the admin console (or directly via
  `IdentityRegistry.registerActor` / `registerPatient`) before issuing.
- For grants to work, the `kms_service_key` EOA must hold `PATIENT_CUSTODIAN_ROLE`
  and be set as the patient's custodian.
- Re-running `docker compose up -d` is safe; only changed services are recreated.
