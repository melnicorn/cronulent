'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { CirclePlay, Loader2, Pause, Play, Trash2 } from 'lucide-react'
import type { Task } from '@repo/common'
import { pauseTaskAction, resumeTaskAction, triggerTaskAction, deleteTaskAction, getExecutionStatusAction } from '../actions/tasks'
import cronstrue from 'cronstrue'
import { CronExpressionParser } from 'cron-parser'
import { AlertDialog, Button, Tooltip } from '@heroui/react'

interface Props {
  task: Task
}

export function TaskRow({ task }: Props) {
  const [isPending, startTransition] = useTransition()
  const [isRunning, setIsRunning] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
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
        <Tooltip>
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
          <Tooltip.Content>{isRunning ? 'Running…' : 'Run once now'}</Tooltip.Content>
        </Tooltip>
        <Tooltip>
          <Button
            isIconOnly
            variant="ghost"
            size="sm"
            isDisabled={busy}
            aria-label="Delete task"
            className="hover:text-destructive"
            onPress={() => setDeleteOpen(true)}
          >
            <Trash2 size={14} />
          </Button>
          <Tooltip.Content>Delete task</Tooltip.Content>
        </Tooltip>

        <AlertDialog isOpen={deleteOpen} onOpenChange={setDeleteOpen}>
          <AlertDialog.Backdrop>
            <AlertDialog.Container>
              <AlertDialog.Dialog>
                <AlertDialog.Header>
                  <AlertDialog.Heading>Delete task</AlertDialog.Heading>
                </AlertDialog.Header>
                <AlertDialog.Body>
                  Delete &ldquo;{task.name}&rdquo;? This cannot be undone.
                </AlertDialog.Body>
                <AlertDialog.Footer>
                  <Button variant="outline" size="sm" onPress={() => setDeleteOpen(false)}>
                    Cancel
                  </Button>
                  <Button
                    variant="danger"
                    size="sm"
                    onPress={() => {
                      setDeleteOpen(false)
                      startTransition(async () => { await deleteTaskAction(task.id) })
                    }}
                  >
                    Delete
                  </Button>
                </AlertDialog.Footer>
              </AlertDialog.Dialog>
            </AlertDialog.Container>
          </AlertDialog.Backdrop>
        </AlertDialog>
        {task.enabled ? (
          <Tooltip>
            <Button
              isIconOnly
              variant="ghost"
              size="sm"
              isDisabled={busy}
              aria-label="Pause schedule"
              onPress={() => startTransition(async () => { await pauseTaskAction(task.id) })}
            >
              <Pause size={14} />
            </Button>
            <Tooltip.Content>Pause schedule</Tooltip.Content>
          </Tooltip>
        ) : (
          // Spelled out rather than icon-only: a paused task is the state where
          // you most need to know the way out, and an icon alone doesn't say it.
          <Button
            variant="outline"
            size="sm"
            isDisabled={busy}
            onPress={() => startTransition(async () => { await resumeTaskAction(task.id) })}
          >
            <CirclePlay size={14} />
            Resume
          </Button>
        )}
      </div>
    </div>
  )
}
