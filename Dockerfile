FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app
COPY --from=build /app/dist ./dist
COPY server ./server
COPY src/lib/catalog.ts src/lib/nodeImages.ts ./src/lib/
COPY package.json ./
COPY --chown=node:node public/catalog.json ./catalog/catalog.json
ENV CATALOG_PATH=/app/catalog/catalog.json PORT=8080
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s CMD wget -q -O /dev/null http://127.0.0.1:8080/ || exit 1
CMD ["node", "--experimental-strip-types", "server/index.mjs"]
