import https from 'node:https'
import { z } from 'zod'
import type { PluginManifest } from '@repo/common'

export const manifest: PluginManifest = {
  id: 'telegram',
  name: 'Telegram',
  description: 'Send messages via a Telegram bot.',
  adminConfigSchema: [
    { key: 'botToken', label: 'Bot Token', type: 'secret', required: true },
    { key: 'chatId', label: 'Default Chat ID', type: 'string', required: true },
  ],
  pythonFunctionSchema: [
    {
      name: 'send_message',
      description: 'Send a message via Telegram.',
      params: [
        { name: 'title', type: 'str', description: 'Message title (displayed in bold)', optional: false },
        { name: 'text', type: 'str', description: 'Message body', optional: false },
        { name: 'strict', type: 'bool', description: 'Raise an error if the plugin is unconfigured or the send fails', optional: true, defaultValue: 'False' },
      ],
    },
  ],
  nodeFunctionSchema: [
    {
      name: 'sendMessage',
      description: 'Send a message via Telegram.',
      params: [
        { name: 'title', type: 'string', description: 'Message title (displayed in bold)', optional: false },
        { name: 'text', type: 'string', description: 'Message body', optional: false },
        { name: 'strict', type: 'boolean', description: 'Throw an error if the plugin is unconfigured or the send fails', optional: true, defaultValue: 'false' },
      ],
    },
  ],
}

export function generatePythonHelper(): string {
  return `\
class telegram:
    @staticmethod
    def send_message(title, text, strict=False):
        _cronulent_dispatch('telegram', 'sendMessage', {'title': title, 'text': text}, strict)
`
}

export function generateNodeHelper(): string {
  return `\
export const telegram = {
  sendMessage: (title, text, strict = false) => _cronulentDispatch('telegram', 'sendMessage', { title, text }, strict),
}
`
}

export function generateShellHelper(): string {
  return `\
cronhooks_telegram_send_message() {
  local title="$1" text="$2" strict="\${3:-false}"
  _cronulent_dispatch "telegram" "sendMessage" "{\\"title\\":\\"\${title}\\",\\"text\\":\\"\${text}\\"}" "\${strict}"
}
`
}

const sendMessageParamsSchema = z.object({
  title: z.string({ required_error: 'title is required' }),
  text: z.string({ required_error: 'text is required' }),
})

export function dispatch(
  func: string,
  params: Record<string, unknown>,
  config: Record<string, string>,
): Promise<void> {
  if (func !== 'sendMessage') {
    return Promise.reject(new Error(`[telegram] Unknown function: '${func}'`))
  }

  const parsed = sendMessageParamsSchema.safeParse(params)
  if (!parsed.success) {
    const msg = parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join(', ')
    return Promise.reject(new Error(`[telegram] Invalid params for sendMessage — ${msg}`))
  }

  const { title, text } = parsed.data
  const token = config['botToken'] ?? ''
  const chatId = config['chatId'] ?? ''
  if (!token || !chatId) {
    console.warn('[telegram] dispatch skipped: missing bot token or chat ID')
    return Promise.resolve()
  }
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const body = JSON.stringify({
    chat_id: chatId,
    text: `<b>${esc(title)}</b>\n${esc(text)}`,
    parse_mode: 'HTML',
  })
  return new Promise<void>((resolve, reject) => {
    const req = https.request(
      `https://api.telegram.org/bot${token}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
      },
      (res) => {
        let data = ''
        res.on('data', chunk => { data += chunk })
        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 400) {
            reject(new Error(`[telegram] sendMessage failed: HTTP ${res.statusCode}: ${data}`))
          } else {
            resolve()
          }
        })
      },
    )
    req.on('error', reject)
    req.write(body)
    req.end()
  })
}
