'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Pause, Play, TriangleAlert, Trash2 } from 'lucide-react'
import type { Task } from '@repo/common'
import { pauseTaskAction, resumeTaskAction, triggerTaskAction, deleteTaskAction, getExecutionStatusAction } from '../actions/tasks'
import cronstrue from 'cronstrue'
import { CronExpressionParser } from 'cron-parser'
import { Button } from '@heroui/react'

interface Props {
  task: Task
}

export function TaskRow({ task }: Props) {
  const [isPending, startTransition] = useTransition()
  const [isRunning, setIsRunning] = useState(false)
  const router = useRouter()

  async function handleRun() {
    setIsRunning(true)
    try {
      const execution = await triggerTaskAction(task.id)
      while (true) {
        await new Promise(r => setTimeout(r, 1500))
        const status = await getExecutionStatusAction(execution.id)
        if (status !== 'running') break
      }
    } finally {
      setIsRunning(false)
      router.refresh()
    }
  }

  const busy = isPending || isRunning

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
      <div className="flex items-center gap-1 ml-4 shrink-0">
        <span
          className={`text-xs px-2 py-0.5 rounded-full ${
            task.enabled
              ? 'bg-green-700 text-white dark:bg-green-500/20 dark:text-green-400 dark:ring-1 dark:ring-green-500/40'
              : 'bg-muted text-muted-foreground'
          }`}
        >
          {task.enabled ? 'active' : 'paused'}
        </span>
        <Button
          isIconOnly
          variant="ghost"
          size="sm"
          isDisabled={busy}
          aria-label={isRunning ? 'Running…' : 'Run now'}
          onPress={handleRun}
        >
          {isRunning ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
        </Button>
        <Button
          isIconOnly
          variant="ghost"
          size="sm"
          isDisabled={busy}
          aria-label="Delete task"
          className="hover:text-destructive"
          onPress={() => {
            if (confirm(`Delete "${task.name}"? This cannot be undone.`)) {
              startTransition(async () => { await deleteTaskAction(task.id) })
            }
          }}
        >
          <Trash2 size={14} />
        </Button>
        {task.enabled ? (
          <Button
            isIconOnly
            variant="ghost"
            size="sm"
            isDisabled={busy}
            aria-label="Pause task"
            onPress={() => startTransition(async () => { await pauseTaskAction(task.id) })}
          >
            <Pause size={14} />
          </Button>
        ) : (
          <Button
            isIconOnly
            variant="ghost"
            size="sm"
            isDisabled={busy}
            aria-label="Resume task"
            onPress={() => startTransition(async () => { await resumeTaskAction(task.id) })}
          >
            <TriangleAlert size={14} />
          </Button>
        )}
      </div>
    </div>
  )
}
