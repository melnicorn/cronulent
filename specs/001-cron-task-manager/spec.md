# Feature Specification: Cron Task Manager

**Feature Branch**: `001-cron-task-manager`

**Created**: 2026-05-12

**Status**: Draft

**Input**: User description: "This is a monorepo that contains a fully contained task management
system. This system is composed of two pieces: a node (typescript) backend server that will run
and manages scheduling and execution of cron-like tasks. Tasks need to be flexible and be able to
run a shell script, python, initiate some other script (node, etc) and be initiated with
parameters. The second piece is a web UI that is used to administer tasks including, but not
limited to: create, update, delete, run now, etc. The UI should help out with understanding cron
syntax. The UI will need to communicate with the backend using standard, schema-based protocols
(e.g. trpc), support token-based authentication between UI and backend. The UI should be simple,
modern, and support dark and light modes."

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Schedule and Run a Task (Priority: P1)

An administrator creates a new scheduled task that runs a command (shell script, Python, Node, or
any executable) on a cron schedule. They configure the task name, command, optional parameters,
and the cron expression. Once saved, the task runs automatically at the defined interval.

**Why this priority**: This is the core product value — without the ability to create and run
scheduled tasks, nothing else matters.

**Independent Test**: Log in to the UI, create a task with a simple `echo "hello"` shell command
on a `* * * * *` schedule, wait one minute, and verify a successful execution appears in the run
history.

**Acceptance Scenarios**:

1. **Given** I am logged in to the admin UI, **When** I create a task with a valid cron expression
   and a shell command, **Then** the task is saved, appears in the task list, and executes at the
   next scheduled time.
2. **Given** a task is scheduled, **When** the cron expression fires, **Then** the backend
   executes the command in a subprocess and records the result (exit code, stdout, stderr, duration).
3. **Given** a task with parameters defined, **When** the task runs, **Then** the parameters are
   passed correctly to the command.
4. **Given** an invalid cron expression, **When** I try to save the task, **Then** the UI
   prevents saving and displays a human-readable explanation of the error.

---

### User Story 2 — Manage Existing Tasks (Priority: P2)

An administrator views, edits, pauses, resumes, deletes, and manually triggers tasks from the
admin UI without waiting for the next scheduled run.

**Why this priority**: Day-to-day operations require ongoing task management beyond initial
creation.

**Independent Test**: With at least one task already created, update its schedule, trigger it
manually, verify the execution appears in history within seconds, then delete the task and confirm
it no longer appears.

**Acceptance Scenarios**:

1. **Given** a task exists, **When** I click "Run Now", **Then** the task executes immediately and
   the run appears in execution history within seconds.
2. **Given** a task, **When** I edit its cron expression or command, **Then** the changes take
   effect on the next scheduled run.
3. **Given** a task, **When** I pause it, **Then** it stops executing on schedule until resumed.
4. **Given** a task, **When** I delete it, **Then** it is removed from the task list and no
   further executions are scheduled.

---

### User Story 3 — View Execution History and Logs (Priority: P3)

An administrator reviews past executions for any task, including status (success/failure), output,
error messages, and duration.

**Why this priority**: Observability is essential for diagnosing failures, but the system delivers
value without it in early iterations.

**Independent Test**: After a task has run at least twice, open its execution history, click one
run, and verify stdout/stderr and duration are displayed.

**Acceptance Scenarios**:

1. **Given** a task with past executions, **When** I open its history, **Then** I see a list of
   runs ordered by time, each showing status, duration, and timestamp.
2. **Given** a failed execution, **When** I view it, **Then** I see the exit code and stderr output.
3. **Given** a successful execution, **When** I view it, **Then** I see stdout output and wall-clock
   duration.

---

### User Story 4 — Authenticate and Authorize (Priority: P1)

An administrator logs in to the web UI. All API communication between UI and backend requires a
valid session token. Unauthenticated requests are rejected.

**Why this priority**: Without authentication the system is unsafe to deploy; all other user
stories depend on a secure session being in place.

**Independent Test**: Without a token, call the task list API endpoint and confirm a rejection
response. Then log in via the UI and confirm the task list is accessible.

**Acceptance Scenarios**:

1. **Given** an unauthenticated visitor, **When** they access the UI, **Then** they are shown a
   login screen and cannot access any task data.
2. **Given** valid credentials, **When** the user logs in, **Then** a session token is issued and
   all subsequent API calls succeed.
3. **Given** an expired or invalid token, **When** an API call is made, **Then** a rejection
   response is returned and the UI redirects to login.
4. **Given** a valid session, **When** the user logs out, **Then** the token is invalidated and
   the user is redirected to login.

---

### Edge Cases

- What happens when a task's command does not exist or is not executable? The execution is
  recorded as failed with the error output; the scheduler continues running other tasks normally.
- What happens when a task is already running when its next scheduled time fires? The overlapping
  run is skipped and recorded as a skipped execution with a reason; no concurrent instances of
  the same task run simultaneously.
- What happens if the backend process is restarted mid-execution? In-flight tasks are recorded as
  interrupted; scheduled tasks resume automatically.
- What happens when a task produces very large stdout/stderr output? Output is captured but
  truncated at a reasonable limit to prevent storage issues.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST allow administrators to create tasks specifying a name, command type
  (shell, Python, Node, or generic executable path), command/script, optional parameters, and a
  cron expression.
- **FR-002**: The backend MUST execute scheduled tasks according to their cron expression by
  spawning a subprocess isolated from the backend process.
- **FR-003**: The backend MUST capture stdout, stderr, exit code, and wall-clock duration for
  every execution and persist this as execution history.
- **FR-004**: The UI MUST allow administrators to view, edit, pause, resume, delete, and manually
  trigger any task.
- **FR-005**: The UI MUST display a cron expression helper that translates any valid 5-field cron
  expression into plain-language English in real time as the user types.
- **FR-006**: The UI MUST display execution history per task, including status, timestamp,
  duration, and log output.
- **FR-007**: All UI-to-backend communication MUST use a schema-validated, type-safe RPC protocol.
- **FR-008**: The backend MUST enforce token-based authentication on all endpoints; unauthenticated
  requests MUST be rejected.
- **FR-009**: The UI MUST support both dark and light color themes, defaulting to the user's
  system preference.
- **FR-010**: Task definitions MUST support parameters that are passed to the command at execution
  time.
- **FR-011**: The system MUST resume all active task schedules automatically after a backend
  restart, without administrator intervention.
- **FR-012**: Task definitions MUST support per-task environment variables that are injected into
  the subprocess environment at execution time, in addition to the system environment.

### Key Entities

- **Task**: A named, schedulable unit of work. Has a name, optional description, command type,
  command/script path, parameters, environment variables, cron expression, and enabled/paused state.
- **Execution**: A single run of a Task. Records task ID, start time, end time, duration, exit
  code, stdout, stderr, and status (running, success, failed, interrupted).
- **Schedule**: The cron expression and active/paused state governing when a Task fires.
- **Session**: An authenticated administrator session with an associated token and expiry.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An administrator can create a new scheduled task and have it execute successfully
  within 2 minutes, without consulting external documentation.
- **SC-002**: The cron expression helper explains any valid 5-field expression in plain English
  within 500ms of the user finishing input.
- **SC-003**: A manually triggered task begins executing within 3 seconds of clicking "Run Now."
- **SC-004**: Execution history for any task loads and displays results within 2 seconds.
- **SC-005**: All API endpoints reject unauthenticated requests 100% of the time; no task data
  is accessible without a valid session.
- **SC-006**: After a backend restart, all active task schedules resume automatically within
  30 seconds, with no administrator action required.
- **SC-007**: The UI is fully usable in both dark and light modes with no unreadable contrast or
  visual defects on any primary screen.

## Assumptions

- A single administrator role is sufficient for v1; multi-user RBAC is out of scope.
- The backend runs on the same host or local network as the tasks it executes; remote execution
  agents are out of scope.
- Tasks run as the same OS user as the backend process; per-task user sandboxing is out of scope.
- The initial admin credential is set via environment variable or config file at startup;
  self-service registration is out of scope.
- Execution history is retained indefinitely in v1; configurable retention or archival policies
  are out of scope.
- The web UI is the Next.js app already present in `apps/web`.
- The backend is a new standalone Node.js service added to `apps/` using native TypeScript
  execution per the project constitution.
