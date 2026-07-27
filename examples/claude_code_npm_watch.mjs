/**
 * Claude Code release watcher — npm.
 *
 * Alerts via Telegram when a new version of @anthropic-ai/claude-code is
 * actually published to npm.
 *
 * This is the companion to the changelog watcher, and deliberately watches a
 * different thing: the changelog says what changed, npm says when it's
 * installable. They can move independently, and the npm one is what tells you
 * `claude update` will actually get you something new.
 *
 * The registry's `/latest` endpoint returns the dist-tag'd version directly, so
 * there's no version sorting to get wrong.
 *
 * Last-seen version lives in cronhooks.state, so this re-arms itself — one alert
 * per release. The first run seeds state and stays quiet.
 *
 *   node script.mjs            # check + alert on a new version
 *   node script.mjs --print    # show what it currently sees
 *   node script.mjs --seed     # save the current version as the reference, no alert
 */

import { telegram, state } from '../shared/cronulent_hooks.mjs'

const PACKAGE = '@anthropic-ai/claude-code'
const URL = `https://registry.npmjs.org/${PACKAGE}/latest`

function log(msg) {
  const now = new Date().toISOString().replace('T', ' ').slice(0, 19)
  console.log(`[${now}] ${msg}`)
}

const printOnly = process.argv.includes('--print')
const seedOnly = process.argv.includes('--seed')

log(`Fetching ${URL} ...`)

let pkg
try {
  const res = await fetch(URL, {
    headers: { 'User-Agent': 'cronulent-claude-code-watcher' },
    signal: AbortSignal.timeout(20_000),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  pkg = await res.json()
} catch (err) {
  // A network blip must not read as "no new release" or as a change.
  log(`Fetch failed: ${err.message} — skipping this run (no alert).`)
  process.exit(1)
}

const version = pkg?.version

if (!version) {
  log('No version field in the registry response — the API shape changed.')
  if (!printOnly) {
    await telegram.sendMessage(
      '\u{1F6A7} Claude Code npm Watcher Broken',
      `The registry response had no version field. Check manually and fix the watcher:\n\n${URL}`,
    )
  }
  process.exit(1)
}

if (printOnly) {
  log(`latest=${version} published=${pkg.dist?.tarball ? 'yes' : 'unknown'}`)
  process.exit(0)
}

if (seedOnly) {
  await state.set({ version })
  log(`Seeded state at ${version} — no alert.`)
  process.exit(0)
}

const lastSeen = (await state.get({}))?.version

if (!lastSeen) {
  // First run: record where we are so the next real release is the first alert.
  await state.set({ version })
  log(`First run — seeded state at ${version}, no alert.`)
  process.exit(0)
}

if (version === lastSeen) {
  log(`No change (still ${version}).`)
  process.exit(0)
}

log(`NEW RELEASE: ${lastSeen} -> ${version} — alerting!`)
await telegram.sendMessage(
  `\u{1F4E6} ${PACKAGE} ${version} on npm`,
  `Was ${lastSeen}, now ${version} — \`claude update\` (or npm i -g ${PACKAGE}) will pick it up.\n\nhttps://www.npmjs.com/package/${PACKAGE}`,
)

// Persist only after a successful send, so a failed alert retries next run.
await state.set({ version })
log('Sent and state updated.')
