# Tasks: Gemini LLM Plugin

**Input**: Design documents from `/specs/005-gemini-llm-plugin/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/gemini-helpers.md, quickstart.md

**Tests**: Included. plan.md explicitly calls for `apps/scheduler/src/plugins/gemini.test.ts`, run with the existing `node --test` runner (`pnpm --filter scheduler test`).

**Organization**: Tasks are grouped by user story. All source paths are under `apps/scheduler/src/`. Match the existing plugin style in `plugins/telegram.ts` and `plugins/state.ts` (Zod param validation, `[plugin]`-prefixed error messages, no `.js` import extensions).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Which user story the task belongs to (US1–US4)

---

## Phase 1: Setup

No project setup needed. There are no new packages or dependencies, and Node 22's global `fetch` is used.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Register the plugin skeleton and add the shared plumbing every story needs.

**⚠️ CRITICAL**: Complete before any user story phase.

- [ ] T001 In `apps/scheduler/src/plugins/index.ts`, add an optional `pluginEnabled?: boolean` field to the `DispatchServices` interface. Update the comment above it to say gemini also uses these services.
- [ ] T002 In `apps/scheduler/src/http.ts`, change the `pluginRegistry.dispatch` implementation to pass `{ stateStore: opts.stateStore, pluginEnabled: state.enabled }` as the services argument (`state` is the existing `getPluginState(pluginId)` result).
- [ ] T003 Create `apps/scheduler/src/plugins/gemini.ts` with:
  - (a) `manifest: PluginManifest`:
    - id `gemini`, name `Gemini`
    - description `Ask Google Gemini to interpret text and return structured JSON or plain text. Calls are capped per day.`
    - `adminConfigSchema`:
      - `{ key: 'apiKey', label: 'API Key', type: 'secret', required: true }`
      - `{ key: 'model', label: 'Model (default gemini-3.1-flash-lite)', type: 'string', required: false }`
      - `{ key: 'dailyLimit', label: 'Daily Call Limit (default 20, resets midnight Pacific)', type: 'string', required: false }`
    - empty `pythonFunctionSchema` / `nodeFunctionSchema` for now (filled in by US1/US4).
  - (b) exported constants `DEFAULT_MODEL = 'gemini-3.1-flash-lite'`, `DEFAULT_DAILY_LIMIT = 20`, `USAGE_KEY = '__gemini_usage__'`, `REQUEST_TIMEOUT_MS = 60_000`.
  - (c) `resolveConfig(config, pluginEnabled)`:
    - throws `[gemini] plugin is not enabled or has no API key` when `pluginEnabled` is false or `apiKey` is blank;
    - returns `{ apiKey, model: config.model?.trim() || DEFAULT_MODEL, dailyLimit }`;
    - `dailyLimit` is `DEFAULT_DAILY_LIMIT` when blank, `Number(v)` when it matches `/^\d+$/`, and otherwise throws `[gemini] dailyLimit must be a whole number`.
  - (d) `callGemini(apiKey, model, body): Promise<string>`:
    - `fetch` POST to `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent` with headers `Content-Type: application/json` and `x-goog-api-key: apiKey`, and `signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)`.
    - Map outcomes per research.md R4 and the contracts table:
      - network/abort → `[gemini] request failed: <message>`;
      - 429 → `[gemini] quota or rate limit exceeded (HTTP 429): <error.message>`;
      - other non-2xx → `[gemini] HTTP <status>: <error.message>`;
      - no candidates → `[gemini] blocked (<promptFeedback.blockReason ?? 'unknown'>)`;
      - join `candidates[0].content.parts[].text`, skipping parts with `thought: true`; empty → `[gemini] empty response (finishReason <finishReason>)`.
    - Type the response shape with a local interface (no `any`). Never put the key or URL in an error message.
  - (e) stub `generatePythonHelper`, `generateNodeHelper`, `generateShellHelper` that return a namespace with no functions yet (Python `class gemini:\n    pass\n`, Node `export const gemini = {}\n`, shell empty string).
  - (f) a `dispatch(func, params, config, services)` stub that rejects `[gemini] Unknown function: '<func>'`.
- [ ] T004 Register gemini in `apps/scheduler/src/plugins/index.ts`: `import * as gemini from './gemini'` and add an entry to the `plugins` array mirroring the telegram entry. Depends on T001 and T003.
- [ ] T005 In `apps/scheduler/src/environment-manager.ts` Python preamble, add a `timeout=10` keyword parameter to `_cronulent_dispatch(plugin_id, func, params, strict=False, timeout=10)` and pass it to `urlopen(req, timeout=timeout)`. Existing callers are unchanged.
- [ ] T006 In `apps/scheduler/src/environment-manager.ts` shell preamble, add a new function `_cronulent_dispatch_result plugin_id func params_json [strict]` below `_cronulent_dispatch`. Leave `_cronulent_dispatch` unchanged. The function must:
  - build the same request body;
  - `curl -s -o "$tmp" -w "%{http_code}"` to a `mktemp` file;
  - on curl success and HTTP < 400, print the result with `python3 -c 'import json,sys; r=json.load(sys.stdin)["result"]["data"].get("result"); print(r if isinstance(r,str) else json.dumps(r))' < "$tmp"`;
  - on failure, extract the error message with python3 (`.error.message`, fall back to `plugin.func`), then either print `[cronulent] dispatch failed: <msg>` to stderr and `return 1` when strict, or print `[cronulent] warning: dispatch failed: <msg>` to stderr and return 0;
  - always `rm -f "$tmp"`.

**Checkpoint**: Scheduler starts, "Gemini" appears on the Plugins page, and `pnpm --filter scheduler check-types` passes.

---

## Phase 3: User Story 1 - Extract Structured Data (Priority: P1) 🎯 MVP

**Goal**: Scripts call `extract(instructions, text, schema)` in Python, Node, and shell and get a parsed result.

**Independent Test**: With the plugin enabled and a real key, a Python task calling `cronhooks.gemini.extract` on a paragraph containing a date with schema `{found: boolean, date: string}` returns a dict with `found: True` and the date.

### Tests for User Story 1

- [ ] T007 [US1] Create `apps/scheduler/src/plugins/gemini.test.ts` using `node:test` + `node:assert/strict`, with a helper that stubs `globalThis.fetch`, records each request (URL, headers, parsed body), and restores it after each test. Add extract tests:
  - (a) the request goes to `…/models/gemini-3.1-flash-lite:generateContent`, carries the key in the `x-goog-api-key` header, has no `key=` in the URL, and sends body `systemInstruction.parts[0].text === instructions`, `contents[0].parts[0].text === text`, `generationConfig.responseMimeType === 'application/json'`, and `generationConfig.responseJsonSchema` deep-equal to the schema;
  - (b) the parsed object is returned;
  - (c) a blank `model` config uses the default, and a custom model appears in the URL;
  - (d) non-JSON text rejects with `[gemini] response was not valid JSON`;
  - (e) HTTP 429, HTTP 500, no candidates (blockReason), and empty parts each reject with the contract message;
  - (f) no rejection message contains the API key;
  - (g) disabled plugin, blank key, and invalid params each reject without calling fetch.

  Use a real `StateStore` in a `fs.mkdtemp` directory for `services.stateStore`, following `state-store.test.ts`.

### Implementation for User Story 1

- [ ] T008 [US1] In `apps/scheduler/src/plugins/gemini.ts`, implement `extract`:
  - Zod schema `extractParamsSchema = z.object({ instructions: z.string().min(1), text: z.string(), schema: z.record(z.unknown()) })`, with invalid-params errors formatted like telegram's (`[gemini] invalid params — <path>: <message>`).
  - `dispatch` flow for `func === 'extract'`: validate params → `resolveConfig(config, services?.pluginEnabled ?? false)` → (US2 inserts the slot reservation here) → `callGemini` with `{ systemInstruction: { parts: [{ text: instructions }] }, contents: [{ role: 'user', parts: [{ text }] }], generationConfig: { responseMimeType: 'application/json', responseJsonSchema: schema } }` → `JSON.parse`. On a parse error, throw `[gemini] response was not valid JSON`.
  - Don't set temperature (research.md R3).
- [ ] T009 [US1] In `apps/scheduler/src/plugins/gemini.ts`, add the extract helpers and docs:
  - Python `class gemini:` with `@staticmethod def extract(instructions, text, schema, strict=False): return _cronulent_dispatch('gemini', 'extract', {'instructions': instructions, 'text': text, 'schema': schema}, strict, timeout=90)`.
  - Node `export const gemini = { extract: (instructions, text, schema, strict = false) => _cronulentDispatch('gemini', 'extract', { instructions, text, schema }, strict) }`.
  - Shell `cronhooks_gemini_extract()`: build params with `python3 -c 'import json,sys; print(json.dumps({"instructions":sys.argv[1],"text":sys.argv[2],"schema":json.loads(sys.argv[3])}))' "$1" "$2" "$3"`; if that fails, print `[cronulent] gemini extract: schema is not valid JSON` to stderr and return 1. Otherwise call `_cronulent_dispatch_result "gemini" "extract" "$params" "${4:-false}"`.
  - Add `extract` entries to `pythonFunctionSchema` and `nodeFunctionSchema`, with params instructions/text/schema/strict (types `str`/`str`/`dict`/`bool` and `string`/`string`/`object`/`boolean`) and descriptions from contracts/gemini-helpers.md.
- [ ] T010 [US1] Run `pnpm --filter scheduler test` and make the T007 tests pass.

**Checkpoint**: Extraction works end-to-end with a real key (quickstart "Extract structured data").

---

## Phase 4: User Story 2 - Daily Call Cap (Priority: P1)

**Goal**: No more than `dailyLimit` requests per Pacific day, across restarts and concurrent tasks. Failures count; refusals don't.

**Independent Test**: With the limit at 2, three calls from one task → two results and one "daily limit" warning. After a restart the same day, calls are still refused.

### Tests for User Story 2

- [ ] T011 [US2] Add cap tests to `apps/scheduler/src/plugins/gemini.test.ts`, with the clock injected through `reserveCall`'s `now` parameter:
  - (a) with `dailyLimit: '2'`, the 3rd call rejects with `[gemini] daily limit of 2 calls reached; resets at midnight Pacific`, and fetch was called exactly 2 times;
  - (b) a failed request (HTTP 500) still increments the count;
  - (c) refusals (limit reached, disabled plugin, bad `dailyLimit`, invalid params) don't increment it;
  - (d) 5 concurrent `reserveCall`s with limit 3 → exactly 3 succeed;
  - (e) a new `StateStore` instance on the same directory (simulated restart) keeps the count;
  - (f) the Pacific day follows wall-clock midnight across the 2026-03-08 DST change:
    - `2026-03-08T07:59:00Z` and `2026-03-08T08:01:00Z` are different days (PST midnight is 08:00Z);
    - `2026-03-08T08:01:00Z` and `2026-03-09T06:59:00Z` are the same day (both 2026-03-08 local);
    - `2026-03-09T06:59:00Z` and `2026-03-09T07:01:00Z` are different days (PDT midnight is 07:00Z);
    - a new day resets the count;
  - (g) `dailyLimit: '0'` refuses every call;
  - (h) blank `dailyLimit` allows 20.
- [ ] T012 [US2] In `apps/scheduler/src/plugins/gemini.ts`, implement:
  - `pacificDay(now: Date): string` using `new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles' }).format(now)`.
  - Exported `reserveCall(store: StateStore, limit: number, now = new Date()): Promise<number>`, wrapped in a module-level `const serialize = createSerializer()` (import from `../serialize`). It must:
    - read `USAGE_KEY` via `store.get`;
    - treat a missing record, a malformed record (not `{ day: string, count: number }`), or a different `day` as `{ day: today, count: 0 }`;
    - throw `[gemini] daily limit of ${limit} calls reached; resets at midnight Pacific` when `count >= limit`;
    - otherwise `store.set(USAGE_KEY, { day: today, count: count + 1 }, now.toISOString())` and return `count + 1`.
  - Export a `GeminiUsage` interface per data-model.md.
- [ ] T013 [US2] In `apps/scheduler/src/plugins/gemini.ts` `dispatch`, call `reserveCall(services.stateStore, dailyLimit)` after `resolveConfig` and before `callGemini`. Reject `[gemini] state store is unavailable` if `services?.stateStore` is missing, before reserving. Add FR-014 logging with `console.log`/`console.warn`:
  - `[gemini] call ${n}/${limit} today (${func}): ok` on success;
  - `[gemini] call ${n}/${limit} today (${func}): failed — <message without the '[gemini] ' prefix>` on failure;
  - `[gemini] refused (${func}): daily limit of ${limit} reached` on a cap refusal.

  Never log the key, prompt, or text.
- [ ] T014 [US2] Run `pnpm --filter scheduler test` and make the T011 tests pass.

**Checkpoint**: The cap holds (quickstart "Verifying the daily cap" steps 1–5).

---

## Phase 5: User Story 3 - Configure the Plugin in the Admin UI (Priority: P2)

**Goal**: The admin enables and configures Gemini on the Plugins page. The manifest from T003 already drives the UI, so this phase is verification only.

**Independent Test**: Enable Gemini, save a key, reload. The key shows masked, and re-saving without editing it keeps the key.

- [ ] T015 [US3] Manually verify in the web app (`pnpm docker:dev` or `pnpm dev`):
  - Gemini appears on the Plugins list with the T003 description.
  - The config page shows API Key (password input), Model, and Daily Call Limit with the default hints in their labels.
  - A saved key reloads as `••••••` and survives re-saving the form unchanged.
  - The usage section lists `extract` (and `prompt` after US4) for Python, Node, and Shell.

  If anything renders wrong, fix it only in `apps/scheduler/src/plugins/gemini.ts` manifest fields. No web changes are expected.

**Checkpoint**: An admin can configure the plugin without editing files.

---

## Phase 6: User Story 4 - Free-Text Prompt (Priority: P3)

**Goal**: `prompt(prompt)` returns plain text and counts toward the same cap.

**Independent Test**: A Node task calling `await cronhooks.gemini.prompt('Say hi')` receives a non-empty string.

- [ ] T016 [US4] Add prompt tests to `apps/scheduler/src/plugins/gemini.test.ts`:
  - (a) the body has `contents[0].parts[0].text === prompt`, no `generationConfig`, and no `systemInstruction`;
  - (b) the joined text is returned as a string;
  - (c) prompt and extract calls share one daily count;
  - (d) an empty prompt rejects as invalid params without fetching.
- [ ] T017 [US4] In `apps/scheduler/src/plugins/gemini.ts`:
  - add `promptParamsSchema = z.object({ prompt: z.string().min(1) })`;
  - add a `func === 'prompt'` branch to `dispatch` that follows the same validate → resolveConfig → reserveCall → callGemini flow with body `{ contents: [{ role: 'user', parts: [{ text: prompt }] }] }` and returns the text;
  - add helpers: Python `def prompt(prompt, strict=False)` (timeout=90), Node `prompt: (prompt, strict = false) => …`, and shell `cronhooks_gemini_prompt()` (params via `python3 json.dumps({"prompt": sys.argv[1]})`, then `_cronulent_dispatch_result "gemini" "prompt" "$params" "${2:-false}"`);
  - add `prompt` entries to both function schemas.
- [ ] T018 [US4] Run `pnpm --filter scheduler test` and make the T016 tests pass.

**Checkpoint**: All four stories work.

---

## Phase 7: Polish & Verification

- [ ] T019 Run `pnpm turbo check-types lint build test` from the repo root and fix any errors or warnings (`--max-warnings 0`) in the touched files only.
- [ ] T020 Walk through `specs/005-gemini-llm-plugin/quickstart.md` end to end with a real Gemini key. Record for each: Python extract, Node prompt, shell extract with text containing quotes and newlines, the daily cap steps 1–5, and a ~3,000-character extract (SC-004). If `responseJsonSchema` is rejected for `gemini-3.1-flash-lite`, stop and report back instead of switching to `responseSchema` silently.
- [ ] T021 Verify SC-003:
  - from a shell task, run `env | grep -i -e gemini -e goog` and confirm there's no key;
  - `grep -r "<key>" data/scripts/shared` finds nothing;
  - the scheduler logs from T020 contain no key or input text.
- [ ] T022 Verify SC-005: run an existing Telegram-using task and a state-using task, and confirm unchanged behavior.

---

## Dependencies & Execution Order

- **Phase 2**: T001 → T002 (T002 uses the new field). T003 can run in parallel with T001/T002. T004 depends on T001 + T003. T005 → T006 (same file).
- **US1 (Phase 3)**: depends on Phase 2. T007 → T008 → T009 → T010 (same two files, sequential).
- **US2 (Phase 4)**: depends on T008, because `dispatch` must exist to insert the reservation. T011 → T012 → T013 → T014.
- **US3 (Phase 5)**: depends on T004 only. Best done after US1/US4 so the usage docs are complete.
- **US4 (Phase 6)**: depends on T013, so prompt goes through the cap from the start.
- **Polish**: after all stories.

```text
T001 ─► T002 ─┐
T003 ─────────┼─► T004 ─► US1 (T007–T010) ─► US2 (T011–T014) ─► US4 (T016–T018) ─► US3 (T015) ─► T019–T022
T005 ─► T006 ─┘
```

### Parallel Opportunities

Most work is in one file (`plugins/gemini.ts`) and its test, so there's little parallelism. Only these are independent:

- T003 (new `gemini.ts`) alongside T001/T002 (`index.ts`, `http.ts`) and T005/T006 (`environment-manager.ts`). These are three different files.

```text
Parallel batch A: T001, T003, T005
Parallel batch B: T002, T006   (after A)
```

---

## Implementation Strategy

### MVP (US1 + US2 together)

US2 has the same P1 priority as US1 and protects the free-tier key, so the MVP is Phases 2–4. Don't point the plugin at a real key in production before T013 is done.

1. Phase 2 → the plugin is registered and the plumbing is in place.
2. US1 → extraction works (test with a real key and a low manual call count).
3. US2 → the cap is enforced. **Stop and validate** (quickstart cap steps).

### Incremental Delivery

4. US4 → the prompt helper.
5. US3 → UI verification pass.
6. Polish → full turbo pipeline + manual SC checks.

## Notes

- Every task edits files under `apps/scheduler/src/`. `packages/common` and `apps/web` should not change. If a change there seems necessary, stop and flag it (plan.md: Constitution IV/II).
- Don't touch `_cronulent_dispatch` in the shell preamble or the Telegram/state helpers beyond T005's defaulted `timeout` parameter.
- Commit after each phase checkpoint.
