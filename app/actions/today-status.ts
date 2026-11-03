"use server"

import { selectAll } from "@/lib/local-store"
import { isDayOffDate, isWeekend } from "@/lib/date-utils"
import { filledValue, statusFromSlots, type TodayStatus } from "@/lib/today-check"

function dayOffChecker(year: number, month: number, holidays: number[] | undefined, workdays: number[] | undefined) {
  return (day: number) => isDayOffDate(year, month, day, holidays ?? [], workdays ?? [])
}

export async function getTodayCheckStatuses() {
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth() + 1
  const day = now.getDate()

  const equipment = await selectAll<any>("equipment")
  const dailySheets = await selectAll<any>("dailyCheckSheets")
  const dailyEntries = await selectAll<any>("dailyCheckEntries")
  const fiveSTargets = await selectAll<any>("fiveSTargets")
  const fiveSSheets = await selectAll<any>("fiveSSheets")
  const fiveSEntries = await selectAll<any>("fiveSEntries")
  const tempTargets = await selectAll<any>("tempHumidityTargets")
  const tempSheets = await selectAll<any>("tempHumiditySheets")
  const tempEntries = await selectAll<any>("tempHumidityEntries")

  const daily: Record<number, TodayStatus> = {}
  for (const equip of equipment) {
    const sheet = dailySheets.find((row) => row.equipmentId === equip.id && row.year === year && row.month === month)
    const isDayOff = dayOffChecker(year, month, sheet?.holidays, sheet?.workdays)
    const filledToday = dailyEntries.some(
      (row) => row.sheetId === sheet?.id && row.day === day && filledValue(row.value),
    )
    daily[equip.id] = statusFromSlots([{ due: !isDayOff(day), filled: filledToday }])
  }

  const fiveS: Record<number, TodayStatus> = {}
  for (const target of fiveSTargets) {
    const sheet = fiveSSheets.find((row) => row.targetId === target.id && row.year === year && row.month === month)
    const isDayOff = dayOffChecker(year, month, sheet?.holidays, sheet?.workdays)
    const sheetEntries = fiveSEntries.filter((row) => row.sheetId === sheet?.id)
    const filledToday = sheetEntries.some((row) => row.day === day && filledValue(row.value) && row.value !== "N/A")
    fiveS[target.id] = statusFromSlots([{ due: !isDayOff(day), filled: filledToday }])
  }

  const temp: Record<number, TodayStatus> = {}
  for (const target of tempTargets) {
    const sheet = tempSheets.find((row) => row.targetId === target.id && row.year === year && row.month === month)
    const isDayOff = dayOffChecker(year, month, sheet?.holidays, sheet?.workdays)
    const entry = tempEntries.find((row) => row.sheetId === sheet?.id && row.day === day)
    const due = !isDayOff(day)
    temp[target.id] = statusFromSlots([
      { due, filled: filledValue(entry?.temperature) || filledValue(entry?.humidity) },
    ])
  }

  return { year, month, day, weekend: isWeekend(year, month, day), daily, fiveS, temp }
}
