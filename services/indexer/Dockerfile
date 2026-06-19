# services/indexer/Dockerfile
FROM node:20-alpine
WORKDIR /app

# Install production deps from the repo root manifests (pg, viem are deps).
COPY package*.json ./
RUN npm ci --omit=dev

# Copy the indexer service + shared libs it imports.
COPY services/indexer/ ./services/indexer/
COPY lib/ ./lib/

# Run the TS entrypoint via ts-node's ESM loader.
CMD ["node", "--loader", "ts-node/esm", "services/indexer/index.ts"]
