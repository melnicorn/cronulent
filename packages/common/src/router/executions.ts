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

  clearByTaskId: protectedProcedure
    .input(z.object({ taskId: z.string().min(1) }))
    .mutation(async ({ input, ctx }) => {
      const task = await ctx.taskRepo.findById(input.taskId)
      if (!task) throw new TRPCError({ code: 'NOT_FOUND' })
      await ctx.executionRepo.trimByTaskId(input.taskId, 0)
      return { ok: true as const }
    }),
})
