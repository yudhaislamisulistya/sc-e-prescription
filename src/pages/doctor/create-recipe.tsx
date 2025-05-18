/* eslint-disable @typescript-eslint/no-explicit-any */
import CheckPrescription from "@/components/prescription/CheckPrescription";
import PrescriptionForm from "@/components/prescription/PrescriptionForm";
import VerifyPrescription from "@/components/prescription/VerifiyPrescription";
import DoctorLayout from '@/layouts/DoctorLayout';
import { useState } from "react";
import { toast } from 'react-toastify';

export default function CreatePrescriptionPage() {
    const [verifyId, setVerifyId] = useState("");
    const [checkId, setCheckId] = useState("");
    const [prescriptionDetail, setPrescriptionDetail] = useState<any | null>(null);
    const [loadingVerify, setLoadingVerify] = useState(false);
    const [loadingCheck, setLoadingCheck] = useState(false);


    async function handleVerify() {
        setLoadingVerify(true);

        if (!verifyId) {
            toast.warning("Masukkan ID resep dulu ya!");
            setLoadingVerify(false);
            return;
        }

        try {
            const res = await fetch(`/api/verifyPrescription?id=${encodeURIComponent(verifyId)}`, {
                method: "GET",
            });

            if (!res.ok) throw new Error("Gagal verifikasi resep");

            const data = await res.json();
            if (data.isValid) {
                toast.success("Resep valid!");
            } else {
                toast.error("Resep tidak valid!");
            }
        } catch (error) {
            toast.error(`Error saat verifikasi: ${(error as Error).message}`);
        } finally {
            setLoadingVerify(false);
        }
    }



    async function handleCheck() {
        setLoadingCheck(true);

        if (!checkId) {
            toast.warning("Please enter a prescription ID.");
            setLoadingCheck(false);
            return;
        }

        try {
            const res = await fetch(`/api/getPrescription?id=${encodeURIComponent(checkId)}`, {
                method: "GET",
            });

            if (!res.ok) throw new Error("Failed to retrieve prescription details.");

            const data = await res.json();

            if (!data.isValid) {
                toast.error("The prescription is not valid.");
                setPrescriptionDetail(null);
                return;
            }

            toast.success("Valid prescription retrieved successfully.");
            setPrescriptionDetail(data); // Open the modal
        } catch (error) {
            toast.error(`Error while checking prescription: ${(error as Error).message}`);
        } finally {
            setLoadingCheck(false);
        }
    }


    return (
        <DoctorLayout>
            <h1 className="text-3xl font-bold mb-6 text-transparent bg-clip-text bg-gradient-to-r from-purple-400 via-pink-500 to-red-500">
                Recipe Menu
            </h1>
            <div className="flex gap-8">
                <div className="flex-1 basis-8/12 bg-zinc-900 p-6 rounded-xl shadow-lg bg-gradient-to-br from-gray-800 via-zinc-900 to-black">
                    <PrescriptionForm />
                </div>

                <div className="flex-1 basis-4/12 bg-zinc-800 rounded-xl shadow-lg p-6 bg-gradient-to-br from-zinc-900 via-zinc-800 to-zinc-900">
                    <VerifyPrescription
                        verifyId={verifyId}
                        setVerifyId={setVerifyId}
                        onVerify={handleVerify}
                        loading={loadingVerify}
                    />
                    <CheckPrescription
                        checkId={checkId}
                        setCheckId={setCheckId}
                        onCheck={handleCheck}
                        loading={loadingCheck}
                    />
                </div>
            </div>
            {prescriptionDetail && (
                <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
                    <div className="bg-gradient-to-br from-zinc-800 via-zinc-700 to-zinc-900 text-white rounded-xl shadow-2xl w-full max-w-lg p-6 relative">
                        <button
                            onClick={() => setPrescriptionDetail(null)}
                            className="absolute top-2 right-2 text-zinc-400 hover:text-white text-xl font-bold"
                        >
                            ×
                        </button>
                        <h3 className="text-2xl font-bold mb-4 text-transparent bg-clip-text bg-gradient-to-r from-green-400 via-blue-400 to-purple-500">
                            Prescription Details
                        </h3>
                        <div className="space-y-2 text-sm">
                            <p>
                                <span className="font-semibold text-zinc-300">Doctor Address:</span>{" "}
                                {prescriptionDetail.doctor}
                            </p>
                            <p>
                                <span className="font-semibold text-zinc-300">Patient Address:</span>{" "}
                                {prescriptionDetail.patient}
                            </p>
                            <p>
                                <span className="font-semibold text-zinc-300">Medication CID:</span>{" "}
                                {prescriptionDetail.medication}
                            </p>
                            <p>
                                <span className="font-semibold text-zinc-300">Timestamp:</span>{" "}
                                {new Date(Number(prescriptionDetail.timestamp) * 1000).toLocaleString()}
                            </p>
                            <p>
                                <span className="font-semibold text-zinc-300">Validity:</span>{" "}
                                {prescriptionDetail.isValid ? "Valid" : "Invalid"}
                            </p>
                        </div>
                    </div>
                </div>
            )}
        </DoctorLayout>
    );
}
