"use server"

import { selectAll } from "@/lib/local-store"
import { daysInMonth, isDayOffDate, isWeekend } from "@/lib/date-utils"
import { filledValue, isDueOnDay, statusFromSlots, type TodayStatus, type UncheckedDay } from "@/lib/today-check"

function dayOffChecker(year: number, month: number, holidays: number[] | undefined, workdays: number[] | undefined) {
  return (day: number) => isDayOffDate(year, month, day, holidays ?? [], workdays ?? [])
}

export async function getTodayCheckStatuses(targetDate?: string) {
  const now = targetDate ? new Date(`${targetDate}T00:00:00`) : new Date()
  const year = now.getFullYear()
  const month = now.getMonth() + 1
  const day = now.getDate()

  const equipment = await selectAll<any>("equipment")
  const dailyItems = await selectAll<any>("dailyCheckItems")
  const dailySheets = await selectAll<any>("dailyCheckSheets")
  const dailyEntries = await selectAll<any>("dailyCheckEntries")
  const fiveSTargets = await selectAll<any>("fiveSTargets")
  const fiveSItems = await selectAll<any>("fiveSCheckItems")
  const fiveSSheets = await selectAll<any>("fiveSSheets")
  const fiveSEntries = await selectAll<any>("fiveSEntries")
  const tempTargets = await selectAll<any>("tempHumidityTargets")
  const tempSheets = await selectAll<any>("tempHumiditySheets")
  const tempEntries = await selectAll<any>("tempHumidityEntries")

  const monthsToScan = (sheets: { year?: number; month?: number }[]) => {
    const keys = new Map<string, { year: number; month: number }>()
    for (const sheet of sheets) {
      const sheetYear = Number(sheet.year)
      const sheetMonth = Number(sheet.month)
      if (!sheetYear || !sheetMonth) continue
      if (sheetYear > year || (sheetYear === year && sheetMonth > month)) continue
      keys.set(`${sheetYear}-${sheetMonth}`, { year: sheetYear, month: sheetMonth })
    }
    keys.set(`${year}-${month}`, { year, month })
    return [...keys.values()].sort((a, b) => a.year - b.year || a.month - b.month)
  }

  const throughDay = (sheetYear: number, sheetMonth: number) => (
    sheetYear === year && sheetMonth === month ? day : daysInMonth(sheetYear, sheetMonth)
  )
  const dateKey = (sheetYear: number, sheetMonth: number, sheetDay: number) => sheetYear * 10000 + sheetMonth * 100 + sheetDay
  const remember = (current: number | null, next: number) => (current == null || next < current ? next : current)

  const daily: Record<number, TodayStatus> = {}
  const dailyGaps: Record<number, UncheckedDay[]> = {}
  for (const equip of equipment) {
    const currentSheet = dailySheets.find((row) => row.equipmentId === equip.id && row.year === year && row.month === month)
    const isCurrentOff = dayOffChecker(year, month, currentSheet?.holidays, currentSheet?.workdays)
    const items = dailyItems.filter((row) => row.equipmentId === equip.id)
    const equipSheets = dailySheets.filter((row) => row.equipmentId === equip.id)
    const equipSheetIds = new Set(equipSheets.map((row) => row.id))
    let started: number | null = null
    for (const row of dailyEntries) {
      if (!equipSheetIds.has(row.sheetId) || !filledValue(row.value)) continue
      const sheet = equipSheets.find((item) => item.id === row.sheetId)
      if (!sheet) continue
      started = remember(started, dateKey(Number(sheet.year), Number(sheet.month), Number(row.day)))
    }
    for (const sheet of equipSheets) {
      for (const mark of [...(sheet.inspectorMarks ?? []), ...(sheet.managerMarks ?? [])]) {
        started = remember(started, dateKey(Number(sheet.year), Number(sheet.month), Number(mark)))
      }
    }
    const filledToday = dailyEntries.some((row) => row.sheetId === currentSheet?.id && row.day === day && filledValue(row.value))
    daily[equip.id] = statusFromSlots([{ due: !isCurrentOff(day), filled: filledToday }])
    const gaps: UncheckedDay[] = []
    if (started == null) {
      dailyGaps[equip.id] = gaps
      continue
    }
    for (const when of monthsToScan(equipSheets)) {
      const sheet = dailySheets.find((row) => row.equipmentId === equip.id && row.year === when.year && row.month === when.month)
      const isDayOff = dayOffChecker(when.year, when.month, sheet?.holidays, sheet?.workdays)
      const sheetEntries = dailyEntries.filter((row) => row.sheetId === sheet?.id)
      const inspectorMarks: number[] = sheet?.inspectorMarks ?? []
      const managerMarks: number[] = sheet?.managerMarks ?? []
      for (let current = 1; current <= throughDay(when.year, when.month); current += 1) {
        if (isDayOff(current)) continue
        const itemGap = items.some((item) => (
          isDueOnDay(when.year, when.month, current, item.cycle || "일", isDayOff)
          && !sheetEntries.some((row) => row.itemId === item.id && row.day === current && filledValue(row.value))
        ))
        const inspectorGap = isDueOnDay(when.year, when.month, current, equip.inspectorCycle || "1회/일", isDayOff) && !inspectorMarks.includes(current)
        const managerGap = isDueOnDay(when.year, when.month, current, equip.managerCycle || "1회/주", isDayOff) && !managerMarks.includes(current)
        if (dateKey(when.year, when.month, current) < started) continue
        if (itemGap || inspectorGap || managerGap) gaps.push({ year: when.year, month: when.month, day: current })
      }
    }
    dailyGaps[equip.id] = gaps
  }

  const fiveS: Record<number, TodayStatus> = {}
  const fiveSGaps: Record<number, UncheckedDay[]> = {}
  for (const target of fiveSTargets) {
    const currentSheet = fiveSSheets.find((row) => row.targetId === target.id && row.year === year && row.month === month)
    const isCurrentOff = dayOffChecker(year, month, currentSheet?.holidays, currentSheet?.workdays)
    const items = fiveSItems.filter((row) => row.targetId === target.id)
    const targetSheets = fiveSSheets.filter((row) => row.targetId === target.id)
    const targetSheetIds = new Set(targetSheets.map((row) => row.id))
    let started: number | null = null
    for (const row of fiveSEntries) {
      if (!targetSheetIds.has(row.sheetId) || !filledValue(row.value)) continue
      const sheet = targetSheets.find((item) => item.id === row.sheetId)
      if (!sheet) continue
      started = remember(started, dateKey(Number(sheet.year), Number(sheet.month), Number(row.day)))
    }
    const filledToday = fiveSEntries.some((row) => row.sheetId === currentSheet?.id && row.day === day && filledValue(row.value) && row.value !== "N/A")
    fiveS[target.id] = statusFromSlots([{ due: !isCurrentOff(day), filled: filledToday }])
    const gaps: UncheckedDay[] = []
    if (started == null) {
      fiveSGaps[target.id] = gaps
      continue
    }
    for (const when of monthsToScan(targetSheets)) {
      const sheet = fiveSSheets.find((row) => row.targetId === target.id && row.year === when.year && row.month === when.month)
      const isDayOff = dayOffChecker(when.year, when.month, sheet?.holidays, sheet?.workdays)
      const sheetEntries = fiveSEntries.filter((row) => row.sheetId === sheet?.id)
      const skipped = new Set(items.filter((item) => sheetEntries.some((row) => row.itemCode === item.code && row.value === "N/A")).map((item) => item.code))
      for (let current = 1; current <= throughDay(when.year, when.month); current += 1) {
        if (isDayOff(current)) continue
        const missing = items.some((item) => (
          !skipped.has(item.code)
          && isDueOnDay(when.year, when.month, current, item.cycle || "일", isDayOff)
          && !sheetEntries.some((row) => row.itemCode === item.code && row.day === current && filledValue(row.value))
        ))
        if (dateKey(when.year, when.month, current) < started) continue
        if (missing) gaps.push({ year: when.year, month: when.month, day: current })
      }
    }
    fiveSGaps[target.id] = gaps
  }

  const temp: Record<number, TodayStatus> = {}
  const tempGaps: Record<number, UncheckedDay[]> = {}
  for (const target of tempTargets) {
    const currentSheet = tempSheets.find((row) => row.targetId === target.id && row.year === year && row.month === month)
    const isCurrentOff = dayOffChecker(year, month, currentSheet?.holidays, currentSheet?.workdays)
    const entry = tempEntries.find((row) => row.sheetId === currentSheet?.id && row.day === day)
    const due = !isCurrentOff(day)
    const placeSheets = tempSheets.filter((row) => row.targetId === target.id)
    const placeSheetIds = new Set(placeSheets.map((row) => row.id))
    let started: number | null = null
    for (const row of tempEntries) {
      if (!placeSheetIds.has(row.sheetId)) continue
      if (!filledValue(row.temperature) && !filledValue(row.humidity) && !filledValue(row.checker)) continue
      const sheet = placeSheets.find((item) => item.id === row.sheetId)
      if (!sheet) continue
      started = remember(started, dateKey(Number(sheet.year), Number(sheet.month), Number(row.day)))
    }
    temp[target.id] = statusFromSlots([
      { due, filled: filledValue(entry?.temperature) || filledValue(entry?.humidity) },
    ])
    const gaps: UncheckedDay[] = []
    if (started == null) {
      tempGaps[target.id] = gaps
      continue
    }
    for (const when of monthsToScan(placeSheets)) {
      const sheet = tempSheets.find((row) => row.targetId === target.id && row.year === when.year && row.month === when.month)
      const isDayOff = dayOffChecker(when.year, when.month, sheet?.holidays, sheet?.workdays)
      for (let current = 1; current <= throughDay(when.year, when.month); current += 1) {
        if (isDayOff(current)) continue
        const row = tempEntries.find((item) => item.sheetId === sheet?.id && item.day === current)
        if (dateKey(when.year, when.month, current) < started) continue
        if (!filledValue(row?.temperature) || !filledValue(row?.humidity) || !filledValue(row?.checker)) {
          gaps.push({ year: when.year, month: when.month, day: current })
        }
      }
    }
    tempGaps[target.id] = gaps
  }

  return {
    year,
    month,
    day,
    weekend: isWeekend(year, month, day),
    daily,
    fiveS,
    temp,
    gaps: { daily: dailyGaps, fiveS: fiveSGaps, temp: tempGaps },
  }
}
