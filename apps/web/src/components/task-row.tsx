'use client'

import Link from 'next/link'
import { useTransition } from 'react'
import { Play, Pause, TriangleAlert, Trash2 } from 'lucide-react'
import type { Task } from '@repo/common'
import { pauseTaskAction, resumeTaskAction, triggerTaskAction, deleteTaskAction } from '../actions/tasks'
import cronstrue from 'cronstrue'
import { CronExpressionParser } from 'cron-parser'

interface Props {
  task: Task
}

export function TaskRow({ task }: Props) {
  const [isPending, startTransition] = useTransition()

  function humanCron(expr: string) {
    try {
      return cronstrue.toString(expr, { throwExceptionOnParseError: true })
    } catch {
      return expr
    }
  }

  function nextRun(expr: string) {
    try {
      const next = CronExpressionParser.parse(expr).next().toDate()
      return next.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
    } catch {
      return null
    }
  }

  const next = nextRun(task.cronExpression)

  return (
    <div className="flex items-center justify-between px-4 py-3 hover:bg-accent/40 transition-colors">
      <div className="flex-1 min-w-0">
        <Link href={`/tasks/${task.id}`} className="font-medium text-foreground hover:underline truncate block">
          {task.name}
        </Link>
        {task.description && (
          <p className="text-sm text-muted-foreground mt-0.5 truncate">{task.description}</p>
        )}
        <p className="text-xs text-muted-foreground mt-0.5 truncate">{humanCron(task.cronExpression)}</p>
        {next && (
          <p className="text-xs text-muted-foreground/70 mt-0.5 truncate" suppressHydrationWarning>Next: {next}</p>
        )}
      </div>
      <div className="flex items-center gap-2 ml-4 shrink-0">
        <span
          className={`text-xs px-2 py-0.5 rounded-full ${
            task.enabled
              ? 'bg-green-700 text-white dark:bg-green-500/20 dark:text-green-400 dark:ring-1 dark:ring-green-500/40'
              : 'bg-muted text-muted-foreground'
          }`}
        >
          {task.enabled ? 'active' : 'paused'}
        </span>
        <button
          disabled={isPending}
          title="Run now"
          onClick={() => startTransition(async () => { await triggerTaskAction(task.id) })}
          className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-40"
        >
          <Play size={14} />
        </button>
        <button
          disabled={isPending}
          title="Delete"
          onClick={() => {
            if (confirm(`Delete "${task.name}"? This cannot be undone.`)) {
              startTransition(async () => { await deleteTaskAction(task.id) })
            }
          }}
          className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-accent transition-colors disabled:opacity-40"
        >
          <Trash2 size={14} />
        </button>
        {task.enabled ? (
          <button
            disabled={isPending}
            title="Pause"
            onClick={() => startTransition(async () => { await pauseTaskAction(task.id) })}
            className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-40"
          >
            <Pause size={14} />
          </button>
        ) : (
          <button
            disabled={isPending}
            title="Resume"
            onClick={() => startTransition(async () => { await resumeTaskAction(task.id) })}
            className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-40"
          >
            <TriangleAlert size={14} />
          </button>
        )}
      </div>
    </div>
  )
}
