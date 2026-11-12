import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

export function QualificationStatCard({
  icon: Icon,
  label,
  value,
  unit,
  sub,
  tone,
  valueClassName,
  children,
}: {
  icon: LucideIcon
  label: string
  value: string
  unit?: string
  sub?: string
  tone: string
  valueClassName?: string
  children?: ReactNode
}) {
  return (
    <article className="flex min-w-0 items-center gap-3 rounded-2xl border bg-card px-4 py-3 shadow-sm">
      <span className={cn('flex size-10 shrink-0 items-center justify-center rounded-full', tone)}>
        <Icon className="size-5" />
      </span>
      <div className="min-w-0">
        <p className="truncate text-[12px] text-slate-500">{label}</p>
        <p className={cn('truncate text-xl font-black tabular-nums text-slate-950 dark:text-white', valueClassName)}>
          {value}
          {unit ? <span className="ml-1 text-sm font-bold text-slate-500">{unit}</span> : null}
        </p>
        {children ?? (sub ? <p className="truncate text-[11px] text-slate-400" title={sub}>{sub}</p> : null)}
      </div>
    </article>
  )
}
