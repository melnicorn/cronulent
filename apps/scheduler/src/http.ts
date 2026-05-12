import { createHTTPServer } from '@trpc/server/adapters/standalone'
import { appRouter } from '@repo/common'
import type { AppContext } from '@repo/common'
import type { AuthService } from './auth'
import type { ITaskRepository, IExecutionRepository } from '@repo/common'
import type { ISchedulerService } from '@repo/common'

export function startHttpServer(opts: {
  port: number
  taskRepo: ITaskRepository
  executionRepo: IExecutionRepository
  schedulerService: ISchedulerService
  auth: AuthService
}): void {
  const server = createHTTPServer({
    router: appRouter,
    createContext: async ({ req }): Promise<AppContext> => {
      const authHeader = req.headers['authorization']
      let userId: string | null = null
      if (authHeader?.startsWith('Bearer ')) {
        userId = await opts.auth.verifyToken(authHeader.slice(7))
      }
      return {
        taskRepo: opts.taskRepo,
        executionRepo: opts.executionRepo,
        schedulerService: opts.schedulerService,
        userId,
        auth: {
          verifyPassword: (pw) => opts.auth.verifyPassword(pw),
          signToken: (sub) => opts.auth.signToken(sub),
        },
      }
    },
  })

  server.listen(opts.port)
  console.log(`Scheduler API listening on http://localhost:${opts.port}`)
}
