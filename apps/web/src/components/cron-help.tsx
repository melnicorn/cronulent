'use client'

import cronstrue from 'cronstrue'

const EXAMPLES = [
  { expr: '* * * * *', label: 'Every minute' },
  { expr: '*/5 * * * *', label: 'Every 5 minutes' },
  { expr: '0 * * * *', label: 'Every hour' },
  { expr: '0 9 * * 1-5', label: 'Weekdays at 9am' },
  { expr: '0 0 * * *', label: 'Daily at midnight' },
  { expr: '0 0 1 * *', label: 'First of each month' },
]

interface Props {
  expression: string
}

export function CronHelp({ expression }: Props) {
  function describe(expr: string) {
    try {
      return cronstrue.toString(expr, { throwExceptionOnParseError: true })
    } catch {
      return 'Invalid expression'
    }
  }

  return (
    <div className="mt-2 p-3 rounded-md bg-muted border border-border text-sm space-y-3">
      <p className="text-foreground font-medium">
        {describe(expression)}
      </p>
      <div>
        <p className="text-muted-foreground text-xs mb-2">Format: minute hour day-of-month month day-of-week</p>
        <div className="grid grid-cols-2 gap-1">
          {EXAMPLES.map(ex => (
            <div key={ex.expr} className="flex gap-2 text-xs">
              <code className="text-primary font-mono">{ex.expr}</code>
              <span className="text-muted-foreground">{ex.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
