# Implementation Plan: Integration Hooks (Plugin System)

**Branch**: `004-integration-hooks` | **Date**: 2026-05-14 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/004-integration-hooks/spec.md`

## Summary

Add a modular plugin system that injects helper utilities into Python and Node.js task scripts at execution time, with a "Manage Plugins" admin UI for enabling plugins and configuring their global settings. Plugin manifests (types) live in `packages/common`; plugin implementations live in `apps/scheduler/src/plugins/`. The Telegram plugin ships first. All deployed scripts automatically receive helper files regardless of whether they call them; the `strict` parameter controls whether unconfigured plugin calls fail hard or log a warning.

## Technical Context

**Language/Version**: TypeScript 5.x strict

**Primary Dependencies**: tRPC (existing), Zod (existing), HeroUI v3 (existing), Next.js (existing), Node.js ≥ 22.6

**Storage**: `data/config.json5` (existing file, extended with `plugins` key — no new storage)

**Testing**: `turbo check-types`, `turbo lint`, `turbo build` — manual end-to-end via browser and "Run Now"

**Target Platform**: Node.js server (scheduler) + Next.js web app

**Project Type**: Monorepo — standalone Node.js app + Next.js web app

**Performance Goals**: Helper injection overhead < 50ms per execution (file writes only, no network)

**Constraints**: No new packages; extend existing `packages/common` and both apps only

**Scale/Scope**: Single-admin instance; one config file; Telegram first plugin

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I — Minimum Viable Code | ✓ PASS | Implementing only what spec defines; no speculative plugins |
| II — Precision Over Scope | ✓ PASS | New plugin files + minimal extensions to config, executor, environment-manager, entities, router |
| III — Defined Success Criteria | ✓ PASS | SC-001–SC-005 defined in spec |
| IV — Monorepo Package Discipline | ✓ PASS | Types in packages/common; no cross-app imports; existing path alias patterns followed |
| V — Type Safety | ✓ PASS | strict: true enforced; no any |
| VI — User-Facing Documentation | ✓ PASS | No user-facing docs changes required |
| Technology Standards | ✓ PASS | HeroUI v3 for all new UI; tRPC for API; pnpm; Turborepo |

*Post-Phase 1 re-check: No violations introduced by design.*

## Project Structure

### Documentation (this feature)

```text
specs/004-integration-hooks/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
└── tasks.md             # Phase 2 output (/speckit-tasks)
```

### Source Code Changes

```text
packages/common/src/
├── entities.ts          # + PluginManifest, PluginAdminConfigField, PluginFunction,
│                        #   PluginFunctionParam, PluginState; extend Task with
│                        #   lifecycleNotifications
├── schemas.ts           # + plugin config schemas; extend taskSchema with
│                        #   lifecycleNotifications
├── repositories.ts      # (no change)
├── services.ts          # (no change)
└── router/
    ├── context.ts       # + pluginRegistry and pluginConfig to AppContext
    ├── plugins.ts       # NEW — plugins tRPC router (list, setEnabled, getConfig,
    │                    #   updateConfig)
    └── index.ts         # + pluginsRouter to appRouter

apps/scheduler/src/
├── config.ts            # + plugins key to Config interface; + getPluginState,
│                        #   setPluginEnabled, updatePluginConfig methods
├── executor.ts          # + inject plugin helpers before spawn; + dispatch lifecycle
│                        #   notifications after process exits
├── environment-manager.ts  # + generatePythonHelper, generateNodeHelper methods
│                           #   (called by executor at execution time)
├── http.ts              # + pass pluginRegistry to tRPC context
├── index.ts             # + instantiate PluginRegistry; pass to http context
└── plugins/
    ├── index.ts         # NEW — PluginRegistry class; plugin array registry
    └── telegram.ts      # NEW — Telegram plugin: manifest + Python/Node/shell
                         #   helper generators + dispatch

apps/web/src/
├── app/(dashboard)/
│   ├── layout.tsx       # + Plugins nav link (Puzzle icon)
│   └── plugins/
│       ├── page.tsx     # NEW — Manage Plugins page (list + enable/disable)
│       └── [id]/
│           └── page.tsx # NEW — Plugin config page (admin form + usage docs)
├── components/
│   ├── plugin-list.tsx          # NEW — plugin cards with enable/disable toggle
│   └── plugin-config-form.tsx   # NEW — dynamic config form + usage snippet + param table
└── actions/
    └── plugins.ts       # NEW — server actions: setPluginEnabled, updatePluginConfig
```

## Key Design Decisions

### 1. Plugin manifest split: types vs implementation

`PluginManifest` and related types live in `packages/common` so both the scheduler (for helper generation) and the web app (received via tRPC) can use them. The actual `PluginManifest` instances (with their helper generator functions) live only in `apps/scheduler/src/plugins/` since the web never runs the generator code — it only receives the manifest data over tRPC.

### 2. Shared helper directory, regenerated on state change

Plugin helpers are written once to `data/scripts/shared/` (on scheduler startup and whenever a plugin is enabled or its config is saved), not per-task. Task scripts reference `../shared/cronulent_hooks.py`, `../shared/cronulent_hooks.mjs`, or `../shared/cronulent_hooks.sh` via relative path. `PYTHONPATH` is set to the shared dir for Python tasks. This ensures helpers always reflect the current plugin state without per-execution file writes.

### 3. Scheduler-as-proxy dispatch

Rather than injecting credentials into the child process environment, helper files make HTTP calls back to the scheduler (`CRONULENT_API_URL/plugins.dispatch`) authenticated with a short-lived internal token (`CRONULENT_INTERNAL_TOKEN`). The scheduler validates the token and performs the actual API call server-side. Credentials never leave the server process. An `internalProcedure` middleware in the tRPC router enforces that only callers with the correct token can invoke dispatch.

### 4. Plugin registry as a static index

`apps/scheduler/src/plugins/index.ts` maintains an explicit array of plugin instances. Adding a new plugin = creating a new file + adding one import/entry to this array. This is simpler and more secure than dynamic filesystem scanning, and the "index file = registry manifest" pattern satisfies the intent of the file-based registry requirement.

### 5. Sensitive field masking

Admin config fields with `type: 'secret'` are stored verbatim in `config.json5` but returned to the web as `'••••••'` placeholder strings. The `updatePluginConfig` mutation only writes fields whose value is not the placeholder, so re-saving the form without changing a secret field does not overwrite it.

### 6. Lifecycle notifications

After the child process exits (in `executor.ts`), if the task has `lifecycleNotifications` configured, the executor calls the relevant plugin's dispatch function with the execution context. Failures are caught and logged; they do not change the recorded task exit status (satisfying FR-009 / SC-005).
