'use client'

import { useState } from 'react'
import { Check, Pencil, Plus, Trash2, X } from 'lucide-react'
import { Button, Input, Label } from '@heroui/react'

interface Props {
  value: Record<string, string>
  onChange: (value: Record<string, string>) => void
}

interface EditState {
  originalKey: string
  key: string
  val: string
}

export function EnvEditor({ value, onChange }: Props) {
  const [newKey, setNewKey] = useState('')
  const [newVal, setNewVal] = useState('')
  const [editing, setEditing] = useState<EditState | null>(null)

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

  function startEdit(key: string) {
    setEditing({ originalKey: key, key, val: value[key] ?? '' })
  }

  function saveEdit() {
    if (!editing) return
    const newKey = editing.key.trim()
    if (!newKey) return
    const next = { ...value }
    if (editing.originalKey !== newKey) delete next[editing.originalKey]
    next[newKey] = editing.val
    onChange(next)
    setEditing(null)
  }

  function cancelEdit() {
    setEditing(null)
  }

  return (
    <div className="space-y-2">
      <Label>Environment variables</Label>

      {entries.length > 0 && (
        <div className="space-y-1.5">
          {entries.map(([k, v]) => {
            const isEditing = editing?.originalKey === k
            return isEditing ? (
              <div key={k} className="flex gap-2 items-center">
                <Input
                  value={editing.key}
                  onChange={e => setEditing(s => s && ({ ...s, key: e.target.value }))}
                  aria-label="Environment variable key"
                  className="w-40 font-mono shrink-0"
                  autoFocus
                  onKeyDown={e => {
                    if (e.key === 'Enter') { e.preventDefault(); saveEdit() }
                    if (e.key === 'Escape') { e.preventDefault(); cancelEdit() }
                  }}
                />
                <Input
                  value={editing.val}
                  onChange={e => setEditing(s => s && ({ ...s, val: e.target.value }))}
                  aria-label="Environment variable value"
                  className="flex-1"
                  onKeyDown={e => {
                    if (e.key === 'Enter') { e.preventDefault(); saveEdit() }
                    if (e.key === 'Escape') { e.preventDefault(); cancelEdit() }
                  }}
                />
                <Button type="button" isIconOnly variant="ghost" onPress={saveEdit} aria-label="Save changes">
                  <Check size={14} />
                </Button>
                <Button type="button" isIconOnly variant="ghost" onPress={cancelEdit} aria-label="Cancel edit">
                  <X size={14} />
                </Button>
              </div>
            ) : (
              <div key={k} className="flex gap-2 items-center">
                <span className="font-mono text-xs text-muted-foreground w-40 truncate shrink-0">{k}</span>
                <span className="flex-1 text-xs truncate text-foreground">{v}</span>
                <Button
                  type="button"
                  isIconOnly
                  variant="ghost"
                  onPress={() => startEdit(k)}
                  aria-label={`Edit ${k}`}
                >
                  <Pencil size={14} />
                </Button>
                <Button
                  type="button"
                  isIconOnly
                  variant="ghost"
                  onPress={() => removeEntry(k)}
                  aria-label={`Remove ${k}`}
                  className="text-muted-foreground hover:text-destructive"
                >
                  <Trash2 size={14} />
                </Button>
              </div>
            )
          })}
        </div>
      )}

      <div className="flex gap-2 items-center">
        <Input
          value={newKey}
          onChange={e => setNewKey(e.target.value)}
          placeholder="KEY"
          aria-label="New environment variable key"
          className="w-40 font-mono"
          onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addEntry())}
        />
        <Input
          value={newVal}
          onChange={e => setNewVal(e.target.value)}
          placeholder="value"
          aria-label="New environment variable value"
          className="flex-1"
          onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addEntry())}
        />
        <Button
          type="button"
          isIconOnly
          variant="ghost"
          onPress={addEntry}
          aria-label="Add environment variable"
        >
          <Plus size={14} />
        </Button>
      </div>
    </div>
  )
}
