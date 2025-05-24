"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { Geist, Geist_Mono } from "next/font/google";
import { useState } from "react";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export default function Home() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);

  const handleEnterDoctor = async () => {
    setIsLoading(true);
    // Bisa tambahkan delay kalau ingin melihat loading
    await new Promise((resolve) => setTimeout(resolve, 1000));
    router.push("/doctor/create-recipe");
  };

  return (
    <div
      className={`${geistSans.className} ${geistMono.className} grid grid-rows-[20px_1fr_20px] items-center justify-items-center min-h-screen p-8 pb-20 gap-16 sm:p-20 font-[family-name:var(--font-geist-sans)]`}
    >
      <main className="flex flex-col gap-[32px] row-start-2 items-center sm:items-start">
        <Image
          className="dark:invert"
          src="/next.svg"
          alt="Next.js logo"
          width={180}
          height={38}
          priority
        />

        {/* Tombol dengan loading */}
        <button
          onClick={handleEnterDoctor}
          disabled={isLoading}
          className={`relative flex items-center justify-center bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 text-white rounded-full px-6 py-3 text-sm font-medium shadow-md transition-all ${
            isLoading ? "opacity-70 cursor-not-allowed" : "hover:brightness-110"
          }`}
        >
          {isLoading ? (
            <div className="flex items-center gap-2">
              <span className="loader w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
              Loading...
            </div>
          ) : (
            "Enter to Doctor"
          )}
        </button>

        <ol className="list-inside list-decimal text-sm/6 text-center sm:text-left font-[family-name:var(--font-geist-mono)]">
          <li className="mb-2 tracking-[-.01em]">
            Get started by editing{" "}
            <code className="bg-black/[.05] dark:bg-white/[.06] px-1 py-0.5 rounded font-[family-name:var(--font-geist-mono)] font-semibold">
              src/pages/index.tsx
            </code>
            .
          </li>
          <li className="tracking-[-.01em]">
            Save and see your changes instantly.
          </li>
        </ol>
      </main>

      <footer className="row-start-3 text-sm text-gray-500 dark:text-gray-400">
        Developed by YIS
      </footer>
    </div>
  );
}