import crypto from 'node:crypto'
import { promisify } from 'node:util'
import { SignJWT, jwtVerify } from 'jose'
import type { ConfigManager } from './config'

const scrypt = promisify(crypto.scrypt)

export class AuthService {
  constructor(private configManager: ConfigManager) {}

  isInitialized(): boolean {
    return this.configManager.isInitialized()
  }

  async verifyPassword(password: string): Promise<boolean> {
    const { passwordHash, passwordSalt } = this.configManager.get()
    const derived = (await scrypt(password, passwordSalt, 64)) as Buffer
    return derived.toString('hex') === passwordHash
  }

  async signToken(sub: string): Promise<{ token: string; expiresAt: string }> {
    const secret = new TextEncoder().encode(this.configManager.get().jwtSecret)
    const expiresAt = new Date(Date.now() + 86400 * 1000)
    const token = await new SignJWT({ sub })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime(expiresAt)
      .sign(secret)
    return { token, expiresAt: expiresAt.toISOString() }
  }

  async verifyToken(token: string): Promise<string | null> {
    if (!this.configManager.isInitialized()) return null
    try {
      const secret = new TextEncoder().encode(this.configManager.get().jwtSecret)
      const { payload } = await jwtVerify(token, secret)
      return (payload.sub as string) ?? null
    } catch {
      return null
    }
  }

  async initialize(password: string): Promise<void> {
    await this.configManager.initialize(password)
  }
}
