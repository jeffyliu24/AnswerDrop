ARG NODE_IMAGE=node:26-alpine
FROM ${NODE_IMAGE} AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts --no-audit --no-fund
COPY tsconfig.json ./
COPY types ./types
COPY src ./src
COPY web ./web
COPY tests ./tests
COPY scripts ./scripts
RUN npm run build && npm prune --omit=dev --ignore-scripts --no-audit --no-fund

FROM ${NODE_IMAGE}
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000 ANSWERDROP_DATA_DIR=/app/data ANSWERDROP_BASE_URL=http://localhost:3000
WORKDIR /app
COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY examples ./examples
RUN mkdir -p /app/data && chown node:node /app/data
USER node
EXPOSE 3000
VOLUME ["/app/data"]
CMD ["node", "dist/src/server/main.js"]
