FROM node:24-slim AS build

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY tsconfig.json vite.config.ts ./
COPY apps ./apps
COPY packages ./packages
COPY Overview.md ./Overview.md

RUN npm run build
RUN npm prune --omit=dev

FROM node:24-slim AS runtime

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8080

COPY --from=build /app/package.json ./package.json
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/Overview.md ./Overview.md

EXPOSE 8080

CMD ["node", "dist/apps/api/src/server.js"]
