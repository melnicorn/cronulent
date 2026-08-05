'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { AlertDialog, Button, Input, Label, Modal, TextField } from '@heroui/react'
import { KeyRound, Trash2 } from 'lucide-react'
import type { ApiKeyInfo } from '../lib/api-keys'
import { copyText } from '../lib/clipboard'
import { createKeyAction, regenerateKeyAction, revokeKeyAction } from '../actions/api-keys'

interface Props {
  keys: ApiKeyInfo[]
  serviceTokenConfigured: boolean
}

export function ApiKeyManager({ keys, serviceTokenConfigured }: Props) {
  const router = useRouter()
  const [label, setLabel] = useState('')
  const [isPending, startTransition] = useTransition()
  const [newKey, setNewKey] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [copyFailed, setCopyFailed] = useState(false)
  const [revokeTarget, setRevokeTarget] = useState<ApiKeyInfo | null>(null)
  const [regenerateTarget, setRegenerateTarget] = useState<ApiKeyInfo | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleCopy() {
    if (!newKey) return
    setCopyFailed(false)
    if (await copyText(newKey)) {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } else {
      // Never leave the user stuck: the key is selectable in the block above.
      setCopyFailed(true)
    }
  }

  function handleCreate() {
    const trimmed = label.trim()
    if (!trimmed) return
    setError(null)
    startTransition(async () => {
      try {
        const { key } = await createKeyAction(trimmed)
        setLabel('')
        setNewKey(key)
        router.refresh()
      } catch {
        setError('Failed to create key')
      }
    })
  }

  function handleRegenerate(id: string) {
    setError(null)
    startTransition(async () => {
      try {
        const result = await regenerateKeyAction(id)
        if (result) setNewKey(result.key)
        router.refresh()
      } catch {
        setError('Failed to regenerate key')
      }
    })
  }

  return (
    <div className="space-y-6">
      {!serviceTokenConfigured && (
        <div className="p-3 rounded-md bg-amber-500/10 text-amber-700 dark:text-amber-400 text-sm">
          <code className="font-mono">CRONULENT_SERVICE_TOKEN</code> is not configured, so the admin
          API will reject every request. Keys created here will not work until it is set.
        </div>
      )}

      <div className="rounded-lg border border-border bg-card p-6 space-y-4">
        <div className="space-y-1">
          <h2 className="text-sm font-medium text-foreground">Create a key</h2>
          <p className="text-xs text-muted-foreground">
            A key can read and modify tasks, including their scripts, and trigger runs — which is
            equivalent to shell access on this machine. The key is shown once and cannot be
            recovered afterwards.
          </p>
        </div>

        <div className="flex items-end gap-2">
          <TextField fullWidth>
            <Label>Label</Label>
            <Input
              value={label}
              placeholder="laptop"
              onChange={e => setLabel(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleCreate() }}
              autoComplete="off"
            />
          </TextField>
          <Button size="sm" isDisabled={isPending || !label.trim()} isPending={isPending} onPress={handleCreate}>
            Create
          </Button>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>

      {keys.length === 0 ? (
        <p className="text-sm text-muted-foreground">No API keys yet.</p>
      ) : (
        <div className="rounded-lg border border-border divide-y divide-border bg-card">
          {keys.map(key => (
            <div key={key.id} className="flex items-center justify-between px-4 py-3 gap-4">
              <div className="flex items-center gap-3 min-w-0">
                <KeyRound size={16} className="text-muted-foreground shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm text-foreground truncate">{key.label}</p>
                  <p className="text-xs text-muted-foreground font-mono">
                    {key.id} · created {new Date(key.createdAt).toLocaleString()}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Button variant="outline" size="sm" isDisabled={isPending} onPress={() => setRegenerateTarget(key)}>
                  Regenerate
                </Button>
                <Button
                  isIconOnly
                  variant="ghost"
                  size="sm"
                  aria-label={`Revoke ${key.label}`}
                  className="hover:text-destructive"
                  isDisabled={isPending}
                  onPress={() => setRevokeTarget(key)}
                >
                  <Trash2 size={14} />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal isOpen={newKey !== null} onOpenChange={open => { if (!open) setNewKey(null) }}>
        <Modal.Backdrop>
          <Modal.Container>
            <Modal.Dialog>
              <Modal.Header>
                <Modal.Heading>Copy your API key</Modal.Heading>
              </Modal.Header>
              <Modal.Body className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  This is the only time it will be shown. Store it somewhere safe — if you lose it,
                  regenerate the key to get a new one.
                </p>
                <div className="relative">
                  <pre className="rounded bg-muted p-3 pr-16 text-xs font-mono text-foreground overflow-x-auto whitespace-pre-wrap break-all">{newKey}</pre>
                  <button
                    onClick={handleCopy}
                    className="absolute top-2 right-2 text-xs text-muted-foreground hover:text-foreground px-2 py-0.5 rounded border border-border bg-card"
                  >
                    {copied ? 'Copied!' : 'Copy'}
                  </button>
                </div>
                {copyFailed && (
                  <p className="text-xs text-destructive">
                    Couldn&apos;t copy automatically — select the key above and copy it manually.
                  </p>
                )}
              </Modal.Body>
              <Modal.Footer>
                <Button size="sm" onPress={() => setNewKey(null)}>Done</Button>
              </Modal.Footer>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>

      <AlertDialog isOpen={revokeTarget !== null} onOpenChange={open => { if (!open) setRevokeTarget(null) }}>
        <AlertDialog.Backdrop>
          <AlertDialog.Container>
            <AlertDialog.Dialog>
              <AlertDialog.Header><AlertDialog.Heading>Revoke key</AlertDialog.Heading></AlertDialog.Header>
              <AlertDialog.Body>
                Revoke &ldquo;{revokeTarget?.label}&rdquo;? Anything using it will stop working
                immediately. This cannot be undone.
              </AlertDialog.Body>
              <AlertDialog.Footer>
                <Button variant="outline" size="sm" onPress={() => setRevokeTarget(null)}>Cancel</Button>
                <Button
                  variant="danger"
                  size="sm"
                  onPress={() => {
                    const id = revokeTarget?.id
                    setRevokeTarget(null)
                    if (id) startTransition(() => revokeKeyAction(id).then(() => router.refresh()))
                  }}
                >
                  Revoke
                </Button>
              </AlertDialog.Footer>
            </AlertDialog.Dialog>
          </AlertDialog.Container>
        </AlertDialog.Backdrop>
      </AlertDialog>

      <AlertDialog isOpen={regenerateTarget !== null} onOpenChange={open => { if (!open) setRegenerateTarget(null) }}>
        <AlertDialog.Backdrop>
          <AlertDialog.Container>
            <AlertDialog.Dialog>
              <AlertDialog.Header><AlertDialog.Heading>Regenerate key</AlertDialog.Heading></AlertDialog.Header>
              <AlertDialog.Body>
                Replace the secret for &ldquo;{regenerateTarget?.label}&rdquo;? The current key stops
                working immediately and you will be shown a new one once.
              </AlertDialog.Body>
              <AlertDialog.Footer>
                <Button variant="outline" size="sm" onPress={() => setRegenerateTarget(null)}>Cancel</Button>
                <Button
                  variant="danger"
                  size="sm"
                  onPress={() => {
                    const id = regenerateTarget?.id
                    setRegenerateTarget(null)
                    if (id) handleRegenerate(id)
                  }}
                >
                  Regenerate
                </Button>
              </AlertDialog.Footer>
            </AlertDialog.Dialog>
          </AlertDialog.Container>
        </AlertDialog.Backdrop>
      </AlertDialog>
    </div>
  )
}
