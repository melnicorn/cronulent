# Research: Cron Task Manager

**Feature**: 001-cron-task-manager
**Date**: 2026-05-12

---

## Code Editor (UI)

**Decision**: Monaco Editor via `@monaco-editor/react`

**Rationale**: Monaco is the VS Code editor engine. It is the industry standard for browser-based
code editing and was explicitly requested as "best in class." It supports 90+ languages including
shell script, Python, JavaScript/TypeScript, and generic text. Features include syntax
highlighting, multi-cursor, find/replace, and line numbers — all relevant to script editing.

**Alternatives considered**:
- CodeMirror 6: More lightweight (~200KB vs ~2MB for Monaco), highly extensible, but lacks the
  breadth of language support and IDE-quality features Monaco provides. Would require manual
  language mode setup for each script type.
- Ace Editor: Legacy option, superseded by both Monaco and CodeMirror.

**Constraint**: Monaco must be loaded with `dynamic()` + `{ ssr: false }` in Next.js; it uses
browser-only APIs.

---

## Cron Scheduling Library (backend)

**Decision**: `node-cron`

**Rationale**: Simple, battle-tested 5-field cron syntax with no additional configuration.
Widely adopted, actively maintained, and covers all required scheduling patterns. Supports
timezone-aware scheduling and provides a straightforward API for starting, stopping, and
validating cron expressions.

**Alternatives considered**:
- `node-schedule`: Broader scheduling support (specific dates, recurrence rules) but more
  complex API surface than needed for this use case.
- `croner`: Modern TypeScript-first library. Good option but less battle-tested at scale than
  `node-cron`.

---

## Cron Expression UI Helper

**Decision**: `cronstrue`

**Rationale**: De facto standard JavaScript library for translating cron expressions to
human-readable English. Runs in the browser. Handles edge cases and irregular expressions
gracefully. Returns an error string on invalid input rather than throwing, which simplifies
real-time validation.

**Alternatives considered**: Custom implementation — unnecessary given `cronstrue` is
purpose-built, maintained, and well-tested.

---

## JWT / Token Auth Library

**Decision**: `jose`

**Rationale**: Modern JOSE (JSON Object Signing and Encryption) library with full ESM support,
no Node.js-specific dependencies, and TypeScript types built-in. Compatible with the native
Node.js TypeScript execution model (no CommonJS require). Supports HS256 signing for JWTs.

**Alternatives considered**:
- `jsonwebtoken`: The legacy option; CommonJS-only, requires `require()` which is incompatible
  with the `"type": "module"` requirement for native TypeScript Node.js apps.
- `@auth/core`: Full auth framework; overpowered for a single-user backend service.

---

## tRPC Server Adapter

**Decision**: `@trpc/server/adapters/standalone`

**Rationale**: The built-in standalone adapter creates an HTTP server with zero additional
dependencies. Sufficient for a backend service that serves only the tRPC API.

**Alternatives considered**:
- Express adapter: Adds Express as a dependency with no benefit at this scale.
- Fastify adapter: Same issue; overhead not justified for a single-purpose service.

---

## tRPC Architecture in Monorepo

**Decision**: tRPC router defined in `@repo/common`; concrete implementations injected via
context from `apps/scheduler`.

**Rationale**: The user requirement states "all data types shared between frontend and backend
should be defined in `common`." The `AppRouter` type must be accessible to both the scheduler
(server) and the web app (client). Placing the router in `@repo/common` avoids any
cross-`apps/` source imports (prohibited by Constitution Principle IV) while ensuring
end-to-end type safety. Procedure handlers call into repository/scheduler interfaces defined
in common; concrete implementations are injected at startup via tRPC context.

**Pattern**:
```
@repo/common defines:
  - Entity types + Zod schemas
  - ITaskRepository, IExecutionRepository, ISchedulerService interfaces
  - tRPC router factory (createAppRouter) + AppRouter type export

apps/scheduler provides:
  - JSON5 implementations of repository interfaces
  - Cron scheduler implementation
  - HTTP server that injects concrete impls into tRPC context

apps/web uses:
  - AppRouter type (from @repo/common) to create a typed tRPC client
  - Server actions as the only bridge between browser and tRPC client
```

**Alternatives considered**:
- Exporting `AppRouter` from `apps/scheduler` and importing into `apps/web`: Violates
  Constitution Principle IV (no cross-app source imports).
- Separate `packages/trpc` package: Unnecessary indirection for this project scope.

---

## Dark/Light Mode

**Decision**: `next-themes` + Tailwind CSS `dark:` variant

**Rationale**: `next-themes` is the standard Next.js theme management library. It handles
SSR hydration correctly (avoids flash of incorrect theme), reads system preference, and
persists user choice in `localStorage`. Tailwind's `dark:` variant provides a simple
CSS-class-based approach to theme-aware styling.

**Tailwind config**: Set `darkMode: 'class'` to allow `next-themes` to control via HTML
`class` attribute.

---

## JSON5 Storage Format

**Decision**: `json5` npm package, two flat files: `tasks.json5` and `executions.json5`

**Rationale**: JSON5 is a human-friendly superset of JSON with comments and trailing commas.
Useful for a data directory that an operator might inspect or hand-edit. The `json5` package
handles parsing and serialization. Files are read-parse-modify-serialize-write on each
mutation. For tens to hundreds of tasks, this is performant.

**File layout**:
```
$DATA_DIR/
├── tasks.json5       # array of Task objects
└── executions.json5  # array of Execution objects
```

**Alternatives considered**:
- Plain JSON: Less human-friendly; no comment support.
- SQLite: Better for large datasets but adds a native dependency and build complexity; the
  repository interface makes this a drop-in swap later.
- One-file-per-record: More complex directory management; unnecessary at this scale.

---

## Password Hashing

**Decision**: Node.js built-in `crypto.scrypt` for password hashing

**Rationale**: No additional dependency required. `scrypt` is a memory-hard KDF appropriate
for password storage. The admin password hash is stored as an environment variable at startup.

**Format**: `scrypt:N:r:p:salt:hash` (all hex/base64 encoded)

**Alternatives considered**: `bcryptjs` — requires an extra npm package; no advantage over
built-in `crypto.scrypt` for a single-user system.
