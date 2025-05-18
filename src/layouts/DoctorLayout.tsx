import React, { ReactNode } from 'react';
import DoctorHeader from '@/components/doctor/DoctorHeader';

type DoctorLayoutProps = {
    children: ReactNode;
};

const DoctorFooter: React.FC = () => {
    return (
        <footer className="mt-auto py-4 text-center text-white
            bg-gradient-to-r from-purple-600 via-pink-600 to-red-600
            shadow-inner
            ">
            <p className="text-sm">&copy; {new Date().getFullYear()} EPrescription. Made with ❤️ and ☕ by YIS</p>
        </footer>
    );
};

const DoctorLayout: React.FC<DoctorLayoutProps> = ({ children }) => {
    const handleLogout = () => {
        console.log('Logout doctor...');
    };

    return (
        <div className="min-h-screen flex flex-col">
            <DoctorHeader doctorName="Dr. Yudha Islami Sulistya" onLogout={handleLogout} />
            <main className="flex-grow p-6">{children}</main>
            <DoctorFooter />
        </div>
    );
};

export default DoctorLayout;
