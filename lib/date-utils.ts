export function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate()
}

export function isWeekend(year: number, month: number, day: number): boolean {
  const date = new Date(year, month - 1, day)
  const dow = date.getDay()
  return dow === 0 || dow === 6
}

export function isDayOffDate(
  year: number,
  month: number,
  day: number,
  holidays: readonly number[] = [],
  workdays: readonly number[] = [],
): boolean {
  if (holidays.includes(day)) return true
  return isWeekend(year, month, day) && !workdays.includes(day)
}

export function dayOfWeekLabel(year: number, month: number, day: number): string {
  const labels = ["일", "월", "화", "수", "목", "금", "토"]
  const date = new Date(year, month - 1, day)
  return labels[date.getDay()]
}

export function getDayRange(year: number, month: number): number[] {
  const count = daysInMonth(year, month)
  return Array.from({ length: count }, (_, i) => i + 1)
}

export function currentYearMonth(): { year: number; month: number } {
  const now = new Date()
  return { year: now.getFullYear(), month: now.getMonth() + 1 }
}

export function getCheckerInitial(name: string) {
  const trimmed = name.trim()
  return trimmed ? trimmed[0] : ''
}

export function lastWorkingDaysByWeek(
  year: number,
  month: number,
  fromDay: number,
  toDay: number,
  isDayOff: (day: number) => boolean,
): number[] {
  return scheduledDaysForCycle(year, month, fromDay, toDay, '1회/주', isDayOff)
}

export function parseCheckCycle(cycle: string): { unit: '일' | '주' | '월'; times: number } {
  const trimmed = cycle.trim()
  const match = trimmed.match(/^(\d+)\s*회\s*\/\s*(일|주|월)$/)
  if (match) {
    return { times: Math.max(1, Number(match[1])), unit: match[2] as '일' | '주' | '월' }
  }
  if (trimmed.includes('주')) return { times: 1, unit: '주' }
  if (trimmed.includes('월')) return { times: 1, unit: '월' }
  return { times: 1, unit: '일' }
}

function pickSpreadDays(days: number[], times: number): number[] {
  if (days.length === 0 || times <= 0) return []
  if (times >= days.length) return [...days]
  if (times === 1) return [days[0]]
  const picked: number[] = []
  for (let i = 0; i < times; i++) {
    picked.push(days[Math.round((i * (days.length - 1)) / (times - 1))])
  }
  return Array.from(new Set(picked)).sort((a, b) => a - b)
}

function workingDaysByWeek(
  year: number,
  month: number,
  fromDay: number,
  toDay: number,
  isDayOff: (day: number) => boolean,
): number[][] {
  const weeks = new Map<number, number[]>()
  for (let day = fromDay; day <= toDay; day++) {
    if (isDayOff(day)) continue
    const date = new Date(year, month - 1, day)
    const mondayOffset = (date.getDay() + 6) % 7
    const weekStart = new Date(year, month - 1, day - mondayOffset)
    const key = weekStart.getTime()
    const list = weeks.get(key) ?? []
    list.push(day)
    weeks.set(key, list)
  }
  return Array.from(weeks.values())
}

export function scheduledDaysForCycle(
  year: number,
  month: number,
  fromDay: number,
  toDay: number,
  cycle: string,
  isDayOff: (day: number) => boolean,
): number[] {
  const { unit, times } = parseCheckCycle(cycle)
  const last = daysInMonth(year, month)
  const inRange = (day: number) => day >= fromDay && day <= toDay

  if (unit === '일') {
    const working: number[] = []
    for (let day = fromDay; day <= toDay; day++) {
      if (!isDayOff(day)) working.push(day)
    }
    return working
  }

  if (unit === '월') {
    const monthWorking: number[] = []
    for (let day = 1; day <= last; day++) {
      if (!isDayOff(day)) monthWorking.push(day)
    }
    return pickSpreadDays(monthWorking, times).filter(inRange)
  }

  return workingDaysByWeek(year, month, 1, last, isDayOff)
    .flatMap((days) => pickSpreadDays(days, times))
    .filter(inRange)
}
