import { cn } from '@/lib/utils'
import { formatFloorLabel } from '@/lib/floor'
import type { TodayStatus } from '@/lib/today-check'

const FLOOR_TONE: Record<string, string> = {
  '1': 'bg-[linear-gradient(135deg,oklch(0.52_0.19_258),oklch(0.40_0.16_265))]',
  '2': 'bg-[linear-gradient(135deg,oklch(0.60_0.14_165),oklch(0.46_0.12_172))]',
  '3': 'bg-[linear-gradient(135deg,oklch(0.56_0.18_288),oklch(0.43_0.17_295))]',
}

export function TargetFloorSection({
  id,
  floor,
  statuses,
  children,
}: {
  id: string
  floor: string
  statuses: TodayStatus[]
  children: React.ReactNode
}) {
  const done = statuses.filter((status) => status === 'done').length
  const missing = statuses.filter((status) => status === 'missing').length
  const total = statuses.length
  const rate = total ? Math.round((done / Math.max(done + missing, 1)) * 100) : 0

  return (
    <section aria-labelledby={id} className="rounded-2xl border bg-muted/30 p-4">
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <span className={cn('flex h-9 min-w-12 items-center justify-center rounded-xl px-3 text-sm font-extrabold text-white shadow-sm', FLOOR_TONE[floor] ?? 'bg-[oklch(0.55_0.02_260)]')}>
          {formatFloorLabel(floor)}
        </span>
        <h2 id={id} className="sr-only">{formatFloorLabel(floor)}</h2>
        <div className="flex flex-wrap items-center gap-1.5 text-xs font-semibold">
          <span className="rounded-full border bg-card px-2.5 py-1">전체 {total}</span>
          <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300">완료 {done}</span>
          <span className={cn('rounded-full px-2.5 py-1', missing ? 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300' : 'bg-muted text-muted-foreground')}>미점검 {missing}</span>
        </div>
        {done + missing > 0 && (
          <div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
            오늘 진행률
            <span className="h-1.5 w-28 overflow-hidden rounded-full bg-muted">
              <span className="block h-full rounded-full bg-[oklch(0.62_0.15_162)]" style={{ width: `${rate}%` }} />
            </span>
            <b className="tabular-nums text-foreground">{rate}%</b>
          </div>
        )}
      </div>
      {total === 0 ? (
        <p className="rounded-xl border border-dashed bg-card py-6 text-center text-sm text-muted-foreground">등록된 항목이 없습니다.</p>
      ) : (
        <div className="grid gap-2.5 md:grid-cols-2 2xl:grid-cols-3">{children}</div>
      )}
    </section>
  )
}
