FROM node:20.18.0-alpine AS builder

WORKDIR /app

# NEXT_PUBLIC_* are inlined into the browser bundle at build time, so they must
# be present BEFORE `npm run build`. Compose passes them as build args (see the
# nextjs-app `build.args` in docker-compose.yml); they come from .env.
ARG NEXT_PUBLIC_CHAIN_ID=1337
ARG NEXT_PUBLIC_RPC_URL
ARG NEXT_PUBLIC_IDENTITY_REGISTRY_ADDRESS
ARG NEXT_PUBLIC_PRESCRIPTION_REGISTRY_ADDRESS
ARG NEXT_PUBLIC_KEY_ACCESS_REGISTRY_ADDRESS
ENV NEXT_PUBLIC_CHAIN_ID=$NEXT_PUBLIC_CHAIN_ID \
    NEXT_PUBLIC_RPC_URL=$NEXT_PUBLIC_RPC_URL \
    NEXT_PUBLIC_IDENTITY_REGISTRY_ADDRESS=$NEXT_PUBLIC_IDENTITY_REGISTRY_ADDRESS \
    NEXT_PUBLIC_PRESCRIPTION_REGISTRY_ADDRESS=$NEXT_PUBLIC_PRESCRIPTION_REGISTRY_ADDRESS \
    NEXT_PUBLIC_KEY_ACCESS_REGISTRY_ADDRESS=$NEXT_PUBLIC_KEY_ACCESS_REGISTRY_ADDRESS

COPY package*.json ./

RUN npm install

COPY . .

RUN npm run build

# -----------------------------------

FROM node:20.18.0-alpine AS runner

WORKDIR /app

COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/public ./public
COPY --from=builder /app/package.json ./package.json

EXPOSE 3000

CMD ["npm", "start"]
