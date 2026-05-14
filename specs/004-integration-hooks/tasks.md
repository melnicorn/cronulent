# Tasks: Integration Hooks (Plugin System)

**Input**: Design documents from `/specs/004-integration-hooks/`

**Prerequisites**: plan.md ✓, spec.md ✓, research.md ✓, data-model.md ✓, contracts/ ✓, quickstart.md ✓

**Tests**: No automated test tasks — manual end-to-end validation per story checkpoint.

**Organization**: Tasks grouped by user story to enable independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks in same group)
- **[Story]**: Which user story this task belongs to (US1, US2, US3)

---

## Phase 1: Setup

**Purpose**: Verify project scaffolding is ready for new plugin files.

- [ ] T001 Verify `.gitignore` in repo root covers `data/scripts/*/cronulent_hooks.*` (generated helper files must not be committed)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Plugin type system, storage layer, tRPC API, and Telegram plugin — required by all three user stories.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [ ] T002 [P] Add `PluginAdminConfigField`, `PluginFunctionParam`, `PluginFunction`, `PluginManifest`, `PluginState`, `LifecycleNotificationConfig` types and extend `Task` with optional `lifecycleNotifications` field in `packages/common/src/entities.ts`
- [ ] T003 [P] Extend `Config` interface with `plugins?: Record<string, { enabled: boolean; config: Record<string, string> }>` and add `getPluginState`, `setPluginEnabled`, `updatePluginConfig` methods to `apps/scheduler/src/config.ts`
- [ ] T004 Add `lifecycleNotificationsSchema` for task and plugin config Zod schemas to `packages/common/src/schemas.ts` (depends on T002)
- [ ] T005 [P] Create `PluginRegistry` class with `list(): PluginManifest[]` and `get(id): PluginManifest | undefined` in `apps/scheduler/src/plugins/index.ts` (depends on T002)
- [ ] T006 [P] Create Telegram plugin module in `apps/scheduler/src/plugins/telegram.ts` exporting: `manifest: PluginManifest` (adminConfigSchema: botToken/chatId; python+node function schemas for send_message/sendMessage), `generatePythonHelper(): string`, `generateNodeHelper(): string`, and `dispatch(title, text, config): Promise<void>` (depends on T002)
- [ ] T007 Extend `AppContext` with `pluginRegistry: { list(): PluginManifest[]; get(id: string): PluginManifest | undefined }` and `pluginConfig: { getState(id: string): {...}; setEnabled(...): Promise<void>; updateConfig(...): Promise<void> }` in `packages/common/src/router/context.ts` (depends on T002)
- [ ] T008 Create `pluginsRouter` with `list`, `setEnabled`, `getConfig`, `updateConfig` procedures per `contracts/plugins-router.md` spec in `packages/common/src/router/plugins.ts` (depends on T007)
- [ ] T009 Register `pluginsRouter` in `appRouter` in `packages/common/src/router/index.ts` (depends on T008)
- [ ] T010 Instantiate `PluginRegistry` (registering the Telegram plugin), extend `createContext` to pass `pluginRegistry` and `pluginConfig` (backed by `ConfigManager`), and update `TaskExecutor` constructor call to receive plugin access in `apps/scheduler/src/index.ts` and `apps/scheduler/src/http.ts` (depends on T003, T005, T006, T009)

**Checkpoint**: Plugin infrastructure complete — `client.plugins.list()` returns Telegram plugin; tRPC plugin API is live.

---

## Phase 3: User Story 1 — Call Plugin Helper Functions (Priority: P1) 🎯 MVP

**Goal**: Python and Node.js task scripts can import `cronulent_hooks` and call `telegram.send_message(title, text)` without handling tokens or API details.

**Independent Test**: Create a Python task with body `from cronulent_hooks import telegram; telegram.send_message("Test", "Hello from Cronulent")`, configure Telegram credentials in admin UI, run the task, confirm message received. Create a second task that calls the same function with `strict=True` but no credentials configured — confirm the task fails with a descriptive error.

- [ ] T011 [US1] Add `generatePythonHelperContent(plugins: Array<{manifest, config}>): string` and `generateNodeHelperContent(plugins: Array<{manifest, config}>): string` methods to `apps/scheduler/src/environment-manager.ts` that produce the full `cronulent_hooks.py` / `cronulent_hooks.mjs` source (each enabled plugin contributes its class/functions; disabled plugins produce stub no-ops)
- [ ] T012 [US1] Update `TaskExecutor` in `apps/scheduler/src/executor.ts`: (a) accept `pluginRegistry` and `getPluginConfig` in constructor, (b) in `runProcess` before spawning the child: write `cronulent_hooks.py` and `cronulent_hooks.mjs` to the task dir using `EnvironmentManager` helper methods, (c) inject `CRONULENT_PLUGIN_{ID}_{KEY}=value` env vars for all enabled+configured plugins into the child process environment (depends on T011)

**Checkpoint**: Python and Node.js tasks can import cronulent_hooks; `strict=False` calls silently skip if plugin unconfigured; `strict=True` calls raise an error.

---

## Phase 4: User Story 2 — Manage Plugins Admin UI (Priority: P2)

**Goal**: Admin can navigate to a "Manage Plugins" page, enable the Telegram plugin, configure its bot token and chat ID, and see a copyable usage snippet plus parameter reference table on the configuration page.

**Independent Test**: Navigate to `/plugins` — Telegram card appears, is toggled on. Navigate to `/plugins/telegram` — enter bot token + chat ID, save. Confirm masked display on revisit. Verify usage snippet shows `telegram.send_message(title, text, strict=False)` and reference table lists all params.

- [ ] T013 [US2] Create server actions `setPluginEnabledAction({ pluginId, enabled })` and `updatePluginConfigAction({ pluginId, config })` in `apps/web/src/actions/plugins.ts` that call the tRPC `plugins.setEnabled` and `plugins.updateConfig` mutations and revalidate `/plugins` paths
- [ ] T014 [P] [US2] Create `PluginList` client component in `apps/web/src/components/plugin-list.tsx` — renders a card per plugin with name, description, enabled/disabled status badge, HeroUI `Switch` toggle (calls `setPluginEnabledAction`), and a "Configure" `LinkButton` that navigates to `/plugins/[id]` (visible only when enabled) (depends on T013)
- [ ] T015 [P] [US2] Create `PluginConfigForm` client component in `apps/web/src/components/plugin-config-form.tsx` — renders: (1) a dynamic HeroUI form with one `Input` per `adminConfigSchema` field (type `'secret'` → `type="password"`), (2) a copyable code snippet block showing the function call with placeholder params for each runtime (Python + Node.js tabs), and (3) a parameter reference table (name, type, description columns) derived from `pythonFunctionSchema` (depends on T013)
- [ ] T016 [US2] Create Manage Plugins page at `apps/web/src/app/(dashboard)/plugins/page.tsx` — server component that fetches `client.plugins.list()` and renders `<PluginList plugins={...} />` (depends on T014)
- [ ] T017 [US2] Create Plugin Config page at `apps/web/src/app/(dashboard)/plugins/[id]/page.tsx` — server component that fetches plugin manifest + config via `client.plugins.getConfig({ pluginId })`, renders plugin name/description and `<PluginConfigForm ... />` (depends on T015)
- [ ] T018 [US2] Add Plugins nav link with `Puzzle` icon from `lucide-react` to the header nav in `apps/web/src/app/(dashboard)/layout.tsx` (depends on T016, T017)

**Checkpoint**: Full admin plugin management flow works end-to-end — enable, configure, view usage docs.

---

## Phase 5: User Story 3 — Lifecycle Hooks: Auto-Notify on Task Outcome (Priority: P3)

**Goal**: Tasks can be configured (via the task form) to automatically send a Telegram notification on success, failure, or both — with no code in the task script.

**Independent Test**: Create a shell task (`exit 1`), set "Notify on failure" to Telegram, run it — confirm a Telegram message arrives with task name, exit code, and timestamp. Create a second shell task (`exit 0`), set "Notify on success" — run, confirm notification. Verify a task with lifecycle notifications configured but no Telegram credentials produces a logged warning and is not marked as failed.

- [ ] T019 [US3] Update `TaskExecutor.runProcess` in `apps/scheduler/src/executor.ts` to dispatch lifecycle notifications after the child process `close` event: check `task.lifecycleNotifications`, call `pluginRegistry.get(pluginId)?.dispatch(title, text, config)` with task name + exit code + timestamp; wrap in try/catch — failures are logged, do not change the execution record status (depends on T012)
- [ ] T020 [US3] Add lifecycle notification fields to the task form in `apps/web/src/components/task-form.tsx`: a "Notifications" section with HeroUI `Select` for trigger (None / On failure / On success / Both) and a second `Select` for plugin (populated from enabled plugins via `plugins.list()`); wire to existing task create/update mutations via updated `createTaskInputSchema` / `updateTaskInputSchema` (depends on T009, T016)

**Checkpoint**: All three user stories are fully functional and independently testable.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [ ] T021 Run `pnpm turbo check-types` and resolve all TypeScript errors across `packages/common`, `apps/scheduler`, and `apps/web`
- [ ] T022 Run `pnpm turbo lint` and resolve all ESLint warnings (`--max-warnings 0` enforced)
- [ ] T023 Run `pnpm turbo build` and verify clean build across all packages

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies — start immediately
- **Phase 2 (Foundational)**: Depends on Phase 1 — **BLOCKS all user stories**
- **Phase 3 (US1)**: Depends on Phase 2 completion
- **Phase 4 (US2)**: Depends on Phase 2 completion (can run in parallel with Phase 3)
- **Phase 5 (US3)**: Depends on Phase 3 (T012 — executor already sets up plugin access) and Phase 4 (T016 — plugins page needed to discover enabled plugins in task form)
- **Phase 6 (Polish)**: Depends on all user story phases

### Within Phase 2

```
T002 ─┬─────────────────────────────────────────┐
T003 ─┘ (both independent, parallel)            │
       ↓                                        │
T004 ──────────────────────────────────────────┐│
T005 [P] ─┬─────────────────────────────────────┼┤ (parallel, both depend on T002)
T006 [P] ─┤                                    ││
T007 ──────┘                                   ││
       ↓                                       ││
T008 (depends T007)                            ││
       ↓                                       ││
T009 (depends T008)                            ││
       ↓                                       ││
T010 (depends T003 + T005 + T006 + T009) ◄─────┘┘
```

### Within Phase 4

- T013 first → T014 [P] and T015 [P] in parallel → T016 (needs T014) and T017 (needs T015) → T018

---

## Parallel Examples

### Phase 2 Group A (start immediately)
```
Task: T002 — Add plugin types to packages/common/src/entities.ts
Task: T003 — Extend Config in apps/scheduler/src/config.ts
```

### Phase 2 Group B (after T002)
```
Task: T005 — Create PluginRegistry in apps/scheduler/src/plugins/index.ts
Task: T006 — Create Telegram plugin in apps/scheduler/src/plugins/telegram.ts
Task: T007 — Extend AppContext in packages/common/src/router/context.ts
```

### Phase 4 Group A (after T013)
```
Task: T014 — PluginList component in apps/web/src/components/plugin-list.tsx
Task: T015 — PluginConfigForm component in apps/web/src/components/plugin-config-form.tsx
```

---

## Implementation Strategy

### MVP (User Story 1 Only)

1. Complete Phase 1 + Phase 2 (foundation)
2. Complete Phase 3 (US1 — helper injection)
3. **STOP and VALIDATE**: Python/Node tasks can call Telegram helpers
4. This is functional without any admin UI — configure plugin state directly in config.json5

### Full Feature

1. Phase 1 + Phase 2 → Foundation
2. Phase 3 → US1 (helper injection) — **MVP**
3. Phase 4 → US2 (admin UI) — adds Manage Plugins + config pages
4. Phase 5 → US3 (lifecycle hooks) — adds auto-notifications without script changes
5. Phase 6 → Polish

---

## Notes

- No automated test files — verify each story checkpoint manually via browser + task execution
- `[P]` tasks touch different files; run concurrently in same agent context
- T010 is the critical wiring task — everything before it is building; T010 connects it all
- US1 and US2 can be implemented in parallel after Phase 2 (different files entirely)
- US3 requires T012 complete (executor has plugin access) and T016 (plugins list available for task form)
