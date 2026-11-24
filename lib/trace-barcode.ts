import { findRecords, insertRecord, nextSequence } from '@/lib/records'
import type { BarcodeStatus, TraceBarcode } from '@/lib/trace'
import type { WorkStage } from '@/lib/stock'

export const TRACE_BARCODE_COLLECTION = 'trace-barcodes'

function seoulStamp(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Seoul',
    year: '2-digit',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? ''
  return `${part('year')}${part('month')}${part('day')}`
}

interface IssueInput {
  company: string
  product: string
  floor?: number
  quantity?: number
  quantityUnit?: string
  receivedAt?: string
  source: TraceBarcode['source']
  inventoryId?: string
  note?: string
  by: string
}

/** 바코드 번호(WR + 날짜 6자리 + 순번 4자리)를 새로 만들고 바코드 대장에 올린다. 처음 상태는 '입고'. */
export async function issueTraceBarcode(input: IssueInput): Promise<TraceBarcode> {
  const sequence = await nextSequence('lot-barcode')
  const now = new Date().toISOString()
  const record: TraceBarcode = {
    id: crypto.randomUUID(),
    barcode: `WR${seoulStamp()}${String(sequence).padStart(4, '0')}`,
    company: input.company.trim(),
    product: input.product.trim(),
    floor: input.floor ?? 1,
    quantity: input.quantity ?? 0,
    quantityUnit: input.quantityUnit || 'EA',
    receivedAt: input.receivedAt || now.slice(0, 10),
    source: input.source,
    inventoryId: input.inventoryId ?? '',
    note: input.note?.trim() ?? '',
    status: 'received',
    statusLog: [{ status: 'received', at: now, by: input.by }],
    createdAt: now,
    createdBy: input.by,
  }
  await insertRecord(TRACE_BARCODE_COLLECTION, record, 'first')
  return record
}

export async function findTraceBarcode(code: string): Promise<TraceBarcode | null> {
  const upper = code.trim().toUpperCase()
  if (!upper) return null
  const [found] = await findRecords<TraceBarcode>(TRACE_BARCODE_COLLECTION, (row) => row.barcode.toUpperCase() === upper, 1)
  return found ?? null
}

/** 입고 건의 기존 '작업 단계' 표시(입고 대기·작업 중·출고 대기)와 맞추기 위한 변환. */
export function stageForStatus(status: BarcodeStatus): WorkStage | undefined {
  if (status === 'working' || status === 'done') return 'working'
  if (status === 'shipReady' || status === 'shipped') return 'ready'
  return undefined
}
