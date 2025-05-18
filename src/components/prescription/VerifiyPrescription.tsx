import React from "react";
import LoadingSpinner from "../common/LoadingSpinner";

interface VerifyPrescriptionProps {
    verifyId: string;
    setVerifyId: (id: string) => void;
    onVerify: () => void;
    loading?: boolean;
}

export default function VerifyPrescription({
    verifyId,
    setVerifyId,
    onVerify,
    loading = false,
}: VerifyPrescriptionProps) {
    return (
        <div className="bg-white rounded-xl shadow-lg p-6 dark:bg-zinc-900 mb-3">
            <h2 className="text-lg font-semibold mb-4 text-gray-800 dark:text-white">
                Recipe Verification
            </h2>
            <input
                type="text"
                placeholder="Masukkan ID Resep (bytes32)"
                value={verifyId}
                onChange={(e) => setVerifyId(e.target.value)}
                className="w-full bg-zinc-100 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 text-gray-800 dark:text-white rounded px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 mb-2"
            />
            {loading ? (
                <LoadingSpinner />
            ) : (
                <button
                    onClick={onVerify}
                    className="mt-4 w-full bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 text-white font-semibold px-5 py-3 rounded-lg shadow-lg hover:from-indigo-700 hover:via-purple-700 hover:to-pink-700 transition"
                >
                    Verification
                </button>
            )}
        </div>
    );
}
