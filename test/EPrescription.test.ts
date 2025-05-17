import { expect } from "chai";
import { ignition } from "hardhat";
import EPrescriptionModule from "../ignition/modules/EPrescriptionModule"; // sesuaikan path-nya

describe("EPrescription", function () {
    it("should deploy EPrescription", async function () {
        const { prescription } = await ignition.deploy(EPrescriptionModule);
        expect(prescription.address).to.not.equal(undefined);
    });
});
