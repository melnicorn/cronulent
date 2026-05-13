FROM node:22-slim AS builder

RUN corepack enable pnpm

WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/ packages/
COPY apps/web/ apps/web/

RUN pnpm install --frozen-lockfile --filter web...
RUN pnpm --filter web build

FROM node:22-slim AS runner

RUN corepack enable pnpm

WORKDIR /app
COPY --from=builder /app/package.json /app/pnpm-workspace.yaml /app/pnpm-lock.yaml ./
COPY --from=builder /app/packages/ packages/
COPY --from=builder /app/apps/web/ apps/web/
COPY --from=builder /app/node_modules/ node_modules/

WORKDIR /app/apps/web

EXPOSE 3000

ENV NODE_ENV=production

CMD ["pnpm", "start"]
