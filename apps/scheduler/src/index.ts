import path from 'node:path'
import { createRepositories } from './repositories/index'
import { AuthService } from './auth'
import { EnvironmentManager } from './environment-manager'
import { TaskExecutor } from './executor'
import { NodeCronSchedulerService } from './scheduler'
import { startHttpServer } from './http'

const PORT = parseInt(process.env.PORT ?? '3001', 10)
const DATA_DIR = process.env.DATA_DIR ?? path.join(process.cwd(), 'data')
const JWT_SECRET = process.env.JWT_SECRET
const PASSWORD_HASH = process.env.PASSWORD_HASH
const PASSWORD_SALT = process.env.PASSWORD_SALT

if (!JWT_SECRET || !PASSWORD_HASH || !PASSWORD_SALT) {
  console.error('Missing required env vars: JWT_SECRET, PASSWORD_HASH, PASSWORD_SALT')
  console.error('Run: node scripts/setup-password.ts to generate them')
  process.exit(1)
}

const { taskRepo, executionRepo } = createRepositories(DATA_DIR)
const auth = new AuthService({ jwtSecret: JWT_SECRET, passwordHash: PASSWORD_HASH, passwordSalt: PASSWORD_SALT })
const envManager = new EnvironmentManager(DATA_DIR)
const executor = new TaskExecutor(taskRepo, executionRepo, envManager)
const schedulerService = new NodeCronSchedulerService(taskRepo, executor, envManager)

await schedulerService.start()

startHttpServer({ port: PORT, taskRepo, executionRepo, schedulerService, auth })

process.on('SIGTERM', async () => {
  await schedulerService.stop()
  process.exit(0)
})

process.on('SIGINT', async () => {
  await schedulerService.stop()
  process.exit(0)
})
