'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Play, Pause, CirclePlay, Trash2, Loader2 } from 'lucide-react'
import type { Task } from '@repo/common'
import { triggerTaskAction, pauseTaskAction, resumeTaskAction, deleteTaskAction, getExecutionStatusAction, clearHistoryAction } from '../actions/tasks'
import { AlertDialog, Button } from '@heroui/react'

interface Props {
  task: Task
}

export function TaskActions({ task }: Props) {
  const [isPending, startTransition] = useTransition()
  const [isPolling, setIsPolling] = useState(false)
  const [clearOpen, setClearOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
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
      <Button variant="outline" size="sm" isDisabled={busy} onPress={handleRun}>
        {isPolling ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
        {isPolling ? 'Running…' : 'Run now'}
      </Button>

      {task.enabled ? (
        <Button
          variant="outline"
          size="sm"
          isDisabled={busy}
          onPress={() => startTransition(() => pauseTaskAction(task.id).then(() => router.refresh()))}
        >
          <Pause size={14} />
          Pause
        </Button>
      ) : (
        <Button
          variant="outline"
          size="sm"
          isDisabled={busy}
          onPress={() => startTransition(() => resumeTaskAction(task.id).then(() => router.refresh()))}
        >
          <CirclePlay size={14} />
          Resume
        </Button>
      )}

      <Button
        variant="outline"
        size="sm"
        isDisabled={busy}
        className="ml-auto"
        onPress={() => setClearOpen(true)}
      >
        Clear history
      </Button>

      <AlertDialog isOpen={clearOpen} onOpenChange={setClearOpen}>
        <AlertDialog.Backdrop>
          <AlertDialog.Container>
            <AlertDialog.Dialog>
              <AlertDialog.Header>
                <AlertDialog.Heading>Clear history</AlertDialog.Heading>
              </AlertDialog.Header>
              <AlertDialog.Body>
                Clear all execution history for this task?
              </AlertDialog.Body>
              <AlertDialog.Footer>
                <Button variant="outline" size="sm" onPress={() => setClearOpen(false)}>
                  Cancel
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  onPress={() => {
                    setClearOpen(false)
                    startTransition(() => clearHistoryAction(task.id).then(() => router.refresh()))
                  }}
                >
                  Clear
                </Button>
              </AlertDialog.Footer>
            </AlertDialog.Dialog>
          </AlertDialog.Container>
        </AlertDialog.Backdrop>
      </AlertDialog>

      <Button
        variant="danger"
        size="sm"
        isDisabled={busy}
        onPress={() => setDeleteOpen(true)}
      >
        <Trash2 size={14} />
        Delete
      </Button>

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
                    startTransition(() => deleteTaskAction(task.id))
                  }}
                >
                  Delete
                </Button>
              </AlertDialog.Footer>
            </AlertDialog.Dialog>
          </AlertDialog.Container>
        </AlertDialog.Backdrop>
      </AlertDialog>
    </div>
  )
}
