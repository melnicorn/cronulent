import { TRPCError } from '@trpc/server'
import { z } from 'zod'
import { publicProcedure, protectedProcedure, router } from './trpc'
import { updateSettingsInputSchema } from '../schemas'

export const systemRouter = router({
  status: publicProcedure.query(({ ctx }) => {
    return { initialized: ctx.auth.isInitialized() }
  }),

  initialize: publicProcedure
    .input(z.object({ password: z.string().min(8), timezone: z.string().optional() }))
    .mutation(async ({ input, ctx }) => {
      if (ctx.auth.isInitialized()) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Already initialized' })
      }
      await ctx.auth.initialize(input.password)
      if (input.timezone) {
        await ctx.settings.updateSettings({ timezone: input.timezone })
      }
      return { ok: true as const }
    }),

  getSettings: protectedProcedure.query(({ ctx }) => {
    return { timezone: ctx.settings.getTimezone(), maxHistoryItems: ctx.settings.getMaxHistoryItems() }
  }),

  updateSettings: protectedProcedure
    .input(updateSettingsInputSchema)
    .mutation(async ({ input, ctx }) => {
      await ctx.settings.updateSettings(input)
      const tasks = await ctx.taskRepo.findAll()
      for (const task of tasks) {
        if (task.enabled) {
          ctx.schedulerService.unscheduleTask(task.id)
          ctx.schedulerService.scheduleTask(task)
        }
      }
      return { ok: true as const }
    }),
})
