import { z } from 'zod'
import type { PluginManifest } from '@repo/common'
import type { DispatchServices } from './index'
import type { StateStore } from '../state-store'
import { createSerializer } from '../serialize'

export const DEFAULT_MODEL = 'gemini-3.1-flash-lite'
export const DEFAULT_DAILY_LIMIT = 20
// Lives in the job-state store; job keys are 64-char hex HMACs, so this can't collide.
export const USAGE_KEY = '__gemini_usage__'
export const REQUEST_TIMEOUT_MS = 60_000
// Longer than REQUEST_TIMEOUT_MS so a slow call surfaces as the server's
// timeout error rather than the client giving up first.
const HELPER_TIMEOUT_S = 90

export interface GeminiUsage {
  day: string // quota day, YYYY-MM-DD in America/Los_Angeles
  count: number
}

export const manifest: PluginManifest = {
  id: 'gemini',
  name: 'Gemini',
  description: 'Ask Google Gemini to interpret text and return structured JSON or plain text. Calls are capped per day.',
  adminConfigSchema: [
    { key: 'apiKey', label: 'API Key', type: 'secret', required: true },
    { key: 'model', label: `Model (default ${DEFAULT_MODEL})`, type: 'string', required: false },
    { key: 'dailyLimit', label: `Daily Call Limit (default ${DEFAULT_DAILY_LIMIT}, resets midnight Pacific)`, type: 'string', required: false },
  ],
  pythonFunctionSchema: [
    {
      name: 'extract',
      description: 'Extract structured data from text. Returns a dict matching `schema`, or None on failure (unless strict).',
      params: [
        { name: 'instructions', type: 'str', description: 'What to extract or decide', optional: false },
        { name: 'text', type: 'str', description: 'The text to interpret', optional: false },
        { name: 'schema', type: 'dict', description: 'JSON Schema the result must match', optional: false },
        { name: 'strict', type: 'bool', description: 'Raise an error instead of returning None on failure or when the daily limit is reached', optional: true, defaultValue: 'False' },
      ],
    },
    {
      name: 'prompt',
      description: 'Send a free-text prompt. Returns the response text, or None on failure (unless strict).',
      params: [
        { name: 'prompt', type: 'str', description: 'The prompt', optional: false },
        { name: 'strict', type: 'bool', description: 'Raise an error instead of returning None on failure or when the daily limit is reached', optional: true, defaultValue: 'False' },
      ],
    },
  ],
  nodeFunctionSchema: [
    {
      name: 'extract',
      description: 'Extract structured data from text. Resolves to an object matching `schema`, or undefined on failure (unless strict).',
      params: [
        { name: 'instructions', type: 'string', description: 'What to extract or decide', optional: false },
        { name: 'text', type: 'string', description: 'The text to interpret', optional: false },
        { name: 'schema', type: 'object', description: 'JSON Schema the result must match', optional: false },
        { name: 'strict', type: 'boolean', description: 'Throw instead of resolving undefined on failure or when the daily limit is reached', optional: true, defaultValue: 'false' },
      ],
    },
    {
      name: 'prompt',
      description: 'Send a free-text prompt. Resolves to the response text, or undefined on failure (unless strict).',
      params: [
        { name: 'prompt', type: 'string', description: 'The prompt', optional: false },
        { name: 'strict', type: 'boolean', description: 'Throw instead of resolving undefined on failure or when the daily limit is reached', optional: true, defaultValue: 'false' },
      ],
    },
  ],
}

export function generatePythonHelper(): string {
  return `\
class gemini:
    @staticmethod
    def extract(instructions, text, schema, strict=False):
        return _cronulent_dispatch('gemini', 'extract', {'instructions': instructions, 'text': text, 'schema': schema}, strict, timeout=${HELPER_TIMEOUT_S})

    @staticmethod
    def prompt(prompt, strict=False):
        return _cronulent_dispatch('gemini', 'prompt', {'prompt': prompt}, strict, timeout=${HELPER_TIMEOUT_S})
`
}

export function generateNodeHelper(): string {
  return `\
export const gemini = {
  extract: (instructions, text, schema, strict = false) => _cronulentDispatch('gemini', 'extract', { instructions, text, schema }, strict),
  prompt: (prompt, strict = false) => _cronulentDispatch('gemini', 'prompt', { prompt }, strict),
}
`
}

// Params are JSON-encoded with python3 so arbitrary text (quotes, newlines) is
// escaped correctly; the text itself goes via stdin to avoid argv size limits.
export function generateShellHelper(): string {
  return `\
cronhooks_gemini_extract() {
  # cronhooks_gemini_extract "<instructions>" "<text>" '<schema-json>' [strict]  -> prints result JSON
  local params
  params=$(printf '%s' "$2" | python3 -c 'import json,sys; print(json.dumps({"instructions": sys.argv[1], "text": sys.stdin.read(), "schema": json.loads(sys.argv[2])}))' "$1" "$3" 2>/dev/null) || {
    echo "[cronulent] gemini extract: schema is not valid JSON" >&2
    return 1
  }
  _cronulent_dispatch_result "gemini" "extract" "\${params}" "\${4:-false}"
}
cronhooks_gemini_prompt() {
  # cronhooks_gemini_prompt "<prompt>" [strict]  -> prints response text
  local params
  params=$(printf '%s' "$1" | python3 -c 'import json,sys; print(json.dumps({"prompt": sys.stdin.read()}))')
  _cronulent_dispatch_result "gemini" "prompt" "\${params}" "\${2:-false}"
}
`
}

// --- Config ---

function resolveConfig(config: Record<string, string>, pluginEnabled: boolean) {
  const apiKey = config['apiKey']?.trim() ?? ''
  if (!pluginEnabled || !apiKey) {
    throw new Error('[gemini] plugin is not enabled or has no API key')
  }
  const rawLimit = config['dailyLimit']?.trim() ?? ''
  if (rawLimit && !/^\d+$/.test(rawLimit)) {
    throw new Error('[gemini] dailyLimit must be a whole number')
  }
  return {
    apiKey,
    model: config['model']?.trim() || DEFAULT_MODEL,
    dailyLimit: rawLimit ? Number(rawLimit) : DEFAULT_DAILY_LIMIT,
  }
}

// --- Daily cap ---

const pacificFormat = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles' })

/** Gemini's free-tier quota day: the calendar date in US Pacific time. */
export function pacificDay(now: Date): string {
  return pacificFormat.format(now)
}

class DailyLimitError extends Error {
  constructor(limit: number) {
    super(`[gemini] daily limit of ${limit} calls reached; resets at midnight Pacific`)
  }
}

function isUsage(value: unknown): value is GeminiUsage {
  const v = value as GeminiUsage | null
  return typeof v?.day === 'string' && typeof v?.count === 'number'
}

// Check-and-increment must be atomic, or two tasks could both see one call left.
const serialize = createSerializer()

/**
 * Reserve one call for today, before the request is sent — so failed requests
 * still count, and concurrent callers can't overshoot. Returns today's count
 * including this call. Throws DailyLimitError when the limit is reached.
 */
export function reserveCall(store: StateStore, limit: number, now = new Date()): Promise<number> {
  return serialize(async () => {
    const today = pacificDay(now)
    const { value } = await store.get(USAGE_KEY)
    const used = isUsage(value) && value.day === today ? value.count : 0
    if (used >= limit) throw new DailyLimitError(limit)
    const usage: GeminiUsage = { day: today, count: used + 1 }
    await store.set(USAGE_KEY, usage, now.toISOString())
    return usage.count
  })
}

// --- Gemini API ---

interface GeminiResponse {
  candidates?: {
    content?: { parts?: { text?: string; thought?: boolean }[] }
    finishReason?: string
  }[]
  promptFeedback?: { blockReason?: string }
  error?: { message?: string }
}

// Error messages are built only from response fields — never the URL or
// headers — so the API key can't leak into task output or logs.
async function callGemini(apiKey: string, model: string, body: object): Promise<string> {
  let res: Response
  try {
    res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      },
    )
  } catch (err) {
    throw new Error(`[gemini] request failed: ${err instanceof Error ? err.message : String(err)}`)
  }

  const data = (await res.json().catch(() => ({}))) as GeminiResponse
  if (!res.ok) {
    const detail = data.error?.message || res.statusText
    if (res.status === 429) throw new Error(`[gemini] quota or rate limit exceeded (HTTP 429): ${detail}`)
    throw new Error(`[gemini] HTTP ${res.status}: ${detail}`)
  }

  const candidate = data.candidates?.[0]
  if (!candidate) throw new Error(`[gemini] blocked (${data.promptFeedback?.blockReason ?? 'unknown'})`)
  const text = (candidate.content?.parts ?? [])
    .filter(p => !p.thought)
    .map(p => p.text ?? '')
    .join('')
  if (!text) throw new Error(`[gemini] empty response (finishReason ${candidate.finishReason ?? 'unknown'})`)
  return text
}

// --- Dispatch ---

const extractParamsSchema = z.object({
  instructions: z.string().min(1),
  text: z.string(),
  schema: z.record(z.unknown()),
})

const promptParamsSchema = z.object({
  prompt: z.string().min(1),
})

function parseParams<T>(schema: z.ZodType<T>, params: Record<string, unknown>): T {
  const parsed = schema.safeParse(params)
  if (!parsed.success) {
    const msg = parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join(', ')
    throw new Error(`[gemini] invalid params — ${msg}`)
  }
  return parsed.data
}

function buildRequest(func: string, params: Record<string, unknown>): { body: object; parse: (text: string) => unknown } {
  switch (func) {
    case 'extract': {
      const { instructions, text, schema } = parseParams(extractParamsSchema, params)
      return {
        body: {
          systemInstruction: { parts: [{ text: instructions }] },
          contents: [{ role: 'user', parts: [{ text }] }],
          generationConfig: { responseMimeType: 'application/json', responseJsonSchema: schema },
        },
        parse: (raw) => {
          try {
            return JSON.parse(raw) as unknown
          } catch {
            throw new Error('[gemini] response was not valid JSON')
          }
        },
      }
    }
    case 'prompt': {
      const { prompt } = parseParams(promptParamsSchema, params)
      return { body: { contents: [{ role: 'user', parts: [{ text: prompt }] }] }, parse: (raw) => raw }
    }
    default:
      throw new Error(`[gemini] Unknown function: '${func}'`)
  }
}

export async function dispatch(
  func: string,
  params: Record<string, unknown>,
  config: Record<string, string>,
  services?: DispatchServices,
): Promise<unknown> {
  // Everything that can refuse the call runs before a slot is reserved, so
  // refusals never count against the daily limit.
  const request = buildRequest(func, params)
  const { apiKey, model, dailyLimit } = resolveConfig(config, services?.pluginEnabled ?? false)
  if (!services?.stateStore) throw new Error('[gemini] state store is unavailable')

  let n: number
  try {
    n = await reserveCall(services.stateStore, dailyLimit)
  } catch (err) {
    if (err instanceof DailyLimitError) console.warn(`[gemini] refused (${func}): daily limit of ${dailyLimit} reached`)
    throw err
  }

  try {
    const result = request.parse(await callGemini(apiKey, model, request.body))
    console.log(`[gemini] call ${n}/${dailyLimit} today (${func}): ok`)
    return result
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.warn(`[gemini] call ${n}/${dailyLimit} today (${func}): failed — ${msg.replace(/^\[gemini\] /, '')}`)
    throw err
  }
}
