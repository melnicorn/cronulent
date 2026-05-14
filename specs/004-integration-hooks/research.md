# Research: Integration Hooks (Plugin System)

## Decision 1 — Helper injection timing: execute-time vs setup-time

**Decision**: Inject helper files at execution time (inside `executor.ts`, before spawning the child process).

**Rationale**: `EnvironmentManager.setup()` is called when a task is created or updated — not on every execution. If helpers were injected at setup time, changing a plugin's config (e.g., rotating a bot token) would require re-saving every task to pick up the new values. Execute-time injection is always fresh and requires no coordination with the task lifecycle.

**Alternatives considered**: Setup-time injection — simpler diff on the EnvironmentManager, but stale on plugin config changes. Rejected.

---

## Decision 2 — Plugin config transport: environment variables vs config file vs IPC

**Decision**: Pass plugin config to child process via environment variables (`CRONULENT_PLUGIN_{ID}_{KEY}=value`).

**Rationale**: The existing `TaskExecutor.runProcess` already merges `task.env` into the child's environment. Piggybacking on this mechanism adds plugin config with zero new infrastructure. Env vars are standard for passing runtime secrets to subprocesses and are isolated to each child process.

**Alternatives considered**:
- Write a config file into the task dir — adds a file that could be inadvertently read/committed by the task author. Rejected.
- Local HTTP callback from helper to scheduler — IPC overhead, requires auth, overkill for this use case. Rejected.

---

## Decision 3 — Plugin manifest discovery: static index vs dynamic filesystem scan

**Decision**: `apps/scheduler/src/plugins/index.ts` holds an explicit array of plugin instances. Adding a plugin = one new file + one line in the array.

**Rationale**: The project has a small, deployment-controlled set of plugins. Dynamic `import()` of arbitrary files at runtime introduces security and error-handling complexity without benefit. The index file IS the registry — editing it is equivalent to editing a `plugins.yaml`. This also keeps TypeScript happy with static types.

**Alternatives considered**: `fs.readdir` + dynamic `import()` scan — would require build-time type erasure for safe loading, adds startup latency, complicates error handling. Rejected.

---

## Decision 4 — Plugin state and config storage: config.json5 extension vs new file

**Decision**: Extend the existing `data/config.json5` with a `plugins` key. No new file or storage layer.

**Rationale**: The config file already stores global singleton data (password hash, timezone). Plugin state (enabled flag + config values) is the same class of data — set once by the admin, read by the scheduler on every task execution. Keeping it in one file simplifies backup, restore, and the ConfigManager interface.

**Structure added to config.json5**:
```json5
{
  // existing fields...
  plugins: {
    telegram: {
      enabled: true,
      config: { botToken: "xxx", chatId: "yyy" }
    }
  }
}
```

**Alternatives considered**: Separate `plugins.json5` file — an extra file for the same class of data. Rejected.

---

## Decision 5 — Sensitive field masking strategy

**Decision**: The `getConfig` tRPC query returns `'••••••'` for fields marked `type: 'secret'`. The `updateConfig` mutation skips writing any field whose value equals the placeholder, preserving the stored value. The web form detects the placeholder and shows an empty input with a placeholder hint.

**Rationale**: Standard pattern for credential management UIs. Never transmits the real secret to the browser after the initial write, reducing exposure surface.

---

## Decision 6 — Telegram helper implementation approach

**Decision**: Each plugin exports two generator functions: `generatePythonHelper(): string` and `generateNodeHelper(): string`. These return the complete source of the helper file as a string. The executor writes them to the task directory before spawning.

**Rationale**: The helper is a self-contained file the task author imports — it should be simple, dependency-free, and readable. Generating it as a string template (rather than, e.g., copying a bundled asset) keeps it co-located with the plugin definition and easy to evolve.

**Telegram Python helper** uses only stdlib (`urllib.request`, `json`, `os`) — no extra dependencies required in the task's virtualenv.

**Telegram Node.js helper** uses only Node.js built-ins (`node:https`) — no npm dependencies required.

---

## Decision 7 — Lifecycle notification dispatch location

**Decision**: Lifecycle notifications are dispatched in `executor.ts` after the child process `close` event, before the execution record is finalized.

**Rationale**: The executor already owns the "task ran, here is the exit code" moment. Dispatching notifications there keeps the lifecycle hook logic in one place and guarantees the notification fires regardless of how the task was triggered (scheduled or "Run Now").

The notification call is `await`ed but wrapped in try/catch — failures are logged to stderr and do not affect the execution record.
