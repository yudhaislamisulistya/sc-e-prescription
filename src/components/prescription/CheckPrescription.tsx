import React from "react";
import LoadingSpinner from "../common/LoadingSpinner";

interface CheckPrescriptionProps {
    checkId: string;
    setCheckId: (id: string) => void;
    onCheck: () => void;
    loading?: boolean;
}

export default function CheckPrescription({
    checkId,
    setCheckId,
    onCheck,
    loading = false,
}: CheckPrescriptionProps) {
    return (
        <div className="bg-white rounded-xl shadow-lg p-6 dark:bg-zinc-900">
            <h2 className="text-lg font-semibold mb-4 text-gray-800 dark:text-white">
                Check Recipe Details
            </h2>
            <input
                type="text"
                placeholder="Masukkan ID Resep (bytes32)"
                value={checkId}
                onChange={(e) => setCheckId(e.target.value)}
                className="w-full bg-zinc-100 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 text-gray-800 dark:text-white rounded px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 mb-2"
            />
            {loading ? (
                <LoadingSpinner />
            ) : (
                <button
                    onClick={onCheck}
                    className="mt-4 w-full bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 text-white font-semibold px-5 py-3 rounded-lg shadow-lg hover:from-indigo-700 hover:via-purple-700 hover:to-pink-700 transition"
                >
                    Check Recipe
                </button>
            )}
        </div>
    );
}
