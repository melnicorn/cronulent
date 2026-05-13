# Feature Specification: Integration Hooks

**Feature Branch**: `004-integration-hooks`

**Created**: 2026-05-13

**Status**: Draft

**Input**: User description: "I want a pattern that allows 'hooks' to be called on the scheduler service to do common actions like send a telegram message. We will have helper scripts (in python and node) that automatically get injected into the user's environment so functions can be called. Then we will need admin page to set up things like keys, etc."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Call Integration Functions From a Task Script (Priority: P1)

An administrator writes a Python or Node.js task script and wants to send a Telegram notification when the script finishes — without writing Telegram API plumbing themselves. A helper utility is automatically available in the script's environment, so they can call it in one line. The helper reads credentials that are configured centrally; the script author never handles tokens directly.

**Why this priority**: This is the core value of the feature. The admin page and credential storage only matter if scripts can actually consume them — this story proves the end-to-end flow works.

**Independent Test**: Can be fully tested by writing a Python or Node.js task that calls a helper function (e.g., send a Telegram message), running it via "run now", and verifying the message is received and the execution record shows success.

**Acceptance Scenarios**:

1. **Given** a Python task script that calls the Telegram helper function, **When** the task executes, **Then** a Telegram message is sent to the configured destination and the helper call does not cause the script to fail.
2. **Given** a Node.js task script that calls the Telegram helper function, **When** the task executes, **Then** the same outcome occurs — the helper works identically across both runtimes.
3. **Given** a task that calls a helper function but the relevant integration is not configured (no token set), **When** the task executes, **Then** the helper call raises a clear error indicating configuration is missing — it does not silently succeed or send to the wrong destination.
4. **Given** a task that does not call any helper functions, **When** it executes, **Then** the injected helpers have no effect on execution and add no measurable overhead.

---

### User Story 2 - Configure Integration Credentials in the Admin UI (Priority: P2)

An administrator navigates to a settings page in the web UI to configure credentials for integrations (e.g., a Telegram bot token and default chat ID). Credentials are saved securely and are immediately available to any task that uses the corresponding helper. No restarts or redeployments are required.

**Why this priority**: Without stored credentials, helper functions cannot operate. This story enables the full end-to-end flow from US1.

**Independent Test**: Can be fully tested by navigating to the admin settings page, entering a Telegram bot token and chat ID, saving, then running a task that sends a Telegram message and confirming receipt.

**Acceptance Scenarios**:

1. **Given** the admin settings page is open, **When** the administrator enters and saves a Telegram bot token and chat ID, **Then** the credentials are persisted and any subsequent task execution that calls the Telegram helper uses the saved values.
2. **Given** an integration credential has been saved, **When** the administrator views the settings page, **Then** the token is displayed masked (not in plain text) while the chat ID is visible.
3. **Given** saved credentials, **When** the administrator updates or clears them and saves, **Then** subsequent task executions immediately use the new or absent values.

---

### User Story 3 - Lifecycle Hooks: Auto-Notify on Task Outcome (Priority: P3)

An administrator configures a task to automatically send a notification on success, failure, or both — without writing any code in the task script. This is a per-task configuration option. The notification is dispatched by the scheduler after execution completes, independent of whether the script itself called any helper functions.

**Why this priority**: This provides the notification capability to shell scripts and executables (which cannot call library functions), and reduces boilerplate for common "alert me if this fails" patterns.

**Independent Test**: Can be fully tested by enabling "notify on failure" for a shell task, causing the task to fail (e.g., `exit 1`), and confirming a notification is sent without any helper calls in the script body.

**Acceptance Scenarios**:

1. **Given** a task with "notify on failure" configured, **When** the task exits with a non-zero code, **Then** a notification is sent via the configured integration with the task name, exit code, and timestamp.
2. **Given** a task with "notify on success" configured, **When** the task exits with code 0, **Then** a notification is sent.
3. **Given** a task with no lifecycle notifications configured, **When** it executes (success or failure), **Then** no notification is sent.
4. **Given** a task with lifecycle notifications configured but no integration credentials saved, **When** the task completes, **Then** the notification attempt is skipped and logged — it does not cause the task to be marked as failed.

---

### Edge Cases

- What happens if a helper function is called but the external service (e.g., Telegram API) is unreachable — does this fail the task or just log a warning?
- Can the same helper be called multiple times in one script (e.g., progress updates)?
- What happens if a script calls a helper for an integration that exists but the credentials are wrong (authentication failure)?
- Are integration credentials scoped globally (all tasks share one Telegram config) or per-task?

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The scheduler MUST inject pre-built helper utilities into the working directory of every Python and Node.js task before execution.
- **FR-002**: Helper utilities MUST provide at minimum a function to send a Telegram message, accepting a message string and optional destination override.
- **FR-003**: Helper utilities MUST read integration credentials from centrally stored configuration — credentials MUST NOT be hardcoded or passed as script arguments.
- **FR-004**: If an integration's credentials are not configured, the helper function MUST raise a clear, descriptive error rather than silently failing.
- **FR-005**: The Python and Node.js helper APIs MUST be functionally equivalent — the same capabilities are available in both runtimes.
- **FR-006**: The admin settings page MUST allow administrators to enter, update, and clear credentials for each supported integration.
- **FR-007**: Stored credentials MUST be persisted alongside other scheduler configuration and MUST NOT be exposed in plain text in the UI.
- **FR-008**: Tasks MUST be configurable with lifecycle notifications (on success, on failure, or both) that are triggered by the scheduler automatically after execution.
- **FR-009**: Lifecycle notification failures MUST NOT affect the recorded outcome of the task execution — a notification send error is logged but does not change the task's exit status.
- **FR-010**: Helper injection MUST be additive — existing task scripts that do not call any helpers are unaffected.

### Key Entities

- **Integration**: A named external service (e.g., Telegram) with associated credential fields. Stored globally in scheduler configuration.
- **Helper Module**: A versioned file provided by the scheduler and copied into each task's working directory at setup time. One per supported runtime (Python, Node.js).
- **Lifecycle Notification**: A per-task configuration specifying which outcomes (success, failure) trigger an automatic notification and via which integration.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A task script that calls a helper function to send a Telegram message succeeds in delivering the message in 100% of test runs where credentials are correctly configured.
- **SC-002**: A task script that does not call any helpers shows zero measurable difference in execution time versus the same task before the feature was introduced.
- **SC-003**: An administrator can configure all supported integration credentials in under 2 minutes using the admin UI.
- **SC-004**: A lifecycle notification is dispatched within 5 seconds of the task execution completing.
- **SC-005**: A task configured with lifecycle notifications but missing credentials produces a logged warning and completes normally — 0% of such tasks are incorrectly marked as failed.

## Assumptions

- Telegram is the first integration; the feature is designed to support additional integrations (Slack, webhook, email) in future iterations without architectural changes.
- Credentials are stored globally and shared across all tasks; per-task credential overrides are out of scope for this iteration.
- Helper functions that call external services may fail due to network issues; by default these failures log a warning but do not fail the task. Lifecycle hook failures follow the same rule.
- The admin settings page is accessible to any authenticated user (there is only one user role at present).
- Helper module versioning (updating the helper without breaking existing task scripts) is a future concern; for now, helpers can be updated in place.
- Shell and executable task types can only use lifecycle notifications (not injected helpers) since they cannot import modules.
