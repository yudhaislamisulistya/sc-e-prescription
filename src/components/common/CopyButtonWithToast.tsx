'use client';
import React, { useState } from 'react';

interface CopyButtonWithToastProps {
    valueToCopy: string;
}

const CopyButtonWithToast: React.FC<CopyButtonWithToastProps> = ({ valueToCopy }) => {
    const [showToast, setShowToast] = useState(false);

    const handleCopy = (e: React.MouseEvent) => {
        e.stopPropagation();
        navigator.clipboard.writeText(valueToCopy);
        setShowToast(true);
        setTimeout(() => setShowToast(false), 2000); // hide after 2 seconds
    };

    return (
        <>
            <button
                onClick={handleCopy}
                className="text-xs bg-zinc-600 hover:bg-zinc-500 px-2 py-1 rounded text-white"
            >
                Copy
            </button>

            {showToast && (
                <div className="fixed bottom-2 right-2 z-50 bg-zinc-800 text-white px-4 py-2 rounded-lg shadow-lg animate-fadeIn">
                    Copied to clipboard!
                </div>
            )}

            <style jsx>{`
                @keyframes fadeIn {
                0% { opacity: 0; transform: translateY(10px); }
                100% { opacity: 1; transform: translateY(0); }
                }
                .animate-fadeIn {
                animation: fadeIn 0.3s ease-out;
                }
            `}</style>
        </>
    );
};

export default CopyButtonWithToast;
