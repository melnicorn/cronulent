'use client'

import { useState } from 'react'
import { ChevronDown, ChevronRight, CircleCheck, CircleX, Clock, SkipForward } from 'lucide-react'
import type { Execution, ExecutionStatus } from '@repo/common'
import { Button } from '@heroui/react'

interface Props {
  executions: Execution[]
}

export function ExecutionList({ executions }: Props) {
  if (executions.length === 0) {
    return <p className="text-sm text-muted-foreground">No executions yet.</p>
  }

  return (
    <div className="rounded-lg border border-border divide-y divide-border bg-card">
      {executions.map(e => (
        <ExecutionRow key={e.id} execution={e} />
      ))}
    </div>
  )
}

function ExecutionRow({ execution: e }: { execution: Execution }) {
  const [expanded, setExpanded] = useState(false)
  const hasOutput = e.stdout || e.stderr

  return (
    <div>
      <Button
        variant="ghost"
        fullWidth
        isDisabled={!hasOutput}
        aria-label={`Execution at ${e.startedAt}${hasOutput ? ', click to expand' : ''}`}
        className="flex items-center gap-3 px-4 py-3 text-left justify-start rounded-none h-auto"
        onPress={() => setExpanded(v => !v)}
      >
        <StatusIcon status={e.status} />
        <span className="text-sm text-foreground flex-1" suppressHydrationWarning>
          {new Date(e.startedAt).toLocaleString()}
        </span>
        <span className="text-xs text-muted-foreground">
          {e.durationMs > 0 ? `${(e.durationMs / 1000).toFixed(1)}s` : '—'}
        </span>
        {hasOutput && (
          <span className="text-muted-foreground">
            {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </span>
        )}
      </Button>
      {expanded && hasOutput && (
        <div className="px-4 pb-3 space-y-2">
          {e.skipReason && (
            <p className="text-xs text-muted-foreground italic">{e.skipReason}</p>
          )}
          {e.stdout && (
            <pre className="text-xs font-mono bg-muted rounded p-2 overflow-auto max-h-40 whitespace-pre-wrap">{e.stdout}</pre>
          )}
          {e.stderr && (
            <pre className="text-xs font-mono bg-destructive/10 text-destructive rounded p-2 overflow-auto max-h-40 whitespace-pre-wrap">{e.stderr}</pre>
          )}
        </div>
      )}
    </div>
  )
}

const STATUS_LABELS: Record<ExecutionStatus, string> = {
  success: 'Succeeded',
  failed: 'Failed',
  running: 'Running',
  skipped: 'Skipped — another execution of this task was already running',
  interrupted: 'Interrupted — the scheduler restarted while this was running',
}

function StatusIcon({ status }: { status: ExecutionStatus }) {
  const icon = (() => {
    switch (status) {
      case 'success':
        return <CircleCheck size={16} className="text-green-500 shrink-0" />
      case 'failed':
        return <CircleX size={16} className="text-destructive shrink-0" />
      case 'running':
        return <Clock size={16} className="text-primary shrink-0 animate-pulse" />
      case 'skipped':
        return <SkipForward size={16} className="text-muted-foreground shrink-0" />
      default:
        return <CircleX size={16} className="text-muted-foreground shrink-0" />
    }
  })()
  return <span title={STATUS_LABELS[status] ?? status}>{icon}</span>
}
