# services/indexer/Dockerfile
FROM node:20-alpine
WORKDIR /app

# Install production deps from the repo-root manifests.
#
# `viem` and `tsx` are declared in package.json `dependencies` (not devDeps), so
# they survive `--omit=dev`; `pg` is too. `--legacy-peer-deps` is REQUIRED here:
# the dev-only `hardhat-gas-reporter@2` conflicts with the `^1.0.8` peer that the
# dev-only `@nomicfoundation/hardhat-toolbox-viem` declares, and `npm ci`
# validates the FULL tree (incl. dev) before pruning, so a plain `npm ci` aborts
# on that peer conflict even though neither package ends up in the prod image.
COPY package*.json ./
RUN npm ci --omit=dev --legacy-peer-deps

# Copy the indexer service source.
COPY services/indexer/ ./services/indexer/

# Run the TS entrypoint with tsx. tsx is a standalone esbuild-based runner that
# transpiles+executes TypeScript directly and resolves ESM/CJS transparently, so
# it does NOT depend on the root tsconfig's `"module": "commonjs"` (which would
# break under a raw `ts-node/esm` loader). No tsconfig override is needed.
CMD ["node", "node_modules/.bin/tsx", "services/indexer/index.ts"]
