import fs from 'node:fs/promises'
import path from 'node:path'
import JSON5 from 'json5'
import { nanoid } from 'nanoid'
import type { Execution } from '@repo/common'
import type { IExecutionRepository } from '@repo/common'
import { atomicWriteFile } from '../../atomic-write'
import { createSerializer } from '../../serialize'

export class Json5ExecutionRepository implements IExecutionRepository {
  private filePath: string
  // Tasks that fire in the same minute would otherwise interleave their
  // read-modify-write and silently drop one another's rows.
  private serialize = createSerializer()

  constructor(dataDir: string) {
    this.filePath = path.join(dataDir, 'executions.json5')
  }

  private async read(): Promise<Execution[]> {
    try {
      const raw = await fs.readFile(this.filePath, 'utf8')
      return JSON5.parse(raw) as Execution[]
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return []
      throw err
    }
  }

  private async write(executions: Execution[]): Promise<void> {
    await atomicWriteFile(this.filePath, JSON5.stringify(executions, null, 2))
  }

  async findByTaskId(taskId: string, limit = 50): Promise<Execution[]> {
    const all = await this.read()
    return all
      .filter(e => e.taskId === taskId)
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
      .slice(0, limit)
  }

  async findById(id: string): Promise<Execution | null> {
    const all = await this.read()
    return all.find(e => e.id === id) ?? null
  }

  async create(input: Omit<Execution, 'id'>): Promise<Execution> {
    return this.serialize(async () => {
      const all = await this.read()
      const execution: Execution = { id: nanoid(), ...input }
      all.push(execution)
      await this.write(all)
      return execution
    })
  }

  async update(input: Pick<Execution, 'id'> & Partial<Execution>): Promise<Execution> {
    return this.serialize(async () => {
      const all = await this.read()
      const idx = all.findIndex(e => e.id === input.id)
      if (idx === -1) throw new Error(`Execution ${input.id} not found`)
      const existing = all[idx]!
      const updated: Execution = { ...existing, ...input }
      all[idx] = updated
      await this.write(all)
      return updated
    })
  }

  async findRunning(): Promise<Execution[]> {
    const all = await this.read()
    return all.filter(e => e.status === 'running')
  }

  async trimByTaskId(taskId: string, keepCount: number): Promise<void> {
    return this.serialize(async () => {
      const all = await this.read()
      const others = all.filter(e => e.taskId !== taskId)
      const forTask = all
        .filter(e => e.taskId === taskId)
        .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
        .slice(0, keepCount)
      await this.write([...others, ...forTask])
    })
  }
}
