/**
 * Command-line administration for Cronulent.
 *
 * Currently manages API keys, which authenticate non-browser clients (curl,
 * scripts) against the same tRPC API the web UI uses. Keys are stored hashed in
 * config.json5 and are picked up by a running scheduler without a restart.
 *
 *   pnpm --filter scheduler keys list
 *   pnpm --filter scheduler keys create "laptop"
 *   pnpm --filter scheduler keys revoke <id>
 */
import path from 'node:path'
import { ConfigManager } from './config'

const DATA_DIR = process.env.DATA_DIR ?? path.join(process.cwd(), 'data')

const USAGE = `Usage:
  keys list                 List API keys (metadata only)
  keys create <label>       Mint a new API key and print it once
  keys revoke <id>          Revoke an API key by id`

async function main(): Promise<void> {
  const [command, ...rest] = process.argv.slice(2)

  const configManager = new ConfigManager(DATA_DIR)
  await configManager.load()
  if (!configManager.isInitialized()) {
    console.error(`No config found in ${DATA_DIR}. Complete setup in the web UI first.`)
    process.exit(1)
  }

  switch (command) {
    case 'list': {
      const keys = configManager.listApiKeys()
      if (keys.length === 0) {
        console.log('No API keys. Create one with: keys create <label>')
        return
      }
      for (const k of keys) {
        console.log(`${k.id}  ${k.createdAt}  ${k.label}`)
      }
      return
    }

    case 'create': {
      const label = rest.join(' ').trim()
      if (!label) {
        console.error('A label is required: keys create <label>')
        process.exit(1)
      }
      const { id, key } = await configManager.addApiKey(label)
      console.log(`Created API key ${id} (${label}).`)
      console.log('This is shown once and cannot be recovered — save it now:\n')
      console.log(`  ${key}\n`)
      return
    }

    case 'revoke': {
      const id = rest[0]
      if (!id) {
        console.error('An id is required: keys revoke <id>')
        process.exit(1)
      }
      const revoked = await configManager.revokeApiKey(id)
      if (!revoked) {
        console.error(`No API key with id '${id}'.`)
        process.exit(1)
      }
      console.log(`Revoked API key ${id}.`)
      return
    }

    default:
      console.error(USAGE)
      process.exit(1)
  }
}

await main()
