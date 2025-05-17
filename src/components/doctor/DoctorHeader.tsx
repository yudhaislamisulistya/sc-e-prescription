import React from 'react';
import Link from 'next/link';

type DoctorHeaderProps = {
    doctorName: string;
    onLogout: () => void;
};

const DoctorHeader: React.FC<DoctorHeaderProps> = ({ doctorName, onLogout }) => {
    return (
        <header className="w-full flex items-center justify-between px-6 py-4 shadow-md bg-zinc-900 text-zinc-100">
            {/* Kiri: Nama Dokter dengan gradient */}
            <div className="font-semibold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 via-pink-500 to-red-500">
                {doctorName}
            </div>

            {/* Tengah: Menu dengan rounded max dan warna muda */}
            <nav className="flex gap-4">
                <Link
                    href="/doctor/create-recipe"
                    className="px-4 py-2 rounded-full bg-zinc-800 text-zinc-200 hover:bg-zinc-700 hover:text-white transition"
                >
                    Recipe
                </Link>
                <Link
                    href="/doctor/create-patient"
                    className="px-4 py-2 rounded-full bg-zinc-800 text-zinc-200 hover:bg-zinc-700 hover:text-white transition"
                >
                    Patient
                </Link>
            </nav>


            {/* Kanan: Logout */}
            <button
                onClick={onLogout}
                className="px-6 py-2 rounded-full bg-gradient-to-r from-red-600 via-red-500 to-pink-500 text-white shadow-md hover:from-red-700 hover:via-red-600 hover:to-pink-600 transition-all duration-300 font-semibold"
            >
                Logout
            </button>
        </header>
    );
};

export default DoctorHeader;
