// pages/doctor/create-patient.tsx
import React, { useState, useEffect } from "react";
import DoctorLayout from "@/layouts/DoctorLayout";
import PatientForm from "@/components/patient/PatientForm";
import pasienData from "../../../data/pasien_wallets.json";
import CopyButtonWithToast from "@/components/common/CopyButtonWithToast";

type Pasien = {
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

const CreatePatientPage: React.FC = () => {
  const [selectedPatient, setSelectedPatient] = useState<Pasien | null>(null);
  const [patients, setPatients] = useState<Pasien[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filteredPatients, setFilteredPatients] = useState(patients);

  useEffect(() => {
    setPatients(pasienData);
  }, []);
  
  useEffect(() => {
    if (searchTerm.length >= 3) {
      const term = searchTerm.toLowerCase();
      const filtered = patients.filter((p) =>
        p.nama.toLowerCase().includes(term)
      );
      setFilteredPatients(filtered);
    } else {
      setFilteredPatients(patients);
    }
  }, [searchTerm, patients]);





  return (
    <DoctorLayout>
      <h1 className="text-3xl font-bold mb-6 text-transparent bg-clip-text bg-gradient-to-r from-purple-400 via-pink-500 to-red-500">
        Patient Menu
      </h1>

      <div className="flex gap-8">
        {/* Form Section */}
        <div className="flex-1 basis-8/12 bg-zinc-900 p-6 rounded-xl shadow-lg bg-gradient-to-br from-gray-800 via-zinc-900 to-black">
          <PatientForm />
        </div>

        {/* Sidebar Section */}
        <aside className="flex-1 basis-4/12 bg-zinc-800 rounded-xl shadow-lg p-6 bg-gradient-to-br from-zinc-900 via-zinc-800 to-zinc-900">
          <h2 className="text-xl font-semibold mb-4 text-zinc-300">Patient List</h2>

          {/* Search Input */}
          <div className="mb-6">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by name..."
              className="w-full px-4 py-2 rounded-lg bg-zinc-700 text-white placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>

          {/* Patient List */}
          <ul className="space-y-3">
            {filteredPatients.map((patient) => (
              <li
                key={patient.id}
                onClick={() => setSelectedPatient(patient)}
                className="p-4 rounded-xl bg-zinc-700 hover:bg-gradient-to-r hover:from-purple-600 hover:to-pink-500 hover:text-white cursor-pointer transition-all duration-200 shadow-md"
              >
                <p className="font-semibold text-lg text-transparent bg-clip-text bg-gradient-to-r from-purple-300 via-pink-400 to-red-400">
                  {patient.nama}
                </p>
                <div className="flex items-center justify-between mt-1 text-sm text-zinc-300">
                  <span className="truncate max-w-[70%]">
                    Wallet Address: {patient.wallet.address}
                  </span>
                  <CopyButtonWithToast valueToCopy={patient.wallet.address} />
                </div>
              </li>
            ))}
          </ul>
        </aside>
      </div>
      {/* Modal */}
      {selectedPatient && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-gradient-to-br from-zinc-800 via-zinc-700 to-zinc-900 text-white rounded-xl shadow-2xl w-full max-w-lg p-6 relative">
            <button
              onClick={() => setSelectedPatient(null)}
              className="absolute top-2 right-2 text-zinc-400 hover:text-white text-xl font-bold"
            >
              ×
            </button>
            <h3 className="text-2xl font-bold mb-4 text-transparent bg-clip-text bg-gradient-to-r from-pink-400 via-purple-400 to-blue-500">
              Patient Details
            </h3>
            <div className="space-y-2 text-sm">
              <p>
                <span className="font-semibold text-zinc-300">Name:</span>{" "}
                {selectedPatient.nama}
              </p>
              <p>
                <span className="font-semibold text-zinc-300">Email:</span>{" "}
                {selectedPatient.email}
              </p>
              <p>
                <span className="font-semibold text-zinc-300">
                  Date of Birth:
                </span>{" "}
                {selectedPatient.tanggal_lahir}
              </p>
              <p>
                <span className="font-semibold text-zinc-300">NIK:</span>{" "}
                {selectedPatient.nik}
              </p>
              <p>
                <span className="font-semibold text-zinc-300">Phone:</span>{" "}
                {selectedPatient.no_hp}
              </p>
              <p>
                <span className="font-semibold text-zinc-300">Address:</span>{" "}
                {selectedPatient.alamat}
              </p>

              {/* Wallet Address with Copy Button */}
              <div className="flex items-center space-x-2">
                <span className="font-semibold text-zinc-300">
                  Wallet Address:
                </span>
                <span className="truncate">
                  {selectedPatient.wallet.address}
                </span>
                <CopyButtonWithToast valueToCopy={selectedPatient.wallet.address} />
              </div>

              {/* Masked Private Key */}
              <p>
                <span className="font-semibold text-zinc-300">
                  Private Key:
                </span>{" "}
                {selectedPatient.wallet.privateKey.slice(0, 6)}...
                {selectedPatient.wallet.privateKey.slice(-4)}
              </p>
            </div>
          </div>
        </div>
      )}
    </DoctorLayout>
  );
};

export default CreatePatientPage;
