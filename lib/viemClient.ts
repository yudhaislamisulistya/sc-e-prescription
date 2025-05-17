import { config as dotenvConfig } from "dotenv";
import { createWalletClient, http } from "viem";
import { sepolia } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import abi from "../artifacts/contracts/EPrescription.sol/EPrescription.json";

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


export async function writePrescription(patient: string, medication: string) {
    return walletClient.writeContract({
        address: contractAddress,
        abi: abi.abi,
        functionName: "createPrescription",
        args: [patient, medication],
    });
}
