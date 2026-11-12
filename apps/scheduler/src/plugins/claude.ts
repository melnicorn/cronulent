import Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'
import type { PluginManifest } from '@repo/common'
import type { DispatchServices } from './index'
import { createDailyLimiter, DailyLimitError } from './daily-limit'

export const DEFAULT_MODEL = 'claude-opus-5-5'
export const DEFAULT_DAILY_LIMIT = 20
// Lives in the job-state store; job keys are 64-char hex HMACs, so this can't collide.
export const USAGE_KEY = '__claude_usage__'
export const REQUEST_TIMEOUT_MS = 60_000
const MAX_TOKENS = 16_000
// Longer than REQUEST_TIMEOUT_MS so a slow call surfaces as the server's
// timeout error rather than the client giving up first.
const HELPER_TIMEOUT_S = 90

const strictPy = { name: 'strict', type: 'bool', description: 'Raise an error instead of returning None on failure or when the daily limit is reached', optional: true, defaultValue: 'False' }
const modelPy = { name: 'model', type: 'str', description: 'Model ID for this call; overrides the plugin setting', optional: true, defaultValue: 'None' }
const strictJs = { name: 'strict', type: 'boolean', description: 'Throw instead of resolving undefined on failure or when the daily limit is reached', optional: true, defaultValue: 'false' }
const modelJs = { name: 'model', type: 'string', description: 'Model ID for this call; overrides the plugin setting', optional: true, defaultValue: 'undefined' }

export const manifest: PluginManifest = {
  id: 'claude',
  name: 'Claude',
  description: 'Ask Anthropic Claude to interpret text and return structured JSON or plain text. Calls are capped per day.',
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
        strictPy,
        modelPy,
      ],
    },
    {
      name: 'prompt',
      description: 'Send a free-text prompt. Returns the response text, or None on failure (unless strict).',
      params: [
        { name: 'prompt', type: 'str', description: 'The prompt', optional: false },
        strictPy,
        modelPy,
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
        strictJs,
        modelJs,
      ],
    },
    {
      name: 'prompt',
      description: 'Send a free-text prompt. Resolves to the response text, or undefined on failure (unless strict).',
      params: [
        { name: 'prompt', type: 'string', description: 'The prompt', optional: false },
        strictJs,
        modelJs,
      ],
    },
  ],
}

export function generatePythonHelper(): string {
  return `\
class claude:
    @staticmethod
    def extract(instructions, text, schema, strict=False, model=None):
        return _cronulent_dispatch('claude', 'extract', {'instructions': instructions, 'text': text, 'schema': schema, 'model': model}, strict, timeout=${HELPER_TIMEOUT_S})

    @staticmethod
    def prompt(prompt, strict=False, model=None):
        return _cronulent_dispatch('claude', 'prompt', {'prompt': prompt, 'model': model}, strict, timeout=${HELPER_TIMEOUT_S})
`
}

export function generateNodeHelper(): string {
  return `\
export const claude = {
  extract: (instructions, text, schema, strict = false, model) => _cronulentDispatch('claude', 'extract', { instructions, text, schema, model }, strict),
  prompt: (prompt, strict = false, model) => _cronulentDispatch('claude', 'prompt', { prompt, model }, strict),
}
`
}

// Params are JSON-encoded with python3 so arbitrary text (quotes, newlines) is
// escaped correctly; the text itself goes via stdin to avoid argv size limits.
export function generateShellHelper(): string {
  return `\
cronhooks_claude_extract() {
  # cronhooks_claude_extract "<instructions>" "<text>" '<schema-json>' [strict] [model]  -> prints result JSON
  local params
  params=$(printf '%s' "$2" | python3 -c 'import json,sys; print(json.dumps({"instructions": sys.argv[1], "text": sys.stdin.read(), "schema": json.loads(sys.argv[2]), "model": sys.argv[3] or None}))' "$1" "$3" "$5" 2>/dev/null) || {
    echo "[cronulent] claude extract: schema is not valid JSON" >&2
    return 1
  }
  _cronulent_dispatch_result "claude" "extract" "\${params}" "\${4:-false}"
}
cronhooks_claude_prompt() {
  # cronhooks_claude_prompt "<prompt>" [strict] [model]  -> prints response text
  local params
  params=$(printf '%s' "$1" | python3 -c 'import json,sys; print(json.dumps({"prompt": sys.stdin.read(), "model": sys.argv[1] or None}))' "$3")
  _cronulent_dispatch_result "claude" "prompt" "\${params}" "\${2:-false}"
}
`
}

// --- Config ---

function resolveConfig(config: Record<string, string>, pluginEnabled: boolean) {
  const apiKey = config['apiKey']?.trim() ?? ''
  if (!pluginEnabled || !apiKey) {
    throw new Error('[claude] plugin is not enabled or has no API key')
  }
  const rawLimit = config['dailyLimit']?.trim() ?? ''
  if (rawLimit && !/^\d+$/.test(rawLimit)) {
    throw new Error('[claude] dailyLimit must be a whole number')
  }
  return {
    apiKey,
    model: config['model']?.trim() || DEFAULT_MODEL,
    dailyLimit: rawLimit ? Number(rawLimit) : DEFAULT_DAILY_LIMIT,
  }
}

// --- Daily cap ---

export const reserveCall = createDailyLimiter('claude', USAGE_KEY)

// --- Claude API ---

type RequestBody = Omit<Anthropic.MessageCreateParamsNonStreaming, 'model' | 'max_tokens'>

function apiErrorDetail(err: InstanceType<typeof Anthropic.APIError>): string {
  const body = err.error as { error?: { message?: string } } | undefined
  return body?.error?.message || err.message
}

// Error messages are built only from response fields, so the API key can't
// leak into task output or logs.
async function callClaude(apiKey: string, model: string, body: RequestBody): Promise<string> {
  // No SDK retries: a retry could outlast the helper's timeout, and each
  // dispatch is counted once against the daily limit.
  const client = new Anthropic({ apiKey, maxRetries: 0, timeout: REQUEST_TIMEOUT_MS })

  let response: Anthropic.Message
  try {
    response = await client.messages.create({ model, max_tokens: MAX_TOKENS, ...body })
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) {
      throw new Error(`[claude] rate limit exceeded (HTTP 429): ${apiErrorDetail(err)}`)
    }
    if (err instanceof Anthropic.APIConnectionError) {
      throw new Error(`[claude] request failed: ${err.message}`)
    }
    if (err instanceof Anthropic.APIError) {
      throw new Error(`[claude] HTTP ${err.status}: ${apiErrorDetail(err)}`)
    }
    throw new Error(`[claude] request failed: ${err instanceof Error ? err.message : String(err)}`)
  }

  if (response.stop_reason === 'refusal') {
    throw new Error(`[claude] refused (${response.stop_details?.category ?? 'unknown'})`)
  }
  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map(b => b.text)
    .join('')
  if (response.stop_reason === 'max_tokens') {
    throw new Error(`[claude] response cut off at ${MAX_TOKENS} tokens`)
  }
  if (!text) throw new Error(`[claude] empty response (stop_reason ${response.stop_reason ?? 'unknown'})`)
  return text
}

// --- Dispatch ---

// Helpers send null when a script leaves model out.
const modelParam = z.string().trim().min(1).nullish()

const extractParamsSchema = z.object({
  instructions: z.string().min(1),
  text: z.string(),
  schema: z.record(z.unknown()),
  model: modelParam,
})

const promptParamsSchema = z.object({
  prompt: z.string().min(1),
  model: modelParam,
})

function parseParams<T>(schema: z.ZodType<T>, params: Record<string, unknown>): T {
  const parsed = schema.safeParse(params)
  if (!parsed.success) {
    const msg = parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join(', ')
    throw new Error(`[claude] invalid params — ${msg}`)
  }
  return parsed.data
}

function buildRequest(
  func: string,
  params: Record<string, unknown>,
): { body: RequestBody; model?: string | null; parse: (text: string) => unknown } {
  switch (func) {
    case 'extract': {
      const { instructions, text, schema, model } = parseParams(extractParamsSchema, params)
      return {
        model,
        body: {
          system: instructions,
          messages: [{ role: 'user', content: text }],
          output_config: { format: { type: 'json_schema', schema } },
        },
        parse: (raw) => {
          try {
            return JSON.parse(raw) as unknown
          } catch {
            throw new Error('[claude] response was not valid JSON')
          }
        },
      }
    }
    case 'prompt': {
      const { prompt, model } = parseParams(promptParamsSchema, params)
      return { model, body: { messages: [{ role: 'user', content: prompt }] }, parse: (raw) => raw }
    }
    default:
      throw new Error(`[claude] Unknown function: '${func}'`)
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
  const { apiKey, model: configModel, dailyLimit } = resolveConfig(config, services?.pluginEnabled ?? false)
  const model = request.model ?? configModel
  if (!services?.stateStore) throw new Error('[claude] state store is unavailable')

  let n: number
  try {
    n = await reserveCall(services.stateStore, dailyLimit)
  } catch (err) {
    if (err instanceof DailyLimitError) console.warn(`[claude] refused (${func}): daily limit of ${dailyLimit} reached`)
    throw err
  }

  try {
    const result = request.parse(await callClaude(apiKey, model, request.body))
    console.log(`[claude] call ${n}/${dailyLimit} today (${func}, ${model}): ok`)
    return result
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.warn(`[claude] call ${n}/${dailyLimit} today (${func}, ${model}): failed — ${msg.replace(/^\[claude\] /, '')}`)
    throw err
  }
}
