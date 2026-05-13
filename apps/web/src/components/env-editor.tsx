'use client'

import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'

interface Props {
  value: Record<string, string>
  onChange: (value: Record<string, string>) => void
}

export function EnvEditor({ value, onChange }: Props) {
  const [newKey, setNewKey] = useState('')
  const [newVal, setNewVal] = useState('')

  const entries = Object.entries(value)

  function addEntry() {
    const k = newKey.trim()
    if (!k) return
    onChange({ ...value, [k]: newVal })
    setNewKey('')
    setNewVal('')
  }

  function removeEntry(key: string) {
    const next = { ...value }
    delete next[key]
    onChange(next)
  }

  function updateValue(key: string, val: string) {
    onChange({ ...value, [key]: val })
  }

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium text-foreground">Environment variables</label>

      {entries.length > 0 && (
        <div className="space-y-1.5">
          {entries.map(([k, v]) => (
            <div key={k} className="flex gap-2 items-center">
              <span className="font-mono text-xs text-muted-foreground w-40 truncate shrink-0">{k}</span>
              <input
                value={v}
                onChange={e => updateValue(k, e.target.value)}
                className="flex-1 px-2 py-1 text-xs rounded border border-input bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <button type="button" onClick={() => removeEntry(k)} className="text-muted-foreground hover:text-destructive transition-colors">
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-2 items-center">
        <input
          value={newKey}
          onChange={e => setNewKey(e.target.value)}
          placeholder="KEY"
          className="w-40 px-2 py-1 text-xs font-mono rounded border border-input bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addEntry())}
        />
        <input
          value={newVal}
          onChange={e => setNewVal(e.target.value)}
          placeholder="value"
          className="flex-1 px-2 py-1 text-xs rounded border border-input bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addEntry())}
        />
        <button
          type="button"
          onClick={addEntry}
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          <Plus size={14} />
        </button>
      </div>
    </div>
  )
}
