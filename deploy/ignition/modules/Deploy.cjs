// deploy/ignition/modules/Deploy.cjs
//
// Ignition module deploying the three registries in dependency order. The module
// name ("EPrescriptionSystem") and contract IDs match the app's Deploy.ts, so the
// resulting deployed_addresses.json keys are identical
// (EPrescriptionSystem#IdentityRegistry, ...#PrescriptionRegistry, ...#KeyAccessRegistry).
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
