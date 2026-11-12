import type { ReliabilityPeriodStats } from '@/lib/equipment-reliability'

export const REPORT_YEAR = 2026
export const MTBF_TARGET = 200
export const MTTR_TARGET = 2
export const EMPTY_CELL = '-'

export const MTBF_BAR_OK = '#1d4ed8'
export const MTBF_BAR_FAIL = '#dc2626'
export const MTTR_LINE = '#ea580c'

export const TABS = ['종합현황', '설비대장', '고장등록', '수리이력', '예방보전(PM)', 'KPI 목표설정', '보고서'] as const
export type Tab = (typeof TABS)[number]

export type MonthRow = {
  label: string
  run: number | null
  fail: number | null
  repair: number | null
  mtbf: number | null
  mttr: number | null
  avail: number | null
  pending?: boolean
}

export type MtbfFilters = { line: string; category: string; equipmentNo: string }

export type EquipmentSeed = {
  name: string
  note: string
  fail: number
  repair: number
  mttr: number
}

export type EquipmentRow = EquipmentSeed & { share: number; ok: boolean }

export const EMPTY_FILTERS: MtbfFilters = { line: '전체', category: '전체', equipmentNo: '전체' }

export const LINE_OPTIONS = ['전체', '도금라인', '조립라인']
export const CATEGORY_OPTIONS = ['전체', '도요필터', '유틸리티', '환경설비']
export const EQUIPMENT_NO_OPTIONS = ['전체', '도요필터', '여과·순환펌프', '호이스트·이송', '히터·보일러', '스크러버', '폐수처리']

export const PERIOD_LABEL = `${REPORT_YEAR}.01 ~ ${REPORT_YEAR}.12`

/** 종합현황 레이아웃용 예시 */
export const DEMO_MONTHS: MonthRow[] = [
  { label: '1월', run: 520, fail: 3, repair: 6.5, mtbf: 173, mttr: 2.17, avail: 98.8 },
  { label: '2월', run: 480, fail: 2, repair: 3.8, mtbf: 240, mttr: 1.9, avail: 99.2 },
  { label: '3월', run: 540, fail: 4, repair: 9.6, mtbf: 135, mttr: 2.4, avail: 98.3 },
  { label: '4월', run: 530, fail: 2, repair: 3.2, mtbf: 265, mttr: 1.6, avail: 99.4 },
  { label: '5월', run: 545, fail: 3, repair: 5.7, mtbf: 182, mttr: 1.9, avail: 99.0 },
  { label: '6월', run: 525, fail: 2, repair: 3.0, mtbf: 260, mttr: 1.5, avail: 99.4 },
  { label: '7월', run: 520, fail: 3, repair: 6.6, mtbf: 178, mttr: 2.2, avail: 98.8 },
  { label: '8월', run: 535, fail: 4, repair: 10.4, mtbf: 125, mttr: 2.6, avail: 98.0 },
  { label: '9월', run: 500, fail: 2, repair: 3.4, mtbf: 262, mttr: 1.7, avail: 99.4 },
  { label: '10월', run: 540, fail: 2, repair: 3.6, mtbf: 270, mttr: 1.8, avail: 99.3 },
  { label: '11월', run: 515, fail: 2, repair: 3.2, mtbf: 258, mttr: 1.6, avail: 99.4 },
  { label: '12월', run: null, fail: null, repair: null, mtbf: null, mttr: null, avail: null, pending: true },
]

export const DEMO_EQUIPMENT: EquipmentSeed[] = [
  { name: '정류기', note: '도금라인', fail: 7, repair: 16.1, mttr: 2.3 },
  { name: '여과·순환펌프', note: '도금라인', fail: 6, repair: 9.0, mttr: 1.5 },
  { name: '호이스트·이송', note: '3층 랙', fail: 5, repair: 12.5, mttr: 2.5 },
  { name: '히터·보일러', note: '유틸리티', fail: 4, repair: 8.4, mttr: 2.1 },
  { name: '스크러버', note: '환경설비', fail: 3, repair: 6.3, mttr: 2.1 },
  { name: '폐수처리', note: '환경설비', fail: 2, repair: 3.5, mttr: 1.75 },
]

const TOYO_NAMES = ['정류기', '여과·순환펌프', '도요필터']

export function monthColumnLabel(label: string) {
  return `${label.replace('월', '').padStart(2, '0')}월`
}

export function formatCell(value: number | null, digits = 0) {
  if (value == null) return EMPTY_CELL
  return value.toLocaleString('ko-KR', { minimumFractionDigits: digits, maximumFractionDigits: digits })
}

export function round1(value: number) {
  return Math.round(value * 10) / 10
}

export function round2(value: number) {
  return Math.round(value * 100) / 100
}

export function meetsTargets(row: MonthRow, mtbfTarget = MTBF_TARGET, mttrTarget = MTTR_TARGET) {
  return (row.mtbf ?? 0) >= mtbfTarget && (row.mttr ?? 99) <= mttrTarget
}

export function aggregateMonths(rows: MonthRow[], mtbfTarget = MTBF_TARGET, mttrTarget = MTTR_TARGET) {
  const closed = rows.filter((row) => !row.pending)
  const sumRun = closed.reduce((acc, row) => acc + (row.run ?? 0), 0)
  const sumFail = closed.reduce((acc, row) => acc + (row.fail ?? 0), 0)
  const sumRepair = closed.reduce((acc, row) => acc + (row.repair ?? 0), 0)
  const cumMtbf = sumFail > 0 ? Math.round(sumRun / sumFail) : null
  const cumMttr = sumFail > 0 ? round2(sumRepair / sumFail) : null
  const bothOk = closed.filter((row) => meetsTargets(row, mtbfTarget, mttrTarget)).length
  const avgAvail = closed.length > 0 ? round2(closed.reduce((acc, row) => acc + (row.avail ?? 0), 0) / closed.length) : null
  const peakFail = peakClosed(closed, 'fail')
  const peakRepair = peakClosed(closed, 'repair')
  const rangeLabel = closed.length === 0 ? '누계' : `${closed[0].label.replace('월', '')}~${closed[closed.length - 1].label} 누계`
  return { closed, sumRun, sumFail, sumRepair, cumMtbf, cumMttr, bothOk, avgAvail, peakFail, peakRepair, rangeLabel }
}

function peakClosed(rows: MonthRow[], key: 'fail' | 'repair') {
  if (rows.length === 0) return null
  return rows.reduce((best, row) => ((row[key] ?? 0) > (best[key] ?? 0) ? row : best))
}

export function periodStatsToMonthRows(year: number, stats: ReliabilityPeriodStats[]): MonthRow[] {
  const now = new Date()
  return stats.map((row, index) => {
    const month = index + 1
    const label = `${month}월`
    const inFuture = year > now.getFullYear() || (year === now.getFullYear() && month > now.getMonth() + 1)
    const hasActivity = row.failureCount > 0 || row.repairHours > 0
    const pending = inFuture && !hasActivity
    const mtbf = row.mtbfHours != null ? Math.round(row.mtbfHours) : null
    const mttr = row.mttrHours != null ? round2(row.mttrHours) : null
    const avail = mtbf != null && mttr != null && mtbf + mttr > 0 ? Math.round((mtbf / (mtbf + mttr)) * 1000) / 10 : null

    if (pending) {
      return { label, run: null, fail: null, repair: null, mtbf: null, mttr: null, avail: null, pending: true }
    }

    return {
      label,
      run: Math.round(row.operatingHours),
      fail: row.failureCount,
      repair: row.repairHours > 0 ? round1(row.repairHours) : 0,
      mtbf,
      mttr,
      avail,
    }
  })
}

export function filterEquipmentRows(rows: EquipmentSeed[], filters: MtbfFilters) {
  return rows.filter((row) => {
    if (filters.equipmentNo !== '전체' && row.name !== filters.equipmentNo) return false
    if (filters.line === '도금라인' && !row.note.includes('도금')) return false
    if (filters.line === '조립라인' && !row.note.includes('3층') && !row.note.includes('조립')) return false
    if (filters.category === '유틸리티' && row.note !== '유틸리티') return false
    if (filters.category === '환경설비' && row.note !== '환경설비') return false
    if (filters.category === '도요필터' && !TOYO_NAMES.includes(row.name)) return false
    return true
  })
}

export function decorateEquipment(rows: EquipmentSeed[], mttrTarget = MTTR_TARGET): EquipmentRow[] {
  const totalFail = rows.reduce((acc, row) => acc + row.fail, 0)
  return rows.map((row) => ({
    ...row,
    share: totalFail > 0 ? Math.round((row.fail / totalFail) * 100) : 0,
    ok: row.mttr <= mttrTarget,
  }))
}

export function sumEquipment(rows: EquipmentRow[], mttrTarget = MTTR_TARGET) {
  const fail = rows.reduce((acc, row) => acc + row.fail, 0)
  const repair = rows.reduce((acc, row) => acc + row.repair, 0)
  const mttr = fail > 0 ? round2(repair / fail) : null
  return { fail, repair, mttr, ok: mttr != null && mttr <= mttrTarget }
}
