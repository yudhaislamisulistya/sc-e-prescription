import React from 'react';

type PatientInputProps = {
    label: string;
    name: string;
    type?: string;
    value: string;
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
    disabled?: boolean;
};

const PatientInput: React.FC<PatientInputProps> = ({ label, name, type = 'text', value, onChange, disabled }) => (
    <div className="mb-6">
        <label htmlFor={name} className="block font-semibold mb-2 text-gray-200">
            {label}
        </label>
        <input
            type={type}
            id={name}
            name={name}
            value={value}
            onChange={onChange}
            required
            placeholder={`Enter ${label}`}
            disabled={disabled}
            className="w-full bg-gradient-to-r from-gray-900 via-zinc-800 to-gray-900 text-white border border-zinc-600 rounded-lg px-4 py-3 focus:outline-none focus:ring-4 focus:ring-indigo-500 transition"
        />
    </div>
);

export default PatientInput;
