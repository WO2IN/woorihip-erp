'use client'

import { Search, X, type LucideIcon } from 'lucide-react'
import type { WorkflowStatus } from '@/lib/non-conformity'
import { WORKFLOW_STATUS_LABEL, nextWorkflowStatus } from '@/lib/non-conformity'
import { cn } from '@/lib/utils'

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
}) {
  const counts: Record<NcFilter, number> = { all: total, open, done: total - open }
  return (
    <section className="overflow-hidden rounded-2xl border bg-card shadow-sm">
      <div className="flex flex-wrap items-center gap-3 border-b px-5 py-4">
        <span className="flex size-10 items-center justify-center rounded-xl bg-[oklch(0.58_0.15_162/0.12)] text-[oklch(0.45_0.15_162)] dark:bg-[oklch(0.62_0.15_162/0.18)] dark:text-[oklch(0.72_0.15_162)]">
          <Icon className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-bold">{title}</h2>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
        <div className="flex items-center gap-4 text-right">
          <div>
            <p className="text-[11px] font-semibold text-muted-foreground">진행중</p>
            <p className={cn('text-xl font-extrabold tabular-nums', open ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground')}>{open}</p>
          </div>
          <div>
            <p className="text-[11px] font-semibold text-muted-foreground">전체</p>
            <p className="text-xl font-extrabold tabular-nums">{total}</p>
          </div>
        </div>
        {action}
      </div>

      <div className="flex flex-wrap items-center gap-2 border-b bg-muted/30 px-5 py-2.5">
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

      <div className="divide-y">{children}</div>
    </section>
  )
}

export function NcEmpty({ loading, filtered }: { loading: boolean; filtered: boolean }) {
  return (
    <p className="py-12 text-center text-sm text-muted-foreground">
      {loading ? '불러오는 중…' : filtered ? '조건에 맞는 항목이 없습니다.' : '등록된 항목이 없습니다.'}
    </p>
  )
}

export function NcDate({ value, no }: { value: string; no: number }) {
  const [y, m, d] = value.split('-')
  return (
    <div className="flex w-16 shrink-0 flex-col items-center rounded-xl border bg-muted/40 py-2 text-center">
      <span className="text-[10px] font-semibold text-muted-foreground">{y}.{m}</span>
      <span className="text-2xl font-extrabold leading-none tabular-nums">{d}</span>
      <span className="mt-1 text-[10px] text-muted-foreground">No.{no}</span>
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
  const className = cn('inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs', STEP_TONE[status])
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
