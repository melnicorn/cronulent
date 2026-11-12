import { test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { StateStore } from '../state-store'
import { dispatch, USAGE_KEY, DEFAULT_MODEL, generatePythonHelper, generateNodeHelper, generateShellHelper } from './claude'
import { USAGE_KEY as GEMINI_USAGE_KEY } from './gemini'

const API_KEY = 'sk-ant-test-secret-123'

interface RecordedRequest {
  url: string
  headers: Headers
  body: Record<string, unknown>
}

let requests: RecordedRequest[] = []
let respond: () => Response = () => okText('{}')
const realFetch = globalThis.fetch
let dir = ''
let store: StateStore

function message(content: unknown[], stopReason = 'end_turn', extra: Record<string, unknown> = {}): Response {
  return Response.json({
    id: 'msg_test',
    type: 'message',
    role: 'assistant',
    model: DEFAULT_MODEL,
    content,
    stop_reason: stopReason,
    stop_sequence: null,
    usage: { input_tokens: 1, output_tokens: 1 },
    ...extra,
  })
}

function okText(text: string): Response {
  return message([{ type: 'text', text }])
}

function apiError(status: number, type: string, msg: string): Response {
  return Response.json({ type: 'error', error: { type, message: msg } }, { status })
}

beforeEach(async () => {
  requests = []
  respond = () => okText('{}')
  globalThis.fetch = async (input, init) => {
    requests.push({
      url: String(input),
      headers: new Headers(init?.headers),
      body: JSON.parse(String(init?.body)) as Record<string, unknown>,
    })
    return respond()
  }
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cronulent-claude-'))
  store = new StateStore(dir)
})

afterEach(async () => {
  globalThis.fetch = realFetch
  await fs.rm(dir, { recursive: true, force: true })
})

const config = (overrides: Record<string, string> = {}) => ({ apiKey: API_KEY, ...overrides })
const services = (pluginEnabled = true) => ({ stateStore: store, pluginEnabled })
const SCHEMA = { type: 'object', properties: { found: { type: 'boolean' }, date: { type: 'string' } }, required: ['found'], additionalProperties: false }
const extractParams = { instructions: 'Find the reopening date.', text: 'We reopen on 2026-11-02!', schema: SCHEMA }

async function rejectsWith(p: Promise<unknown>, message: string | RegExp): Promise<Error> {
  let caught: unknown
  try {
    await p
  } catch (err) {
    caught = err
  }
  assert.ok(caught instanceof Error, 'expected a rejection')
  if (typeof message === 'string') assert.equal(caught.message, message)
  else assert.match(caught.message, message)
  return caught
}

async function usageCount(key = USAGE_KEY): Promise<number> {
  const { value } = await store.get(key)
  return (value as { count?: number } | null)?.count ?? 0
}

test('extract sends a structured-output request with the key in a header', async () => {
  respond = () => okText('{"found":true,"date":"2026-11-02"}')
  const result = await dispatch('extract', extractParams, config(), services())

  assert.deepEqual(result, { found: true, date: '2026-11-02' })
  assert.equal(requests.length, 1)
  const req = requests[0]!
  assert.equal(req.url, 'https://api.anthropic.com/v1/messages')
  assert.equal(req.headers.get('authorization'), `Bearer ${API_KEY}`)
  assert.deepEqual(req.body, {
    model: DEFAULT_MODEL,
    max_tokens: 16000,
    system: extractParams.instructions,
    messages: [{ role: 'user', content: extractParams.text }],
    output_config: { format: { type: 'json_schema', schema: SCHEMA } },
  })
})

test('model precedence: per-call, then plugin setting, then default', async () => {
  await dispatch('prompt', { prompt: 'a' }, config(), services())
  await dispatch('prompt', { prompt: 'a' }, config({ model: 'claude-haiku-5-5' }), services())
  await dispatch('prompt', { prompt: 'a', model: 'claude-sonnet-5-5' }, config({ model: 'claude-haiku-5-5' }), services())
  await dispatch('extract', { ...extractParams, model: null }, config({ model: 'claude-haiku-5-5' }), services())
  assert.deepEqual(requests.map(r => r.body['model']), [DEFAULT_MODEL, 'claude-haiku-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5'])
})

test('a blank per-call model is rejected', async () => {
  await rejectsWith(dispatch('prompt', { prompt: 'a', model: '  ' }, config(), services()), /^\[claude\] invalid params — model:/)
  assert.equal(requests.length, 0)
})

test('thinking blocks are skipped when joining response text', async () => {
  respond = () => message([{ type: 'thinking', thinking: '', signature: 'sig' }, { type: 'text', text: '{"found":false}' }])
  assert.deepEqual(await dispatch('extract', extractParams, config(), services()), { found: false })
})

test('non-JSON extract response is rejected', async () => {
  respond = () => okText('not json')
  await rejectsWith(dispatch('extract', extractParams, config(), services()), '[claude] response was not valid JSON')
})

test('Claude failures map to readable messages and never leak the key', async () => {
  const cases: [() => Response, string | RegExp][] = [
    [() => apiError(429, 'rate_limit_error', 'Slow down'), '[claude] rate limit exceeded (HTTP 429): Slow down'],
    [() => apiError(401, 'authentication_error', 'invalid x-api-key'), '[claude] HTTP 401: invalid x-api-key'],
    [() => apiError(500, 'api_error', 'Internal'), '[claude] HTTP 500: Internal'],
    [() => message([], 'refusal', { stop_details: { type: 'refusal', category: 'cyber', explanation: null } }), '[claude] refused (cyber)'],
    [() => message([{ type: 'text', text: '{"fo' }], 'max_tokens'), '[claude] response cut off at 16000 tokens'],
    [() => message([], 'end_turn'), '[claude] empty response (stop_reason end_turn)'],
  ]
  for (const [response, msg] of cases) {
    respond = response
    const err = await rejectsWith(dispatch('extract', extractParams, config(), services()), msg)
    assert.ok(!err.message.includes(API_KEY))
  }
})

test('network errors are reported as request failures without retrying', async () => {
  let calls = 0
  globalThis.fetch = async () => {
    calls++
    throw new TypeError('fetch failed')
  }
  await rejectsWith(dispatch('prompt', { prompt: 'hi' }, config(), services()), /^\[claude\] request failed: /)
  assert.equal(calls, 1)
})

test('disabled plugin, missing key, and bad params are refused without calling Claude', async () => {
  const msg = '[claude] plugin is not enabled or has no API key'
  await rejectsWith(dispatch('extract', extractParams, config(), services(false)), msg)
  await rejectsWith(dispatch('extract', extractParams, config({ apiKey: '' }), services()), msg)
  await rejectsWith(dispatch('extract', { text: 'x', schema: SCHEMA }, config(), services()), /^\[claude\] invalid params — instructions:/)
  await rejectsWith(dispatch('extract', { ...extractParams, schema: 'nope' }, config(), services()), /^\[claude\] invalid params — schema:/)
  await rejectsWith(dispatch('bogus', {}, config(), services()), "[claude] Unknown function: 'bogus'")
  assert.equal(requests.length, 0)
  assert.equal(await usageCount(), 0)
})

test('daily limit refuses further calls; failures count, refusals do not', async () => {
  const cfg = config({ dailyLimit: '2' })
  respond = () => apiError(500, 'api_error', 'boom')
  await rejectsWith(dispatch('prompt', { prompt: 'a' }, cfg, services()), /HTTP 500/)
  respond = () => okText('{"found":true}')
  await rejectsWith(dispatch('prompt', { prompt: 'a' }, config({ dailyLimit: 'lots' }), services()), '[claude] dailyLimit must be a whole number')
  await dispatch('extract', extractParams, cfg, services())
  await rejectsWith(
    dispatch('prompt', { prompt: 'c' }, cfg, services()),
    '[claude] daily limit of 2 calls reached; resets at midnight Pacific',
  )
  assert.equal(requests.length, 2)
  assert.equal(await usageCount(), 2)
})

test('Claude and Gemini keep separate daily counts', async () => {
  await dispatch('prompt', { prompt: 'a' }, config({ dailyLimit: '1' }), services())
  assert.equal(await usageCount(), 1)
  assert.equal(await usageCount(GEMINI_USAGE_KEY), 0)
})

test('prompt sends plain content and returns text', async () => {
  respond = () => okText('Hello there.')
  assert.equal(await dispatch('prompt', { prompt: 'Say hi' }, config(), services()), 'Hello there.')
  assert.deepEqual(requests[0]!.body, { model: DEFAULT_MODEL, max_tokens: 16000, messages: [{ role: 'user', content: 'Say hi' }] })
})

test('helpers expose the model argument in every language', () => {
  assert.match(generatePythonHelper(), /def extract\(instructions, text, schema, strict=False, model=None\)/)
  assert.match(generatePythonHelper(), /def prompt\(prompt, strict=False, model=None\)/)
  assert.match(generateNodeHelper(), /prompt: \(prompt, strict = false, model\) => _cronulentDispatch\('claude', 'prompt', \{ prompt, model \}/)
  assert.match(generateShellHelper(), /cronhooks_claude_prompt "<prompt>" \[strict\] \[model\]/)
})
