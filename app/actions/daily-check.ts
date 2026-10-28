"use server"

import { revalidatePath } from "next/cache"
import { findOne, insertRow, removeWhere, selectWhere, updateById, updateWhere, writeRows } from "@/lib/local-store"
import { isDayOffDate, isWeekend, scheduledDaysForCycle } from "@/lib/date-utils"
import { assertDailySheetFloor, requireActor, requireManager, type CheckActor } from "@/lib/check-access"
import { checkStamp } from "@/lib/check-stamp"

type MarkLogEntry = { role: "inspector" | "manager"; day: number; name: string; userId: string; at: string }

async function staffMarkName(sheet: { equipmentId?: number }, role: "inspector" | "manager", actor: CheckActor) {
  const equip = sheet.equipmentId
    ? await findOne<any>("equipment", (e: any) => e.id === sheet.equipmentId)
    : null
  const configured = role === "inspector" ? equip?.inspectorName : equip?.managerName
  const trimmed = typeof configured === "string" ? configured.trim() : ""
  return trimmed || actor.displayName
}

function nextMarkLog(
  current: MarkLogEntry[] | undefined,
  role: "inspector" | "manager",
  day: number,
  name: string,
  userId: string,
  marked: boolean,
) {
  const rest = (current ?? []).filter((row) => !(row.role === role && row.day === day))
  if (!marked) return rest
  return [...rest, { role, day, name, userId, at: new Date().toISOString() }]
}

function appendMarkLogs(
  current: MarkLogEntry[] | undefined,
  role: "inspector" | "manager",
  days: number[],
  existing: number[],
  name: string,
  userId: string,
) {
  const next = [...(current ?? [])]
  const at = new Date().toISOString()
  for (const day of days) {
    if (existing.includes(day)) continue
    next.push({ role, day, name, userId, at })
  }
  return next
}

/** 예정일 중 아직 값이 없는 칸만 symbol 로 채운다. */
async function fillEmptyEntries(
  sheetId: number,
  items: { id: number; cycle?: string | null }[],
  symbol: string,
  actor: CheckActor,
  scheduledDays: (item: { id: number; cycle?: string | null }) => number[],
) {
  const byKey = new Map<string, any>()
  for (const entry of await selectWhere<any>("dailyCheckEntries", (e: any) => e.sheetId === sheetId)) {
    const key = `${entry.itemId}:${entry.day}`
    if (!byKey.has(key)) byKey.set(key, entry)
  }
  const insert: Record<string, any>[] = []
  const patch: { id: number; patch: Record<string, any> }[] = []
  for (const item of items) {
    for (const day of new Set(scheduledDays(item))) {
      const key = `${item.id}:${day}`
      const existing = byKey.get(key)
      if (existing?.value) continue
      const stamp = checkStamp(actor, symbol)
      if (existing) patch.push({ id: existing.id, patch: { value: symbol, ...stamp } })
      else insert.push({ sheetId, itemId: item.id, day, value: symbol, ...stamp })
      byKey.set(key, { ...existing, value: symbol })
    }
  }
  await writeRows("dailyCheckEntries", { insert, patch })
}

function revalidateDaily() {
  revalidatePath("/checksheets/daily")
  revalidatePath("/checksheets/daily/[equipmentId]", "layout")
}

export async function getOrCreateDailyCheckSheet(equipmentId: number, year: number, month: number) {
  const existing = await findOne(
    "dailyCheckSheets",
    (s: any) => s.equipmentId === equipmentId && s.year === year && s.month === month,
  )
  if (existing) return existing

  const equip = await findOne("equipment", (e: any) => e.id === equipmentId)
  return await insertRow("dailyCheckSheets", {
    equipmentId,
    year,
    month,
    department: (equip as any)?.department ?? null,
    manager: (equip as any)?.manager ?? null,
    writer: null,
    reviewer: null,
    approver: null,
    createdAt: new Date().toISOString(),
  })
}

export async function getDailyCheckEntries(sheetId: number) {
  return await selectWhere("dailyCheckEntries", (e: any) => e.sheetId === sheetId)
}

export async function upsertDailyCheckEntry(sheetId: number, itemId: number, day: number, value: string) {
  const actor = await requireActor()
  await assertDailySheetFloor(actor, sheetId)
  const stamp = checkStamp(actor, value || null)
  const existing = await findOne(
    "dailyCheckEntries",
    (e: any) => e.sheetId === sheetId && e.itemId === itemId && e.day === day,
  )

  if (existing) {
    await updateById("dailyCheckEntries", (existing as any).id, { value, ...stamp })
  } else {
    await insertRow("dailyCheckEntries", { sheetId, itemId, day, value, ...stamp })
  }
  revalidateDaily()
}

export async function bulkFillDailyCheckEntries(
  sheetId: number,
  year: number,
  month: number,
  uptoDay: number,
  symbol: string,
  items: { id: number; cycle?: string | null }[],
  fromDay = 1,
) {
  const actor = await requireActor()
  await assertDailySheetFloor(actor, sheetId)
  const sheet = await findOne<any>("dailyCheckSheets", (s: any) => s.id === sheetId)
  const holidays: number[] = sheet?.holidays ?? []
  const workdays: number[] = sheet?.workdays ?? []
  const isDayOff = (day: number) => isDayOffDate(year, month, day, holidays, workdays)
  const startDay = Math.max(1, fromDay)

  await fillEmptyEntries(sheetId, items, symbol, actor, (item) =>
    scheduledDaysForCycle(year, month, startDay, uptoDay, item.cycle || "일", isDayOff),
  )
  revalidateDaily()
}

export async function toggleDailyCheckMark(sheetId: number, role: "inspector" | "manager", day: number) {
  const actor = await requireActor()
  await assertDailySheetFloor(actor, sheetId)
  const sheet = await findOne<any>("dailyCheckSheets", (s: any) => s.id === sheetId)
  if (!sheet) return
  const field = role === "inspector" ? "inspectorMarks" : "managerMarks"
  const current: number[] = sheet[field] ?? []
  const marked = !current.includes(day)
  const next = marked ? [...current, day].sort((a, b) => a - b) : current.filter((d) => d !== day)
  await updateById("dailyCheckSheets", sheetId, {
    [field]: next,
    markLog: nextMarkLog(
      sheet.markLog,
      role,
      day,
      await staffMarkName(sheet, role, actor),
      actor.id,
      marked,
    ),
  })
  revalidateDaily()
  return next
}

export async function fillDailyCheckMarks(
  sheetId: number,
  year: number,
  month: number,
  fromDay: number,
  toDay: number,
  inspectorCycle = "1회/일",
  managerCycle = "1회/주",
) {
  const actor = await requireActor()
  await assertDailySheetFloor(actor, sheetId)
  const sheet = await findOne<any>("dailyCheckSheets", (s: any) => s.id === sheetId)
  if (!sheet) return
  const holidays: number[] = sheet.holidays ?? []
  const workdays: number[] = sheet.workdays ?? []
  const isDayOff = (day: number) => isDayOffDate(year, month, day, holidays, workdays)
  const inspectorDays = scheduledDaysForCycle(year, month, fromDay, toDay, inspectorCycle || "1회/일", isDayOff)
  const managerDays = scheduledDaysForCycle(year, month, fromDay, toDay, managerCycle || "1회/주", isDayOff)
  const previousInspector: number[] = sheet.inspectorMarks ?? []
  const previousManager: number[] = sheet.managerMarks ?? []
  const inspectorMarks = Array.from(new Set([...previousInspector, ...inspectorDays])).sort((a, b) => a - b)
  const managerMarks = Array.from(new Set([...previousManager, ...managerDays])).sort((a, b) => a - b)
  const markLog = appendMarkLogs(
    appendMarkLogs(
      sheet.markLog,
      "inspector",
      inspectorDays,
      previousInspector,
      await staffMarkName(sheet, "inspector", actor),
      actor.id,
    ),
    "manager",
    managerDays,
    previousManager,
    await staffMarkName(sheet, "manager", actor),
    actor.id,
  )
  await updateById("dailyCheckSheets", sheetId, { inspectorMarks, managerMarks, markLog })
  revalidateDaily()
}

export async function fillDailyCheckSheet(
  sheetId: number,
  year: number,
  month: number,
  fromDay: number,
  toDay: number,
  symbol: string,
  items: { id: number; cycle?: string | null }[],
  inspectorCycle = "1회/일",
  managerCycle = "1회/주",
) {
  const actor = await requireActor()
  await assertDailySheetFloor(actor, sheetId)
  const sheet = await findOne<any>("dailyCheckSheets", (s: any) => s.id === sheetId)
  if (!sheet) return
  const holidays: number[] = sheet.holidays ?? []
  const workdays: number[] = sheet.workdays ?? []
  const isDayOff = (day: number) => isDayOffDate(year, month, day, holidays, workdays)
  const startDay = Math.max(1, fromDay)

  await fillEmptyEntries(sheetId, items, symbol, actor, (item) =>
    scheduledDaysForCycle(year, month, startDay, toDay, item.cycle || "일", isDayOff),
  )

  const inspectorDays = scheduledDaysForCycle(year, month, startDay, toDay, inspectorCycle || "1회/일", isDayOff)
  const managerDays = scheduledDaysForCycle(year, month, startDay, toDay, managerCycle || "1회/주", isDayOff)
  const latest = await findOne<any>("dailyCheckSheets", (s: any) => s.id === sheetId) ?? sheet
  const previousInspector: number[] = latest.inspectorMarks ?? []
  const previousManager: number[] = latest.managerMarks ?? []
  const inspectorMarks = Array.from(new Set([...previousInspector, ...inspectorDays])).sort((a, b) => a - b)
  const managerMarks = Array.from(new Set([...previousManager, ...managerDays])).sort((a, b) => a - b)
  const markLog = appendMarkLogs(
    appendMarkLogs(latest.markLog, "inspector", inspectorDays, previousInspector, await staffMarkName(latest, "inspector", actor), actor.id),
    "manager",
    managerDays,
    previousManager,
    await staffMarkName(latest, "manager", actor),
    actor.id,
  )
  await updateById("dailyCheckSheets", sheetId, { inspectorMarks, managerMarks, markLog })
  revalidateDaily()
}

export async function clearDailyCheckSheetEntries(sheetId: number) {
  const actor = await requireManager()
  await assertDailySheetFloor(actor, sheetId)
  await removeWhere("dailyCheckEntries", (e: any) => e.sheetId === sheetId)
  await updateById("dailyCheckSheets", sheetId, { inspectorMarks: [], managerMarks: [], markLog: [] })
  revalidateDaily()
}

export async function updateDailyCheckSheetFields(
  sheetId: number,
  fields: { department?: string; manager?: string; writer?: string; reviewer?: string; approver?: string },
) {
  const actor = await requireManager()
  await assertDailySheetFloor(actor, sheetId)
  await updateById("dailyCheckSheets", sheetId, fields)
  revalidateDaily()
}

export async function toggleDailyCheckHoliday(sheetId: number, day: number) {
  const actor = await requireManager()
  await assertDailySheetFloor(actor, sheetId)
  const sheet = await findOne<any>("dailyCheckSheets", (s: any) => s.id === sheetId)
  if (!sheet) return []
  if (isWeekend(sheet.year, sheet.month, day)) {
    const current: number[] = sheet.workdays ?? []
    const opening = !current.includes(day)
    const next = opening ? [...current, day].sort((a, b) => a - b) : current.filter((d) => d !== day)
    const patch: Record<string, unknown> = { workdays: next }
    if (!opening) {
      await removeWhere("dailyCheckEntries", (e: any) => e.sheetId === sheetId && e.day === day)
      patch.inspectorMarks = (sheet.inspectorMarks ?? []).filter((d: number) => d !== day)
      patch.managerMarks = (sheet.managerMarks ?? []).filter((d: number) => d !== day)
      patch.markLog = (sheet.markLog ?? []).filter((row: MarkLogEntry) => row.day !== day)
    }
    await updateById("dailyCheckSheets", sheetId, patch)
    revalidateDaily()
    return next
  }
  const current: number[] = sheet.holidays ?? []
  const adding = !current.includes(day)
  const next = adding ? [...current, day].sort((a, b) => a - b) : current.filter((d) => d !== day)
  const patch: Record<string, unknown> = { holidays: next }
  if (adding) {
    await removeWhere("dailyCheckEntries", (e: any) => e.sheetId === sheetId && e.day === day)
    patch.inspectorMarks = (sheet.inspectorMarks ?? []).filter((d: number) => d !== day)
    patch.managerMarks = (sheet.managerMarks ?? []).filter((d: number) => d !== day)
    patch.markLog = (sheet.markLog ?? []).filter((row: MarkLogEntry) => row.day !== day)
  }
  await updateById("dailyCheckSheets", sheetId, patch)
  revalidateDaily()
  return next
}

export async function getDailyCheckIssues(sheetId: number) {
  return (await selectWhere("dailyCheckIssues", (i: any) => i.sheetId === sheetId)).sort((a: any, b: any) => a.id - b.id)
}

export async function addDailyCheckIssue(sheetId: number) {
  const actor = await requireActor()
  await assertDailySheetFloor(actor, sheetId)
  await insertRow("dailyCheckIssues", {
    sheetId,
    occurredDate: null,
    cause: null,
    action: null,
    processedDate: null,
    note: null,
    createdAt: new Date().toISOString(),
  })
  revalidatePath("/checksheets/daily")
  revalidatePath("/checksheets/daily/[equipmentId]", "layout")
}

export async function updateDailyCheckIssue(
  id: number,
  fields: { occurredDate?: string; cause?: string; action?: string; processedDate?: string; note?: string },
) {
  const actor = await requireActor()
  const issue = await findOne<any>("dailyCheckIssues", (i: any) => i.id === id)
  if (!issue) throw new Error("이력을 찾을 수 없습니다.")
  await assertDailySheetFloor(actor, issue.sheetId)
  await updateWhere("dailyCheckIssues", (i: any) => i.id === id, fields)
  revalidatePath("/checksheets/daily")
  revalidatePath("/checksheets/daily/[equipmentId]", "layout")
}

export async function deleteDailyCheckIssue(id: number) {
  const actor = await requireActor()
  const issue = await findOne<any>("dailyCheckIssues", (i: any) => i.id === id)
  if (issue) await assertDailySheetFloor(actor, issue.sheetId)
  await removeWhere("dailyCheckIssues", (i: any) => i.id === id)
  revalidatePath("/checksheets/daily")
  revalidatePath("/checksheets/daily/[equipmentId]", "layout")
}
