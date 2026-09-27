# Implementation Plan: Gemini LLM Plugin

**Branch**: `005-gemini-llm-plugin` | **Date**: 2026-09-27 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/005-gemini-llm-plugin/spec.md`

## Summary

Add a built-in `gemini` plugin to the existing plugin system (spec 004). Task scripts call `cronhooks.gemini.extract(instructions, text, schema)` or `cronhooks.gemini.prompt(prompt)`. The scheduler proxies each call to Gemini's `generateContent` REST endpoint, using schema-constrained JSON output for `extract`, so the API key stays server-side. A daily call cap is enforced in the plugin's dispatch:
- The count lives in `StateStore` under a reserved key.
- Each slot is reserved (read, check, increment under a serializer) before the request is sent.
- The count resets at midnight America/Los_Angeles.

Shared helper changes are limited to what the plugin needs:
- a `timeout` parameter on the Python dispatch function;
- a new shell `_cronulent_dispatch_result` function that returns a value.

## Technical Context

**Language/Version**: TypeScript 5.x strict (scheduler); generated Python/Node/shell helper code

**Primary Dependencies**: existing only (Zod, tRPC). Gemini is called with Node 22's global `fetch`, so the SDK isn't needed.

**Storage**: `data/config.json5` (plugin config, existing); `data/state.json5` via `StateStore` (usage record, reserved key `__gemini_usage__`)

**Testing**: `node --test` (existing scheduler test runner) for a new `gemini.test.ts`; `turbo check-types`, `turbo lint`, `turbo build`; manual end-to-end via quickstart

**Target Platform**: Scheduler container (`node:22-slim` + `python3`, full ICU)

**Project Type**: Monorepo: standalone Node scheduler + Next.js web

**Performance Goals**: N/A (at most a few dozen calls per day)

**Constraints**: API key never leaves the scheduler process; ≤ `dailyLimit` requests per Pacific day across restarts and concurrent tasks; 60 s server timeout per request

**Scale/Scope**: One new plugin file, one test file, small edits to 3 existing scheduler files. No web or common-package changes.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I — Minimum Viable Code | ✓ PASS | No SDK and no new config field types (R10). Reuses `StateStore` + `createSerializer` for the cap instead of new storage (R5). |
| II — Precision Over Scope | ✓ PASS | Existing helpers (Telegram, state) are unchanged. The Python `timeout` param defaults to the current 10 s. The shell addition is a new function, not an edit (R8). The enabled check applies only to gemini (R9). |
| III — Defined Success Criteria | ✓ PASS | SC-001–SC-005 in the spec, verified by unit tests + quickstart. |
| IV — Monorepo Package Discipline | ✓ PASS | All changes are in `apps/scheduler`. `PluginManifest` types are unchanged. |
| V — Type Safety | ✓ PASS | Zod-validated params; typed Gemini response shape; no `any`. |
| VI — User-Facing Documentation | ✓ PASS | Usage docs are generated from the manifest on the plugin settings page (FR-015). No README change is required. |
| Technology Standards | ✓ PASS | No new runtime dependencies. |

*Post-Phase 1 re-check*: No violations. The design adds no packages, abstractions, or UI.

## Project Structure

### Documentation (this feature)

```text
specs/005-gemini-llm-plugin/
├── spec.md
├── plan.md              # This file
├── research.md          # Phase 0: R1–R10 decisions
├── data-model.md        # Config keys, usage record, dispatch params
├── quickstart.md        # Setup + manual verification
├── contracts/
│   └── gemini-helpers.md  # Script-facing API, error messages, log format
└── tasks.md             # Phase 2 (/speckit-tasks)
```

### Source Code Changes

```text
apps/scheduler/src/
├── plugins/
│   ├── gemini.ts           # NEW: manifest (apiKey/model/dailyLimit; extract/prompt docs),
│   │                       #   Python/Node/shell helper generators, dispatch:
│   │                       #   validate → enabled/key check → reserve slot → fetch → parse
│   ├── gemini.test.ts      # NEW: cap, day rollover, restart persistence, concurrency,
│   │                       #   failed-call counting, refusal-not-counted, response parsing
│   │                       #   (stubbed fetch + StateStore in a temp dir)
│   └── index.ts            # + register gemini; + optional `pluginEnabled` on DispatchServices
├── http.ts                 # pass `pluginEnabled: state.enabled` in dispatch services
└── environment-manager.ts  # Python `_cronulent_dispatch(..., timeout=10)` param;
                            #   new shell `_cronulent_dispatch_result` (prints result)
```

The web app and `packages/common` need no changes. The Plugins list and config form are driven by the manifest.

## Key Design Decisions

Full rationale is in [research.md](research.md).

1. **Reserve-then-call cap (R5, R6)**. `reserveCall(store, limit, now)` runs under a module-level serializer:
   - read `__gemini_usage__`;
   - roll over the count if the Pacific `day` changed;
   - refuse if `count >= limit`;
   - otherwise write `count + 1` and return it.

   Only after that does `fetch` run. Reserving first makes failures count (FR-008) and prevents concurrent overshoot (FR-013). `now` is injectable for tests.

2. **Structured output (R1)**:
   - `extract` sends `systemInstruction` = instructions, user content = text, and `generationConfig: { responseMimeType: 'application/json', responseJsonSchema: schema }`.
   - `prompt` sends only the user content.
   - No sampling overrides (R3).

3. **Key hygiene (R2)**. The key goes in the `x-goog-api-key` header. Error messages are built only from the status, the Gemini `error.message`, `blockReason`, and `finishReason`, never from the URL or headers.

4. **Timeouts (R7)**. The server uses `AbortSignal.timeout(60_000)`, and the Python client passes 90 s. The Node and shell helpers have no client timeout today, so they need no change.

5. **Shell results (R8)**. The gemini shell helpers build params with `python3 json.dumps` from positional args and call `_cronulent_dispatch_result`. That function writes the response body to a temp file, then:
   - on HTTP < 400, prints `result`: raw text if it's a string, JSON otherwise;
   - on failure, warns on stderr, or returns 1 if strict.

6. **Enabled/config checks (R9, R10)**. A disabled plugin, missing key, or bad `dailyLimit` is refused before reserving a slot, so it's never counted.

## Verification

| Criterion | How |
|-----------|-----|
| SC-001 | Quickstart: Python, Node, and shell `extract` each return a parsed result from a real key |
| SC-002 | `gemini.test.ts`: limit N allows exactly N requests; N+1 concurrent calls send exactly N; new `StateStore` instance (restart) still refuses; Pacific-midnight rollover resets; failures count, refusals don't |
| SC-003 | Test asserts error messages and log output never contain the key; manual `env` dump from a task shows no key |
| SC-004 | Quickstart extract on a ~3,000-character input completes without timeout |
| SC-005 | Existing scheduler tests pass; a Telegram/state task runs unchanged |

## Complexity Tracking

No constitution violations to justify.
