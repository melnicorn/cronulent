import type { ITaskRepository, IExecutionRepository } from '../repositories'
import type { ISchedulerService } from '../services'

export interface AppContext {
  taskRepo: ITaskRepository
  executionRepo: IExecutionRepository
  schedulerService: ISchedulerService
  userId: string | null
  auth: {
    verifyPassword(password: string): Promise<boolean>
    signToken(sub: string): Promise<{ token: string; expiresAt: string }>
  }
}
