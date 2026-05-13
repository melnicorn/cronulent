import { router } from './trpc'
import { systemRouter } from './system'
import { authRouter } from './auth'
import { tasksRouter } from './tasks'
import { executionsRouter } from './executions'

export const appRouter = router({
  system: systemRouter,
  auth: authRouter,
  tasks: tasksRouter,
  executions: executionsRouter,
})

export type AppRouter = typeof appRouter
