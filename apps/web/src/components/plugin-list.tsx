'use client'

import { Switch } from '@heroui/react'
import { useState } from 'react'
import type { PluginManifest } from '@repo/common'
import { LinkButton } from './link-button'
import { setPluginEnabledAction } from '../actions/plugins'

interface PluginWithState extends PluginManifest {
  enabled: boolean
  configured: boolean
}

export function PluginList({ plugins }: { plugins: PluginWithState[] }) {
  return (
    <div className="space-y-3">
      {plugins.map(plugin => (
        <PluginCard key={plugin.id} plugin={plugin} />
      ))}
      {plugins.length === 0 && (
        <p className="text-sm text-muted-foreground">No plugins available.</p>
      )}
    </div>
  )
}

function PluginCard({ plugin }: { plugin: PluginWithState }) {
  const [enabled, setEnabled] = useState(plugin.enabled)
  const [saving, setSaving] = useState(false)

  async function handleToggle(isSelected: boolean) {
    setSaving(true)
    try {
      await setPluginEnabledAction(plugin.id, isSelected)
      setEnabled(isSelected)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="rounded-lg border border-border bg-card p-4 flex items-center justify-between gap-4">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-foreground">{plugin.name}</span>
          <span className={`text-xs px-1.5 py-0.5 rounded-full ${enabled ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-muted text-muted-foreground'}`}>
            {enabled ? 'Enabled' : 'Disabled'}
          </span>
          {enabled && !plugin.configured && (
            <span className="text-xs text-amber-600 dark:text-amber-400">Configuration required</span>
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">{plugin.description}</p>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <LinkButton href={`/plugins/${plugin.id}`} variant="outline" size="sm">
          Configure
        </LinkButton>
        <Switch
          isSelected={enabled}
          isDisabled={saving}
          onChange={handleToggle}
          aria-label={`${enabled ? 'Disable' : 'Enable'} ${plugin.name}`}
          size="sm"
        >
          <Switch.Control>
            <Switch.Thumb />
          </Switch.Control>
        </Switch>
      </div>
    </div>
  )
}
