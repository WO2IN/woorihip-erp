import { scheduledDaysForCycle } from '@/lib/date-utils'

export type TodayStatus = 'done' | 'missing' | 'off'

export function isDueOnDay(
  year: number,
  month: number,
  day: number,
  cycle: string,
  isDayOff: (day: number) => boolean,
): boolean {
  if (isDayOff(day)) return false
  return scheduledDaysForCycle(year, month, day, day, cycle || '일', isDayOff).includes(day)
}

export function statusFromSlots(slots: { due: boolean; filled: boolean }[]): TodayStatus {
  const due = slots.filter((slot) => slot.due)
  if (due.length === 0) return 'off'
  return due.every((slot) => slot.filled) ? 'done' : 'missing'
}

const STATUS_RANK: Record<TodayStatus, number> = { missing: 0, done: 1, off: 2 }

export function compareTodayStatus(a: TodayStatus, b: TodayStatus): number {
  return STATUS_RANK[a] - STATUS_RANK[b]
}

export function todayStatusLabel(status: TodayStatus, weekend: boolean): string {
  if (status === 'done') return '오늘 완료'
  if (status === 'missing') return '미점검'
  return weekend ? '휴무' : '오늘 해당 없음'
}

export function filledValue(value: string | null | undefined): boolean {
  return Boolean(value && value.trim())
}

export type UncheckedDay = { year: number; month: number; day: number }

/** 비어 있는 날을 월 단위로 짧게 적는다. 하루면 `10월 30일`, 여러 날이면 `11월 미체크 2일`. */
export function uncheckedDaysLabel(days: UncheckedDay[], today = new Date()) {
  const seen = new Set<string>()
  const byMonth = new Map<string, { year: number; month: number; days: number[] }>()
  for (const item of days) {
    if (item.day < 1 || item.month < 1 || item.month > 12) continue
    const key = `${item.year}-${item.month}`
    const group = byMonth.get(key) ?? { year: item.year, month: item.month, days: [] }
    const dayKey = `${key}-${item.day}`
    if (!seen.has(dayKey)) {
      seen.add(dayKey)
      group.days.push(item.day)
    }
    byMonth.set(key, group)
  }
  const groups = [...byMonth.values()].sort((a, b) => b.year - a.year || b.month - a.month)
  if (groups.length === 0) return ''
  const shown = groups.slice(0, 2).map((group) => {
    const yearLabel = group.year === today.getFullYear() ? '' : `${group.year}년 `
    if (group.days.length === 1) return `${yearLabel}${group.month}월 ${group.days[0]}일`
    return `${yearLabel}${group.month}월 미체크 ${group.days.length}일`
  })
  const rest = groups.length - shown.length
  return `${shown.join(' · ')}${rest > 0 ? ` 외 ${rest}달` : ''}`
}
