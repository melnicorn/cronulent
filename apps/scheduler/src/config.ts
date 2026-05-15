import fs from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'
import { promisify } from 'node:util'
import JSON5 from 'json5'

const scrypt = promisify(crypto.scrypt)

interface PluginConfigEntry {
  enabled: boolean
  config: Record<string, string>
}

interface Config {
  passwordHash: string
  passwordSalt: string
  jwtSecret: string
  timezone?: string
  plugins?: Record<string, PluginConfigEntry>
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

  async updateSettings(settings: { timezone: string }): Promise<void> {
    const current = this.get()
    const updated: Config = { ...current, ...settings }
    await fs.writeFile(this.filePath, JSON5.stringify(updated, null, 2))
    this.config = updated
    console.log('[config] settings updated')
  }

  async initialize(password: string): Promise<void> {
    const salt = crypto.randomBytes(16).toString('hex')
    const hash = ((await scrypt(password, salt, 64)) as Buffer).toString('hex')
    const jwtSecret = crypto.randomBytes(32).toString('hex')
    const config: Config = { passwordHash: hash, passwordSalt: salt, jwtSecret }
    await fs.mkdir(path.dirname(this.filePath), { recursive: true })
    await fs.writeFile(this.filePath, JSON5.stringify(config, null, 2))
    this.config = config
    console.log('[config] initialized and saved to', this.filePath)
  }

  getPluginState(pluginId: string): PluginConfigEntry {
    return this.config?.plugins?.[pluginId] ?? { enabled: false, config: {} }
  }

  async setPluginEnabled(pluginId: string, enabled: boolean): Promise<void> {
    const current = this.get()
    const plugins = { ...current.plugins }
    plugins[pluginId] = { ...this.getPluginState(pluginId), enabled }
    const updated: Config = { ...current, plugins }
    await fs.writeFile(this.filePath, JSON5.stringify(updated, null, 2))
    this.config = updated
    console.log(`[config] plugin ${pluginId} ${enabled ? 'enabled' : 'disabled'}`)
  }

  async updatePluginConfig(pluginId: string, config: Record<string, string>): Promise<void> {
    const current = this.get()
    const plugins = { ...current.plugins }
    const existing = this.getPluginState(pluginId)
    plugins[pluginId] = { ...existing, config: { ...existing.config, ...config } }
    const updated: Config = { ...current, plugins }
    await fs.writeFile(this.filePath, JSON5.stringify(updated, null, 2))
    this.config = updated
    console.log(`[config] plugin ${pluginId} config updated`)
  }
}
