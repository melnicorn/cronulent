# Feature Specification: Integration Hooks

**Feature Branch**: `004-integration-hooks`

**Created**: 2026-05-13

**Status**: Draft

**Input**: User description: "I want a pattern that allows 'hooks' to be called on the scheduler service to do common actions like send a telegram message. We will have helper scripts (in python and node) that automatically get injected into the user's environment so functions can be called. Then we will need admin page to set up things like keys, etc."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Call Plugin Helper Functions From a Task Script (Priority: P1)

An administrator writes a Python or Node.js task script and wants to send a Telegram notification when the script finishes — without writing Telegram API plumbing themselves. A helper utility is automatically available in the script's environment, so they can call it in one line. The helper reads plugin configuration parameters that are set centrally by an admin; the script author never handles tokens or chat IDs directly — they only pass the user-facing arguments (e.g., message title, text).

**Why this priority**: This is the core value of the feature. The admin page and plugin configuration only matter if scripts can actually consume them — this story proves the end-to-end flow works.

**Independent Test**: Can be fully tested by writing a Python or Node.js task that calls a helper function (e.g., send a Telegram message), running it via "run now", and verifying the message is received and the execution record shows success.

**Acceptance Scenarios**:

1. **Given** a Python task script that calls the Telegram helper function, **When** the task executes, **Then** a Telegram message is sent to the configured destination and the helper call does not cause the script to fail.
2. **Given** a Node.js task script that calls the Telegram helper function, **When** the task executes, **Then** the same outcome occurs — the helper works identically across both runtimes.
3. **Given** a task that calls a helper function but the relevant plugin is not enabled or configured, **When** the task executes with `strict=False` (default), **Then** the call is a no-op and a warning is logged — the task does not fail.
4. **Given** a task that calls a helper function with `strict=True` but the plugin is not enabled or configured, **When** the task executes, **Then** the helper raises a clear error indicating the plugin is unavailable.
5. **Given** a task that does not call any helper functions, **When** it executes, **Then** the injected helpers have no effect on execution and add no measurable overhead.

---

### User Story 2 - Manage Plugins and Configure Plugin Settings in the Admin UI (Priority: P2)

An administrator navigates to the "Manage Plugins" page in the web UI to see all available plugins, enable the ones they want to use, and configure global settings for each enabled plugin (e.g., a Telegram bot token and default chat ID). These global settings are admin-only — task script authors never see or handle them. No restarts or redeployments are required after saving.

**Why this priority**: Without enabled and configured plugins, helper functions cannot operate. This story enables the full end-to-end flow from US1.

**Independent Test**: Can be fully tested by navigating to the Manage Plugins page, enabling the Telegram plugin, entering a bot token and chat ID, saving, then running a task that calls the Telegram helper and confirming receipt.

**Acceptance Scenarios**:

1. **Given** the Manage Plugins page is open, **When** the administrator enables a plugin, **Then** it appears as enabled and its configuration page becomes accessible.
2. **Given** a plugin's configuration page is open, **When** the administrator enters and saves the global configuration parameters (e.g., bot token and chat ID), **Then** the configuration is persisted and any subsequent task execution that calls that plugin's helper uses the saved values.
3. **Given** a plugin's configuration has been saved, **When** the administrator views the configuration page, **Then** sensitive fields (e.g., tokens) are displayed masked while non-sensitive fields (e.g., chat ID) are visible.
4. **Given** saved plugin configuration, **When** the administrator updates or clears it and saves, **Then** subsequent task executions immediately use the new or absent values.

---

### User Story 3 - Lifecycle Hooks: Auto-Notify on Task Outcome (Priority: P3)

An administrator configures a task to automatically send a notification on success, failure, or both — without writing any code in the task script. This is a per-task configuration option. The notification is dispatched by the scheduler after execution completes, independent of whether the script itself called any helper functions.

**Why this priority**: This provides the notification capability to shell scripts and executables (which cannot call library functions), and reduces boilerplate for common "alert me if this fails" patterns.

**Independent Test**: Can be fully tested by enabling "notify on failure" for a shell task, causing the task to fail (e.g., `exit 1`), and confirming a notification is sent without any helper calls in the script body.

**Acceptance Scenarios**:

1. **Given** a task with "notify on failure" configured, **When** the task exits with a non-zero code, **Then** a notification is sent via the configured plugin with the task name, exit code, and timestamp.
2. **Given** a task with "notify on success" configured, **When** the task exits with code 0, **Then** a notification is sent.
3. **Given** a task with no lifecycle notifications configured, **When** it executes (success or failure), **Then** no notification is sent.
4. **Given** a task with lifecycle notifications configured but no plugin configuration saved, **When** the task completes, **Then** the notification attempt is skipped and logged — it does not cause the task to be marked as failed.

---

### Edge Cases

- If a helper function is called but the external service (e.g., Telegram API) is unreachable, `strict=False` logs a warning and continues; `strict=True` raises an error.
- A helper can be called multiple times in one script (e.g., progress updates); each call is independent.
- If the external service rejects the request (e.g., invalid bot token), `strict=False` logs a warning; `strict=True` raises an error.
- Plugin global configuration parameters are scoped globally; all tasks share one configuration per plugin.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The scheduler MUST inject all plugin helper utilities into the working directory of every Python and Node.js task before execution, regardless of whether the task uses them.
- **FR-002**: Each plugin's helper utility MUST expose its functions with signatures defined by the plugin's function API schema (e.g., Telegram: `send_message(title, text, strict=False)`). Every helper function MUST accept an optional `strict` parameter (default: `False`). Task script authors only pass user-facing arguments; global configuration parameters (e.g., bot token) are injected automatically.
- **FR-003**: Helper utilities MUST read plugin global configuration parameters from centrally stored configuration — these parameters MUST NOT be hardcoded or passed as script arguments.
- **FR-004**: If a plugin is disabled or its global configuration is absent, helper function behavior is controlled by the `strict` parameter: when `strict=True`, the function raises a clear, descriptive error; when `strict=False` (default), the call is a no-op and a warning is recorded in the execution log.
- **FR-005**: The Python and Node.js helper APIs MUST be functionally equivalent — the same capabilities are available in both runtimes.
- **FR-006**: The admin UI MUST provide a "Manage Plugins" page listing all available plugins (discovered from the file-based registry) with their enabled/disabled status. Administrators can enable or disable individual plugins from this page.
- **FR-007**: Each enabled plugin MUST have a dedicated configuration page where administrators can enter, update, and clear its global configuration parameters. Sensitive fields (e.g., API tokens) MUST be stored securely and displayed masked in the UI.
- **FR-008**: Tasks MUST be configurable with lifecycle notifications (on success, on failure, or both) that are triggered by the scheduler automatically after execution.
- **FR-009**: Lifecycle notification failures MUST NOT affect the recorded outcome of the task execution — a notification send error is logged but does not change the task's exit status.
- **FR-010**: Helper injection MUST be additive — existing task scripts that do not call any helpers are unaffected.
- **FR-011**: Plugins MUST be registered via a file-based registry — each plugin is a self-contained module/manifest file in a `plugins/` directory. Adding a new plugin requires no changes to core application code.
- **FR-012**: Each plugin manifest MUST declare an **admin configuration schema** — the global parameters an administrator fills in (field name, type, label, sensitive flag, required). These are never exposed to task script authors.
- **FR-013**: Each plugin manifest MUST declare a **function API schema** — the callable functions exposed to task script authors, with each function's name, parameters (name, type, description), and the `strict` parameter. The admin configuration parameters are not visible in this schema.
- **FR-014**: The per-plugin configuration page MUST display dynamic usage documentation rendered from the function API schema: (1) a copyable code snippet showing the function call with placeholder values for each parameter, and (2) a reference table listing each parameter's name, type, and description.

### Key Entities

- **Plugin**: A self-contained module/manifest file in the `plugins/` registry directory. Declares two schemas: an admin configuration schema (global parameters set by the administrator, e.g., bot token, chat ID) and a function API schema (callable functions and their user-facing parameters). Also carries enabled state.
- **Helper Module**: A file generated from the plugin's function API schema and injected into each task's working directory at execution time. One per supported runtime (Python, Node.js) per plugin. Reads admin configuration at call time; never exposes it to the script author.
- **Lifecycle Notification**: A per-task configuration specifying which outcomes (success, failure) trigger an automatic notification and via which plugin.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A task script that calls a helper function to send a Telegram message succeeds in delivering the message in 100% of test runs where the plugin is enabled and configured.
- **SC-002**: A task script that does not call any helpers shows zero measurable difference in execution time versus the same task before the feature was introduced.
- **SC-003**: An administrator can enable a plugin and complete its global configuration in under 2 minutes using the admin UI.
- **SC-004**: A lifecycle notification is dispatched within 5 seconds of the task execution completing.
- **SC-005**: A task configured with lifecycle notifications but with no plugin configuration saved produces a logged warning and completes normally — 0% of such tasks are incorrectly marked as failed.

## Assumptions

- Telegram is the first plugin; the file-based registry architecture is designed to support additional plugins (Slack, webhook, email) without architectural changes.
- Plugin global configuration parameters are stored globally and shared across all tasks; per-task overrides are out of scope for this iteration.
- Helper functions that call external services may fail due to network issues; by default these failures log a warning but do not fail the task. Lifecycle hook failures follow the same rule.
- The Manage Plugins page and per-plugin configuration pages are accessible to any authenticated user (there is only one user role at present).
- Helper module versioning (updating the helper without breaking existing task scripts) is a future concern; for now, helpers can be updated in place.
- Shell and executable task types can only use lifecycle notifications (not injected helpers) since they cannot import modules.

## Clarifications

### Session 2026-05-14

- Q: How are plugins registered/discovered in the system? → A: File-based registry — each plugin is a self-contained module/manifest in a `plugins/` directory; new plugins are added by dropping in a new file without touching core code.
- Q: When a script calls a helper for a disabled/unconfigured plugin, what happens? → A: Optional `strict` parameter on every helper function — `strict=False` (default) silently skips and logs a warning; `strict=True` raises a hard error. This lets script authors choose based on whether the notification is critical or informational.
- Q: How does each plugin define its configuration fields so the UI can render forms and usage docs dynamically? → A: Plugin manifest declares two separate schemas — (1) an admin configuration schema (global parameters the admin fills in, e.g., bot token, chat ID; never exposed to task authors) and (2) a function API schema (callable functions and their user-facing parameters, e.g., title, text; admin config is injected automatically).
- Q: What format should the dynamic usage documentation take on the per-plugin config page? → A: Both — a copyable code snippet (function call with placeholder values) at the top, and a reference table (parameter name, type, description) below it.
- Q: What is the canonical term for the plugin concept in the UI and codebase? → A: "Plugin" (formerly referred to as "Integration" in earlier drafts).
