import { normalizeIssueDate } from '@/lib/lot'
import { parseOccurrenceDate } from '@/lib/non-conformity'

export type LotResult = 'pass' | 'fail'
export type ScarStatus = 'none' | 'issued' | 'action' | 'closed'
export type Floor = '1' | '2' | '3'

export interface InspectionLot {
  id: string
  /** YYYY-MM-DD */
  date: string
  vendor: string
  product: string
  floor: Floor
  quantity: number
  /** 성적서 수량 단위. 출하검사에서만 채운다. */
  unit?: 'Kg' | 'EA' | 'R'
  result: LotResult
  defect: string
  scar: ScarStatus
  scarDue: string
  note: string
}

export interface KpiState {
  /** 기본 목표 불량률(%) */
  target: number
  /** 'YYYY-MM' → 그 달만 다른 목표(%) */
  monthTargets: Record<string, number>
  /** 마감된 'YYYY-MM' */
  closed: string[]
  lots: InspectionLot[]
}

export const FLOORS: Floor[] = ['1', '2', '3']
export const DEFAULT_TARGET = 2

export const SCAR_LABEL: Record<ScarStatus, string> = {
  none: '미발행',
  issued: '발행',
  action: '조치 중',
  closed: '조치 완료',
}

export const EMPTY_STATE: KpiState = { target: DEFAULT_TARGET, monthTargets: {}, closed: [], lots: [] }

const MONTH_KEY = /^\d{4}-(0[1-9]|1[0-2])$/
const DATE_KEY = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/

function text(value: unknown, max = 120) {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

function rateValue(value: unknown) {
  const number = Number(value)
  return Number.isFinite(number) && number >= 0 && number <= 100 ? Math.round(number * 100) / 100 : null
}

export function normalizeLot(value: unknown): InspectionLot | null {
  if (!value || typeof value !== 'object') return null
  const row = value as Record<string, unknown>
  const id = text(row.id, 80)
  const date = text(row.date, 10)
  const vendor = text(row.vendor)
  if (!id || !DATE_KEY.test(date) || !vendor) return null
  const floor = FLOORS.includes(row.floor as Floor) ? (row.floor as Floor) : '1'
  const result: LotResult = row.result === 'fail' ? 'fail' : 'pass'
  const scar = (['none', 'issued', 'action', 'closed'] as const).includes(row.scar as ScarStatus) ? (row.scar as ScarStatus) : 'none'
  const quantity = Number(row.quantity)
  const scarDue = text(row.scarDue, 10)
  const unit = row.unit === 'Kg' || row.unit === 'EA' || row.unit === 'R' ? row.unit : undefined
  return {
    id,
    date,
    vendor,
    product: text(row.product),
    floor,
    quantity: Number.isFinite(quantity) && quantity > 0 ? Math.round(quantity * 100) / 100 : 0,
    unit,
    result,
    defect: result === 'fail' ? text(row.defect, 200) : '',
    scar: result === 'fail' ? scar : 'none',
    scarDue: result === 'fail' && DATE_KEY.test(scarDue) ? scarDue : '',
    note: text(row.note, 300),
  }
}

export function normalizeState(value: unknown): KpiState | null {
  if (!value || typeof value !== 'object') return null
  const raw = value as Record<string, unknown>
  if (!Array.isArray(raw.lots)) return null
  const lots = raw.lots.map(normalizeLot)
  if (lots.some((lot) => !lot)) return null
  const monthTargets: Record<string, number> = {}
  if (raw.monthTargets && typeof raw.monthTargets === 'object') {
    for (const [key, target] of Object.entries(raw.monthTargets as Record<string, unknown>)) {
      const rate = rateValue(target)
      if (MONTH_KEY.test(key) && rate != null) monthTargets[key] = rate
    }
  }
  const closed = Array.isArray(raw.closed) ? [...new Set(raw.closed.filter((key): key is string => typeof key === 'string' && MONTH_KEY.test(key)))].sort() : []
  return {
    target: rateValue(raw.target) ?? DEFAULT_TARGET,
    monthTargets,
    closed,
    lots: (lots as InspectionLot[]).sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id)),
  }
}

export function monthKey(year: number, month: number) {
  return `${year}-${String(month).padStart(2, '0')}`
}

export function targetFor(state: KpiState, key: string) {
  return state.monthTargets[key] ?? state.target
}

export function percent(defect: number, inspected: number) {
  return inspected > 0 ? Math.round((defect / inspected) * 10000) / 100 : 0
}

export interface PeriodStat {
  key: string
  label: string
  inspected: number
  defect: number
  rate: number
  target: number
  /** 검사가 없으면 판정하지 않는다 */
  ok: boolean | null
}

function stat(key: string, label: string, lots: InspectionLot[], target: number): PeriodStat {
  const inspected = lots.length
  const defect = lots.filter((lot) => lot.result === 'fail').length
  const rate = percent(defect, inspected)
  return { key, label, inspected, defect, rate, target, ok: inspected > 0 ? rate <= target : null }
}

export function summarize(state: KpiState, year: number) {
  const lots = state.lots.filter((lot) => lot.date.startsWith(`${year}-`))
  const months = Array.from({ length: 12 }, (_, index) => {
    const key = monthKey(year, index + 1)
    return stat(key, `${index + 1}월`, lots.filter((lot) => lot.date.startsWith(key)), targetFor(state, key))
  })
  const quarters = [0, 1, 2, 3].map((quarter) => {
    const keys = months.slice(quarter * 3, quarter * 3 + 3).map((month) => month.key)
    const rows = lots.filter((lot) => keys.some((key) => lot.date.startsWith(key)))
    const targets = months.slice(quarter * 3, quarter * 3 + 3).map((month) => month.target)
    return stat(`Q${quarter + 1}`, `${quarter + 1}분기`, rows, Math.min(...targets))
  })
  const halves = [0, 1].map((half) => {
    const slice = months.slice(half * 6, half * 6 + 6)
    const rows = lots.filter((lot) => slice.some((month) => lot.date.startsWith(month.key)))
    return stat(half === 0 ? 'H1' : 'H2', half === 0 ? '상반기' : '하반기', rows, Math.min(...slice.map((month) => month.target)))
  })
  const floors = FLOORS.map((floor) => stat(floor, `${floor}층`, lots.filter((lot) => lot.floor === floor), state.target))
  const vendorNames = [...new Set(lots.map((lot) => lot.vendor))]
  const vendors = vendorNames
    .map((vendor) => stat(vendor, vendor, lots.filter((lot) => lot.vendor === vendor), state.target))
    .sort((a, b) => b.rate - a.rate || b.inspected - a.inspected)
  const total = stat(String(year), `${year}년`, lots, state.target)
  const judged = months.filter((month) => month.ok != null)
  const achieved = judged.filter((month) => month.ok).length
  const zeroMonths = judged.filter((month) => month.defect === 0).length
  let streak = 0
  for (let index = judged.length - 1; index >= 0 && judged[index].defect === 0; index -= 1) streak += 1
  return { lots, months, quarters, halves, floors, vendors, total, judged: judged.length, achieved, zeroMonths, streak }
}

/** 저장된 품목이 있는 협력사. 예시 LOT는 이 업체의 품목만 쓴다. */
function sampleVendors(catalog?: { companies: string[]; productsByCompany: Record<string, string[]> }, shift = 0) {
  const rows = (catalog?.companies ?? [])
    .map((company) => ({
      company,
      products: (catalog?.productsByCompany[company] ?? []).map((item) => item.trim()).filter((item) => item && item !== '-' && !/^sample\b/i.test(item)),
    }))
    .filter((row) => row.products.length > 0)
    .sort((a, b) => b.products.length - a.products.length || a.company.localeCompare(b.company, 'ko'))
  const start = rows.length > 0 ? shift % rows.length : 0
  const picked = [...rows.slice(start), ...rows.slice(0, start)].slice(0, 8)
  if (picked.length > 0) return picked
  return [
    { company: '한중NCS', products: ['BUSBAR MTM'] },
    { company: '풍산', products: ['0.15*175'] },
    { company: '나담테크', products: ['0.1*26'] },
  ]
}

const SAMPLE_PROFILES: Record<KpiKind, { inspected: number[]; defects: number[]; issues: string[]; vendorShift: number; quantityBase: number }> = {
  incoming: {
    inspected: [90, 75, 60, 45, 54, 69, 76, 56, 64, 105, 66, 60],
    defects: [1, 2, 0, 0, 6, 0, 1, 0, 2, 0, 0, 0],
    issues: ['외관 흠집', '치수 이탈', '도금 두께 미달', '이종 혼입'],
    vendorShift: 0,
    quantityBase: 500,
  },
  process: {
    inspected: [48, 42, 39, 36, 44, 33, 41, 38, 35, 46, 30, 28],
    defects: [4, 2, 5, 1, 3, 6, 2, 0, 4, 3, 1, 0],
    issues: ['치수 불량', '가공 스크래치', '용접 불량', '조립 누락'],
    vendorShift: 3,
    quantityBase: 200,
  },
  outgoing: {
    inspected: [24, 18, 27, 21, 16, 30, 19, 22, 25, 32, 14, 12],
    defects: [0, 1, 0, 0, 2, 1, 0, 1, 0, 0, 1, 0],
    issues: ['포장 파손', '라벨 오류', '수량 부족', '외관 흠집'],
    vendorShift: 6,
    quantityBase: 800,
  },
  customer: {
    inspected: [9, 6, 11, 5, 8, 4, 7, 6, 5, 12, 3, 4],
    defects: [2, 1, 3, 0, 1, 2, 0, 1, 1, 0, 1, 0],
    issues: ['고객 클레임', '기능 불량', '납품 혼입', '사양 불일치'],
    vendorShift: 9,
    quantityBase: 100,
  },
}

/** 출하검사 KPI는 저장된 성적서 한 건을 검사 한 건으로 센다. 입고 수기입력과 재고 자리표시는 빼 둔다. */
export function lotsFromCertificates(docs: Array<{
  id: string
  documentType?: string
  storagePath?: string
  filename?: string
  movementType?: string
  company?: string
  product?: string
  issueDate?: string
  floor?: number
  shipmentFloor?: number
  quantity?: number
  quantityUnit?: string
  lotStart?: string
}>): InspectionLot[] {
  const lots: InspectionLot[] = []
  for (const doc of docs) {
    if (doc.documentType !== '성적서' || doc.storagePath === 'INVENTORY' || doc.filename === '수기입력' || doc.movementType === '입고') continue
    let date = ''
    try {
      date = normalizeIssueDate(doc.issueDate)
    } catch {
      continue
    }
    if (!DATE_KEY.test(date) || !doc.id) continue
    const floorNo = doc.shipmentFloor ?? doc.floor
    const floor: Floor = floorNo === 2 || floorNo === 3 ? String(floorNo) as Floor : '1'
    const quantity = Number(doc.quantity)
    const unit = doc.quantityUnit === 'EA' || doc.quantityUnit === 'R' || doc.quantityUnit === 'Kg' ? doc.quantityUnit : 'Kg'
    lots.push({
      id: doc.id,
      date,
      vendor: doc.company?.trim() || '미지정',
      product: doc.product?.trim() || '-',
      floor,
      quantity: Number.isFinite(quantity) && quantity > 0 ? Math.round(quantity * 100) / 100 : 0,
      unit,
      result: 'pass',
      defect: '',
      scar: 'none',
      scarDue: '',
      note: doc.lotStart?.trim() || '',
    })
  }
  return lots.sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id))
}

/** 고객부적합 KPI는 부적합관리의 고객 부적합 한 건을 접수 한 건으로 센다. */
export function lotsFromCustomerNonconformities(rows: Array<{
  id: string
  occurrenceDate?: string
  createdAt?: string
  occurrenceCompany?: string
  description?: string
  countermeasurePlan?: string
  processingResult?: string
  effectivenessVerification?: string
  remarks?: string
}>): InspectionLot[] {
  const lots: InspectionLot[] = []
  for (const row of rows) {
    if (!row.id) continue
    const date = parseOccurrenceDate(row.occurrenceDate, row.createdAt)
    if (!DATE_KEY.test(date)) continue
    const steps = [row.countermeasurePlan, row.processingResult, row.effectivenessVerification]
    const scar: ScarStatus = steps.every((step) => step === 'done')
      ? 'closed'
      : steps.some((step) => step === 'done' || step === 'in_progress')
        ? 'action'
        : 'none'
    lots.push({
      id: row.id,
      date,
      vendor: row.occurrenceCompany?.trim() || '미지정',
      product: '',
      floor: '1',
      quantity: 0,
      result: 'fail',
      defect: (row.description ?? '').trim().slice(0, 200),
      scar,
      scarDue: '',
      note: (row.remarks ?? '').trim().slice(0, 300),
    })
  }
  return lots.sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id))
}

function replyStat(key: string, label: string, lots: InspectionLot[], target: number): PeriodStat {
  const received = lots.filter((lot) => lot.result === 'fail').length
  const closed = lots.filter((lot) => lot.result === 'fail' && lot.scar === 'closed').length
  const rate = received > 0 ? Math.round((closed / received) * 10000) / 100 : 0
  return { key, label, inspected: received, defect: closed, rate, target, ok: received > 0 ? rate >= target : null }
}

/** 고객부적합 집계. inspected는 접수, defect는 조치완료, rate는 회신율이고 목표 이상이면 달성이다. */
export function summarizeReply(state: KpiState, year: number) {
  const lots = state.lots.filter((lot) => lot.date.startsWith(`${year}-`) && lot.result === 'fail')
  const months = Array.from({ length: 12 }, (_, index) => {
    const key = monthKey(year, index + 1)
    return replyStat(key, `${index + 1}월`, lots.filter((lot) => lot.date.startsWith(key)), targetFor(state, key))
  })
  const quarters = [0, 1, 2, 3].map((quarter) => {
    const slice = months.slice(quarter * 3, quarter * 3 + 3)
    const rows = lots.filter((lot) => slice.some((month) => lot.date.startsWith(month.key)))
    return replyStat(`Q${quarter + 1}`, `${quarter + 1}분기`, rows, Math.min(...slice.map((month) => month.target)))
  })
  const halves = [0, 1].map((half) => {
    const slice = months.slice(half * 6, half * 6 + 6)
    const rows = lots.filter((lot) => slice.some((month) => lot.date.startsWith(month.key)))
    return replyStat(half === 0 ? 'H1' : 'H2', half === 0 ? '상반기' : '하반기', rows, Math.min(...slice.map((month) => month.target)))
  })
  const vendorNames = [...new Set(lots.map((lot) => lot.vendor))]
  const vendors = vendorNames
    .map((vendor) => replyStat(vendor, vendor, lots.filter((lot) => lot.vendor === vendor), state.target))
    .sort((a, b) => a.rate - b.rate || b.inspected - a.inspected)
  const total = replyStat(String(year), `${year}년`, lots, state.target)
  const judged = months.filter((month) => month.ok != null)
  const achieved = judged.filter((month) => month.ok).length
  return { lots, months, quarters, halves, vendors, total, judged: judged.length, achieved }
}

/** 데이터가 없을 때 화면 검토용으로 보여 주는 예시. 종류마다 건수와 불량이 다르다. */
export function sampleState(today = new Date(), catalog?: { companies: string[]; productsByCompany: Record<string, string[]> }, kind: KpiKind = 'incoming'): KpiState {
  const year = today.getFullYear()
  const lastMonth = today.getMonth() + 1
  const profile = SAMPLE_PROFILES[kind]
  const { inspected, defects, issues } = profile
  const vendors = sampleVendors(catalog, profile.vendorShift)
  const lots: InspectionLot[] = []
  let serial = 0
  for (let month = 1; month <= lastMonth; month += 1) {
    const lastDay = month === lastMonth ? Math.max(1, today.getDate()) : new Date(year, month, 0).getDate()
    const count = month === lastMonth ? Math.max(1, Math.round((inspected[month - 1] * lastDay) / new Date(year, month, 0).getDate())) : inspected[month - 1]
    for (let index = 0; index < count; index += 1) {
      serial += 1
      const fail = index < defects[month - 1]
      const day = 1 + ((index * 7) % lastDay)
      const vendor = vendors[(index + month) % vendors.length]
      lots.push({
        id: `sample-${kind}-${serial}`,
        date: `${monthKey(year, month)}-${String(day).padStart(2, '0')}`,
        vendor: vendor.company,
        product: vendor.products[(index + month * 2) % vendor.products.length],
        floor: FLOORS[(index + month + profile.vendorShift) % 3],
        quantity: profile.quantityBase + ((index * 37) % 9) * 100,
        result: fail ? 'fail' : 'pass',
        defect: fail ? issues[(index + month) % issues.length] : '',
        scar: fail ? (month < lastMonth - 1 ? 'closed' : 'action') : 'none',
        scarDue: '',
        note: '',
      })
    }
  }
  return {
    target: DEFAULT_TARGET,
    monthTargets: {},
    closed: Array.from({ length: Math.max(0, lastMonth - 1) }, (_, index) => monthKey(year, index + 1)),
    lots: lots.sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id)),
  }
}

/** 화면과 집계는 같고, 저장 위치와 이름만 다르다. */
export const KPI_KINDS = {
  incoming: {
    key: 'incoming-inspection-kpi',
    name: '수입검사',
    title: '수입검사 KPI',
    description: '입고 LOT 검사 결과로 불량률과 목표 달성을 집계합니다.',
    register: '수입검사 등록',
    dialog: '입고 LOT 하나의 검사 결과를 입력합니다.',
    quantity: '입고 수량',
  },
  process: {
    key: 'process-defect-kpi',
    name: '공정불량률',
    title: '공정불량률 KPI',
    description: '공정 불량 LOT 기준으로 불량률과 목표 달성을 집계합니다.',
    register: '공정불량률 등록',
    dialog: '공정 불량 LOT 하나의 검사 결과를 입력합니다.',
    quantity: '수량',
  },
  outgoing: {
    key: 'outgoing-inspection-kpi',
    name: '출하검사',
    title: '출하검사 KPI',
    description: '등록된 출하검사 실적 건수로 집계합니다. 실적 한 건이 검사 한 건입니다.',
    register: '출하검사 실적',
    dialog: '출하 LOT 하나의 검사 결과를 입력합니다.',
    quantity: '출하 수량',
  },
  customer: {
    key: 'customer-nc-kpi',
    name: '고객부적합',
    title: '고객부적합 KPI',
    description: '부적합관리에 등록된 고객 부적합으로 접수, 조치, 회신율을 집계합니다.',
    register: '고객부적합',
    dialog: '고객 부적합 LOT 하나의 검사 결과를 입력합니다.',
    quantity: '수량',
  },
} as const

export type KpiKind = keyof typeof KPI_KINDS

export function kpiKind(value: unknown): KpiKind {
  return value === 'process' || value === 'outgoing' || value === 'customer' || value === 'incoming' ? value : 'incoming'
}
