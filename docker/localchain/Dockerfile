# The whole local chain in one container: Solana test validator with MagicBlock's delegation program (mb-test-validator),
# the MagicBlock Ephemeral Rollup, and MagicBlock's VRF oracle, with the Clashy program deployed by chain/scripts/localnet.sh.
# x86_64 Linux only: Anza publishes no Linux arm64 validator build (on an Apple Silicon Mac run localnet.sh natively).
# The program binary and keys are mounted at run time (docker-compose.yml), never copied in.
FROM --platform=linux/amd64 node:24-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends curl bzip2 ca-certificates procps && rm -rf /var/lib/apt/lists/*
ARG AGAVE_VERSION=v3.1.11
RUN curl -sSfL "https://github.com/anza-xyz/agave/releases/download/${AGAVE_VERSION}/solana-release-x86_64-unknown-linux-gnu.tar.bz2" | tar -xj -C /opt
ENV PATH=/opt/solana-release/bin:$PATH NODE_NO_WARNINGS=1
ARG MAGICBLOCK_VERSION=0.14.10
RUN npm i -g "@magicblock-labs/ephemeral-validator@${MAGICBLOCK_VERSION}" && npm cache clean --force
WORKDIR /app/chain
COPY chain/package.json chain/package-lock.json ./
RUN npm ci --legacy-peer-deps --no-audit --no-fund && npm cache clean --force
COPY chain/scripts ./scripts
COPY chain/tests/common.ts ./tests/common.ts
COPY chain/target/idl ./target/idl
COPY chain/target/types ./target/types
COPY docker/localchain/entry.sh /entry.sh
ENV CLASHY_BIND=0.0.0.0
EXPOSE 8999 9000 7799 7800
CMD ["bash", "/entry.sh"]
