import type { NextApiRequest, NextApiResponse } from "next";
import { uploadToIPFS } from "../../../lib/ipfs";
import { writePrescription } from "../../../lib/viemClient";
import fs from "fs";
import path from "path";

type TransactionLog = {
    cid: string;
    tx: `0x${string}`;
    id: `0x${string}`;
    doctorAddress: `0x${string}`;
    patientAddress: `0x${string}`;
};

const DATA_FILE = path.resolve(process.cwd(), "public", "data", "recipe_transactions.json");

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== "POST") return res.status(405).end("Method not allowed");

    const { patient, medication } = req.body;

    if (!patient || !medication) {
        return res.status(400).json({ success: false, error: "Missing parameters" });
    }

    try {
        const cid = await uploadToIPFS(medication);
        const { id, tx, doctorAddress, patientAddress } = await writePrescription(patient, cid);
        if (!tx || !id) {
            return res.status(500).json({ success: false, error: "Transaction failed" });
        }
        const newRecord: TransactionLog = {
            cid,
            id,
            tx,
            doctorAddress,
            patientAddress,
        };

        let existing: TransactionLog[] = [];
        if (fs.existsSync(DATA_FILE)) {
            const raw = fs.readFileSync(DATA_FILE, "utf-8");
            existing = JSON.parse(raw);
        }

        existing.push(newRecord);

        fs.writeFileSync(DATA_FILE, JSON.stringify(existing, null, 2));

        res.status(200).json({ success: true, cid, tx, id, doctorAddress, patientAddress });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: (error as Error).message });
    }
}
