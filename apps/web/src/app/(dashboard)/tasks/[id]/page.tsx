import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getTrpcClient } from '../../../../lib/trpc'
import { Pencil } from 'lucide-react'
import { TaskActions } from '../../../../components/task-actions'
import { ExecutionList } from '../../../../components/execution-list'
import { ScriptViewer } from '../../../../components/script-viewer'
import { LinkButton } from '../../../../components/link-button'
import cronstrue from 'cronstrue'
import { CronExpressionParser } from 'cron-parser'

interface Props {
  params: Promise<{ id: string }>
}

export default async function TaskDetailPage({ params }: Props) {
  const { id } = await params
  const client = await getTrpcClient()

  const [task, executions] = await Promise.all([
    client.tasks.get.query({ id }).catch(() => null),
    client.executions.list.query({ taskId: id }).catch(() => []),
  ])

  if (!task) notFound()

  function humanCron(expr: string) {
    try {
      return cronstrue.toString(expr, { throwExceptionOnParseError: true })
    } catch {
      return expr
    }
  }

  function nextRun(expr: string) {
    try {
      return CronExpressionParser.parse(expr).next().toDate().toLocaleString()
    } catch {
      return null
    }
  }

  const next = nextRun(task.cronExpression)

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link href="/" className="text-sm text-muted-foreground hover:text-foreground">Tasks</Link>
            <span className="text-muted-foreground">/</span>
            <span className="text-sm text-foreground">{task.name}</span>
          </div>
          <h1 className="text-xl font-semibold text-foreground">{task.name}</h1>
          {task.description && <p className="text-sm text-muted-foreground mt-1">{task.description}</p>}
        </div>
        <LinkButton href={`/tasks/${id}/edit`} variant="outline" size="sm">
          <Pencil size={14} />
          Edit
        </LinkButton>
      </div>

      <div className="rounded-lg border border-border divide-y divide-border bg-card">
        <Row label="Schedule">{humanCron(task.cronExpression)} <code className="ml-2 text-xs text-muted-foreground font-mono">{task.cronExpression}</code></Row>
        {next && (
          <Row label="Next run" suppressHydrationWarning>{next}</Row>
        )}
        <Row label="Command type">{task.commandType}</Row>
        <div className="px-4 py-3 space-y-2">
          <span className="text-sm text-muted-foreground">Script</span>
          <ScriptViewer value={task.command} commandType={task.commandType} />
        </div>
        {task.parameters.length > 0 && (
          <Row label="Parameters">
            <div className="flex flex-wrap gap-1">
              {task.parameters.map((p, i) => (
                <code key={i} className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded">{p}</code>
              ))}
            </div>
          </Row>
        )}
        {task.dependencies.length > 0 && (
          <Row label="Dependencies">
            <div className="flex flex-wrap gap-1">
              {task.dependencies.map((d, i) => (
                <code key={i} className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded">{d}</code>
              ))}
            </div>
          </Row>
        )}
        {Object.keys(task.env).length > 0 && (
          <Row label="Environment">
            <div className="space-y-0.5">
              {Object.entries(task.env).map(([k, v]) => (
                <div key={k} className="text-xs font-mono">
                  <span className="text-primary">{k}</span>=<span className="text-muted-foreground">{v}</span>
                </div>
              ))}
            </div>
          </Row>
        )}
        <Row label="Status">
          <span className={`text-xs px-2 py-0.5 rounded-full ${task.enabled ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-muted text-muted-foreground'}`}>
            {task.enabled ? 'active' : 'paused'}
          </span>
        </Row>
      </div>

      <TaskActions task={task} />

      <div>
        <h2 className="text-base font-medium text-foreground mb-3">Recent executions</h2>
        <ExecutionList executions={executions} />
      </div>
    </div>
  )
}

function Row({ label, children, suppressHydrationWarning }: { label: string; children: React.ReactNode; suppressHydrationWarning?: boolean }) {
  return (
    <div className="flex gap-4 px-4 py-3">
      <span className="text-sm text-muted-foreground w-32 shrink-0">{label}</span>
      <span className="text-sm text-foreground flex-1" suppressHydrationWarning={suppressHydrationWarning}>{children}</span>
    </div>
  )
}
