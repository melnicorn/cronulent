import { router } from './trpc'
import { systemRouter } from './system'
import { authRouter } from './auth'
import { tasksRouter } from './tasks'
import { executionsRouter } from './executions'
import { pluginsRouter } from './plugins'

export const appRouter = router({
  system: systemRouter,
  auth: authRouter,
  tasks: tasksRouter,
  executions: executionsRouter,
  plugins: pluginsRouter,
})

export type AppRouter = typeof appRouter
