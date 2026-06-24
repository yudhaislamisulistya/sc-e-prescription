// test/PrescriptionRegistry.test.ts
import { expect } from "chai";
import hre from "hardhat";

describe("PrescriptionRegistry", function () {
  async function deploy() {
    const [deployer, admin, doctor, pharmacist, stranger] =
      await hre.viem.getWalletClients();
    const publicClient = await hre.viem.getPublicClient();
    const testClient = await hre.viem.getTestClient();

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

    // Derive `now` from the chain head (block.timestamp), NOT wall-clock, so
    // expiry math in the contract lines up with what the tests assert.
    const latest = await publicClient.getBlock();
    const now = latest.timestamp;

    const patientRef  = `0x${"ff".repeat(32)}` as `0x${string}`;
    const payloadHash = `0x${"aa".repeat(32)}` as `0x${string}`;
    const cid         = "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi";
    const prescId     = `0x${"11".repeat(32)}` as `0x${string}`;
    const expiresAt   = now + 86400n * 30n;
    const totalUnits  = 30;
    const refillsAllowed = 1;

    return {
      identity, registry, admin, doctor, pharmacist, stranger,
      patientRef, payloadHash, cid, prescId, expiresAt, totalUnits, refillsAllowed,
      now, publicClient, testClient,
    };
  }

  // ---------------------------------------------------------------------------
  // Plan tests (7)
  // ---------------------------------------------------------------------------

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

  // ---------------------------------------------------------------------------
  // Additional required tests (a)-(d)
  // ---------------------------------------------------------------------------

  it("(a) cannot dispense after revoke", async () => {
    const { registry, doctor, pharmacist, patientRef, payloadHash, cid, prescId, expiresAt, totalUnits, refillsAllowed } = await deploy();

    await registry.write.issuePrescription(
      [prescId, patientRef, cid, payloadHash, expiresAt, totalUnits, refillsAllowed],
      { account: doctor.account }
    );
    await registry.write.revoke([prescId], { account: doctor.account });

    await expect(
      registry.write.dispense([prescId, 1], { account: pharmacist.account })
    ).to.be.rejected;

    const presc = await registry.read.getPrescription([prescId]);
    expect(presc.state).to.equal(5); // still REVOKED
    expect(presc.dispensedUnits).to.equal(0);
  });

  it("(b) cannot dispense after FULLY_DISPENSED", async () => {
    const { registry, doctor, pharmacist, patientRef, payloadHash, cid, prescId, expiresAt, totalUnits, refillsAllowed } = await deploy();

    await registry.write.issuePrescription(
      [prescId, patientRef, cid, payloadHash, expiresAt, totalUnits, refillsAllowed],
      { account: doctor.account }
    );
    // exhaust all units → FULLY_DISPENSED
    await registry.write.dispense([prescId, totalUnits], { account: pharmacist.account });

    const fully = await registry.read.getPrescription([prescId]);
    expect(fully.state).to.equal(3); // FULLY_DISPENSED

    // any further dispense (even 1 unit) must be rejected
    await expect(
      registry.write.dispense([prescId, 1], { account: pharmacist.account })
    ).to.be.rejected;

    const after = await registry.read.getPrescription([prescId]);
    expect(after.dispensedUnits).to.equal(totalUnits); // unchanged
  });

  it("(c) refill resets dispensedUnits, bumps refillsUsed, and is blocked beyond refillsAllowed", async () => {
    const { registry, doctor, pharmacist, patientRef, payloadHash, cid, prescId, expiresAt, totalUnits } = await deploy();

    // refillsAllowed = 1 for this prescription
    await registry.write.issuePrescription(
      [prescId, patientRef, cid, payloadHash, expiresAt, totalUnits, 1],
      { account: doctor.account }
    );

    // Fully dispense the original fill.
    await registry.write.dispense([prescId, totalUnits], { account: pharmacist.account });
    let presc = await registry.read.getPrescription([prescId]);
    expect(presc.state).to.equal(3); // FULLY_DISPENSED
    expect(presc.dispensedUnits).to.equal(totalUnits);

    // First refill: allowed (refillsUsed 0 -> 1), resets dispensedUnits, back to ISSUED.
    await registry.write.refill([prescId], { account: pharmacist.account });
    presc = await registry.read.getPrescription([prescId]);
    expect(presc.state).to.equal(1); // ISSUED
    expect(presc.dispensedUnits).to.equal(0); // reset
    expect(presc.refillsUsed).to.equal(1); // bumped

    // Dispense the refill fully again to return to FULLY_DISPENSED.
    await registry.write.dispense([prescId, totalUnits], { account: pharmacist.account });
    presc = await registry.read.getPrescription([prescId]);
    expect(presc.state).to.equal(3); // FULLY_DISPENSED

    // Second refill: blocked beyond refillsAllowed (refillsUsed 1 >= allowed 1).
    await expect(
      registry.write.refill([prescId], { account: pharmacist.account })
    ).to.be.rejected;

    presc = await registry.read.getPrescription([prescId]);
    expect(presc.refillsUsed).to.equal(1); // unchanged
    expect(presc.state).to.equal(3); // still FULLY_DISPENSED
  });

  it("(d) markExpired before expiry reverts", async () => {
    const { registry, doctor, patientRef, payloadHash, cid, prescId, expiresAt, totalUnits, refillsAllowed } = await deploy();

    await registry.write.issuePrescription(
      [prescId, patientRef, cid, payloadHash, expiresAt, totalUnits, refillsAllowed],
      { account: doctor.account }
    );

    // expiresAt is ~30 days in the future relative to chain head → reverts.
    await expect(
      registry.write.markExpired([prescId], { account: doctor.account })
    ).to.be.rejected;

    const presc = await registry.read.getPrescription([prescId]);
    expect(presc.state).to.equal(1); // still ISSUED
  });

  it("(d+) markExpired after expiry transitions to EXPIRED and verify is false", async () => {
    const { registry, doctor, patientRef, payloadHash, cid, prescId, expiresAt, totalUnits, refillsAllowed, testClient } = await deploy();

    await registry.write.issuePrescription(
      [prescId, patientRef, cid, payloadHash, expiresAt, totalUnits, refillsAllowed],
      { account: doctor.account }
    );

    // Fast-forward the chain past expiry, then mine so block.timestamp updates.
    await testClient.increaseTime({ seconds: 86400 * 31 });
    await testClient.mine({ blocks: 1 });

    await registry.write.markExpired([prescId], { account: doctor.account });

    const presc = await registry.read.getPrescription([prescId]);
    expect(presc.state).to.equal(4); // EXPIRED
    expect(await registry.read.verify([prescId])).to.be.false;
  });

  it("(d++) markExpired cannot relabel a FULLY_DISPENSED prescription as EXPIRED", async () => {
    const { registry, doctor, pharmacist, patientRef, payloadHash, cid, prescId, expiresAt, totalUnits, refillsAllowed, testClient } = await deploy();

    await registry.write.issuePrescription(
      [prescId, patientRef, cid, payloadHash, expiresAt, totalUnits, refillsAllowed],
      { account: doctor.account }
    );

    // Exhaust all units → FULLY_DISPENSED (terminal state).
    await registry.write.dispense([prescId, totalUnits], { account: pharmacist.account });
    let presc = await registry.read.getPrescription([prescId]);
    expect(presc.state).to.equal(3); // FULLY_DISPENSED

    // Advance the chain past expiry. markExpired is permissionless, so a stranger
    // attempts the illegal FULLY_DISPENSED -> EXPIRED transition.
    await testClient.increaseTime({ seconds: 86400 * 31 });
    await testClient.mine({ blocks: 1 });

    await expect(
      registry.write.markExpired([prescId], { account: doctor.account })
    ).to.be.rejected;

    // State must remain FULLY_DISPENSED - a completed dispensation is never
    // relabeled "expired", so the audit record stays intact.
    presc = await registry.read.getPrescription([prescId]);
    expect(presc.state).to.equal(3); // still FULLY_DISPENSED, NOT EXPIRED
  });

  // ---------------------------------------------------------------------------
  // issuePrescription input-validation guards (negative paths)
  // ---------------------------------------------------------------------------

  it("(e) issuePrescription reverts on duplicate prescriptionId", async () => {
    const { registry, doctor, patientRef, payloadHash, cid, prescId, expiresAt, totalUnits, refillsAllowed } = await deploy();

    await registry.write.issuePrescription(
      [prescId, patientRef, cid, payloadHash, expiresAt, totalUnits, refillsAllowed],
      { account: doctor.account }
    );

    // Same id reused → PrescriptionAlreadyExists.
    await expect(
      registry.write.issuePrescription(
        [prescId, patientRef, cid, payloadHash, expiresAt, totalUnits, refillsAllowed],
        { account: doctor.account }
      )
    ).to.be.rejected;

    // Original prescription is untouched.
    const presc = await registry.read.getPrescription([prescId]);
    expect(presc.state).to.equal(1); // still ISSUED
    expect(presc.totalUnits).to.equal(totalUnits);
  });

  it("(f) issuePrescription reverts when expiresAt <= block.timestamp", async () => {
    const { registry, doctor, patientRef, payloadHash, cid, prescId, totalUnits, refillsAllowed, publicClient } = await deploy();

    // Pin expiry to the current chain head timestamp (expiresAt == now → not > now).
    const head = await publicClient.getBlock();
    const expiredAt = head.timestamp;

    await expect(
      registry.write.issuePrescription(
        [prescId, patientRef, cid, payloadHash, expiredAt, totalUnits, refillsAllowed],
        { account: doctor.account }
      )
    ).to.be.rejected;

    // Nothing was written.
    const presc = await registry.read.getPrescription([prescId]);
    expect(presc.state).to.equal(0); // None
  });

  it("(g) issuePrescription reverts when totalUnits == 0", async () => {
    const { registry, doctor, patientRef, payloadHash, cid, prescId, expiresAt, refillsAllowed } = await deploy();

    await expect(
      registry.write.issuePrescription(
        [prescId, patientRef, cid, payloadHash, expiresAt, 0, refillsAllowed],
        { account: doctor.account }
      )
    ).to.be.rejected;

    const presc = await registry.read.getPrescription([prescId]);
    expect(presc.state).to.equal(0); // None
  });

  it("(h) issuePrescription reverts when payloadHash is zero", async () => {
    const { registry, doctor, patientRef, cid, prescId, expiresAt, totalUnits, refillsAllowed } = await deploy();

    const zeroHash = `0x${"00".repeat(32)}` as `0x${string}`;

    await expect(
      registry.write.issuePrescription(
        [prescId, patientRef, cid, zeroHash, expiresAt, totalUnits, refillsAllowed],
        { account: doctor.account }
      )
    ).to.be.rejected;

    const presc = await registry.read.getPrescription([prescId]);
    expect(presc.state).to.equal(0); // None
  });

  it("(i) issuePrescription reverts when cid is empty", async () => {
    const { registry, doctor, patientRef, payloadHash, prescId, expiresAt, totalUnits, refillsAllowed } = await deploy();

    await expect(
      registry.write.issuePrescription(
        [prescId, patientRef, "", payloadHash, expiresAt, totalUnits, refillsAllowed],
        { account: doctor.account }
      )
    ).to.be.rejected;

    const presc = await registry.read.getPrescription([prescId]);
    expect(presc.state).to.equal(0); // None
  });
});
