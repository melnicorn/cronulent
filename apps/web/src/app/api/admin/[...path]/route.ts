import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { verifyApiKey } from '../../../../lib/api-keys'

/**
 * Admin API — the only way in from outside.
 *
 * The scheduler is not published to the network, so every external call arrives
 * here: authenticated by an API key this app issued, then forwarded to the
 * scheduler over the internal network using the service token.
 *
 * Procedure paths map straight onto the scheduler's tRPC router, so
 * `GET /api/admin/tasks.list` reaches `tasks.list`.
 */

export const dynamic = 'force-dynamic'

const SCHEDULER_URL = process.env.SCHEDULER_URL ?? 'http://localhost:3001'

/**
 * Explicit allowlist rather than a denylist: a denylist fails open, silently
 * exposing every procedure added to the router later.
 *
 * Deliberately excluded: all of `auth.*` (an API key must not change the admin
 * password or mint sessions), all of `plugins.*` (which would let a caller
 * rewrite plugin credentials), and `system.initialize` / `system.updateSettings`.
 */
const ALLOWED_PROCEDURES = new Set([
  'tasks.list',
  'tasks.get',
  'tasks.getState',
  'tasks.create',
  'tasks.update',
  'tasks.delete',
  'tasks.trigger',
  'tasks.pause',
  'tasks.resume',
  'tasks.clearState',
  'executions.list',
  'executions.get',
  'executions.resetStuck',
  'executions.clearByTaskId',
  'system.getSettings',
])

// Next.js URL-decodes catch-all segments, so the joined path is validated
// before it reaches a URL — otherwise `%2e%2e%2f` smuggles in traversal.
const PROCEDURE_PATH = /^[A-Za-z0-9_.]+(,[A-Za-z0-9_.]+)*$/

function json(body: unknown, status: number): NextResponse {
  return NextResponse.json(body, { status })
}

async function handle(request: NextRequest, path: string[], method: 'GET' | 'POST'): Promise<Response> {
  const serviceToken = process.env.CRONULENT_SERVICE_TOKEN
  if (!serviceToken) {
    return json({ error: 'Admin API unavailable: CRONULENT_SERVICE_TOKEN is not configured.' }, 503)
  }

  const authHeader = request.headers.get('authorization')
  const presented = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : ''
  if (!presented || !(await verifyApiKey(presented))) {
    return json({ error: 'Invalid or missing API key.' }, 401)
  }

  const procedurePath = path.join('/')
  if (!PROCEDURE_PATH.test(procedurePath)) {
    return json({ error: 'Malformed procedure path.' }, 400)
  }

  const search = request.nextUrl.searchParams
  // tRPC batching packs several procedures into one comma-separated segment, so
  // a prefix check on the whole path would let a disallowed one ride along.
  // Rejecting batches keeps the allowlist check honest and one-to-one.
  if (search.has('batch')) {
    return json({ error: 'Batched requests are not supported by the admin API.' }, 400)
  }

  const denied = procedurePath.split(',').filter(p => !ALLOWED_PROCEDURES.has(p))
  if (denied.length > 0) {
    return json({ error: `Not permitted for API keys: ${denied.join(', ')}` }, 403)
  }

  // Build the upstream request explicitly. Forwarding the caller's headers would
  // send their API key onward, and a `trpc-accept: application/jsonl` header
  // would make the scheduler reject a non-batched call.
  const headers: Record<string, string> = { Authorization: `Bearer ${serviceToken}` }
  let body: string | undefined
  if (method === 'POST') {
    headers['Content-Type'] = 'application/json'
    // Read as text: passing a stream to fetch requires `duplex: 'half'`, and
    // these bodies are tiny. tRPC parses the body as JSON, so it must be at
    // least `{}` for a mutation.
    body = (await request.text()) || '{}'
  }

  const queryString = search.toString()
  const upstreamUrl = `${SCHEDULER_URL}/${procedurePath}${queryString ? `?${queryString}` : ''}`

  let upstream: Response
  try {
    upstream = await fetch(upstreamUrl, { method, headers, body })
  } catch (err) {
    console.error('[admin-api] scheduler unreachable:', err)
    return json({ error: 'Scheduler unreachable.' }, 502)
  }

  // Fresh response rather than a passthrough of the upstream one, so no
  // content-encoding/content-length headers are copied across.
  return new Response(await upstream.text(), {
    status: upstream.status,
    headers: { 'Content-Type': 'application/json' },
  })
}

export async function GET(request: NextRequest, ctx: { params: Promise<{ path: string[] }> }): Promise<Response> {
  return handle(request, (await ctx.params).path, 'GET')
}

export async function POST(request: NextRequest, ctx: { params: Promise<{ path: string[] }> }): Promise<Response> {
  return handle(request, (await ctx.params).path, 'POST')
}
