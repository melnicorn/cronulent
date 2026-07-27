import 'server-only'
import fs from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'

/**
 * API keys for the admin API. The web app is the sole authority: it mints keys,
 * stores only their hashes, and verifies them. The scheduler knows nothing
 * about them.
 *
 * A key is shown to the user exactly once, at creation. Only `sha256(key)` is
 * persisted, so a lost key can be regenerated but never recovered.
 */

const KEY_PREFIX = 'crn_'

export interface ApiKeyRecord {
  id: string
  label: string
  hash: string
  createdAt: string
}

/** What the UI is allowed to see — everything except the hash. */
export type ApiKeyInfo = Omit<ApiKeyRecord, 'hash'>

// Resolved per call rather than at module scope: a top-level read would run
// during `next build`, where the data directory does not exist yet.
function storePath(): string {
  const dir = process.env.WEB_DATA_DIR ?? path.join(process.cwd(), 'data')
  return path.join(dir, 'api-keys.json')
}

function hashKey(key: string): string {
  // Keys are 256 bits of randomness, so a plain SHA-256 is enough — unlike a
  // password, there is nothing to brute-force.
  return crypto.createHash('sha256').update(key).digest('hex')
}

async function read(): Promise<ApiKeyRecord[]> {
  try {
    return JSON.parse(await fs.readFile(storePath(), 'utf8')) as ApiKeyRecord[]
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw err
  }
}

async function write(records: ApiKeyRecord[]): Promise<void> {
  const file = storePath()
  const dir = path.dirname(file)
  await fs.mkdir(dir, { recursive: true })

  // Same temp-file-then-rename approach as the scheduler's atomic-write helper,
  // duplicated rather than shared: it would have to live in @repo/common, whose
  // barrel is imported by client components, and node:fs there breaks the
  // client bundle.
  const tmp = path.join(dir, `.api-keys.json.tmp.${process.pid}`)
  try {
    const fh = await fs.open(tmp, 'w')
    try {
      await fh.writeFile(JSON.stringify(records, null, 2), 'utf8')
      await fh.sync()
    } finally {
      await fh.close()
    }
    await fs.rename(tmp, file)
  } catch (err) {
    await fs.rm(tmp, { force: true }).catch(() => {})
    throw err
  }
}

// Read-modify-write is interleavable within a single Next.js process, so two
// concurrent creates would otherwise lose one. Every mutation queues here.
let writeQueue: Promise<unknown> = Promise.resolve()

function serialize<T>(fn: () => Promise<T>): Promise<T> {
  const result = writeQueue.then(fn, fn)
  writeQueue = result.catch(() => {})
  return result
}

function generateKey(): { key: string; hash: string } {
  const key = `${KEY_PREFIX}${crypto.randomBytes(32).toString('base64url')}`
  return { key, hash: hashKey(key) }
}

export async function listApiKeys(): Promise<ApiKeyInfo[]> {
  const records = await read()
  return records.map(({ id, label, createdAt }) => ({ id, label, createdAt }))
}

/** Mint a key. The plaintext is returned once and never stored. */
export async function createApiKey(label: string): Promise<{ id: string; key: string }> {
  return serialize(async () => {
    const records = await read()
    const { key, hash } = generateKey()
    const id = crypto.randomBytes(4).toString('hex')
    records.push({ id, label, hash, createdAt: new Date().toISOString() })
    await write(records)
    return { id, key }
  })
}

/** Replace a key's secret, keeping its id and label. Invalidates the old one. */
export async function regenerateApiKey(id: string): Promise<{ key: string } | null> {
  return serialize(async () => {
    const records = await read()
    const record = records.find(r => r.id === id)
    if (!record) return null
    const { key, hash } = generateKey()
    record.hash = hash
    record.createdAt = new Date().toISOString()
    await write(records)
    return { key }
  })
}

export async function revokeApiKey(id: string): Promise<boolean> {
  return serialize(async () => {
    const records = await read()
    const remaining = records.filter(r => r.id !== id)
    if (remaining.length === records.length) return false
    await write(remaining)
    return true
  })
}

/** Resolve a presented key to its record, or null if it matches none. */
export async function verifyApiKey(presented: string): Promise<ApiKeyInfo | null> {
  if (!presented.startsWith(KEY_PREFIX)) return null

  const presentedHash = Buffer.from(hashKey(presented), 'hex')
  for (const { id, label, createdAt, hash } of await read()) {
    const stored = Buffer.from(hash, 'hex')
    if (stored.length === presentedHash.length && crypto.timingSafeEqual(stored, presentedHash)) {
      return { id, label, createdAt }
    }
  }
  return null
}
