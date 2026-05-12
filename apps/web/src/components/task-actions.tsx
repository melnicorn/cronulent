'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Play, Pause, CirclePlay, Trash2 } from 'lucide-react'
import type { Task } from '@repo/common'
import { triggerTaskAction, pauseTaskAction, resumeTaskAction, deleteTaskAction } from '../actions/tasks'

interface Props {
  task: Task
}

export function TaskActions({ task }: Props) {
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <button
        disabled={isPending}
        onClick={() => startTransition(() => triggerTaskAction(task.id).then(() => router.refresh()))}
        className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md border border-border text-foreground hover:bg-accent transition-colors disabled:opacity-50"
      >
        <Play size={14} />
        Run now
      </button>

      {task.enabled ? (
        <button
          disabled={isPending}
          onClick={() => startTransition(() => pauseTaskAction(task.id).then(() => router.refresh()))}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md border border-border text-foreground hover:bg-accent transition-colors disabled:opacity-50"
        >
          <Pause size={14} />
          Pause
        </button>
      ) : (
        <button
          disabled={isPending}
          onClick={() => startTransition(() => resumeTaskAction(task.id).then(() => router.refresh()))}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md border border-border text-foreground hover:bg-accent transition-colors disabled:opacity-50"
        >
          <CirclePlay size={14} />
          Resume
        </button>
      )}

      <button
        disabled={isPending}
        onClick={() => {
          if (!confirm(`Delete "${task.name}"? This cannot be undone.`)) return
          startTransition(() => deleteTaskAction(task.id))
        }}
        className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md border border-destructive text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50 ml-auto"
      >
        <Trash2 size={14} />
        Delete
      </button>
    </div>
  )
}
