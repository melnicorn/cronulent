# Research: Gemini LLM Plugin

## R1 — Structured output via the Gemini REST API

- **Decision**: Call `POST https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent`. For `extract`, send `generationConfig.responseMimeType = "application/json"` and `generationConfig.responseJsonSchema = <script's schema>`. Put `instructions` in `systemInstruction` and the input text as the single user turn.
- **Rationale**: `responseJsonSchema` accepts standard JSON Schema, which is what script authors will naturally write. The older `responseSchema` field takes an OpenAPI-subset object with different conventions (e.g., uppercase `type` enums). Keeping instructions separate from the untrusted input text makes the prompt harder to hijack with the input text.
- **Alternatives**: `responseSchema` (non-standard shape, would need translation). Prompt-only "reply in JSON" with no schema enforcement (fragile, which is the problem this feature exists to solve).

## R2 — API key transport

- **Decision**: Send the key in the `x-goog-api-key` request header, not the `?key=` query parameter that `release-notes.sh` uses.
- **Rationale**: FR-003 requires that the key never appear in logs or error messages. Node `fetch` errors and any logged URL can include the query string. The header keeps it out of both.

## R3 — Generation parameters

- **Decision**: Don't set `temperature` or other sampling parameters. Use the model defaults.
- **Rationale**: Google recommends keeping Gemini 3-series models at their default temperature. Schema-constrained output already makes the format deterministic. The spec keeps these out of script control.

## R4 — Response handling

- **Decision**:
  - Non-2xx HTTP: fail with `[gemini] HTTP <status>: <error.message from body>`. A 429 is reported as a quota/rate-limit error.
  - No `candidates`: fail with `blocked (<promptFeedback.blockReason>)`.
  - Text is the concatenation of `candidates[0].content.parts[].text`, skipping parts marked `thought`. If empty, fail with `empty response (finishReason <reason>)`.
  - `extract`: `JSON.parse` the text. On a parse error, fail with `response was not valid JSON`.
- **Rationale**: Covers the spec's edge cases (blocked, empty, unparseable, quota) with clear messages and no key material.

## R5 — Enforcing the daily cap atomically

- **Decision**: Store the usage record in the existing `StateStore` under the reserved key `__gemini_usage__`. Wrap the read-check-increment in a module-level serializer (`createSerializer()` from `serialize.ts`). Reserve the slot (increment) *before* sending the request.
- **Rationale**:
  - The scheduler is a single Node process, so a process-level serializer is enough for FR-013.
  - Reserving first means a failed request has already been counted (FR-008), and concurrent calls can't both see "one left".
  - `StateStore` already persists atomically to `data/state.json5` (FR-009).
  - Job keys are 64-character hex HMACs, so a key with underscores can never clash with one.
- **Alternatives**:
  - An in-memory counter: resets on restart, which violates FR-009.
  - A new `usage.json5` file: another store to maintain for one integer.
  - A new `StateStore.update()` method: works, but changes a shared class for one caller.

## R6 — Quota day boundary

- **Decision**: `day = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles' }).format(now)`, which gives `YYYY-MM-DD`. If the stored `day` differs from today, treat the count as 0.
- **Rationale**: Follows Pacific wall-clock time, including DST changes. `node:22-slim` ships full ICU, so time zone data is available. No dependency needed.

## R7 — Timeouts (FR-011)

- **Decision**:
  - The server aborts the Gemini request after 60 s (`AbortSignal.timeout(60_000)`).
  - The Python helper's `_cronulent_dispatch` gains a `timeout` parameter (default 10 s, unchanged for other plugins). Gemini helpers pass 90 s, so the server's 60 s failure arrives as a clear error before the client gives up.
  - The Node helper has no client timeout today, and shell `curl` has no `--max-time`, so neither needs changing. The server-side abort bounds them.
- **Rationale**: This is the smallest change that satisfies FR-011 without altering Telegram/state behavior.

## R8 — Returning results to shell scripts

- **Decision**: Add a `_cronulent_dispatch_result` function to the shell preamble. It builds the JSON body, POSTs it, and on success prints `result`: strings as raw text, anything else as JSON. The gemini shell helpers build their params JSON with `python3 -c 'json.dumps(...)'` so arbitrary text (quotes, newlines) is escaped correctly, and read the envelope with `python3` too.
- **Rationale**:
  - The existing `_cronulent_dispatch` sends output to `/dev/null` and interpolates params into JSON unescaped. That's fine for short Telegram strings but unsafe for scraped page text.
  - A separate function leaves existing shell helpers untouched.
  - `python3` is already installed in the scheduler image (`apps/scheduler/Dockerfile`), and `jq` isn't.
- **Alternatives**: Change `_cronulent_dispatch` in place (changes behavior for existing callers). Add `jq` to the image (new system dependency).

## R9 — Enabled check

- **Decision**: Add an optional `pluginEnabled` field to `DispatchServices`, populated in `http.ts` from `getPluginState(id).enabled`. The gemini dispatch refuses calls when it's false or the API key is blank.
- **Rationale**: The generic dispatch path doesn't check `enabled` today, and adding a global check would break the hidden `state` plugin (never "enabled") and change Telegram's behavior. Scoping the check to gemini keeps the change surgical.

## R10 — Admin config field types

- **Decision**: Keep the existing `'string' | 'secret'` field types. `dailyLimit` is a `string` field parsed at dispatch: blank means 20, `^\d+$` means that number, anything else fails with `[gemini] dailyLimit must be a whole number` and is not counted. Defaults are shown in the field labels.
- **Rationale**: Adding a `number` field type would mean changes to the common entity, schemas, and web form for one field.
