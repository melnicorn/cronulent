import fs from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'
import { promisify } from 'node:util'
import JSON5 from 'json5'

const scrypt = promisify(crypto.scrypt)

interface Config {
  passwordHash: string
  passwordSalt: string
  jwtSecret: string
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
}
