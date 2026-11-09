import { test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { dispatch } from './peskybird'

interface RecordedRequest {
  url: string
  headers: Record<string, string>
  body: Record<string, unknown>
}

let requests: RecordedRequest[] = []
let respond: () => Response = () => Response.json({ id: 'x' }, { status: 201 })
const realFetch = globalThis.fetch

beforeEach(() => {
  requests = []
  respond = () => Response.json({ id: 'x' }, { status: 201 })
  globalThis.fetch = async (input, init) => {
    requests.push({
      url: String(input),
      headers: init?.headers as Record<string, string>,
      body: JSON.parse(String(init?.body)) as Record<string, unknown>,
    })
    return respond()
  }
})

afterEach(() => {
  globalThis.fetch = realFetch
})

test('sends title and text to the default topic with the app token', async () => {
  await dispatch('sendMessage', { title: 'Hi', text: 'Body' }, { appToken: 'pba_abc' })
  assert.equal(requests.length, 1)
  assert.equal(requests[0]!.url, 'https://peskybird.app/api/push/messages')
  assert.equal(requests[0]!.headers['Authorization'], 'Bearer pba_abc')
  assert.deepEqual(requests[0]!.body, { topic: 'cronulent', title: 'Hi', body: 'Body' })
})

test('uses the configured topic, ignoring a leading #', async () => {
  await dispatch('sendMessage', { title: 'Hi', text: 'Body' }, { appToken: 'pba_abc', topic: '#backups' })
  assert.equal(requests[0]!.body['topic'], 'backups')
})

test('skips the send without an app token', async () => {
  await dispatch('sendMessage', { title: 'Hi', text: 'Body' }, {})
  assert.equal(requests.length, 0)
})

test('rejects on an HTTP error', async () => {
  respond = () => Response.json({ error: { code: 'forbidden' } }, { status: 403 })
  await assert.rejects(
    dispatch('sendMessage', { title: 'Hi', text: 'Body' }, { appToken: 'pba_abc' }),
    /HTTP 403/,
  )
})
