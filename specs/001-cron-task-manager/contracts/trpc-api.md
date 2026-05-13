# tRPC API Contract: Cron Task Manager

**Feature**: 001-cron-task-manager
**Date**: 2026-05-12
**Router type**: `AppRouter` exported from `@repo/common`

The scheduler exposes a single tRPC HTTP endpoint. All procedures are called by the Next.js
web app via server actions (never directly from the browser).

---

## Transport

- **Adapter**: `@trpc/server/adapters/standalone`
- **Endpoint**: `$SCHEDULER_URL/trpc` (e.g. `http://localhost:3001/trpc`)
- **Batching**: Enabled (default tRPC batch behavior)
- **Auth**: Bearer token in `Authorization` header (`Authorization: Bearer <jwt>`)

The `auth.login` procedure is the only procedure that does **not** require authentication.
All other procedures reject unauthenticated requests with a `UNAUTHORIZED` tRPC error.

---

## Namespace: `auth`

### `auth.login`

Validates the admin password and issues a JWT.

| Field | Value |
|-------|-------|
| Type | mutation |
| Auth required | No |

**Input**:
```typescript
{ password: string }
```

**Output**:
```typescript
{ token: string; expiresAt: string }  // expiresAt: ISO 8601
```

**Errors**:
- `UNAUTHORIZED` — wrong password

---

### `auth.logout`

Invalidates the current session token (no-op in v1 — JWTs are stateless; client discards token).

| Field | Value |
|-------|-------|
| Type | mutation |
| Auth required | Yes |

**Input**: none

**Output**: `{ ok: true }`

---

## Namespace: `tasks`

### `tasks.list`

Returns all tasks, ordered by `createdAt` descending.

| Field | Value |
|-------|-------|
| Type | query |
| Auth required | Yes |

**Input**: none

**Output**: `Task[]`

---

### `tasks.get`

Returns a single task by ID.

| Field | Value |
|-------|-------|
| Type | query |
| Auth required | Yes |

**Input**: `{ id: string }`

**Output**: `Task`

**Errors**:
- `NOT_FOUND` — no task with that ID

---

### `tasks.create`

Creates a new task and registers it with the scheduler.

| Field | Value |
|-------|-------|
| Type | mutation |
| Auth required | Yes |

**Input**: `CreateTaskInput` (see data-model.md) — includes `env: Record<string, string>`

**Output**: `Task` (with server-assigned `id`, `createdAt`, `updatedAt`)

**Errors**:
- `BAD_REQUEST` — validation failure (invalid cron expression, empty command, etc.)

**Side effect**: If `enabled: true`, the task is immediately scheduled.

---

### `tasks.update`

Updates a task's properties. The scheduler is notified of any changes.

| Field | Value |
|-------|-------|
| Type | mutation |
| Auth required | Yes |

**Input**: `UpdateTaskInput` (see data-model.md)

**Output**: `Task`

**Errors**:
- `NOT_FOUND` — no task with that ID
- `BAD_REQUEST` — validation failure

**Side effect**: Scheduler updates the cron job to reflect new expression/enabled state.

---

### `tasks.delete`

Deletes a task and all its execution history. Removes the cron job from the scheduler.

| Field | Value |
|-------|-------|
| Type | mutation |
| Auth required | Yes |

**Input**: `{ id: string }`

**Output**: `{ ok: true }`

**Errors**:
- `NOT_FOUND` — no task with that ID

---

### `tasks.trigger`

Manually triggers an immediate execution of a task, bypassing the cron schedule.
Respects the concurrent-run policy: if a run is already active, returns a skipped execution.

| Field | Value |
|-------|-------|
| Type | mutation |
| Auth required | Yes |

**Input**: `{ id: string }`

**Output**: `Execution`

**Errors**:
- `NOT_FOUND` — no task with that ID

---

### `tasks.pause`

Sets `enabled: false`. The scheduler removes the cron job. Running executions are not
interrupted.

| Field | Value |
|-------|-------|
| Type | mutation |
| Auth required | Yes |

**Input**: `{ id: string }`

**Output**: `Task` (with `enabled: false`)

---

### `tasks.resume`

Sets `enabled: true`. The scheduler registers the cron job.

| Field | Value |
|-------|-------|
| Type | mutation |
| Auth required | Yes |

**Input**: `{ id: string }`

**Output**: `Task` (with `enabled: true`)

---

## Namespace: `executions`

### `executions.list`

Returns execution history for a task, ordered by `startedAt` descending.

| Field | Value |
|-------|-------|
| Type | query |
| Auth required | Yes |

**Input**: `{ taskId: string; limit?: number }` — `limit` defaults to 50

**Output**: `Execution[]`

**Errors**:
- `NOT_FOUND` — no task with that ID

---

### `executions.get`

Returns a single execution record by ID.

| Field | Value |
|-------|-------|
| Type | query |
| Auth required | Yes |

**Input**: `{ id: string }`

**Output**: `Execution`

**Errors**:
- `NOT_FOUND` — no execution with that ID

---

## Error Codes Reference

| tRPC code | HTTP equivalent | When used |
|-----------|----------------|-----------|
| `UNAUTHORIZED` | 401 | Missing/invalid/expired token; wrong password |
| `NOT_FOUND` | 404 | Resource does not exist |
| `BAD_REQUEST` | 400 | Input validation failure (Zod) |
| `INTERNAL_SERVER_ERROR` | 500 | Unexpected backend error |
