FROM node:22-slim

RUN apt-get update && apt-get install -y curl python3 bash libatomic1 && rm -rf /var/lib/apt/lists/*

# Install uv
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

# Install Volta
ENV VOLTA_HOME=/root/.volta
ENV PATH=$VOLTA_HOME/bin:$PATH
RUN curl https://get.volta.sh | bash
# Pinned to match package.json "packageManager" — an unpinned install picks up
# new pnpm majors between builds (pnpm 12 broke the image this way).
RUN volta install node@lts pnpm@11.1.1

WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/ packages/
COPY apps/scheduler/ apps/scheduler/

RUN pnpm install --frozen-lockfile --filter scheduler...

WORKDIR /app/apps/scheduler

EXPOSE 3001

CMD ["pnpm", "start"]
