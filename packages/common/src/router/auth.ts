import { TRPCError } from '@trpc/server'
import { z } from 'zod'
import { publicProcedure, protectedProcedure, router } from './trpc'

export const authRouter = router({
  login: publicProcedure
    .input(z.object({ password: z.string().min(1) }))
    .mutation(async ({ input, ctx }) => {
      const valid = await ctx.auth.verifyPassword(input.password)
      if (!valid) {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Invalid password' })
      }
      return ctx.auth.signToken('admin')
    }),

  logout: protectedProcedure.mutation(() => {
    return { ok: true as const }
  }),
})
