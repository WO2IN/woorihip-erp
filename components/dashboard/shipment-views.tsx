'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import { displayDate, formatQuantity } from '@/lib/stock'
import type { DashboardStats } from '@/lib/dashboard-stats'

const TONE = {
  rose: 'bg-[oklch(0.60_0.21_25)]',
  roseSoft: 'bg-[oklch(0.60_0.21_25/0.35)]',
}

const FLOW_LABEL: Record<string, string> = {
  waiting: '입고 대기',
  working: '작업 중',
  ready: '출고 대기',
  done: '출고 완료',
}

const FLOW_BAR: Record<string, string> = {
  waiting: 'bg-sky-500',
  working: 'bg-amber-500',
  ready: 'bg-violet-500',
  done: 'bg-emerald-500',
}

const FLOW_CHIP: Record<string, string> = {
  waiting: 'border-sky-400 bg-sky-50 text-sky-800 dark:border-sky-600 dark:bg-sky-950/40 dark:text-sky-200',
  working: 'border-amber-400 bg-amber-50 text-amber-800 dark:border-amber-600 dark:bg-amber-950/40 dark:text-amber-200',
  ready: 'border-violet-400 bg-violet-50 text-violet-800 dark:border-violet-600 dark:bg-violet-950/40 dark:text-violet-200',
  done: 'border-emerald-400 bg-emerald-50 text-emerald-800 dark:border-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-200',
}

type Tab = 'flow' | 'inbound' | 'outbound' | 'work'

export function ShipmentViews({ data }: { data: DashboardStats }) {
  const [tab, setTab] = useState<Tab>('flow')
  const p = data.process
  const views = p.views
  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: 'flow', label: '진행현황', count: views.flow.open },
    { id: 'inbound', label: '입고', count: p.inbound },
    { id: 'outbound', label: '출고', count: p.outbound },
    { id: 'work', label: '작업일보', count: p.workLogs },
  ]

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="grid grid-cols-4 rounded-xl border bg-muted/40 p-1">
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={cn(
              'rounded-lg px-1.5 py-1.5 text-center text-sm leading-tight',
              tab === item.id ? 'bg-card font-bold text-[oklch(0.52_0.18_25)] shadow-sm' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <span className="block truncate">{item.label}</span>
            {item.count != null && <span className="text-[11px] font-medium tabular-nums">{item.count.toLocaleString('ko-KR')}건</span>}
          </button>
        ))}
      </div>
      <div className="flex h-[320px] flex-col gap-2.5">
        {tab === 'flow' && <FlowView views={views} />}
        {tab === 'inbound' && <MovementView title="최근 입고" empty="입고 내역 없음" recent={views.inbound.recent} monthly={views.inbound.monthly} />}
        {tab === 'outbound' && <MovementView title="최근 출고" empty="출고 내역 없음" recent={views.outbound.recent} monthly={views.outbound.monthly} />}
        {tab === 'work' && <WorkView views={views} />}
      </div>
    </div>
  )
}

function FlowView({ views }: { views: DashboardStats['process']['views'] }) {
  const total = Math.max(1, views.flow.stages.reduce((sum, stage) => sum + stage.count, 0))
  return (
    <div className="flex h-full flex-col rounded-xl border px-3.5 py-2.5">
      <p className="mb-2 flex items-center justify-between text-sm font-bold">
        진행현황
        <span className="text-xs font-medium text-muted-foreground">진행 {views.flow.open}건{views.flow.unregistered ? ` · 미등록 출고 ${views.flow.unregistered}건` : ''}</span>
      </p>
      <ol className="grid grid-cols-4 gap-1.5">
        {views.flow.stages.map((stage) => (
          <li key={stage.key} className="rounded-lg bg-muted/60 px-1.5 py-2 text-center">
            <p className="truncate text-[11px] font-medium text-muted-foreground">{FLOW_LABEL[stage.key]}</p>
            <p className="text-xl font-extrabold tabular-nums tracking-tight">{stage.count}</p>
          </li>
        ))}
      </ol>
      <div className="mt-2 flex h-2 overflow-hidden rounded-full bg-muted">
        {views.flow.stages.map((stage) => (
          <div key={stage.key} className={FLOW_BAR[stage.key]} style={{ width: `${(stage.count / total) * 100}%` }} />
        ))}
      </div>
      <div className="mt-2 grid min-h-0 flex-1 grid-cols-4 gap-1.5">
        {views.flow.stages.map((stage) => (
          <ul key={stage.key} className="space-y-1">
            {stage.lots.map((lot) => (
              <li key={lot.id} className={cn('rounded-md border px-1.5 py-1', FLOW_CHIP[stage.key])}>
                <p className="truncate text-[11px] font-semibold">{lot.company}</p>
                <p className="truncate text-[10px] opacity-80" title={lot.product}>{lot.product}</p>
              </li>
            ))}
            {stage.count > stage.lots.length && (
              <li className="px-1 text-[10px] text-muted-foreground">+{stage.count - stage.lots.length}건</li>
            )}
          </ul>
        ))}
      </div>
    </div>
  )
}

function MovementView({
  title,
  empty,
  recent,
  monthly,
}: {
  title: string
  empty: string
  recent: DashboardStats['process']['views']['inbound']['recent']
  monthly: { key: string; label: string; count: number }[]
}) {
  const max = Math.max(1, ...monthly.map((m) => m.count))
  return (
    <>
      <div className="flex min-h-0 flex-1 flex-col rounded-xl border px-3.5 py-2.5">
        <p className="mb-1 text-sm font-bold">{title}</p>
        {recent.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">{empty}</p>
        ) : (
          <ul className="flex flex-1 flex-col justify-between divide-y text-sm">
            {recent.map((m) => (
              <li key={m.id} className="flex items-center gap-2 py-1">
                <span className="w-[5.25rem] shrink-0 tabular-nums text-muted-foreground">{displayDate(m.issueDate)}</span>
                <span className="w-[5.5rem] shrink-0 truncate font-semibold" title={m.company}>{m.company}</span>
                <span className="min-w-0 flex-1 truncate text-muted-foreground" title={m.product}>{m.product}</span>
                <span className="shrink-0 text-right font-medium tabular-nums">{formatQuantity(m.quantity, m.unit)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <MonthChart monthly={monthly} max={max} />
    </>
  )
}

function WorkView({ views }: { views: DashboardStats['process']['views'] }) {
  const max = Math.max(1, ...views.work.monthly.map((m) => m.count))
  return (
    <>
      <div className="flex min-h-0 flex-1 flex-col rounded-xl border px-3.5 py-2.5">
        <p className="mb-1 text-sm font-bold">최근 작업일보</p>
        {views.work.recent.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">작업일보 없음</p>
        ) : (
          <ul className="flex flex-1 flex-col justify-between divide-y text-sm">
            {views.work.recent.map((row) => (
              <li key={row.id} className="flex items-center gap-2 py-1">
                <span className="w-[5.25rem] shrink-0 tabular-nums text-muted-foreground">{displayDate(row.workDate)}</span>
                <span className="w-[5.5rem] shrink-0 truncate font-semibold" title={row.company}>{row.company}</span>
                <span className="min-w-0 flex-1 truncate text-muted-foreground" title={row.product}>{row.product}</span>
                <span className="shrink-0 text-right font-medium tabular-nums">{formatQuantity(row.workQuantity, row.unit)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <MonthChart monthly={views.work.monthly} max={max} />
    </>
  )
}

function MonthChart({ monthly, max }: { monthly: { key: string; label: string; count: number }[]; max: number }) {
  return (
    <div className="shrink-0 rounded-xl border px-3.5 py-2.5">
      <p className="mb-1.5 flex items-center justify-between text-sm font-bold">
        월별 건수
        <span className="text-xs font-medium text-muted-foreground">최근 6개월</span>
      </p>
      <div className="flex items-end gap-2">
        {monthly.map((m, i) => (
          <div key={m.key} className="flex flex-1 flex-col items-center gap-0.5">
            <span className="text-[11px] font-semibold tabular-nums">{m.count}</span>
            <div className={cn('w-full rounded-t-md', i === monthly.length - 1 ? TONE.rose : TONE.roseSoft)} style={{ height: `${Math.max(3, (m.count / max) * 40)}px` }} />
            <span className="text-[11px] text-muted-foreground">{m.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
