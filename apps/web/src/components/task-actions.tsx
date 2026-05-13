'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Play, Pause, CirclePlay, Trash2, Loader2 } from 'lucide-react'
import type { Task } from '@repo/common'
import { triggerTaskAction, pauseTaskAction, resumeTaskAction, deleteTaskAction, getExecutionStatusAction } from '../actions/tasks'

interface Props {
  task: Task
}

export function TaskActions({ task }: Props) {
  const [isPending, startTransition] = useTransition()
  const [isPolling, setIsPolling] = useState(false)
  const router = useRouter()

  async function handleRun() {
    setIsPolling(true)
    try {
      const execution = await triggerTaskAction(task.id)
      router.refresh()
      while (true) {
        await new Promise(r => setTimeout(r, 1500))
        const status = await getExecutionStatusAction(execution.id)
        router.refresh()
        if (status !== 'running') break
      }
    } finally {
      setIsPolling(false)
    }
  }

  const busy = isPending || isPolling

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <button
        disabled={busy}
        onClick={handleRun}
        className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md border border-border text-foreground hover:bg-accent transition-colors disabled:opacity-50"
      >
        {isPolling ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
        {isPolling ? 'Running…' : 'Run now'}
      </button>

      {task.enabled ? (
        <button
          disabled={busy}
          onClick={() => startTransition(() => pauseTaskAction(task.id).then(() => router.refresh()))}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md border border-border text-foreground hover:bg-accent transition-colors disabled:opacity-50"
        >
          <Pause size={14} />
          Pause
        </button>
      ) : (
        <button
          disabled={busy}
          onClick={() => startTransition(() => resumeTaskAction(task.id).then(() => router.refresh()))}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md border border-border text-foreground hover:bg-accent transition-colors disabled:opacity-50"
        >
          <CirclePlay size={14} />
          Resume
        </button>
      )}

      <button
        disabled={busy}
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
