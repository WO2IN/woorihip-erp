'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { ArrowDownLeft, ArrowLeft, ArrowUpRight, ClipboardCheck, ClipboardList, FileText, History, Package, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { certificatesFor, lotText } from '@/lib/lot-link'
import { ProcessAnswer, ProcessCheckRecord, ProcessFieldSpec, ProcessTemplate, isOutOfRange, recordFloor, recordLineId, sectionsOf } from '@/lib/process-checklist'
import { compactDate, displayDate, inboundBatches, StockMovement } from '@/lib/stock'
import { Floor3WorkLog } from '@/lib/floor3-work-log'
import { DocumentMetadata } from '@/lib/types'

/** 출고일 이전 작업을 그 출고에 붙인다. 같은 날 출고가 여러 건이면 앞 출고부터 수량을 채운다. */
function workBesideOutbounds(rows: StockMovement[], logs: Floor3WorkLog[], company: string, product: string, unit: string, floor: string) {
  const relevant = logs
    .filter((log) => log.company === company && log.product === product && String(log.floor ?? 3) === floor && (log.unit || 'EA') === (unit || 'EA'))
    .sort((a, b) => compactDate(a.workDate).localeCompare(compactDate(b.workDate)) || a.id.localeCompare(b.id))
  const outbounds = inboundBatches(rows).flatMap((item) => item.rows.filter((row) => row.kind === '출고'))
  const notes = new Map<string, Floor3WorkLog[]>()
  let cursor = 0
  outbounds.forEach((outbound, outboundIndex) => {
    const end = compactDate(outbound.issueDate)
    const previous = outboundIndex === 0 ? '' : compactDate(outbounds[outboundIndex - 1].issueDate)
    const next = outbounds[outboundIndex + 1]
    const sameDayNext = Boolean(next && compactDate(next.issueDate) === end)
    if (previous !== end) {
      while (cursor < relevant.length && compactDate(relevant[cursor].workDate) <= previous) cursor += 1
    }
    const chosen: Floor3WorkLog[] = []
    let sum = 0
    while (cursor < relevant.length && compactDate(relevant[cursor].workDate) <= end) {
      if (sameDayNext && sum >= outbound.quantity - 1e-6) break
      chosen.push(relevant[cursor])
      sum += relevant[cursor].workQuantity
      cursor += 1
      if (sameDayNext && sum >= outbound.quantity - 1e-6) break
    }
    notes.set(`${outbound.source}-${outbound.id}`, chosen)
  })
  return notes
}

/** 출고가 없는 입고분에 붙일 작업일보. 같은 업체·품목·층·단위를 입고가 오래된 순으로 채운다. */
function logsForLot(inbound: StockMovement, movements: StockMovement[], logs: Floor3WorkLog[]) {
  const lots = movements
    .filter((row) => row.kind === '입고' && row.company === inbound.company && row.product === inbound.product && row.floor === inbound.floor && (row.unit || 'EA') === (inbound.unit || 'EA'))
    .sort((a, b) => compactDate(a.issueDate).localeCompare(compactDate(b.issueDate)) || a.id.localeCompare(b.id))
  const relevant = logs
    .filter((log) => log.company === inbound.company && log.product === inbound.product && String(log.floor ?? 3) === String(inbound.floor) && (log.unit || 'EA') === (inbound.unit || 'EA'))
    .sort((a, b) => compactDate(a.workDate).localeCompare(compactDate(b.workDate)) || a.id.localeCompare(b.id))
  const buckets = new Map<string, Floor3WorkLog[]>()
  let index = 0
  let filled = 0
  for (const log of relevant) {
    while (index < lots.length && filled >= lots[index].quantity - QTY_EPS) {
      index += 1
      filled = 0
    }
    if (index >= lots.length) break
    const key = movementKey(lots[index])
    const list = buckets.get(key) ?? []
    list.push(log)
    buckets.set(key, list)
    filled = roundQty(filled + (log.workQuantity || 0))
  }
  return buckets.get(movementKey(inbound)) ?? []
}

const QTY_EPS = 0.0001

function roundQty(value: number) {
  return Math.round(value * 1000) / 1000
}

function movementKey(row: StockMovement) {
  return `${row.source}-${row.id}`
}

interface AppliedRow {
  movement: StockMovement
  /** 이 입고분에서 실제로 빠진 수량. 소진을 넘긴 출고는 양쪽 입고에 나뉘어 담긴다. */
  applied: number
}

interface ReceiptView {
  key: string
  inbound: StockMovement | null
  rows: AppliedRow[]
}

interface OpenReceipt {
  inbound: StockMovement
  remaining: number
  rows: AppliedRow[]
  seen: Set<string>
}

/** 입고일 이후 출고를 선입선출로 소진한다. 수량을 넘겨 다음 입고로 이어진 출고는 양쪽 이력에 넣는다. */
function receiptViews(movements: StockMovement[]): { lots: ReceiptView[]; before: ReceiptView; uncovered: ReceiptView } {
  const sorted = [...movements].sort((left, right) => left.issueDate.localeCompare(right.issueDate) || left.kind.localeCompare(right.kind, 'ko'))
  const lots: OpenReceipt[] = []
  const queue: OpenReceipt[] = []
  const before: AppliedRow[] = []
  const uncovered: AppliedRow[] = []
  let seenInbound = false

  for (const movement of sorted) {
    if (movement.kind === '입고') {
      const lot: OpenReceipt = {
        inbound: movement,
        remaining: movement.quantity,
        rows: [{ movement, applied: movement.quantity }],
        seen: new Set([movementKey(movement)]),
      }
      lots.push(lot)
      queue.push(lot)
      seenInbound = true
      continue
    }

    if (queue.length === 0) {
      const bucket = seenInbound ? uncovered : before
      bucket.push({ movement, applied: movement.quantity })
      continue
    }

    let left = movement.quantity
    while (left > QTY_EPS && queue.length > 0) {
      const lot = queue[0]
      const use = Math.min(lot.remaining, left)
      const key = movementKey(movement)
      if (!lot.seen.has(key)) {
        lot.rows.push({ movement, applied: 0 })
        lot.seen.add(key)
      }
      const entry = lot.rows.find((row) => movementKey(row.movement) === key)
      if (entry) entry.applied = roundQty(entry.applied + use)
      lot.remaining = roundQty(lot.remaining - use)
      left = roundQty(left - use)
      if (lot.remaining <= QTY_EPS) queue.shift()
    }
    if (left > QTY_EPS) uncovered.push({ movement, applied: left })
  }

  return {
    lots: lots.map((lot) => ({ key: movementKey(lot.inbound), inbound: lot.inbound, rows: lot.rows })),
    before: { key: 'unknown', inbound: null, rows: before },
    uncovered: { key: 'uncovered', inbound: null, rows: uncovered },
  }
}

function receiptWindow(anchor: StockMovement, movements: StockMovement[]): ReceiptView {
  const same = movements.filter((row) => row.company === anchor.company && row.product === anchor.product && row.floor === anchor.floor && row.unit === anchor.unit)
  const views = receiptViews(same)
  const anchorKey = movementKey(anchor)
  if (anchor.kind === '입고') {
    return views.lots.find((lot) => lot.inbound && movementKey(lot.inbound) === anchorKey)
      ?? { key: anchorKey, inbound: anchor, rows: [{ movement: anchor, applied: anchor.quantity }] }
  }
  const hits = views.lots.filter((lot) => lot.rows.some((row) => movementKey(row.movement) === anchorKey))
  if (hits.length > 0) return hits[hits.length - 1]
  if (views.uncovered.rows.some((row) => movementKey(row.movement) === anchorKey)) return views.uncovered
  if (views.before.rows.some((row) => movementKey(row.movement) === anchorKey)) return views.before
  return { key: anchorKey, inbound: null, rows: [{ movement: anchor, applied: anchor.quantity }] }
}

const rowGrid = 'grid grid-cols-[minmax(6.5rem,1.1fr)_4.75rem_minmax(5.5rem,1fr)_4.5rem_minmax(7.5rem,1.2fr)_minmax(6.5rem,1fr)] items-center gap-x-3'

interface HistoryItem {
  row: StockMovement
  applied: number
  remain: number
  logs: Floor3WorkLog[]
  certificates: DocumentMetadata[]
}

export function LotDetailPanel({
  anchor,
  movements,
  documents,
  checks,
  templates,
  workLogs = [],
  onClose,
  onPreview,
}: {
  anchor: StockMovement
  movements: StockMovement[]
  documents: DocumentMetadata[]
  checks: ProcessCheckRecord[]
  templates: ProcessTemplate[]
  workLogs?: Floor3WorkLog[]
  onClose: () => void
  onPreview: (doc: DocumentMetadata) => void
}) {
  const batch = receiptWindow(anchor, movements)
  const inbound = batch.inbound
  const floor = Number(anchor.floor)
  const incoming = inbound?.quantity ?? 0
  const outgoing = roundQty(batch.rows.filter((row) => row.movement.kind === '출고').reduce((sum, row) => sum + row.applied, 0))
  const remain = roundQty(incoming - outgoing)
  const lot = lotText(inbound?.lot)
  const sameItem = movements.filter(
    (row) => row.company === anchor.company && row.product === anchor.product && row.floor === anchor.floor && row.unit === anchor.unit,
  )
  const workNotes = workBesideOutbounds(sameItem, workLogs, anchor.company, anchor.product, anchor.unit, anchor.floor)
  const hasOutbound = batch.rows.some((row) => row.movement.kind === '출고')
  const pendingLogs = inbound && !hasOutbound ? logsForLot(inbound, movements, workLogs) : []
  const history: HistoryItem[] = []
  let running = inbound?.quantity ?? 0
  for (const entry of batch.rows) {
    const row = entry.movement
    if (row.kind === '출고') running = roundQty(running - entry.applied)
    else running = row.quantity
    const logs = row.kind === '출고'
      ? workNotes.get(`${row.source}-${row.id}`) ?? []
      : pendingLogs.length > 0 && inbound && movementKey(row) === movementKey(inbound)
        ? pendingLogs
        : []
    const certificates = row.kind === '출고'
      ? certificatesFor(row, movements, documents).filter((doc) => doc.storagePath && doc.storagePath !== 'INVENTORY' && doc.filename !== '수기입력')
      : []
    history.push({ row, applied: row.kind === '출고' ? entry.applied : row.quantity, remain: running, logs, certificates })
  }
  const [order, setOrder] = useState<'old' | 'new'>('old')
  const inboundKey = inbound ? movementKey(inbound) : ''
  const pendingKey = pendingLogs.map((log) => log.id).join(',')
  const openScope = `${anchor.source}-${anchor.id}:${pendingKey}`
  const [expandedScope, setExpandedScope] = useState(openScope)
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(pendingKey && inboundKey ? [inboundKey] : []))
  if (expandedScope !== openScope) {
    setExpandedScope(openScope)
    setExpanded(new Set(pendingKey && inboundKey ? [inboundKey] : []))
  }
  const [openChecks, setOpenChecks] = useState<ProcessCheckRecord[]>([])
  const checksOnDate = (date: string) => {
    if (floor !== 1 && floor !== 2 && floor !== 3) return []
    const key = compactDate(date)
    return checks
      .filter((record) => {
        if (recordFloor(record) !== floor || compactDate(record.writtenDate) !== key) return false
        if (record.product && record.product !== anchor.product) return false
        if (record.company && record.company !== anchor.company) return false
        return true
      })
      .sort((a, b) => a.writtenTime.localeCompare(b.writtenTime))
  }
  const templateName = (record: ProcessCheckRecord) =>
    templates.find((item) => item.id === recordLineId(record))?.name || '공정 점검'
  const visible = order === 'new' ? [...history].reverse() : history
  const toggle = (key: string) =>
    setExpanded((current) => {
      const next = new Set(current)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  const stockRatio = incoming > 0 ? Math.min(100, Math.max(0, (remain / incoming) * 100)) : 0

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (openChecks.length > 0) {
        setOpenChecks([])
        return
      }
      onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, openChecks.length])

  const heading = inbound ? '입고분' : batch.key === 'uncovered' ? '입고 수량을 넘는 출고' : '입고 전 출고'
  const subtitle = inbound
    ? [displayDate(inbound.issueDate), anchor.floor ? `${anchor.floor}층` : '', lot ? `로트 ${lot}` : ''].filter(Boolean).join(' · ')
    : batch.key === 'uncovered'
      ? '앞선 입고 수량을 모두 소진한 뒤의 출고입니다.'
      : '이 출고들은 아직 입고 수량에 연결되지 않았습니다.'

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4"
      onClick={() => {
        if (openChecks.length > 0) {
          setOpenChecks([])
          return
        }
        onClose()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="lot-detail-title"
        className="flex max-h-[92vh] w-full max-w-[1180px] flex-col overflow-hidden rounded-2xl bg-[oklch(0.975_0.004_250)] text-foreground shadow-[0_8px_40px_oklch(0_0_0/0.18)] dark:bg-background"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 px-6 pt-6 pb-2">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">{heading}</p>
            <h2 id="lot-detail-title" className="mt-1 truncate text-2xl font-bold tracking-tight">
              {anchor.company} · {anchor.product}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={onClose}>
              <ArrowLeft className="h-3.5 w-3.5" />
              목록으로
            </Button>
            <Button type="button" variant="ghost" size="icon-sm" onClick={onClose} aria-label="닫기">
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="grid min-h-0 flex-1 gap-4 overflow-hidden px-6 pt-4 pb-6 lg:grid-cols-[minmax(0,1fr)_280px]">
          <div className="flex min-h-0 min-w-0 flex-col gap-4">
          <div className="grid shrink-0 grid-cols-3 gap-3">
            <Summary icon={ArrowDownLeft} label="입고" value={incoming} unit={anchor.unit} tone="blue" />
            <Summary icon={ArrowUpRight} label="출고" value={outgoing} unit={anchor.unit} tone="orange" />
            <Summary icon={Package} label="남음" value={remain} unit={anchor.unit} tone={remain < 0 ? 'danger' : 'emerald'} />
          </div>
          <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-slate-300 bg-card shadow-[0_1px_3px_oklch(0_0_0/0.06)] dark:border-border">
            <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-3.5 dark:border-border">
              <div className="flex min-w-0 items-center gap-2">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                  <History className="h-3.5 w-3.5" />
                </span>
                <h3 className="shrink-0 text-sm font-semibold">입출고 이력</h3>
                <p className="truncate text-xs text-muted-foreground">LOT별 입출고 내역과 재고 변동을 확인할 수 있습니다.</p>
              </div>
              <div className="flex shrink-0 rounded-lg bg-slate-100 p-0.5 dark:bg-muted" role="group" aria-label="정렬">
                {([['old', '과거순'], ['new', '최신순']] as const).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={order === value}
                    onClick={() => setOrder(value)}
                    className={cn(
                      'h-7 rounded-md px-3 text-xs font-semibold transition-colors',
                      order === value ? 'bg-card text-foreground shadow-sm ring-1 ring-slate-200 dark:ring-border' : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
              {visible.length === 0 ? (
                <p className="px-2 py-10 text-center text-sm text-muted-foreground">표시할 입출고가 없습니다.</p>
              ) : (
                <ol className="relative space-y-3">
                  <span className="absolute top-7 bottom-7 left-[11px] w-px bg-slate-200 dark:bg-border" aria-hidden="true" />
                  {visible.map((item) => {
                    const key = `${item.row.source}-${item.row.id}`
                    const open = expanded.has(key)
                    const inboundRow = item.row.kind === '입고'
                    const canOpen = item.logs.length > 0
                    const selected = item.row.source === anchor.source && item.row.id === anchor.id
                    const defectSum = item.logs.reduce((sum, log) => sum + log.defectQuantity, 0)
                    const sampleSum = item.logs.reduce((sum, log) => sum + log.sampleQuantity, 0)
                    return (
                      <li key={key} className="relative pl-8">
                        <span
                          className={cn(
                            'absolute top-6 left-[5px] size-3 rounded-full ring-4 ring-card',
                            inboundRow ? 'bg-blue-500' : 'bg-orange-400',
                          )}
                          aria-hidden="true"
                        />
                        <article className={cn('overflow-hidden rounded-2xl border border-slate-300 bg-card shadow-[0_1px_2px_oklch(0_0_0/0.05)] dark:border-border', selected && 'border-primary/50 ring-1 ring-primary/25')}>
                          <div
                            role={canOpen ? 'button' : undefined}
                            tabIndex={canOpen ? 0 : undefined}
                            aria-expanded={canOpen ? open : undefined}
                            className={cn(rowGrid, 'px-4 py-3.5', canOpen && 'cursor-pointer hover:bg-muted/30')}
                            onClick={() => canOpen && toggle(key)}
                            onKeyDown={(event) => {
                              if (!canOpen) return
                              if (event.key === 'Enter' || event.key === ' ') {
                                event.preventDefault()
                                toggle(key)
                              }
                            }}
                          >
                            <div className="flex items-center gap-2">
                              {item.certificates[0] ? (
                                <button
                                  type="button"
                                  aria-label="성적서 보기"
                                  title={item.certificates.length > 1 ? `성적서 ${item.certificates.length}건` : '성적서 보기'}
                                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-300 bg-card text-blue-600 shadow-sm hover:bg-blue-50 dark:border-border dark:hover:bg-blue-950/40"
                                  onClick={(event) => {
                                    event.stopPropagation()
                                    onPreview(item.certificates[0])
                                  }}
                                >
                                  <FileText className="h-4 w-4" />
                                </button>
                              ) : (
                                <span className="h-8 w-8 shrink-0" aria-hidden="true" />
                              )}
                              <div>
                                <p className="text-sm font-semibold tabular-nums">{displayDate(item.row.issueDate)}</p>
                                <p className="mt-0.5 text-xs text-muted-foreground">{item.row.kind}</p>
                              </div>
                            </div>
                            <KindBadge kind={item.row.kind} />
                            <Metric label="수량">
                              <Qty value={item.applied} unit={item.row.unit} strong />
                            </Metric>
                            <Metric label="처리 기간">
                              <span className="text-sm font-semibold tabular-nums">{item.logs.length > 0 ? `${item.logs.length}일` : '-'}</span>
                            </Metric>
                            <Metric label="불량 / 시료">
                              {item.logs.length > 0 ? (
                                <span className="flex flex-wrap gap-1">
                                  <LossChip label="불량" value={defectSum} tone="danger" />
                                  <LossChip label="시료" value={sampleSum} tone="neutral" />
                                </span>
                              ) : (
                                <span className="text-sm text-muted-foreground">- / -</span>
                              )}
                            </Metric>
                            <RemainBox value={item.remain} unit={item.row.unit} />
                          </div>
                          {open && item.logs.length > 0 && (
                            <div className="mx-4 mb-4 rounded-xl bg-slate-50 px-3 py-3 dark:bg-muted/40">
                              <p className="px-1 text-xs font-medium text-muted-foreground">작업일자</p>
                              <ul className="relative mt-1">
                                {item.logs.length > 1 && (
                                  <span className="absolute top-4 bottom-4 left-[4px] w-px bg-orange-200 dark:bg-orange-900" aria-hidden="true" />
                                )}
                                {item.logs.map((log) => {
                                  const dayChecks = checksOnDate(log.workDate)
                                  return (
                                    <li key={log.id} className="flex items-center gap-3 py-2">
                                      <span className="flex min-w-[9.5rem] items-center gap-2.5 text-sm font-medium tabular-nums">
                                        <span className="relative z-10 size-2.5 shrink-0 rounded-full bg-orange-400 ring-4 ring-slate-50 dark:ring-muted" aria-hidden="true" />
                                        {displayDate(log.workDate)}
                                      </span>
                                      <span className="text-sm font-semibold tabular-nums">
                                        작업 {countText(log.workQuantity)}
                                        {log.unit ? <span className="ml-1 text-xs font-medium text-muted-foreground">{log.unit}</span> : null}
                                      </span>
                                      <LossChip label="불량" value={log.defectQuantity} tone="danger" />
                                      <LossChip label="검사시료" value={log.sampleQuantity} tone="neutral" />
                                      {dayChecks.length > 0 && (
                                        <button
                                          type="button"
                                          className="ml-auto inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-card px-2.5 py-1 text-xs font-semibold text-foreground shadow-sm hover:bg-muted dark:border-border"
                                          onClick={() => setOpenChecks(dayChecks)}
                                        >
                                          <ClipboardCheck className="h-3.5 w-3.5" />
                                          공정검사
                                        </button>
                                      )}
                                    </li>
                                  )
                                })}
                              </ul>
                            </div>
                          )}
                        </article>
                      </li>
                    )
                  })}
                </ol>
              )}
            </div>
          </section>
          </div>

          <aside className="min-h-0 overflow-y-auto rounded-2xl border border-slate-300 bg-card shadow-[0_1px_3px_oklch(0_0_0/0.06)] dark:border-border">
            <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-3.5 dark:border-border">
              <ClipboardList className="h-4 w-4 text-muted-foreground" />
              <h3 className="text-sm font-semibold">LOT 요약</h3>
            </div>
            <div className="space-y-5 px-4 py-4">
              <section>
                <h4 className="text-xs font-semibold text-muted-foreground">재고 현황</h4>
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
                  <div className={cn('h-full rounded-full', remain < 0 ? 'bg-destructive' : 'bg-emerald-500')} style={{ width: `${stockRatio}%` }} />
                </div>
                <dl className="mt-3 space-y-1.5">
                  <SideRow label="남은 수량" value={countText(remain)} unit={anchor.unit} tone={remain < 0 ? 'danger' : 'emerald'} />
                  <SideRow label="총 입고 수량" value={countText(incoming)} unit={anchor.unit} />
                  <SideRow label="총 출고 수량" value={countText(outgoing)} unit={anchor.unit} />
                </dl>
              </section>
              <section className="border-t border-slate-200 pt-4 dark:border-border">
                <h4 className="text-xs font-semibold text-muted-foreground">검사 현황</h4>
                <dl className="mt-2 space-y-1.5">
                  <SideRow label="검사 LOT" value="-" unit="LOT" />
                  <SideRow label="불량 LOT" value="-" unit="LOT" />
                  <SideRow label="불량률" value="-" unit="%" />
                </dl>
              </section>
              <section className="border-t border-slate-200 pt-4 dark:border-border">
                <h4 className="text-xs font-semibold text-muted-foreground">기타 정보</h4>
                <dl className="mt-2 space-y-1.5">
                  <SideRow label="구분" value={heading} />
                  <SideRow label="품목" value={`${anchor.company} · ${anchor.product}`} />
                  <SideRow label="입고일" value={inbound ? displayDate(inbound.issueDate) : '-'} />
                  <SideRow label="보관 위치" value={anchor.floor ? `${anchor.floor}층` : '-'} />
                </dl>
              </section>
            </div>
          </aside>
        </div>
      </div>
      {openChecks.length > 0 && (
        <ProcessCheckSnapshot
          records={openChecks}
          templates={templates}
          titleFor={templateName}
          onClose={() => setOpenChecks([])}
        />
      )}
    </div>
  )
}

function RemainBox({ value, unit }: { value: number; unit?: string }) {
  const danger = value < 0
  return (
    <div className={cn('rounded-xl px-3 py-2 text-right', danger ? 'bg-destructive/10' : 'bg-emerald-50 dark:bg-emerald-950/40')}>
      <p className={cn('text-[11px]', danger ? 'text-destructive' : 'text-emerald-700/70 dark:text-emerald-300/80')}>남은 수량</p>
      <p className={cn('mt-0.5 text-base font-bold leading-none tabular-nums', danger ? 'text-destructive' : 'text-emerald-600 dark:text-emerald-300')}>
        {countText(value)}
        {unit ? <span className="ml-1 text-xs font-medium">{unit}</span> : null}
      </p>
    </div>
  )
}

function Metric({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <div className="mt-1">{children}</div>
    </div>
  )
}

function SideRow({ label, value, unit, tone }: { label: string; value: string; unit?: string; tone?: 'emerald' | 'danger' }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <dt className="shrink-0 whitespace-nowrap text-muted-foreground">{label}</dt>
      <dd className={cn('min-w-0 text-right font-semibold tabular-nums', tone === 'emerald' && 'text-emerald-600 dark:text-emerald-300', tone === 'danger' && 'text-destructive')}>
        <span className="break-all">{value}</span>
        {unit ? <span className="ml-1 text-xs font-normal text-muted-foreground">{unit}</span> : null}
      </dd>
    </div>
  )
}

function LossChip({ label, value, tone }: { label: string; value: number; tone: 'danger' | 'neutral' }) {
  const color = tone === 'danger' && value > 0
    ? 'bg-rose-100 text-rose-600 dark:bg-rose-950/50 dark:text-rose-300'
    : 'bg-slate-100 text-slate-500 dark:bg-muted dark:text-muted-foreground'
  return (
    <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums', color)}>
      {label} {countText(value)}
    </span>
  )
}

function countText(value: number) {
  return Number.isFinite(value) ? value.toLocaleString('ko-KR', { maximumFractionDigits: 2 }) : '0'
}

function Qty({ value, unit, strong = false }: { value: number; unit?: string; strong?: boolean }) {
  return (
    <span className={cn('text-sm tabular-nums', strong && 'font-bold')}>
      {countText(value)}
      {unit ? <span className="ml-1 text-xs font-normal text-muted-foreground">{unit}</span> : null}
    </span>
  )
}

function KindBadge({ kind }: { kind: '입고' | '출고' }) {
  const inbound = kind === '입고'
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold',
        inbound
          ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300'
          : 'bg-orange-50 text-orange-600 dark:bg-orange-950/40 dark:text-orange-300',
      )}
    >
      {inbound ? <ArrowDownLeft className="h-3 w-3" /> : <ArrowUpRight className="h-3 w-3" />}
      {kind}
    </span>
  )
}

function Summary({
  icon: Icon,
  label,
  value,
  unit,
  tone,
}: {
  icon: typeof Package
  label: string
  value: number
  unit?: string
  tone: 'blue' | 'orange' | 'emerald' | 'danger'
}) {
  const card = {
    blue: 'border-blue-200 bg-[#eef4ff] dark:border-blue-900 dark:bg-blue-950/30',
    orange: 'border-orange-200 bg-[#fff5ee] dark:border-orange-900 dark:bg-orange-950/30',
    emerald: 'border-emerald-200 bg-[#eefbf3] dark:border-emerald-900 dark:bg-emerald-950/30',
    danger: 'border-destructive/30 bg-destructive/10',
  }[tone]
  const iconClass = {
    blue: 'bg-blue-500',
    orange: 'bg-orange-400',
    emerald: 'bg-emerald-500',
    danger: 'bg-destructive',
  }[tone]
  return (
    <div className={cn('rounded-2xl border px-5 py-4', card)}>
      <div className="flex items-center gap-2">
        <div className={cn('flex h-7 w-7 items-center justify-center rounded-full text-white', iconClass)}>
          <Icon className="h-3.5 w-3.5" />
        </div>
        <p className="text-sm text-muted-foreground">{label}</p>
      </div>
      <p className={cn('mt-3 text-[1.65rem] font-bold leading-none tabular-nums', tone === 'danger' && 'text-destructive')}>
        {countText(value)}
        {unit ? <span className="ml-1.5 text-sm font-medium text-muted-foreground">{unit}</span> : null}
      </p>
    </div>
  )
}

function ProcessCheckSnapshot({
  records,
  templates,
  titleFor,
  onClose,
}: {
  records: ProcessCheckRecord[]
  templates: ProcessTemplate[]
  titleFor: (record: ProcessCheckRecord) => string
  onClose: () => void
}) {
  const [index, setIndex] = useState(0)
  const record = records[Math.min(index, records.length - 1)]
  const template = templates.find((item) => item.id === recordLineId(record))
  const sections = template ? sectionsOf(template) : []
  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/40 p-4"
      onClick={(event) => {
        event.stopPropagation()
        onClose()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="process-check-snapshot-title"
        className="flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-slate-300 bg-background text-foreground shadow-[0_8px_40px_oklch(0_0_0/0.18)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 px-6 pt-6 pb-4">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">공정 점검</p>
            <h2 id="process-check-snapshot-title" className="mt-1 truncate text-2xl font-bold tracking-tight">{titleFor(record)}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {displayDate(record.writtenDate)} {record.writtenTime} · {record.author}
            </p>
          </div>
          <Button type="button" variant="ghost" size="icon-sm" onClick={onClose} aria-label="닫기">
            <X className="h-4 w-4" />
          </Button>
        </div>
        {records.length > 1 && (
          <div className="flex gap-2 overflow-x-auto px-6 pb-3">
            {records.map((item, itemIndex) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setIndex(itemIndex)}
                className={cn('shrink-0 rounded-full px-3 py-1 text-xs font-semibold', itemIndex === index ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground')}
              >
                {item.writtenTime}
              </button>
            ))}
          </div>
        )}
        <div className="space-y-4 overflow-y-auto px-6 pb-6">
          {sections.length === 0 ? (
            <p className="text-sm text-muted-foreground">점검 항목 구성을 찾지 못했습니다.</p>
          ) : sections.map((section) => (
            <section key={section.id} className="overflow-hidden rounded-2xl border border-slate-300 bg-card">
              <h3 className="border-b border-slate-200 px-5 py-3 text-sm font-semibold">{section.title}</h3>
              <ul className="divide-y divide-border">
                {section.fields.map((field) => {
                  const value = record.answers[field.id]
                  return (
                    <li key={field.id} className="flex items-start justify-between gap-4 px-5 py-3">
                      <p className="min-w-0 text-sm">{field.label}</p>
                      <p className={cn('shrink-0 text-sm font-semibold tabular-nums', answerTone(field, value))}>
                        {formatCheckAnswer(field, value)}
                      </p>
                    </li>
                  )
                })}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </div>
  )
}

function formatCheckAnswer(field: ProcessFieldSpec, value: ProcessAnswer | undefined) {
  if (value === '' || value == null) return '-'
  if (value === 'yes') return 'Yes'
  if (value === 'no') return 'No'
  return field.unit ? `${value} ${field.unit}` : String(value)
}

function answerTone(field: ProcessFieldSpec, value: ProcessAnswer | undefined) {
  if (value === 'yes') return 'text-emerald-600'
  if (value === 'no' || (value != null && isOutOfRange(field, value))) return 'text-destructive'
  return ''
}
