import 'server-only'
import { createTRPCClient, httpBatchLink } from '@trpc/client'
import type { AppRouter } from '@repo/common'
import { getSessionToken } from './session'

const SCHEDULER_URL = process.env.SCHEDULER_URL ?? 'http://localhost:3001'

export async function getTrpcClient() {
  const token = await getSessionToken()
  return createTRPCClient<AppRouter>({
    links: [
      httpBatchLink({
        url: SCHEDULER_URL,
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      }),
    ],
  })
}
