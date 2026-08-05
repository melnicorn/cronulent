'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronDown, ChevronRight, Copy, Check } from 'lucide-react'
import { AlertDialog, Button } from '@heroui/react'
import { clearStateAction } from '../actions/tasks'
import { copyText } from '../lib/clipboard'

interface Props {
  taskId: string
  state: { found: boolean; value?: unknown; size: number; updatedAt: string }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

export function StateSection({ taskId, state }: Props) {
  const [expanded, setExpanded] = useState(false)
  const [copied, setCopied] = useState(false)
  const [clearOpen, setClearOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  const pretty = state.found ? JSON.stringify(state.value, null, 2) : ''

  async function handleCopy() {
    if (!(await copyText(pretty))) return
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="rounded-lg border border-border bg-card">
      <Button
        variant="ghost"
        fullWidth
        aria-label="State, click to expand"
        className="flex items-center gap-3 px-4 py-3 text-left justify-start rounded-none h-auto"
        onPress={() => setExpanded(v => !v)}
      >
        <span className="text-sm text-foreground flex-1">State</span>
        {state.found ? (
          <>
            <span className="text-xs text-muted-foreground">{formatBytes(state.size)} / 1 MiB</span>
            {state.updatedAt && (
              <span className="text-xs text-muted-foreground hidden sm:inline" suppressHydrationWarning>
                updated {new Date(state.updatedAt).toLocaleString()}
              </span>
            )}
          </>
        ) : (
          <span className="text-xs text-muted-foreground">empty</span>
        )}
        <span className="text-muted-foreground">
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </span>
      </Button>

      {expanded && (
        <div className="px-4 pb-3 space-y-2">
          {!state.found ? (
            <p className="text-sm text-muted-foreground">No state saved.</p>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onPress={handleCopy}>
                  {copied ? <Check size={14} /> : <Copy size={14} />}
                  {copied ? 'Copied' : 'Copy'}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  isDisabled={isPending}
                  className="ml-auto"
                  onPress={() => setClearOpen(true)}
                >
                  Clear state
                </Button>
              </div>
              <pre className="text-xs font-mono bg-muted rounded p-2 overflow-auto max-h-96 whitespace-pre-wrap">{pretty}</pre>
            </>
          )}
        </div>
      )}

      <AlertDialog isOpen={clearOpen} onOpenChange={setClearOpen}>
        <AlertDialog.Backdrop>
          <AlertDialog.Container>
            <AlertDialog.Dialog>
              <AlertDialog.Header>
                <AlertDialog.Heading>Clear state</AlertDialog.Heading>
              </AlertDialog.Header>
              <AlertDialog.Body>
                Delete this task&rsquo;s saved state? The next run will start from no state.
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
                    startTransition(() => clearStateAction(taskId).then(() => router.refresh()))
                  }}
                >
                  Clear
                </Button>
              </AlertDialog.Footer>
            </AlertDialog.Dialog>
          </AlertDialog.Container>
        </AlertDialog.Backdrop>
      </AlertDialog>
    </div>
  )
}
