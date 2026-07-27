import { createHTTPServer } from '@trpc/server/adapters/standalone'
import { appRouter } from '@repo/common'
import type { AppContext } from '@repo/common'
import type { AuthService } from './auth'
import type { ITaskRepository, IExecutionRepository } from '@repo/common'
import type { ISchedulerService } from '@repo/common'
import crypto from 'node:crypto'
import type { ConfigManager } from './config'
import type { PluginRegistry } from './plugins/index'
import type { EnvironmentManager } from './environment-manager'
import type { StateStore } from './state-store'

export function startHttpServer(opts: {
  port: number
  taskRepo: ITaskRepository
  executionRepo: IExecutionRepository
  schedulerService: ISchedulerService
  auth: AuthService
  configManager: ConfigManager
  pluginRegistry: PluginRegistry
  envManager: EnvironmentManager
  stateStore: StateStore
  internalToken: string
  serviceTokenHash: string
}): void {
  // The web app authenticates as a service with a token we only ever hold the
  // hash of. Task scripts run in this container and inherit its environment, so
  // there is deliberately no usable credential here for one to steal.
  const isServiceCall = (bearerToken: string): boolean => {
    if (!opts.serviceTokenHash || !bearerToken) return false
    const presented = crypto.createHash('sha256').update(bearerToken).digest()
    const expected = Buffer.from(opts.serviceTokenHash, 'hex')
    return presented.length === expected.length && crypto.timingSafeEqual(presented, expected)
  }

  const server = createHTTPServer({
    router: appRouter,
    createContext: async ({ req }): Promise<AppContext> => {
      const authHeader = req.headers['authorization']
      const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null
      const isInternalCall = bearerToken === opts.internalToken
      let userId: string | null = null
      if (!isInternalCall && bearerToken) {
        // Note: no isInternalCall here — plugins.dispatch stays reserved for
        // task scripts, out of reach of anything coming through the web app.
        userId = isServiceCall(bearerToken) ? 'service' : await opts.auth.verifyToken(bearerToken)
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
          getMaxHistoryItems: () => opts.configManager.getMaxHistoryItems(),
          updateSettings: (s) => opts.configManager.updateSettings(s),
        },
        pluginRegistry: {
          list: () => opts.pluginRegistry.list(),
          get: (id) => opts.pluginRegistry.get(id),
          dispatch: async (pluginId, func, params) => {
            const plugin = opts.pluginRegistry.get(pluginId)
            if (!plugin) throw new Error(`Plugin '${pluginId}' not found`)
            const state = opts.configManager.getPluginState(pluginId)
            return plugin.dispatch(func, params, state.config, { stateStore: opts.stateStore })
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
        state: {
          getForTask: (taskId) => opts.stateStore.get(opts.configManager.getStateKey(taskId)),
          clearForTask: (taskId) => opts.stateStore.clear(opts.configManager.getStateKey(taskId)),
        },
      }
    },
  })

  server.listen(opts.port)
  console.log(`Scheduler API listening on http://localhost:${opts.port}`)
}
