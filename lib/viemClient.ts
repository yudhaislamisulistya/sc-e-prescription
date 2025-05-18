/* eslint-disable @typescript-eslint/no-explicit-any */
import { config as dotenvConfig } from "dotenv";
import { createWalletClient, http } from "viem";
import { publicClient } from "./publicClient";
import { sepolia } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import abi from "../artifacts/contracts/EPrescription.sol/EPrescription.json";
import { decodeEventLog, getEventSelector } from "viem";

dotenvConfig();

const contractAddress = process.env.CONTRACT_ADDRESS as `0x${string}`;
const privateKey = process.env.PRIVATE_KEY as `0x${string}`;
const rpcUrl = process.env.SEPOLIA_URL!;

const account = privateKeyToAccount(privateKey);

export const walletClient = createWalletClient({
    account,
    chain: sepolia,
    transport: http(rpcUrl),
});

export async function writePrescription(
    patient: string,
    medication: string
): Promise<{ id: `0x${string}`; tx: `0x${string}`; doctorAddress: `0x${string}`; patientAddress: `0x${string}` }> {
    const txHash = await walletClient.writeContract({
        address: contractAddress,
        abi: abi.abi,
        functionName: "createPrescription",
        args: [patient, medication],
    });

    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });

    const eventSelector = getEventSelector("PrescriptionCreated(bytes32,address,address)");
    const log = receipt.logs.find((l) => l.topics[0] === eventSelector);
    if (!log) throw new Error("Event PrescriptionCreated tidak ditemukan");

    const decoded = decodeEventLog({
        abi: abi.abi,
        data: log.data,
        topics: log.topics,
        eventName: "PrescriptionCreated",
    });

    // args adalah array, id biasanya parameter pertama
    const id = (decoded.args as any).id as `0x${string}`;
    const doctorAddress = (decoded.args as any).doctor as `0x${string}`;
    const patientAddress = (decoded.args as any).patient as `0x${string}`;
    if (!id) throw new Error("ID dari event tidak ditemukan");

    return {
        id,
        tx: txHash,
        doctorAddress,
        patientAddress,
    };
}

export async function getPrescription(
    id: `0x${string}`
): Promise<{
    doctor: `0x${string}`;
    patient: `0x${string}`;
    medication: string;
    timestamp: bigint;
    isValid: boolean;
}> {
    const result = await publicClient.readContract({
        address: contractAddress,
        abi: abi.abi,
        functionName: "prescriptions",
        args: [id],
    });

    // result biasanya berupa tuple sesuai definisi kontrak
    // Contoh mapping: (address doctor, address patient, string medication, uint256 timestamp, bool isValid)
    // Sesuaikan dengan output sebenarnya dari kontrak
    const [doctor, patient, medication, timestamp, isValid] = result as [
        `0x${string}`,
        `0x${string}`,
        string,
        bigint,
        boolean
    ];

    return { doctor, patient, medication, timestamp, isValid };
}

export async function verifyPrescription(
    id: `0x${string}`
): Promise<boolean> {
    const isValid = await publicClient.readContract({
        address: contractAddress,
        abi: abi.abi,
        functionName: "verifyPrescription",
        args: [id],
    });

    return isValid as boolean;
}



