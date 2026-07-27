import fs from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'
import { promisify } from 'node:util'
import JSON5 from 'json5'
import { atomicWriteFile } from './atomic-write'

const scrypt = promisify(crypto.scrypt)

interface PluginConfigEntry {
  enabled: boolean
  config: Record<string, string>
}

export interface ApiKeyEntry {
  id: string
  label: string
  hash: string
  createdAt: string
}

interface Config {
  passwordHash: string
  passwordSalt: string
  jwtSecret: string
  timezone?: string
  maxHistoryItems?: number
  plugins?: Record<string, PluginConfigEntry>
  apiKeys?: ApiKeyEntry[]
}

// Prefix on every issued key, so the HTTP layer can tell an API key from a JWT
// without a disk read.
export const API_KEY_PREFIX = 'crn_'

// Keys are 256 bits of randomness, so a plain SHA-256 is enough here — unlike a
// password, there is nothing to brute-force.
function hashApiKey(key: string): string {
  return crypto.createHash('sha256').update(key).digest('hex')
}

export class ConfigManager {
  private filePath: string
  private config: Config | null = null

  constructor(dataDir: string) {
    this.filePath = path.join(dataDir, 'config.json5')
  }

  async load(): Promise<void> {
    try {
      const raw = await fs.readFile(this.filePath, 'utf8')
      this.config = JSON5.parse(raw) as Config
      console.log('[config] loaded from', this.filePath)
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        this.config = null
        console.log('[config] not found — system needs initialization')
      } else {
        throw err
      }
    }
  }

  isInitialized(): boolean {
    return this.config !== null
  }

  get(): Config {
    if (!this.config) throw new Error('System not initialized')
    return this.config
  }

  getTimezone(): string {
    return this.config?.timezone ?? ''
  }

  getMaxHistoryItems(): number {
    return this.config?.maxHistoryItems ?? 10
  }

  async updateSettings(settings: { timezone: string; maxHistoryItems?: number }): Promise<void> {
    const current = this.get()
    const updated: Config = { ...current, ...settings }
    await atomicWriteFile(this.filePath, JSON5.stringify(updated, null, 2))
    this.config = updated
    console.log('[config] settings updated')
  }

  async initialize(password: string): Promise<void> {
    const salt = crypto.randomBytes(16).toString('hex')
    const hash = ((await scrypt(password, salt, 64)) as Buffer).toString('hex')
    const jwtSecret = crypto.randomBytes(32).toString('hex')
    const config: Config = { passwordHash: hash, passwordSalt: salt, jwtSecret }
    await atomicWriteFile(this.filePath, JSON5.stringify(config, null, 2))
    this.config = config
    console.log('[config] initialized and saved to', this.filePath)
  }

  // Per-job state key for the state hook. An HMAC of the job id keyed on the
  // server's JWT secret, so it is stable per job but not guessable from the id
  // alone. Best-effort isolation only — see StateStore.
  getStateKey(taskId: string): string {
    if (!this.config) return ''
    return crypto.createHmac('sha256', this.config.jwtSecret).update(`task-state:${taskId}`).digest('hex')
  }

  getPluginState(pluginId: string): PluginConfigEntry {
    return this.config?.plugins?.[pluginId] ?? { enabled: false, config: {} }
  }

  async setPluginEnabled(pluginId: string, enabled: boolean): Promise<void> {
    const current = this.get()
    const plugins = { ...current.plugins }
    plugins[pluginId] = { ...this.getPluginState(pluginId), enabled }
    const updated: Config = { ...current, plugins }
    await atomicWriteFile(this.filePath, JSON5.stringify(updated, null, 2))
    this.config = updated
    console.log(`[config] plugin ${pluginId} ${enabled ? 'enabled' : 'disabled'}`)
  }

  async updatePluginConfig(pluginId: string, config: Record<string, string>): Promise<void> {
    const current = this.get()
    const plugins = { ...current.plugins }
    const existing = this.getPluginState(pluginId)
    plugins[pluginId] = { ...existing, config: { ...existing.config, ...config } }
    const updated: Config = { ...current, plugins }
    await atomicWriteFile(this.filePath, JSON5.stringify(updated, null, 2))
    this.config = updated
    console.log(`[config] plugin ${pluginId} config updated`)
  }

  /** Mint a new API key. The plaintext is returned once and never stored. */
  async addApiKey(label: string): Promise<{ id: string; key: string }> {
    const current = this.get()
    const key = `${API_KEY_PREFIX}${crypto.randomBytes(32).toString('base64url')}`
    const id = crypto.randomBytes(4).toString('hex')
    const entry: ApiKeyEntry = { id, label, hash: hashApiKey(key), createdAt: new Date().toISOString() }
    const updated: Config = { ...current, apiKeys: [...(current.apiKeys ?? []), entry] }
    await atomicWriteFile(this.filePath, JSON5.stringify(updated, null, 2))
    this.config = updated
    return { id, key }
  }

  listApiKeys(): Omit<ApiKeyEntry, 'hash'>[] {
    return (this.config?.apiKeys ?? []).map(({ id, label, createdAt }) => ({ id, label, createdAt }))
  }

  async revokeApiKey(id: string): Promise<boolean> {
    const current = this.get()
    const remaining = (current.apiKeys ?? []).filter(k => k.id !== id)
    if (remaining.length === (current.apiKeys ?? []).length) return false
    const updated: Config = { ...current, apiKeys: remaining }
    await atomicWriteFile(this.filePath, JSON5.stringify(updated, null, 2))
    this.config = updated
    return true
  }

  /**
   * Resolve a presented API key to its id, or null if it matches none.
   *
   * Reads config from disk rather than trusting the in-memory copy: keys are
   * minted by the CLI in a separate process, so a key created a moment ago
   * would otherwise not be usable until the scheduler restarted.
   */
  async verifyApiKey(presented: string): Promise<string | null> {
    let config: Config
    try {
      config = JSON5.parse(await fs.readFile(this.filePath, 'utf8')) as Config
    } catch {
      return null
    }

    const presentedHash = Buffer.from(hashApiKey(presented), 'hex')
    for (const entry of config.apiKeys ?? []) {
      const stored = Buffer.from(entry.hash, 'hex')
      if (stored.length === presentedHash.length && crypto.timingSafeEqual(stored, presentedHash)) {
        return entry.id
      }
    }
    return null
  }
}
