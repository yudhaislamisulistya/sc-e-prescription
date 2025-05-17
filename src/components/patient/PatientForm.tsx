import React, { useState } from 'react';
import PatientInput from './PatientInput';
import SubmitButton from './SubmitButton';
import LoadingSpinner from '../common/LoadingSpinner';

type PatientFormProps = {
  reloadPatients: () => void;
};


type PatientData = {
    nama: string;
    email: string;
    tanggal_lahir: string;
    nik: string;
    no_hp: string;
    alamat: string;
};

const defaultData: PatientData = {
    nama: '',
    email: '',
    tanggal_lahir: '',
    nik: '',
    no_hp: '',
    alamat: ''
};

const PatientForm: React.FC<PatientFormProps> = ({ reloadPatients }) => {
    const [formData, setFormData] = useState<PatientData>(defaultData);
    const [loading, setLoading] = useState(false);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        setFormData((prev) => ({ ...prev, [name]: value }));
    };

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        console.log('Submitted Data:', formData);
        setLoading(true);
        try {
            const res = await fetch("/api/createEWallet", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    ...formData,
                }),
            });

            const data = await res.json();

            if (!res.ok) throw new Error(data.error || "Terjadi kesalahan");

            alert(`Wallet Address: ${data.address}\nID Pasien: ${data.id}`);
        } catch (error) {
            console.error(error);
            alert("Terjadi kesalahan saat menyimpan data pasien");
        }
        setLoading(false);
        reloadPatients();
    };

    return (
        <form onSubmit={handleSubmit} className="mx-auto p-6 shadow-lg rounded-lg">
            <h2 className="text-2xl font-bold mb-6">Add New Patient</h2>
            <PatientInput label="Name" name="nama" value={formData.nama} onChange={handleChange} disabled={loading} />
            <PatientInput label="Email" name="email" type="email" value={formData.email} onChange={handleChange} disabled={loading} />
            <PatientInput label="Date of Birth" name="tanggal_lahir" type="date" value={formData.tanggal_lahir} onChange={handleChange} disabled={loading} />
            <PatientInput label="NIK" name="nik" value={formData.nik} onChange={handleChange} disabled={loading} />
            <PatientInput label="Phone Number" name="no_hp" value={formData.no_hp} onChange={handleChange} disabled={loading} />
            <PatientInput label="Address" name="alamat" value={formData.alamat} onChange={handleChange} disabled={loading} />
            {loading ? (
                <LoadingSpinner />
            ) : (
                <SubmitButton label="Save Patient Data" />
            )}
        </form>
    );

};

export default PatientForm;
