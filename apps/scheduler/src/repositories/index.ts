import { Json5TaskRepository } from './json5/task-repo'
import { Json5ExecutionRepository } from './json5/execution-repo'
import type { ITaskRepository, IExecutionRepository } from '@repo/common'

export function createRepositories(dataDir: string): {
  taskRepo: ITaskRepository
  executionRepo: IExecutionRepository
} {
  return {
    taskRepo: new Json5TaskRepository(dataDir),
    executionRepo: new Json5ExecutionRepository(dataDir),
  }
}
