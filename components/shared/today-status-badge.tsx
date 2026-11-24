import { cn } from '@/lib/utils'
import type { TodayStatus } from '@/lib/today-check'

export function TodayStatusBadge({ status, label }: { status: TodayStatus; label: string }) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold',
        status === 'missing' && 'bg-rose-100 text-rose-800 dark:bg-rose-500/15 dark:text-rose-300',
        status === 'done' && 'bg-emerald-100 text-emerald-800 ring-1 ring-emerald-200/80 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-500/25',
        status === 'off' && 'bg-muted text-muted-foreground',
      )}
    >
      <span
        className={cn(
          'size-1.5 rounded-full',
          status === 'missing' && 'bg-rose-600',
          status === 'done' && 'bg-emerald-600',
          status === 'off' && 'bg-muted-foreground/50',
        )}
        aria-hidden="true"
      />
      {label}
    </span>
  )
}
