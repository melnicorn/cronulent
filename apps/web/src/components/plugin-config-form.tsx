'use client'

import { Button, Input, Label, Switch, TextField } from '@heroui/react'
import { useState } from 'react'
import type { PluginManifest, PluginAdminConfigField, PluginFunction } from '@repo/common'
import { setPluginEnabledAction, updatePluginConfigAction } from '../actions/plugins'
import { copyText } from '../lib/clipboard'

interface ConfigField extends PluginAdminConfigField {
  value: string
}

interface Props {
  pluginId: string
  manifest: PluginManifest
  fields: ConfigField[]
  enabled: boolean
}

export function PluginConfigForm({ pluginId, manifest, fields: initialFields, enabled: initialEnabled }: Props) {
  const [fields, setFields] = useState(initialFields)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [enabled, setEnabled] = useState(initialEnabled)
  const [togglingEnabled, setTogglingEnabled] = useState(false)

  function updateField(key: string, value: string) {
    setFields(prev => prev.map(f => f.key === key ? { ...f, value } : f))
    setMessage(null)
  }

  async function handleToggleEnabled(isSelected: boolean) {
    setTogglingEnabled(true)
    try {
      await setPluginEnabledAction(pluginId, isSelected)
      setEnabled(isSelected)
    } finally {
      setTogglingEnabled(false)
    }
  }

  async function handleSave() {
    setSaving(true)
    setMessage(null)
    try {
      const config: Record<string, string> = {}
      for (const f of fields) config[f.key] = f.value
      await updatePluginConfigAction(pluginId, config)
      setMessage('Saved')
    } catch {
      setMessage('Failed to save')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-8">
      <div className="rounded-lg border border-border bg-card p-4 flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-foreground">Enable plugin</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {enabled ? 'This plugin is active and available for task notifications.' : 'Enable to use this plugin in task notifications.'}
          </p>
        </div>
        <Switch
          isSelected={enabled}
          isDisabled={togglingEnabled}
          onChange={handleToggleEnabled}
          aria-label={enabled ? 'Disable plugin' : 'Enable plugin'}
          size="sm"
        >
          <Switch.Control>
            <Switch.Thumb />
          </Switch.Control>
        </Switch>
      </div>

      <div className="rounded-lg border border-border bg-card p-6 space-y-4">
        <h2 className="text-sm font-medium text-foreground">Configuration</h2>
        <div className="space-y-4">
          {fields.map(field => (
            <TextField key={field.key} isRequired={field.required} fullWidth>
              <Label>{field.label}</Label>
              <Input
                type={field.type === 'secret' ? 'password' : 'text'}
                value={field.value}
                placeholder={field.type === 'secret' && field.value === '••••••' ? 'Enter new value to change' : undefined}
                onChange={e => updateField(field.key, e.target.value)}
                autoComplete="off"
              />
            </TextField>
          ))}
        </div>
        <div className="flex items-center gap-3 pt-2">
          <Button size="sm" isDisabled={saving} isPending={saving} onPress={handleSave}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
          {message && (
            <span className={`text-sm ${message === 'Saved' ? 'text-green-600 dark:text-green-400' : 'text-destructive'}`}>
              {message}
            </span>
          )}
        </div>
      </div>

      <UsageDocs manifest={manifest} />
    </div>
  )
}

type Runtime = 'python' | 'node' | 'shell'

function UsageDocs({ manifest }: { manifest: PluginManifest }) {
  const [runtime, setRuntime] = useState<Runtime>('python')
  const fns = runtime === 'node' ? manifest.nodeFunctionSchema : manifest.pythonFunctionSchema
  const importLine =
    runtime === 'python' ? `from cronulent_hooks import cronhooks` :
    runtime === 'node' ? `import cronhooks from '../shared/cronulent_hooks.mjs'` :
    `source "../shared/cronulent_hooks.sh"`

  const tabs: { value: Runtime; label: string }[] = [
    { value: 'python', label: 'Python' },
    { value: 'node', label: 'Node.js' },
    { value: 'shell', label: 'Shell' },
  ]

  return (
    <div className="rounded-lg border border-border bg-card p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-foreground">Usage</h2>
        <div className="flex rounded-md border border-border overflow-hidden text-xs">
          {tabs.map(tab => (
            <button
              key={tab.value}
              className={`px-3 py-1 ${runtime === tab.value ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
              onClick={() => setRuntime(tab.value)}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {fns.map(fn => (
        <FunctionDocs key={fn.name} fn={fn} importLine={importLine} pluginId={manifest.id} runtime={runtime} />
      ))}
    </div>
  )
}

function FunctionDocs({
  fn,
  importLine,
  pluginId,
  runtime,
}: {
  fn: PluginFunction
  importLine: string
  pluginId: string
  runtime: Runtime
}) {
  const [copied, setCopied] = useState(false)
  const userParams = fn.params.filter(p => p.name !== 'strict')

  const snippet = buildSnippet(fn, importLine, pluginId, runtime)

  async function handleCopy() {
    if (!(await copyText(snippet))) return
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">{fn.description}</p>

      <div className="relative">
        <pre className="rounded bg-muted p-3 text-xs font-mono text-foreground overflow-x-auto whitespace-pre">{snippet}</pre>
        <button
          onClick={handleCopy}
          className="absolute top-2 right-2 text-xs text-muted-foreground hover:text-foreground px-2 py-0.5 rounded border border-border bg-card"
        >
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>

      {userParams.length > 0 && (
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="border-b border-border text-left">
              <th className="py-1.5 pr-4 font-medium text-muted-foreground">Parameter</th>
              <th className="py-1.5 pr-4 font-medium text-muted-foreground">{runtime === 'shell' ? 'Position' : 'Type'}</th>
              <th className="py-1.5 font-medium text-muted-foreground">Description</th>
            </tr>
          </thead>
          <tbody>
            {fn.params.map((param, i) => (
              <tr key={param.name} className="border-b border-border/50">
                <td className="py-1.5 pr-4 font-mono text-foreground">{param.name}{param.optional ? '' : ' *'}</td>
                <td className="py-1.5 pr-4 text-muted-foreground">{runtime === 'shell' ? `$${i + 1}` : param.type}</td>
                <td className="py-1.5 text-muted-foreground">{param.description}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {userParams.length > 0 && <p className="text-xs text-muted-foreground">* required</p>}
    </div>
  )
}

function buildSnippet(fn: PluginFunction, importLine: string, pluginId: string, runtime: Runtime): string {
  if (runtime === 'shell') {
    const shellFnName = `cronhooks_${pluginId}_${fn.name}`
    const args = fn.params
      .map(p => p.optional ? `[<${p.name}>]` : `"<${p.name}>"`)
      .join(' ')
    return `${importLine}\n\n${shellFnName} ${args}`
  }
  const callArgs = fn.params
    .map(p => p.optional
      ? (runtime === 'python' ? `${p.name}=${p.defaultValue ?? 'None'}` : `/* ${p.name}=${p.defaultValue ?? 'undefined'} */`)
      : `<${p.name}>`)
    .join(', ')
  return runtime === 'python'
    ? `${importLine}\n\ncronhooks.${pluginId}.${fn.name}(${callArgs})`
    : `${importLine}\n\nawait cronhooks.${pluginId}.${fn.name}(${callArgs})`
}
