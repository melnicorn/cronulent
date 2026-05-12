import fs from 'node:fs/promises'
import path from 'node:path'
import { spawn } from 'node:child_process'
import type { Task } from '@repo/common'

export class EnvironmentManager {
  private scriptsDir: string

  constructor(dataDir: string) {
    this.scriptsDir = path.join(dataDir, 'scripts')
  }

  taskDir(taskId: string): string {
    return path.join(this.scriptsDir, taskId)
  }

  async setup(task: Task): Promise<void> {
    const dir = this.taskDir(task.id)
    await fs.mkdir(dir, { recursive: true })

    switch (task.commandType) {
      case 'shell':
        await fs.writeFile(path.join(dir, 'script.sh'), task.command, { mode: 0o755 })
        break

      case 'python-uv':
        await fs.writeFile(path.join(dir, 'script.py'), task.command)
        break

      case 'node-volta': {
        const pkgPath = path.join(dir, 'package.json')
        const isNew = await fs.access(pkgPath).then(() => false).catch(() => true)
        if (isNew) {
          await fs.writeFile(pkgPath, JSON.stringify({ type: 'module' }, null, 2))
          await runCommand('volta', ['pin', 'node@lts'], dir)
        }
        await fs.writeFile(path.join(dir, 'script.mjs'), task.command)
        break
      }

      case 'executable':
        break
    }

    console.log(`[env] prepared ${task.commandType} environment for task ${task.id}`)
  }

  async cleanup(taskId: string): Promise<void> {
    const dir = this.taskDir(taskId)
    await fs.rm(dir, { recursive: true, force: true })
    console.log(`[env] cleaned up environment for task ${taskId}`)
  }

  getRunCommand(task: Task): { cmd: string; args: string[]; cwd: string } {
    const dir = this.taskDir(task.id)
    const params = task.parameters

    switch (task.commandType) {
      case 'shell':
        return { cmd: '/bin/sh', args: ['script.sh', ...params], cwd: dir }
      case 'python-uv':
        return { cmd: 'uv', args: ['run', 'script.py', ...params], cwd: dir }
      case 'node-volta':
        return { cmd: 'volta', args: ['run', 'node', 'script.mjs', ...params], cwd: dir }
      case 'executable':
        return { cmd: task.command, args: params, cwd: process.cwd() }
    }
  }
}

function runCommand(cmd: string, args: string[], cwd: string): Promise<void> {
  return new Promise((resolve, reject) => {
    console.log(`[env] running: ${cmd} ${args.join(' ')}`)
    const child = spawn(cmd, args, { cwd, stdio: 'inherit' })
    child.on('close', code => {
      if (code === 0) resolve()
      else reject(new Error(`${cmd} exited with code ${code}`))
    })
    child.on('error', reject)
  })
}
