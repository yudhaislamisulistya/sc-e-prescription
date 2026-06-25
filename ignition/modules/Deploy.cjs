// ignition/modules/Deploy.cjs
//
// CommonJS twin of Deploy.ts, used by deploy-contracts.sh so the deploy needs no
// ts-node. Same module name ("EPrescriptionSystem") and contract IDs, so the
// deployed_addresses.json keys are identical.
const { buildModule } = require("@nomicfoundation/hardhat-ignition/modules");

module.exports = buildModule("EPrescriptionSystem", (m) => {
  const adminAddress = m.getParameter(
    "adminAddress",
    "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"
  );

  const identityRegistry = m.contract("IdentityRegistry", [adminAddress]);
  const prescriptionRegistry = m.contract("PrescriptionRegistry", [identityRegistry]);
  const keyAccessRegistry = m.contract("KeyAccessRegistry", [
    identityRegistry,
    prescriptionRegistry,
  ]);

  return { identityRegistry, prescriptionRegistry, keyAccessRegistry };
});
