import cron from 'node-cron'
import type { ISchedulerService, ITaskRepository, Task, Execution } from '@repo/common'
import type { TaskExecutor } from './executor'
import type { EnvironmentManager } from './environment-manager'

export class NodeCronSchedulerService implements ISchedulerService {
  private jobs = new Map<string, cron.ScheduledTask>()

  constructor(
    private taskRepo: ITaskRepository,
    private executor: TaskExecutor,
    private envManager: EnvironmentManager,
    private getTimezone: () => string,
  ) {}

  async start(): Promise<void> {
    const tasks = await this.taskRepo.findAll()
    for (const task of tasks) {
      if (task.enabled) this.scheduleTask(task)
    }
  }

  async stop(): Promise<void> {
    for (const job of this.jobs.values()) job.stop()
    this.jobs.clear()
  }

  async prepareEnvironment(task: Task): Promise<void> {
    await this.envManager.setup(task)
  }

  async cleanupEnvironment(taskId: string): Promise<void> {
    await this.envManager.cleanup(taskId)
  }

  scheduleTask(task: Task): void {
    if (this.jobs.has(task.id)) this.unscheduleTask(task.id)
    if (!cron.validate(task.cronExpression)) {
      console.warn(`Invalid cron expression for task ${task.id}: ${task.cronExpression}`)
      return
    }
    const timezone = this.getTimezone()
    const job = cron.schedule(
      task.cronExpression,
      () => {
        this.executor.execute(task.id).catch(err => {
          console.error(`Failed to execute task ${task.id}:`, err)
        })
      },
      timezone ? { timezone } : {},
    )
    this.jobs.set(task.id, job)
  }

  unscheduleTask(taskId: string): void {
    const job = this.jobs.get(taskId)
    if (job) {
      job.stop()
      this.jobs.delete(taskId)
    }
  }

  async triggerNow(taskId: string): Promise<Execution> {
    const executionId = await this.executor.execute(taskId)
    return {
      id: executionId,
      taskId,
      startedAt: new Date().toISOString(),
      finishedAt: '',
      durationMs: 0,
      exitCode: -1,
      status: 'running',
      skipReason: '',
      stdout: '',
      stderr: '',
    }
  }
}
