import { createPublicClient, http } from "viem";
import { sepolia } from "viem/chains";

export const publicClient = createPublicClient({
    chain: sepolia,
    transport: http(process.env.SEPOLIA_URL!), // Sesuaikan dengan URL kamu
});
