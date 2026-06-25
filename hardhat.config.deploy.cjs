// hardhat.config.deploy.cjs
//
// Minimal CommonJS Hardhat config used ONLY by deploy-contracts.sh to deploy the
// registries via Ignition. It imports just @nomicfoundation/hardhat-ignition, so
// the deploy needs neither the full hardhat-toolbox-viem (chai/mocha/viem/...)
// nor ts-node/typescript. The .ts config + toolbox remain for local dev/tests.
require("@nomicfoundation/hardhat-ignition");
require("dotenv").config();

const norm = (k) => {
  if (!k) return undefined;
  const v = k.startsWith("0x") ? k : "0x" + k;
  return /^0x[0-9a-fA-F]{64}$/.test(v) ? v : undefined;
};
const besuKey = norm(process.env.DEPLOYER_PRIVATE_KEY);

module.exports = {
  solidity: {
    version: "0.8.28",
    settings: { optimizer: { enabled: true, runs: 200 } },
  },
  networks: {
    besu: {
      url: process.env.BESU_RPC_URL || "http://127.0.0.1:13302",
      accounts: besuKey ? [besuKey] : [],
      chainId: 1337,
      gasPrice: 0,
    },
  },
};
