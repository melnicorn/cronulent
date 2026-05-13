# Feature Specification: Sandboxed Script Execution

**Feature Branch**: `002-sandbox-script-execution`

**Created**: 2026-05-13

**Status**: Draft

**Input**: User description: "Sandbox script execution in Docker by running scripts under a restricted `script-runner` OS user. The scheduler process owns environment setup (writing files, installing deps), but script execution is delegated to the runner user via sudo or su. The runner user has no write access to the host filesystem outside its temp directory, cannot bind network ports, and runs with a restricted set of Linux capabilities. This enforces separation between scheduler (trusted, privileged) and scripts (untrusted, isolated)."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Scripts Cannot Escape Their Sandbox (Priority: P1)

An administrator deploys Cronulent and schedules a task that runs user-defined scripts. They need confidence that even a malicious or buggy script cannot modify system files, read sensitive scheduler data, access other tasks' environments, or interfere with the host system. Scripts run in a tightly constrained context that limits what they can do to the host.

**Why this priority**: This is the core security guarantee. Without it, all other features of the sandbox are meaningless — a script that can write anywhere or bind to ports can undermine the entire system.

**Independent Test**: Can be fully tested by running a script that attempts to write outside its allowed directory, bind a network port, or read scheduler config — all attempts should fail or be denied, while legitimate script output and exit codes are still captured correctly.

**Acceptance Scenarios**:

1. **Given** a scheduled task whose script attempts to write a file outside its designated working directory, **When** the task executes, **Then** the write is denied and the execution is recorded as failed with a clear error message.
2. **Given** a scheduled task whose script attempts to bind a listening network port, **When** the task executes, **Then** the bind fails and the script cannot receive inbound connections.
3. **Given** a scheduled task whose script attempts to read the scheduler's configuration or data files, **When** the task executes, **Then** the read is denied and the scheduler's data remains inaccessible.
4. **Given** a scheduled task that runs a well-formed script with no malicious intent, **When** the task executes, **Then** the script completes successfully, its output is captured, and its exit code is recorded accurately.

---

### User Story 2 - Scheduler Retains Full Control Over Environment Setup (Priority: P2)

The scheduler process, running with elevated privileges, prepares the script environment before execution — writing script files, installing dependencies, and configuring the working directory. Only after preparation is complete does execution hand off to the restricted user. This ensures the environment is always in a known good state and that the restricted user cannot tamper with setup.

**Why this priority**: Separating setup (privileged) from execution (restricted) is what makes the sandbox coherent. If the runner user could also perform setup, they could self-escalate by modifying their own environment before running.

**Independent Test**: Can be fully tested by verifying that dependency installation, script file writes, and directory creation are performed by the scheduler process, and that the runner user's execution starts only after these steps are confirmed complete.

**Acceptance Scenarios**:

1. **Given** a task with declared dependencies, **When** the task is saved or updated, **Then** the scheduler installs all dependencies into the task's isolated directory before any execution occurs, and the runner user's access begins only at script launch time.
2. **Given** a task whose environment has been prepared by the scheduler, **When** the runner user executes the script, **Then** the runner user cannot modify the installed dependencies or overwrite the script file.
3. **Given** a scheduler restart, **When** a task is triggered, **Then** the scheduler re-validates the environment before handing off to the runner, ensuring stale or corrupted environments are detected.

---

### User Story 3 - Sandbox Failures Are Observable (Priority: P3)

When a script is killed or denied due to sandbox constraints, the failure is surfaced clearly in the task execution history. Administrators can distinguish between a sandbox violation (script tried to do something forbidden) and a normal script error (bad logic, missing dependency). This helps with debugging and auditing.

**Why this priority**: Without visibility, operators cannot tell if a task is failing due to their code or due to the sandbox, leading to frustrating debugging experiences.

**Independent Test**: Can be fully tested by running a script designed to trigger a sandbox violation and confirming that the execution record shows a distinct status or message that identifies the sandbox as the cause.

**Acceptance Scenarios**:

1. **Given** a script that is terminated by the sandbox for a policy violation, **When** the execution record is viewed, **Then** the status reflects that the script was killed by the system (not a normal exit), and a reason is provided where possible.
2. **Given** a script that exits normally with a non-zero exit code (application error), **When** the execution record is viewed, **Then** it is clearly distinguishable from a sandbox-terminated execution.

---

### Edge Cases

- What happens when a script spawns child processes — are those children also constrained to the sandbox?
- How does the sandbox handle scripts that consume excessive memory or CPU — is resource exhaustion in scope?
- What happens if the runner user account is misconfigured or absent on a given host?
- Can a script read environment variables injected by the scheduler, and is that intentional?

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST execute all script types (shell, Python, Node.js) under a separate, unprivileged OS user account distinct from the scheduler process user.
- **FR-002**: The runner user MUST have write access only to the task's designated working directory; all writes outside that directory MUST be denied.
- **FR-003**: The runner user MUST be prevented from binding to network ports (inbound connections); outbound network access may be permitted.
- **FR-004**: The runner user MUST run with a reduced set of OS-level privileges; unnecessary capabilities MUST be removed.
- **FR-005**: The scheduler process MUST complete all environment setup (writing scripts, installing dependencies) before delegating execution to the runner user.
- **FR-006**: The runner user MUST NOT be able to modify files written by the scheduler during environment setup (script files, installed packages).
- **FR-007**: The system MUST capture the script's stdout, stderr, and exit code regardless of whether the script was terminated normally or by sandbox enforcement.
- **FR-008**: Execution records MUST distinguish between normal exits (including non-zero), sandbox-terminated exits, and setup failures.
- **FR-009**: Child processes spawned by the script MUST inherit the same sandbox restrictions as the parent.
- **FR-010**: The sandbox MUST apply uniformly to all task types; there MUST NOT be task types that bypass sandboxing.

### Key Entities

- **Script Runner User**: An OS-level account with restricted permissions used solely for script execution. Has no login shell, no home directory write access, and no elevated privileges.
- **Task Environment**: The isolated per-task directory prepared by the scheduler. Owned by the scheduler user; readable and executable (but not writable) by the runner user.
- **Execution Record**: The logged result of a task run, including exit status category (normal, sandbox violation, setup failure), stdout/stderr, and timing.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of script executions run under the restricted runner user — zero executions occur under the scheduler process user.
- **SC-002**: A script that attempts to write outside its working directory is denied in 100% of cases, with no data written outside the boundary.
- **SC-003**: A script that attempts to bind a listening port fails in 100% of cases under sandbox enforcement.
- **SC-004**: Legitimate scripts (no policy violations) complete with correct output capture and exit codes with no measurable increase in execution latency above 200ms overhead.
- **SC-005**: Sandbox-terminated executions are identifiable as such in the execution history with 100% accuracy — no sandbox kills are misclassified as normal failures.

## Assumptions

- The system runs inside a Docker container on Linux; Linux-native access control mechanisms are available.
- The scheduler container image can be modified to include the runner user account and required permission configurations.
- Outbound network access from scripts is permitted; only inbound (port binding) is restricted.
- Resource limits (CPU, memory) for scripts are out of scope for this feature — that is a separate concern.
- The runner user can read environment variables passed to it by the scheduler (task-level env vars), as this is required for scripts to function correctly.
- This feature applies only to the Docker deployment path; local development (`pnpm dev`) is out of scope.
