import type { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox-viem";
import "@nomiclabs/hardhat-ethers";
import { config as dotenvConfig } from "dotenv";

dotenvConfig();

const { SEPOLIA_URL, PRIVATE_KEY } = process.env;

const config: HardhatUserConfig = {
  solidity: "0.8.28",
  networks: {
    sepolia: {
      url: SEPOLIA_URL || "", // Menambahkan RPC URL yang didapat dari Chainstack
      accounts: PRIVATE_KEY ? [`0x${PRIVATE_KEY}`] : [], // Private key akun yang digunakan untuk deploy
      
    },
  },
};

export default config;
