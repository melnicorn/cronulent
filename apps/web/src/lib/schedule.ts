import { CronExpressionParser } from 'cron-parser'

/**
 * Turns cron expressions into something drawable: where each task lands on a
 * 24-hour axis, and which tasks start on the very same minute.
 *
 * Collisions matter beyond tidiness — two tasks starting together each spawn a
 * runtime and compete for a small host's memory, so it's worth being able to
 * see them.
 */

const MINUTES_PER_DAY = 1440
const DAY_MS = 24 * 60 * 60 * 1000

// How far ahead to look for collisions. A day is enough for daily schedules but
// would miss monthly ones, which are exactly the overlaps nobody notices.
const COLLISION_HORIZON_DAYS = 31

// A `* * * * *` schedule fires 1440 times a day, so anything lower silently
// truncates the day and undercounts.
const MAX_RUNS_PER_DAY = 1500

// Bounds the horizon scan. Covers daily (31), hourly (744), and every-15-minutes
// (2976) in full; a more frequent schedule is truncated and reported as such
// rather than quietly under-reporting overlaps.
const MAX_OCCURRENCES_IN_HORIZON = 3000

// Above this many runs a day — more often than every 15 minutes — a task
// overlaps with essentially everything. Listing each of those overlaps buries
// the ones worth acting on, so they're summarised instead of enumerated. It
// also keeps the horizon scan from iterating tens of thousands of times.
const RUNS_PER_DAY_CONTINUOUS = 96

export interface ScheduledTask {
  id: string
  name: string
  cronExpression: string
  enabled: boolean
}

export interface TimelineTask {
  id: string
  name: string
  /** Minutes past local midnight, one per run in the next 24 hours. */
  runs: number[]
  /** Human-readable next run, set only when nothing falls in the next 24 hours. */
  nextRun: string | null
  invalid: boolean
}

export interface Collision {
  /** Local time of day, HH:MM. */
  time: string
  taskNames: string[]
  /** True when this repeats daily rather than on specific dates. */
  daily: boolean
}

export interface Schedule {
  tasks: TimelineTask[]
  collisions: Collision[]
  /** Tasks that run often enough to overlap with everything; reported, not enumerated. */
  continuousTasks: string[]
  totalRunsPerDay: number
}

function minuteOfDayIn(timezone: string, date: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone || undefined,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date)

  const hour = Number(parts.find(p => p.type === 'hour')?.value ?? '0')
  const minute = Number(parts.find(p => p.type === 'minute')?.value ?? '0')
  // Some locales render midnight as hour 24.
  return (hour % 24) * 60 + minute
}

function formatMinute(minuteOfDay: number): string {
  const hour = Math.floor(minuteOfDay / 60)
  const minute = minuteOfDay % 60
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

function occurrences(
  expression: string,
  timezone: string,
  from: Date,
  to: Date,
  limit: number,
): { dates: Date[]; truncated: boolean } {
  const iterator = CronExpressionParser.parse(expression, {
    currentDate: from,
    endDate: to,
    tz: timezone || undefined,
  })

  const dates: Date[] = []
  while (iterator.hasNext() && dates.length < limit) {
    dates.push(iterator.next().toDate())
  }
  return { dates, truncated: iterator.hasNext() }
}

function nextRunLabel(expression: string, timezone: string, from: Date): string | null {
  try {
    const next = CronExpressionParser.parse(expression, { currentDate: from, tz: timezone || undefined })
      .next()
      .toDate()
    return next.toLocaleString('en-US', {
      timeZone: timezone || undefined,
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })
  } catch {
    return null
  }
}

/**
 * Only enabled tasks are considered — a paused task never fires, so drawing it
 * on a "when will things run" chart would be a lie.
 */
export function buildSchedule(tasks: ScheduledTask[], timezone: string, now = new Date()): Schedule {
  const active = tasks.filter(t => t.enabled)
  const dayEnd = new Date(now.getTime() + DAY_MS)

  const timeline: TimelineTask[] = active.map(task => {
    try {
      const runs = occurrences(task.cronExpression, timezone, now, dayEnd, MAX_RUNS_PER_DAY)
        .dates.map(date => minuteOfDayIn(timezone, date))
        .sort((a, b) => a - b)

      return {
        id: task.id,
        name: task.name,
        runs,
        nextRun: runs.length === 0 ? nextRunLabel(task.cronExpression, timezone, now) : null,
        invalid: false,
      }
    } catch {
      return { id: task.id, name: task.name, runs: [], nextRun: null, invalid: true }
    }
  })

  const runsById = new Map(timeline.map(t => [t.id, t.runs]))
  const runCount = (id: string) => runsById.get(id)?.length ?? 0
  const continuous = active.filter(t => runCount(t.id) > RUNS_PER_DAY_CONTINUOUS)
  const comparable = active.filter(t => runCount(t.id) <= RUNS_PER_DAY_CONTINUOUS)

  return {
    tasks: timeline,
    collisions: detectCollisions(comparable, runsById, timezone, now),
    continuousTasks: continuous.map(t => t.name),
    totalRunsPerDay: timeline.reduce((sum, t) => sum + t.runs.length, 0),
  }
}

/**
 * True when the date fields are all wildcards, so the schedule repeats
 * identically every day and a single day describes it completely. Anything else
 * falls back to the slower calendar scan.
 */
function repeatsDaily(expression: string): boolean {
  const fields = expression.trim().split(/\s+/)
  if (fields.length < 5) return false
  return fields.slice(-3).every(field => field === '*' || field === '?')
}

function detectCollisions(
  tasks: ScheduledTask[],
  runsById: Map<string, number[]>,
  timezone: string,
  now: Date,
): Collision[] {
  const found = new Map<string, Collision>()
  const record = (minuteOfDay: number, names: Set<string>, daily: boolean) => {
    if (names.size < 2) return
    const time = formatMinute(minuteOfDay)
    const taskNames = [...names].sort()
    const key = `${time}|${taskNames.join('|')}`
    // A daily overlap wins over the same set seen on one specific date.
    if (!found.has(key) || daily) found.set(key, { time, taskNames, daily })
  }

  // Everyday schedules are fully described by the 24-hour window already
  // computed, so their overlaps cost nothing to find.
  const everyday = tasks.filter(t => repeatsDaily(t.cronExpression))
  const namesByMinute = new Map<number, Set<string>>()
  for (const task of everyday) {
    for (const minute of runsById.get(task.id) ?? []) {
      const names = namesByMinute.get(minute) ?? new Set<string>()
      names.add(task.name)
      namesByMinute.set(minute, names)
    }
  }
  for (const [minute, names] of namesByMinute) record(minute, names, true)

  // Only date-specific schedules need the calendar scan, and by their nature
  // they fire rarely — so this stays cheap even over a month.
  const dateSpecific = tasks.filter(t => !repeatsDaily(t.cronExpression))
  if (dateSpecific.length === 0) return sortByTime(found)

  const horizonEnd = new Date(now.getTime() + COLLISION_HORIZON_DAYS * DAY_MS)
  const namesByInstant = new Map<number, { minuteOfDay: number; names: Set<string> }>()

  for (const task of dateSpecific) {
    let fireTimes: Date[]
    try {
      fireTimes = occurrences(task.cronExpression, timezone, now, horizonEnd, MAX_OCCURRENCES_IN_HORIZON).dates
    } catch {
      continue
    }

    for (const date of fireTimes) {
      // Same minute is what actually contends; cron has no finer resolution.
      const instant = Math.floor(date.getTime() / 60_000)
      const minuteOfDay = minuteOfDayIn(timezone, date)
      const entry = namesByInstant.get(instant) ?? { minuteOfDay, names: new Set<string>() }
      entry.names.add(task.name)
      // Anything on an everyday schedule at that minute is firing then too.
      for (const name of namesByMinute.get(minuteOfDay) ?? []) entry.names.add(name)
      namesByInstant.set(instant, entry)
    }
  }

  for (const { minuteOfDay, names } of namesByInstant.values()) record(minuteOfDay, names, false)
  return sortByTime(found)
}

function sortByTime(collisions: Map<string, Collision>): Collision[] {
  return [...collisions.values()].sort((a, b) => a.time.localeCompare(b.time))
}

export const MINUTES_IN_DAY = MINUTES_PER_DAY
