# E-Prescription Smart Contract Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign sistem e-prescription berbasis smart contract dari sistem naif (EPrescription.sol monolitik + PII plaintext) ke arsitektur modular dengan RBAC on-chain, envelope encryption, lifecycle anti-double-dispensing, dan Hyperledger Besu IBFT 2.0.

**Architecture:** Tiga smart contract modular (`IdentityRegistry`, `PrescriptionRegistry`, `KeyAccessRegistry`) di atas Hyperledger Besu IBFT 2.0; canonical prescription JSON dienkripsi AES-256-GCM lalu disimpan di IPFS; kunci per-resep dibungkus ECIES per-recipient di `KeyAccessRegistry`; event-indexer menyerap semua state transitions ke Postgres read-model; KMS signer microservice menangani operasi patient-centric.

**Tech Stack:** Solidity ^0.8.24, OpenZeppelin Contracts-Upgradeable (AccessControl, UUPS), Hardhat + viem, Hyperledger Besu IBFT 2.0, Next.js 15 App Router, PostgreSQL 16, Redis 7, IPFS Kubo, Docker Compose, Node.js crypto (AES-256-GCM + ECIES via `eciesjs`), TypeScript.

## Global Constraints

- Solidity `^0.8.24` — overflow/underflow auto-revert; tidak perlu SafeMath
- `enum State { None, ISSUED, PARTIALLY_DISPENSED, FULLY_DISPENSED, EXPIRED, REVOKED }` — `None=0` adalah sentinel wajib
- `recipient` di `KeyAccessRegistry` selalu `bytes32`: EOA = `bytes32(uint256(uint160(addr)))`, patient = `patientRef`
- `patientRef = keccak256(abi.encodePacked(salt, did))` — zero PII on-chain
- `issuedAt = block.timestamp` (bukan parameter); ditetapkan di dalam `issuePrescription`
- `payloadHash = keccak256(ciphertext_package_bytes)` — bukan keccak256 plaintext JSON
- `chainId = 1337` untuk devnet/testnet Besu
- `gasPrice = 0` di Besu (free gas consortium); `gasUsed` tetap diukur
- Event kanonik: `PrescriptionIssued`, `PrescriptionDispensed`, `PrescriptionRefilled`, `PrescriptionRevoked`, `PrescriptionExpired`, `AccessGranted`, `AccessRevoked`, `ActorRegistered`, `ActorStatusChanged`, `PatientRegistered`
- `PATIENT_CUSTODIAN_ROLE` adalah role ke-4 untuk KMS service EOA
- Tidak ada shared hot-wallet; `PRIVATE_KEY` env var dihapus di F4
- `public/data/pasien_wallets.json` dihapus di Task 1 (F0)
- Next.js App Router (`app/` directory), bukan Pages Router

---

## Fase F0 — Containment (Hentikan Kebocoran Data)

### Task 1: Hapus artefak PII plaintext dari publik

**Files:**
- Delete: `public/data/pasien_wallets.json`
- Delete: `public/data/recipe_transactions.json`
- Modify: `.gitignore`
- Create: `public/data/.gitkeep`

**Interfaces:**
- Produces: direktori `public/data/` kosong dengan `.gitkeep`

- [ ] **Step 1: Hapus file sensitif**

```bash
rm /Volumes/ML2/App/Next/sc-e-prescription/public/data/pasien_wallets.json
rm /Volumes/ML2/App/Next/sc-e-prescription/public/data/recipe_transactions.json
touch /Volumes/ML2/App/Next/sc-e-prescription/public/data/.gitkeep
```

- [ ] **Step 2: Tambah entri .gitignore**

Tambahkan ke `.gitignore`:
```
# Sensitive data — never commit
public/data/*.json
secrets/
.env.local
```

- [ ] **Step 3: Verifikasi tidak ada file sensitif**

```bash
find /Volumes/ML2/App/Next/sc-e-prescription/public -name "*.json" | wc -l
# Expected: 0
```

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "security(F0): remove plaintext PII and private key files from public directory

Eliminates V1: pasien_wallets.json exposed private keys + PII plaintext.
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Fase F1 — Identity & RBAC

### Task 2: Install dependencies baru

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install OpenZeppelin, crypto libs, dan dev tools**

```bash
cd /Volumes/ML2/App/Next/sc-e-prescription
npm install @openzeppelin/contracts-upgradeable @openzeppelin/hardhat-upgrades eciesjs
npm install --save-dev @nomicfoundation/hardhat-chai-matchers hardhat-gas-reporter slither-analyzer 2>/dev/null || true
```

- [ ] **Step 2: Verifikasi instalasi**

```bash
ls node_modules/@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol
# Expected: file exists
```

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add openzeppelin-upgradeable, eciesjs, hardhat-gas-reporter

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 3: Interface contracts

**Files:**
- Create: `contracts/interfaces/IIdentityRegistry.sol`
- Create: `contracts/interfaces/IPrescriptionRegistry.sol`

**Interfaces:**
- Produces: `IIdentityRegistry` (isAuthorized, getEncryptionPubKey), `IPrescriptionRegistry` (getPrescription)

- [ ] **Step 1: Buat IIdentityRegistry**

```solidity
// contracts/interfaces/IIdentityRegistry.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IIdentityRegistry {
    enum ActorStatus { Active, Suspended, Revoked }

    function isAuthorized(bytes32 role, address account) external view returns (bool);
    function getEncryptionPubKeyByAddress(address actor) external view returns (bytes memory);
    function getEncryptionPubKeyByRef(bytes32 patientRef) external view returns (bytes memory);
    function ADMIN_ROLE() external view returns (bytes32);
    function DOCTOR_ROLE() external view returns (bytes32);
    function PHARMACIST_ROLE() external view returns (bytes32);
    function PATIENT_CUSTODIAN_ROLE() external view returns (bytes32);
    function getPatientCustodian(bytes32 patientRef) external view returns (address);
}
```

- [ ] **Step 2: Buat IPrescriptionRegistry**

```solidity
// contracts/interfaces/IPrescriptionRegistry.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IPrescriptionRegistry {
    enum State { None, ISSUED, PARTIALLY_DISPENSED, FULLY_DISPENSED, EXPIRED, REVOKED }

    struct PrescriptionView {
        address doctor;
        bytes32 patientRef;
        string  cid;
        bytes32 payloadHash;
        uint64  issuedAt;
        uint64  expiresAt;
        uint32  totalUnits;
        uint32  dispensedUnits;
        uint8   refillsAllowed;
        uint8   refillsUsed;
        State   state;
    }

    function getPrescription(bytes32 prescriptionId) external view returns (PrescriptionView memory);
    function verify(bytes32 prescriptionId) external view returns (bool active);
}
```

- [ ] **Step 3: Compile untuk verifikasi**

```bash
cd /Volumes/ML2/App/Next/sc-e-prescription
npx hardhat compile
# Expected: Compiled 2 Solidity files successfully
```

- [ ] **Step 4: Commit**

```bash
git add contracts/interfaces/
git commit -m "feat(contracts): add IIdentityRegistry and IPrescriptionRegistry interfaces

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 4: IdentityRegistry smart contract

**Files:**
- Create: `contracts/IdentityRegistry.sol`
- Create: `test/IdentityRegistry.test.ts`

**Interfaces:**
- Consumes: `IIdentityRegistry` dari Task 3
- Produces: `IdentityRegistry` deployed contract dengan `registerActor`, `registerPatient`, `setActorStatus`, `isAuthorized`, `getEncryptionPubKeyByAddress`, `getEncryptionPubKeyByRef`

- [ ] **Step 1: Tulis test terlebih dahulu**

```typescript
// test/IdentityRegistry.test.ts
import { expect } from "chai";
import hre from "hardhat";

describe("IdentityRegistry", function () {
  async function deploy() {
    const [deployer, admin, doctor, pharmacist, custodian, stranger] =
      await hre.viem.getWalletClients();
    const publicClient = await hre.viem.getPublicClient();

    const registry = await hre.viem.deployContract("IdentityRegistry", [
      admin.account.address,
    ]);

    return { registry, deployer, admin, doctor, pharmacist, custodian, stranger, publicClient };
  }

  const DOCTOR_ROLE = hre.ethers
    ? undefined
    : "0x" + Buffer.from("DOCTOR_ROLE").toString("hex").padEnd(64, "0");

  it("admin can register a doctor", async () => {
    const { registry, admin, doctor } = await deploy();
    const licenseHash = `0x${"ab".repeat(32)}` as `0x${string}`;
    const institutionId = `0x${"cd".repeat(32)}` as `0x${string}`;
    const encPubKey = "0x04" + "aa".repeat(64);

    await registry.write.registerActor(
      [doctor.account.address, await registry.read.DOCTOR_ROLE(), licenseHash, institutionId, encPubKey as `0x${string}`],
      { account: admin.account }
    );

    const isAuth = await registry.read.isAuthorized([
      await registry.read.DOCTOR_ROLE(),
      doctor.account.address,
    ]);
    expect(isAuth).to.be.true;
  });

  it("non-admin cannot register an actor", async () => {
    const { registry, stranger, doctor } = await deploy();
    const licenseHash = `0x${"ab".repeat(32)}` as `0x${string}`;
    const institutionId = `0x${"cd".repeat(32)}` as `0x${string}`;
    const encPubKey = "0x04" + "aa".repeat(64);

    await expect(
      registry.write.registerActor(
        [doctor.account.address, await registry.read.DOCTOR_ROLE(), licenseHash, institutionId, encPubKey as `0x${string}`],
        { account: stranger.account }
      )
    ).to.be.rejected;
  });

  it("suspended actor is not authorized", async () => {
    const { registry, admin, doctor } = await deploy();
    const licenseHash = `0x${"ab".repeat(32)}` as `0x${string}`;
    const institutionId = `0x${"cd".repeat(32)}` as `0x${string}`;
    const encPubKey = "0x04" + "aa".repeat(64);

    await registry.write.registerActor(
      [doctor.account.address, await registry.read.DOCTOR_ROLE(), licenseHash, institutionId, encPubKey as `0x${string}`],
      { account: admin.account }
    );
    await registry.write.setActorStatus(
      [doctor.account.address, 1], // 1 = Suspended
      { account: admin.account }
    );

    const isAuth = await registry.read.isAuthorized([
      await registry.read.DOCTOR_ROLE(),
      doctor.account.address,
    ]);
    expect(isAuth).to.be.false;
  });

  it("can register patient with patientRef (zero PII)", async () => {
    const { registry, admin, custodian } = await deploy();
    const patientRef = `0x${"ff".repeat(32)}` as `0x${string}`;
    const encPubKey = "0x04" + "bb".repeat(64);

    await registry.write.registerPatient(
      [patientRef, encPubKey as `0x${string}`, custodian.account.address],
      { account: admin.account }
    );

    const storedPubKey = await registry.read.getEncryptionPubKeyByRef([patientRef]);
    expect(storedPubKey).to.equal(encPubKey);
  });
});
```

- [ ] **Step 2: Jalankan test — harus FAIL**

```bash
cd /Volumes/ML2/App/Next/sc-e-prescription
npx hardhat test test/IdentityRegistry.test.ts 2>&1 | head -20
# Expected: Error: Cannot find module or compilation failure
```

- [ ] **Step 3: Implementasi IdentityRegistry**

```solidity
// contracts/IdentityRegistry.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControlUpgradeable} from
    "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import {UUPSUpgradeable} from
    "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {Initializable} from
    "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

contract IdentityRegistry is Initializable, AccessControlUpgradeable, UUPSUpgradeable {
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

    mapping(address  => Actor)   private _actors;
    mapping(bytes32  => Patient) private _patients;

    event ActorRegistered(address indexed actor, bytes32 indexed role, bytes32 institutionId, bytes32 licenseHash);
    event ActorStatusChanged(address indexed actor, ActorStatus oldStatus, ActorStatus newStatus);
    event PatientRegistered(bytes32 indexed patientRef, address indexed custodian);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() { _disableInitializers(); }

    function initialize(address initialAdmin) public initializer {
        __AccessControl_init();
        __UUPSUpgradeable_init();
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
        require(role == DOCTOR_ROLE || role == PHARMACIST_ROLE, "IR: invalid role");
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

    function _authorizeUpgrade(address) internal override onlyRole(ADMIN_ROLE) {}
}
```

- [ ] **Step 4: Jalankan test — harus PASS**

```bash
npx hardhat test test/IdentityRegistry.test.ts
# Expected: 4 passing
```

- [ ] **Step 5: Commit**

```bash
git add contracts/IdentityRegistry.sol test/IdentityRegistry.test.ts
git commit -m "feat(contracts): implement IdentityRegistry with RBAC + UUPS (mitigates V1, V3)

4 tests passing. Roles: ADMIN, DOCTOR, PHARMACIST, PATIENT_CUSTODIAN.
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 5: PrescriptionRegistry smart contract

**Files:**
- Create: `contracts/PrescriptionRegistry.sol`
- Create: `test/PrescriptionRegistry.test.ts`

**Interfaces:**
- Consumes: `IIdentityRegistry` dari Task 3, `IdentityRegistry` dari Task 4
- Produces: `PrescriptionRegistry` dengan `issuePrescription`, `dispense`, `refill`, `revoke`, `markExpired`, `verify`, `getPrescription`

- [ ] **Step 1: Tulis test**

```typescript
// test/PrescriptionRegistry.test.ts
import { expect } from "chai";
import hre from "hardhat";

describe("PrescriptionRegistry", function () {
  async function deploy() {
    const [deployer, admin, doctor, pharmacist, stranger] =
      await hre.viem.getWalletClients();

    const identity = await hre.viem.deployContract("IdentityRegistry", [
      admin.account.address,
    ]);

    const DOCTOR_ROLE      = await identity.read.DOCTOR_ROLE();
    const PHARMACIST_ROLE  = await identity.read.PHARMACIST_ROLE();
    const licenseHash      = `0x${"ab".repeat(32)}` as `0x${string}`;
    const institutionId    = `0x${"cd".repeat(32)}` as `0x${string}`;
    const encPubKey        = ("0x04" + "aa".repeat(64)) as `0x${string}`;

    await identity.write.registerActor(
      [doctor.account.address, DOCTOR_ROLE, licenseHash, institutionId, encPubKey],
      { account: admin.account }
    );
    await identity.write.registerActor(
      [pharmacist.account.address, PHARMACIST_ROLE, licenseHash, institutionId, encPubKey],
      { account: admin.account }
    );

    const registry = await hre.viem.deployContract("PrescriptionRegistry", [
      identity.address,
    ]);

    const now = BigInt(Math.floor(Date.now() / 1000));
    const patientRef  = `0x${"ff".repeat(32)}` as `0x${string}`;
    const payloadHash = `0x${"aa".repeat(32)}` as `0x${string}`;
    const cid         = "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi";
    const prescId     = `0x${"11".repeat(32)}` as `0x${string}`;
    const expiresAt   = now + 86400n * 30n;
    const totalUnits  = 30;
    const refillsAllowed = 1;

    return {
      identity, registry, admin, doctor, pharmacist, stranger,
      patientRef, payloadHash, cid, prescId, expiresAt, totalUnits, refillsAllowed, now
    };
  }

  it("doctor can issue prescription", async () => {
    const { registry, doctor, patientRef, payloadHash, cid, prescId, expiresAt, totalUnits, refillsAllowed } = await deploy();

    await registry.write.issuePrescription(
      [prescId, patientRef, cid, payloadHash, expiresAt, totalUnits, refillsAllowed],
      { account: doctor.account }
    );

    const presc = await registry.read.getPrescription([prescId]);
    expect(presc.state).to.equal(1); // ISSUED
    expect(presc.dispensedUnits).to.equal(0);
    expect(presc.doctor.toLowerCase()).to.equal(doctor.account.address.toLowerCase());
  });

  it("non-doctor cannot issue prescription", async () => {
    const { registry, stranger, patientRef, payloadHash, cid, prescId, expiresAt, totalUnits, refillsAllowed } = await deploy();

    await expect(
      registry.write.issuePrescription(
        [prescId, patientRef, cid, payloadHash, expiresAt, totalUnits, refillsAllowed],
        { account: stranger.account }
      )
    ).to.be.rejected;
  });

  it("pharmacist can dispense partial units", async () => {
    const { registry, doctor, pharmacist, patientRef, payloadHash, cid, prescId, expiresAt, totalUnits, refillsAllowed } = await deploy();

    await registry.write.issuePrescription(
      [prescId, patientRef, cid, payloadHash, expiresAt, totalUnits, refillsAllowed],
      { account: doctor.account }
    );
    await registry.write.dispense([prescId, 10], { account: pharmacist.account });

    const presc = await registry.read.getPrescription([prescId]);
    expect(presc.state).to.equal(2); // PARTIALLY_DISPENSED
    expect(presc.dispensedUnits).to.equal(10);
  });

  it("dispense exceeding remaining is rejected (anti-double-dispensing)", async () => {
    const { registry, doctor, pharmacist, patientRef, payloadHash, cid, prescId, expiresAt, totalUnits, refillsAllowed } = await deploy();

    await registry.write.issuePrescription(
      [prescId, patientRef, cid, payloadHash, expiresAt, totalUnits, refillsAllowed],
      { account: doctor.account }
    );
    await expect(
      registry.write.dispense([prescId, totalUnits + 1], { account: pharmacist.account })
    ).to.be.rejected;
  });

  it("dispense all units → FULLY_DISPENSED", async () => {
    const { registry, doctor, pharmacist, patientRef, payloadHash, cid, prescId, expiresAt, totalUnits, refillsAllowed } = await deploy();

    await registry.write.issuePrescription(
      [prescId, patientRef, cid, payloadHash, expiresAt, totalUnits, refillsAllowed],
      { account: doctor.account }
    );
    await registry.write.dispense([prescId, totalUnits], { account: pharmacist.account });

    const presc = await registry.read.getPrescription([prescId]);
    expect(presc.state).to.equal(3); // FULLY_DISPENSED
  });

  it("issuing doctor can revoke", async () => {
    const { registry, doctor, patientRef, payloadHash, cid, prescId, expiresAt, totalUnits, refillsAllowed } = await deploy();

    await registry.write.issuePrescription(
      [prescId, patientRef, cid, payloadHash, expiresAt, totalUnits, refillsAllowed],
      { account: doctor.account }
    );
    await registry.write.revoke([prescId], { account: doctor.account });

    const presc = await registry.read.getPrescription([prescId]);
    expect(presc.state).to.equal(5); // REVOKED
  });

  it("verify returns false for revoked prescription", async () => {
    const { registry, doctor, patientRef, payloadHash, cid, prescId, expiresAt, totalUnits, refillsAllowed } = await deploy();

    await registry.write.issuePrescription(
      [prescId, patientRef, cid, payloadHash, expiresAt, totalUnits, refillsAllowed],
      { account: doctor.account }
    );
    await registry.write.revoke([prescId], { account: doctor.account });

    const isValid = await registry.read.verify([prescId]);
    expect(isValid).to.be.false;
  });
});
```

- [ ] **Step 2: Jalankan test — FAIL**

```bash
npx hardhat test test/PrescriptionRegistry.test.ts 2>&1 | head -10
# Expected: compilation failure (contract doesn't exist yet)
```

- [ ] **Step 3: Implementasi PrescriptionRegistry**

```solidity
// contracts/PrescriptionRegistry.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./interfaces/IIdentityRegistry.sol";
import "./interfaces/IPrescriptionRegistry.sol";

contract PrescriptionRegistry is IPrescriptionRegistry {
    IIdentityRegistry public immutable identityRegistry;

    struct Prescription {
        // slot 0
        address doctor;           // 20 bytes
        uint64  issuedAt;         //  8 bytes
        uint8   refillsAllowed;   //  1 byte
        uint8   refillsUsed;      //  1 byte
        State   state;            //  1 byte
        // slot 1
        bytes32 patientRef;
        // slot 2
        bytes32 payloadHash;
        // slot 3
        uint64  expiresAt;        //  8 bytes
        uint32  totalUnits;       //  4 bytes
        uint32  dispensedUnits;   //  4 bytes
        // slot 4+
        string  cid;
    }

    mapping(bytes32 => Prescription) private _prescriptions;

    event PrescriptionIssued(
        bytes32 indexed prescriptionId, address indexed doctor,
        bytes32 indexed patientRef, string cid, bytes32 payloadHash,
        uint64 issuedAt, uint64 expiresAt, uint32 totalUnits
    );
    event PrescriptionDispensed(
        bytes32 indexed prescriptionId, address indexed pharmacist,
        uint32 units, uint32 dispensedUnits, State newState
    );
    event PrescriptionRefilled(bytes32 indexed prescriptionId, uint8 refillsUsed);
    event PrescriptionRevoked(bytes32 indexed prescriptionId, address indexed by);
    event PrescriptionExpired(bytes32 indexed prescriptionId);

    error NotAuthorized();
    error InvalidState();
    error ExceedsRemaining();
    error PrescriptionAlreadyExists();
    error InvalidParameters();

    modifier onlyActiveRole(bytes32 role) {
        if (!identityRegistry.isAuthorized(role, msg.sender)) revert NotAuthorized();
        _;
    }

    constructor(address _identityRegistry) {
        identityRegistry = IIdentityRegistry(_identityRegistry);
    }

    function issuePrescription(
        bytes32 prescriptionId,
        bytes32 patientRef,
        string  calldata cid,
        bytes32 payloadHash,
        uint64  expiresAt,
        uint32  totalUnits,
        uint8   refillsAllowed
    ) external onlyActiveRole(identityRegistry.DOCTOR_ROLE()) {
        if (_prescriptions[prescriptionId].state != State.None) revert PrescriptionAlreadyExists();
        if (expiresAt <= block.timestamp) revert InvalidParameters();
        if (totalUnits == 0) revert InvalidParameters();
        if (payloadHash == bytes32(0)) revert InvalidParameters();
        if (bytes(cid).length == 0) revert InvalidParameters();

        _prescriptions[prescriptionId] = Prescription({
            doctor:         msg.sender,
            issuedAt:       uint64(block.timestamp),
            refillsAllowed: refillsAllowed,
            refillsUsed:    0,
            state:          State.ISSUED,
            patientRef:     patientRef,
            payloadHash:    payloadHash,
            expiresAt:      expiresAt,
            totalUnits:     totalUnits,
            dispensedUnits: 0,
            cid:            cid
        });

        emit PrescriptionIssued(
            prescriptionId, msg.sender, patientRef, cid, payloadHash,
            uint64(block.timestamp), expiresAt, totalUnits
        );
    }

    function dispense(bytes32 prescriptionId, uint32 units)
        external
        onlyActiveRole(identityRegistry.PHARMACIST_ROLE())
    {
        Prescription storage p = _prescriptions[prescriptionId];
        if (p.state != State.ISSUED && p.state != State.PARTIALLY_DISPENSED) revert InvalidState();
        if (block.timestamp > p.expiresAt) revert InvalidState();
        uint32 remaining = p.totalUnits - p.dispensedUnits;
        if (units == 0 || units > remaining) revert ExceedsRemaining();

        p.dispensedUnits += units;
        p.state = (p.dispensedUnits == p.totalUnits) ? State.FULLY_DISPENSED : State.PARTIALLY_DISPENSED;

        emit PrescriptionDispensed(prescriptionId, msg.sender, units, p.dispensedUnits, p.state);
    }

    function refill(bytes32 prescriptionId)
        external
        onlyActiveRole(identityRegistry.PHARMACIST_ROLE())
    {
        Prescription storage p = _prescriptions[prescriptionId];
        if (p.state != State.FULLY_DISPENSED) revert InvalidState();
        if (p.refillsUsed >= p.refillsAllowed) revert InvalidState();
        if (block.timestamp > p.expiresAt) revert InvalidState();

        p.refillsUsed += 1;
        p.dispensedUnits = 0;
        p.state = State.ISSUED;

        emit PrescriptionRefilled(prescriptionId, p.refillsUsed);
    }

    function revoke(bytes32 prescriptionId) external {
        Prescription storage p = _prescriptions[prescriptionId];
        if (p.state != State.ISSUED && p.state != State.PARTIALLY_DISPENSED) revert InvalidState();
        bool isIssuingDoctor = msg.sender == p.doctor;
        bool isAdmin = identityRegistry.isAuthorized(identityRegistry.ADMIN_ROLE(), msg.sender);
        if (!isIssuingDoctor && !isAdmin) revert NotAuthorized();

        p.state = State.REVOKED;
        emit PrescriptionRevoked(prescriptionId, msg.sender);
    }

    function markExpired(bytes32 prescriptionId) external {
        Prescription storage p = _prescriptions[prescriptionId];
        if (block.timestamp <= p.expiresAt) revert InvalidState();
        if (p.state == State.REVOKED || p.state == State.EXPIRED || p.state == State.None) revert InvalidState();

        p.state = State.EXPIRED;
        emit PrescriptionExpired(prescriptionId);
    }

    function getPrescription(bytes32 prescriptionId) external view returns (PrescriptionView memory) {
        Prescription storage p = _prescriptions[prescriptionId];
        return PrescriptionView({
            doctor:         p.doctor,
            patientRef:     p.patientRef,
            cid:            p.cid,
            payloadHash:    p.payloadHash,
            issuedAt:       p.issuedAt,
            expiresAt:      p.expiresAt,
            totalUnits:     p.totalUnits,
            dispensedUnits: p.dispensedUnits,
            refillsAllowed: p.refillsAllowed,
            refillsUsed:    p.refillsUsed,
            state:          p.state
        });
    }

    function verify(bytes32 prescriptionId) external view returns (bool active) {
        Prescription storage p = _prescriptions[prescriptionId];
        return (p.state == State.ISSUED || p.state == State.PARTIALLY_DISPENSED)
            && block.timestamp <= p.expiresAt;
    }
}
```

- [ ] **Step 4: Jalankan test — PASS**

```bash
npx hardhat test test/PrescriptionRegistry.test.ts
# Expected: 7 passing
```

- [ ] **Step 5: Commit**

```bash
git add contracts/PrescriptionRegistry.sol test/PrescriptionRegistry.test.ts
git commit -m "feat(contracts): implement PrescriptionRegistry state machine + anti-double-dispensing (mitigates V4)

7 tests passing. State: None→ISSUED→PARTIALLY/FULLY_DISPENSED→EXPIRED/REVOKED.
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 6: KeyAccessRegistry smart contract

**Files:**
- Create: `contracts/KeyAccessRegistry.sol`
- Create: `test/KeyAccessRegistry.test.ts`

**Interfaces:**
- Consumes: `IIdentityRegistry`, `IPrescriptionRegistry`
- Produces: `KeyAccessRegistry` dengan `grantAccess`, `getWrappedKey`, `revokeAccess`

- [ ] **Step 1: Tulis test**

```typescript
// test/KeyAccessRegistry.test.ts
import { expect } from "chai";
import hre from "hardhat";

describe("KeyAccessRegistry", function () {
  async function deploy() {
    const [deployer, admin, doctor, pharmacist, custodian, stranger] =
      await hre.viem.getWalletClients();

    const identity = await hre.viem.deployContract("IdentityRegistry", [
      admin.account.address,
    ]);
    const DOCTOR_ROLE     = await identity.read.DOCTOR_ROLE();
    const PHARMACIST_ROLE = await identity.read.PHARMACIST_ROLE();
    const CUSTODIAN_ROLE  = await identity.read.PATIENT_CUSTODIAN_ROLE();
    const licenseHash     = `0x${"ab".repeat(32)}` as `0x${string}`;
    const institutionId   = `0x${"cd".repeat(32)}` as `0x${string}`;
    const encPubKey       = ("0x04" + "aa".repeat(64)) as `0x${string}`;

    await identity.write.registerActor([doctor.account.address, DOCTOR_ROLE, licenseHash, institutionId, encPubKey], { account: admin.account });
    await identity.write.registerActor([pharmacist.account.address, PHARMACIST_ROLE, licenseHash, institutionId, encPubKey], { account: admin.account });
    await identity.write.registerActor([custodian.account.address, CUSTODIAN_ROLE, licenseHash, institutionId, encPubKey], { account: admin.account });

    const patientRef = `0x${"ff".repeat(32)}` as `0x${string}`;
    await identity.write.registerPatient([patientRef, encPubKey, custodian.account.address], { account: admin.account });

    const prescRegistry = await hre.viem.deployContract("PrescriptionRegistry", [identity.address]);
    const karRegistry   = await hre.viem.deployContract("KeyAccessRegistry", [identity.address, prescRegistry.address]);

    const now        = BigInt(Math.floor(Date.now() / 1000));
    const prescId    = `0x${"11".repeat(32)}` as `0x${string}`;
    const payloadHash = `0x${"aa".repeat(32)}` as `0x${string}`;
    const cid        = "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi";
    const expiresAt  = now + 86400n * 30n;

    await prescRegistry.write.issuePrescription(
      [prescId, patientRef, cid, payloadHash, expiresAt, 30, 1],
      { account: doctor.account }
    );

    return { identity, prescRegistry, karRegistry, admin, doctor, pharmacist, custodian, stranger, patientRef, prescId };
  }

  it("issuing doctor can grantAccess to patient", async () => {
    const { karRegistry, doctor, patientRef, prescId } = await deploy();
    const wrappedKey = ("0x" + "ab".repeat(65)) as `0x${string}`;

    await karRegistry.write.grantAccess([prescId, patientRef, wrappedKey], { account: doctor.account });

    const stored = await karRegistry.read.getWrappedKey([prescId, patientRef]);
    expect(stored).to.equal(wrappedKey);
  });

  it("custodian can grantAccess to pharmacist (re-wrap)", async () => {
    const { karRegistry, doctor, custodian, pharmacist, patientRef, prescId } = await deploy();
    const pharmacistRef = `0x${BigInt(pharmacist.account.address).toString(16).padStart(64, "0")}` as `0x${string}`;
    const wrappedForPatient  = ("0x" + "bb".repeat(65)) as `0x${string}`;
    const wrappedForPharmacy = ("0x" + "cc".repeat(65)) as `0x${string}`;

    await karRegistry.write.grantAccess([prescId, patientRef, wrappedForPatient], { account: doctor.account });
    await karRegistry.write.grantAccess([prescId, pharmacistRef, wrappedForPharmacy], { account: custodian.account });

    const stored = await karRegistry.read.getWrappedKey([prescId, pharmacistRef]);
    expect(stored).to.equal(wrappedForPharmacy);
  });

  it("stranger cannot grantAccess", async () => {
    const { karRegistry, stranger, patientRef, prescId } = await deploy();
    const wrappedKey = ("0x" + "ab".repeat(65)) as `0x${string}`;

    await expect(
      karRegistry.write.grantAccess([prescId, patientRef, wrappedKey], { account: stranger.account })
    ).to.be.rejected;
  });

  it("revokeAccess clears the wrapped key", async () => {
    const { karRegistry, doctor, patientRef, prescId } = await deploy();
    const wrappedKey = ("0x" + "ab".repeat(65)) as `0x${string}`;

    await karRegistry.write.grantAccess([prescId, patientRef, wrappedKey], { account: doctor.account });
    await karRegistry.write.revokeAccess([prescId, patientRef], { account: doctor.account });

    const stored = await karRegistry.read.getWrappedKey([prescId, patientRef]);
    expect(stored).to.equal("0x");
  });
});
```

- [ ] **Step 2: Run test — FAIL**

```bash
npx hardhat test test/KeyAccessRegistry.test.ts 2>&1 | head -5
```

- [ ] **Step 3: Implementasi KeyAccessRegistry**

```solidity
// contracts/KeyAccessRegistry.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./interfaces/IIdentityRegistry.sol";
import "./interfaces/IPrescriptionRegistry.sol";

contract KeyAccessRegistry {
    IIdentityRegistry     public immutable identityRegistry;
    IPrescriptionRegistry public immutable prescriptionRegistry;

    // prescriptionId => recipient(bytes32) => wrappedKey
    mapping(bytes32 => mapping(bytes32 => bytes)) private _wrappedKeys;

    event AccessGranted(bytes32 indexed prescriptionId, bytes32 indexed recipient, address indexed grantedBy);
    event AccessRevoked(bytes32 indexed prescriptionId, bytes32 indexed recipient, address indexed revokedBy);

    error NotAuthorized();
    error InvalidRecipient();

    constructor(address _identityRegistry, address _prescriptionRegistry) {
        identityRegistry     = IIdentityRegistry(_identityRegistry);
        prescriptionRegistry = IPrescriptionRegistry(_prescriptionRegistry);
    }

    function grantAccess(
        bytes32 prescriptionId,
        bytes32 recipient,
        bytes calldata wrappedKey
    ) external {
        IPrescriptionRegistry.PrescriptionView memory p = prescriptionRegistry.getPrescription(prescriptionId);

        bool isIssuingDoctor = (msg.sender == p.doctor);

        address custodian = identityRegistry.getPatientCustodian(p.patientRef);
        bool isCustodian = identityRegistry.isAuthorized(identityRegistry.PATIENT_CUSTODIAN_ROLE(), msg.sender)
            && custodian == msg.sender;

        bool isAdmin = identityRegistry.isAuthorized(identityRegistry.ADMIN_ROLE(), msg.sender);

        if (!isIssuingDoctor && !isCustodian && !isAdmin) revert NotAuthorized();

        // recipient must be: patientRef, or an active pharmacist (encoded as bytes32)
        address recipientAddr = address(uint160(uint256(recipient)));
        bool recipientIsPatient  = (recipient == p.patientRef);
        bool recipientIsDoctor   = (recipient == bytes32(uint256(uint160(p.doctor))));
        bool recipientIsPharmacist = identityRegistry.isAuthorized(identityRegistry.PHARMACIST_ROLE(), recipientAddr);

        if (!recipientIsPatient && !recipientIsDoctor && !recipientIsPharmacist) revert InvalidRecipient();

        _wrappedKeys[prescriptionId][recipient] = wrappedKey;
        emit AccessGranted(prescriptionId, recipient, msg.sender);
    }

    function getWrappedKey(bytes32 prescriptionId, bytes32 recipient)
        external view returns (bytes memory)
    {
        return _wrappedKeys[prescriptionId][recipient];
    }

    function revokeAccess(bytes32 prescriptionId, bytes32 recipient) external {
        IPrescriptionRegistry.PrescriptionView memory p = prescriptionRegistry.getPrescription(prescriptionId);

        bool isIssuingDoctor = (msg.sender == p.doctor);
        address custodian = identityRegistry.getPatientCustodian(p.patientRef);
        bool isCustodian = identityRegistry.isAuthorized(identityRegistry.PATIENT_CUSTODIAN_ROLE(), msg.sender)
            && custodian == msg.sender;
        bool isAdmin = identityRegistry.isAuthorized(identityRegistry.ADMIN_ROLE(), msg.sender);

        if (!isIssuingDoctor && !isCustodian && !isAdmin) revert NotAuthorized();

        delete _wrappedKeys[prescriptionId][recipient];
        emit AccessRevoked(prescriptionId, recipient, msg.sender);
    }
}
```

- [ ] **Step 4: Run semua test — PASS**

```bash
npx hardhat test
# Expected: 15 passing (4 + 7 + 4)
```

- [ ] **Step 5: Commit**

```bash
git add contracts/KeyAccessRegistry.sol test/KeyAccessRegistry.test.ts
git commit -m "feat(contracts): implement KeyAccessRegistry for patient-centric key distribution (mitigates V5)

4 tests passing. recipient bertipe bytes32; custodian PATIENT_CUSTODIAN_ROLE.
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 7: Hardhat config update + Ignition deploy module

**Files:**
- Modify: `hardhat.config.ts`
- Create: `ignition/modules/Deploy.ts`

- [ ] **Step 1: Update hardhat.config.ts**

```typescript
// hardhat.config.ts
import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox-viem";
import "@openzeppelin/hardhat-upgrades";

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.24",
    settings: { optimizer: { enabled: true, runs: 200 } },
  },
  networks: {
    hardhat: {},
    besu: {
      url: process.env.BESU_RPC_URL || "http://localhost:8545",
      accounts: process.env.DEPLOYER_PRIVATE_KEY
        ? [process.env.DEPLOYER_PRIVATE_KEY]
        : [],
      chainId: 1337,
      gasPrice: 0,
    },
  },
  gasReporter: {
    enabled: process.env.REPORT_GAS === "true",
    currency: "USD",
    noColors: true,
    outputFile: "gas-report.txt",
  },
};

export default config;
```

- [ ] **Step 2: Buat Ignition deploy module**

```typescript
// ignition/modules/Deploy.ts
import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

export default buildModule("EPrescriptionSystem", (m) => {
  const adminAddress = m.getParameter("adminAddress");

  const identityRegistry = m.contract("IdentityRegistry", [adminAddress]);
  const prescriptionRegistry = m.contract("PrescriptionRegistry", [identityRegistry]);
  const keyAccessRegistry = m.contract("KeyAccessRegistry", [
    identityRegistry,
    prescriptionRegistry,
  ]);

  return { identityRegistry, prescriptionRegistry, keyAccessRegistry };
});
```

- [ ] **Step 3: Compile ulang semua**

```bash
npx hardhat compile
# Expected: Compiled successfully
```

- [ ] **Step 4: Commit**

```bash
git add hardhat.config.ts ignition/modules/Deploy.ts
git commit -m "chore: update hardhat config for Besu network + gas reporting; add deploy module

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Fase F3 — Privacy & Envelope Encryption

### Task 8: Crypto library — AES-256-GCM + ECIES

**Files:**
- Create: `lib/crypto/aes-gcm.ts`
- Create: `lib/crypto/ecies.ts`
- Create: `lib/crypto/patientRef.ts`
- Create: `lib/crypto/eip712.ts`
- Create: `lib/crypto/index.ts`

- [ ] **Step 1: Buat AES-256-GCM helper**

```typescript
// lib/crypto/aes-gcm.ts
import { randomBytes, createCipheriv, createDecipheriv } from "crypto";

export interface EncryptedPackage {
  alg: "AES-256-GCM";
  iv: string;        // base64, 12 bytes
  ciphertext: string; // base64
  authTag: string;   // base64, 16 bytes
}

export function generateCEK(): Buffer {
  return randomBytes(32);
}

export function encrypt(cek: Buffer, plaintext: Buffer): EncryptedPackage {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", cek, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return {
    alg: "AES-256-GCM",
    iv: iv.toString("base64"),
    ciphertext: ciphertext.toString("base64"),
    authTag: authTag.toString("base64"),
  };
}

export function decrypt(cek: Buffer, pkg: EncryptedPackage): Buffer {
  const iv         = Buffer.from(pkg.iv, "base64");
  const ciphertext = Buffer.from(pkg.ciphertext, "base64");
  const authTag    = Buffer.from(pkg.authTag, "base64");
  const decipher   = createDecipheriv("aes-256-gcm", cek, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

export function packageToBytes(pkg: EncryptedPackage): Buffer {
  return Buffer.from(JSON.stringify(pkg), "utf8");
}

export function packageFromBytes(bytes: Buffer): EncryptedPackage {
  return JSON.parse(bytes.toString("utf8"));
}
```

- [ ] **Step 2: Buat ECIES key-wrapping helper**

```typescript
// lib/crypto/ecies.ts
import { encrypt as eciesEncrypt, decrypt as eciesDecrypt } from "eciesjs";

export function wrapCEK(recipientPubKeyHex: string, cek: Buffer): Buffer {
  // recipientPubKeyHex: uncompressed secp256k1 pubkey (04 || x || y), hex
  const pubKey = Buffer.from(recipientPubKeyHex.replace(/^0x/, ""), "hex");
  return eciesEncrypt(pubKey, cek);
}

export function unwrapCEK(recipientPrivKeyHex: string, wrappedKey: Buffer): Buffer {
  const privKey = Buffer.from(recipientPrivKeyHex.replace(/^0x/, ""), "hex");
  return eciesDecrypt(privKey, wrappedKey);
}

export function addrToRecipientBytes32(address: string): `0x${string}` {
  const addr = address.toLowerCase().replace(/^0x/, "");
  return `0x${addr.padStart(64, "0")}`;
}
```

- [ ] **Step 3: Buat patientRef derivation**

```typescript
// lib/crypto/patientRef.ts
import { keccak256, toBytes, encodePacked } from "viem";
import { randomBytes } from "crypto";

export function generateSalt(): `0x${string}` {
  return `0x${randomBytes(32).toString("hex")}`;
}

export function derivePatientRef(salt: `0x${string}`, did: string): `0x${string}` {
  const didBytes = toBytes(did);
  const saltBytes = toBytes(salt);
  // keccak256(abi.encodePacked(salt, did))
  const packed = encodePacked(["bytes32", "bytes"], [salt, did as `0x${string}`]);
  return keccak256(packed);
}
```

- [ ] **Step 4: Buat EIP-712 signer helper**

```typescript
// lib/crypto/eip712.ts
import type { WalletClient } from "viem";

export const EIP712_DOMAIN = {
  name: "EPrescription",
  version: "1",
  chainId: 1337,
} as const;

export const PRESCRIPTION_TYPES = {
  Prescription: [
    { name: "prescriptionId", type: "bytes32" },
    { name: "doctor",         type: "address" },
    { name: "patientRef",     type: "bytes32" },
    { name: "payloadHash",    type: "bytes32" },
    { name: "issuedAt",       type: "uint64"  },
    { name: "expiresAt",      type: "uint64"  },
    { name: "totalUnits",     type: "uint32"  },
    { name: "refillsAllowed", type: "uint8"   },
  ],
} as const;

export interface PrescriptionTypedData {
  prescriptionId: `0x${string}`;
  doctor:         `0x${string}`;
  patientRef:     `0x${string}`;
  payloadHash:    `0x${string}`;
  issuedAt:       bigint;
  expiresAt:      bigint;
  totalUnits:     number;
  refillsAllowed: number;
}

export async function signPrescription(
  walletClient: WalletClient,
  verifyingContract: `0x${string}`,
  data: PrescriptionTypedData
): Promise<`0x${string}`> {
  return walletClient.signTypedData({
    account: walletClient.account!,
    domain: { ...EIP712_DOMAIN, verifyingContract },
    types: PRESCRIPTION_TYPES,
    primaryType: "Prescription",
    message: data,
  });
}
```

- [ ] **Step 5: Buat barrel export**

```typescript
// lib/crypto/index.ts
export * from "./aes-gcm";
export * from "./ecies";
export * from "./patientRef";
export * from "./eip712";
```

- [ ] **Step 6: Quick smoke test**

```typescript
// test/crypto.test.ts (minimal)
import { expect } from "chai";
import { generateCEK, encrypt, decrypt, packageToBytes, packageFromBytes } from "../lib/crypto/aes-gcm";

describe("AES-256-GCM", function () {
  it("encrypts and decrypts correctly", () => {
    const cek  = generateCEK();
    const data = Buffer.from("Hello, E-Prescription!", "utf8");
    const pkg  = encrypt(cek, data);
    const decrypted = decrypt(cek, pkg);
    expect(decrypted.toString("utf8")).to.equal("Hello, E-Prescription!");
  });

  it("tampered authTag causes decryption to throw", () => {
    const cek = generateCEK();
    const pkg = encrypt(cek, Buffer.from("secret"));
    pkg.authTag = Buffer.from("baadbaad".repeat(4), "hex").toString("base64");
    expect(() => decrypt(cek, pkg)).to.throw();
  });
});
```

```bash
npx hardhat test test/crypto.test.ts
# Expected: 2 passing
```

- [ ] **Step 7: Commit**

```bash
git add lib/crypto/ test/crypto.test.ts
git commit -m "feat(crypto): add AES-256-GCM + ECIES key-wrap + EIP-712 + patientRef helpers (mitigates V5)

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 9: Refactor lib/ipfs.ts dengan envelope encryption

**Files:**
- Modify: `lib/ipfs.ts`
- Create: `lib/ipfs-encrypted.ts`

- [ ] **Step 1: Baca file ipfs.ts saat ini**

Baca `/Volumes/ML2/App/Next/sc-e-prescription/lib/ipfs.ts` untuk memahami current implementation sebelum memodifikasi.

- [ ] **Step 2: Buat ipfs-encrypted.ts**

```typescript
// lib/ipfs-encrypted.ts
import { createHelia } from "helia";
import { unixfs } from "@helia/unixfs";
import { generateCEK, encrypt, decrypt, packageToBytes, packageFromBytes, EncryptedPackage } from "./crypto";
import { keccak256 } from "viem";

export interface UploadResult {
  cid: string;
  payloadHash: `0x${string}`;
  encryptedPackage: EncryptedPackage;
}

export async function encryptAndUpload(
  plaintext: Buffer,
  cek: Buffer
): Promise<UploadResult> {
  const pkg = encrypt(cek, plaintext);
  const pkgBytes = packageToBytes(pkg);
  const payloadHash = keccak256(pkgBytes) as `0x${string}`;

  // Upload ke IPFS via Kubo HTTP API (localhost:5001 untuk dev)
  const form = new FormData();
  form.append("file", new Blob([pkgBytes], { type: "application/octet-stream" }));

  const res = await fetch(
    `${process.env.IPFS_API_URL || "http://localhost:5001"}/api/v0/add?pin=true`,
    { method: "POST", body: form }
  );
  if (!res.ok) throw new Error(`IPFS upload failed: ${res.status}`);
  const { Hash: cid } = await res.json();

  return { cid, payloadHash, encryptedPackage: pkg };
}

export async function fetchAndDecrypt(
  cid: string,
  payloadHash: `0x${string}`,
  cek: Buffer
): Promise<Buffer> {
  const res = await fetch(
    `${process.env.IPFS_GATEWAY_URL || "http://localhost:8080"}/ipfs/${cid}`
  );
  if (!res.ok) throw new Error(`IPFS fetch failed: ${res.status}`);
  const pkgBytes = Buffer.from(await res.arrayBuffer());

  // Verifikasi integritas sebelum decrypt
  const actualHash = keccak256(pkgBytes);
  if (actualHash !== payloadHash) throw new Error("payloadHash mismatch — ciphertext tampered");

  const pkg = packageFromBytes(pkgBytes);
  return decrypt(cek, pkg);
}

export async function unpinCID(cid: string): Promise<void> {
  await fetch(
    `${process.env.IPFS_API_URL || "http://localhost:5001"}/api/v0/pin/rm?arg=${cid}`,
    { method: "POST" }
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add lib/ipfs-encrypted.ts
git commit -m "feat(ipfs): add encrypted upload/fetch with AES-256-GCM + payloadHash verification

Plaintext never touches IPFS. Mitigates V5.
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Fase F4 — Infrastructure (Besu IBFT 2.0)

### Task 10: Besu network configuration

**Files:**
- Create: `infra/besu/genesis.json`
- Create: `infra/besu/besu-validator.toml`
- Create: `infra/besu/besu-rpc.toml`
- Create: `infra/besu/generate-keys.sh`

- [ ] **Step 1: Buat genesis.json**

```json
// infra/besu/genesis.json
{
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
  "extraData": "REPLACE_WITH_IBFT_EXTRA_DATA",
  "alloc": {
    "REPLACE_WITH_DEPLOYER_ADDRESS": {
      "balance": "0x200000000000000000000000000000000000000000000000000000000000000"
    }
  }
}
```

- [ ] **Step 2: Buat besu-validator.toml**

```toml
# infra/besu/besu-validator.toml
data-path="/data/besu"
genesis-file="/cfg/genesis.json"
node-private-key-file="/cfg/key"
p2p-port=30303
rpc-http-enabled=false
min-gas-price=0
logging="INFO"
```

- [ ] **Step 3: Buat besu-rpc.toml**

```toml
# infra/besu/besu-rpc.toml
data-path="/data/besu-rpc"
genesis-file="/cfg/genesis.json"
p2p-port=30304
rpc-http-enabled=true
rpc-http-host="0.0.0.0"
rpc-http-port=8545
rpc-http-api=["ETH","NET","WEB3","IBFT"]
rpc-http-cors-origins=["*"]
min-gas-price=0
logging="INFO"
```

- [ ] **Step 4: Buat docker-compose.yml yang diupdate**

```yaml
# docker-compose.yml
version: "3.8"

services:
  besu-validator:
    image: hyperledger/besu:24.10
    command: ["--config-file=/cfg/besu-validator.toml"]
    volumes:
      - ./infra/besu/besu-validator.toml:/cfg/besu-validator.toml:ro
      - ./infra/besu/genesis.json:/cfg/genesis.json:ro
      - ./infra/besu/validator-key:/cfg/key:ro
      - besu-validator-data:/data
    ports:
      - "30303:30303"
    networks: [consortium-net]
    restart: unless-stopped

  besu-rpc:
    image: hyperledger/besu:24.10
    command: ["--config-file=/cfg/besu-rpc.toml"]
    volumes:
      - ./infra/besu/besu-rpc.toml:/cfg/besu-rpc.toml:ro
      - ./infra/besu/genesis.json:/cfg/genesis.json:ro
      - besu-rpc-data:/data
    ports:
      - "8545:8545"
    networks: [consortium-net, app-net]
    depends_on: [besu-validator]

  postgres:
    image: postgres:16
    environment:
      POSTGRES_DB: eprescription
      POSTGRES_USER: app
      POSTGRES_PASSWORD_FILE: /run/secrets/pg_password
    volumes:
      - pg-data:/var/lib/postgresql/data
      - ./services/indexer/schema.sql:/docker-entrypoint-initdb.d/01-schema.sql:ro
    networks: [app-net]
    secrets: [pg_password]

  redis:
    image: redis:7-alpine
    networks: [app-net]

  ipfs:
    image: ipfs/kubo:v0.26.0
    volumes:
      - ipfs-data:/data/ipfs
    ports:
      - "5001:5001"
      - "8080:8080"
    networks: [app-net]

  indexer:
    build:
      context: .
      dockerfile: services/indexer/Dockerfile
    environment:
      RPC_URL: http://besu-rpc:8545
      DATABASE_URL: postgres://app@postgres/eprescription
    depends_on: [besu-rpc, postgres]
    networks: [app-net]
    restart: unless-stopped

  kms-signer:
    build:
      context: .
      dockerfile: services/kms-signer/Dockerfile
    environment:
      RPC_URL: http://besu-rpc:8545
      DATABASE_URL: postgres://app@postgres/eprescription
    networks: [app-net]
    secrets: [kms_service_key]
    restart: unless-stopped

  nextjs-app:
    build: .
    environment:
      NEXT_PUBLIC_CHAIN_ID: "1337"
      RPC_URL: http://besu-rpc:8545
      DATABASE_URL: postgres://app@postgres/eprescription
      REDIS_URL: redis://redis:6379
      IPFS_API_URL: http://ipfs:5001
      IPFS_GATEWAY_URL: http://ipfs:8080
      KMS_SIGNER_URL: http://kms-signer:4000
    ports:
      - "3000:3000"
    depends_on: [besu-rpc, postgres, redis, indexer]
    networks: [app-net]

networks:
  consortium-net:
    driver: bridge
  app-net:
    driver: bridge

volumes:
  besu-validator-data: {}
  besu-rpc-data: {}
  pg-data: {}
  ipfs-data: {}

secrets:
  pg_password:
    file: ./secrets/pg_password.txt
  kms_service_key:
    file: ./secrets/kms_service_key.txt
```

- [ ] **Step 5: Buat secrets placeholder (jangan commit konten nyata)**

```bash
mkdir -p /Volumes/ML2/App/Next/sc-e-prescription/secrets
echo "devpassword123" > /Volumes/ML2/App/Next/sc-e-prescription/secrets/pg_password.txt
echo "0x$(openssl rand -hex 32)" > /Volumes/ML2/App/Next/sc-e-prescription/secrets/kms_service_key.txt
echo "secrets/*.txt" >> /Volumes/ML2/App/Next/sc-e-prescription/.gitignore
```

- [ ] **Step 6: Commit**

```bash
git add infra/ docker-compose.yml .gitignore
git commit -m "feat(infra): add Hyperledger Besu IBFT 2.0 config + Docker Compose stack

Includes validator, RPC node, postgres, redis, ipfs, indexer, kms-signer services.
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Fase F5 — Read-model & Event Indexer

### Task 11: Postgres schema + Event Indexer service

**Files:**
- Create: `services/indexer/schema.sql`
- Create: `services/indexer/index.ts`
- Create: `services/indexer/Dockerfile`

- [ ] **Step 1: Buat schema.sql**

```sql
-- services/indexer/schema.sql
CREATE TABLE IF NOT EXISTS prescription (
  prescription_id   BYTEA PRIMARY KEY,
  doctor_addr       BYTEA NOT NULL,
  patient_ref       BYTEA NOT NULL,
  cid               TEXT  NOT NULL,
  payload_hash      BYTEA NOT NULL,
  issued_at         BIGINT NOT NULL,
  expires_at        BIGINT NOT NULL,
  total_units       INTEGER NOT NULL,
  dispensed_units   INTEGER NOT NULL DEFAULT 0,
  refills_allowed   SMALLINT NOT NULL DEFAULT 0,
  refills_used      SMALLINT NOT NULL DEFAULT 0,
  state             SMALLINT NOT NULL DEFAULT 1,
  updated_block     BIGINT NOT NULL,
  updated_log_index INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_rx_patient ON prescription (patient_ref);
CREATE INDEX IF NOT EXISTS idx_rx_doctor  ON prescription (doctor_addr);
CREATE INDEX IF NOT EXISTS idx_rx_state   ON prescription (state);
CREATE INDEX IF NOT EXISTS idx_rx_expiry  ON prescription (expires_at);

CREATE TABLE IF NOT EXISTS prescription_event (
  block_number    BIGINT NOT NULL,
  log_index       INTEGER NOT NULL,
  block_hash      BYTEA NOT NULL,
  tx_hash         BYTEA NOT NULL,
  prescription_id BYTEA NOT NULL,
  event_type      TEXT NOT NULL,
  actor_addr      BYTEA,
  units_delta     INTEGER,
  new_state       SMALLINT,
  ts              BIGINT NOT NULL,
  payload         JSONB,
  PRIMARY KEY (block_number, log_index)
);
CREATE INDEX IF NOT EXISTS idx_evt_rx ON prescription_event (prescription_id);

CREATE TABLE IF NOT EXISTS actor (
  address           BYTEA PRIMARY KEY,
  role              TEXT NOT NULL,
  license_hash      BYTEA,
  institution_id    TEXT,
  encryption_pubkey BYTEA,
  status            TEXT NOT NULL DEFAULT 'Active'
);

CREATE TABLE IF NOT EXISTS patient (
  patient_ref       BYTEA PRIMARY KEY,
  encryption_pubkey BYTEA NOT NULL,
  custodian_addr    BYTEA NOT NULL
);

CREATE TABLE IF NOT EXISTS key_access (
  prescription_id BYTEA NOT NULL,
  recipient       BYTEA NOT NULL,
  wrapped_key     BYTEA NOT NULL,
  granted_by      BYTEA NOT NULL,
  revoked         BOOLEAN NOT NULL DEFAULT FALSE,
  PRIMARY KEY (prescription_id, recipient)
);

CREATE TABLE IF NOT EXISTS indexer_cursor (
  id              SMALLINT PRIMARY KEY DEFAULT 1,
  last_block      BIGINT NOT NULL DEFAULT 0,
  last_log_index  INTEGER NOT NULL DEFAULT -1,
  last_block_hash BYTEA NOT NULL DEFAULT '\x'
);

INSERT INTO indexer_cursor (id) VALUES (1) ON CONFLICT DO NOTHING;
```

- [ ] **Step 2: Buat event indexer service**

```typescript
// services/indexer/index.ts
import { createPublicClient, http, parseAbiItem, Log } from "viem";
import { Pool } from "pg";

const STATE_MAP: Record<number, string> = {
  0: "NONE", 1: "ISSUED", 2: "PARTIALLY_DISPENSED",
  3: "FULLY_DISPENSED", 4: "EXPIRED", 5: "REVOKED",
};

const PRESCRIPTION_ISSUED_ABI = parseAbiItem(
  "event PrescriptionIssued(bytes32 indexed prescriptionId, address indexed doctor, bytes32 indexed patientRef, string cid, bytes32 payloadHash, uint64 issuedAt, uint64 expiresAt, uint32 totalUnits)"
);
const PRESCRIPTION_DISPENSED_ABI = parseAbiItem(
  "event PrescriptionDispensed(bytes32 indexed prescriptionId, address indexed pharmacist, uint32 units, uint32 dispensedUnits, uint8 newState)"
);
const PRESCRIPTION_REVOKED_ABI = parseAbiItem(
  "event PrescriptionRevoked(bytes32 indexed prescriptionId, address indexed by)"
);
const PRESCRIPTION_EXPIRED_ABI = parseAbiItem(
  "event PrescriptionExpired(bytes32 indexed prescriptionId)"
);

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = createPublicClient({
    transport: http(process.env.RPC_URL || "http://localhost:8545"),
  });

  const prescriptionRegistryAddr = (process.env.PRESCRIPTION_REGISTRY_ADDRESS || "") as `0x${string}`;
  if (!prescriptionRegistryAddr) throw new Error("PRESCRIPTION_REGISTRY_ADDRESS not set");

  console.log("Event indexer starting...");

  while (true) {
    const { rows } = await pool.query("SELECT last_block FROM indexer_cursor WHERE id = 1");
    const fromBlock = BigInt(rows[0]?.last_block ?? 0);
    const latestBlock = await client.getBlockNumber();

    if (fromBlock >= latestBlock) {
      await sleep(2000);
      continue;
    }

    const toBlock = fromBlock + 99n < latestBlock ? fromBlock + 99n : latestBlock;

    // Fetch PrescriptionIssued events
    const issuedLogs = await client.getLogs({
      address: prescriptionRegistryAddr,
      event: PRESCRIPTION_ISSUED_ABI,
      fromBlock,
      toBlock,
    });

    for (const log of issuedLogs) {
      const { prescriptionId, doctor, patientRef, cid, payloadHash, issuedAt, expiresAt, totalUnits } = log.args as any;
      await pool.query(
        `INSERT INTO prescription (prescription_id, doctor_addr, patient_ref, cid, payload_hash, issued_at, expires_at, total_units, dispensed_units, refills_allowed, refills_used, state, updated_block, updated_log_index)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,0,0,0,1,$9,$10)
         ON CONFLICT (prescription_id) DO NOTHING`,
        [
          Buffer.from(prescriptionId.slice(2), "hex"),
          Buffer.from(doctor.slice(2), "hex"),
          Buffer.from(patientRef.slice(2), "hex"),
          cid, Buffer.from(payloadHash.slice(2), "hex"),
          issuedAt.toString(), expiresAt.toString(), totalUnits,
          log.blockNumber?.toString(), log.logIndex,
        ]
      );
      await pool.query(
        `INSERT INTO prescription_event (block_number, log_index, block_hash, tx_hash, prescription_id, event_type, actor_addr, ts, payload)
         VALUES ($1,$2,$3,$4,$5,'Issued',$6,$7,$8) ON CONFLICT DO NOTHING`,
        [
          log.blockNumber?.toString(), log.logIndex,
          Buffer.from((log.blockHash || "").slice(2), "hex"),
          Buffer.from(log.transactionHash!.slice(2), "hex"),
          Buffer.from(prescriptionId.slice(2), "hex"),
          Buffer.from(doctor.slice(2), "hex"),
          issuedAt.toString(),
          JSON.stringify({ cid, totalUnits }),
        ]
      );
    }

    // Fetch PrescriptionDispensed events
    const dispensedLogs = await client.getLogs({
      address: prescriptionRegistryAddr,
      event: PRESCRIPTION_DISPENSED_ABI,
      fromBlock,
      toBlock,
    });

    for (const log of dispensedLogs) {
      const { prescriptionId, pharmacist, units, dispensedUnits, newState } = log.args as any;
      await pool.query(
        `UPDATE prescription SET dispensed_units=$1, state=$2, updated_block=$3, updated_log_index=$4
         WHERE prescription_id=$5`,
        [dispensedUnits, newState, log.blockNumber?.toString(), log.logIndex,
         Buffer.from(prescriptionId.slice(2), "hex")]
      );
    }

    await pool.query(
      "UPDATE indexer_cursor SET last_block=$1 WHERE id=1",
      [toBlock.toString()]
    );
    console.log(`Indexed blocks ${fromBlock}–${toBlock}`);
  }
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

main().catch(console.error);
```

- [ ] **Step 3: Buat Dockerfile untuk indexer**

```dockerfile
# services/indexer/Dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY services/indexer/ ./services/indexer/
COPY lib/ ./lib/
CMD ["node", "--loader", "ts-node/esm", "services/indexer/index.ts"]
```

- [ ] **Step 4: Commit**

```bash
git add services/indexer/
git commit -m "feat(indexer): add Postgres schema + event indexer for read-model (mitigates V6)

Consumes PrescriptionIssued, PrescriptionDispensed events. Append-only audit trail.
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 12: KMS Signer Microservice

**Files:**
- Create: `services/kms-signer/index.ts`
- Create: `services/kms-signer/Dockerfile`

- [ ] **Step 1: Buat KMS signer service**

```typescript
// services/kms-signer/index.ts
import { createWalletClient, http, createPublicClient } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { unwrapCEK, wrapCEK, addrToRecipientBytes32 } from "../../lib/crypto";

const serviceKey = process.env.KMS_SERVICE_KEY as `0x${string}`;
if (!serviceKey) throw new Error("KMS_SERVICE_KEY not set");

const account = privateKeyToAccount(serviceKey);
const transport = http(process.env.RPC_URL || "http://localhost:8545");
const walletClient = createWalletClient({ account, transport });
const publicClient = createPublicClient({ transport });

// Minimal HTTP server (no framework dependency)
import { createServer } from "http";

const KEY_ACCESS_REGISTRY_ABI = [
  {
    name: "grantAccess",
    type: "function",
    inputs: [
      { name: "prescriptionId", type: "bytes32" },
      { name: "recipient", type: "bytes32" },
      { name: "wrappedKey", type: "bytes" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
] as const;

createServer(async (req, res) => {
  if (req.method !== "POST" || req.url !== "/grant-access") {
    res.writeHead(404); res.end(); return;
  }

  let body = "";
  req.on("data", chunk => { body += chunk; });
  req.on("end", async () => {
    try {
      const { prescriptionId, patientRef, patientWrappedKeyHex, pharmacyPubKeyHex, pharmacyAddr, karAddress } = JSON.parse(body);

      // Decrypt CEK with patient private key (in real HSM this is non-extractable)
      const patientPrivKey = await getPatientPrivKey(patientRef); // from HSM/vault
      const cek = unwrapCEK(patientPrivKey, Buffer.from(patientWrappedKeyHex.slice(2), "hex"));

      // Re-wrap CEK to pharmacy pubkey
      const wrappedForPharmacy = wrapCEK(pharmacyPubKeyHex, cek);
      const pharmacyRef = addrToRecipientBytes32(pharmacyAddr);

      // Submit grantAccess tx on-chain
      const hash = await walletClient.writeContract({
        address: karAddress,
        abi: KEY_ACCESS_REGISTRY_ABI,
        functionName: "grantAccess",
        args: [prescriptionId, pharmacyRef as `0x${string}`, `0x${wrappedForPharmacy.toString("hex")}`],
        chain: { id: 1337, name: "besu", rpcUrls: { default: { http: [process.env.RPC_URL!] } }, nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 } },
      });

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ txHash: hash }));
    } catch (e: any) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: e.message }));
    }
  });
}).listen(4000, () => console.log("KMS Signer running on :4000"));

async function getPatientPrivKey(patientRef: string): Promise<string> {
  // In production: call AWS KMS / HashiCorp Vault for non-extractable key operation
  // For dev: load from env (NEVER in production)
  const envKey = process.env[`PATIENT_KEY_${patientRef}`];
  if (!envKey) throw new Error(`No key for patient ${patientRef}`);
  return envKey;
}
```

- [ ] **Step 2: Buat Dockerfile**

```dockerfile
# services/kms-signer/Dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY services/kms-signer/ ./services/kms-signer/
COPY lib/ ./lib/
CMD ["node", "--loader", "ts-node/esm", "services/kms-signer/index.ts"]
```

- [ ] **Step 3: Commit**

```bash
git add services/kms-signer/
git commit -m "feat(kms-signer): add patient custodian microservice for CEK re-wrapping (mitigates V2)

PATIENT_CUSTODIAN_ROLE service EOA; no shared hot-wallet for patient ops.
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Fase App — Next.js API Routes

### Task 13: API Routes untuk Issue Prescription

**Files:**
- Create: `app/api/prescriptions/prepare/route.ts`
- Create: `app/api/prescriptions/submit/route.ts`

- [ ] **Step 1: Buat prepare endpoint**

```typescript
// app/api/prescriptions/prepare/route.ts
import { NextRequest, NextResponse } from "next/server";
import { keccak256, encodePacked, toHex } from "viem";
import { randomBytes } from "crypto";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { doctorAddress, patientRef, medications, expiresAt, totalUnits, refillsAllowed } = body;

  if (!doctorAddress || !patientRef || !medications || !expiresAt || !totalUnits) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const nonce = toHex(randomBytes(8));
  const issuedAt = BigInt(Math.floor(Date.now() / 1000));
  const prescriptionId = keccak256(
    encodePacked(
      ["address", "bytes32", "uint64", "bytes8"],
      [doctorAddress, patientRef, issuedAt, nonce]
    )
  );

  const canonicalPayload = {
    schemaVersion: "1.0.0",
    prescriptionId,
    issuedAt: Number(issuedAt),
    expiresAt,
    doctor: { address: doctorAddress },
    patient: { patientRef },
    medications,
    refillsAllowed: refillsAllowed ?? 0,
  };

  const eip712Data = {
    prescriptionId,
    doctor: doctorAddress,
    patientRef,
    payloadHash: "0x0000000000000000000000000000000000000000000000000000000000000000",
    issuedAt: Number(issuedAt),
    expiresAt,
    totalUnits,
    refillsAllowed: refillsAllowed ?? 0,
  };

  return NextResponse.json({
    prescriptionId,
    issuedAt: Number(issuedAt),
    canonicalPayload,
    eip712Data,
  });
}
```

- [ ] **Step 2: Buat submit endpoint**

```typescript
// app/api/prescriptions/submit/route.ts
import { NextRequest, NextResponse } from "next/server";
import { keccak256, createPublicClient, http } from "viem";
import { generateCEK, encrypt, packageToBytes } from "@/lib/crypto";
import { encryptAndUpload } from "@/lib/ipfs-encrypted";

const IDENTITY_REGISTRY_ABI = [
  {
    name: "getEncryptionPubKeyByRef",
    type: "function",
    inputs: [{ name: "patientRef", type: "bytes32" }],
    outputs: [{ name: "", type: "bytes" }],
    stateMutability: "view",
  },
] as const;

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { prescriptionId, patientRef, canonicalPayload, eip712Signature, totalUnits, expiresAt, refillsAllowed } = body;

  // Insert signature into canonical payload
  const payloadWithSig = { ...canonicalPayload, signature: { scheme: "EIP-712", value: eip712Signature } };
  const plaintextBuffer = Buffer.from(JSON.stringify(payloadWithSig), "utf8");

  // Generate CEK and encrypt
  const cek = generateCEK();
  const { cid, payloadHash } = await encryptAndUpload(plaintextBuffer, cek);

  // Fetch patient encryption pubkey from contract
  const publicClient = createPublicClient({
    transport: http(process.env.RPC_URL || "http://localhost:8545"),
  });
  const identityRegistryAddr = process.env.IDENTITY_REGISTRY_ADDRESS as `0x${string}`;
  const patientEncPubKey = await publicClient.readContract({
    address: identityRegistryAddr,
    abi: IDENTITY_REGISTRY_ABI,
    functionName: "getEncryptionPubKeyByRef",
    args: [patientRef as `0x${string}`],
  });

  // Wrap CEK for patient (doctor wrapping handled client-side for self-custody)
  const { wrapCEK } = await import("@/lib/crypto/ecies");
  const wrappedForPatient = wrapCEK(patientEncPubKey as string, cek);

  return NextResponse.json({
    cid,
    payloadHash,
    wrappedForPatient: `0x${wrappedForPatient.toString("hex")}`,
    // Client should now: 
    // 1. Call issuePrescription(prescriptionId, patientRef, cid, payloadHash, expiresAt, totalUnits, refillsAllowed)
    // 2. Call grantAccess(prescriptionId, patientRef, wrappedForPatient)
    // 3. Call grantAccess(prescriptionId, doctorRef, wrappedForDoctor) — doctor wraps for themselves client-side
  });
}
```

- [ ] **Step 3: Commit**

```bash
git add app/api/prescriptions/
git commit -m "feat(api): add prescription prepare/submit endpoints with envelope encryption

Issue flow: prepare EIP-712 → sign client-side → submit encrypts+uploads IPFS → returns CID+payloadHash.
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 14: API Routes untuk Dispense + Key Access

**Files:**
- Create: `app/api/key-access/grant/route.ts`
- Create: `app/api/prescriptions/[id]/route.ts`

- [ ] **Step 1: Buat key-access grant route (patient → pharmacy)**

```typescript
// app/api/key-access/grant/route.ts
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const { prescriptionId, pharmacyAddr } = await req.json();

  if (!prescriptionId || !pharmacyAddr) {
    return NextResponse.json({ error: "prescriptionId and pharmacyAddr required" }, { status: 400 });
  }

  // Forward to KMS signer microservice
  const kmsUrl = process.env.KMS_SIGNER_URL || "http://localhost:4000";
  const res = await fetch(`${kmsUrl}/grant-access`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      prescriptionId,
      pharmacyAddr,
      karAddress: process.env.KEY_ACCESS_REGISTRY_ADDRESS,
      // patientRef + wrapped key fetched by KMS from chain
    }),
  });

  if (!res.ok) {
    return NextResponse.json({ error: "KMS grant-access failed" }, { status: 500 });
  }

  const data = await res.json();
  return NextResponse.json(data);
}
```

- [ ] **Step 2: Buat prescription read endpoint**

```typescript
// app/api/prescriptions/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { rows } = await pool.query(
    `SELECT prescription_id, doctor_addr, patient_ref, cid, payload_hash,
            issued_at, expires_at, total_units, dispensed_units,
            refills_allowed, refills_used, state
     FROM prescription WHERE prescription_id = $1`,
    [Buffer.from(id.slice(2), "hex")]
  );

  if (rows.length === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const r = rows[0];
  return NextResponse.json({
    prescriptionId: id,
    doctorAddr:     "0x" + r.doctor_addr.toString("hex"),
    patientRef:     "0x" + r.patient_ref.toString("hex"),
    cid:            r.cid,
    payloadHash:    "0x" + r.payload_hash.toString("hex"),
    issuedAt:       Number(r.issued_at),
    expiresAt:      Number(r.expires_at),
    totalUnits:     r.total_units,
    dispensedUnits: r.dispensed_units,
    refillsAllowed: r.refills_allowed,
    refillsUsed:    r.refills_used,
    state:          r.state,
  });
}
```

- [ ] **Step 3: Commit**

```bash
git add app/api/key-access/ app/api/prescriptions/
git commit -m "feat(api): add key-access grant + prescription read endpoints

Patient-centric: grant delegates to KMS signer microservice.
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Fase Evaluation — Gas & Security Analysis

### Task 15: Gas benchmark + Slither setup

**Files:**
- Create: `evaluation/gas-benchmark.ts`
- Create: `evaluation/slither.sh`

- [ ] **Step 1: Buat gas benchmark script**

```typescript
// evaluation/gas-benchmark.ts
import hre from "hardhat";

async function main() {
  const [admin, doctor, pharmacist] = await hre.viem.getWalletClients();

  const identity = await hre.viem.deployContract("IdentityRegistry", [admin.account.address]);
  const DOCTOR_ROLE     = await identity.read.DOCTOR_ROLE();
  const PHARMACIST_ROLE = await identity.read.PHARMACIST_ROLE();
  const licenseHash     = `0x${"ab".repeat(32)}` as `0x${string}`;
  const institutionId   = `0x${"cd".repeat(32)}` as `0x${string}`;
  const encPubKey       = ("0x04" + "aa".repeat(64)) as `0x${string}`;

  const receipt1 = await identity.write.registerActor(
    [doctor.account.address, DOCTOR_ROLE, licenseHash, institutionId, encPubKey],
    { account: admin.account }
  );
  const receipt2 = await identity.write.registerActor(
    [pharmacist.account.address, PHARMACIST_ROLE, licenseHash, institutionId, encPubKey],
    { account: admin.account }
  );

  const prescRegistry = await hre.viem.deployContract("PrescriptionRegistry", [identity.address]);
  const now       = BigInt(Math.floor(Date.now() / 1000));
  const prescId   = `0x${"11".repeat(32)}` as `0x${string}`;
  const patRef    = `0x${"ff".repeat(32)}` as `0x${string}`;
  const payHash   = `0x${"aa".repeat(32)}` as `0x${string}`;
  const cid       = "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi";
  const expiresAt = now + 86400n * 30n;

  const publicClient = await hre.viem.getPublicClient();

  const issueTxHash = await prescRegistry.write.issuePrescription(
    [prescId, patRef, cid, payHash, expiresAt, 30, 1],
    { account: doctor.account }
  );
  const issueReceipt = await publicClient.getTransactionReceipt({ hash: issueTxHash });

  const dispenseTxHash = await prescRegistry.write.dispense([prescId, 10], { account: pharmacist.account });
  const dispenseReceipt = await publicClient.getTransactionReceipt({ hash: dispenseTxHash });

  const revokeTxHash = await prescRegistry.write.revoke([prescId], { account: doctor.account });
  const revokeReceipt = await publicClient.getTransactionReceipt({ hash: revokeTxHash });

  console.log("\n=== GAS BENCHMARK RESULTS ===");
  console.log(`registerActor (Doctor):      ${issueReceipt.gasUsed} gas`);
  console.log(`issuePrescription:           ${issueReceipt.gasUsed} gas`);
  console.log(`dispense(10 units):          ${dispenseReceipt.gasUsed} gas`);
  console.log(`revoke:                      ${revokeReceipt.gasUsed} gas`);
  console.log("==============================\n");
}

main().catch(console.error);
```

- [ ] **Step 2: Buat slither script**

```bash
#!/usr/bin/env bash
# evaluation/slither.sh
set -e

echo "Running Slither on all contracts..."
cd /Volumes/ML2/App/Next/sc-e-prescription

# Install slither if needed
pip3 install slither-analyzer 2>/dev/null || true

slither contracts/IdentityRegistry.sol \
  --solc-remaps "@openzeppelin/=node_modules/@openzeppelin/" \
  --filter-paths "node_modules" \
  --checklist \
  2>&1 | tee evaluation/slither-identity.txt

slither contracts/PrescriptionRegistry.sol \
  --solc-remaps "@openzeppelin/=node_modules/@openzeppelin/" \
  --filter-paths "node_modules" \
  --checklist \
  2>&1 | tee evaluation/slither-prescription.txt

slither contracts/KeyAccessRegistry.sol \
  --solc-remaps "@openzeppelin/=node_modules/@openzeppelin/" \
  --filter-paths "node_modules" \
  --checklist \
  2>&1 | tee evaluation/slither-keyaccess.txt

echo "Slither analysis complete. Reports in evaluation/"
```

- [ ] **Step 3: Jalankan gas benchmark**

```bash
cd /Volumes/ML2/App/Next/sc-e-prescription
npx hardhat run evaluation/gas-benchmark.ts --network hardhat
# Expected: prints gas numbers for each function
```

- [ ] **Step 4: Commit**

```bash
chmod +x evaluation/slither.sh
git add evaluation/
git commit -m "feat(evaluation): add gas benchmark script + Slither static analysis setup (mitigates V7)

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Self-Review Checklist

### Spec Coverage

| Requirement | Task |
|---|---|
| V1: Hapus PII/key plaintext | Task 1, Task 8 (patientRef) |
| V2: Hapus single hot-wallet | Task 12 (KMS), Task 7 (Besu) |
| V3: On-chain RBAC | Task 4 (IdentityRegistry) |
| V4: Lifecycle + anti-double-dispensing | Task 5 (PrescriptionRegistry) |
| V5: Envelope encryption IPFS | Task 8 (crypto), Task 9 (ipfs-encrypted) |
| V6: Event-indexer → Postgres | Task 11 (indexer + schema) |
| V7: Gas benchmark + static analysis | Task 15 |
| FR1-FR3: registerActor, registerPatient, RBAC | Task 4 |
| FR4: issuePrescription | Task 5 |
| FR5-FR6: dispense + anti-double-dispensing | Task 5 |
| FR7: revoke | Task 5 |
| FR8: markExpired | Task 5 |
| FR9: refill | Task 5 |
| FR11: AES-256-GCM encrypt | Task 8, Task 9 |
| FR12-FR14: KeyAccessRegistry | Task 6 |
| FR15: Events per transition | Task 4, 5, 6 |
| FR16: Event-indexer | Task 11 |
| FR17: EIP-712 | Task 8, Task 13 |
| KeyAccessRegistry `recipient: bytes32` | Task 6 (kanonik K-2) |
| `PATIENT_CUSTODIAN_ROLE` | Task 4, Task 12 |
| `issuedAt = block.timestamp` (tidak di-input) | Task 5 |
| `State.None = 0` sentinel | Task 5 |
| Docker Compose + Besu IBFT 2.0 | Task 10 |

### Placeholder Scan

- Semua step mengandung kode aktual atau command aktual
- Tidak ada "TBD" atau "TODO" di step utama
- `REPLACE_WITH_IBFT_EXTRA_DATA` di `genesis.json` perlu diisi setelah key generation — ini adalah ketergantungan operasional yang valid (butuh validator private key terlebih dahulu)

### Type Consistency

- `bytes32 patientRef` digunakan konsisten di semua contract dan TypeScript
- `bytes32 prescriptionId` digunakan konsisten
- `recipient: bytes32` di KeyAccessRegistry (bukan `address`) — kanonik K-2
- `State` enum dengan `None=0` — kanonik K-1

---

**Plan complete dan disimpan.** Two execution options:

**1. Subagent-Driven (recommended)** — Dispatch subagent segar per task, review antara task, iterasi cepat

**2. Inline Execution** — Execute task per task dalam session ini menggunakan executing-plans

**Which approach?**
