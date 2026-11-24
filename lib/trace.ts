/**
 * 제품 바코드의 진행 상태. 입고등록에서 바코드가 만들어지고, 현장에서 스캔 모드를 골라 찍을 때마다 바뀐다.
 *   입고 → 작업중 → 작업완료 → 출하대기 → 출하완료
 */
export const BARCODE_STATUSES = ['received', 'working', 'done', 'shipReady', 'shipped'] as const
export type BarcodeStatus = (typeof BARCODE_STATUSES)[number]

export const BARCODE_STATUS_LABEL: Record<BarcodeStatus, string> = {
  received: '입고',
  working: '작업중',
  done: '작업완료',
  shipReady: '출하대기',
  shipped: '출하완료',
}

/** 스캔 화면에서 고르는 모드 → 바꿀 상태 */
export const SCAN_STATUS_MODES = ['working', 'done', 'shipReady', 'shipped'] as const satisfies readonly BarcodeStatus[]

export function isBarcodeStatus(value: unknown): value is BarcodeStatus {
  return typeof value === 'string' && (BARCODE_STATUSES as readonly string[]).includes(value)
}

/** 바코드 대장의 한 줄. 입고등록 한 건(또는 직접 등록)당 하나이고, 이력카드·출하성적서는 이 바코드에 여러 장 묶인다. */
export interface TraceBarcode {
  id: string
  barcode: string
  company: string
  product: string
  floor: number
  quantity: number
  quantityUnit: string
  receivedAt: string
  /** inbound: 입고등록에서 발급, manual: 입고 없이 직접 등록 */
  source: 'inbound' | 'manual'
  /** 연결된 입고등록 (직접 등록한 바코드는 비어 있다) */
  inventoryId: string
  note: string
  status: BarcodeStatus
  statusLog: StatusLogEntry[]
  createdAt: string
  createdBy: string
}

export interface StatusLogEntry {
  status: BarcodeStatus
  at: string
  by: string
}

/** 바코드 선택 목록에 쓰는 요약 (이력카드가 몇 장 연결됐는지 포함). */
export interface TraceBarcodeOption extends TraceBarcode {
  cardCount: number
}

/** 바코드 하나로 모은 이력 (입고 → 이력카드들 → 출하성적서들 + 성적서 문서). */
export interface TraceResult {
  barcode: string
  status: BarcodeStatus
  statusLog: StatusLogEntry[]
  /** 입고등록에서 발급했는지, 직접 등록했는지 */
  source: 'inbound' | 'manual'
  partner: string
  product: string
  spec: string
  material: string
  /** 이 바코드에 묶인 LOT 번호들 */
  lots: string[]
  floor: string
  /** 입고 수량 (단위 포함) */
  inboundQuantity: string
  /** 이력카드 수량 합계 / 도금 후 수량 합계 */
  quantity: string
  platedQuantity: string
  rollCount: string
  materialVendor: string
  receivedOn: string
  workPeriod: string
  steps: TraceStep[]
  incomings: TraceDoc[]
  cards: TraceDoc[]
  reports: TraceDoc[]
  inbound: TraceInbound[]
  workLogs: TraceWorkLog[]
  documents: TraceFile[]
}

export interface TraceStep {
  date: string
  label: string
  /** 어느 서류에서 나온 기록인지 */
  source: string
  /** 이력카드가 여러 장일 때 어느 LOT 의 기록인지 */
  lot?: string
  detail?: string
  judge?: string
}

export interface TraceDoc {
  id: string
  date: string
  judge: string
  done: boolean
  lot?: string
  by?: string
  note?: string
}

export interface TraceFile {
  id: string
  name: string
  type: string
  issueDate: string
  fileId: string
}

/** 입고등록: 업체·품명이 같은 입고 기록 (입고등록에는 LOT 가 없어 바코드가 연결된 건과 업체·품명으로 연결한다). */
export interface TraceInbound {
  id: string
  date: string
  quantity: string
  lot: string
  /** 이 바코드가 발급된 입고 건인지 */
  own?: boolean
}

/** 작업일보: 업체·품명이 같은 작업 기록. */
export interface TraceWorkLog {
  id: string
  date: string
  work: number
  defect: number
  unit: string
}

/** 스캔 모드로 상태를 바꾼 결과. */
export interface StatusChangeResult {
  barcode: string
  partner: string
  product: string
  previous: BarcodeStatus
  status: BarcodeStatus
  changed: boolean
}
