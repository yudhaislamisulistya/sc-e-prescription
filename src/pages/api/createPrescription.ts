import type { NextApiRequest, NextApiResponse } from "next";
// import { uploadToIPFS } from "../../../lib/ipfs";
import { writePrescription } from "../../../lib/viemClient";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== "POST") return res.status(405).end("Method not allowed");

    const { patient, medication } = req.body;

    console.log("Received request to create prescription");
    console.log("Patient:", patient);
    console.log("Medication:", medication);

    if (!patient || !medication) {
        return res.status(400).json({ success: false, error: "Missing parameters" });
    }

    try {
        // Upload resep (medication) ke IPFS, dapatkan CID
        // const cid = await uploadToIPFS(medication);
        // console.log("Uploaded to IPFS, CID:", cid);

        // Tulis CID di blockchain bersama alamat pasien
        const tx = await writePrescription(patient, medication);
        console.log("Transaction hash:", tx);

        res.status(200).json({ success: true, tx, medication });
    } catch (error) {
        console.error("Error creating prescription:", error);
        res.status(500).json({ success: false, error: (error as Error).message });
    }
}
