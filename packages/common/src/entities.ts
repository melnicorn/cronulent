export type CommandType = 'shell' | 'python-uv' | 'node-volta' | 'executable'

export type ExecutionStatus = 'running' | 'success' | 'failed' | 'interrupted' | 'skipped'

export interface Task {
  id: string
  name: string
  description: string
  commandType: CommandType
  command: string
  parameters: string[]
  cronExpression: string
  env: Record<string, string>
  enabled: boolean
  createdAt: string
  updatedAt: string
}

export interface Execution {
  id: string
  taskId: string
  startedAt: string
  finishedAt: string
  durationMs: number
  exitCode: number
  status: ExecutionStatus
  skipReason: string
  stdout: string
  stderr: string
}

export interface TokenPayload {
  sub: string
  iat: number
  exp: number
}
