import PrescriptionForm from "@/components/prescription/PrescriptionForm";
import DoctorLayout from '@/layouts/DoctorLayout';

export default function CreatePrescriptionPage() {
    return (
        <DoctorLayout>
            <h1>Buat Resep Baru</h1>
            <PrescriptionForm />
        </DoctorLayout>
    );
}
