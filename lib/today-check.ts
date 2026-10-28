import { isWeekend, scheduledDaysForCycle } from '@/lib/date-utils'

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

export function isWeekendToday(year: number, month: number, day: number): boolean {
  return isWeekend(year, month, day)
}
