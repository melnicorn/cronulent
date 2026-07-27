import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { atomicWriteFile } from './atomic-write'

async function withDir(fn: (dir: string) => Promise<void>): Promise<void> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cronulent-atomic-'))
  try {
    await fn(dir)
  } finally {
    await fs.rm(dir, { recursive: true, force: true })
  }
}

test('writes content that reads back exactly', async () => {
  await withDir(async (dir) => {
    const file = path.join(dir, 'data.json5')
    await atomicWriteFile(file, '{ a: 1 }')
    assert.equal(await fs.readFile(file, 'utf8'), '{ a: 1 }')
  })
})

test('overwrites an existing file', async () => {
  await withDir(async (dir) => {
    const file = path.join(dir, 'data.json5')
    await atomicWriteFile(file, 'first')
    await atomicWriteFile(file, 'second')
    assert.equal(await fs.readFile(file, 'utf8'), 'second')
  })
})

test('creates missing parent directories', async () => {
  await withDir(async (dir) => {
    const file = path.join(dir, 'nested', 'deeper', 'data.json5')
    await atomicWriteFile(file, 'ok')
    assert.equal(await fs.readFile(file, 'utf8'), 'ok')
  })
})

test('leaves no temp files behind after a successful write', async () => {
  await withDir(async (dir) => {
    const file = path.join(dir, 'data.json5')
    await atomicWriteFile(file, 'x')
    await atomicWriteFile(file, 'y')
    const entries = await fs.readdir(dir)
    assert.deepEqual(entries, ['data.json5'])
  })
})

test('concurrent writes to the same path all resolve to one intact file', async () => {
  await withDir(async (dir) => {
    const file = path.join(dir, 'data.json5')
    const values = Array.from({ length: 20 }, (_, i) => `value-${i}`)
    await Promise.all(values.map(v => atomicWriteFile(file, v)))
    // The final content must be exactly one of the written values — never a
    // mix — and no temp files may be left over.
    const content = await fs.readFile(file, 'utf8')
    assert.ok(values.includes(content), `unexpected content: ${content}`)
    assert.deepEqual(await fs.readdir(dir), ['data.json5'])
  })
})
