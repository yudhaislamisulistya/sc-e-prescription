import { writePrescription } from "../lib/viemClient";

async function test() {
    const patient = "0xa9a76211729171e46589F2bFcE80b7C379E8aB1d"; // Ganti dengan address valid
    const medication = "Paracetamol 500mg"; // Ganti dengan data resep yang valid

    try {
        const tx = await writePrescription(patient, medication);
        console.log("Success:", tx);
    } catch (err) {
        console.error("Direct test error:", err);
    }
}

test();
