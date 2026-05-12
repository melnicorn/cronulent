'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Info } from 'lucide-react'
import type { Task, CommandType } from '@repo/common'
import { createTaskAction, updateTaskAction } from '../actions/tasks'
import { CronHelp } from './cron-help'
import { EnvEditor } from './env-editor'
import { ScriptEditor } from './script-editor'

interface Props {
  task?: Task
}

const COMMAND_TYPES: { value: CommandType; label: string }[] = [
  { value: 'shell', label: 'Shell' },
  { value: 'python-uv', label: 'Python (uv)' },
  { value: 'node-volta', label: 'Node.js (Volta)' },
  { value: 'executable', label: 'Executable' },
]

export function TaskForm({ task }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const [name, setName] = useState(task?.name ?? '')
  const [description, setDescription] = useState(task?.description ?? '')
  const [commandType, setCommandType] = useState<CommandType>(task?.commandType ?? 'shell')
  const [command, setCommand] = useState(task?.command ?? '')
  const [parameters, setParameters] = useState(task?.parameters.join('\n') ?? '')
  const [cronExpression, setCronExpression] = useState(task?.cronExpression ?? '* * * * *')
  const [env, setEnv] = useState<Record<string, string>>(task?.env ?? {})
  const [enabled, setEnabled] = useState(task?.enabled ?? true)
  const [showCronHelp, setShowCronHelp] = useState(false)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    const input = {
      name,
      description,
      commandType,
      command,
      parameters: parameters.split('\n').map(p => p.trim()).filter(Boolean),
      cronExpression,
      env,
      enabled,
    }

    startTransition(async () => {
      try {
        if (task) {
          await updateTaskAction({ id: task.id, ...input })
          router.push(`/tasks/${task.id}`)
        } else {
          const created = await createTaskAction(input)
          router.push(`/tasks/${created.id}`)
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred')
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="p-3 rounded-md bg-destructive/10 text-destructive text-sm">{error}</div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Name" required>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            required
            className={inputCls}
            placeholder="My scheduled task"
          />
        </Field>

        <Field label="Command type" required>
          <select value={commandType} onChange={e => setCommandType(e.target.value as CommandType)} className={inputCls}>
            {COMMAND_TYPES.map(t => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </Field>
      </div>

      <Field label="Description">
        <input
          value={description}
          onChange={e => setDescription(e.target.value)}
          className={inputCls}
          placeholder="Optional description"
        />
      </Field>

      <Field
        label="Schedule (cron expression)"
        required
        action={
          <button type="button" onClick={() => setShowCronHelp(v => !v)} className="text-muted-foreground hover:text-foreground">
            <Info size={14} />
          </button>
        }
      >
        <input
          value={cronExpression}
          onChange={e => setCronExpression(e.target.value)}
          required
          className={inputCls}
          placeholder="* * * * *"
        />
        {showCronHelp && <CronHelp expression={cronExpression} />}
      </Field>

      <Field label={commandType === 'executable' ? 'Command' : 'Script'}>
        {commandType === 'executable' ? (
          <input
            value={command}
            onChange={e => setCommand(e.target.value)}
            className={inputCls}
            placeholder="/usr/local/bin/my-tool"
          />
        ) : (
          <ScriptEditor
            value={command}
            onChange={setCommand}
            language={commandType === 'python-uv' ? 'python' : 'javascript'}
          />
        )}
      </Field>

      <Field label="Parameters (one per line)">
        <textarea
          value={parameters}
          onChange={e => setParameters(e.target.value)}
          rows={3}
          className={`${inputCls} resize-none`}
          placeholder="--verbose&#10;--output /tmp/result.txt"
        />
      </Field>

      <EnvEditor value={env} onChange={setEnv} />

      <div className="flex items-center gap-2">
        <input
          id="enabled"
          type="checkbox"
          checked={enabled}
          onChange={e => setEnabled(e.target.checked)}
          className="rounded border-input"
        />
        <label htmlFor="enabled" className="text-sm text-foreground">Enable task immediately</label>
      </div>

      <div className="flex items-center gap-3 pt-2">
        <button
          type="submit"
          disabled={isPending}
          className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {isPending ? 'Saving...' : task ? 'Save changes' : 'Create task'}
        </button>
        <button
          type="button"
          onClick={() => router.back()}
          className="px-4 py-2 rounded-md text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          Cancel
        </button>
      </div>
    </form>
  )
}

const inputCls = 'w-full px-3 py-2 rounded-md border border-input bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary'

function Field({ label, required, action, children }: {
  label: string
  required?: boolean
  action?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5">
        <label className="text-sm font-medium text-foreground">
          {label}
          {required && <span className="text-destructive ml-0.5">*</span>}
        </label>
        {action}
      </div>
      {children}
    </div>
  )
}
