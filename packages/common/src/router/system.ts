import { TRPCError } from '@trpc/server'
import { z } from 'zod'
import { publicProcedure, router } from './trpc'

export const systemRouter = router({
  status: publicProcedure.query(({ ctx }) => {
    return { initialized: ctx.auth.isInitialized() }
  }),

  initialize: publicProcedure
    .input(z.object({ password: z.string().min(8) }))
    .mutation(async ({ input, ctx }) => {
      if (ctx.auth.isInitialized()) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Already initialized' })
      }
      await ctx.auth.initialize(input.password)
      return { ok: true as const }
    }),
})
