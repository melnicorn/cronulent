# Cronulent

![Cronulent](etc/cronulent.png)

A self-hosted cron task manager. Schedule and run shell scripts, Python (via uv), and Node.js (via Volta) tasks on a cron schedule, with a web UI to manage everything.

## What's inside

| Package | Description |
|---|---|
| `apps/scheduler` | Node.js backend — tRPC API, cron scheduling, task execution |
| `apps/web` | Next.js frontend — task management UI |
| `packages/common` | Shared TypeScript types, Zod schemas, tRPC router |

## Running with Docker (recommended)

**Prerequisites:** Docker

**Start both services:**

```bash
docker compose up
```

On first run, open http://localhost:3000 and you'll be prompted to create an admin password. Credentials are stored in the persistent data volume — no setup script needed.

- Web UI: http://localhost:3000
- Scheduler API: http://localhost:3001

Task data is persisted in a Docker volume (`scheduler-data`).

## Running locally

**Prerequisites:** Node.js 22.6+, pnpm, [Volta](https://volta.sh), [uv](https://docs.astral.sh/uv/)

**Install dependencies:**

```bash
pnpm install
```

Start the scheduler and web app, then open http://localhost:3000 — you'll be prompted to create an admin password on first run.

**Start the scheduler:**

```bash
cd apps/scheduler
pnpm dev
```

**Start the web UI** (separate terminal):

```bash
cd apps/web
pnpm dev
```

- Web UI: http://localhost:3000
- Scheduler API: http://localhost:3001

Set `SCHEDULER_URL` in the web app's environment if the scheduler is running somewhere other than `http://localhost:3001`.

## Task types

| Type | Runtime | Command field |
|---|---|---|
| Shell | `/bin/sh` | Script content |
| Python (uv) | `uv run` | Script content |
| Node.js (Volta) | `volta run node` | Script content |
| Executable | Direct | Path to binary |

Shell, Python, and Node.js tasks are written as inline scripts in the editor. Each task gets its own isolated directory under `data/scripts/{taskId}/` with its own environment. Environment variables can be set per-task and are merged with the system environment at runtime.

If a task's cron fires while a previous execution is still running, the new execution is skipped and recorded with a `skipped` status.

## Architecture

```
apps/web (Next.js)
  └── server actions → tRPC client → apps/scheduler

apps/scheduler (Node.js)
  ├── tRPC HTTP server (@trpc/server/adapters/standalone)
  ├── node-cron scheduler
  ├── task executor (subprocess per execution)
  ├── environment manager (uv / volta setup per task)
  └── JSON5 file storage (data/tasks.json5, data/executions.json5)

packages/common
  ├── entities & Zod schemas
  ├── repository interfaces
  ├── tRPC router (auth, tasks, executions)
  └── AppContext interface
```

Authentication is token-based (JWT, HS256). The web app stores the token in an httpOnly cookie and sends it as a `Bearer` token on each tRPC request.
