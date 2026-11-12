import type { StateStore } from '../state-store'
import { createSerializer } from '../serialize'

export interface DailyUsage {
  day: string // quota day, YYYY-MM-DD in America/Los_Angeles
  count: number
}

const pacificFormat = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles' })

/** The quota day: the calendar date in US Pacific time (Gemini's free-tier day). */
export function pacificDay(now: Date): string {
  return pacificFormat.format(now)
}

export class DailyLimitError extends Error {
  constructor(pluginId: string, limit: number) {
    super(`[${pluginId}] daily limit of ${limit} calls reached; resets at midnight Pacific`)
  }
}

function isUsage(value: unknown): value is DailyUsage {
  const v = value as DailyUsage | null
  return typeof v?.day === 'string' && typeof v?.count === 'number'
}

/**
 * Build a per-plugin call counter kept in the job-state store under `usageKey`.
 *
 * The returned function reserves one call for today, before the request is
 * sent — so failed requests still count, and concurrent callers can't
 * overshoot. It resolves to today's count including this call, and throws
 * DailyLimitError when the limit is reached.
 */
export function createDailyLimiter(pluginId: string, usageKey: string) {
  // Check-and-increment must be atomic, or two tasks could both see one call left.
  const serialize = createSerializer()

  return function reserveCall(store: StateStore, limit: number, now = new Date()): Promise<number> {
    return serialize(async () => {
      const today = pacificDay(now)
      const { value } = await store.get(usageKey)
      const used = isUsage(value) && value.day === today ? value.count : 0
      if (used >= limit) throw new DailyLimitError(pluginId, limit)
      const usage: DailyUsage = { day: today, count: used + 1 }
      await store.set(usageKey, usage, now.toISOString())
      return usage.count
    })
  }
}
