import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { StateStore, StateTooLargeError, StateNotSerializableError, STATE_SIZE_LIMIT_BYTES } from './state-store'

async function withStore(fn: (store: StateStore) => Promise<void>): Promise<void> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cronulent-state-'))
  try {
    await fn(new StateStore(dir))
  } finally {
    await fs.rm(dir, { recursive: true, force: true })
  }
}

const NOW = '2026-06-29T00:00:00.000Z'
const KEY_A = 'a'.repeat(64)
const KEY_B = 'b'.repeat(64)

test('set then get round-trips the value', async () => {
  await withStore(async (store) => {
    const value = { last_hash: 'f381be3a1acb', count: 3, items: ['x', 'y'] }
    await store.set(KEY_A, value, NOW)
    const result = await store.get(KEY_A)
    assert.equal(result.found, true)
    assert.deepEqual(result.value, value)
    assert.equal(result.updatedAt, NOW)
    assert.ok(result.size > 0)
  })
})

test('get returns found=false when nothing is stored', async () => {
  await withStore(async (store) => {
    const result = await store.get(KEY_A)
    assert.equal(result.found, false)
    assert.equal(result.value, null)
  })
})

test('a blob just under the limit succeeds, just over raises StateTooLargeError', async () => {
  await withStore(async (store) => {
    // JSON of {"s":"<n chars>"} adds 8 bytes of overhead around the string.
    const overhead = JSON.stringify({ s: '' }).length // {"s":""} => 8
    const underStr = 'x'.repeat(STATE_SIZE_LIMIT_BYTES - overhead)
    await store.set(KEY_A, { s: underStr }, NOW)
    assert.equal((await store.get(KEY_A)).found, true)

    const overStr = 'x'.repeat(STATE_SIZE_LIMIT_BYTES - overhead + 1)
    await assert.rejects(() => store.set(KEY_B, { s: overStr }, NOW), (err: Error) => {
      assert.ok(err instanceof StateTooLargeError)
      assert.match(err.message, /\d+ bytes/)
      assert.match(err.message, new RegExp(String(STATE_SIZE_LIMIT_BYTES)))
      return true
    })
  })
})

test('a non-serializable value raises a clear error', async () => {
  await withStore(async (store) => {
    const circular: Record<string, unknown> = {}
    circular['self'] = circular
    await assert.rejects(() => store.set(KEY_A, circular, NOW), (err: Error) => {
      assert.ok(err instanceof StateNotSerializableError)
      return true
    })

    await assert.rejects(() => store.set(KEY_A, BigInt(1), NOW), (err: Error) => {
      assert.ok(err instanceof StateNotSerializableError)
      return true
    })
  })
})

test('clear removes state so a subsequent get returns not-found', async () => {
  await withStore(async (store) => {
    await store.set(KEY_A, { a: 1 }, NOW)
    assert.equal((await store.get(KEY_A)).found, true)
    await store.clear(KEY_A)
    assert.equal((await store.get(KEY_A)).found, false)
  })
})

test('different job keys resolve to different storage (isolation)', async () => {
  await withStore(async (store) => {
    await store.set(KEY_A, { who: 'a' }, NOW)
    await store.set(KEY_B, { who: 'b' }, NOW)
    assert.deepEqual((await store.get(KEY_A)).value, { who: 'a' })
    assert.deepEqual((await store.get(KEY_B)).value, { who: 'b' })
    // Clearing one does not affect the other.
    await store.clear(KEY_A)
    assert.equal((await store.get(KEY_A)).found, false)
    assert.deepEqual((await store.get(KEY_B)).value, { who: 'b' })
  })
})

test('a top-level JSON value (not just dicts) is allowed', async () => {
  await withStore(async (store) => {
    await store.set(KEY_A, ['a', 'b', 'c'], NOW)
    assert.deepEqual((await store.get(KEY_A)).value, ['a', 'b', 'c'])
  })
})
