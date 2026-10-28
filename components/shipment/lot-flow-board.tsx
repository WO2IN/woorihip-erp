'use client'

import { useState } from 'react'
import { ArrowRight, CheckCircle2, ChevronDown, Hammer, Inbox, PackageCheck, Plus, TriangleAlert, Truck, Undo2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import {
  compactDate,
  displayDate,
  formatQuantity,
  type FlowLot,
  type FlowStage,
  type LotFlow,
  type StockMovement,
  type UnregisteredOutbound,
  type WorkStage,
} from '@/lib/stock'

const STAGES: { key: FlowStage; label: string; hint: string; icon: typeof Inbox; tone: string; dot: string }[] = [
  { key: 'waiting', label: '입고 대기', hint: '고객 소재가 들어와 작업을 기다리는 중', icon: Inbox, tone: 'text-sky-700 bg-sky-50 ring-sky-200 dark:text-sky-300 dark:bg-sky-950/40 dark:ring-sky-900', dot: 'bg-sky-500' },
  { key: 'working', label: '작업 중', hint: '도금 작업 진행 중이거나 일부만 출고됨', icon: Hammer, tone: 'text-amber-700 bg-amber-50 ring-amber-200 dark:text-amber-300 dark:bg-amber-950/40 dark:ring-amber-900', dot: 'bg-amber-500' },
  { key: 'ready', label: '출고 대기', hint: '작업이 끝나 성적서·출고를 기다리는 중', icon: PackageCheck, tone: 'text-violet-700 bg-violet-50 ring-violet-200 dark:text-violet-300 dark:bg-violet-950/40 dark:ring-violet-900', dot: 'bg-violet-500' },
  { key: 'done', label: '출고 완료', hint: '성적서 출고로 입고 수량이 모두 나감', icon: Truck, tone: 'text-emerald-700 bg-emerald-50 ring-emerald-200 dark:text-emerald-300 dark:bg-emerald-950/40 dark:ring-emerald-900', dot: 'bg-emerald-500' },
]

const DONE_DAYS = 30

function daysSince(compact: string) {
  if (compact.length !== 8) return null
  const date = new Date(Number(compact.slice(0, 4)), Number(compact.slice(4, 6)) - 1, Number(compact.slice(6, 8)))
  return Math.floor((Date.now() - date.getTime()) / 86_400_000)
}

export function LotFlowBoard({
  loading,
  flow,
  query,
  startDate,
  endDate,
  editable,
  editFloor,
  onStage,
  onOpen,
  onRegister,
}: {
  loading: boolean
  flow: LotFlow
  query: string
  startDate: string
  endDate: string
  editable: boolean
  editFloor: 1 | 2 | 3 | null
  onStage: (lot: FlowLot, stage: WorkStage | null) => void
  onOpen: (movement: StockMovement) => void
  onRegister: (item: UnregisteredOutbound) => void
}) {
  const canEdit = (floor: string) => editable && (editFloor == null || String(editFloor) === floor)
  const [mobileStage, setMobileStage] = useState<FlowStage>('waiting')
  const [showUnregistered, setShowUnregistered] = useState(false)

  const keyword = query.trim().toLocaleLowerCase('ko-KR')
  const start = startDate ? compactDate(startDate) : ''
  const end = endDate ? compactDate(endDate) : ''
  const visible = flow.lots.filter((lot) => {
    const text = [lot.inbound.company, lot.inbound.product, lot.inbound.lot].join(' ').toLocaleLowerCase('ko-KR')
    if (keyword && !text.includes(keyword)) return false
    if (lot.stage !== 'done') return true
    const date = lot.lastShipDate || lot.inbound.issueDate
    if (start || end) return (!start || date >= start) && (!end || date <= end)
    const days = daysSince(date)
    return days == null || days <= DONE_DAYS
  })
  const unregistered = flow.unregistered.filter((item) =>
    !keyword || `${item.company} ${item.product}`.toLocaleLowerCase('ko-KR').includes(keyword),
  )
  const byStage = (stage: FlowStage) => visible.filter((lot) => lot.stage === stage)

  if (loading) {
    return (
      <div className="grid gap-3 lg:grid-cols-4">
        {STAGES.map((stage) => <Skeleton key={stage.key} className="h-72 rounded-2xl" />)}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {unregistered.length > 0 && (
        <section className="overflow-hidden rounded-xl border border-amber-200 bg-amber-50/60 dark:border-amber-900 dark:bg-amber-950/20">
          <button
            type="button"
            onClick={() => setShowUnregistered((value) => !value)}
            className="flex w-full items-center gap-2 px-4 py-2 text-left"
          >
            <TriangleAlert className="size-4 shrink-0 text-amber-600" />
            <span className="min-w-0 flex-1 truncate text-sm font-semibold text-amber-900 dark:text-amber-200">
              입고 기록 없이 출고된 품목 {unregistered.length}종 · 출고 {unregistered.reduce((sum, item) => sum + item.count, 0)}건
            </span>
            <span className="shrink-0 text-xs font-medium text-amber-700 dark:text-amber-300">{showUnregistered ? '접기' : '목록 보기'}</span>
            <ChevronDown className={cn('size-4 shrink-0 text-amber-700 transition-transform', showUnregistered && 'rotate-180')} />
          </button>
          {showUnregistered && (
            <p className="border-t border-amber-200 px-4 py-2 text-xs text-amber-800/90 dark:border-amber-900 dark:text-amber-300/80">
              고객 소재 입고를 등록하지 않았거나, 입고 수량보다 많이 출고된 경우입니다. 재고 부족이 아니라 입고 기록이 빠진 것입니다.
            </p>
          )}
          {showUnregistered && (
            <ul className="max-h-80 divide-y divide-amber-200/70 overflow-y-auto border-t border-amber-200 bg-card dark:divide-amber-900/50 dark:border-amber-900">
              {unregistered.map((item) => (
                <li key={item.key} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{item.company} · {item.product}</span>
                    <span className="block text-xs text-muted-foreground">
                      {item.floor ? `${item.floor}층 · ` : ''}출고 {item.count}건 · {formatQuantity(item.quantity, item.unit)} · 최근 {displayDate(item.lastDate)}
                    </span>
                  </span>
                  {canEdit(item.floor) && (
                    <Button size="sm" variant="outline" onClick={() => onRegister(item)}>
                      <Plus className="mr-1 h-3.5 w-3.5" /> 입고 등록
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <div className="grid grid-cols-4 gap-1 rounded-xl border bg-muted/50 p-1 lg:hidden">
        {STAGES.map((stage) => (
          <button
            key={stage.key}
            type="button"
            onClick={() => setMobileStage(stage.key)}
            className={cn(
              'rounded-lg px-1 py-2 text-xs font-semibold',
              mobileStage === stage.key ? 'bg-card text-foreground shadow-sm ring-1 ring-border' : 'text-muted-foreground',
            )}
          >
            {stage.label}
            <span className="ml-1 tabular-nums text-muted-foreground">{byStage(stage.key).length}</span>
          </button>
        ))}
      </div>

      <div className="grid gap-3 lg:grid-cols-4">
        {STAGES.map((stage) => {
          const lots = byStage(stage.key)
          const Icon = stage.icon
          return (
            <section
              key={stage.key}
              className={cn('flex min-h-0 flex-col rounded-2xl border bg-muted/30', mobileStage !== stage.key && 'hidden lg:flex')}
            >
              <header className="flex items-center gap-2 border-b px-4 py-3">
                <span className={cn('flex size-8 items-center justify-center rounded-lg ring-1', stage.tone)}>
                  <Icon className="size-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-bold">{stage.label}</span>
                  <span className="block truncate text-[11px] text-muted-foreground">
                    {stage.key === 'done' && !start && !end ? `최근 ${DONE_DAYS}일 · ` : ''}{stage.hint}
                  </span>
                </span>
                <span className="rounded-full bg-card px-2 py-0.5 text-xs font-semibold tabular-nums ring-1 ring-border">{lots.length}</span>
              </header>
              <div className="flex max-h-[min(70vh,44rem)] flex-col gap-2 overflow-y-auto p-2">
                {lots.length === 0 ? (
                  <p className="px-2 py-8 text-center text-xs text-muted-foreground">해당하는 소재가 없습니다.</p>
                ) : (
                  lots.map((lot) => (
                    <LotCard key={lot.inbound.id} lot={lot} dot={stage.dot} editable={canEdit(lot.inbound.floor)} onStage={onStage} onOpen={onOpen} />
                  ))
                )}
              </div>
            </section>
          )
        })}
      </div>
    </div>
  )
}

function LotCard({
  lot,
  dot,
  editable,
  onStage,
  onOpen,
}: {
  lot: FlowLot
  dot: string
  editable: boolean
  onStage: (lot: FlowLot, stage: WorkStage | null) => void
  onOpen: (movement: StockMovement) => void
}) {
  const { inbound } = lot
  const pct = inbound.quantity > 0 ? Math.min(100, (lot.shipped / inbound.quantity) * 100) : 0
  const age = daysSince(inbound.issueDate)
  const partial = lot.shipped > 0 && lot.stage !== 'done'

  return (
    <article className="rounded-xl border bg-card p-3 shadow-sm transition-shadow hover:shadow-md">
      <button type="button" onClick={() => onOpen(inbound)} className="block w-full text-left">
        <div className="flex items-start gap-2">
          <span className={cn('mt-1.5 size-2 shrink-0 rounded-full', dot)} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{inbound.product}</p>
            <p className="truncate text-xs text-muted-foreground">
              {inbound.company}{inbound.floor ? ` · ${inbound.floor}층` : ''}{inbound.lot ? ` · ${inbound.lot}` : ''}
            </p>
          </div>
        </div>
        <div className="mt-2.5 flex items-baseline justify-between gap-2 text-xs">
          <span className="text-muted-foreground">
            입고 {displayDate(inbound.issueDate)}
            {lot.stage !== 'done' && age != null && age > 0 && <span className={cn('ml-1', age > 14 && 'font-semibold text-rose-600')}>· {age}일째</span>}
          </span>
          <span className="font-semibold tabular-nums">{formatQuantity(inbound.quantity, inbound.unit)}</span>
        </div>
        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
          <div className={cn('h-full rounded-full', lot.stage === 'done' ? 'bg-emerald-500' : 'bg-amber-500')} style={{ width: `${pct}%` }} />
        </div>
        <p className="mt-1 text-[11px] text-muted-foreground tabular-nums">
          {lot.stage === 'done'
            ? `출고 완료 · 마지막 출고 ${displayDate(lot.lastShipDate)}`
            : `출고 ${formatQuantity(lot.shipped, inbound.unit)} · 남은 ${formatQuantity(lot.remaining, inbound.unit)}${partial ? ' (부분 출고)' : ''}`}
        </p>
      </button>
      {editable && lot.stage !== 'done' && (
        <div className="mt-2.5 flex gap-1.5 border-t pt-2.5">
          {lot.stage === 'waiting' && (
            <Button size="sm" className="h-8 flex-1" onClick={() => onStage(lot, 'working')}>
              작업 시작 <ArrowRight className="ml-1 h-3.5 w-3.5" />
            </Button>
          )}
          {lot.stage === 'working' && (
            <>
              {!partial && (
                <Button size="sm" variant="ghost" className="h-8 px-2" aria-label="입고 대기로 되돌리기" onClick={() => onStage(lot, null)}>
                  <Undo2 className="h-3.5 w-3.5" />
                </Button>
              )}
              <Button size="sm" className="h-8 flex-1" onClick={() => onStage(lot, 'ready')}>
                작업 완료 <CheckCircle2 className="ml-1 h-3.5 w-3.5" />
              </Button>
            </>
          )}
          {lot.stage === 'ready' && (
            <Button size="sm" variant="outline" className="h-8 flex-1" onClick={() => onStage(lot, 'working')}>
              <Undo2 className="mr-1 h-3.5 w-3.5" /> 작업 중으로
            </Button>
          )}
        </div>
      )}
    </article>
  )
}
