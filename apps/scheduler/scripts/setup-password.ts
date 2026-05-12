import { hashPassword } from '../src/auth'

const password = process.argv[2]
if (!password) {
  console.error('Usage: node scripts/setup-password.ts <password>')
  process.exit(1)
}

const { hash, salt } = await hashPassword(password)
console.log('\nAdd these to your .env file:\n')
console.log(`PASSWORD_HASH=${hash}`)
console.log(`PASSWORD_SALT=${salt}`)
console.log(`JWT_SECRET=${crypto.randomUUID().replace(/-/g, '')}${crypto.randomUUID().replace(/-/g, '')}`)
