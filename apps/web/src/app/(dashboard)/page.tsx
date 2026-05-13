import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getTrpcClient } from '../../lib/trpc'
import { Plus } from 'lucide-react'
import { TaskRow } from '../../components/task-row'

export default async function DashboardPage() {
  const client = await getTrpcClient()
  let tasks: Awaited<ReturnType<typeof client.tasks.list.query>>
  try {
    tasks = await client.tasks.list.query()
  } catch (err: unknown) {
    const code = (err as { data?: { code?: string } })?.data?.code
    if (code === 'UNAUTHORIZED') redirect('/api/auth/signout')
    throw err
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-foreground">Tasks</h1>
        <Link
          href="/tasks/new"
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
        >
          <Plus size={16} />
          New task
        </Link>
      </div>

      {tasks.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <p className="text-sm">No tasks yet. Create one to get started.</p>
        </div>
      ) : (
        <div className="rounded-lg border border-border divide-y divide-border bg-card">
          {tasks.map(task => (
            <TaskRow key={task.id} task={task} />
          ))}
        </div>
      )}
    </div>
  )
}
