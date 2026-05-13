import { notFound } from 'next/navigation'
import { getTrpcClient } from '../../../../../lib/trpc'
import { TaskForm } from '../../../../../components/task-form'

interface Props {
  params: Promise<{ id: string }>
}

export default async function EditTaskPage({ params }: Props) {
  const { id } = await params
  const client = await getTrpcClient()
  const task = await client.tasks.get.query({ id }).catch(() => null)
  if (!task) notFound()

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-xl font-semibold text-foreground mb-6">Edit task</h1>
      <TaskForm task={task} />
    </div>
  )
}
