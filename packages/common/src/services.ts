import type { Task, Execution } from './entities'

export interface ISchedulerService {
  start(): Promise<void>
  stop(): Promise<void>
  prepareEnvironment(task: Task): Promise<void>
  cleanupEnvironment(taskId: string): Promise<void>
  scheduleTask(task: Task): void
  unscheduleTask(taskId: string): void
  triggerNow(taskId: string): Promise<Execution>
}
