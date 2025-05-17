import { ethers } from "ethers";
import fs from "fs";
import path from "path";
import { NextApiRequest, NextApiResponse } from "next";

type Pasien = {
    id: string;
    nama: string;
    email: string;
    tanggal_lahir: string;
    nik: string;
    no_hp: string;
    alamat: string;
    wallet: {
        address: string;
        privateKey: string;
    };
    created_at: string;
};

const DATA_FILE = path.resolve(process.cwd(), "data", "pasien_wallets.json");

export default function handler(req: NextApiRequest, res: NextApiResponse) {
    console.log("Received request to create wallet for pasien");
    console.log("Request body:", req.body);
    console.log("Request method:", req.method);
    if (req.method !== "POST") {
        return res.status(405).json({ message: "Method Not Allowed" });
    }

    const { nama, email, tanggal_lahir, nik, no_hp, alamat } = req.body;

    if (!nama || !email || !tanggal_lahir || !nik || !no_hp || !alamat) {
        return res.status(400).json({ message: "Data pasien tidak lengkap" });
    }

    const wallet = ethers.Wallet.createRandom();

    const newPasien: Pasien = {
        id: `pasien-${Date.now()}`,
        nama,
        email,
        tanggal_lahir,
        nik,
        no_hp,
        alamat,
        wallet: {
            address: wallet.address,
            privateKey: wallet.privateKey, // ⚠️ JANGAN kirim ke frontend
        },
        created_at: new Date().toISOString(),
    };

    let existing: Pasien[] = [];
    if (fs.existsSync(DATA_FILE)) {
        const raw = fs.readFileSync(DATA_FILE, "utf-8");
        existing = JSON.parse(raw);
    }

    existing.push(newPasien);

    fs.writeFileSync(DATA_FILE, JSON.stringify(existing, null, 2));

    return res.status(201).json({
        message: "Wallet pasien berhasil dibuat",
        address: newPasien.wallet.address,
        id: newPasien.id,
    });
}
