import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { Json5ExecutionRepository } from './execution-repo'

async function withRepo(fn: (repo: Json5ExecutionRepository) => Promise<void>): Promise<void> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cronulent-exec-'))
  try {
    await fn(new Json5ExecutionRepository(dir))
  } finally {
    await fs.rm(dir, { recursive: true, force: true })
  }
}

function input(taskId: string) {
  return {
    taskId,
    startedAt: new Date().toISOString(),
    finishedAt: '',
    durationMs: 0,
    exitCode: -1,
    status: 'running' as const,
    skipReason: '',
    stdout: '',
    stderr: '',
  }
}

test('concurrent creates all survive', async () => {
  await withRepo(async (repo) => {
    // Before serialization these interleaved: every caller read the same array,
    // appended one row, and the last write won — so only one row survived.
    const created = await Promise.all(
      Array.from({ length: 10 }, (_, i) => repo.create(input(`task-${i}`))),
    )

    const stored = await Promise.all(created.map(e => repo.findById(e.id)))
    assert.equal(stored.filter(Boolean).length, 10, 'every created execution should be readable')
  })
})

test('a create concurrent with another task does not orphan its row', async () => {
  await withRepo(async (repo) => {
    // The production crash: two tasks fire together, one row is lost, and that
    // task's close handler then throws "Execution <id> not found".
    const [a, b] = await Promise.all([repo.create(input('a')), repo.create(input('b'))])

    await repo.update({ id: a!.id, status: 'success', exitCode: 0 })
    await repo.update({ id: b!.id, status: 'success', exitCode: 0 })

    assert.equal((await repo.findById(a!.id))?.status, 'success')
    assert.equal((await repo.findById(b!.id))?.status, 'success')
  })
})

test('concurrent updates to different rows both persist', async () => {
  await withRepo(async (repo) => {
    const a = await repo.create(input('a'))
    const b = await repo.create(input('b'))

    await Promise.all([
      repo.update({ id: a.id, stdout: 'from a' }),
      repo.update({ id: b.id, stdout: 'from b' }),
    ])

    assert.equal((await repo.findById(a.id))?.stdout, 'from a')
    assert.equal((await repo.findById(b.id))?.stdout, 'from b')
  })
})

test('a failed update does not wedge the queue', async () => {
  await withRepo(async (repo) => {
    const created = await repo.create(input('a'))

    await assert.rejects(repo.update({ id: 'does-not-exist', stdout: 'x' }))

    // The serializer must keep running work queued behind a rejection.
    await repo.update({ id: created.id, stdout: 'still works' })
    assert.equal((await repo.findById(created.id))?.stdout, 'still works')
  })
})
