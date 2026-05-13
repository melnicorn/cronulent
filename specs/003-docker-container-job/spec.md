# Feature Specification: Docker Container Jobs

**Feature Branch**: `003-docker-container-job`

**Created**: 2026-05-13

**Status**: Draft

**Input**: User description: "Add ability to run a docker container as a job"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Schedule a Docker Container as a Task (Priority: P1)

An administrator wants to schedule a job that runs a Docker container on a cron schedule. They provide an image name, optional command override, and environment variables. The scheduler pulls and runs the container at the scheduled time, captures its output, and records the exit code — just like any other task type.

**Why this priority**: This is the entire scope of the feature. Everything else (logging, cleanup) serves this core capability.

**Independent Test**: Can be fully tested by creating a Docker-type task with a valid image (e.g., `alpine echo hello`), triggering it manually via "run now", and verifying the output and exit code are captured in the execution history.

**Acceptance Scenarios**:

1. **Given** a task configured with a Docker image and optional command, **When** the cron fires (or "run now" is triggered), **Then** the container runs, its stdout/stderr is captured, and its exit code is recorded in the execution history.
2. **Given** a Docker task with per-task environment variables set, **When** the container runs, **Then** those variables are injected into the container's environment.
3. **Given** a Docker task where the image does not exist locally, **When** the task executes, **Then** the scheduler pulls the image before running, and a pull failure is recorded as a failed execution with a descriptive error.
4. **Given** a Docker task where a previous container run is still in progress when the next cron fires, **When** the next trigger occurs, **Then** the new execution is skipped and recorded with a `skipped` status (consistent with existing task behavior).

---

### User Story 2 - Containers Are Cleaned Up After Execution (Priority: P2)

After a Docker container job finishes, the container is removed automatically so that completed containers do not accumulate on the host. The administrator should not need to manage container lifecycle manually.

**Why this priority**: Without cleanup, repeated runs will fill disk with stopped containers, eventually degrading the host. This is a correctness requirement, not just polish.

**Independent Test**: Can be fully tested by running a Docker task multiple times and confirming that no stopped containers remain after each execution completes.

**Acceptance Scenarios**:

1. **Given** a Docker task that completes successfully, **When** the execution finishes, **Then** the container is removed and does not appear in the list of stopped containers on the host.
2. **Given** a Docker task that exits with a non-zero code (failure), **When** the execution finishes, **Then** the container is still removed, and the failure is still recorded in execution history.

---

### Edge Cases

- What happens if Docker is not installed or the Docker daemon is not running — how is this surfaced to the user?
- What happens if the image pull takes longer than expected — is there a timeout?
- Can Docker tasks write to mounted volumes, and is that in scope?
- What happens if the container is killed externally (e.g., `docker stop`) mid-execution?

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST support a new task type (`docker`) alongside the existing shell, python-uv, node-volta, and executable types.
- **FR-002**: A docker task MUST require an image name (e.g., `alpine:latest`) and MAY include an optional command override.
- **FR-003**: The scheduler MUST pull the specified image if it is not already present before running the container.
- **FR-004**: The scheduler MUST capture the container's stdout and stderr and associate them with the execution record.
- **FR-005**: The scheduler MUST record the container's exit code as the execution result.
- **FR-006**: Per-task environment variables MUST be injected into the container at runtime.
- **FR-007**: The scheduler MUST remove the container after execution completes, whether the exit was successful or not.
- **FR-008**: If the Docker daemon is unavailable at execution time, the execution MUST be recorded as failed with a descriptive error.
- **FR-009**: If a previous execution of the same Docker task is still running when the cron fires, the new execution MUST be skipped and recorded with a `skipped` status.
- **FR-010**: Docker tasks MUST appear alongside other task types in the task list and execution history views without requiring UI changes beyond adding the new type to existing task creation/edit forms.

### Key Entities

- **Docker Task**: A task variant with `type: "docker"`, an `image` field (required), and an optional `command` field (array of strings to override the image entrypoint/cmd).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A Docker task that references a valid public image completes with correct output capture in 100% of test runs.
- **SC-002**: Zero stopped containers remain on the host after any Docker task execution completes (success or failure).
- **SC-003**: A Docker task whose image is absent locally pulls the image and executes successfully without manual intervention.
- **SC-004**: A Docker task execution that encounters an unavailable daemon produces a failed execution record with a human-readable error message — no silent failures.

## Assumptions

- Docker is installed and the Docker daemon is accessible within the scheduler container (Docker-in-Docker or Docker socket mount).
- Volume mounts for containers are out of scope for this feature; containers run stateless.
- Image pull timeouts use the Docker CLI's default behavior; configurable timeouts are out of scope.
- The Docker socket mount approach (bind-mounting `/var/run/docker.sock`) is the assumed deployment pattern; security implications of this are deferred to the sandbox security feature.
- This feature targets the Docker deployment path; local development support is best-effort.
