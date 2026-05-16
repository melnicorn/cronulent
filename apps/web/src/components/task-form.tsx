'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Info } from 'lucide-react'
import cronstrue from 'cronstrue'
import type { Task, CommandType, PluginManifest } from '@repo/common'
import { createTaskAction, updateTaskAction } from '../actions/tasks'
import { CronHelp } from './cron-help'
import { EnvEditor } from './env-editor'
import { ScriptEditor, type ScriptEditorHandle } from './script-editor'
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

type EnabledPlugin = Pick<PluginManifest, 'id' | 'name' | 'pythonFunctionSchema' | 'nodeFunctionSchema'>
type LifecycleTrigger = 'none' | 'onSuccess' | 'onFailure' | 'both'

function importLineFor(commandType: CommandType): string {
  if (commandType === 'python-uv') return 'from cronulent_hooks import cronhooks'
  if (commandType === 'node-volta') return "import cronhooks from '../shared/cronulent_hooks.mjs'"
  if (commandType === 'shell') return 'source "../shared/cronulent_hooks.sh"'
  return ''
}

interface Props {
  task?: Task
  enabledPlugins?: EnabledPlugin[]
}

const LIFECYCLE_TRIGGERS: { value: LifecycleTrigger; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'onFailure', label: 'On failure' },
  { value: 'onSuccess', label: 'On success' },
  { value: 'both', label: 'On success and failure' },
]

const COMMAND_TYPES: { value: CommandType; label: string }[] = [
  { value: 'shell', label: 'Shell' },
  { value: 'python-uv', label: 'Python (uv)' },
  { value: 'node-volta', label: 'Node.js (Volta)' },
]

function deriveLifecycleTrigger(task: Task | undefined): LifecycleTrigger {
  const n = task?.lifecycleNotifications
  if (!n) return 'none'
  if (n.onSuccess && n.onFailure) return 'both'
  if (n.onSuccess) return 'onSuccess'
  if (n.onFailure) return 'onFailure'
  return 'none'
}

export function TaskForm({ task, enabledPlugins = [] }: Props) {
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
  const editorRef = useRef<ScriptEditorHandle>(null)
  const [lifecycleTrigger, setLifecycleTrigger] = useState<LifecycleTrigger>(deriveLifecycleTrigger(task))
  const [lifecyclePluginId, setLifecyclePluginId] = useState<string>(
    task?.lifecycleNotifications?.onSuccess?.pluginId ??
    task?.lifecycleNotifications?.onFailure?.pluginId ??
    enabledPlugins[0]?.id ?? ''
  )

  function buildLifecycleNotifications() {
    if (lifecycleTrigger === 'none' || !lifecyclePluginId) return undefined
    const cfg = { pluginId: lifecyclePluginId }
    return {
      onSuccess: lifecycleTrigger === 'onSuccess' || lifecycleTrigger === 'both' ? cfg : undefined,
      onFailure: lifecycleTrigger === 'onFailure' || lifecycleTrigger === 'both' ? cfg : undefined,
    }
  }

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
      lifecycleNotifications: buildLifecycleNotifications(),
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
        <div className="flex items-center justify-between">
          <Label>Script</Label>
          <InsertDropdown
            commandType={commandType}
            enabledPlugins={enabledPlugins}
            onInsert={text => editorRef.current?.insert(text)}
            onInsertAtTop={text => editorRef.current?.insertAtTop(text)}
            importLine={importLineFor(commandType)}
          />
        </div>
        {(
          <ScriptEditor
            ref={editorRef}
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
            language={commandType === 'python-uv' ? 'python' : commandType === 'shell' ? 'shell' : 'javascript'}
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

      {enabledPlugins.length > 0 && (
        <div className="space-y-3">
          <span className="text-sm font-medium">Notifications</span>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Select
              fullWidth
              value={lifecycleTrigger}
              onChange={key => { if (typeof key === 'string') setLifecycleTrigger(key as LifecycleTrigger) }}
            >
              <Label>Trigger</Label>
              <Select.Trigger>
                <Select.Value />
                <Select.Indicator />
              </Select.Trigger>
              <Select.Popover>
                <ListBox>
                  {LIFECYCLE_TRIGGERS.map(t => (
                    <ListBox.Item key={t.value} id={t.value} textValue={t.label}>
                      {t.label}
                      <ListBox.ItemIndicator />
                    </ListBox.Item>
                  ))}
                </ListBox>
              </Select.Popover>
            </Select>

            {lifecycleTrigger !== 'none' && (
              <Select
                fullWidth
                value={lifecyclePluginId}
                onChange={key => { if (typeof key === 'string') setLifecyclePluginId(key) }}
              >
                <Label>Plugin</Label>
                <Select.Trigger>
                  <Select.Value />
                  <Select.Indicator />
                </Select.Trigger>
                <Select.Popover>
                  <ListBox>
                    {enabledPlugins.map(p => (
                      <ListBox.Item key={p.id} id={p.id} textValue={p.name}>
                        {p.name}
                        <ListBox.ItemIndicator />
                      </ListBox.Item>
                    ))}
                  </ListBox>
                </Select.Popover>
              </Select>
            )}
          </div>
        </div>
      )}

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

interface InsertDropdownProps {
  commandType: CommandType
  enabledPlugins: EnabledPlugin[]
  onInsert: (text: string) => void
  onInsertAtTop: (text: string) => void
  importLine: string
}

function buildSnippetMap(enabledPlugins: EnabledPlugin[], commandType: CommandType): Map<string, string> {
  const map = new Map<string, string>()
  for (const plugin of enabledPlugins) {
    if (commandType === 'shell') {
      for (const fn of plugin.pythonFunctionSchema) {
        const args = fn.params.filter(p => !p.optional).map(p => `"<${p.name}>"`).join(' ')
        map.set(`${plugin.id}.${fn.name}`, `cronhooks_${plugin.id}_${fn.name} ${args}`)
      }
    } else {
      const fns = commandType === 'python-uv' ? plugin.pythonFunctionSchema : plugin.nodeFunctionSchema
      for (const fn of fns) {
        const args = fn.params.filter(p => !p.optional).map(p => `"${p.name}"`).join(', ')
        const call = commandType === 'python-uv'
          ? `cronhooks.${plugin.id}.${fn.name}(${args})`
          : `await cronhooks.${plugin.id}.${fn.name}(${args})`
        map.set(`${plugin.id}.${fn.name}`, call)
      }
    }
  }
  return map
}

function InsertDropdown({ commandType, enabledPlugins, onInsert, onInsertAtTop, importLine }: InsertDropdownProps) {
  const snippetMap = buildSnippetMap(enabledPlugins, commandType)

  function handleChange(key: string) {
    if (!key) return
    if (key === '__import__') {
      onInsertAtTop(importLine)
    } else {
      const call = snippetMap.get(key)
      if (call) onInsert(call)
    }
  }

  return (
    <Select
      value=""
      onChange={key => { if (typeof key === 'string') handleChange(key) }}
    >
      <Select.Trigger className="text-xs text-foreground h-7 min-w-[130px]">
        <Select.Value>Insert…</Select.Value>
        <Select.Indicator />
      </Select.Trigger>
      <Select.Popover>
        <ListBox>
          <ListBox.Section aria-label="Actions">
            <ListBox.Item id="__import__" textValue="Add import">
              Add import
              <ListBox.ItemIndicator />
            </ListBox.Item>
          </ListBox.Section>
          {enabledPlugins.map(plugin => {
            const fns = plugin.pythonFunctionSchema
            if (fns.length === 0) return null
            return (
              <ListBox.Section key={plugin.id} aria-label={plugin.name}>
                {fns.map(fn => (
                  <ListBox.Item key={`${plugin.id}.${fn.name}`} id={`${plugin.id}.${fn.name}`} textValue={`${plugin.name}: ${fn.name}`}>
                    <span className="text-xs text-muted-foreground">{plugin.name}</span>
                    <span className="mx-1 text-muted-foreground/50">›</span>
                    <span>{fn.name}</span>
                    <ListBox.ItemIndicator />
                  </ListBox.Item>
                ))}
              </ListBox.Section>
            )
          })}
        </ListBox>
      </Select.Popover>
    </Select>
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
