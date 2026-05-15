import { getTrpcClient } from '../../../../lib/trpc'
import { TaskForm } from '../../../../components/task-form'

export default async function NewTaskPage() {
  const client = await getTrpcClient()
  const { plugins } = await client.plugins.list.query().catch(() => ({ plugins: [] }))
  const enabledPlugins = plugins.filter(p => p.enabled)

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-xl font-semibold text-foreground mb-6">New task</h1>
      <TaskForm enabledPlugins={enabledPlugins} />
    </div>
  )
}
