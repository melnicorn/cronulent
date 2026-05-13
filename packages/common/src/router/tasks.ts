import { TRPCError } from '@trpc/server'
import { z } from 'zod'
import { createTaskInputSchema, updateTaskInputSchema } from '../schemas'
import { protectedProcedure, router } from './trpc'

export const tasksRouter = router({
  list: protectedProcedure.query(({ ctx }) => {
    return ctx.taskRepo.findAll()
  }),

  get: protectedProcedure
    .input(z.object({ id: z.string().min(1) }))
    .query(async ({ input, ctx }) => {
      const task = await ctx.taskRepo.findById(input.id)
      if (!task) throw new TRPCError({ code: 'NOT_FOUND' })
      return task
    }),

  create: protectedProcedure
    .input(createTaskInputSchema)
    .mutation(async ({ input, ctx }) => {
      const task = await ctx.taskRepo.create(input)
      await ctx.schedulerService.prepareEnvironment(task)
      if (task.enabled) ctx.schedulerService.scheduleTask(task)
      return task
    }),

  update: protectedProcedure
    .input(updateTaskInputSchema)
    .mutation(async ({ input, ctx }) => {
      const existing = await ctx.taskRepo.findById(input.id)
      if (!existing) throw new TRPCError({ code: 'NOT_FOUND' })
      const task = await ctx.taskRepo.update(input)
      await ctx.schedulerService.prepareEnvironment(task)
      ctx.schedulerService.unscheduleTask(task.id)
      if (task.enabled) ctx.schedulerService.scheduleTask(task)
      return task
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(async ({ input, ctx }) => {
      const existing = await ctx.taskRepo.findById(input.id)
      if (!existing) throw new TRPCError({ code: 'NOT_FOUND' })
      ctx.schedulerService.unscheduleTask(input.id)
      await ctx.taskRepo.delete(input.id)
      await ctx.schedulerService.cleanupEnvironment(input.id)
      return { ok: true as const }
    }),

  trigger: protectedProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(async ({ input, ctx }) => {
      const existing = await ctx.taskRepo.findById(input.id)
      if (!existing) throw new TRPCError({ code: 'NOT_FOUND' })
      return ctx.schedulerService.triggerNow(input.id)
    }),

  pause: protectedProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(async ({ input, ctx }) => {
      const existing = await ctx.taskRepo.findById(input.id)
      if (!existing) throw new TRPCError({ code: 'NOT_FOUND' })
      const task = await ctx.taskRepo.update({ id: input.id, enabled: false })
      ctx.schedulerService.unscheduleTask(task.id)
      return task
    }),

  resume: protectedProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(async ({ input, ctx }) => {
      const existing = await ctx.taskRepo.findById(input.id)
      if (!existing) throw new TRPCError({ code: 'NOT_FOUND' })
      const task = await ctx.taskRepo.update({ id: input.id, enabled: true })
      ctx.schedulerService.scheduleTask(task)
      return task
    }),
})
