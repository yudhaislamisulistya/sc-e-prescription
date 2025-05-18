/* eslint-disable @typescript-eslint/no-explicit-any */
import type { NextApiRequest, NextApiResponse } from "next";
import { verifyPrescription } from "../../../lib/viemClient";

export default async function handler(
    req: NextApiRequest,
    res: NextApiResponse
) {
    if (req.method !== "GET") {
        return res.status(405).json({ error: "Method not allowed, gunakan GET" });
    }

    const { id } = req.query;
    console.log("ID dari query:", id);
    if (!id || typeof id !== "string") {
        return res.status(400).json({ error: "Parameter id wajib diisi" });
    }

    try {
        const isValid = await verifyPrescription(id as `0x${string}`);
        return res.status(200).json({ isValid });
    } catch (error: any) {
        return res.status(500).json({ error: error.message || "Terjadi kesalahan" });
    }
}
