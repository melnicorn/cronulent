'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Info } from 'lucide-react'
import cronstrue from 'cronstrue'
import type { Task, CommandType } from '@repo/common'
import { createTaskAction, updateTaskAction } from '../actions/tasks'
import { CronHelp } from './cron-help'
import { EnvEditor } from './env-editor'
import { ScriptEditor } from './script-editor'
import {
  Button,
  Checkbox,
  Description,
  Input,
  Label,
  ListBox,
  Select,
  TextArea,
  TextField,
} from '@heroui/react'

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
  const [dependencies, setDependencies] = useState(task?.dependencies.join('\n') ?? '')
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
      dependencies: dependencies.split('\n').map(d => d.trim()).filter(Boolean),
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
        <TextField isRequired fullWidth>
          <Label>Name</Label>
          <Input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="My scheduled task"
          />
        </TextField>

        <Select
          fullWidth
          value={commandType}
          onChange={key => { if (typeof key === 'string') setCommandType(key as CommandType) }}
        >
          <Label>Command type</Label>
          <Select.Trigger>
            <Select.Value />
            <Select.Indicator />
          </Select.Trigger>
          <Select.Popover>
            <ListBox>
              {COMMAND_TYPES.map(t => (
                <ListBox.Item key={t.value} id={t.value} textValue={t.label}>
                  {t.label}
                  <ListBox.ItemIndicator />
                </ListBox.Item>
              ))}
            </ListBox>
          </Select.Popover>
        </Select>
      </div>

      <TextField fullWidth>
        <Label>Description</Label>
        <Input
          value={description}
          onChange={e => setDescription(e.target.value)}
          placeholder="Optional description"
        />
      </TextField>

      <div className="space-y-1.5">
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-medium">Schedule (cron expression) <span className="text-destructive">*</span></span>
          <Button
            type="button"
            isIconOnly
            variant="ghost"
            size="sm"
            onPress={() => setShowCronHelp(v => !v)}
            aria-label="Cron expression help"
          >
            <Info size={14} />
          </Button>
        </div>
        <Input
          value={cronExpression}
          onChange={e => setCronExpression(e.target.value)}
          required
          placeholder="* * * * *"
          fullWidth
        />
        <CronDescription expression={cronExpression} />
        {showCronHelp && <CronHelp expression={cronExpression} />}
      </div>

      <div className="space-y-1.5">
        <Label>{commandType === 'executable' ? 'Command' : 'Script'}</Label>
        {commandType === 'executable' ? (
          <Input
            value={command}
            onChange={e => setCommand(e.target.value)}
            placeholder="/usr/local/bin/my-tool"
            fullWidth
          />
        ) : (
          <ScriptEditor
            value={command}
            onChange={setCommand}
            onBlur={v => {
              const detected = detectEnvVars(v, commandType)
              if (detected.length > 0) {
                setEnv(prev => {
                  const next = { ...prev }
                  for (const key of detected) {
                    if (!(key in next)) next[key] = ''
                  }
                  return next
                })
              }
            }}
            language={commandType === 'python-uv' ? 'python' : 'javascript'}
          />
        )}
      </div>

      {(commandType === 'python-uv' || commandType === 'node-volta') && (
        <TextField fullWidth>
          <Label>Dependencies (one per line)</Label>
          <Description>{commandType === 'python-uv' ? 'e.g. requests, httpx>=0.27' : 'e.g. axios, zod@3'}</Description>
          <TextArea
            value={dependencies}
            onChange={e => setDependencies(e.target.value)}
            rows={3}
            className="resize-none font-mono"
            placeholder={commandType === 'python-uv' ? 'requests\nhttpx>=0.27' : 'axios\nzod@3'}
          />
        </TextField>
      )}

      <TextField fullWidth>
        <Label>Parameters (one per line)</Label>
        <TextArea
          value={parameters}
          onChange={e => setParameters(e.target.value)}
          rows={3}
          className="resize-none"
          placeholder={'--verbose\n--output /tmp/result.txt'}
        />
      </TextField>

      <EnvEditor value={env} onChange={setEnv} />

      <Checkbox isSelected={enabled} onChange={setEnabled}>
        <Checkbox.Control>
          <Checkbox.Indicator />
        </Checkbox.Control>
        <Checkbox.Content>
          <Label>Enable task immediately</Label>
        </Checkbox.Content>
      </Checkbox>

      <div className="flex items-center gap-3 pt-2">
        <Button type="submit" isDisabled={isPending} isPending={isPending}>
          {isPending ? 'Saving...' : task ? 'Save changes' : 'Create task'}
        </Button>
        <Button type="button" variant="ghost" onPress={() => router.back()}>
          Cancel
        </Button>
      </div>
    </form>
  )
}

function CronDescription({ expression }: { expression: string }) {
  try {
    const text = cronstrue.toString(expression, { throwExceptionOnParseError: true })
    return <p className="text-xs text-muted-foreground mt-1">{text}</p>
  } catch {
    return expression.trim()
      ? <p className="text-xs text-destructive mt-1">Invalid expression</p>
      : null
  }
}

function detectEnvVars(code: string, commandType: CommandType): string[] {
  const vars = new Set<string>()
  const patterns: RegExp[] = []

  if (commandType === 'shell') {
    // $VAR and ${VAR}, excluding special shell vars ($0-$9, $#, $@, $*, $?, $$, $!)
    patterns.push(/\$\{?([A-Z_][A-Z0-9_]+)\}?/g)
  } else if (commandType === 'python-uv') {
    patterns.push(
      /os\.environ\[['"]([A-Z_][A-Z0-9_]*)['"]\]/g,
      /os\.environ\.get\(['"]([A-Z_][A-Z0-9_]*)['"]/g,
      /os\.getenv\(['"]([A-Z_][A-Z0-9_]*)['"]/g,
      /environ\[['"]([A-Z_][A-Z0-9_]*)['"]\]/g,
    )
  } else if (commandType === 'node-volta') {
    patterns.push(
      /process\.env\.([A-Z_][A-Z0-9_]*)/g,
      /process\.env\[['"]([A-Z_][A-Z0-9_]*)['"]\]/g,
    )
  }

  for (const re of patterns) {
    for (const m of code.matchAll(re)) {
      vars.add(m[1]!)
    }
  }

  return [...vars]
}
