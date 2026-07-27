# Cronulent

<table><tr>
<td>A self-hosted cron task manager. Schedule and run shell scripts, Python (via uv), and Node.js (via Volta) tasks on a cron schedule, with a web UI to manage everything. It's fine...it's acceptable...it's Cronulent!</td>
<td><img src="etc/cronulent.png" width="300" /></td>
</tr></table>

## Getting Started

**Prerequisites:** Docker

Download the latest compose file and start:

```bash
curl -LO https://github.com/melnicorn/cronulent/releases/latest/download/docker-compose.prod.yml
docker compose -f docker-compose.prod.yml up
```

On first run, open http://localhost:3000 and you'll be prompted to create an admin password.

- Web UI: http://localhost:3000

### Updating to the latest version

```bash
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up --force-recreate
```

### API keys

The scheduler's API (port 3001) is the same one the web UI uses. To call it from
scripts or the command line, mint an API key:

```bash
docker compose -f docker-compose.prod.yml exec scheduler pnpm keys create "laptop"
```

The key is shown once. `pnpm keys list` and `pnpm keys revoke <id>` manage
existing keys; new and revoked keys take effect immediately, without a restart.

Pass it as a bearer token. Queries are GET with a URL-encoded `input`, mutations
are POST with a JSON body:

```bash
curl -H "Authorization: Bearer $CRONULENT_KEY" http://<host>:3001/tasks.list

curl -X POST http://<host>:3001/tasks.trigger \
  -H "Authorization: Bearer $CRONULENT_KEY" -H "Content-Type: application/json" \
  -d '{"id":"<task-id>"}'
```

A key grants the same full access as a logged-in admin, so treat it like a
password and keep the API off untrusted networks.

## What's inside

| Package | Description |
|---|---|
| `apps/scheduler` | Node.js backend — tRPC API, cron scheduling, task execution |
| `apps/web` | Next.js frontend — task management UI |
| `packages/common` | Shared TypeScript types, Zod schemas, tRPC router |

## Running with Docker (development)

**Prerequisites:** Docker

**Start both services:**

```bash
docker compose up
```

On first run, open http://localhost:3000 and you'll be prompted to create an admin password.

- Web UI: http://localhost:3000

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
