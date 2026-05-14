'use client'

import type { Key } from '@heroui/react'
import { Autocomplete, EmptyState, Label, ListBox, SearchField, useFilter } from '@heroui/react'
import { useState, useEffect } from 'react'
import { updateSettingsAction } from '../actions/system'
import { Button } from '@heroui/react'

const allTimezones: string[] = (() => {
  try {
    return Intl.supportedValuesOf('timeZone')
  } catch {
    return []
  }
})()

export function SettingsForm({ currentTimezone }: { currentTimezone: string }) {
  const { contains } = useFilter({ sensitivity: 'base' })
  const [timezone, setTimezone] = useState<string>(currentTimezone)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    if (!currentTimezone) {
      setTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone)
    }
  }, [currentTimezone])

  async function handleSave() {
    setSaving(true)
    setMessage(null)
    try {
      await updateSettingsAction({ timezone })
      setMessage('Saved')
    } catch {
      setMessage('Failed to save')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="rounded-lg border border-border bg-card p-6 space-y-6">
      <div>
        <h2 className="text-sm font-medium text-foreground mb-4">Scheduler</h2>
        <div className="space-y-1.5">
          <Autocomplete
            className="w-full"
            value={timezone || null}
            onChange={(key: Key | Key[] | null) => {
              const val = Array.isArray(key) ? key[0] : key
              if (typeof val === 'string') {
                setTimezone(val)
                setMessage(null)
              }
            }}
          >
            <Label className="block text-sm text-muted-foreground">Timezone</Label>
            <Autocomplete.Trigger>
              <Autocomplete.Value />
              <Autocomplete.Indicator />
            </Autocomplete.Trigger>
            <Autocomplete.Popover>
              <Autocomplete.Filter filter={contains}>
                <SearchField autoFocus name="search" variant="secondary">
                  <SearchField.Group>
                    <SearchField.SearchIcon />
                    <SearchField.Input placeholder="Search timezones…" />
                    <SearchField.ClearButton />
                  </SearchField.Group>
                </SearchField>
                <ListBox renderEmptyState={() => <EmptyState>No results found</EmptyState>}>
                  {allTimezones.map(tz => (
                    <ListBox.Item key={tz} id={tz} textValue={tz}>
                      {tz}
                      <ListBox.ItemIndicator />
                    </ListBox.Item>
                  ))}
                </ListBox>
              </Autocomplete.Filter>
            </Autocomplete.Popover>
          </Autocomplete>
          <p className="text-xs text-muted-foreground">
            All cron schedules run in this timezone
          </p>
        </div>
      </div>
      <div className="flex items-center gap-3">
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
  )
}
