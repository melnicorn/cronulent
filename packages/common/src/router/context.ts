import type { ITaskRepository, IExecutionRepository } from '../repositories'
import type { ISchedulerService } from '../services'
import type { PluginManifest } from '../entities'

export interface AppContext {
  taskRepo: ITaskRepository
  executionRepo: IExecutionRepository
  schedulerService: ISchedulerService
  userId: string | null
  isInternalCall: boolean
  auth: {
    isInitialized(): boolean
    verifyPassword(password: string): Promise<boolean>
    signToken(sub: string): Promise<{ token: string; expiresAt: string }>
    initialize(password: string): Promise<void>
  }
  settings: {
    getTimezone(): string
    getMaxHistoryItems(): number
    updateSettings(s: { timezone: string; maxHistoryItems?: number }): Promise<void>
  }
  pluginRegistry: {
    list(): PluginManifest[]
    get(id: string): { manifest: PluginManifest } | undefined
    dispatch(pluginId: string, func: string, params: Record<string, unknown>): Promise<void>
  }
  pluginConfig: {
    getState(pluginId: string): { enabled: boolean; config: Record<string, string> }
    setEnabled(pluginId: string, enabled: boolean): Promise<void>
    updateConfig(pluginId: string, config: Record<string, string>): Promise<void>
    writeSharedHelpers(): Promise<void>
  }
}
