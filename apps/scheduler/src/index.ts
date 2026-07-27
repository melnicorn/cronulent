import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { createRepositories } from './repositories/index'
import { ConfigManager } from './config'
import { AuthService } from './auth'
import { EnvironmentManager } from './environment-manager'
import { TaskExecutor } from './executor'
import { NodeCronSchedulerService } from './scheduler'
import { startHttpServer } from './http'
import { PluginRegistry } from './plugins/index'
import { StateStore } from './state-store'
import { reconcileOrphanedExecutions } from './reconcile'

const PORT = parseInt(process.env.PORT ?? '3001', 10)
const DATA_DIR = process.env.DATA_DIR ?? path.join(process.cwd(), 'data')

const { taskRepo, executionRepo } = createRepositories(DATA_DIR)
const configManager = new ConfigManager(DATA_DIR)
await configManager.load()

const auth = new AuthService(configManager)

if (!auth.isInitialized()) {
  console.log('[scheduler] Not initialized — complete setup via the web UI.')
}

const internalToken = randomUUID()
const apiUrl = `http://localhost:${PORT}`
const serviceTokenHash = process.env.CRONULENT_SERVICE_TOKEN_HASH ?? ''

if (!serviceTokenHash) {
  console.log('[scheduler] CRONULENT_SERVICE_TOKEN_HASH not set — the admin API will be unavailable.')
}

const pluginRegistry = new PluginRegistry()
const envManager = new EnvironmentManager(DATA_DIR)
const stateStore = new StateStore(DATA_DIR)

const allPluginsWithHelpers = pluginRegistry.list().map(m => {
  const p = pluginRegistry.get(m.id)!
  return { id: m.id, generatePythonHelper: p.generatePythonHelper, generateNodeHelper: p.generateNodeHelper, generateShellHelper: p.generateShellHelper }
})
await envManager.writeSharedHelpers(allPluginsWithHelpers)

const executor = new TaskExecutor(taskRepo, executionRepo, envManager, pluginRegistry, configManager, apiUrl, internalToken)
const schedulerService = new NodeCronSchedulerService(taskRepo, executor, envManager, () => configManager.getTimezone())

// Must run before scheduling: a run orphaned by the last shutdown would
// otherwise look live and cause every fire of that task to be skipped.
await reconcileOrphanedExecutions(executionRepo)

await schedulerService.start()

startHttpServer({ port: PORT, taskRepo, executionRepo, schedulerService, auth, configManager, pluginRegistry, envManager, stateStore, internalToken, serviceTokenHash })

process.on('SIGTERM', async () => {
  await schedulerService.stop()
  process.exit(0)
})

process.on('SIGINT', async () => {
  await schedulerService.stop()
  process.exit(0)
})
