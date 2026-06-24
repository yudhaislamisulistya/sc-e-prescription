// evaluation/gas-benchmark.ts
//
// Real gas benchmark for the e-prescription contracts (spec V7 — evaluation
// methodology). Deploys the three registries on the in-process Hardhat network
// and measures the ACTUAL gasUsed of every write operation by reading EACH
// operation's OWN transaction receipt (no copy-pasted receipt — the plan's bug).
//
// Run: npx hardhat run evaluation/gas-benchmark.ts --network hardhat
import hre from "hardhat";

type Row = { op: string; gas: bigint };

async function main(): Promise<void> {
  const publicClient = await hre.viem.getPublicClient();
  const [admin, doctor, pharmacist] = await hre.viem.getWalletClients();

  const rows: Row[] = [];
  const gasOf = async (hash: `0x${string}`): Promise<bigint> =>
    (await publicClient.waitForTransactionReceipt({ hash })).gasUsed;

  // Deploy via the wallet client so we capture the deploy tx receipt (gasUsed +
  // contractAddress). Returns the deployed address; callers bind a typed
  // instance with a LITERAL contract name so viem infers exact read/write types.
  async function deployGas(name: string, args: readonly unknown[]): Promise<`0x${string}`> {
    const art = await hre.artifacts.readArtifact(name);
    const hash = await admin.deployContract({
      abi: art.abi,
      bytecode: art.bytecode as `0x${string}`,
      args: args as unknown[],
      account: admin.account,
    });
    const rc = await publicClient.waitForTransactionReceipt({ hash });
    rows.push({ op: `deploy ${name}`, gas: rc.gasUsed });
    return rc.contractAddress as `0x${string}`;
  }

  // --- Identity --------------------------------------------------------------
  const identityAddr = await deployGas("IdentityRegistry", [admin.account.address]);
  const idr = await hre.viem.getContractAt("IdentityRegistry", identityAddr);

  const DOCTOR_ROLE = await idr.read.DOCTOR_ROLE();
  const PHARMACIST_ROLE = await idr.read.PHARMACIST_ROLE();

  const licenseHash = `0x${"ab".repeat(32)}` as `0x${string}`;
  const institutionId = `0x${"cd".repeat(32)}` as `0x${string}`;
  const encPubKey = `0x04${"aa".repeat(64)}` as `0x${string}`;

  rows.push({
    op: "registerActor (doctor)",
    gas: await gasOf(
      await idr.write.registerActor(
        [doctor.account.address, DOCTOR_ROLE, licenseHash, institutionId, encPubKey],
        { account: admin.account }
      )
    ),
  });
  rows.push({
    op: "registerActor (pharmacist)",
    gas: await gasOf(
      await idr.write.registerActor(
        [pharmacist.account.address, PHARMACIST_ROLE, licenseHash, institutionId, encPubKey],
        { account: admin.account }
      )
    ),
  });

  const patientRef = `0x${"ff".repeat(32)}` as `0x${string}`;
  rows.push({
    op: "registerPatient",
    gas: await gasOf(
      await idr.write.registerPatient([patientRef, encPubKey, admin.account.address], {
        account: admin.account,
      })
    ),
  });

  // --- Prescription + KeyAccess ---------------------------------------------
  const prescAddr = await deployGas("PrescriptionRegistry", [identityAddr]);
  const prx = await hre.viem.getContractAt("PrescriptionRegistry", prescAddr);
  const karAddr = await deployGas("KeyAccessRegistry", [identityAddr, prescAddr]);
  const kar = await hre.viem.getContractAt("KeyAccessRegistry", karAddr);

  const head = await publicClient.getBlock();
  const expiresAt = head.timestamp + 86400n * 30n;
  const payloadHash = `0x${"aa".repeat(32)}` as `0x${string}`;
  const cid = "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi";
  const prescId = `0x${"11".repeat(32)}` as `0x${string}`;

  rows.push({
    op: "issuePrescription",
    gas: await gasOf(
      await prx.write.issuePrescription(
        [prescId, patientRef, cid, payloadHash, expiresAt, 30, 1],
        { account: doctor.account }
      )
    ),
  });
  rows.push({
    op: "dispense (partial 10)",
    gas: await gasOf(await prx.write.dispense([prescId, 10], { account: pharmacist.account })),
  });
  rows.push({
    op: "dispense (remaining 20 -> FULLY)",
    gas: await gasOf(await prx.write.dispense([prescId, 20], { account: pharmacist.account })),
  });
  rows.push({
    op: "refill (-> ISSUED)",
    gas: await gasOf(await prx.write.refill([prescId], { account: pharmacist.account })),
  });

  // grantAccess: issuing doctor wraps the CEK for the patient.
  const wrappedKey = `0x${"ab".repeat(65)}` as `0x${string}`;
  rows.push({
    op: "grantAccess (doctor->patient)",
    gas: await gasOf(
      await kar.write.grantAccess([prescId, patientRef, wrappedKey], { account: doctor.account })
    ),
  });

  // revoke on a fresh prescription (state ISSUED).
  const prescId2 = `0x${"22".repeat(32)}` as `0x${string}`;
  await prx.write.issuePrescription([prescId2, patientRef, cid, payloadHash, expiresAt, 10, 0], {
    account: doctor.account,
  });
  rows.push({
    op: "revoke",
    gas: await gasOf(await prx.write.revoke([prescId2], { account: doctor.account })),
  });

  // markExpired on a fresh short-lived prescription via EVM time travel.
  const prescId3 = `0x${"33".repeat(32)}` as `0x${string}`;
  const shortExpiry = head.timestamp + 60n;
  await prx.write.issuePrescription([prescId3, patientRef, cid, payloadHash, shortExpiry, 10, 0], {
    account: doctor.account,
  });
  await hre.network.provider.send("evm_increaseTime", [120]);
  await hre.network.provider.send("evm_mine", []);
  rows.push({
    op: "markExpired (permissionless)",
    gas: await gasOf(await prx.write.markExpired([prescId3], { account: pharmacist.account })),
  });

  // --- Report ----------------------------------------------------------------
  const width = Math.max(...rows.map((r) => r.op.length));
  console.log("\n=== GAS BENCHMARK — e-prescription registries ===");
  console.log("Target: Hyperledger Besu IBFT 2.0 (free-gas), EVM Paris, optimizer runs=200\n");
  for (const r of rows) {
    console.log(`  ${r.op.padEnd(width)}   ${r.gas.toString().padStart(8)} gas`);
  }
  console.log("\n(Free-gas consortium: gasPrice = 0, so monetary cost = 0; gasUsed is the");
  console.log(" resource metric for throughput/sizing.)\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
