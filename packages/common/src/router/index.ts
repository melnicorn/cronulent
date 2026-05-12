import { router } from './trpc'
import { authRouter } from './auth'
import { tasksRouter } from './tasks'
import { executionsRouter } from './executions'

export const appRouter = router({
  auth: authRouter,
  tasks: tasksRouter,
  executions: executionsRouter,
})

export type AppRouter = typeof appRouter
