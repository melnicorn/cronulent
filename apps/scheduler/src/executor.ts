import { spawn } from 'node:child_process'
import type { IExecutionRepository, ITaskRepository } from '@repo/common'
import type { EnvironmentManager } from './environment-manager'

export class TaskExecutor {
  constructor(
    private taskRepo: ITaskRepository,
    private executionRepo: IExecutionRepository,
    private envManager: EnvironmentManager,
  ) {}

  async execute(taskId: string): Promise<string> {
    const task = await this.taskRepo.findById(taskId)
    if (!task) throw new Error(`Task ${taskId} not found`)

    const running = await this.executionRepo.findRunning()
    const alreadyRunning = running.find(e => e.taskId === taskId)
    if (alreadyRunning) {
      const skipped = await this.executionRepo.create({
        taskId,
        startedAt: new Date().toISOString(),
        finishedAt: new Date().toISOString(),
        durationMs: 0,
        exitCode: -1,
        status: 'skipped',
        skipReason: `Already running as execution ${alreadyRunning.id}`,
        stdout: '',
        stderr: '',
      })
      return skipped.id
    }

    const execution = await this.executionRepo.create({
      taskId,
      startedAt: new Date().toISOString(),
      finishedAt: '',
      durationMs: 0,
      exitCode: -1,
      status: 'running',
      skipReason: '',
      stdout: '',
      stderr: '',
    })

    this.runProcess(taskId, execution.id).catch(err => {
      console.error(`Executor error for task ${taskId}:`, err)
    })

    return execution.id
  }

  private async runProcess(taskId: string, executionId: string): Promise<void> {
    const task = await this.taskRepo.findById(taskId)
    if (!task) throw new Error(`Task ${taskId} not found`)

    const start = Date.now()
    const { cmd, args, cwd } = this.envManager.getRunCommand(task)
    const env = { ...process.env, ...task.env }
    const chunks: { stdout: string[]; stderr: string[] } = { stdout: [], stderr: [] }

    await new Promise<void>(resolve => {
      const child = spawn(cmd, args, { env, cwd, shell: false })

      child.stdout.on('data', (d: Buffer) => chunks.stdout.push(d.toString()))
      child.stderr.on('data', (d: Buffer) => chunks.stderr.push(d.toString()))

      child.on('close', async code => {
        await this.executionRepo.update({
          id: executionId,
          finishedAt: new Date().toISOString(),
          durationMs: Date.now() - start,
          exitCode: code ?? -1,
          status: code === 0 ? 'success' : 'failed',
          stdout: chunks.stdout.join(''),
          stderr: chunks.stderr.join(''),
        })
        resolve()
      })

      child.on('error', async err => {
        await this.executionRepo.update({
          id: executionId,
          finishedAt: new Date().toISOString(),
          durationMs: Date.now() - start,
          exitCode: -1,
          status: 'failed',
          stdout: chunks.stdout.join(''),
          stderr: err.message,
        })
        resolve()
      })
    })
  }
}
