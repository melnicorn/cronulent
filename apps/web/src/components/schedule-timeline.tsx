import { AlertTriangle } from 'lucide-react'
import { buildSchedule, MINUTES_IN_DAY, type ScheduledTask } from '../lib/schedule'

interface Props {
  tasks: ScheduledTask[]
  timezone: string
}

const AXIS_HOURS = [0, 6, 12, 18]

// A `* * * * *` schedule fires 1440 times a day. Past this many, ticks overlap
// into a solid bar anyway, so bucket them rather than emit a node per run.
const TICK_LIMIT = 120
const BUCKET_MINUTES = 5

function ticksFor(runs: number[], colliding: Set<number>): { minute: number; collides: boolean }[] {
  if (runs.length <= TICK_LIMIT) {
    return runs.map(minute => ({ minute, collides: colliding.has(minute) }))
  }

  const buckets = new Map<number, boolean>()
  for (const minute of runs) {
    const bucket = Math.round(minute / BUCKET_MINUTES) * BUCKET_MINUTES
    buckets.set(bucket, (buckets.get(bucket) ?? false) || colliding.has(minute))
  }
  return [...buckets].map(([minute, collides]) => ({ minute, collides }))
}

function percent(minuteOfDay: number): string {
  return `${(minuteOfDay / MINUTES_IN_DAY) * 100}%`
}

function toMinuteOfDay(time: string): number {
  const [hour, minute] = time.split(':').map(Number)
  return (hour ?? 0) * 60 + (minute ?? 0)
}

const listFormatter = new Intl.ListFormat('en', { style: 'long', type: 'conjunction' })

export function ScheduleTimeline({ tasks, timezone }: Props) {
  const schedule = buildSchedule(tasks, timezone)

  if (schedule.tasks.length === 0) return null

  const collidingMinutes = new Set(schedule.collisions.map(c => toMinuteOfDay(c.time)))

  return (
    <div className="rounded-lg border border-border bg-card p-4 sm:p-5 space-y-4">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="text-sm font-medium text-foreground">Next 24 hours</h2>
        <span className="text-xs text-muted-foreground">
          {schedule.totalRunsPerDay} {schedule.totalRunsPerDay === 1 ? 'run' : 'runs'}
          {timezone && ` · ${timezone}`}
        </span>
      </div>

      <div className="relative">
        {[...collidingMinutes].map(minute => (
          <div
            key={minute}
            className="absolute top-0 bottom-5 w-0.5 bg-destructive/40"
            style={{ left: percent(minute) }}
            aria-hidden="true"
          />
        ))}

        {schedule.tasks.map(task => (
          <div key={task.id} className="flex items-center h-8">
            <div className="w-28 sm:w-36 shrink-0 pr-2 text-xs text-foreground truncate" title={task.name}>
              {task.name}
            </div>

            <div className="flex-1 relative h-full border-b border-border">
              {ticksFor(task.runs, collidingMinutes).map(tick => (
                <div
                  key={tick.minute}
                  className={`absolute top-2 w-[3px] h-4 rounded-sm ${tick.collides ? 'bg-destructive' : 'bg-primary'}`}
                  style={{ left: percent(tick.minute) }}
                />
              ))}
            </div>

            <div className="w-16 shrink-0 pl-2 text-right text-xs text-muted-foreground font-mono">
              {task.invalid ? 'invalid' : task.runs.length > 0 ? `${task.runs.length}/day` : '—'}
            </div>
          </div>
        ))}

        <div className="flex items-center h-5">
          <div className="w-28 sm:w-36 shrink-0" />
          <div className="flex-1 relative h-full">
            {AXIS_HOURS.map(hour => (
              <span
                key={hour}
                className="absolute top-0 -translate-x-1/2 text-[11px] text-muted-foreground font-mono"
                style={{ left: percent(hour * 60) }}
              >
                {String(hour).padStart(2, '0')}
              </span>
            ))}
            <span className="absolute top-0 right-0 text-[11px] text-muted-foreground font-mono">24</span>
          </div>
          <div className="w-16 shrink-0" />
        </div>
      </div>

      {schedule.tasks.some(t => t.nextRun) && (
        <div className="text-xs text-muted-foreground space-y-1">
          {schedule.tasks
            .filter(t => t.nextRun)
            .map(task => (
              <p key={task.id}>
                {task.name} doesn&apos;t run today — next on {task.nextRun}.
              </p>
            ))}
        </div>
      )}

      {schedule.continuousTasks.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {listFormatter.format(schedule.continuousTasks)} {schedule.continuousTasks.length === 1 ? 'runs' : 'run'} almost
          continuously, so {schedule.continuousTasks.length === 1 ? 'it overlaps' : 'they overlap'} with everything
          and {schedule.continuousTasks.length === 1 ? 'is' : 'are'} left out of the overlap check.
        </p>
      )}

      {schedule.collisions.length > 0 && (
        <div className="rounded-md bg-destructive/10 p-3 space-y-1.5">
          {schedule.collisions.map(collision => (
            <div key={`${collision.time}-${collision.taskNames.join()}`} className="flex gap-2 text-xs text-destructive">
              <AlertTriangle size={14} className="shrink-0 mt-px" />
              <span>
                <span className="font-medium">{collision.time}</span>
                {collision.daily ? ' every day' : ' on some days'} — {listFormatter.format(collision.taskNames)}{' '}
                start together.
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
