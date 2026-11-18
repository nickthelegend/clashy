# Clashy social server: no npm dependencies, Node runs the TypeScript directly. ~60 MB image.
FROM node:24-alpine
WORKDIR /srv
ENV NODE_ENV=production PORT=8791 CLASHY_DATA=/data NODE_NO_WARNINGS=1
COPY server/package.json ./
COPY server/src ./src
RUN mkdir -p /data && chown node:node /data
USER node
EXPOSE 8791
VOLUME ["/data"]
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:8791/health || exit 1
CMD ["node", "src/index.ts"]
