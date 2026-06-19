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
