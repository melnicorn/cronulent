import { z } from 'zod'
import type { PluginManifest } from '@repo/common'

const API_URL = 'https://peskybird.app/api/push/messages'
const DEFAULT_TOPIC = 'cronulent'
const SEND_TIMEOUT_MS = 10_000

export const manifest: PluginManifest = {
  id: 'peskybird',
  name: 'PeskyBird',
  description: 'Send push notifications to a PeskyBird topic.',
  adminConfigSchema: [
    { key: 'appToken', label: 'App Token', type: 'secret', required: true },
    { key: 'topic', label: `Topic (default: ${DEFAULT_TOPIC})`, type: 'string', required: false },
  ],
  pythonFunctionSchema: [
    {
      name: 'send_message',
      description: 'Send a push notification via PeskyBird.',
      params: [
        { name: 'title', type: 'str', description: 'Notification title', optional: false },
        { name: 'text', type: 'str', description: 'Notification body', optional: false },
        { name: 'strict', type: 'bool', description: 'Raise an error if the plugin is unconfigured or the send fails', optional: true, defaultValue: 'False' },
      ],
    },
  ],
  nodeFunctionSchema: [
    {
      name: 'sendMessage',
      description: 'Send a push notification via PeskyBird.',
      params: [
        { name: 'title', type: 'string', description: 'Notification title', optional: false },
        { name: 'text', type: 'string', description: 'Notification body', optional: false },
        { name: 'strict', type: 'boolean', description: 'Throw an error if the plugin is unconfigured or the send fails', optional: true, defaultValue: 'false' },
      ],
    },
  ],
}

export function generatePythonHelper(): string {
  return `\
class peskybird:
    @staticmethod
    def send_message(title, text, strict=False):
        _cronulent_dispatch('peskybird', 'sendMessage', {'title': title, 'text': text}, strict)
`
}

export function generateNodeHelper(): string {
  return `\
export const peskybird = {
  sendMessage: (title, text, strict = false) => _cronulentDispatch('peskybird', 'sendMessage', { title, text }, strict),
}
`
}

export function generateShellHelper(): string {
  return `\
cronhooks_peskybird_send_message() {
  local title="$1" text="$2" strict="\${3:-false}"
  _cronulent_dispatch "peskybird" "sendMessage" "{\\"title\\":\\"\${title}\\",\\"text\\":\\"\${text}\\"}" "\${strict}"
}
`
}

const sendMessageParamsSchema = z.object({
  title: z.string({ required_error: 'title is required' }),
  text: z.string({ required_error: 'text is required' }),
})

export async function dispatch(
  func: string,
  params: Record<string, unknown>,
  config: Record<string, string>,
): Promise<void> {
  if (func !== 'sendMessage') {
    throw new Error(`[peskybird] Unknown function: '${func}'`)
  }

  const parsed = sendMessageParamsSchema.safeParse(params)
  if (!parsed.success) {
    const msg = parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join(', ')
    throw new Error(`[peskybird] Invalid params for sendMessage — ${msg}`)
  }

  const token = config['appToken'] ?? ''
  if (!token) {
    console.warn('[peskybird] dispatch skipped: missing app token')
    return
  }
  const topic = (config['topic'] ?? '').trim().replace(/^#/, '') || DEFAULT_TOPIC

  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    body: JSON.stringify({ topic, title: parsed.data.title, body: parsed.data.text }),
  })
  if (!res.ok) {
    const data = await res.text().catch(() => '')
    throw new Error(`[peskybird] sendMessage failed: HTTP ${res.status}: ${data.slice(0, 300)}`)
  }
}
