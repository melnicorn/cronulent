'use client'

import Link from 'next/link'
import { useTransition } from 'react'
import { Play, Pause, TriangleAlert } from 'lucide-react'
import type { Task } from '@repo/common'
import { pauseTaskAction, resumeTaskAction, triggerTaskAction } from '../actions/tasks'
import cronstrue from 'cronstrue'

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

  return (
    <div className="flex items-center justify-between px-4 py-3 hover:bg-accent/40 transition-colors">
      <div className="flex-1 min-w-0">
        <Link href={`/tasks/${task.id}`} className="font-medium text-foreground hover:underline truncate block">
          {task.name}
        </Link>
        <p className="text-xs text-muted-foreground mt-0.5 truncate">{humanCron(task.cronExpression)}</p>
      </div>
      <div className="flex items-center gap-2 ml-4 shrink-0">
        <span
          className={`text-xs px-2 py-0.5 rounded-full ${
            task.enabled
              ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
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
