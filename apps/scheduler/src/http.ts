import { createHTTPServer } from '@trpc/server/adapters/standalone'
import { appRouter } from '@repo/common'
import type { AppContext } from '@repo/common'
import type { AuthService } from './auth'
import type { ITaskRepository, IExecutionRepository } from '@repo/common'
import type { ISchedulerService } from '@repo/common'
import type { ConfigManager } from './config'
import type { PluginRegistry } from './plugins/index'
import type { EnvironmentManager } from './environment-manager'

export function startHttpServer(opts: {
  port: number
  taskRepo: ITaskRepository
  executionRepo: IExecutionRepository
  schedulerService: ISchedulerService
  auth: AuthService
  configManager: ConfigManager
  pluginRegistry: PluginRegistry
  envManager: EnvironmentManager
  internalToken: string
}): void {
  const server = createHTTPServer({
    router: appRouter,
    createContext: async ({ req }): Promise<AppContext> => {
      const authHeader = req.headers['authorization']
      const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null
      const isInternalCall = bearerToken === opts.internalToken
      let userId: string | null = null
      if (!isInternalCall && bearerToken) {
        userId = await opts.auth.verifyToken(bearerToken)
      }
      return {
        taskRepo: opts.taskRepo,
        executionRepo: opts.executionRepo,
        schedulerService: opts.schedulerService,
        userId,
        isInternalCall,
        auth: {
          isInitialized: () => opts.auth.isInitialized(),
          verifyPassword: (pw) => opts.auth.verifyPassword(pw),
          signToken: (sub) => opts.auth.signToken(sub),
          initialize: (password) => opts.auth.initialize(password),
        },
        settings: {
          getTimezone: () => opts.configManager.getTimezone(),
          updateSettings: (s) => opts.configManager.updateSettings(s),
        },
        pluginRegistry: {
          list: () => opts.pluginRegistry.list(),
          get: (id) => opts.pluginRegistry.get(id),
          dispatch: async (pluginId, func, params) => {
            const plugin = opts.pluginRegistry.get(pluginId)
            if (!plugin) throw new Error(`Plugin '${pluginId}' not found`)
            const state = opts.configManager.getPluginState(pluginId)
            await plugin.dispatch(func, params, state.config)
          },
        },
        pluginConfig: {
          getState: (pluginId) => opts.configManager.getPluginState(pluginId),
          setEnabled: (pluginId, enabled) => opts.configManager.setPluginEnabled(pluginId, enabled),
          updateConfig: (pluginId, config) => opts.configManager.updatePluginConfig(pluginId, config),
          writeSharedHelpers: () => {
            const plugins = opts.pluginRegistry.list().map(m => {
              const p = opts.pluginRegistry.get(m.id)!
              return { id: m.id, generatePythonHelper: p.generatePythonHelper, generateNodeHelper: p.generateNodeHelper, generateShellHelper: p.generateShellHelper }
            })
            return opts.envManager.writeSharedHelpers(plugins)
          },
        },
      }
    },
  })

  server.listen(opts.port)
  console.log(`Scheduler API listening on http://localhost:${opts.port}`)
}
