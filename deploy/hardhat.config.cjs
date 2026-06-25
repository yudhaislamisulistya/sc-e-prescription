// deploy/hardhat.config.cjs
//
// Self-contained CommonJS Hardhat config used ONLY to deploy the registries via
// Ignition. It lives in its own directory with its own committed lockfile, so
// the server installs a tiny deterministic dependency tree (`npm ci`) instead of
// resolving the heavy Next.js / web3.storage app tree.
//
// Hardhat v2 refuses Solidity sources outside the project root (HH1007), so
// deploy-contracts.sh syncs the repo-root ./contracts into ./deploy/contracts
// (gitignored, regenerated every run -> single source of truth, no drift) before
// invoking this config. Sources therefore use the default ./contracts path.
require("@nomicfoundation/hardhat-ignition");
require("dotenv").config();

// Accept the deployer key with or without the 0x prefix; ignore anything that
// is not a 32-byte hex string so a malformed value fails loudly at deploy time
// rather than silently using a wrong account.
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
