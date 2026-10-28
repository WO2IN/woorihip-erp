import { DocumentMetadata } from './types'
import { normalizeIssueDate } from './lot'

type InventoryLike = Pick<
  DocumentMetadata,
  'id' | 'company' | 'product' | 'floor' | 'quantity' | 'quantityUnit' | 'issueDate' | 'lotStart'
> & {
  defectQuantity?: number
  sampleQuantity?: number
  workStage?: WorkStage
}

export type StockKind = '입고' | '출고'
export type WorkStage = 'working' | 'ready'

export interface StockMovement {
  id: string
  kind: StockKind
  company: string
  product: string
  floor: string
  quantity: number
  unit: string
  issueDate: string
  lot: string
  source: 'inventory' | 'document'
  shipmentCategory?: string
  defect: number
  sample: number
  workStage?: WorkStage
}

export interface StockGroup {
  key: string
  company: string
  product: string
  floor: string
  unit: string
  opening: number
  incoming: number
  outgoing: number
  defect: number
  sample: number
  workQuantity: number
  /** 첫 입고 전에 쌓인 마이너스를 이후 재고 계산에서 빼지 않기 위한 보정 */
  balanceAdjust: number
  stock: number
  finalStock: number
  lastDate: string
  mixedUnits: boolean
}

export function compactDate(value?: string) {
  try {
    return normalizeIssueDate(value).replace(/-/g, '')
  } catch {
    return String(value ?? '').replace(/[^0-9]/g, '').slice(0, 8)
  }
}

export function displayDate(value?: string) {
  const key = compactDate(value)
  if (key.length !== 8) return value?.trim() || '-'
  return `${key.slice(0, 4)}.${key.slice(4, 6)}.${key.slice(6, 8)}`
}

export function displayLot(doc: { lotStart?: string; lotEnd?: string }) {
  if (doc.lotEnd && doc.lotEnd !== doc.lotStart) return `${doc.lotStart} ~ ${doc.lotEnd}`
  return doc.lotStart || '-'
}

export function formatQuantity(quantity: number, unit?: string) {
  if (!Number.isFinite(quantity)) return '-'
  const formatted = quantity.toLocaleString('ko-KR', { maximumFractionDigits: 2 })
  return unit ? `${formatted} ${unit}` : formatted
}

function asMovementFromInventory(record: InventoryLike): StockMovement | null {
  const quantity = Number(record.quantity ?? 0)
  if (!Number.isFinite(quantity)) return null
  return {
    id: record.id,
    kind: '입고',
    company: record.company?.trim() || '-',
    product: record.product?.trim() || '-',
    floor: String(record.floor || ''),
    quantity,
    unit: record.quantityUnit?.trim() || 'EA',
    issueDate: compactDate(record.issueDate),
    lot: record.lotStart || '',
    source: 'inventory',
    defect: nonNegative(record.defectQuantity),
    sample: nonNegative(record.sampleQuantity),
    workStage: record.workStage === 'working' || record.workStage === 'ready' ? record.workStage : undefined,
  }
}

function asMovementFromDocument(doc: DocumentMetadata): StockMovement | null {
  if (doc.documentType !== '성적서') return null
  if (doc.movementType === '입고' && doc.filename === '수기입력') return null
  if (doc.storagePath === 'INVENTORY') return null
  if (doc.linkedMovementId) return null
  const quantity = Number(doc.quantity ?? 0)
  if (!Number.isFinite(quantity)) return null
  return {
    id: doc.id,
    kind: doc.movementType === '입고' ? '입고' : '출고',
    company: doc.company?.trim() || '-',
    product: doc.product?.trim() || '-',
    floor: String(doc.floor ?? doc.shipmentFloor ?? ''),
    quantity,
    unit: doc.quantityUnit?.trim() || 'Kg',
    issueDate: compactDate(doc.issueDate),
    lot: displayLot(doc),
    source: 'document',
    shipmentCategory: doc.shipmentCategory,
    defect: 0,
    sample: 0,
  }
}

function nonNegative(value: unknown) {
  const number = Number(value ?? 0)
  return Number.isFinite(number) && number > 0 ? number : 0
}

export function collectMovements(
  documents: DocumentMetadata[],
  inventory: InventoryLike[],
): StockMovement[] {
  return [
    ...inventory.map(asMovementFromInventory),
    ...documents.map(asMovementFromDocument),
  ].filter((item): item is StockMovement => Boolean(item))
}

export function stockGroupKey(item: Pick<StockMovement, 'company' | 'product' | 'floor' | 'unit'>) {
  return [item.company, item.product, item.floor || '-', item.unit].join('\u0000')
}

export function buildStockGroups(
  movements: StockMovement[],
  startDate = '',
  endDate = '',
): StockGroup[] {
  const start = startDate ? compactDate(startDate) : ''
  const end = endDate ? compactDate(endDate) : ''
  const grouped = new Map<string, StockGroup>()
  const calcState = new Map<string, { seenInbound: boolean; running: number }>()
  const sorted = [...movements].sort((a, b) => {
    const byDate = a.issueDate.localeCompare(b.issueDate)
    if (byDate !== 0) return byDate
    return a.kind.localeCompare(b.kind, 'ko')
  })

  for (const movement of sorted) {
    const key = stockGroupKey(movement)
    const current = grouped.get(key) ?? {
      key,
      company: movement.company,
      product: movement.product,
      floor: movement.floor,
      unit: movement.unit,
      opening: 0,
      incoming: 0,
      outgoing: 0,
      defect: 0,
      sample: 0,
      workQuantity: 0,
      balanceAdjust: 0,
      stock: 0,
      finalStock: 0,
      lastDate: '',
      mixedUnits: false,
    }
    const calc = calcState.get(key) ?? { seenInbound: false, running: 0 }

    const beforeRange = Boolean(start && movement.issueDate && movement.issueDate < start)
    const afterRange = Boolean(end && movement.issueDate && movement.issueDate > end)
    if (afterRange) {
      grouped.set(key, current)
      continue
    }

    const signed = movement.kind === '입고' ? movement.quantity : -movement.quantity
    const floor3Deduction = movement.floor === '3' && movement.kind === '입고'
      ? movement.defect + movement.sample
      : 0
    if (movement.kind === '입고' && !calc.seenInbound) {
      if (beforeRange) current.opening = 0
      else current.balanceAdjust = roundQty(current.balanceAdjust - calc.running)
      calc.running = 0
      calc.seenInbound = true
    } else if (movement.kind === '입고') {
      calc.seenInbound = true
    }
    if (beforeRange) {
      current.opening += signed - floor3Deduction
      calc.running = roundQty(calc.running + signed - floor3Deduction)
    } else {
      if (movement.kind === '입고') current.incoming += movement.quantity
      else current.outgoing += movement.quantity
      if (movement.floor === '3' && movement.kind === '입고') {
        current.defect += movement.defect
        current.sample += movement.sample
      }
      if (movement.issueDate > current.lastDate) current.lastDate = movement.issueDate
      calc.running = roundQty(calc.running + signed)
    }
    grouped.set(key, current)
    calcState.set(key, calc)
  }

  return [...grouped.values()]
    .map((group) => {
      const stock = roundQty(group.opening + group.incoming - group.outgoing + group.balanceAdjust)
      return {
        ...group,
        stock,
        finalStock: roundQty(stock - group.defect - group.sample),
      }
    })
    .sort((a, b) =>
      `${a.company}${a.product}${a.floor}`.localeCompare(`${b.company}${b.product}${b.floor}`, 'ko'),
    )
}

export interface Floor3WorkLogInput {
  company: string
  product: string
  unit?: string
  workDate: string
  workQuantity?: number
  defectQuantity?: number
  sampleQuantity?: number
}

export function applyFloor3WorkLogs(
  groups: StockGroup[],
  logs: Floor3WorkLogInput[],
  startDate = '',
  endDate = '',
): StockGroup[] {
  const start = startDate ? compactDate(startDate) : ''
  const end = endDate ? compactDate(endDate) : ''
  const grouped = new Map(groups.map((group) => [group.key, { ...group, workQuantity: group.workQuantity || 0 }]))

  for (const log of logs) {
    const date = compactDate(log.workDate)
    if (end && date && date > end) continue
    const company = log.company?.trim() || '-'
    const product = log.product?.trim() || '-'
    const unit = log.unit?.trim() || 'EA'
    const key = stockGroupKey({ company, product, floor: '3', unit })
    const current = grouped.get(key) ?? {
      key,
      company,
      product,
      floor: '3',
      unit,
      opening: 0,
      incoming: 0,
      outgoing: 0,
      defect: 0,
      sample: 0,
      workQuantity: 0,
      balanceAdjust: 0,
      stock: 0,
      finalStock: 0,
      lastDate: '',
      mixedUnits: false,
    }
    const defect = nonNegative(log.defectQuantity)
    const sample = nonNegative(log.sampleQuantity)
    const beforeRange = Boolean(start && date && date < start)
    if (beforeRange) {
      current.opening -= defect + sample
    } else {
      current.defect += defect
      current.sample += sample
      current.workQuantity += nonNegative(log.workQuantity)
      if (date > current.lastDate) current.lastDate = date
    }
    grouped.set(key, current)
  }

  return [...grouped.values()]
    .map((group) => {
      const stock = roundQty(group.opening + group.incoming - group.outgoing + (group.balanceAdjust || 0))
      return { ...group, stock, finalStock: roundQty(stock - group.defect - group.sample) }
    })
    .sort((a, b) =>
      `${a.company}${a.product}${a.floor}`.localeCompare(`${b.company}${b.product}${b.floor}`, 'ko'),
    )
}

export function uniqueUnits(groups: StockGroup[]) {
  return [...new Set(groups.map((group) => group.unit).filter(Boolean))]
}

const QTY_EPS = 0.0001

function roundQty(value: number) {
  return Math.round((value + Number.EPSILON) * 10000) / 10000
}

export interface ClosedInboundLot {
  id: string
  issueDate: string
  lot: string
  quantity: number
  unit: string
}

export interface OpenInboundLot extends ClosedInboundLot {
  remaining: number
}

export interface LedgerEntry extends StockMovement {
  running: number
  band: number
  closedLots: ClosedInboundLot[]
  /** 첫 입고보다 앞선 출고 */
  beforeInbound: boolean
}

export type LedgerSegmentTone = 'plain' | 'settled' | 'open' | 'uncovered' | 'unknown'

export interface LedgerSegment {
  key: string
  tone: LedgerSegmentTone
  title: string
  detail: string
  rows: LedgerEntry[]
}

export interface LedgerView {
  rows: LedgerEntry[]
  openLots: OpenInboundLot[]
  segments: LedgerSegment[]
}

interface DraftSection {
  key: string
  tone: LedgerSegmentTone
  rows: LedgerEntry[]
  remaining: number
  lot: ClosedInboundLot | null
  running: number
}

function blankSection(key: string, tone: LedgerSegmentTone): DraftSection {
  return { key, tone, rows: [], remaining: 0, lot: null, running: 0 }
}

export function buildLedger(movements: StockMovement[], startDate = '', endDate = ''): LedgerView {
  const start = startDate ? compactDate(startDate) : ''
  const end = endDate ? compactDate(endDate) : ''
  const sorted = [...movements].sort((a, b) => {
    const byDate = a.issueDate.localeCompare(b.issueDate)
    if (byDate !== 0) return byDate
    return a.kind.localeCompare(b.kind, 'ko')
  })

  const inboundSections: DraftSection[] = []
  const queue: DraftSection[] = []
  let unknown = blankSection('unknown', 'unknown')
  let uncovered = blankSection('uncovered', 'uncovered')
  let band = 0

  const append = (section: DraftSection, movement: StockMovement, closedLots: ClosedInboundLot[] = []) => {
    section.rows.push({
      ...movement,
      running: section.running,
      band,
      closedLots,
      beforeInbound: section.key === 'unknown',
    })
  }

  for (const movement of sorted) {
    if (end && movement.issueDate && movement.issueDate > end) continue
    const beforeRange = Boolean(start && movement.issueDate && movement.issueDate < start)

    if (movement.kind === '입고') {
      const lot: ClosedInboundLot = {
        id: `${movement.source}-${movement.id}`,
        issueDate: movement.issueDate,
        lot: movement.lot,
        quantity: movement.quantity,
        unit: movement.unit,
      }
      const section = blankSection(lot.id, 'open')
      section.lot = lot
      section.remaining = movement.quantity
      section.running = movement.quantity
      band += 1
      if (!beforeRange) append(section, movement)
      inboundSections.push(section)
      queue.push(section)
      continue
    }

    if (queue.length === 0) {
      const bucket = inboundSections.length === 0 ? unknown : uncovered
      bucket.running = roundQty(bucket.running - movement.quantity)
      band = inboundSections.length === 0 ? 0 : band + 1
      if (!beforeRange) append(bucket, movement)
      continue
    }

    const target = queue[0]
    target.remaining = roundQty(target.remaining - movement.quantity)
    target.running = roundQty(target.running - movement.quantity)
    const closedLots: ClosedInboundLot[] = []
    if (target.remaining <= QTY_EPS && target.lot) {
      closedLots.push(target.lot)
      target.tone = 'settled'
      target.remaining = 0
      queue.shift()
    }
    if (!beforeRange) append(target, movement, closedLots)
  }

  const visibleRows = [unknown, ...inboundSections, uncovered]
    .flatMap((section) => section.rows)
    .sort((a, b) => {
      const byDate = a.issueDate.localeCompare(b.issueDate)
      if (byDate !== 0) return byDate
      return a.kind.localeCompare(b.kind, 'ko')
    })

  let running = 0
  let seenInbound = false
  const applyRunning = (kind: StockKind, quantity: number) => {
    if (kind === '입고' && !seenInbound) {
      running = 0
      seenInbound = true
    } else if (kind === '입고') {
      seenInbound = true
    }
    const signed = kind === '입고' ? quantity : -quantity
    running = roundQty(running + signed)
  }
  for (const movement of sorted) {
    if (end && movement.issueDate && movement.issueDate > end) continue
    if (start && movement.issueDate && movement.issueDate < start) {
      applyRunning(movement.kind, movement.quantity)
    }
  }
  for (const row of visibleRows) {
    applyRunning(row.kind, row.quantity)
    row.running = running
  }

  const segments: LedgerSegment[] = [{
    key: 'all',
    tone: 'plain',
    title: '',
    detail: '',
    rows: visibleRows,
  }]

  return {
    rows: segments.flatMap((section) => section.rows),
    openLots: queue
      .filter((section) => section.remaining > QTY_EPS && section.lot)
      .map((section) => ({ ...section.lot!, remaining: section.remaining })),
    segments,
  }
}

export function ledgerRows(movements: StockMovement[], startDate = '', endDate = '') {
  return buildLedger(movements, startDate, endDate).rows
}

export interface InboundBatch {
  key: string
  inbound: StockMovement | null
  rows: StockMovement[]
}

function sameStockItem(left: StockMovement, right: StockMovement) {
  return left.company === right.company
    && left.product === right.product
    && left.floor === right.floor
    && left.unit === right.unit
}

function byMovementOrder(left: StockMovement, right: StockMovement) {
  const byDate = left.issueDate.localeCompare(right.issueDate)
  if (byDate !== 0) return byDate
  return left.kind.localeCompare(right.kind, 'ko')
}

/** 입고 한 건과, 그 수량을 날짜순으로 소진한 출고. 원장 구간 배정과 같은 순서입니다. */
export function inboundBatches(movements: StockMovement[]): InboundBatch[] {
  const sorted = [...movements].sort(byMovementOrder)
  const batches: InboundBatch[] = []
  const queue: InboundBatch[] = []
  let unknown: InboundBatch | null = null
  let uncovered: InboundBatch | null = null
  let seenInbound = false

  for (const movement of sorted) {
    if (movement.kind === '입고') {
      const batch: InboundBatch = {
        key: `${movement.source}-${movement.id}`,
        inbound: movement,
        rows: [movement],
      }
      batches.push(batch)
      queue.push(batch)
      seenInbound = true
      continue
    }

    if (queue.length === 0) {
      const bucket = seenInbound
        ? (uncovered ??= { key: 'uncovered', inbound: null, rows: [] })
        : (unknown ??= { key: 'unknown', inbound: null, rows: [] })
      if (bucket.rows.length === 0) batches.push(bucket)
      bucket.rows.push(movement)
      continue
    }

    const target = queue[0]
    target.rows.push(movement)
    const consumed = target.rows
      .filter((row) => row.kind === '출고')
      .reduce((sum, row) => sum + row.quantity, 0)
    if (target.inbound && consumed >= target.inbound.quantity - QTY_EPS) queue.shift()
  }

  return batches
}

function outboundTotal(batch: InboundBatch) {
  return batch.rows.filter((row) => row.kind === '출고').reduce((sum, row) => sum + row.quantity, 0)
}

/** 이 입고분 수량을 넘는 출고. 그날부터 다음 입고분을 같이 쓴 것으로 본다. */
function closingOutbound(batch: InboundBatch) {
  if (!batch.inbound) return null
  let consumed = 0
  for (const row of batch.rows) {
    if (row.kind !== '출고') continue
    consumed = roundQty(consumed + row.quantity)
    if (consumed >= batch.inbound.quantity - QTY_EPS) return row
  }
  return null
}

function nextCompactDate(value: string) {
  const year = Number(value.slice(0, 4))
  const month = Number(value.slice(4, 6))
  const day = Number(value.slice(6, 8))
  const date = new Date(Date.UTC(year, month - 1, day))
  date.setUTCDate(date.getUTCDate() + 1)
  const nextMonth = String(date.getUTCMonth() + 1).padStart(2, '0')
  const nextDay = String(date.getUTCDate()).padStart(2, '0')
  return `${date.getUTCFullYear()}${nextMonth}${nextDay}`
}

/**
 * 선입선출로 이 입고분을 실제 작업한 기간.
 * 앞 입고분이 소진된 날(넘친 경우 그날 포함)부터, 이 입고분이 소진된 날까지.
 */
export function inboundWorkSpan(batch: InboundBatch, batches: InboundBatch[]) {
  if (!batch.inbound) return null
  const inboundLots = batches.filter((item) => item.inbound)
  const index = inboundLots.findIndex((item) => item.key === batch.key)
  if (index < 0) return null
  const inboundDate = compactDate(batch.inbound.issueDate)
  let start = inboundDate
  if (index > 0) {
    const previous = inboundLots[index - 1]
    const previousClose = closingOutbound(previous)
    if (!previousClose || !previous.inbound) return null
    const closeDate = compactDate(previousClose.issueDate)
    const overflow = outboundTotal(previous) > previous.inbound.quantity + QTY_EPS
    const openedOn = overflow ? closeDate : nextCompactDate(closeDate)
    start = openedOn > inboundDate ? openedOn : inboundDate
  }
  const close = closingOutbound(batch)
  return { start, end: close ? compactDate(close.issueDate) : '' }
}

export type FlowStage = 'waiting' | 'working' | 'ready' | 'done'

export interface FlowLot {
  inbound: StockMovement
  shipped: number
  remaining: number
  stage: FlowStage
  outbound: StockMovement[]
  lastShipDate: string
}

export interface UnregisteredOutbound {
  key: string
  company: string
  product: string
  floor: string
  unit: string
  count: number
  quantity: number
  firstDate: string
  lastDate: string
}

export interface LotFlow {
  lots: FlowLot[]
  unregistered: UnregisteredOutbound[]
}

/** 입고 한 건을 고객 소재 한 묶음으로 보고, 선입선출로 붙은 출고로 단계를 정한다. */
export function buildLotFlow(movements: StockMovement[]): LotFlow {
  const byItem = new Map<string, StockMovement[]>()
  for (const movement of movements) {
    const key = stockGroupKey(movement)
    const list = byItem.get(key) ?? []
    list.push(movement)
    byItem.set(key, list)
  }

  const lots: FlowLot[] = []
  const unregistered: UnregisteredOutbound[] = []
  for (const [key, list] of byItem) {
    let orphan: UnregisteredOutbound | null = null
    for (const batch of inboundBatches(list)) {
      const outbound = batch.rows.filter((row) => row.kind === '출고')
      if (!batch.inbound) {
        const first = outbound[0]
        if (!first) continue
        orphan ??= { key, company: first.company, product: first.product, floor: first.floor, unit: first.unit, count: 0, quantity: 0, firstDate: '', lastDate: '' }
        for (const row of outbound) {
          orphan.count += 1
          orphan.quantity = roundQty(orphan.quantity + row.quantity)
          if (!orphan.firstDate || row.issueDate < orphan.firstDate) orphan.firstDate = row.issueDate
          if (row.issueDate > orphan.lastDate) orphan.lastDate = row.issueDate
        }
        continue
      }
      const total = batch.inbound.quantity
      const shipped = roundQty(Math.min(total, outbound.reduce((sum, row) => sum + row.quantity, 0)))
      const remaining = roundQty(total - shipped)
      const stage: FlowStage = remaining <= QTY_EPS
        ? 'done'
        : batch.inbound.workStage ?? (shipped > QTY_EPS ? 'working' : 'waiting')
      lots.push({
        inbound: batch.inbound,
        shipped,
        remaining,
        stage,
        outbound,
        lastShipDate: outbound.reduce((latest, row) => (row.issueDate > latest ? row.issueDate : latest), ''),
      })
    }
    if (orphan) unregistered.push(orphan)
  }

  lots.sort((a, b) => a.inbound.issueDate.localeCompare(b.inbound.issueDate))
  unregistered.sort((a, b) => b.lastDate.localeCompare(a.lastDate))
  return { lots, unregistered }
}

export function batchForMovement(anchor: StockMovement, movements: StockMovement[]): InboundBatch {
  const same = movements.filter((row) => sameStockItem(row, anchor))
  const batches = inboundBatches(same)
  const key = `${anchor.source}-${anchor.id}`
  return batches.find((batch) => batch.rows.some((row) => `${row.source}-${row.id}` === key))
    ?? { key, inbound: anchor.kind === '입고' ? anchor : null, rows: [anchor] }
}
