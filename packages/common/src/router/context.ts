import type { ITaskRepository, IExecutionRepository } from '../repositories'
import type { ISchedulerService } from '../services'

export interface AppContext {
  taskRepo: ITaskRepository
  executionRepo: IExecutionRepository
  schedulerService: ISchedulerService
  userId: string | null
  auth: {
    isInitialized(): boolean
    verifyPassword(password: string): Promise<boolean>
    signToken(sub: string): Promise<{ token: string; expiresAt: string }>
    initialize(password: string): Promise<void>
  }
  settings: {
    getTimezone(): string
    updateSettings(s: { timezone: string }): Promise<void>
  }
}
