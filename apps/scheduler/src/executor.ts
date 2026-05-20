import { spawn } from 'node:child_process'
import type { IExecutionRepository, ITaskRepository } from '@repo/common'
import type { EnvironmentManager } from './environment-manager'
import type { PluginRegistry } from './plugins/index'
import type { ConfigManager } from './config'

export class TaskExecutor {
  constructor(
    private taskRepo: ITaskRepository,
    private executionRepo: IExecutionRepository,
    private envManager: EnvironmentManager,
    private pluginRegistry: PluginRegistry,
    private configManager: ConfigManager,
    private apiUrl: string,
    private internalToken: string,
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
      await this.executionRepo.trimByTaskId(taskId, this.configManager.getMaxHistoryItems())
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
    const sharedDir = this.envManager.sharedDir
    const pythonPath = task.commandType === 'python-uv'
      ? { PYTHONPATH: process.env.PYTHONPATH ? `${sharedDir}:${process.env.PYTHONPATH}` : sharedDir }
      : {}
    const cronulentEnv = {
      CRONULENT_API_URL: this.apiUrl,
      CRONULENT_INTERNAL_TOKEN: this.internalToken,
    }
    const env = { ...process.env, ...pythonPath, ...task.env, ...cronulentEnv }
    const chunks: { stdout: string[]; stderr: string[] } = { stdout: [], stderr: [] }

    const exitCode = await new Promise<number>(resolve => {
      const child = spawn(cmd, args, { env, cwd, shell: false })

      child.stdout.on('data', (d: Buffer) => chunks.stdout.push(d.toString()))
      child.stderr.on('data', (d: Buffer) => chunks.stderr.push(d.toString()))

      child.on('close', async code => {
        const finalCode = code ?? -1
        await this.executionRepo.update({
          id: executionId,
          finishedAt: new Date().toISOString(),
          durationMs: Date.now() - start,
          exitCode: finalCode,
          status: finalCode === 0 ? 'success' : 'failed',
          stdout: chunks.stdout.join(''),
          stderr: chunks.stderr.join(''),
        })
        await this.executionRepo.trimByTaskId(taskId, this.configManager.getMaxHistoryItems())
        resolve(finalCode)
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
        resolve(-1)
      })
    })

    await this.dispatchLifecycleNotifications(task, exitCode)
  }

  private async dispatchLifecycleNotifications(
    task: import('@repo/common').Task,
    exitCode: number,
  ): Promise<void> {
    const notifications = task.lifecycleNotifications
    if (!notifications) return

    const trigger = exitCode === 0 ? notifications.onSuccess : notifications.onFailure
    if (!trigger) return

    const plugin = this.pluginRegistry.get(trigger.pluginId)
    if (!plugin) {
      console.warn(`[executor] lifecycle notification: plugin '${trigger.pluginId}' not found`)
      return
    }

    const state = this.configManager.getPluginState(trigger.pluginId)
    const status = exitCode === 0 ? 'succeeded' : 'failed'
    const title = `Task ${status}: ${task.name}`
    const text = `Exit code: ${exitCode} · ${new Date().toISOString()}`

    try {
      await plugin.dispatch('sendMessage', { title, text }, state.config)
    } catch (err) {
      console.warn(`[executor] lifecycle notification dispatch failed for task ${task.id}:`, err)
    }
  }
}
