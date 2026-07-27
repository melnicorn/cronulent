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

### Admin API

Tasks and executions can be driven from scripts or the command line through the
web app on port 3000. The scheduler is never exposed — the web app authenticates
the caller and forwards the request over the internal network.

**Setup.** Generate a service token pair and put it in a `.env` file next to your
compose file (see [.env.example](.env.example)):

```bash
TOKEN=$(openssl rand -base64 32)
echo "CRONULENT_SERVICE_TOKEN=$TOKEN" >> .env
echo "CRONULENT_SERVICE_TOKEN_HASH=$(printf %s "$TOKEN" | openssl dgst -sha256 -hex | awk '{print $2}')" >> .env
```

The web app holds the token; the scheduler holds only its hash. Restart both
containers after changing it.

**Create a key** under *API Keys* in the web UI. It is shown once and stored
only as a hash — regenerate it if you lose it.

**Call it.** Procedure names map onto paths. Queries are GET with a URL-encoded
`input`; mutations are POST with a JSON body (send at least `{}`):

```bash
curl -H "Authorization: Bearer $CRONULENT_KEY" \
  "http://<host>:3000/api/admin/tasks.list"

curl -X POST "http://<host>:3000/api/admin/tasks.trigger" \
  -H "Authorization: Bearer $CRONULENT_KEY" -H "Content-Type: application/json" \
  -d '{"id":"<task-id>"}'

curl -G -H "Authorization: Bearer $CRONULENT_KEY" \
  --data-urlencode 'input={"taskId":"<task-id>"}' \
  "http://<host>:3000/api/admin/executions.list"
```

Available: `tasks.list`, `tasks.get`, `tasks.getState`, `tasks.create`,
`tasks.update`, `tasks.delete`, `tasks.trigger`, `tasks.pause`, `tasks.resume`,
`tasks.clearState`, `executions.list`, `executions.get`, `executions.resetStuck`,
`executions.clearByTaskId`, and `system.getSettings`. Authentication and plugin
procedures are not reachable with an API key.

> **A key is equivalent to shell access on the host.** It can rewrite a task's
> script and run it, and scripts are not yet sandboxed. Treat it like an SSH key,
> and revoke it in the UI when it is no longer needed.

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
