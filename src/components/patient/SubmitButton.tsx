import React from 'react';

type SubmitButtonProps = {
    label: string;
};

const SubmitButton: React.FC<SubmitButtonProps> = ({ label }) => (
    <button
        type="submit"
        className="w-full bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 text-white font-semibold px-5 py-3 rounded-lg shadow-lg hover:from-indigo-700 hover:via-purple-700 hover:to-pink-700 transition"
    >
        {label}
    </button>
);

export default SubmitButton;
