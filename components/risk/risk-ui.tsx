'use client'

import type { ReactNode } from 'react'
import { ClipboardCheck, Gauge, Grid3x3, type LucideIcon } from 'lucide-react'
import { METHODS, METHOD_ORDER, type RiskMethod } from '@/lib/risk/model'
import { cn } from '@/lib/utils'

export const METHOD_ICON: Record<RiskMethod, LucideIcon> = { CL: ClipboardCheck, FS: Grid3x3, L3: Gauge }

export const FIELD =
  'h-9 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none transition placeholder:text-muted-foreground/70 focus:border-foreground/40 focus:ring-2 focus:ring-foreground/10 disabled:cursor-not-allowed disabled:opacity-60'
export const AREA =
  'w-full rounded-lg border border-input bg-background px-3 py-2 text-sm leading-6 outline-none transition placeholder:text-muted-foreground/70 focus:border-foreground/40 focus:ring-2 focus:ring-foreground/10 disabled:cursor-not-allowed disabled:opacity-60'
export const LABEL = 'flex min-w-0 flex-col gap-1.5 text-xs font-semibold text-slate-600 dark:text-muted-foreground'
export const THEAD = 'bg-slate-50/80 text-left text-xs text-slate-500 dark:bg-muted/40 dark:text-muted-foreground'
export const TH = 'whitespace-nowrap px-4 py-2.5 font-semibold'

export type Tone = 'red' | 'orange' | 'amber' | 'emerald' | 'sky' | 'slate'

const PILL: Record<Tone, string> = {
  red: 'bg-red-50 text-red-700 ring-red-600/15 dark:bg-red-500/15 dark:text-red-300',
  orange: 'bg-orange-50 text-orange-700 ring-orange-600/15 dark:bg-orange-500/15 dark:text-orange-300',
  amber: 'bg-amber-50 text-amber-700 ring-amber-600/20 dark:bg-amber-500/15 dark:text-amber-300',
  emerald: 'bg-emerald-50 text-emerald-700 ring-emerald-600/15 dark:bg-emerald-500/15 dark:text-emerald-300',
  sky: 'bg-sky-50 text-sky-700 ring-sky-600/15 dark:bg-sky-500/15 dark:text-sky-300',
  slate: 'bg-slate-100 text-slate-600 ring-slate-500/15 dark:bg-white/10 dark:text-slate-300',
}

const ICON_BOX: Record<Tone, string> = {
  red: 'bg-red-50 text-red-600 dark:bg-red-500/15 dark:text-red-300',
  orange: 'bg-orange-50 text-orange-600 dark:bg-orange-500/15 dark:text-orange-300',
  amber: 'bg-amber-50 text-amber-600 dark:bg-amber-500/15 dark:text-amber-300',
  emerald: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300',
  sky: 'bg-sky-50 text-sky-600 dark:bg-sky-500/15 dark:text-sky-300',
  slate: 'bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-300',
}

const VALUE: Record<Tone, string> = {
  red: 'text-red-600 dark:text-red-400',
  orange: 'text-orange-600 dark:text-orange-400',
  amber: 'text-amber-600 dark:text-amber-400',
  emerald: 'text-emerald-600 dark:text-emerald-400',
  sky: 'text-sky-600 dark:text-sky-400',
  slate: 'text-slate-900 dark:text-foreground',
}

export function Pill({ tone, children, className }: { tone: Tone; children: ReactNode; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset', PILL[tone], className)}>
      {children}
    </span>
  )
}

export function decisionTone(decision: string): Tone {
  if (decision === '개선' || decision === '즉시개선') return 'red'
  if (decision === '개선권고') return 'amber'
  if (decision === '자체개선') return 'sky'
  if (decision === '적정' || decision === '적절' || decision === '허용') return 'emerald'
  return 'slate'
}

export function IconBox({ icon: Icon, tone = 'slate', className }: { icon: LucideIcon; tone?: Tone; className?: string }) {
  return (
    <span className={cn('grid size-8 shrink-0 place-items-center rounded-lg', ICON_BOX[tone], className)}>
      <Icon className="size-4" />
    </span>
  )
}

export function Panel({
  title,
  description,
  icon,
  tone = 'slate',
  actions,
  children,
  className,
}: {
  title?: ReactNode
  description?: ReactNode
  icon?: LucideIcon
  tone?: Tone
  actions?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section className={cn('overflow-hidden rounded-xl border border-border bg-card shadow-xs', className)}>
      {title ? (
        <header className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3">
          {icon ? <IconBox icon={icon} tone={tone} /> : null}
          <div className="min-w-0">
            <h2 className="text-[15px] font-bold tracking-tight">{title}</h2>
            {description ? <p className="mt-0.5 text-xs text-muted-foreground">{description}</p> : null}
          </div>
          {actions ? <div className="ml-auto flex flex-wrap items-center gap-2">{actions}</div> : null}
        </header>
      ) : null}
      {children}
    </section>
  )
}

export function StatCard({
  label,
  value,
  unit,
  hint,
  icon,
  tone = 'slate',
  selected,
  onClick,
}: {
  label: string
  value: ReactNode
  unit?: string
  hint?: ReactNode
  icon: LucideIcon
  tone?: Tone
  selected?: boolean
  onClick?: () => void
}) {
  const body = (
    <>
      <IconBox icon={icon} tone={tone} className="size-10 rounded-xl" />
      <div className="min-w-0">
        <p className="truncate text-xs font-medium text-muted-foreground">{label}</p>
        <p className={cn('mt-0.5 text-2xl font-bold leading-tight tracking-tight tabular-nums', VALUE[tone])}>
          {value}
          {unit ? <span className="ml-0.5 text-sm font-semibold text-muted-foreground">{unit}</span> : null}
        </p>
        {hint ? <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{hint}</p> : null}
      </div>
    </>
  )
  const frame = 'flex items-center gap-3 rounded-xl border bg-card px-4 py-3.5 text-left shadow-xs'
  if (!onClick) return <div className={cn(frame, 'border-border')}>{body}</div>
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={cn(frame, 'transition', selected ? 'border-foreground/70 ring-2 ring-foreground/10' : 'border-border hover:border-foreground/25 hover:bg-muted/30')}
    >
      {body}
    </button>
  )
}

export function MethodPicker({
  method,
  onMethod,
  meta,
  footer,
}: {
  method: RiskMethod
  onMethod: (method: RiskMethod) => void
  meta?: (key: RiskMethod) => ReactNode
  footer?: (key: RiskMethod) => ReactNode
}) {
  return (
    <div className="grid gap-2.5 sm:grid-cols-3" role="group" aria-label="평가방법">
      {METHOD_ORDER.map((key, index) => {
        const selected = method === key
        const Icon = METHOD_ICON[key]
        return (
          <div
            key={key}
            className={cn(
              'flex flex-col rounded-xl border bg-card shadow-xs transition',
              selected ? 'border-foreground/70 ring-2 ring-foreground/10' : 'border-border hover:border-foreground/25',
            )}
          >
            <button type="button" aria-pressed={selected} onClick={() => onMethod(key)} className="flex items-start gap-3 p-3.5 text-left">
              <span className={cn('grid size-10 shrink-0 place-items-center rounded-xl transition', selected ? 'bg-foreground text-background' : 'bg-muted text-muted-foreground')}>
                <Icon className="size-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                  <span className="text-[11px] font-semibold tabular-nums text-muted-foreground">0{index + 1}</span>
                  <span className={cn('text-[15px] font-bold tracking-tight', selected ? 'text-foreground' : 'text-foreground/80')}>{METHODS[key].name}</span>
                </span>
                <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">{METHODS[key].sub}</span>
                {meta ? <span className="mt-1.5 block text-xs font-medium text-foreground/70">{meta(key)}</span> : null}
              </span>
            </button>
            {footer ? <div className="px-3.5 pb-3.5">{footer(key)}</div> : null}
          </div>
        )
      })}
    </div>
  )
}

export function DistributionBar({ parts, title }: { parts: Array<[string, number, string]>; title?: string }) {
  const shown = parts.filter((part) => part[1] > 0)
  const total = shown.reduce((sum, part) => sum + part[1], 0)
  return (
    <div title={title}>
      <div className="flex h-2 gap-px overflow-hidden rounded-full bg-muted">
        {shown.map(([label, count, color]) => (
          <span key={label} className="h-full first:rounded-l-full last:rounded-r-full" style={{ width: `${(count / total) * 100}%`, background: color }} />
        ))}
      </div>
      <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
        {shown.map(([label, count, color]) => (
          <span key={label} className="inline-flex items-center gap-1">
            <span className="size-2 rounded-full" style={{ background: color }} aria-hidden />
            {label}
            <span className="font-semibold tabular-nums text-foreground">{count}</span>
          </span>
        ))}
      </div>
    </div>
  )
}

export function ProgressMini({ done, total }: { done: number; total: number }) {
  const rate = total ? Math.round((done / total) * 100) : 0
  return (
    <div className="flex min-w-24 items-center gap-2">
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-emerald-500" style={{ width: `${rate}%` }} />
      </div>
      <span className="text-xs tabular-nums text-muted-foreground">
        <span className="font-semibold text-foreground">{done}</span>/{total}
      </span>
    </div>
  )
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  disabled,
  className,
}: {
  value: T
  options: Array<{ value: T; label: ReactNode; activeClass?: string }>
  onChange: (value: T) => void
  disabled?: boolean
  className?: string
}) {
  return (
    <div className={cn('inline-flex h-9 items-center gap-0.5 rounded-lg border border-border bg-muted/40 p-0.5', className)}>
      {options.map((option) => {
        const active = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            disabled={disabled}
            aria-pressed={active}
            onClick={() => onChange(option.value)}
            className={cn(
              'h-full rounded-md px-3 text-sm font-semibold whitespace-nowrap transition disabled:cursor-not-allowed disabled:opacity-60',
              active ? option.activeClass || 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
