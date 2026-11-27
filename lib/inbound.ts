import { getAuthHeaders } from '@/lib/auth-client'
import type { TraceBarcode } from '@/lib/trace'

/**
 * 입고등록 한 건 = 바코드 하나. 수입검사 성적서 → 이력카드 → 출하성적서가 이 바코드로 묶인다.
 * 바코드 대장(trace-barcodes)을 기준으로 하고, 입고등록(inventory)에서 로트번호를 가져와 붙인다.
 */
export interface InboundItem {
  /** 입고등록(inventory) id. 입고 없이 직접 등록한 바코드는 빈 값 */
  inventoryId: string
  barcode: string
  company: string
  product: string
  floor: '1' | '2' | '3'
  quantity: number
  quantityUnit: string
  receivedAt: string
  lotNo: string
  source: 'inbound' | 'manual'
  note: string
  createdAt: string
  /** 바코드 진행 상태 (입고 → 작업중 → … → 출하완료) */
  status: TraceBarcode['status']
}

type InventoryRow = { id: string; lotStart?: string }

const floorOf = (value: unknown): InboundItem['floor'] => (String(value) === '2' ? '2' : String(value) === '3' ? '3' : '1')

/** 바코드 대장 + 입고등록을 합쳐 입고 목록(최신순)을 만든다. */
export async function fetchInbounds(): Promise<InboundItem[]> {
  const headers = getAuthHeaders()
  const [ledgerRes, inventoryRes] = await Promise.all([
    fetch('/api/trace-barcodes', { cache: 'no-store', headers }),
    fetch('/api/inventory', { cache: 'no-store', headers }),
  ])
  const ledgerBody = await ledgerRes.json().catch(() => null)
  if (!ledgerRes.ok || !Array.isArray(ledgerBody?.data)) throw new Error('inbound-load')
  const inventoryBody = inventoryRes.ok ? await inventoryRes.json().catch(() => null) : null
  const lotOf = new Map<string, string>(
    (Array.isArray(inventoryBody?.data) ? (inventoryBody.data as InventoryRow[]) : []).map((row) => [row.id, (row.lotStart ?? '').trim()]),
  )
  return (ledgerBody.data as TraceBarcode[])
    .map<InboundItem>((row) => ({
      inventoryId: row.inventoryId || '',
      barcode: row.barcode,
      company: row.company,
      product: row.product,
      floor: floorOf(row.floor),
      quantity: row.quantity,
      quantityUnit: row.quantityUnit || 'EA',
      receivedAt: row.receivedAt || '',
      lotNo: lotOf.get(row.inventoryId) ?? '',
      source: row.source,
      note: row.note || '',
      createdAt: row.createdAt,
      status: row.status,
    }))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export function findInbound(items: InboundItem[], code: string) {
  const upper = code.trim().toUpperCase()
  return upper ? items.find((item) => item.barcode.toUpperCase() === upper) : undefined
}

export function inboundQuantityText(item: Pick<InboundItem, 'quantity' | 'quantityUnit'>) {
  return item.quantity > 0 ? `${item.quantity.toLocaleString('ko-KR', { maximumFractionDigits: 2 })} ${item.quantityUnit}` : ''
}

/** 입고 수량 → 수입검사 성적서의 'LOT 중량 / R' 칸. 단위가 R(롤)이면 롤 칸에, 그 외는 중량 칸에 넣는다. */
export function sheetQuantityFields(item: Pick<InboundItem, 'quantity' | 'quantityUnit'>) {
  const qty = item.quantity > 0 ? String(item.quantity) : ''
  if (item.quantityUnit === 'R') return { lotWeight: '', lotWeightUnit: 'Kg' as const, lotRoll: qty }
  return { lotWeight: qty, lotWeightUnit: item.quantityUnit === 'EA' ? ('EA' as const) : ('Kg' as const), lotRoll: '' }
}

/** 수입검사 성적서의 LOT 중량 / R → 이력카드의 '수량(무게)' 글자 */
export function cardQuantityText(sheet: { lotWeight: string; lotWeightUnit: string }) {
  return sheet.lotWeight.trim() ? `${sheet.lotWeight.trim()}${sheet.lotWeightUnit === 'EA' ? ' EA' : ' Kg'}` : ''
}

/** 바코드 번호를 스캐너·키보드로 받을 때 공백·소문자를 정리한다. */
export function cleanBarcode(value: string) {
  return value.trim().toUpperCase()
}
