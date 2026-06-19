import type { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox-viem";
import "@nomiclabs/hardhat-ethers";
import "hardhat-gas-reporter";
import { config as dotenvConfig } from "dotenv";

dotenvConfig();

const { SEPOLIA_URL, PRIVATE_KEY, BESU_RPC_URL, DEPLOYER_PRIVATE_KEY } = process.env;

// Normalize a private key from env so a malformed value never crashes config load.
const norm = (k?: string): `0x${string}` | undefined => {
  if (!k) return undefined;
  const v = k.startsWith("0x") ? k : `0x${k}`;
  // A valid secp256k1 key is 32 bytes => "0x" + 64 hex chars.
  return /^0x[0-9a-fA-F]{64}$/.test(v) ? (v as `0x${string}`) : undefined;
};

const sepoliaKey = norm(PRIVATE_KEY);
const besuKey = norm(DEPLOYER_PRIVATE_KEY);

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.28",
    settings: { optimizer: { enabled: true, runs: 200 } },
  },
  networks: {
    hardhat: {},
    sepolia: {
      url: SEPOLIA_URL || "",
      accounts: sepoliaKey ? [sepoliaKey] : [],
    },
    besu: {
      url: BESU_RPC_URL || "http://localhost:8545",
      accounts: besuKey ? [besuKey] : [],
      chainId: 1337,
      gasPrice: 0,
    },
  },
  gasReporter: {
    enabled: process.env.REPORT_GAS === "true",
    currency: "USD",
    noColors: true,
    outputFile: "gas-report.txt",
  },
};

export default config;
