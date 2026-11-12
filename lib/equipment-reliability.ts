export type ReliabilityTargets = {
  mtbfTargetHours: number
  mttrTargetHours: number
  dailyOperatingHours: number
}

export const DEFAULT_RELIABILITY_TARGETS: ReliabilityTargets = {
  mtbfTargetHours: 200,
  mttrTargetHours: 2,
  dailyOperatingHours: 20,
}

export type EmergencyHistoryRow = {
  id: number
  equipmentId: number
  occurredDate?: string | null
  processedDate?: string | null
}

export type PeriodBucket = {
  key: string
  label: string
  start: string
  end: string
}

export type ReliabilityPeriodStats = {
  operatingHours: number
  failureCount: number
  repairCount: number
  repairHours: number
  mtbfHours: number | null
  mttrHours: number | null
  mtbfOk: boolean | null
  mttrOk: boolean | null
}

export type ReliabilityYearSummary = {
  year: number
  equipmentCount: number
  targets: ReliabilityTargets
  quarters: ReliabilityPeriodStats[]
  halves: ReliabilityPeriodStats[]
  total: ReliabilityPeriodStats
}

function parseYmd(value: string | null | undefined) {
  if (!value || typeof value !== 'string') return null
  const trimmed = value.trim().slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null
  const date = new Date(`${trimmed}T12:00:00`)
  return Number.isNaN(date.getTime()) ? null : date
}

function daysInclusive(start: string, end: string) {
  const a = parseYmd(start)
  const b = parseYmd(end)
  if (!a || !b) return 0
  return Math.max(0, Math.round((b.getTime() - a.getTime()) / 86_400_000) + 1)
}

function hoursBetween(start: string | null | undefined, end: string | null | undefined) {
  const a = parseYmd(start)
  const b = parseYmd(end)
  if (!a || !b) return null
  const hours = (b.getTime() - a.getTime()) / 3_600_000
  return hours > 0 ? hours : null
}

function inRange(occurred: string, start: string, end: string) {
  return occurred >= start && occurred <= end
}

function bucketForYear(year: number): { quarters: PeriodBucket[]; halves: PeriodBucket[]; yearStart: string; yearEnd: string } {
  const quarters: PeriodBucket[] = [1, 2, 3, 4].map((q) => {
    const startMonth = (q - 1) * 3 + 1
    const endMonth = startMonth + 2
    const endDay = new Date(year, endMonth, 0).getDate()
    return {
      key: `Q${q}`,
      label: `${q}분기`,
      start: `${year}-${String(startMonth).padStart(2, '0')}-01`,
      end: `${year}-${String(endMonth).padStart(2, '0')}-${String(endDay).padStart(2, '0')}`,
    }
  })
  const halves: PeriodBucket[] = [
    { key: 'H1', label: '상반기', start: `${year}-01-01`, end: `${year}-06-30` },
    { key: 'H2', label: '하반기', start: `${year}-07-01`, end: `${year}-12-31` },
  ]
  return { quarters, halves, yearStart: `${year}-01-01`, yearEnd: `${year}-12-31` }
}

function aggregatePeriod(
  histories: EmergencyHistoryRow[],
  start: string,
  end: string,
  targets: ReliabilityTargets,
  equipmentCount: number,
): ReliabilityPeriodStats {
  const days = daysInclusive(start, end)
  const units = Math.max(1, equipmentCount)
  const operatingHours = days * targets.dailyOperatingHours * units

  const inPeriod = histories.filter((row) => {
    const occurred = row.occurredDate?.trim().slice(0, 10)
    return occurred && inRange(occurred, start, end)
  })

  const failureCount = inPeriod.length
  const repairHoursList = inPeriod
    .map((row) => hoursBetween(row.occurredDate, row.processedDate))
    .filter((value): value is number => value != null)

  const repairCount = repairHoursList.length
  const repairHours = repairHoursList.reduce((sum, value) => sum + value, 0)

  const mtbfHours =
    failureCount > 0
      ? Math.max(0, (operatingHours - repairHours) / failureCount)
      : operatingHours > 0
        ? operatingHours
        : null

  const mttrHours = repairCount > 0 ? repairHours / repairCount : null

  const mtbfOk = mtbfHours == null ? null : mtbfHours >= targets.mtbfTargetHours
  const mttrOk = mttrHours == null ? (failureCount === 0 ? true : null) : mttrHours <= targets.mttrTargetHours

  return {
    operatingHours,
    failureCount,
    repairCount,
    repairHours,
    mtbfHours,
    mttrHours,
    mtbfOk,
    mttrOk,
  }
}

export function summarizeReliabilityMonths(
  year: number,
  histories: EmergencyHistoryRow[],
  equipmentCount: number,
  targets: ReliabilityTargets,
): ReliabilityPeriodStats[] {
  const withDates = histories.filter((row) => parseYmd(row.occurredDate))
  const months: ReliabilityPeriodStats[] = []
  for (let month = 1; month <= 12; month += 1) {
    const start = `${year}-${String(month).padStart(2, '0')}-01`
    const endDay = new Date(year, month, 0).getDate()
    const end = `${year}-${String(month).padStart(2, '0')}-${String(endDay).padStart(2, '0')}`
    months.push(aggregatePeriod(withDates, start, end, targets, equipmentCount))
  }
  return months
}

export function summarizeReliabilityYear(
  year: number,
  histories: EmergencyHistoryRow[],
  equipmentCount: number,
  targets: ReliabilityTargets,
): ReliabilityYearSummary {
  const { quarters, halves, yearStart, yearEnd } = bucketForYear(year)
  const withDates = histories.filter((row) => parseYmd(row.occurredDate))
  const quartersStats = quarters.map((bucket) => aggregatePeriod(withDates, bucket.start, bucket.end, targets, equipmentCount))
  const halvesStats = halves.map((bucket) => aggregatePeriod(withDates, bucket.start, bucket.end, targets, equipmentCount))
  const total = aggregatePeriod(withDates, yearStart, yearEnd, targets, equipmentCount)

  return {
    year,
    equipmentCount: Math.max(0, equipmentCount),
    targets,
    quarters: quartersStats,
    halves: halvesStats,
    total,
  }
}

export function normalizeReliabilityTargets(value: unknown): ReliabilityTargets {
  const base = { ...DEFAULT_RELIABILITY_TARGETS }
  if (!value || typeof value !== 'object') return base
  const row = value as Record<string, unknown>
  const num = (key: keyof ReliabilityTargets) => {
    const n = Number(row[key])
    return Number.isFinite(n) && n > 0 ? n : base[key]
  }
  return {
    mtbfTargetHours: num('mtbfTargetHours'),
    mttrTargetHours: num('mttrTargetHours'),
    dailyOperatingHours: num('dailyOperatingHours'),
  }
}
