# TheTextApp API — production image (server + shared packages only)
FROM node:22-bookworm-slim AS deps
WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/server/package.json ./apps/server/
COPY packages/api/package.json ./packages/api/
COPY packages/db/package.json ./packages/db/
COPY packages/moq/package.json ./packages/moq/

RUN mkdir -p apps/mobile && printf '%s\n' '{"name":"mobile","version":"1.0.0","private":true}' > apps/mobile/package.json

RUN npm install --workspace=@thetextapp/server --include-workspace-root --omit=dev --ignore-scripts

FROM oven/bun:1.2 AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8080

COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY apps/server ./apps/server
COPY packages/api ./packages/api
COPY packages/db ./packages/db
COPY packages/moq ./packages/moq

WORKDIR /app/apps/server
EXPOSE 8080

CMD ["bun", "run", "src/index.ts"]
