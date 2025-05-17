import PrescriptionForm from "@/components/prescription/PrescriptionForm";
import DoctorLayout from '@/layouts/DoctorLayout';
import { useState } from "react";

export default function CreatePrescriptionPage() {
    const [verifyId, setVerifyId] = useState("");
    const [checkId, setCheckId] = useState("");

    return (
        <DoctorLayout>
            <h1 className="text-3xl font-bold mb-6 text-transparent bg-clip-text bg-gradient-to-r from-purple-400 via-pink-500 to-red-500">
                Menu Resep
            </h1>
            <div className="flex gap-8">
                {/* Kolom kiri - Prescription Form */}
                <div className="flex-1 basis-8/12 bg-zinc-900 p-6 rounded-xl shadow-lg bg-gradient-to-br from-gray-800 via-zinc-900 to-black">
                    <PrescriptionForm />
                </div>

                {/* Kolom kanan - 2 Card */}
                <div className="flex-1 basis-4/12 bg-zinc-800 rounded-xl shadow-lg p-6 bg-gradient-to-br from-zinc-900 via-zinc-800 to-zinc-900">
                    {/* Card 1 - Verifikasi Resep */}
                    <div className="bg-white rounded-xl shadow-lg p-6 dark:bg-zinc-900 mb-3">
                        <h2 className="text-lg font-semibold mb-4 text-gray-800 dark:text-white">
                            Recipe Verification
                        </h2>
                        <input
                            type="text"
                            placeholder="Masukkan ID Resep (bytes32)"
                            value={verifyId}
                            onChange={(e) => setVerifyId(e.target.value)}
                            className="w-full bg-zinc-100 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 text-gray-800 dark:text-white rounded px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        <button
                            onClick={() => alert(`Verifikasi resep dengan ID: ${verifyId}`)}
                            className="mt-4 w-full bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 text-white font-semibold px-5 py-3 rounded-lg shadow-lg hover:from-indigo-700 hover:via-purple-700 hover:to-pink-700 transition"
                        >
                            Verification
                        </button>
                    </div>


                    {/* Card 2 - Cek Detail Resep */}
                    <div className="bg-white rounded-xl shadow-lg p-6 dark:bg-zinc-900">
                        <h2 className="text-lg font-semibold mb-4 text-gray-800 dark:text-white">
                            Check Recipe Details
                        </h2>
                        <input
                            type="text"
                            placeholder="Masukkan ID Resep (bytes32)"
                            value={checkId}
                            onChange={(e) => setCheckId(e.target.value)}
                            className="w-full bg-zinc-100 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 text-gray-800 dark:text-white rounded px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        <button
                            onClick={() => alert(`Cek resep dengan ID: ${checkId}`)}
                            className="mt-4 w-full bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 text-white font-semibold px-5 py-3 rounded-lg shadow-lg hover:from-indigo-700 hover:via-purple-700 hover:to-pink-700 transition"
                        >
                            Check Recipe   
                        </button>
                    </div>
                </div>
            </div>
        </DoctorLayout>
    );
}
