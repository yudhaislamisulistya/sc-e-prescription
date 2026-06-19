import { expect } from "chai";
import { ignition } from "hardhat";
import Mod from "../ignition/modules/Deploy";

// Default admin baked into the module (hardhat account #0).
const DEFAULT_ADMIN = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" as `0x${string}`;

describe("Deploy (Ignition module)", function () {
  it("deploys all three contracts with wired constructor args", async () => {
    const { identityRegistry, prescriptionRegistry, keyAccessRegistry } =
      await ignition.deploy(Mod);

    expect(identityRegistry.address, "identityRegistry.address").to.be.a("string");
    expect(prescriptionRegistry.address, "prescriptionRegistry.address").to.be.a("string");
    expect(keyAccessRegistry.address, "keyAccessRegistry.address").to.be.a("string");

    expect(identityRegistry.address).to.match(/^0x[0-9a-fA-F]{40}$/);
    expect(prescriptionRegistry.address).to.match(/^0x[0-9a-fA-F]{40}$/);
    expect(keyAccessRegistry.address).to.match(/^0x[0-9a-fA-F]{40}$/);

    // All three must be distinct deployments.
    const addrs = new Set([
      identityRegistry.address.toLowerCase(),
      prescriptionRegistry.address.toLowerCase(),
      keyAccessRegistry.address.toLowerCase(),
    ]);
    expect(addrs.size).to.equal(3);

    // Cross-wiring: read back the constructor-injected immutables and assert
    // each registry points at the right sibling. Without these, swapping the
    // KeyAccessRegistry args to [prescriptionRegistry, identityRegistry] would
    // still deploy three distinct addresses and pass — defeating the test.
    const prIdentity = (await prescriptionRegistry.read.identityRegistry()) as `0x${string}`;
    expect(prIdentity.toLowerCase(), "prescriptionRegistry.identityRegistry()").to.equal(
      identityRegistry.address.toLowerCase()
    );

    const karIdentity = (await keyAccessRegistry.read.identityRegistry()) as `0x${string}`;
    expect(karIdentity.toLowerCase(), "keyAccessRegistry.identityRegistry()").to.equal(
      identityRegistry.address.toLowerCase()
    );

    const karPrescription = (await keyAccessRegistry.read.prescriptionRegistry()) as `0x${string}`;
    expect(
      karPrescription.toLowerCase(),
      "keyAccessRegistry.prescriptionRegistry()"
    ).to.equal(prescriptionRegistry.address.toLowerCase());
  });

  it("grants ADMIN_ROLE on IdentityRegistry to the default admin", async () => {
    const { identityRegistry } = await ignition.deploy(Mod);

    const adminRole = await identityRegistry.read.ADMIN_ROLE();
    const hasAdmin = await identityRegistry.read.hasRole([adminRole, DEFAULT_ADMIN]);
    expect(hasAdmin).to.be.true;
  });
});
