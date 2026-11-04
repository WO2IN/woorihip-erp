'use client'

import { ClipboardList, Search, X, type LucideIcon } from 'lucide-react'
import type { WorkflowStatus } from '@/lib/non-conformity'
import { WORKFLOW_STATUS_LABEL, nextWorkflowStatus } from '@/lib/non-conformity'
import { cn } from '@/lib/utils'

export type NcSectionTone = 'customer' | 'process'

export type NcFilter = 'all' | 'open' | 'done'

const FILTERS: { key: NcFilter; label: string }[] = [
  { key: 'all', label: '전체' },
  { key: 'open', label: '진행중' },
  { key: 'done', label: '완료' },
]

export function NcSection({
  icon: Icon,
  title,
  description,
  total,
  open,
  filter,
  onFilter,
  query,
  onQuery,
  placeholder,
  action,
  children,
  tone = 'customer',
}: {
  icon: LucideIcon
  title: string
  description: string
  total: number
  open: number
  filter: NcFilter
  onFilter: (next: NcFilter) => void
  query: string
  onQuery: (next: string) => void
  placeholder: string
  action?: React.ReactNode
  children: React.ReactNode
  tone?: NcSectionTone
}) {
  const counts: Record<NcFilter, number> = { all: total, open, done: total - open }
  const iconWrap = tone === 'process'
    ? 'bg-violet-500/12 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300'
    : 'bg-emerald-500/12 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300'
  const headerGrad = tone === 'process'
    ? 'bg-gradient-to-r from-violet-500/[0.07] via-card to-card'
    : 'bg-gradient-to-r from-emerald-500/[0.08] via-card to-card'
  return (
    <section className="overflow-hidden rounded-2xl border bg-card shadow-sm ring-1 ring-black/[0.03] dark:ring-white/[0.06]">
      <div className={cn('flex flex-wrap items-center gap-3 border-b px-5 py-4', headerGrad)}>
        <span className={cn('flex size-11 items-center justify-center rounded-xl shadow-sm ring-1 ring-black/5 dark:ring-white/10', iconWrap)}>
          <Icon className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-bold tracking-tight">{title}</h2>
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{description}</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="rounded-xl border bg-background/90 px-3 py-2 text-right shadow-sm">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">진행중</p>
            <p className={cn('text-xl font-extrabold leading-tight tabular-nums', open ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground')}>{open}</p>
          </div>
          <div className="rounded-xl border bg-background/90 px-3 py-2 text-right shadow-sm">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">전체</p>
            <p className="text-xl font-extrabold leading-tight tabular-nums">{total}</p>
          </div>
        </div>
        {action}
      </div>

      <div className="flex flex-wrap items-center gap-2 border-b bg-muted/40 px-5 py-2.5">
        <div className="flex rounded-lg border bg-background p-0.5 text-xs font-semibold">
          {FILTERS.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => onFilter(key)}
              className={cn(
                'rounded-md px-3 py-1.5 transition-colors',
                filter === key ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {label} <span className="tabular-nums opacity-80">{counts[key]}</span>
            </button>
          ))}
        </div>
        <div className="relative ml-auto w-full sm:w-64">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            placeholder={placeholder}
            className="h-8 w-full rounded-md border bg-background pl-8 pr-7 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          />
          {query && (
            <button type="button" onClick={() => onQuery('')} aria-label="검색어 지우기" className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground">
              <X className="size-3.5" />
            </button>
          )}
        </div>
      </div>

      <div className="p-4">{children}</div>
    </section>
  )
}

export function NcEmpty({ loading, filtered }: { loading: boolean; filtered: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-muted-foreground/25 bg-muted/20 px-6 py-14 text-center">
      <span className="mb-3 flex size-12 items-center justify-center rounded-full bg-muted/60 text-muted-foreground">
        <ClipboardList className="size-6 opacity-70" />
      </span>
      <p className="text-sm font-medium text-foreground/80">
        {loading ? '불러오는 중…' : filtered ? '조건에 맞는 항목이 없습니다' : '등록된 항목이 없습니다'}
      </p>
      {!loading && !filtered && (
        <p className="mt-1 max-w-xs text-xs text-muted-foreground">위 등록 버튼으로 첫 부적합을 추가할 수 있습니다.</p>
      )}
    </div>
  )
}

export function NcRecordCard({
  done,
  started,
  className,
  children,
}: {
  done: boolean
  started: boolean
  className?: string
  children: React.ReactNode
}) {
  const accent = done
    ? 'border-l-blue-500 shadow-blue-500/5'
    : started
      ? 'border-l-amber-500 shadow-amber-500/5'
      : 'border-l-rose-500 shadow-rose-500/5'
  return (
    <article
      className={cn(
        'group flex items-start gap-4 rounded-xl border border-border/80 border-l-[3px] bg-card p-4 shadow-sm transition-[box-shadow,background-color] hover:bg-muted/20 hover:shadow-md',
        accent,
        className,
      )}
    >
      {children}
    </article>
  )
}

export function NcStepTrack({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-3 flex flex-wrap items-center gap-1.5 rounded-xl border border-dashed border-muted-foreground/15 bg-gradient-to-r from-muted/50 to-muted/20 px-3 py-2.5">
      {children}
    </div>
  )
}

export function NcRemarks({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-3 border-l-2 border-emerald-500/40 bg-emerald-500/[0.06] px-3 py-2 text-xs leading-relaxed text-muted-foreground dark:bg-emerald-500/10">
      {children}
    </p>
  )
}

export function NcDate({ value, no, tone = 'customer' }: { value: string; no: number; tone?: NcSectionTone }) {
  const [y, m, d] = value.split('-')
  const ribbon = tone === 'process'
    ? 'from-violet-600 to-violet-500'
    : 'from-emerald-600 to-teal-600'
  return (
    <div className="flex shrink-0 flex-col items-center gap-1">
      <div className="overflow-hidden rounded-xl border bg-card shadow-sm ring-1 ring-black/5 dark:ring-white/10">
        <div className={cn('bg-gradient-to-r px-2 py-0.5 text-center text-[9px] font-bold tracking-wide text-white', ribbon)}>
          {y}.{m}
        </div>
        <div className="flex w-[3.25rem] items-center justify-center py-2 text-2xl font-extrabold leading-none tabular-nums text-foreground">
          {d}
        </div>
      </div>
      <span className="rounded-full bg-muted px-2 py-px text-[10px] font-bold tabular-nums text-muted-foreground">No.{no}</span>
    </div>
  )
}

const STEP_TONE: Record<WorkflowStatus, string> = {
  done: 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-500/30 dark:bg-blue-500/15 dark:text-blue-300',
  in_progress: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/15 dark:text-amber-300',
  not_started: 'border-red-200 bg-red-50 text-red-600 dark:border-red-500/30 dark:bg-red-500/15 dark:text-red-300',
}

const DOT: Record<WorkflowStatus, string> = {
  done: 'bg-blue-600',
  in_progress: 'bg-amber-400',
  not_started: 'bg-red-500',
}

/** 단계 칩 — 편집 가능하면 클릭 시 완료 → 진행중 → 미진행 순환 */
export function NcStep({
  label,
  status,
  editable,
  onChange,
}: {
  label: string
  status: WorkflowStatus
  editable?: boolean
  onChange?: (next: WorkflowStatus) => void
}) {
  const body = (
    <>
      <span className={cn('size-2 shrink-0 rounded-full', DOT[status])} aria-hidden />
      <span className="font-medium text-foreground/80">{label}</span>
      <span className="font-bold">{WORKFLOW_STATUS_LABEL[status]}</span>
    </>
  )
  const className = cn('inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs shadow-sm', STEP_TONE[status])
  if (editable && onChange) {
    return (
      <button
        type="button"
        title={`${label}: ${WORKFLOW_STATUS_LABEL[status]} (클릭하여 변경)`}
        onClick={() => onChange(nextWorkflowStatus(status))}
        className={cn(className, 'transition hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring')}
      >
        {body}
      </button>
    )
  }
  return <span className={className}>{body}</span>
}

export function NcOverall({ done, started }: { done: boolean; started: boolean }) {
  return (
    <span
      className={cn(
        'shrink-0 rounded-full px-2.5 py-1 text-xs font-bold',
        done
          ? 'bg-blue-600 text-white'
          : started
            ? 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300'
            : 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300',
      )}
    >
      {done ? '처리 완료' : started ? '진행중' : '미착수'}
    </span>
  )
}
