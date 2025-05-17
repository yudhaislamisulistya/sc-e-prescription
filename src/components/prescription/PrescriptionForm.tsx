import { useState } from "react";
import Select from "react-select";

type Patient = {
    nama: string;
    walletAddress: string;
};

const patients: Patient[] = [
    { nama: "Monkey D. Luffy", walletAddress: "0x123...abc" },
    { nama: "Roronoa Zoro", walletAddress: "0x456...def" },
    { nama: "Nami", walletAddress: "0x789...ghi" },
    // isi data pasien lainnya
];

export default function PrescriptionForm() {
    const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
    const [prescriptionText, setPrescriptionText] = useState("");
    const [loading, setLoading] = useState(false);

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!selectedPatient) {
            alert("Pilih pasien terlebih dahulu!");
            return;
        }
        setLoading(true);
        try {
            const res = await fetch("/api/createPrescription", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    patient: selectedPatient.walletAddress,
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

    const options = patients.map((p) => ({
        value: p.walletAddress,
        label: p.nama,
    }));

    return (
        <form
            onSubmit={handleSubmit}
            className="mx-auto p-6 shadow-lg rounded-lg"
        >
            <h2 className="text-2xl font-bold mb-6 text-white">Buat Resep Baru</h2>

            <label className="block text-white font-semibold mb-2">Pilih Pasien</label>
            <Select
                options={options}
                onChange={(option) =>
                    setSelectedPatient(
                        option ? { nama: option.label, walletAddress: option.value } : null
                    )
                }
                placeholder="Cari nama pasien..."
                className="mb-2"
                isClearable
                styles={{
                    control: (base, state) => ({
                        ...base,
                        background: "linear-gradient(to right, #111827, #27272a, #111827)", // gray-900 -> zinc-800
                        color: "white",
                        borderColor: state.isFocused ? "#6366f1" : "#52525b", // indigo-500 focus, zinc-600 normal
                        boxShadow: state.isFocused ? "0 0 0 4px rgba(99, 102, 241, 0.5)" : "none",
                        padding: "4px",
                        borderRadius: "0.5rem",
                    }),
                    singleValue: (base) => ({
                        ...base,
                        color: "white",
                    }),
                    input: (base) => ({
                        ...base,
                        color: "white",
                    }),
                    menu: (base) => ({
                        ...base,
                        backgroundColor: "#18181b", // zinc-900
                        color: "white",
                        borderRadius: "0.5rem",
                        marginTop: "4px",
                    }),
                    option: (base, state) => ({
                        ...base,
                        backgroundColor: state.isFocused ? "#3f3f46" : "#18181b", // zinc-700 hover, zinc-900 base
                        color: "white",
                        padding: "10px 15px",
                        cursor: "pointer",
                    }),
                    placeholder: (base) => ({
                        ...base,
                        color: "#a1a1aa", // zinc-400
                    }),
                    dropdownIndicator: (base) => ({
                        ...base,
                        color: "white",
                    }),
                    clearIndicator: (base) => ({
                        ...base,
                        color: "white",
                    }),
                }}
            />


            {selectedPatient && (
                <p className="text-white mt-1 text-sm">
                    Wallet Address:{" "}
                    <span className="font-mono">{selectedPatient.walletAddress}</span>
                </p>
            )}

            <label className="block text-white font-semibold mt-6 mb-2">Isi Resep</label>
            <textarea
                placeholder="Tulis isi resep..."
                value={prescriptionText}
                onChange={(e) => setPrescriptionText(e.target.value)}
                required
                rows={5}
                className="w-full bg-gradient-to-r from-gray-900 via-zinc-800 to-gray-900 text-white border border-zinc-600 rounded-lg px-4 py-3 focus:outline-none focus:ring-4 focus:ring-indigo-500 transition resize-none"
            />

            <button
                type="submit"
                disabled={loading}
                className={`mt-6 w-full px-6 py-3 rounded-lg font-bold text-white transition 
                ${loading
                        ? "bg-gray-500 cursor-not-allowed"
                        : "bg-gradient-to-r from-pink-500 via-red-500 to-yellow-400 hover:from-pink-600 hover:via-red-600 hover:to-yellow-500"
                    }`}
            >
                {loading ? "Menyimpan..." : "Simpan Resep"}
            </button>
        </form>
    );
}
