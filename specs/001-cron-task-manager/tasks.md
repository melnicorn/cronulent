---

description: "Task list for Cron Task Manager implementation"
---

# Tasks: Cron Task Manager

**Input**: Design documents from `specs/001-cron-task-manager/`

**Prerequisites**: plan.md, spec.md, data-model.md, contracts/trpc-api.md, research.md

**Tests**: Not included — not requested in feature specification.

**Organization**: Tasks grouped by user story for independent implementation and testing.

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: Can run in parallel (different files, no shared dependencies with incomplete tasks)
- **[Story]**: Which user story this task belongs to (US1–US4)
- File paths are repo-root relative

---

## Phase 1: Setup

**Purpose**: Scaffold new packages and install dependencies; no source logic yet.

- [ ] T001 Update `packages/common/package.json` — add `@trpc/server@^11`, `zod@^3`, `uuid@^11` as runtime dependencies; keep existing react/react-dom
- [ ] T002 [P] Create `apps/scheduler/package.json` — `"name": "scheduler"`, `"type": "module"`, `"engines": {"node": ">=22.6"}`, scripts `"dev": "node --experimental-strip-types src/index.ts"` and `"start": "node src/index.ts"`, runtime deps `@trpc/server`, `node-cron`, `json5`, `jose`, `uuid`, `@repo/common workspace:*`; devDeps `@repo/typescript-config workspace:*`, `@repo/eslint-config workspace:*`, `typescript`, `eslint`, `@types/node`, `@types/uuid`
- [ ] T003 [P] Create `apps/scheduler/tsconfig.json` — extends `@repo/typescript-config/node.json`; add `compilerOptions.paths` for `@repo/common` pointing to `../../packages/common/src/index.ts` and `@repo/common/*` to `../../packages/common/src/*`
- [ ] T004 [P] Add `@tailwindcss/postcss` and `tailwindcss` to `apps/web/package.json` devDependencies; create `apps/web/postcss.config.mjs` exporting `{ plugins: { '@tailwindcss/postcss': {} } }`
- [ ] T005 [P] Add `@trpc/client`, `next-themes`, `lucide-react`, `@monaco-editor/react`, `cronstrue` to `apps/web/package.json` dependencies
- [ ] T006 Run `pnpm install` from repo root — verify all workspace dependencies resolve without errors

**Checkpoint**: All packages install; `pnpm ls` shows scheduler and updated common/web packages.

---

## Phase 2: Foundational

**Purpose**: Core shared types, tRPC router, scheduler backend, and web infrastructure.
No user story work can begin until this phase is complete.

**⚠️ CRITICAL**: All user story phases depend on this phase completing first.

### `@repo/common` — Shared types and tRPC router

- [ ] T007 Create `packages/common/src/entities.ts` — export `CommandType` union type (`'shell' | 'python' | 'node' | 'executable'`), `ExecutionStatus` union type, `Task` interface, `Execution` interface, `TokenPayload` interface — exact shapes from `data-model.md`
- [ ] T008 [P] Create `packages/common/src/schemas.ts` — Zod schemas: `taskSchema`, `executionSchema`, `createTaskInputSchema` (omits id/createdAt/updatedAt), `updateTaskInputSchema` (id + partial); export inferred `CreateTaskInput` and `UpdateTaskInput` types; import entity types from `./entities`
- [ ] T009 [P] Create `packages/common/src/repositories.ts` — export `ITaskRepository` and `IExecutionRepository` interfaces with all methods defined in `data-model.md`; import `Task`, `Execution`, `CreateTaskInput`, `UpdateTaskInput` from `./entities` and `./schemas`
- [ ] T010 [P] Create `packages/common/src/services.ts` — export `ISchedulerService` interface with `start`, `stop`, `scheduleTask`, `unscheduleTask`, `triggerNow` methods as defined in `data-model.md`; import `Task`, `Execution` from `./entities`
- [ ] T011 Create `packages/common/src/router/context.ts` — export `AppContext` interface with fields `taskRepo: ITaskRepository`, `executionRepo: IExecutionRepository`, `schedulerService: ISchedulerService`, `token: string | undefined`; import from `../repositories` and `../services`
- [ ] T012 [P] Create `packages/common/src/router/auth.ts` — export `authRouter`: `auth.login` mutation (input: `{ password: string }`, output: `{ token: string; expiresAt: string }`, no auth required); `auth.logout` mutation (auth required, output: `{ ok: true }`); procedures delegate to `ctx.schedulerService` and context; import AppContext from `./context`
- [ ] T013 [P] Create `packages/common/src/router/tasks.ts` — export `tasksRouter` with all 8 procedures from `contracts/trpc-api.md` (`tasks.list`, `.get`, `.create`, `.update`, `.delete`, `.trigger`, `.pause`, `.resume`); all require auth middleware; use Zod schemas for input validation; procedures delegate to `ctx.taskRepo` and `ctx.schedulerService`
- [ ] T014 [P] Create `packages/common/src/router/executions.ts` — export `executionsRouter` with `executions.list` (input: `{ taskId: string; limit?: number }`) and `executions.get` (input: `{ id: string }`); require auth middleware; delegate to `ctx.executionRepo`
- [ ] T015 Create `packages/common/src/router/index.ts` — `createAppRouter()` factory composing `authRouter`, `tasksRouter`, `executionsRouter`; export `AppRouter = ReturnType<typeof createAppRouter>` type
- [ ] T016 Update `packages/common/src/index.ts` — barrel: re-export everything from `./entities`, `./schemas`, `./repositories`, `./services`, `./router/index`

### `apps/scheduler` — Concrete implementations and HTTP server

- [ ] T017 [P] Create `apps/scheduler/src/repositories/json5/task-repo.ts` — `Json5TaskRepository` class implementing `ITaskRepository`; reads/writes `tasks.json5` (creates file with `[]` if absent); all mutations: read full array → modify → write full array; uses `uuid` for `id` generation and `new Date().toISOString()` for timestamps
- [ ] T018 [P] Create `apps/scheduler/src/repositories/json5/execution-repo.ts` — `Json5ExecutionRepository` implementing `IExecutionRepository`; reads/writes `executions.json5`; `findRunning()` filters by `status === 'running'`
- [ ] T019 Create `apps/scheduler/src/repositories/index.ts` — `createRepositories(dataDir: string)`: ensures `dataDir` exists (mkdir recursive), ensures both json5 files exist with `[]` default, returns `{ taskRepo: ITaskRepository, executionRepo: IExecutionRepository }`
- [ ] T020 Create `apps/scheduler/src/executor.ts` — `spawnTask(task: Task, execId: string, execRepo: IExecutionRepository): Promise<void>`: builds argv per `commandType` (shell → `['/bin/sh', '-c', task.command, ...task.parameters]`; python → `['python3', task.command, ...task.parameters]`; node → `['node', task.command, ...task.parameters]`; executable → `[task.command, ...task.parameters]`); merges `{ ...process.env, ...task.env }` for subprocess env; captures stdout/stderr (truncated at 100,000 chars); updates execution record with exit code, duration, status on completion
- [ ] T021 Create `apps/scheduler/src/auth.ts` — `signToken(sub: string): Promise<string>` using `jose` `SignJWT` with HS256 and `JWT_SECRET` env; `verifyToken(token: string): Promise<TokenPayload | null>` using `jose` `jwtVerify`; `verifyPassword(input: string, storedHash: string): Promise<boolean>` using Node.js `crypto.scrypt` (format: `scrypt:N:r:p:salt:hash`)
- [ ] T022 Create `apps/scheduler/src/scheduler.ts` — `NodeCronSchedulerService` class implementing `ISchedulerService`; holds `Map<string, ScheduledTask>` of active cron jobs; `start()`: loads all enabled tasks from `taskRepo`, schedules each; `scheduleTask(task)`: validates cron, registers `node-cron` task that calls `executor` — skip+log if task already running; `unscheduleTask(id)`: stops and removes job; `triggerNow(id)`: runs immediately regardless of schedule but still enforces concurrent-run policy; inject `taskRepo`, `executionRepo`, `executor` via constructor
- [ ] T023 Create `apps/scheduler/src/http.ts` — `createHttpServer(opts: { port: number; taskRepo; executionRepo; schedulerService; verifyToken })`: uses `@trpc/server/adapters/standalone`; `createContext` extracts `Authorization: Bearer <token>` header, calls `verifyToken`, passes result into `AppContext`; creates and returns the HTTP server instance
- [ ] T024 Create `apps/scheduler/src/index.ts` — startup: reads `PORT`, `DATA_DIR`, `JWT_SECRET`, `ADMIN_PASSWORD_HASH` from `process.env` (exit 1 if any missing); calls `createRepositories(DATA_DIR)`; marks any `running` executions as `interrupted` via `execRepo.findRunning()` loop; instantiates `NodeCronSchedulerService`; calls `scheduler.start()`; calls `createHttpServer` and `.listen(PORT)`; logs ready message

### `apps/web` — Base infrastructure

- [ ] T025 [P] Update `apps/web/src/app/globals.css` — replace body with `@import "tailwindcss";` and `@custom-variant dark (&:where(.dark, .dark *));`; add CSS custom properties on `:root` for color palette (background, foreground, muted, border, primary) and override under `.dark`
- [ ] T026 [P] Create `apps/web/src/lib/session.ts` — `'use server'` module; `getSessionToken(): Promise<string | undefined>` reads `'session'` httpOnly cookie via `cookies()` from `next/headers`; `setSessionToken(token: string, expiresAt: string): Promise<void>` sets cookie; `clearSessionToken(): Promise<void>` deletes cookie
- [ ] T027 Create `apps/web/src/lib/trpc.ts` — server-only module (`import 'server-only'`); `createTrpcClient(token?: string)` creates `@trpc/client` instance with `httpBatchLink({ url: process.env.SCHEDULER_URL, headers: token ? { Authorization: 'Bearer ' + token } : {} })`; typed as `AppRouter` imported from `@repo/common`
- [ ] T028 Update `apps/web/src/app/layout.tsx` — wrap `{children}` in `ThemeProvider` from `next-themes` with `attribute="class"`, `defaultTheme="system"`, `enableSystem`; keep existing `<html lang="en">` structure

**Checkpoint**: Foundation complete. Run `turbo check-types` — zero errors. `turbo lint` — zero warnings. Apps do not need to boot yet.

---

## Phase 3: User Story 4 — Authenticate and Authorize (Priority: P1)

**Goal**: Login page + auth guard; all other user stories depend on having an active session.

**Independent Test**: (1) Navigate to `/tasks` while unauthenticated — verify redirect to `/login`. (2) Enter correct password — verify redirect to `/tasks` dashboard. (3) Click logout — verify redirect to `/login` and subsequent `/tasks` access redirects again.

- [ ] T029 [P] [US4] Create `apps/web/src/app/actions/auth.ts` — `loginAction(formData: FormData)`: extracts password, calls `createTrpcClient().auth.login`, on success calls `setSessionToken` then `redirect('/tasks')`; on `UNAUTHORIZED` tRPC error returns error message; `logoutAction()`: calls `createTrpcClient(token).auth.logout`, calls `clearSessionToken()`, `redirect('/login')`
- [ ] T030 [US4] Create `apps/web/src/app/(auth)/login/page.tsx` — Server Component rendering a login form; client-side form submits to `loginAction`; displays error message returned from action; lucide `Lock` icon in header; no emoji
- [ ] T031 [US4] Create `apps/web/src/app/(dashboard)/layout.tsx` — Server Component; reads session token via `getSessionToken()`; if absent calls `redirect('/login')`; renders outer shell: nav bar with app name "Cronulent", theme toggle placeholder (`{/* ThemeToggle added in Polish */}`), logout button calling `logoutAction`; wraps `{children}`
- [ ] T032 [P] [US4] Update `apps/web/src/app/page.tsx` — replace body with `redirect('/tasks')` (import from `next/navigation`)

**Checkpoint**: US4 independently functional. Auth flow works end-to-end; unauthenticated access redirected.

---

## Phase 4: User Story 1 — Schedule and Run a Task (Priority: P1)

**Goal**: Create a task with a cron schedule and command; verify it executes automatically.

**Independent Test**: Log in. Click "New Task". Fill form: name "Hello World", commandType "shell", command `echo "hello from cronulent"`, schedule `* * * * *`. Save. Wait ≤60s. Verify an execution with status "success" and stdout "hello from cronulent" appears.

- [ ] T033 [P] [US1] Create `apps/web/src/app/actions/tasks.ts` — server actions `listTasksAction(): Promise<Task[]>` and `createTaskAction(input: CreateTaskInput): Promise<{ ok: true } | { error: string }>`; each calls `createTrpcClient(await getSessionToken()).tasks.*`
- [ ] T034 [P] [US1] Create `apps/web/src/components/cron-helper.tsx` — `'use client'`; accepts `value: string` prop; debounces 200ms; calls `cronstrue.toString(value, { throwExceptionOnParseError: false })`; renders human-readable explanation or validation error in styled text below input; no emoji — use lucide `Clock` icon
- [ ] T035 [P] [US1] Create `apps/web/src/components/script-editor.tsx` — `'use client'`; `dynamic(() => import('@monaco-editor/react'), { ssr: false })`; accepts `value`, `onChange`, `language` props; maps `CommandType` to Monaco language (`shell`→`shell`, `python`→`python`, `node`→`javascript`, `executable`→`plaintext`); fixed height 200px; respects current theme (dark/light via `useTheme`)
- [ ] T036 [P] [US1] Create `apps/web/src/components/env-editor.tsx` — `'use client'`; manages `{ key: string; value: string }[]` state; renders table with key/value text inputs per row; lucide `Plus` add-row button, lucide `X` remove-row button; calls `onChange(Record<string, string>)` on any change; no emoji
- [ ] T037 [US1] Create `apps/web/src/components/task-form.tsx` — `'use client'`; controlled form fields: `name` (text), `description` (textarea), `commandType` (select), `command` via `ScriptEditor`, `parameters` (textarea, one per line → split to array), `cronExpression` (text input + `CronHelper` below), `env` via `EnvEditor`, `enabled` (toggle); `onSubmit: (input: CreateTaskInput) => void` prop; shows field validation errors
- [ ] T038 [P] [US1] Create `apps/web/src/components/task-list.tsx` — `'use client'`; accepts `tasks: Task[]` prop; renders table with columns: Name, Schedule, Status (lucide `Play`/`Pause` icon + "Enabled"/"Paused" label), Created; row links to `/tasks/[id]`; no action buttons yet (added in US2)
- [ ] T039 [US1] Create `apps/web/src/app/(dashboard)/tasks/page.tsx` — Server Component; calls `listTasksAction()`; renders `TaskList` with tasks; lucide `Plus`-icon "New Task" link to `/tasks/new`
- [ ] T040 [US1] Create `apps/web/src/app/(dashboard)/tasks/new/page.tsx` — Server Component; renders `TaskForm`; on submit calls `createTaskAction`; on success `redirect('/tasks')`; shows error message on failure

**Checkpoint**: US1 independently functional. Full create-schedule-execute-verify flow works.

---

## Phase 5: User Story 2 — Manage Existing Tasks (Priority: P2)

**Goal**: Edit, pause, resume, delete, and manually trigger tasks from the task list.

**Independent Test**: From task list, click "Run Now" on a task — execution appears in history within 3s. Click "Pause" — task stops scheduling. Click "Resume" — task resumes. Click "Delete" — task disappears from list.

- [ ] T041 [US2] Update `apps/web/src/app/actions/tasks.ts` — add `updateTaskAction(input: UpdateTaskInput)`, `deleteTaskAction(id: string)`, `triggerTaskAction(id: string)`, `pauseTaskAction(id: string)`, `resumeTaskAction(id: string)` server actions calling tRPC
- [ ] T042 [US2] Update `apps/web/src/components/task-list.tsx` — add per-row action buttons using `useTransition` for pending state: "Run Now" (lucide `Play`), "Pause"/"Resume" (lucide `Pause`/`Play` toggled by `task.enabled`), "Edit" (lucide `Pencil` links to `/tasks/[id]/edit`), "Delete" (lucide `Trash2` with confirmation); call corresponding server actions
- [ ] T043 [P] [US2] Create `apps/web/src/app/(dashboard)/tasks/[id]/edit/page.tsx` — Server Component; fetch task via `getTaskAction(params.id)`; render `TaskForm` pre-populated; on submit calls `updateTaskAction`; on success `redirect('/tasks')`
- [ ] T044 [P] [US2] Create `apps/web/src/app/actions/tasks.ts` addition — add `getTaskAction(id: string): Promise<Task>` (used by edit page and detail page)

**Checkpoint**: US2 independently functional. All task management actions work; scheduler reflects changes immediately.

---

## Phase 6: User Story 3 — View Execution History and Logs (Priority: P3)

**Goal**: View per-task execution history with status, duration, and log output.

**Independent Test**: Run a task manually. Open `/tasks/[id]`. Verify execution list shows the run with status, duration, and timestamp. Click the row. Verify stdout output is displayed.

- [ ] T045 [US3] Update `apps/web/src/app/actions/tasks.ts` — add `listExecutionsAction(taskId: string, limit?: number): Promise<Execution[]>` and `getExecutionAction(id: string): Promise<Execution>` server actions
- [ ] T046 [P] [US3] Create `apps/web/src/components/execution-list.tsx` — `'use client'`; accepts `executions: Execution[]` and `onSelect: (e: Execution) => void` props; table with columns: Status (colored lucide icon: `CheckCircle2` success, `XCircle` failed, `SkipForward` skipped, `AlertCircle` interrupted), Started, Duration (ms → human e.g. "1.2s"), Exit Code; row click calls `onSelect`
- [ ] T047 [P] [US3] Create `apps/web/src/components/execution-log.tsx` — `'use client'`; accepts `execution: Execution` prop; renders exit code badge, stdout in scrollable `<pre>` (max-height 400px), stderr in scrollable `<pre>`; shows skip reason if `status === 'skipped'`; lucide `Terminal` icon header; no emoji
- [ ] T048 [US3] Create `apps/web/src/app/(dashboard)/tasks/[id]/page.tsx` — Server Component; fetch task via `getTaskAction(params.id)` and executions via `listExecutionsAction(params.id)`; render task summary card (name, schedule, status, commandType); render `ExecutionList`; on row select show `ExecutionLog` via `useState` in a client wrapper component

**Checkpoint**: US3 independently functional. All execution history and log viewing works.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Dark/light mode, empty states, loading states, final type/lint validation.

- [ ] T049 [P] Create `apps/web/src/components/theme-toggle.tsx` — `'use client'`; cycles `light → dark → system` using `useTheme` from `next-themes`; renders lucide `Sun` (light), `Moon` (dark), `Monitor` (system); no emoji; accessible `aria-label`
- [ ] T050 Update `apps/web/src/app/(dashboard)/layout.tsx` — replace theme toggle placeholder with `<ThemeToggle />` component
- [ ] T051 [P] Add dark mode overrides to `apps/web/src/app/globals.css` — ensure `.dark` class CSS custom properties provide sufficient contrast for all palette variables defined in T025
- [ ] T052 [P] Add empty state to `apps/web/src/app/(dashboard)/tasks/page.tsx` — if `tasks.length === 0`, render centered lucide `CalendarX2` icon + "No tasks yet" heading + "New Task" link; no emoji
- [ ] T053 [P] Add `loading.tsx` files at `apps/web/src/app/(dashboard)/tasks/loading.tsx` and `apps/web/src/app/(dashboard)/tasks/[id]/loading.tsx` — render lucide `Loader2` spinning icon as page loading state
- [ ] T054 Run `turbo check-types` from repo root — fix all TypeScript errors until zero remain
- [ ] T055 Run `turbo lint` from repo root — fix all ESLint warnings/errors until zero remain (`--max-warnings 0`)

**Checkpoint**: All 7 success criteria verifiable. Dark and light modes work on all screens.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Requires Phase 1 complete — **BLOCKS all user stories**
- **US4 (Phase 3)**: Requires Phase 2 — **BLOCKS US1, US2, US3**
- **US1 (Phase 4)**: Requires Phase 2 + US4 (Phase 3)
- **US2 (Phase 5)**: Requires Phase 2 + US1 (Phase 4)
- **US3 (Phase 6)**: Requires Phase 2 + US1 (Phase 4); independent of US2
- **Polish (Phase 7)**: Requires all user story phases complete

### Within Phase 2

```
T007 (entities) ─┬─→ T008 (schemas) ─┐
                 ├─→ T009 (repos) ───→ T011 (context) ─┬─→ T012 [P] (router/auth)   ─┐
                 └─→ T010 (services) ─┘                ├─→ T013 [P] (router/tasks)  ─→ T015 (router/index) → T016 (index.ts)
                                                         └─→ T014 [P] (router/execs) ─┘

T015 (router/index) → T027 (trpc.ts in web)
T017 [P] + T018 [P] → T019 (repos/index) → T022 (scheduler) + T023 (http) → T024 (index.ts)
T020 (executor) → T022 (scheduler)
T021 (auth) → T022 (scheduler) + T023 (http)
```

### Parallel Opportunities per Phase

**Phase 2**:
```
# @repo/common — after T007:
Task A: T008 (schemas)
Task B: T009 (repositories.ts)
Task C: T010 (services.ts)

# apps/scheduler — after T016:
Task A: T017 (json5 task-repo)
Task B: T018 (json5 execution-repo)
Task C: T021 (auth.ts)

# apps/web — after T016:
Task A: T025 (globals.css)
Task B: T026 (session.ts)
```

**Phase 4**:
```
# All of these can start in parallel after Phase 3 completes:
Task A: T033 (tasks server actions)
Task B: T034 (CronHelper)
Task C: T035 (ScriptEditor)
Task D: T036 (EnvEditor)
Task E: T038 (TaskList)
# Then: T037 (TaskForm) needs B+C+D
# Then: T039 (tasks/page) needs A+E; T040 (tasks/new/page) needs A+T037
```

---

## Implementation Strategy

### MVP First (Auth + US1 only — Phases 1–4)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (critical — blocks everything)
3. Complete Phase 3: US4 Auth — login works, dashboard accessible
4. Complete Phase 4: US1 — create task, verify it runs on schedule
5. **STOP and VALIDATE**: SC-001, SC-002, SC-003 verifiable at this point
6. System is usable for its primary purpose

### Incremental Delivery

- After MVP: Add US2 (manage tasks) → enables pause/resume/delete/run-now
- After US2: Add US3 (execution history) → enables log inspection
- After US3: Add Polish → dark mode, empty states, loading UX

### Notes

- `[P]` tasks = different files, no unresolved dependencies → safe to parallelize
- `[USN]` maps each task to its user story for traceability
- Scheduler and web app run concurrently in dev via `turbo dev`
- Verify each phase checkpoint before proceeding
- Commit after each phase or logical task group
