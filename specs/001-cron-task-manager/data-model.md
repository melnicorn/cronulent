# Data Model: Cron Task Manager

**Feature**: 001-cron-task-manager
**Date**: 2026-05-12

All entity types and Zod schemas live in `packages/common/src/`. Shared via `@repo/common`.

---

## Task

Represents a named, schedulable unit of work.

```typescript
// packages/common/src/entities.ts

type CommandType = 'shell' | 'python' | 'node' | 'executable'

interface Task {
  id: string            // UUID v4
  name: string          // display name, non-empty
  description: string   // optional freetext, default ""
  commandType: CommandType
  command: string       // path to script/executable OR inline shell command
  parameters: string[]  // extra argv passed to the command
  cronExpression: string              // 5-field standard cron (e.g. "0 * * * *")
  env: Record<string, string>         // per-task env vars injected into subprocess
  enabled: boolean                    // false = paused
  createdAt: string                   // ISO 8601
  updatedAt: string                   // ISO 8601
}
```

**Validation rules** (Zod schema):
- `id`: UUID v4 format
- `name`: non-empty string, max 200 chars
- `description`: string, max 2000 chars
- `commandType`: one of the four enum values
- `command`: non-empty string, max 4096 chars
- `parameters`: array of strings, each max 1024 chars, max 100 items
- `env`: object with string keys and string values; keys must be valid env var names
  (`[A-Z_][A-Z0-9_]*` case-insensitive); max 100 entries; values max 4096 chars
- `cronExpression`: 5-field cron, validated by `node-cron.validate()`
- `enabled`: boolean

**Create input** (omits id, createdAt, updatedAt — server assigns):
```typescript
type CreateTaskInput = Omit<Task, 'id' | 'createdAt' | 'updatedAt'>
```

**Update input**:
```typescript
type UpdateTaskInput = { id: string } & Partial<Omit<Task, 'id' | 'createdAt' | 'updatedAt'>>
```

---

## Execution

A single run of a Task. Immutable once status reaches a terminal state.

```typescript
type ExecutionStatus = 'running' | 'success' | 'failed' | 'interrupted' | 'skipped'

interface Execution {
  id: string            // UUID v4
  taskId: string        // references Task.id
  startedAt: string     // ISO 8601
  finishedAt: string    // ISO 8601; empty string while running
  durationMs: number    // wall-clock ms; 0 while running
  exitCode: number      // process exit code; -1 if not applicable (skipped/interrupted)
  status: ExecutionStatus
  skipReason: string    // non-empty only when status === 'skipped'
  stdout: string        // captured output, truncated at 100,000 chars
  stderr: string        // captured error output, truncated at 100,000 chars
}
```

**State transitions**:
```
(created) → running → success
                    → failed
                    → interrupted  (backend restart during execution)
           → skipped               (previous run still active at scheduled time)
```

**Validation rules** (Zod schema):
- `id`: UUID v4 format
- `taskId`: UUID v4 format, must reference an existing task
- `startedAt` / `finishedAt`: ISO 8601 or empty string
- `durationMs`: non-negative integer
- `exitCode`: integer -1..255
- `status`: one of the five enum values
- `stdout` / `stderr`: string, max 100,000 chars (truncation applied before storage)

---

## Session (in-memory only)

Active authentication tokens are validated on each request. No persistent session storage.

```typescript
interface TokenPayload {
  sub: string       // always "admin" in v1
  iat: number       // issued-at (Unix seconds)
  exp: number       // expiry (Unix seconds)
}
```

Tokens are HS256 JWTs signed with `JWT_SECRET`. Default expiry: 24 hours.

---

## Repository Interfaces

Defined in `packages/common/src/repositories.ts`. Implemented in `apps/scheduler/`.

```typescript
interface ITaskRepository {
  findAll(): Promise<Task[]>
  findById(id: string): Promise<Task | null>
  create(input: CreateTaskInput): Promise<Task>
  update(input: UpdateTaskInput): Promise<Task>
  delete(id: string): Promise<void>
}

interface IExecutionRepository {
  findByTaskId(taskId: string, limit?: number): Promise<Execution[]>
  findById(id: string): Promise<Execution | null>
  create(input: Omit<Execution, 'id'>): Promise<Execution>
  update(input: Pick<Execution, 'id'> & Partial<Execution>): Promise<Execution>
  findRunning(): Promise<Execution[]>  // used at startup to mark interrupted
}
```

---

## Scheduler Service Interface

Defined in `packages/common/src/services.ts`.

```typescript
interface ISchedulerService {
  start(): Promise<void>                    // load tasks and start cron jobs
  stop(): Promise<void>                     // stop all cron jobs
  scheduleTask(task: Task): void            // add/update cron job for a task
  unscheduleTask(taskId: string): void      // remove cron job
  triggerNow(taskId: string): Promise<Execution>  // manual run
}
```

---

## Subprocess Environment Merge

When executing a task, the subprocess environment is constructed as:

```
{ ...process.env, ...task.env }
```

Task-level `env` values override inherited system environment variables with the same name.
This allows tasks to set `PATH`, `PYTHONPATH`, secret tokens, config overrides, etc. without
modifying the scheduler's own environment.

## JSON5 Storage Layout

```
$DATA_DIR/
├── tasks.json5        // Array<Task>
└── executions.json5   // Array<Execution>
```

Both files are created with empty arrays `[]` on first run if absent.
All mutations are atomic: read → modify in memory → write full file.
