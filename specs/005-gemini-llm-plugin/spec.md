# Feature Specification: Gemini LLM Plugin

**Feature Branch**: `005-gemini-llm-plugin`

**Created**: 2026-09-27

**Status**: Draft

**Input**: User description: "Gemini LLM plugin: a new built-in cronulent plugin ("gemini") that lets task scripts (Python, Node, shell) call Google Gemini to interpret unstructured text and return structured JSON. Admin config on the Plugins page: API key (secret), model (default gemini-3.1-flash-lite), and daily call limit. The API key never leaves the scheduler — scripts call through the existing plugins.dispatch proxy, and the scheduler makes the Gemini request. Scripts call something like cronhooks.gemini.extract(instructions, text, schema) where schema is a JSON schema; Gemini structured output is used and the helper returns the parsed object. Also a plain free-text prompt call. Daily cap enforced server-side in dispatch: counter persisted across scheduler restarts, resets at midnight US Pacific to align with Gemini free-tier quota resets, counts every outbound request including failed ones. When the cap is reached: strict=True raises, otherwise logs a warning and returns None/undefined, following the existing plugin strict convention. The cap only covers cronulent usage. The dispatch helper timeout must be long enough for LLM calls. Out of scope: Facebook or any specific data source, other LLM providers, per-task limits."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Extract Structured Data From Unstructured Text (Priority: P1)

A script author has a scheduled job that collects free-form text (a web page, a social post, an email body) whose wording and format they can't predict. They want to ask a question of that text, such as "does this announce a reopening date, and if so, what is it?", and get back a structured result with fields they defined, so the script can branch on it (e.g., send a Telegram alert when `found` is true). They make one helper call with instructions, the text, and a description of the result shape. They never handle the API key.

**Why this priority**: This is the reason the feature exists. Without structured extraction, scripts would have to parse free-form LLM prose, which is fragile.

**Independent Test**: With the plugin enabled and configured, run a Python task via "Run Now" that calls the extract helper on a sample paragraph containing a date, with a result shape of `{found: boolean, date: string}`. Verify the script receives a parsed object with `found = true` and the correct date, and the execution succeeds.

**Acceptance Scenarios**:

1. **Given** the plugin is enabled and configured, **When** a Python task calls extract with instructions, text, and a result schema, **Then** the helper returns a native object/dict matching the schema.
2. **Given** the same setup, **When** a Node.js task makes the same call, **Then** it receives an equivalent parsed object.
3. **Given** the same setup, **When** a shell task makes the same call, **Then** the result JSON is written to the helper's standard output so the script can capture it (e.g., with `$(...)`).
4. **Given** text that does not contain the requested information, **When** extract is called, **Then** the result still conforms to the schema (e.g., `found = false`) rather than erroring.
5. **Given** a script author inspects the task's environment or the helper files, **When** they look for the Gemini API key, **Then** it is not present anywhere the script can read.

---

### User Story 2 - Daily Call Cap (Priority: P1)

The administrator uses a free-tier Gemini key and doesn't want scheduled jobs (including a buggy one stuck in a loop) to exhaust the daily quota. They set a daily call limit on the plugin's settings page. Once cronulent has made that many Gemini requests in the current quota day, further calls are refused without contacting Gemini, until the quota day resets.

**Why this priority**: The admin needs this protection before trusting the plugin on a free-tier key. It ships alongside Story 1.

**Independent Test**: Set the daily limit to 2. Run a task that calls the helper 3 times with `strict=False`. Verify the first two return results, the third returns an empty value with a warning in the task output, and only two requests reached Gemini. Restart the scheduler and run again the same day; verify the call is still refused.

**Acceptance Scenarios**:

1. **Given** the daily limit is N and N requests have been made today, **When** a script calls any Gemini helper with `strict=False`, **Then** the call returns an empty value (`None`/`undefined`/empty output), a warning stating the daily limit was reached is written to the task's output, and no request is sent to Gemini.
2. **Given** the limit has been reached, **When** a script calls a helper with `strict=True`, **Then** the helper raises an error stating the daily limit was reached.
3. **Given** the limit was reached, **When** the scheduler restarts during the same quota day, **Then** calls are still refused.
4. **Given** the limit was reached, **When** the time passes midnight US Pacific, **Then** calls succeed again and the count starts from zero.
5. **Given** a request to Gemini fails (network error, HTTP error, unparseable response), **When** it is counted, **Then** it still uses up one call of the daily allowance.
6. **Given** two tasks call the helper at the same moment with one call left, **When** both calls are processed, **Then** at most one request is sent to Gemini.

---

### User Story 3 - Configure the Plugin in the Admin UI (Priority: P2)

The administrator opens the Plugins page, sees a "Gemini" plugin, enables it, enters an API key, optionally changes the model, and sets the daily limit. The settings page shows usage examples for each helper function, like other plugins do.

**Why this priority**: The plugin needs this to work, but it reuses the existing plugin admin UI, so it is mostly configuration rather than new UI.

**Independent Test**: On the Plugins page, enable Gemini, enter a key, save, reload. Verify the key is masked, the model shows its default, and saving the form again without editing the key does not clear it.

**Acceptance Scenarios**:

1. **Given** the Plugins page, **When** the admin views the plugin list, **Then** "Gemini" appears with its description.
2. **Given** the Gemini settings page, **When** the admin saves an API key, **Then** it is shown masked afterwards and isn't overwritten when the form is re-saved without changes.
3. **Given** the model field was left blank, **When** a helper is called, **Then** `gemini-3.1-flash-lite` is used.
4. **Given** the plugin is disabled or has no API key, **When** a script calls a helper with `strict=False`, **Then** it returns an empty value and logs a warning, and with `strict=True` it raises. No call is counted.

---

### User Story 4 - Free-Text Prompt (Priority: P3)

A script author wants a plain text answer, such as a one-paragraph summary of changed page content to include in a Telegram alert. They call a prompt helper with a prompt and get text back.

**Why this priority**: Useful, but extraction covers the main use case.

**Independent Test**: Run a task that calls the prompt helper with "Summarize: <text>" and verify it returns a non-empty string.

**Acceptance Scenarios**:

1. **Given** the plugin is configured, **When** a script calls the prompt helper, **Then** it receives the model's text response as a string.
2. **Given** a prompt call, **When** it is made, **Then** it counts toward the same daily limit as extract calls.

---

### Edge Cases

- **Model returns output that doesn't parse as JSON, or is blocked/empty** (e.g., safety filtering): the call is treated as failed. Non-strict returns empty with a warning; strict raises with the reason. The call counts.
- **Invalid schema supplied by the script**: if Gemini rejects the request, it fails like any other request and counts. The helper does not validate schemas itself.
- **Gemini returns a quota/rate-limit error** (e.g., because GitHub Actions used the shared quota): the call fails like any other request and counts. The error message says it was a quota/rate-limit error.
- **Slow responses**: helper calls wait long enough for normal LLM response times (see FR-011) instead of timing out at the current 10-second dispatch limit.
- **Daily limit set to 0**: all calls are refused.
- **Daily limit changed mid-day**: takes effect on the next call. Today's existing count is kept (lowering the limit below today's count blocks further calls until reset).
- **Daylight saving transitions**: the quota day always follows the US Pacific wall clock (America/Los_Angeles), not a fixed UTC offset.
- **Calls rejected before sending** (cap reached, plugin disabled/unconfigured, missing required arguments): do not count.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST provide a built-in plugin with id `gemini`, listed on the Plugins page, following the same enable/configure pattern as existing plugins.
- **FR-002**: Plugin settings MUST include: API key (secret, masked), model (text, defaults to `gemini-3.1-flash-lite` when blank), and daily call limit (non-negative whole number, default 20).
- **FR-003**: The API key MUST be used only inside the scheduler. It MUST NOT be placed in task environment variables, generated helper files, task output, or error messages.
- **FR-004**: Scripts in Python, Node.js, and shell MUST be able to call an **extract** helper with: instructions (text), input text, a result schema (JSON Schema object), and an optional `strict` flag (default false).
- **FR-005**: The extract helper MUST ask Gemini for output constrained to the given schema and return the parsed result as a native value (Python dict/list, JavaScript object/array). The shell helper MUST write the result JSON to standard output.
- **FR-006**: Scripts in Python, Node.js, and shell MUST be able to call a **prompt** helper with a prompt (text) and optional `strict` flag, which returns the model's text response (shell: written to standard output).
- **FR-007**: The system MUST enforce the daily call limit on the scheduler side, so scripts cannot bypass it.
- **FR-008**: Every request the scheduler sends to Gemini MUST count as one call, whether or not it succeeds. Calls refused before sending MUST NOT count.
- **FR-009**: The daily call count MUST survive scheduler restarts and redeployments.
- **FR-010**: The daily count MUST reset at midnight in the America/Los_Angeles time zone.
- **FR-011**: Gemini helper calls MUST allow at least 60 seconds for a response before timing out. Other plugins' helper calls keep their current timeout.
- **FR-012**: When a call can't be completed (limit reached, plugin disabled or unconfigured, Gemini error, unparseable response), the helper MUST follow the existing `strict` convention: non-strict returns an empty value and writes a warning to the task output; strict raises/exits non-zero with a message that states the reason.
- **FR-013**: Concurrent calls from multiple tasks MUST NOT push the number of requests sent past the daily limit.
- **FR-014**: The scheduler MUST log each Gemini call with the calling outcome and the running count for the day (e.g., `[gemini] call 12/20 today: ok`), without logging the key or the prompt contents.
- **FR-015**: Each helper's usage and parameters MUST be documented on the plugin's settings page, like existing plugins.

### Key Entities

- **Gemini plugin configuration**: API key, model, daily call limit. Admin-managed and stored with other plugin settings.
- **Daily usage record**: the current quota day (a Pacific-time date) and the number of calls made on it. Stored so it persists across restarts; replaced when a new quota day begins.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A script author can get a structured answer from unstructured text with a single helper call, in Python, Node.js, or shell.
- **SC-002**: Across any single Pacific-time day, the number of requests cronulent sends to Gemini never exceeds the configured daily limit, including across restarts and simultaneous task runs.
- **SC-003**: The API key cannot be found in any task environment, helper file, execution log, or task output.
- **SC-004**: A typical extraction call (a few thousand characters of input) completes successfully without a timeout error.
- **SC-005**: Scripts that don't use the Gemini helpers behave exactly as before.

## Assumptions

- Only Google Gemini is supported, through its public generative language API. Other LLM providers are out of scope.
- No specific data source (e.g., Facebook) is part of this feature. Scripts are responsible for obtaining the text they pass in.
- The limit is global for this cronulent instance. Per-task limits are out of scope.
- The cap covers only cronulent's own requests. If the same Gemini project is used elsewhere (e.g., GitHub Actions release notes), that usage is not counted, and Gemini's own quota errors can still occur.
- Default daily limit of 20 is deliberately well below typical free-tier daily quotas. Admins can raise it.
- The daily count is stored with the existing per-job state storage, under a reserved key that can't clash with job keys. This is best-effort protection consistent with how job state is already isolated. It is not a hard security boundary against a hostile script.
- No automatic retries. Each retry would consume a call, so retrying is left to the script author.
- Generation settings (e.g., temperature) use a fixed sensible default for extraction and are not script-configurable in this version.
- Showing today's usage count in the admin UI is out of scope. Usage is visible in scheduler logs (FR-014).
- The shell helper needs changes to the shared shell dispatch function so it can return results, since the existing shell dispatch discards response bodies.
