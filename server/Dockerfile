# Clashy social server. One runtime dependency (the Postgres driver, used only when CLASHY_DATABASE_URL is set);
# otherwise SQLite on the /data volume. Node runs the TypeScript directly.
FROM node:24-alpine
WORKDIR /srv
ENV NODE_ENV=production PORT=8791 CLASHY_DATA=/data NODE_NO_WARNINGS=1
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force
COPY server/src ./src
RUN mkdir -p /data && chown node:node /data
USER node
EXPOSE 8791
VOLUME ["/data"]
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:8791/health || exit 1
CMD ["node", "src/index.ts"]
