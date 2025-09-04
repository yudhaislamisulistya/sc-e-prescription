/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect } from "react";
import LoadingSpinner from "../common/LoadingSpinner";
import dynamic from 'next/dynamic';

const Select = dynamic(() => import('react-select'), { ssr: false });

type Patient = {
    id: string;
    nama: string;
    email: string;
    tanggal_lahir: string;
    nik: string;
    no_hp: string;
    alamat: string;
    wallet: {
        address: string;
        privateKey: string;
    };
    created_at: string;
};

export default function PrescriptionForm() {
    const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
    const [patients, setPatients] = useState<Patient[]>([]);
    const [prescriptionText, setPrescriptionText] = useState("");
    const [loading, setLoading] = useState(false);

    const loadPatients = () => {
        fetch("/data/pasien_wallets.json")
            .then((res) => res.json())
            .then((data) => setPatients(data))
            .catch(console.error);
    };

    useEffect(() => {
        loadPatients();
    }, []);

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
                    patient: selectedPatient.wallet.address,
                    medication: prescriptionText,
                }),
            });

            const data = await res.json();

            if (!res.ok) throw new Error(data.error || "Terjadi kesalahan");

            alert(
                `Resep berhasil disimpan!\nCID: ${data.cid}\nTxHash: ${data.tx}\nID: ${data.id}\nDoctor Address: ${data.doctorAddress}\nPatient Address: ${data.patientAddress}`
            );
        } catch (error) {
            console.error(error);
            alert("Terjadi kesalahan saat menyimpan resep.");
        }
        setLoading(false);
    }

    const options = patients.map((p) => ({
        value: p.wallet.address,
        label: p.nama,
    }));

    return (
        <form
            onSubmit={handleSubmit}
            className="mx-auto p-6 shadow-lg rounded-lg"
        >
            <h2 className="text-2xl font-bold mb-6">Create New Prescription</h2>

            <label className="block text-white font-semibold mb-2">Choose Patient</label>
            <Select
                options={options}
                onChange={(option: any): void => {
                    const selected = patients.find(p => p.wallet.address === option?.value);
                    setSelectedPatient(selected || null);
                }}
                placeholder="Search for a patient..."
                className="mb-2"
                isClearable
                required
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
                    <span className="font-mono">{selectedPatient.wallet.address}</span>
                </p>
            )}

            <label className="block text-white font-semibold mt-6 mb-2">Prescription Details</label>
            <textarea
                placeholder="Enter prescription details here..."
                value={prescriptionText}
                onChange={(e) => setPrescriptionText(e.target.value)}
                required
                rows={5}
                className="w-full bg-gradient-to-r from-gray-900 via-zinc-800 to-gray-900 text-white border border-zinc-600 rounded-lg px-4 py-3 focus:outline-none focus:ring-4 focus:ring-indigo-500 transition resize-none mb-2"
            />
            {loading ? (
                <LoadingSpinner />
            ) : (
                <button
                    type="submit"
                    disabled={loading}
                    className="mt-6 w-full bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 text-white font-semibold px-5 py-3 rounded-lg shadow-lg hover:from-indigo-700 hover:via-purple-700 hover:to-pink-700 transition"
                >
                    Save Recipe
                </button>
            )}

        </form>
    );
}
