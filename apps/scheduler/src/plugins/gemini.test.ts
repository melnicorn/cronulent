import { test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { StateStore } from '../state-store'
import { dispatch, reserveCall, pacificDay, USAGE_KEY } from './gemini'

const API_KEY = 'test-secret-key-123'

interface RecordedRequest {
  url: string
  headers: Record<string, string>
  body: Record<string, unknown>
}

let requests: RecordedRequest[] = []
let respond: () => Response = () => okText('{}')
const realFetch = globalThis.fetch
let dir = ''
let store: StateStore

function okText(text: string): Response {
  return Response.json({ candidates: [{ content: { parts: [{ text }] }, finishReason: 'STOP' }] })
}

beforeEach(async () => {
  requests = []
  respond = () => okText('{}')
  globalThis.fetch = async (input, init) => {
    requests.push({
      url: String(input),
      headers: init?.headers as Record<string, string>,
      body: JSON.parse(String(init?.body)) as Record<string, unknown>,
    })
    return respond()
  }
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cronulent-gemini-'))
  store = new StateStore(dir)
})

afterEach(async () => {
  globalThis.fetch = realFetch
  await fs.rm(dir, { recursive: true, force: true })
})

const config = (overrides: Record<string, string> = {}) => ({ apiKey: API_KEY, ...overrides })
const services = (pluginEnabled = true) => ({ stateStore: store, pluginEnabled })
const SCHEMA = { type: 'object', properties: { found: { type: 'boolean' }, date: { type: 'string' } }, required: ['found'] }
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

async function usageCount(): Promise<number> {
  const { value } = await store.get(USAGE_KEY)
  return (value as { count?: number } | null)?.count ?? 0
}

// --- US1: extract ---

test('extract sends schema-constrained request with key in header', async () => {
  respond = () => okText('{"found":true,"date":"2026-11-02"}')
  const result = await dispatch('extract', extractParams, config(), services())

  assert.deepEqual(result, { found: true, date: '2026-11-02' })
  assert.equal(requests.length, 1)
  const req = requests[0]!
  assert.equal(req.url, 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent')
  assert.ok(!req.url.includes('key='))
  assert.equal(req.headers['x-goog-api-key'], API_KEY)
  assert.deepEqual(req.body, {
    systemInstruction: { parts: [{ text: extractParams.instructions }] },
    contents: [{ role: 'user', parts: [{ text: extractParams.text }] }],
    generationConfig: { responseMimeType: 'application/json', responseJsonSchema: SCHEMA },
  })
})

test('custom model is used in the request path', async () => {
  await dispatch('extract', extractParams, config({ model: 'gemini-9-custom' }), services())
  assert.match(requests[0]!.url, /\/models\/gemini-9-custom:generateContent$/)
})

test('thought parts are skipped when joining response text', async () => {
  respond = () => Response.json({
    candidates: [{ content: { parts: [{ text: 'thinking...', thought: true }, { text: '{"found":false}' }] } }],
  })
  assert.deepEqual(await dispatch('extract', extractParams, config(), services()), { found: false })
})

test('non-JSON extract response is rejected', async () => {
  respond = () => okText('not json')
  await rejectsWith(dispatch('extract', extractParams, config(), services()), '[gemini] response was not valid JSON')
})

test('Gemini failures map to contract messages and never leak the key', async () => {
  const cases: [() => Response, string | RegExp][] = [
    [() => Response.json({ error: { message: 'Quota exceeded' } }, { status: 429 }), '[gemini] quota or rate limit exceeded (HTTP 429): Quota exceeded'],
    [() => Response.json({ error: { message: 'Internal' } }, { status: 500 }), '[gemini] HTTP 500: Internal'],
    [() => Response.json({ promptFeedback: { blockReason: 'SAFETY' } }), '[gemini] blocked (SAFETY)'],
    [() => Response.json({ candidates: [{ content: { parts: [] }, finishReason: 'MAX_TOKENS' }] }), '[gemini] empty response (finishReason MAX_TOKENS)'],
  ]
  for (const [response, message] of cases) {
    respond = response
    const err = await rejectsWith(dispatch('extract', extractParams, config(), services()), message)
    assert.ok(!err.message.includes(API_KEY))
  }
})

test('network errors are reported as request failures', async () => {
  globalThis.fetch = async () => { throw new TypeError('fetch failed') }
  await rejectsWith(dispatch('prompt', { prompt: 'hi' }, config(), services()), '[gemini] request failed: fetch failed')
})

test('disabled plugin, missing key, and bad params are refused without calling Gemini', async () => {
  const msg = '[gemini] plugin is not enabled or has no API key'
  await rejectsWith(dispatch('extract', extractParams, config(), services(false)), msg)
  await rejectsWith(dispatch('extract', extractParams, config({ apiKey: '' }), services()), msg)
  await rejectsWith(dispatch('extract', { text: 'x', schema: SCHEMA }, config(), services()), /^\[gemini\] invalid params — instructions:/)
  await rejectsWith(dispatch('extract', { ...extractParams, schema: 'nope' }, config(), services()), /^\[gemini\] invalid params — schema:/)
  await rejectsWith(dispatch('bogus', {}, config(), services()), "[gemini] Unknown function: 'bogus'")
  assert.equal(requests.length, 0)
  assert.equal(await usageCount(), 0)
})

// --- US2: daily cap ---

test('daily limit refuses further calls without contacting Gemini', async () => {
  const cfg = config({ dailyLimit: '2' })
  await dispatch('prompt', { prompt: 'a' }, cfg, services())
  await dispatch('prompt', { prompt: 'b' }, cfg, services())
  await rejectsWith(
    dispatch('prompt', { prompt: 'c' }, cfg, services()),
    '[gemini] daily limit of 2 calls reached; resets at midnight Pacific',
  )
  assert.equal(requests.length, 2)
  assert.equal(await usageCount(), 2)
})

test('failed requests still count; refusals do not', async () => {
  respond = () => Response.json({ error: { message: 'boom' } }, { status: 500 })
  await rejectsWith(dispatch('prompt', { prompt: 'a' }, config(), services()), /HTTP 500/)
  assert.equal(await usageCount(), 1)

  await rejectsWith(dispatch('prompt', { prompt: 'a' }, config(), services(false)), /not enabled/)
  await rejectsWith(dispatch('prompt', { prompt: 'a' }, config({ dailyLimit: 'lots' }), services()), '[gemini] dailyLimit must be a whole number')
  await rejectsWith(dispatch('prompt', { prompt: '' }, config(), services()), /invalid params/)
  await rejectsWith(dispatch('prompt', { prompt: 'a' }, config({ dailyLimit: '1' }), services()), /daily limit of 1/)
  assert.equal(await usageCount(), 1)
})

test('concurrent reservations never exceed the limit', async () => {
  const results = await Promise.allSettled(Array.from({ length: 5 }, () => reserveCall(store, 3)))
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 3)
  assert.equal(await usageCount(), 3)
})

test('count survives a restart (new store on the same data dir)', async () => {
  await reserveCall(store, 1)
  await rejectsWith(reserveCall(new StateStore(dir), 1), /daily limit of 1/)
})

test('Pacific day follows wall-clock midnight across DST', () => {
  assert.equal(pacificDay(new Date('2026-03-08T07:59:00Z')), '2026-03-07')
  assert.equal(pacificDay(new Date('2026-03-08T08:01:00Z')), '2026-03-08')
  assert.equal(pacificDay(new Date('2026-03-09T06:59:00Z')), '2026-03-08')
  assert.equal(pacificDay(new Date('2026-03-09T07:01:00Z')), '2026-03-09')
})

test('a new Pacific day resets the count', async () => {
  await reserveCall(store, 1, new Date('2026-03-09T06:59:00Z'))
  await rejectsWith(reserveCall(store, 1, new Date('2026-03-09T06:59:30Z')), /daily limit/)
  assert.equal(await reserveCall(store, 1, new Date('2026-03-09T07:01:00Z')), 1)
})

test('limit of 0 refuses everything; blank limit allows 20', async () => {
  await rejectsWith(dispatch('prompt', { prompt: 'a' }, config({ dailyLimit: '0' }), services()), /daily limit of 0/)
  for (let i = 0; i < 20; i++) await dispatch('prompt', { prompt: 'a' }, config(), services())
  await rejectsWith(dispatch('prompt', { prompt: 'a' }, config(), services()), /daily limit of 20/)
  assert.equal(requests.length, 20)
})

// --- US4: prompt ---

test('prompt sends plain content and returns text', async () => {
  respond = () => okText('Hello there.')
  assert.equal(await dispatch('prompt', { prompt: 'Say hi' }, config(), services()), 'Hello there.')
  assert.deepEqual(requests[0]!.body, { contents: [{ role: 'user', parts: [{ text: 'Say hi' }] }] })
})

test('prompt and extract share one daily count', async () => {
  const cfg = config({ dailyLimit: '2' })
  await dispatch('prompt', { prompt: 'a' }, cfg, services())
  await dispatch('extract', extractParams, cfg, services())
  await rejectsWith(dispatch('prompt', { prompt: 'a' }, cfg, services()), /daily limit of 2/)
})
