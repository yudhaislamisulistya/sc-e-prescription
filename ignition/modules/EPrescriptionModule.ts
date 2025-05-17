import { buildModule } from "@nomicfoundation/ignition-core";

export default buildModule("EPrescriptionModule", (m) => {
    const prescription = m.contract("EPrescription");
    return { prescription };
});
