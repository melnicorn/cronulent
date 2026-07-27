import type { IExecutionRepository } from '@repo/common'

/**
 * Resolve executions left at 'running' by a previous process.
 *
 * Child processes are owned by the scheduler, so nothing it started can still
 * be running when it has only just booted. Any row still marked 'running' at
 * startup belongs to a run that was killed mid-flight — a restart, redeploy, or
 * power loss — and never reached its exit handler.
 *
 * Left alone, such a row looks like a live run to the executor's re-entrancy
 * check, so every later scheduled fire is skipped and the task stalls for good.
 */
export async function reconcileOrphanedExecutions(
  executionRepo: IExecutionRepository,
): Promise<number> {
  const orphaned = await executionRepo.findRunning()
  const finishedAt = new Date().toISOString()

  for (const execution of orphaned) {
    // stdout/stderr are only persisted once a run reaches its exit handler,
    // so an orphaned row has none to preserve.
    await executionRepo.update({
      id: execution.id,
      finishedAt,
      durationMs: Math.max(0, Date.parse(finishedAt) - Date.parse(execution.startedAt)),
      exitCode: -1,
      status: 'interrupted',
      stderr: 'Interrupted — the scheduler stopped while this run was in flight.',
    })
  }

  if (orphaned.length > 0) {
    console.log(`[reconcile] marked ${orphaned.length} orphaned execution(s) as interrupted`)
  }
  return orphaned.length
}
