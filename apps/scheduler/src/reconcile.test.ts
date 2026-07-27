import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { Execution, IExecutionRepository } from '@repo/common'
import { reconcileOrphanedExecutions } from './reconcile'

function execution(id: string, status: Execution['status']): Execution {
  return {
    id,
    taskId: 'task-1',
    startedAt: new Date(Date.now() - 60_000).toISOString(),
    finishedAt: '',
    durationMs: 0,
    exitCode: -1,
    status,
    skipReason: '',
    stdout: '',
    stderr: '',
  }
}

/** Minimal stub — reconcile only reads findRunning() and calls update(). */
function stubRepo(executions: Execution[]): IExecutionRepository & { rows: Execution[] } {
  const rows = [...executions]
  return {
    rows,
    findRunning: async () => rows.filter(e => e.status === 'running'),
    update: async (input) => {
      const row = rows.find(e => e.id === input.id)
      if (!row) throw new Error(`no execution ${input.id}`)
      Object.assign(row, input)
      return row
    },
    findByTaskId: async () => [],
    findById: async () => null,
    create: async () => { throw new Error('not used') },
    trimByTaskId: async () => {},
  }
}

test('marks orphaned running executions as interrupted', async () => {
  const repo = stubRepo([execution('a', 'running')])

  const count = await reconcileOrphanedExecutions(repo)

  assert.equal(count, 1)
  assert.equal(repo.rows[0]!.status, 'interrupted')
  assert.notEqual(repo.rows[0]!.finishedAt, '')
  assert.ok(repo.rows[0]!.durationMs > 0)
})

test('leaves already-finished executions untouched', async () => {
  const repo = stubRepo([
    execution('a', 'success'),
    execution('b', 'failed'),
    execution('c', 'skipped'),
  ])

  const count = await reconcileOrphanedExecutions(repo)

  assert.equal(count, 0)
  assert.deepEqual(repo.rows.map(e => e.status), ['success', 'failed', 'skipped'])
})

test('is a no-op on a clean start', async () => {
  assert.equal(await reconcileOrphanedExecutions(stubRepo([])), 0)
})
