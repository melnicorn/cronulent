import crypto from 'node:crypto'
import { promisify } from 'node:util'
import { SignJWT, jwtVerify } from 'jose'

const scrypt = promisify(crypto.scrypt)

export class AuthService {
  private secret: Uint8Array
  private passwordHash: string
  private passwordSalt: string
  private expiresInSeconds: number

  constructor(opts: { jwtSecret: string; passwordHash: string; passwordSalt: string; expiresInSeconds?: number }) {
    this.secret = new TextEncoder().encode(opts.jwtSecret)
    this.passwordHash = opts.passwordHash
    this.passwordSalt = opts.passwordSalt
    this.expiresInSeconds = opts.expiresInSeconds ?? 86400
  }

  async verifyPassword(password: string): Promise<boolean> {
    const derived = (await scrypt(password, this.passwordSalt, 64)) as Buffer
    return derived.toString('hex') === this.passwordHash
  }

  async signToken(sub: string): Promise<{ token: string; expiresAt: string }> {
    const expiresAt = new Date(Date.now() + this.expiresInSeconds * 1000)
    const token = await new SignJWT({ sub })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime(expiresAt)
      .sign(this.secret)
    return { token, expiresAt: expiresAt.toISOString() }
  }

  async verifyToken(token: string): Promise<string | null> {
    try {
      const { payload } = await jwtVerify(token, this.secret)
      return (payload.sub as string) ?? null
    } catch {
      return null
    }
  }
}

export async function hashPassword(password: string): Promise<{ hash: string; salt: string }> {
  const salt = crypto.randomBytes(16).toString('hex')
  const derived = (await scrypt(password, salt, 64)) as Buffer
  return { hash: derived.toString('hex'), salt }
}
