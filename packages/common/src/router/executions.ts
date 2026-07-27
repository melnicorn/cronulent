import { TRPCError } from '@trpc/server'
import { z } from 'zod'
import { protectedProcedure, router } from './trpc'

export const executionsRouter = router({
  list: protectedProcedure
    .input(z.object({ taskId: z.string().min(1), limit: z.number().int().positive().default(50) }))
    .query(async ({ input, ctx }) => {
      const task = await ctx.taskRepo.findById(input.taskId)
      if (!task) throw new TRPCError({ code: 'NOT_FOUND' })
      return ctx.executionRepo.findByTaskId(input.taskId, input.limit)
    }),

  get: protectedProcedure
    .input(z.object({ id: z.string().min(1) }))
    .query(async ({ input, ctx }) => {
      const execution = await ctx.executionRepo.findById(input.id)
      if (!execution) throw new TRPCError({ code: 'NOT_FOUND' })
      return execution
    }),

  /**
   * Force-resolve executions stuck at 'running'.
   *
   * A run that never reached its exit handler — the scheduler was killed or
   * restarted mid-run — leaves a row at 'running' forever. That row makes every
   * later scheduled run look like a re-entrant one and get skipped, silently
   * stalling the task. Marking it 'interrupted' unblocks scheduling.
   */
  resetStuck: protectedProcedure
    .input(z.object({ taskId: z.string().min(1) }))
    .mutation(async ({ input, ctx }) => {
      const task = await ctx.taskRepo.findById(input.taskId)
      if (!task) throw new TRPCError({ code: 'NOT_FOUND' })

      const stuck = (await ctx.executionRepo.findRunning()).filter(e => e.taskId === input.taskId)
      const finishedAt = new Date().toISOString()
      for (const execution of stuck) {
        // stdout/stderr are only persisted when a run reaches its exit handler,
        // so a stuck row has none to preserve.
        await ctx.executionRepo.update({
          id: execution.id,
          finishedAt,
          durationMs: Math.max(0, Date.parse(finishedAt) - Date.parse(execution.startedAt)),
          exitCode: -1,
          status: 'interrupted',
          stderr: 'Never finished — manually reset.',
        })
      }
      return { reset: stuck.length }
    }),

  clearByTaskId: protectedProcedure
    .input(z.object({ taskId: z.string().min(1) }))
    .mutation(async ({ input, ctx }) => {
      const task = await ctx.taskRepo.findById(input.taskId)
      if (!task) throw new TRPCError({ code: 'NOT_FOUND' })
      await ctx.executionRepo.trimByTaskId(input.taskId, 0)
      return { ok: true as const }
    }),
})
