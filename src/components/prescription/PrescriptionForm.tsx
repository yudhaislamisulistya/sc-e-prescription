import { useState } from "react";

export default function PrescriptionForm() {
    const [patientAddress, setPatientAddress] = useState("");
    const [prescriptionText, setPrescriptionText] = useState("");
    const [loading, setLoading] = useState(false);

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setLoading(true);
        try {
            const res = await fetch("/api/createPrescription", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    patient: patientAddress,
                    medication: prescriptionText,
                }),
            });

            const data = await res.json();

            if (!res.ok) throw new Error(data.error || "Terjadi kesalahan");

            alert(
                `Resep berhasil disimpan!\nCID: ${data.cid}\nTxHash: ${data.tx.transactionHash || JSON.stringify(data.tx)
                }`
            );
        } catch (error) {
            console.error(error);
            alert("Terjadi kesalahan saat menyimpan resep.");
        }
        setLoading(false);
    }

    return (
        <form
            onSubmit={handleSubmit}
            className="flex flex-col gap-4 w-full max-w-md mx-auto"
        >
            <input
                type="text"
                placeholder="Alamat Pasien (0x...)"
                value={patientAddress}
                onChange={(e) => setPatientAddress(e.target.value)}
                required
                className="bg-zinc-800 text-white border border-zinc-600 rounded px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <textarea
                placeholder="Tulis isi resep..."
                value={prescriptionText}
                onChange={(e) => setPrescriptionText(e.target.value)}
                required
                rows={5}
                className="bg-zinc-800 text-white border border-zinc-600 rounded px-4 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
                type="submit"
                disabled={loading}
                className={`px-4 py-2 rounded text-white font-semibold transition ${loading
                        ? "bg-gray-500 cursor-not-allowed"
                        : "bg-blue-600 hover:bg-blue-700"
                    }`}
            >
                {loading ? "Menyimpan..." : "Simpan Resep"}
            </button>
        </form>
    );
}
