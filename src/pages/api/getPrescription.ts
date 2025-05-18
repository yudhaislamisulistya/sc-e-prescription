/* eslint-disable @typescript-eslint/no-explicit-any */
import type { NextApiRequest, NextApiResponse } from "next";
import { getPrescription } from "../../../lib/viemClient";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    const { id } = req.query;

    if (req.method !== "GET") {
        return res.status(405).json({ error: "Method not allowed" });
    }

    try {
        console.log("ID dari query:", id);
        const prescription = await getPrescription(id as `0x${string}`);
        console.log("Resep yang didapat:", prescription);

        // Ubah BigInt ke string agar bisa dikembalikan ke frontend
        const serialized = {
            ...prescription,
            timestamp: prescription.timestamp.toString(),
        };

        return res.status(200).json(serialized);
    } catch (error: any) {
        console.error("Error saat mendapatkan resep:", error);
        return res.status(500).json({ error: error.message || "Terjadi kesalahan" });
    }
}
