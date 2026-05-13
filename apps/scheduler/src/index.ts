import path from 'node:path'
import { createRepositories } from './repositories/index'
import { ConfigManager } from './config'
import { AuthService } from './auth'
import { EnvironmentManager } from './environment-manager'
import { TaskExecutor } from './executor'
import { NodeCronSchedulerService } from './scheduler'
import { startHttpServer } from './http'

const PORT = parseInt(process.env.PORT ?? '3001', 10)
const DATA_DIR = process.env.DATA_DIR ?? path.join(process.cwd(), 'data')

const { taskRepo, executionRepo } = createRepositories(DATA_DIR)
const configManager = new ConfigManager(DATA_DIR)
await configManager.load()

const auth = new AuthService(configManager)

if (!auth.isInitialized()) {
  console.log('[scheduler] Not initialized — complete setup via the web UI.')
}

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
