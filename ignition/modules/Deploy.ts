import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

export default buildModule("EPrescriptionSystem", (m) => {
  // Default admin is hardhat account #0 so the module deploys with no external
  // params (override via Ignition parameters for real networks).
  const adminAddress = m.getParameter(
    "adminAddress",
    "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"
  );

  const identityRegistry = m.contract("IdentityRegistry", [adminAddress]);
  const prescriptionRegistry = m.contract("PrescriptionRegistry", [
    identityRegistry,
  ]);
  const keyAccessRegistry = m.contract("KeyAccessRegistry", [
    identityRegistry,
    prescriptionRegistry,
  ]);

  return { identityRegistry, prescriptionRegistry, keyAccessRegistry };
});
