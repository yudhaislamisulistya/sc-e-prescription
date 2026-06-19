# Execution Corrections — Controller Resolutions

> These are authoritative corrections to `2026-06-19-eprescription-redesign.md` based on real environment scouting. **Where this document conflicts with the plan, THIS document wins.** Every implementer reads this together with their task section.

## Environment facts (verified)

- Node `v22.22.3`, npm `10.9.8`, Hardhat `2.24.0` with `@nomicfoundation/hardhat-toolbox-viem` + `@nomiclabs/hardhat-ethers` (ethers v5.8.0).
- Hardhat Solidity compiler is **`0.8.28`** (existing `EPrescription.sol`/`Lock.sol` use `^0.8.28`).
- Next.js uses the **Pages Router** at `src/pages/` (there is `src/pages/api/`). There is **no** `app/` directory.
- Existing `lib/ipfs.ts` posts to a remote IPFS node `http://202.43.249.78:5001` via axios.
- Tests use `@nomicfoundation/hardhat-toolbox-viem` → `hre.viem.deployContract(...)`, `hre.viem.getWalletClients()`, `hre.viem.getPublicClient()`. `chai` + `@nomicfoundation/hardhat-chai-matchers`.
- `git` co-author trailer for ALL commits must be exactly:
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`
  (NOT "Claude Sonnet 4.6" as the plan's templates say.)

## C1 — Solidity version: keep `0.8.28`

Do **NOT** set the Hardhat `solidity` version to `0.8.24` (that breaks the existing `^0.8.28` contracts). Keep the compiler at `0.8.28`. New contracts may use `pragma solidity ^0.8.24;` (compatible with the 0.8.28 compiler) — this is fine.

## C2 — Contracts are PLAIN (non-upgradeable). Drop UUPS/Initializable.

The spec lists UUPS as *optional*. The plan's tests deploy via `deployContract("IdentityRegistry", [admin])` (constructor with args), which is **incompatible** with a UUPS contract whose constructor takes no args and whose state is set in `initialize()`. Resolve by making all three contracts plain, constructor-based contracts:

- Use `@openzeppelin/contracts` (the **non-upgradeable** package), e.g. `import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";`
- `IdentityRegistry` gets a real `constructor(address initialAdmin)` that grants roles directly.
- No `Initializable`, no `UUPSUpgradeable`, no `initialize()`, no `_authorizeUpgrade`.
- `PrescriptionRegistry` and `KeyAccessRegistry` are already constructor-based in the plan — keep them as is.

### Full corrected `contracts/IdentityRegistry.sol` (use THIS, not the plan's UUPS version)

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

contract IdentityRegistry is AccessControl {
    bytes32 public constant ADMIN_ROLE             = keccak256("ADMIN_ROLE");
    bytes32 public constant DOCTOR_ROLE            = keccak256("DOCTOR_ROLE");
    bytes32 public constant PHARMACIST_ROLE        = keccak256("PHARMACIST_ROLE");
    bytes32 public constant PATIENT_CUSTODIAN_ROLE = keccak256("PATIENT_CUSTODIAN_ROLE");

    enum ActorStatus { Active, Suspended, Revoked }

    struct Actor {
        bytes32     licenseHash;
        bytes32     institutionId;
        bytes       encryptionPubKey;
        ActorStatus status;
        bytes32     role;
    }

    struct Patient {
        bytes   encryptionPubKey;
        address custodian;
        bool    registered;
    }

    mapping(address => Actor)   private _actors;
    mapping(bytes32 => Patient) private _patients;

    event ActorRegistered(address indexed actor, bytes32 indexed role, bytes32 institutionId, bytes32 licenseHash);
    event ActorStatusChanged(address indexed actor, ActorStatus oldStatus, ActorStatus newStatus);
    event PatientRegistered(bytes32 indexed patientRef, address indexed custodian);

    constructor(address initialAdmin) {
        require(initialAdmin != address(0), "IR: zero admin");
        _grantRole(DEFAULT_ADMIN_ROLE, initialAdmin);
        _grantRole(ADMIN_ROLE, initialAdmin);
        _setRoleAdmin(DOCTOR_ROLE, ADMIN_ROLE);
        _setRoleAdmin(PHARMACIST_ROLE, ADMIN_ROLE);
        _setRoleAdmin(PATIENT_CUSTODIAN_ROLE, ADMIN_ROLE);
    }

    function registerActor(
        address actor,
        bytes32 role,
        bytes32 licenseHash,
        bytes32 institutionId,
        bytes calldata encryptionPubKey
    ) external onlyRole(ADMIN_ROLE) {
        require(
            role == DOCTOR_ROLE || role == PHARMACIST_ROLE || role == PATIENT_CUSTODIAN_ROLE,
            "IR: invalid role"
        );
        require(encryptionPubKey.length > 0, "IR: empty pubkey");
        _grantRole(role, actor);
        _actors[actor] = Actor({
            licenseHash:      licenseHash,
            institutionId:    institutionId,
            encryptionPubKey: encryptionPubKey,
            status:           ActorStatus.Active,
            role:             role
        });
        emit ActorRegistered(actor, role, institutionId, licenseHash);
    }

    function setActorStatus(address actor, ActorStatus status) external onlyRole(ADMIN_ROLE) {
        ActorStatus old = _actors[actor].status;
        _actors[actor].status = status;
        emit ActorStatusChanged(actor, old, status);
    }

    function registerPatient(
        bytes32 patientRef,
        bytes calldata encryptionPubKey,
        address custodian
    ) external onlyRole(ADMIN_ROLE) {
        require(encryptionPubKey.length > 0, "IR: empty pubkey");
        require(custodian != address(0), "IR: zero custodian");
        _patients[patientRef] = Patient({
            encryptionPubKey: encryptionPubKey,
            custodian:        custodian,
            registered:       true
        });
        emit PatientRegistered(patientRef, custodian);
    }

    function isAuthorized(bytes32 role, address account) external view returns (bool) {
        return hasRole(role, account) && _actors[account].status == ActorStatus.Active;
    }

    function getEncryptionPubKeyByAddress(address actor) external view returns (bytes memory) {
        return _actors[actor].encryptionPubKey;
    }

    function getEncryptionPubKeyByRef(bytes32 patientRef) external view returns (bytes memory) {
        return _patients[patientRef].encryptionPubKey;
    }

    function getPatientCustodian(bytes32 patientRef) external view returns (address) {
        return _patients[patientRef].custodian;
    }
}
```

> Note: `registerActor` now also accepts `PATIENT_CUSTODIAN_ROLE` (the KeyAccessRegistry test registers a custodian actor via `registerActor`). The plan's version only allowed DOCTOR/PHARMACIST — that would make the KeyAccessRegistry test fail.

## C3 — Dependencies to install (Task 2 corrected)

Install exactly:
```bash
npm install @openzeppelin/contracts eciesjs pg
npm install --save-dev hardhat-gas-reporter @types/pg
```
Do **NOT** install `@openzeppelin/contracts-upgradeable` or `@openzeppelin/hardhat-upgrades` (not needed — see C2). `@nomicfoundation/hardhat-chai-matchers` is already bundled by `hardhat-toolbox-viem`. `slither-analyzer` is a Python (pip) tool, not npm — handle in Task 15 only, and make it best-effort (don't fail the task if pip/slither is unavailable).

## C4 — API routes use the Pages Router (Tasks 13–14 corrected)

There is no `app/` directory. Put API routes under `src/pages/api/` using the Pages Router signature:

```typescript
import type { NextApiRequest, NextApiResponse } from "next";
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  // ...
  return res.status(200).json({ /* ... */ });
}
```

File mapping (replace the plan's `app/api/...` paths):
- `app/api/prescriptions/prepare/route.ts` → `src/pages/api/prescriptions/prepare.ts`
- `app/api/prescriptions/submit/route.ts`  → `src/pages/api/prescriptions/submit.ts`
- `app/api/key-access/grant/route.ts`      → `src/pages/api/key-access/grant.ts`
- `app/api/prescriptions/[id]/route.ts`    → `src/pages/api/prescriptions/[id].ts`

Use `import` for `@/lib/...` only if a `@` alias exists in `tsconfig.json`; otherwise use a relative import. Check `tsconfig.json` `paths` first.

## C5 — Hardhat config fix (do this in FOUNDATION, before contract tests)

The current `hardhat.config.ts` crashes on load because `.env` `PRIVATE_KEY` already includes a `0x` prefix and the config prepends another `0x`. The corrected config:
- keeps `solidity: "0.8.28"`,
- normalizes the sepolia account (`const norm = (k) => k ? (k.startsWith("0x") ? k : "0x"+k) : undefined`),
- keeps the existing `sepolia` network,
- adds a `besu` network (`url` from `BESU_RPC_URL`, `chainId: 1337`, `gasPrice: 0`, accounts from `DEPLOYER_PRIVATE_KEY`),
- enables `hardhat-gas-reporter` (gated on `REPORT_GAS === "true"`),
- imports `"hardhat-gas-reporter"` at top.

Keep `@nomiclabs/hardhat-ethers` import only if it still loads cleanly; if it errors, it may be dropped. Every account array must be normalized so a malformed env key never crashes config load.

## C6 — Test-code corrections

- **Task 4 test:** delete the stray line `const DOCTOR_ROLE = hre.ethers ? undefined : ...`. Read roles from the contract: `await registry.read.DOCTOR_ROLE()`. Use `@nomicfoundation/hardhat-chai-matchers` for `.to.be.rejected` (already available).
- **`encPubKey` fixtures** like `"0x04" + "aa".repeat(64)` are 65-byte uncompressed secp256k1 keys — keep them.
- Every contract test deploys `IdentityRegistry` via `deployContract("IdentityRegistry", [admin.account.address])` — valid now that the contract is constructor-based (C2).

## C7 — `derivePatientRef` fix (Task 8)

`keccak256(abi.encodePacked(salt, did))` where `did` is a UTF-8 string: the string must be hex-encoded first. Use viem:
```typescript
import { keccak256, encodePacked, stringToHex } from "viem";
export function derivePatientRef(salt: `0x${string}`, did: string): `0x${string}` {
  return keccak256(encodePacked(["bytes32", "bytes"], [salt, stringToHex(did)]));
}
```
(Solidity equivalent: `keccak256(abi.encodePacked(salt, bytes(did)))`.) Document this so the on-chain and off-chain derivations match.

## C8 — IPFS encrypted client (Task 9)

Make the IPFS endpoint env-driven:
- `IPFS_API_URL` (default `http://localhost:5001`) for `/api/v0/add` and `/api/v0/pin/rm`.
- `IPFS_GATEWAY_URL` (default `http://localhost:8080`) for `/ipfs/<cid>` fetches.
Do not hardcode the remote node. Keep the existing `lib/ipfs.ts` untouched (it's still used elsewhere); add the new encrypted client as a separate module.

## C9 — `markExpired` / `refill` / state machine

Keep the plan's logic. `markExpired` is permissionless and only valid when `block.timestamp > expiresAt` and the prescription is in a non-terminal, non-None state. `State.None = 0` is the sentinel for "does not exist".

## C10 — Foundation already done by controller

The controller performs (outside the per-task subagent loop), and these are DONE — do not redo:
1. Feature branch `feat/eprescription-redesign-impl` created; plan committed.
2. Dependency install (C3).
3. Hardhat config fix (C5).
4. PII containment (Task 1: delete `public/data/*.json`, add `.gitignore` rules) — verify, don't redo, if already committed.
