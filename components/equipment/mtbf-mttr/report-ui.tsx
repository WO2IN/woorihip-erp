import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { EMPTY_CELL } from './model'

const META_TEXT = 'text-xs'

export function SectionHeading({ title }: { title: string }) {
  return <h2 className="min-w-0 truncate text-base font-bold tracking-tight text-slate-900 dark:text-white">{title}</h2>
}

export function FilterField({ label, className, children }: { label: string; className?: string; children: ReactNode }) {
  return (
    <div className={cn('flex min-w-0 flex-col gap-1', className)}>
      <span className={cn('font-bold text-slate-500 dark:text-slate-400', META_TEXT)}>{label}</span>
      <div className="min-w-0">{children}</div>
    </div>
  )
}

export function VerdictBadge({ ok }: { ok: boolean }) {
  return (
    <span
      className={cn(
        'inline-flex size-7 items-center justify-center rounded-full text-xs font-black',
        ok
          ? 'bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:ring-emerald-800'
          : 'bg-rose-100 text-rose-700 ring-1 ring-rose-200 dark:bg-rose-950/50 dark:text-rose-300 dark:ring-rose-800',
      )}
    >
      {ok ? 'O' : 'X'}
    </span>
  )
}

export function StatCard({
  label,
  value,
  unit,
  hint,
  tone = 'slate',
}: {
  label: string
  value: string
  unit: string
  hint: string
  tone?: 'slate' | 'rose' | 'green'
}) {
  return (
    <article className="rounded-2xl border bg-card px-4 py-3 shadow-sm print:rounded-lg print:px-3 print:py-2 print:shadow-none">
      <p className={cn('font-semibold text-muted-foreground', META_TEXT)}>{label}</p>
      <p className={cn('mt-1 text-3xl font-extrabold tabular-nums leading-none', tone === 'rose' && 'text-rose-600', tone === 'green' && 'text-emerald-600')}>
        {value}
        <span className="ml-1 text-base font-bold text-muted-foreground">{unit}</span>
      </p>
      <p className={cn('mtbf-mttr-stat-hint mt-2 leading-snug text-muted-foreground', META_TEXT)}>{hint}</p>
    </article>
  )
}

type CellTone = 'ok' | 'bad' | 'muted' | undefined

export function SheetRow({
  label,
  values,
  total,
  muted,
  toneOf,
  totalTone,
  stripe,
  verdict,
}: {
  label: string
  values: string[]
  total: string
  muted?: boolean
  toneOf?: (value: string, index: number) => CellTone
  totalTone?: 'ok' | 'bad'
  stripe?: number
  verdict?: boolean
}) {
  const rowBg = stripe != null && stripe % 2 === 1 ? 'bg-slate-50/70 dark:bg-muted/15' : 'bg-card'
  return (
    <tr className={cn('border-b border-border/70', rowBg)}>
      <th className={cn('sticky left-0 z-[1] px-3 py-2.5 text-left text-[13px] font-semibold text-slate-800 dark:text-slate-100', rowBg)}>{label}</th>
      {values.map((value, index) => {
        const tone = toneOf?.(value, index)
        const pending = value === EMPTY_CELL
        return (
          <td
            key={`${label}-${index}`}
            className={cn(
              'px-1.5 py-2.5 text-center tabular-nums',
              (muted || pending || tone === 'muted') && 'text-muted-foreground',
              !muted && !pending && tone !== 'muted' && 'font-medium text-slate-800 dark:text-slate-100',
              tone === 'ok' && '!font-bold text-blue-600 dark:text-blue-400',
              tone === 'bad' && '!font-bold text-rose-600',
            )}
          >
            {verdict && (value === 'O' || value === 'X') ? <VerdictMark value={value} /> : value}
          </td>
        )
      })}
      <td
        className={cn(
          'bg-slate-100/80 px-2.5 py-2.5 text-center text-[13px] font-bold tabular-nums dark:bg-muted/30',
          totalTone === 'bad' && 'text-rose-600',
          totalTone === 'ok' && 'text-blue-600 dark:text-blue-400',
          totalTone == null && 'text-slate-900 dark:text-slate-100',
        )}
      >
        {total}
      </td>
    </tr>
  )
}

function VerdictMark({ value }: { value: 'O' | 'X' }) {
  return (
    <span
      className={cn(
        'inline-flex size-6 items-center justify-center rounded-full text-[11px] font-black',
        value === 'O'
          ? 'bg-blue-100 text-blue-700 ring-1 ring-blue-200 dark:bg-blue-950/50 dark:text-blue-300'
          : 'bg-rose-100 text-rose-700 ring-1 ring-rose-200 dark:bg-rose-950/50 dark:text-rose-300',
      )}
    >
      {value}
    </span>
  )
}
