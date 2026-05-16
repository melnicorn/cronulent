import { initTRPC, TRPCError } from '@trpc/server'
import type { AppContext } from './context'

const t = initTRPC.context<AppContext>().create()

export const router = t.router

const logger = t.middleware(async ({ path, type, next }) => {
  const start = Date.now()
  const result = await next()
  const ms = Date.now() - start
  const status = result.ok ? 'OK' : 'ERR'
  console.log(`[trpc] ${type} ${path} ${status} ${ms}ms`)
  return result
})

export const publicProcedure = t.procedure.use(logger)

const isAuthed = t.middleware(({ ctx, next }) => {
  if (!ctx.userId) {
    throw new TRPCError({ code: 'UNAUTHORIZED' })
  }
  return next({ ctx: { ...ctx, userId: ctx.userId } })
})

export const protectedProcedure = t.procedure.use(logger).use(isAuthed)

const isInternal = t.middleware(({ ctx, next }) => {
  if (!ctx.isInternalCall) {
    throw new TRPCError({ code: 'UNAUTHORIZED' })
  }
  return next()
})

export const internalProcedure = t.procedure.use(logger).use(isInternal)
