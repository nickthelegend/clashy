# Clashy chain services: the sponsor relay (fees, rent, market-data cache, price history) and the price crank.
# One image, two commands (see docker-compose.yml). Keys are never baked in: mount them at /app/chain/.keys or pass
# CLASHY_SPONSOR / CLASHY_AUTHORITY as paths to mounted secret files.
FROM node:24-slim
WORKDIR /app/chain
ENV NODE_NO_WARNINGS=1
COPY chain/package.json chain/package-lock.json ./
RUN npm ci --legacy-peer-deps --no-audit --no-fund && npm cache clean --force
COPY chain/scripts ./scripts
COPY chain/tests/common.ts ./tests/common.ts
COPY chain/target/idl ./target/idl
COPY chain/target/types ./target/types
RUN mkdir -p .localnet .keys && chown -R node:node /app/chain
USER node
EXPOSE 8790
CMD ["npx", "tsx", "scripts/sponsor.ts"]
