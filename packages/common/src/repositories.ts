import type { Task, Execution } from './entities'
import type { CreateTaskInput, UpdateTaskInput } from './schemas'

export interface ITaskRepository {
  findAll(): Promise<Task[]>
  findById(id: string): Promise<Task | null>
  create(input: CreateTaskInput): Promise<Task>
  update(input: UpdateTaskInput): Promise<Task>
  delete(id: string): Promise<void>
}

export interface IExecutionRepository {
  findByTaskId(taskId: string, limit?: number): Promise<Execution[]>
  findById(id: string): Promise<Execution | null>
  create(input: Omit<Execution, 'id'>): Promise<Execution>
  update(input: Pick<Execution, 'id'> & Partial<Execution>): Promise<Execution>
  findRunning(): Promise<Execution[]>
  trimByTaskId(taskId: string, keepCount: number): Promise<void>
}
