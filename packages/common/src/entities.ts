export type CommandType = 'shell' | 'python-uv' | 'node-volta'

export type ExecutionStatus = 'running' | 'success' | 'failed' | 'interrupted' | 'skipped'

export interface PluginAdminConfigField {
  key: string
  label: string
  type: 'string' | 'secret'
  required: boolean
}

export interface PluginFunctionParam {
  name: string
  type: string
  description: string
  optional: boolean
  defaultValue?: string
}

export interface PluginFunction {
  name: string
  description: string
  params: PluginFunctionParam[]
}

export interface PluginManifest {
  id: string
  name: string
  description: string
  adminConfigSchema: PluginAdminConfigField[]
  pythonFunctionSchema: PluginFunction[]
  nodeFunctionSchema: PluginFunction[]
  // Built-in hooks (e.g. state) that are always available and not surfaced in
  // the Manage Plugins admin list.
  hidden?: boolean
}

export interface PluginState {
  id: string
  enabled: boolean
  config: Record<string, string>
}

export interface LifecycleNotificationConfig {
  pluginId: string
}

export interface LifecycleNotifications {
  onSuccess?: LifecycleNotificationConfig
  onFailure?: LifecycleNotificationConfig
}

export interface Task {
  id: string
  name: string
  description: string
  commandType: CommandType
  command: string
  parameters: string[]
  cronExpression: string
  dependencies: string[]
  env: Record<string, string>
  enabled: boolean
  lifecycleNotifications?: LifecycleNotifications
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

export interface SystemSettings {
  timezone: string
  maxHistoryItems: number
}
