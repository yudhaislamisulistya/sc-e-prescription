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

  it("suspended actor can be re-activated", async () => {
    const { registry, admin, doctor } = await deploy();
    const licenseHash = `0x${"ab".repeat(32)}` as `0x${string}`;
    const institutionId = `0x${"cd".repeat(32)}` as `0x${string}`;
    const encPubKey = "0x04" + "aa".repeat(64);
    const DOCTOR_ROLE = await registry.read.DOCTOR_ROLE();

    await registry.write.registerActor(
      [doctor.account.address, DOCTOR_ROLE, licenseHash, institutionId, encPubKey as `0x${string}`],
      { account: admin.account }
    );

    // Suspend (1 = Suspended) → not authorized
    await registry.write.setActorStatus(
      [doctor.account.address, 1],
      { account: admin.account }
    );
    expect(
      await registry.read.isAuthorized([DOCTOR_ROLE, doctor.account.address])
    ).to.be.false;

    // Re-activate (0 = Active) → authorized again
    await registry.write.setActorStatus(
      [doctor.account.address, 0],
      { account: admin.account }
    );
    expect(
      await registry.read.isAuthorized([DOCTOR_ROLE, doctor.account.address])
    ).to.be.true;
  });

  it("re-registering an actor with a different role revokes the old role's authorization", async () => {
    const { registry, admin, doctor } = await deploy();
    const licenseHash = `0x${"ab".repeat(32)}` as `0x${string}`;
    const institutionId = `0x${"cd".repeat(32)}` as `0x${string}`;
    const encPubKey = "0x04" + "aa".repeat(64);
    const DOCTOR_ROLE = await registry.read.DOCTOR_ROLE();
    const PHARMACIST_ROLE = await registry.read.PHARMACIST_ROLE();

    // Register the same address as a DOCTOR first.
    await registry.write.registerActor(
      [doctor.account.address, DOCTOR_ROLE, licenseHash, institutionId, encPubKey as `0x${string}`],
      { account: admin.account }
    );
    expect(
      await registry.read.isAuthorized([DOCTOR_ROLE, doctor.account.address])
    ).to.be.true;

    // Re-register the SAME address as a PHARMACIST (role change).
    await registry.write.registerActor(
      [doctor.account.address, PHARMACIST_ROLE, licenseHash, institutionId, encPubKey as `0x${string}`],
      { account: admin.account }
    );

    // The stale DOCTOR authorization MUST be gone; only PHARMACIST remains.
    expect(
      await registry.read.isAuthorized([DOCTOR_ROLE, doctor.account.address])
    ).to.be.false;
    expect(
      await registry.read.hasRole([DOCTOR_ROLE, doctor.account.address])
    ).to.be.false;
    expect(
      await registry.read.isAuthorized([PHARMACIST_ROLE, doctor.account.address])
    ).to.be.true;
  });

  it("re-registering an actor with the SAME role keeps authorization", async () => {
    const { registry, admin, doctor } = await deploy();
    const licenseHash = `0x${"ab".repeat(32)}` as `0x${string}`;
    const institutionId = `0x${"cd".repeat(32)}` as `0x${string}`;
    const encPubKey = "0x04" + "aa".repeat(64);
    const DOCTOR_ROLE = await registry.read.DOCTOR_ROLE();

    await registry.write.registerActor(
      [doctor.account.address, DOCTOR_ROLE, licenseHash, institutionId, encPubKey as `0x${string}`],
      { account: admin.account }
    );
    // Re-register with the same role (e.g. to rotate the pubkey).
    await registry.write.registerActor(
      [doctor.account.address, DOCTOR_ROLE, licenseHash, institutionId, encPubKey as `0x${string}`],
      { account: admin.account }
    );

    expect(
      await registry.read.isAuthorized([DOCTOR_ROLE, doctor.account.address])
    ).to.be.true;
  });

  it("admin (constructor-granted, never run through registerActor) is authorized for ADMIN_ROLE", async () => {
    // Regression guard: the admin receives ADMIN_ROLE only via the constructor's
    // _grantRole and is never put through registerActor, so _actors[admin].role
    // stays bytes32(0). isAuthorized(ADMIN_ROLE, admin) MUST still return true —
    // downstream contracts (PrescriptionRegistry.revoke, KeyAccessRegistry
    // grant/revokeAccess) gate the admin emergency paths on exactly this call.
    const { registry, admin } = await deploy();
    const ADMIN_ROLE = await registry.read.ADMIN_ROLE();

    expect(
      await registry.read.isAuthorized([ADMIN_ROLE, admin.account.address])
    ).to.be.true;
  });

  it("admin can register a patient custodian actor", async () => {
    const { registry, admin, custodian } = await deploy();
    const licenseHash = `0x${"ab".repeat(32)}` as `0x${string}`;
    const institutionId = `0x${"cd".repeat(32)}` as `0x${string}`;
    const encPubKey = "0x04" + "aa".repeat(64);
    const CUSTODIAN_ROLE = await registry.read.PATIENT_CUSTODIAN_ROLE();

    await registry.write.registerActor(
      [custodian.account.address, CUSTODIAN_ROLE, licenseHash, institutionId, encPubKey as `0x${string}`],
      { account: admin.account }
    );

    const isAuth = await registry.read.isAuthorized([
      CUSTODIAN_ROLE,
      custodian.account.address,
    ]);
    expect(isAuth).to.be.true;
  });
});
