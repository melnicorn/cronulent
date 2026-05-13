import fs from 'node:fs/promises'
import path from 'node:path'
import JSON5 from 'json5'
import { nanoid } from 'nanoid'
import type { Task } from '@repo/common'
import type { ITaskRepository } from '@repo/common'
import type { CreateTaskInput, UpdateTaskInput } from '@repo/common'

export class Json5TaskRepository implements ITaskRepository {
  private filePath: string

  constructor(dataDir: string) {
    this.filePath = path.join(dataDir, 'tasks.json5')
  }

  private async read(): Promise<Task[]> {
    try {
      const raw = await fs.readFile(this.filePath, 'utf8')
      return JSON5.parse(raw) as Task[]
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return []
      throw err
    }
  }

  private async write(tasks: Task[]): Promise<void> {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true })
    await fs.writeFile(this.filePath, JSON5.stringify(tasks, null, 2), 'utf8')
  }

  async findAll(): Promise<Task[]> {
    return this.read()
  }

  async findById(id: string): Promise<Task | null> {
    const tasks = await this.read()
    return tasks.find(t => t.id === id) ?? null
  }

  async create(input: CreateTaskInput): Promise<Task> {
    const tasks = await this.read()
    const now = new Date().toISOString()
    const task: Task = {
      id: nanoid(),
      name: input.name,
      description: input.description ?? '',
      commandType: input.commandType,
      command: input.command,
      parameters: input.parameters ?? [],
      dependencies: input.dependencies ?? [],
      cronExpression: input.cronExpression,
      env: input.env ?? {},
      enabled: input.enabled ?? true,
      createdAt: now,
      updatedAt: now,
    }
    tasks.push(task)
    await this.write(tasks)
    return task
  }

  async update(input: UpdateTaskInput): Promise<Task> {
    const tasks = await this.read()
    const idx = tasks.findIndex(t => t.id === input.id)
    if (idx === -1) throw new Error(`Task ${input.id} not found`)
    const existing = tasks[idx]!
    const updated: Task = {
      name: input.name ?? existing.name,
      description: input.description ?? existing.description,
      commandType: input.commandType ?? existing.commandType,
      command: input.command ?? existing.command,
      parameters: input.parameters ?? existing.parameters,
      dependencies: input.dependencies ?? existing.dependencies,
      cronExpression: input.cronExpression ?? existing.cronExpression,
      env: input.env ?? existing.env,
      enabled: input.enabled ?? existing.enabled,
      createdAt: existing.createdAt,
      id: existing.id,
      updatedAt: new Date().toISOString(),
    }
    tasks[idx] = updated
    await this.write(tasks)
    return updated
  }

  async delete(id: string): Promise<void> {
    const tasks = await this.read()
    await this.write(tasks.filter(t => t.id !== id))
  }
}
