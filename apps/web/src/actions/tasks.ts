'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { getTrpcClient } from '../lib/trpc'
import type { CreateTaskInput, UpdateTaskInput } from '@repo/common'

export async function createTaskAction(input: CreateTaskInput) {
  const client = await getTrpcClient()
  const task = await client.tasks.create.mutate(input)
  revalidatePath('/')
  return task
}

export async function updateTaskAction(input: UpdateTaskInput) {
  const client = await getTrpcClient()
  const task = await client.tasks.update.mutate(input)
  revalidatePath('/')
  revalidatePath(`/tasks/${input.id}`)
  return task
}

export async function deleteTaskAction(id: string) {
  const client = await getTrpcClient()
  await client.tasks.delete.mutate({ id })
  revalidatePath('/')
  redirect('/')
}

export async function triggerTaskAction(id: string) {
  const client = await getTrpcClient()
  const result = await client.tasks.trigger.mutate({ id })
  revalidatePath(`/tasks/${id}`)
  return result
}

export async function getExecutionStatusAction(id: string) {
  const client = await getTrpcClient()
  const execution = await client.executions.get.query({ id })
  return execution.status
}

export async function pauseTaskAction(id: string) {
  const client = await getTrpcClient()
  const task = await client.tasks.pause.mutate({ id })
  revalidatePath('/')
  revalidatePath(`/tasks/${id}`)
  return task
}

export async function resumeTaskAction(id: string) {
  const client = await getTrpcClient()
  const task = await client.tasks.resume.mutate({ id })
  revalidatePath('/')
  revalidatePath(`/tasks/${id}`)
  return task
}

export async function clearHistoryAction(taskId: string) {
  const client = await getTrpcClient()
  await client.executions.clearByTaskId.mutate({ taskId })
  revalidatePath(`/tasks/${taskId}`)
}
