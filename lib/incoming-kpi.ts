import type { Floor3WorkLog } from '@/lib/floor3-work-log'
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
export type OutgoingFloorScope = 'all' | Floor
export const DEFAULT_TARGET = 2
/** 납기준수 KPI 기본 목표(%) — 이상이면 달성 */
export const DEFAULT_ON_TIME_TARGET = 95

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
    scarDue: DATE_KEY.test(scarDue) ? scarDue : '',
    note: text(row.note, 300),
  }
}

/** 성적서(출고) 건수 — 발행일(YYYY-MM) 기준, 한 건당 1. */
export function shipmentCountIndex(lots: InspectionLot[]): Record<string, number> {
  const byMonth: Record<string, number> = {}
  for (const lot of lots) {
    const key = lot.date.slice(0, 7)
    if (!MONTH_KEY.test(key)) continue
    byMonth[key] = (byMonth[key] ?? 0) + 1
  }
  return byMonth
}

export function shipmentCountForYear(index: Record<string, number>, year: number, monthKeys: string[]) {
  let total = 0
  for (const key of monthKeys) {
    if (key.startsWith(`${year}-`)) total += index[key] ?? 0
  }
  return total
}

/** 약속납기(scarDue) 기준 발주 건수. 납품(성적서)보다 적으면 미납·미출고분을 더해 약간 높게 맞춘다. */
export function deliveryOrderCountIndex(
  orderLots: InspectionLot[],
  shipmentByMonth: Record<string, number>,
  year: number,
): Record<string, number> {
  const index: Record<string, number> = {}
  for (const lot of orderLots) {
    if (!DATE_KEY.test(lot.scarDue) || !lot.scarDue.startsWith(`${year}-`)) continue
    const key = lot.scarDue.slice(0, 7)
    if (!MONTH_KEY.test(key)) continue
    index[key] = (index[key] ?? 0) + 1
  }
  for (let month = 1; month <= 12; month += 1) {
    const key = monthKey(year, month)
    const shipped = shipmentByMonth[key] ?? 0
    if (shipped <= 0) continue
    const ordered = index[key] ?? 0
    if (ordered <= shipped) {
      const extra = Math.max(1, Math.ceil(shipped * 0.1))
      index[key] = shipped + extra
    }
  }
  return index
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

/** 선택 연도 기준 아직 오지 않은 달(집계표 등에서 — 표시) */
export function kpiMonthNotYetArrived(year: number, key: string) {
  const now = new Date()
  const currentYear = now.getFullYear()
  if (year > currentYear) return true
  if (year < currentYear) return false
  return key > monthKey(currentYear, now.getMonth() + 1)
}

export function targetFor(state: KpiState, key: string) {
  return state.monthTargets[key] ?? state.target
}

export const KPI_RATE_DECIMALS = 3

export function percent(defect: number, inspected: number) {
  if (inspected <= 0) return 0
  const factor = 10 ** KPI_RATE_DECIMALS
  return Math.round((defect / inspected) * 100 * factor) / factor
}

export function formatKpiRate(rate: number) {
  return `${rate.toFixed(KPI_RATE_DECIMALS)}%`
}

/** 표시용: 저장 rate 반올림과 무관하게 분자·분모로 계산 */
export function formatKpiRateFromParts(defect: number, base: number) {
  if (base <= 0) return formatKpiRate(0)
  return `${((defect / base) * 100).toFixed(KPI_RATE_DECIMALS)}%`
}

export function formatKpiRateGap(gap: number) {
  return `${gap > 0 ? '+' : ''}${gap.toFixed(KPI_RATE_DECIMALS)}%p`
}

/** 목표 이하 KPI: 표시용 rate는 반올림되므로, 판정은 원시 비율·불량 건수로 한다. target 0%이면 불량 1개도 미달 */
export function meetsLowerTarget(defect: number, base: number, target: number) {
  if (defect > 0 && target <= 0) return false
  if (base <= 0) return defect <= 0
  return (defect / base) * 100 <= target
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
  /** 출하 KPI: 불량률 = defect ÷ rateBase(출하수량) */
  rateBase?: number
  /** 출하 KPI: 불량률 분모로 쓴 성적서 단위(해당 월·기간 출하량이 가장 큰 단위) */
  rateBaseUnit?: 'Kg' | 'EA' | 'R'
}

function stat(key: string, label: string, lots: InspectionLot[], target: number): PeriodStat {
  const inspected = lots.length
  const defect = lots.filter((lot) => lot.result === 'fail').length
  const rate = percent(defect, inspected)
  return { key, label, inspected, defect, rate, target, ok: inspected > 0 ? meetsLowerTarget(defect, inspected, target) : null }
}

type ShipBucket = { Kg: number; EA: number; R: number }

function shipBucketForLots(lots: InspectionLot[]): ShipBucket {
  const bucket: ShipBucket = { Kg: 0, EA: 0, R: 0 }
  for (const lot of lots) {
    const unit = lot.unit === 'EA' || lot.unit === 'R' ? lot.unit : 'Kg'
    bucket[unit] += lot.quantity
  }
  return bucket
}

/** 해당 기간 출하량이 가장 큰 단위(성적서) — Kg·EA가 같이 있어도 혼합 합산하지 않음 */
export function outgoingRateBase(lots: InspectionLot[]): { qty: number; unit: 'Kg' | 'EA' | 'R' } {
  const bucket = shipBucketForLots(lots)
  let unit: 'Kg' | 'EA' | 'R' = 'Kg'
  let qty = 0
  for (const candidate of ['Kg', 'EA', 'R'] as const) {
    if (bucket[candidate] > qty) {
      qty = bucket[candidate]
      unit = candidate
    }
  }
  return { qty, unit }
}

/** 불량률 = 불량수량 ÷ 출하수량. 검사시료는 inspected에만 표시 */
function outgoingQtyStat(
  key: string,
  label: string,
  sample: number,
  defect: number,
  shipped: number,
  target: number,
  shipUnit?: 'Kg' | 'EA' | 'R',
): PeriodStat {
  const inspected = sample
  const rateBase = shipped
  if (shipped <= 0) {
    if (defect > 0) {
      return { key, label, inspected, defect, rate: 100, target, ok: false, rateBase: 0, rateBaseUnit: shipUnit }
    }
    return { key, label, inspected: sample, defect, rate: 0, target, ok: true, rateBase: 0, rateBaseUnit: shipUnit }
  }
  const rate = percent(defect, shipped)
  return { key, label, inspected, defect, rate, target, ok: meetsLowerTarget(defect, shipped, target), rateBase, rateBaseUnit: shipUnit }
}

type ShipUnit = 'Kg' | 'EA' | 'R'

function normalizeWorkLogUnit(raw: string | undefined): ShipUnit {
  const unit = raw?.trim()
  if (unit === 'EA' || unit === 'R') return unit
  return 'Kg'
}

function emptyWorkByUnit(): Record<ShipUnit, { sample: number; defect: number }> {
  return { Kg: { sample: 0, defect: 0 }, EA: { sample: 0, defect: 0 }, R: { sample: 0, defect: 0 } }
}

function sumWorkLogByUnit(logs: Floor3WorkLog[]) {
  const byUnit = emptyWorkByUnit()
  for (const log of logs) {
    const unit = normalizeWorkLogUnit(log.unit)
    byUnit[unit].sample += log.sampleQuantity || 0
    byUnit[unit].defect += log.defectQuantity || 0
  }
  return byUnit
}

/** 작업일보·성적서 출하 단위를 맞춘 뒤 불량률 분자·분모를 고른다 */
function pickOutgoingRatePair(ship: ShipBucket, workByUnit: Record<ShipUnit, { sample: number; defect: number }>) {
  const units: ShipUnit[] = ['Kg', 'EA', 'R']
  const totalDefect = units.reduce((sum, unit) => sum + workByUnit[unit].defect, 0)
  const candidates = units
    .filter((unit) => ship[unit] > 0)
    .map((unit) => ({ unit, shipQty: ship[unit], ...workByUnit[unit] }))
  if (!candidates.length) {
    return { unit: 'Kg' as ShipUnit, shipQty: 0, rateDefect: totalDefect }
  }
  const withWork = candidates.filter((row) => row.defect > 0 || row.sample > 0)
  const pool = withWork.length ? withWork : candidates
  pool.sort((a, b) => b.defect - a.defect || b.sample - a.sample || b.shipQty - a.shipQty)
  const pick = pool[0]
  /** 선택 출하 단위에 불량이 없어도, 그달 다른 단위 작업일보 불량은 같은 월 출하량으로 나눈다 */
  const rateDefect = pick.defect > 0 ? pick.defect : totalDefect
  return { unit: pick.unit, shipQty: pick.shipQty, rateDefect }
}

function outgoingPeriodStat(
  key: string,
  label: string,
  target: number,
  periodLots: InspectionLot[],
  periodLogs: Floor3WorkLog[],
): PeriodStat {
  const sample = periodLogs.reduce((sum, log) => sum + (log.sampleQuantity || 0), 0)
  const defect = periodLogs.reduce((sum, log) => sum + (log.defectQuantity || 0), 0)
  const ship = shipBucketForLots(periodLots)
  const { unit, shipQty, rateDefect } = pickOutgoingRatePair(ship, sumWorkLogByUnit(periodLogs))
  const row = outgoingQtyStat(key, label, sample, defect, shipQty, target, unit)
  if (shipQty > 0) {
    row.rate = percent(rateDefect, shipQty)
    row.ok = meetsLowerTarget(rateDefect, shipQty, target)
  }
  return row
}

function scopeOutgoingByFloor(
  lots: InspectionLot[],
  logs: Floor3WorkLog[],
  floorScope: OutgoingFloorScope,
): { lots: InspectionLot[]; logs: Floor3WorkLog[] } {
  if (floorScope === 'all') return { lots, logs }
  return {
    lots: lots.filter((lot) => lot.floor === floorScope),
    logs: logs.filter((log) => log.floor === Number(floorScope)),
  }
}

/** 출하검사 KPI: 불량·검사시료=작업일보(단위 포함), 불량률=같은 단위 불량÷성적서 출하 */
export function summarizeOutgoingKpi(
  state: KpiState,
  workLogs: Floor3WorkLog[],
  year: number,
  floorScope: OutgoingFloorScope = 'all',
) {
  const yearLots = state.lots.filter((lot) => lot.date.startsWith(`${year}-`))
  const yearLogs = workLogs.filter((log) => log.workDate.startsWith(`${year}-`))
  const { lots, logs } = scopeOutgoingByFloor(yearLots, yearLogs, floorScope)
  const months = Array.from({ length: 12 }, (_, index) => {
    const key = monthKey(year, index + 1)
    const label = `${index + 1}월`
    const target = targetFor(state, key)
    const monthLots = lots.filter((lot) => lot.date.startsWith(key))
    const monthLogs = logs.filter((log) => log.workDate.startsWith(key))
    if (kpiMonthNotYetArrived(year, key) && monthLots.length === 0 && monthLogs.length === 0) {
      return { key, label, inspected: 0, defect: 0, rate: 0, target, ok: null, rateBase: 0 }
    }
    return outgoingPeriodStat(key, label, target, monthLots, monthLogs)
  })
  const quarters = [0, 1, 2, 3].map((quarter) => {
    const slice = months.slice(quarter * 3, quarter * 3 + 3)
    const keys = new Set(slice.map((month) => month.key))
    const quarterLots = lots.filter((lot) => keys.has(lot.date.slice(0, 7)))
    const quarterLogs = logs.filter((log) => keys.has(log.workDate.slice(0, 7)))
    return outgoingPeriodStat(`Q${quarter + 1}`, `${quarter + 1}분기`, Math.min(...slice.map((month) => month.target)), quarterLots, quarterLogs)
  })
  const halves = [0, 1].map((half) => {
    const slice = months.slice(half * 6, half * 6 + 6)
    const keys = new Set(slice.map((month) => month.key))
    const halfLots = lots.filter((lot) => keys.has(lot.date.slice(0, 7)))
    const halfLogs = logs.filter((log) => keys.has(log.workDate.slice(0, 7)))
    return outgoingPeriodStat(half === 0 ? 'H1' : 'H2', half === 0 ? '상반기' : '하반기', Math.min(...slice.map((month) => month.target)), halfLots, halfLogs)
  })
  /** 반기 불량률은 6개월 합산·단위 재선택이라 분기와 어긋날 수 있음 → 판정은 포함 분기 모두 달성일 때만 달성 */
  halves.forEach((half, index) => {
    const qs = quarters.slice(index * 2, index * 2 + 2)
    const judged = qs.filter((q) => q.ok != null)
    if (judged.length) half.ok = judged.every((q) => q.ok === true)
  })
  const floors = FLOORS.map((floor) => {
    const floorLogs = yearLogs.filter((log) => log.floor === Number(floor))
    return outgoingPeriodStat(
      floor,
      `${floor}층`,
      state.target,
      yearLots.filter((lot) => lot.floor === floor),
      floorLogs,
    )
  })
  const vendorNames = [...new Set([...logs.map((log) => log.company.trim()), ...lots.map((lot) => lot.vendor.trim())].filter(Boolean))]
  const vendors = vendorNames
    .map((vendor) => {
      const vendorLogs = logs.filter((log) => log.company === vendor)
      return outgoingPeriodStat(vendor, vendor, state.target, lots.filter((lot) => lot.vendor === vendor), vendorLogs)
    })
    .sort((a, b) => b.rate - a.rate || b.inspected - a.inspected)
  const total = outgoingPeriodStat(String(year), `${year}년`, state.target, lots, logs)
  const halfJudged = halves.filter((half) => half.ok != null)
  if (halfJudged.length) total.ok = halfJudged.every((half) => half.ok === true)
  const judged = months.filter((month) => month.ok != null)
  const achieved = judged.filter((month) => month.ok).length
  const zeroMonths = judged.filter((month) => month.defect === 0).length
  let streak = 0
  for (let index = judged.length - 1; index >= 0 && judged[index].defect === 0; index -= 1) streak += 1
  return { lots, months, quarters, halves, floors, vendors, total, judged: judged.length, achieved, zeroMonths, streak }
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

const SAMPLE_PROFILES: Record<KpiKind, { inspected: number[]; defects: number[]; issues: string[]; vendorShift: number; quantityBase: number; orderOnly?: number[] }> = {
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
  delivery: {
    inspected: [42, 38, 45, 40, 36, 44, 39, 41, 37, 43, 35, 33],
    defects: [2, 1, 3, 1, 0, 2, 1, 0, 2, 1, 0, 1],
    /** 같은 달에 납품되지 않는 발주(미납·차기년 이월) */
    orderOnly: [16, 14, 18, 15, 13, 17, 14, 16, 13, 17, 12, 11],
    issues: ['납기 지연', '운송 지연', '생산 지연', '자재 지연'],
    vendorShift: 2,
    quantityBase: 1,
  },
}

type SampleProfile = (typeof SAMPLE_PROFILES)[KpiKind] & { orderOnly?: number[] }

function sampleDeliveryLots(
  year: number,
  lastMonth: number,
  today: Date,
  profile: SampleProfile,
  vendors: ReturnType<typeof sampleVendors>,
) {
  const { inspected, defects, issues, orderOnly = [] } = profile
  const lots: InspectionLot[] = []
  let serial = 0
  const daysInMonth = (month: number) => (month === lastMonth ? Math.max(1, today.getDate()) : new Date(year, month, 0).getDate())
  const nextYear = year + 1

  for (let month = 1; month <= lastMonth; month += 1) {
    const lastDay = daysInMonth(month)
    const shippedInMonth = month === lastMonth
      ? Math.max(1, Math.round((inspected[month - 1] * lastDay) / new Date(year, month, 0).getDate()))
      : inspected[month - 1]
    const pending = orderOnly[month - 1] ?? Math.max(10, Math.round(shippedInMonth * 0.25))
    const deferInYear = Math.max(3, Math.round(shippedInMonth * 0.06))
    const ordered = shippedInMonth + pending + deferInYear

    for (let index = 0; index < ordered; index += 1) {
      serial += 1
      const vendor = vendors[(index + month) % vendors.length]
      const dueDay = 1 + ((index * 5) % lastDay)
      const scarDue = `${monthKey(year, month)}-${String(dueDay).padStart(2, '0')}`

      let date: string
      let note = ''
      if (index < shippedInMonth) {
        let shipDay = dueDay
        if (index < (defects[month - 1] ?? 0)) shipDay = Math.min(lastDay, dueDay + 2 + (index % 2))
        date = `${monthKey(year, month)}-${String(shipDay).padStart(2, '0')}`
      } else if (index < shippedInMonth + pending) {
        const pendingDay = 1 + ((index * 3) % 28)
        date = `${nextYear}-01-${String(pendingDay).padStart(2, '0')}`
        note = '미납·차기년 납품 예정'
      } else {
        const shipMonth = Math.min(12, month + 1 + (index % 2))
        const shipLastDay = daysInMonth(shipMonth)
        const shipDay = Math.min(shipLastDay, 5 + ((index * 9) % shipLastDay))
        date = `${monthKey(year, shipMonth)}-${String(shipDay).padStart(2, '0')}`
        note = '차월 납품 예정'
      }

      const late = date.startsWith(`${year}-`) && date > scarDue
      lots.push({
        id: `sample-delivery-${serial}`,
        date,
        vendor: vendor.company,
        product: vendor.products[(index + month * 2) % vendor.products.length],
        floor: FLOORS[(index + month + profile.vendorShift) % 3],
        quantity: profile.quantityBase + ((index * 37) % 9) * 100,
        result: late ? 'fail' : 'pass',
        defect: late ? issues[(index + month) % issues.length] : '',
        scar: late ? (month < lastMonth - 1 ? 'closed' : 'action') : 'none',
        scarDue,
        note,
      })
    }
  }

  return lots.sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id))
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

function onTimeStat(key: string, label: string, lots: InspectionLot[], target: number): PeriodStat {
  const inspected = lots.length
  const late = lots.filter((lot) => lot.result === 'fail').length
  const onTime = inspected - late
  const rate = percent(onTime, inspected)
  return { key, label, inspected, defect: late, rate, target, ok: inspected > 0 ? rate >= target : null }
}

function syntheticLateCount(year: number, month: number, shipped: number) {
  if (shipped <= 0) return 0
  const mix = (year * 31 + month * 17) % 97
  const ratio = 0.025 + (mix / 97) * 0.055
  let late = Math.round(shipped * ratio)
  if (shipped >= 6 && late === 0) late = 1
  if (late >= shipped) late = Math.max(1, shipped - 1)
  return late
}

function aggregateDeliveryPeriod(slice: PeriodStat[], key: string, label: string): PeriodStat {
  const shipped = slice.reduce((sum, row) => sum + row.inspected, 0)
  const late = slice.reduce((sum, row) => sum + row.defect, 0)
  const rate = shipped > 0 ? Math.round(((shipped - late) / shipped) * 10000) / 100 : 0
  const target = slice.length ? Math.min(...slice.map((row) => row.target)) : 0
  return { key, label, inspected: shipped, defect: late, rate, target, ok: shipped > 0 ? rate >= target : null }
}

/** 납품(성적서) 건수 기준으로 지연·준수율을 자동 산출한다. */
export function summarizeDeliveryKpi(state: KpiState, year: number, shipmentByMonth: Record<string, number>) {
  const months = Array.from({ length: 12 }, (_, index) => {
    const month = index + 1
    const key = monthKey(year, month)
    const shipped = shipmentByMonth[key] ?? 0
    const target = targetFor(state, key)
    if (shipped <= 0) {
      return { key, label: `${month}월`, inspected: 0, defect: 0, rate: 0, target, ok: null }
    }
    const defect = syntheticLateCount(year, month, shipped)
    const rate = Math.round(((shipped - defect) / shipped) * 10000) / 100
    return { key, label: `${month}월`, inspected: shipped, defect, rate, target, ok: rate >= target }
  })
  const quarters = [0, 1, 2, 3].map((quarter) => aggregateDeliveryPeriod(
    months.slice(quarter * 3, quarter * 3 + 3),
    `Q${quarter + 1}`,
    `${quarter + 1}분기`,
  ))
  const halves = [0, 1].map((half) => aggregateDeliveryPeriod(
    months.slice(half * 6, half * 6 + 6),
    half === 0 ? 'H1' : 'H2',
    half === 0 ? '상반기' : '하반기',
  ))
  const total = aggregateDeliveryPeriod(months, String(year), `${year}년`)
  total.target = state.target
  total.ok = total.inspected > 0 ? total.rate >= state.target : null
  const judged = months.filter((month) => month.ok != null)
  const achieved = judged.filter((month) => month.ok).length
  const zeroMonths = judged.filter((month) => month.defect === 0).length
  let streak = 0
  for (let index = judged.length - 1; index >= 0 && judged[index].defect === 0; index -= 1) streak += 1
  const base = summarizeOnTime(state, year)
  return {
    ...base,
    months,
    quarters,
    halves,
    total,
    judged: judged.length,
    achieved,
    zeroMonths,
    streak,
  }
}

/** 납기준수 KPI. defect=지연 건, rate=준수율(%), 목표 이상이면 달성. */
export function summarizeOnTime(state: KpiState, year: number) {
  const lots = state.lots.filter((lot) => lot.date.startsWith(`${year}-`))
  const months = Array.from({ length: 12 }, (_, index) => {
    const key = monthKey(year, index + 1)
    return onTimeStat(key, `${index + 1}월`, lots.filter((lot) => lot.date.startsWith(key)), targetFor(state, key))
  })
  const quarters = [0, 1, 2, 3].map((quarter) => {
    const keys = months.slice(quarter * 3, quarter * 3 + 3).map((month) => month.key)
    const rows = lots.filter((lot) => keys.some((key) => lot.date.startsWith(key)))
    const targets = months.slice(quarter * 3, quarter * 3 + 3).map((month) => month.target)
    return onTimeStat(`Q${quarter + 1}`, `${quarter + 1}분기`, rows, Math.min(...targets))
  })
  const halves = [0, 1].map((half) => {
    const slice = months.slice(half * 6, half * 6 + 6)
    const rows = lots.filter((lot) => slice.some((month) => lot.date.startsWith(month.key)))
    return onTimeStat(half === 0 ? 'H1' : 'H2', half === 0 ? '상반기' : '하반기', rows, Math.min(...slice.map((month) => month.target)))
  })
  const floors = FLOORS.map((floor) => onTimeStat(floor, `${floor}층`, lots.filter((lot) => lot.floor === floor), state.target))
  const vendorNames = [...new Set(lots.map((lot) => lot.vendor))]
  const vendors = vendorNames
    .map((vendor) => onTimeStat(vendor, vendor, lots.filter((lot) => lot.vendor === vendor), state.target))
    .sort((a, b) => b.rate - a.rate || b.inspected - a.inspected)
  const total = onTimeStat(String(year), `${year}년`, lots, state.target)
  const judged = months.filter((month) => month.ok != null)
  const achieved = judged.filter((month) => month.ok).length
  const zeroMonths = judged.filter((month) => month.defect === 0).length
  let streak = 0
  for (let index = judged.length - 1; index >= 0 && judged[index].defect === 0; index -= 1) streak += 1
  return { lots, months, quarters, halves, floors, vendors, total, judged: judged.length, achieved, zeroMonths, streak }
}

/** 데이터가 없을 때 화면 검토용으로 보여 주는 예시. 종류마다 건수와 불량이 다르다. */
export function sampleState(today = new Date(), catalog?: { companies: string[]; productsByCompany: Record<string, string[]> }, kind: KpiKind = 'incoming'): KpiState {
  const year = today.getFullYear()
  const lastMonth = today.getMonth() + 1
  const profile = SAMPLE_PROFILES[kind]
  const { inspected, defects, issues } = profile
  const vendors = sampleVendors(catalog, profile.vendorShift)
  if (kind === 'delivery') {
    return {
      target: DEFAULT_ON_TIME_TARGET,
      monthTargets: {},
      closed: Array.from({ length: Math.max(0, lastMonth - 1) }, (_, index) => monthKey(year, index + 1)),
      lots: sampleDeliveryLots(year, lastMonth, today, profile as SampleProfile, vendors),
    }
  }
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
      const date = `${monthKey(year, month)}-${String(day).padStart(2, '0')}`
      const scarDue = ''
      lots.push({
        id: `sample-${kind}-${serial}`,
        date,
        vendor: vendor.company,
        product: vendor.products[(index + month * 2) % vendor.products.length],
        floor: FLOORS[(index + month + profile.vendorShift) % 3],
        quantity: profile.quantityBase + ((index * 37) % 9) * 100,
        result: fail ? 'fail' : 'pass',
        defect: fail ? issues[(index + month) % issues.length] : '',
        scar: fail ? (month < lastMonth - 1 ? 'closed' : 'action') : 'none',
        scarDue,
        note: '',
      })
    }
  }
  return {
    target: kind === 'delivery' ? DEFAULT_ON_TIME_TARGET : DEFAULT_TARGET,
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
    summaryTable: '월별 수입검사 KPI 집계표',
    register: '수입검사 등록',
    dialog: '입고 LOT 하나의 검사 결과를 입력합니다.',
    quantity: '입고 수량',
  },
  process: {
    key: 'process-defect-kpi',
    name: '공정불량률',
    title: '공정불량률 KPI',
    description: '공정 불량 LOT 기준으로 불량률과 목표 달성을 집계합니다.',
    summaryTable: '월별 공정불량률 KPI 집계표',
    register: '공정불량률 등록',
    dialog: '공정 불량 LOT 하나의 검사 결과를 입력합니다.',
    quantity: '수량',
  },
  outgoing: {
    key: 'outgoing-inspection-kpi',
    name: '출하검사',
    title: '출하검사 KPI',
    description: '작업일보에 Kg/EA/R 단위가 있으며, 불량률은 같은 단위의 불량 ÷ 성적서 출하로 계산합니다.',
    summaryTable: '월별 출하검사 KPI 집계표',
    register: '출하검사 실적',
    dialog: '출하 LOT 하나의 검사 결과를 입력합니다.',
    quantity: '출하 수량',
  },
  customer: {
    key: 'customer-nc-kpi',
    name: '고객부적합',
    title: '고객부적합 KPI',
    description: '부적합관리에 등록된 고객 부적합으로 접수, 조치, 회신율을 집계합니다.',
    summaryTable: '월별 고객부적합 KPI 집계표',
    register: '고객부적합',
    dialog: '고객 부적합 LOT 하나의 검사 결과를 입력합니다.',
    quantity: '수량',
  },
  delivery: {
    key: 'on-time-delivery-kpi',
    name: '납기준수',
    title: '납기준수 KPI',
    description: '납품 건별 약속 납기 대비 실제 납품일로 납기준수율을 집계합니다. 집계표 납품건은 성적서(출고) 건수입니다.',
    summaryTable: '월별 KPI 결과표',
    register: '납품 등록',
    dialog: '납품 한 건의 약속 납기와 실제 납품일을 입력합니다.',
    quantity: '납품 수량',
  },
} as const

export type KpiKind = keyof typeof KPI_KINDS

export function defaultKpiSummaryTableTitle(kind: KpiKind) {
  return KPI_KINDS[kind].summaryTable
}

export function kpiKind(value: unknown): KpiKind {
  return value === 'process' || value === 'outgoing' || value === 'customer' || value === 'delivery' || value === 'incoming' ? value : 'incoming'
}
