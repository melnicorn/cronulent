import { z } from 'zod'

const commandTypeSchema = z.enum(['shell', 'python-uv', 'node-volta'])

const executionStatusSchema = z.enum(['running', 'success', 'failed', 'interrupted', 'skipped'])

const lifecycleNotificationConfigSchema = z.object({
  pluginId: z.string().min(1),
})

const lifecycleNotificationsSchema = z.object({
  onSuccess: lifecycleNotificationConfigSchema.optional(),
  onFailure: lifecycleNotificationConfigSchema.optional(),
})

export const taskSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(200),
  description: z.string().max(2000).default(''),
  commandType: commandTypeSchema,
  command: z.string().min(1),
  parameters: z.array(z.string().max(1024)).max(100).default([]),
  cronExpression: z.string().min(1),
  dependencies: z.array(z.string().max(256)).max(200).default([]),
  env: z.record(z.string(), z.string().max(4096)).default({}),
  enabled: z.boolean().default(true),
  lifecycleNotifications: lifecycleNotificationsSchema.optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export const setPluginEnabledInputSchema = z.object({
  pluginId: z.string().min(1),
  enabled: z.boolean(),
})

export const updatePluginConfigInputSchema = z.object({
  pluginId: z.string().min(1),
  config: z.record(z.string(), z.string()),
})

export const getPluginConfigInputSchema = z.object({
  pluginId: z.string().min(1),
})

export const dispatchPluginInputSchema = z.object({
  pluginId: z.string().min(1),
  func: z.string().min(1),
  params: z.record(z.unknown()),
  strict: z.boolean().default(false),
})

export type SetPluginEnabledInput = z.infer<typeof setPluginEnabledInputSchema>
export type UpdatePluginConfigInput = z.infer<typeof updatePluginConfigInputSchema>

export const executionSchema = z.object({
  id: z.string().min(1),
  taskId: z.string().min(1),
  startedAt: z.string(),
  finishedAt: z.string().default(''),
  durationMs: z.number().int().nonnegative().default(0),
  exitCode: z.number().int().default(-1),
  status: executionStatusSchema,
  skipReason: z.string().default(''),
  stdout: z.string().max(100_000).default(''),
  stderr: z.string().max(100_000).default(''),
})

export const createTaskInputSchema = taskSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
})

export const updateTaskInputSchema = taskSchema
  .omit({ id: true, createdAt: true, updatedAt: true })
  .partial()
  .extend({ id: z.string().min(1) })

export type CreateTaskInput = z.infer<typeof createTaskInputSchema>
export type UpdateTaskInput = z.infer<typeof updateTaskInputSchema>

export const updateSettingsInputSchema = z.object({
  timezone: z.string(),
})

export type UpdateSettingsInput = z.infer<typeof updateSettingsInputSchema>
