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
