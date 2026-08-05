import fs from 'node:fs/promises'
import path from 'node:path'
import JSON5 from 'json5'
import { atomicWriteFile } from './atomic-write'
import { createSerializer } from './serialize'

// Maximum size of a single job's saved state, measured on the UTF-8-encoded JSON.
export const STATE_SIZE_LIMIT_BYTES = 1_048_576 // 1 MiB

export class StateTooLargeError extends Error {
  constructor(size: number) {
    super(`[state] saved state is ${size} bytes, which exceeds the limit of ${STATE_SIZE_LIMIT_BYTES} bytes (1 MiB)`)
    this.name = 'StateTooLargeError'
  }
}

export class StateNotSerializableError extends Error {
  constructor(detail: string) {
    super(`[state] value is not JSON-serializable: ${detail}`)
    this.name = 'StateNotSerializableError'
  }
}

interface StateRecord {
  value: unknown
  size: number
  updatedAt: string
}

export interface StateLookup {
  found: boolean
  value: unknown
  size: number
  updatedAt: string
}

/**
 * Per-job custom JSON state, persisted to `data/state.json5` using the same
 * JSON5-on-disk mechanism as the rest of the platform (tasks, executions,
 * config). Entries are keyed by an unguessable per-job key (an HMAC of the job
 * id with the server's secret — see ConfigManager.getStateKey), never by the
 * plain enumerable job id, so one job cannot read another's state by guessing.
 * This is best-effort isolation, not a hard security boundary.
 */
export class StateStore {
  private filePath: string
  // Two jobs running in the same minute both write here via cronhooks.state,
  // and an interleaved read-modify-write would drop one job's state entirely.
  private serialize = createSerializer()

  constructor(dataDir: string) {
    this.filePath = path.join(dataDir, 'state.json5')
  }

  private async read(): Promise<Record<string, StateRecord>> {
    try {
      const raw = await fs.readFile(this.filePath, 'utf8')
      return JSON5.parse(raw) as Record<string, StateRecord>
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return {}
      // Corrupt store file: treat as empty so reads never throw. A subsequent
      // write will start the store fresh.
      console.warn(`[state] could not parse ${this.filePath}, treating as empty:`, err)
      return {}
    }
  }

  private async write(store: Record<string, StateRecord>): Promise<void> {
    await atomicWriteFile(this.filePath, JSON5.stringify(store, null, 2))
  }

  /** Load a job's state. Never throws; returns found=false when nothing is stored. */
  async get(key: string): Promise<StateLookup> {
    const store = await this.read()
    const record = store[key]
    if (!record) return { found: false, value: null, size: 0, updatedAt: '' }
    return { found: true, value: record.value, size: record.size, updatedAt: record.updatedAt }
  }

  /** Replace a job's entire state blob. Validates JSON-serializability and size first. */
  async set(key: string, value: unknown, nowIso: string): Promise<void> {
    let json: string | undefined
    try {
      json = JSON.stringify(value)
    } catch (err) {
      throw new StateNotSerializableError(err instanceof Error ? err.message : String(err))
    }
    if (json === undefined) {
      throw new StateNotSerializableError(`top-level value of type '${typeof value}' has no JSON representation`)
    }

    const size = Buffer.byteLength(json, 'utf8')
    if (size > STATE_SIZE_LIMIT_BYTES) {
      throw new StateTooLargeError(size)
    }

    return this.serialize(async () => {
      const store = await this.read()
      store[key] = { value, size, updatedAt: nowIso }
      await this.write(store)
    })
  }

  /** Delete a job's saved state. */
  async clear(key: string): Promise<void> {
    return this.serialize(async () => {
      const store = await this.read()
      if (key in store) {
        delete store[key]
        await this.write(store)
      }
    })
  }
}
