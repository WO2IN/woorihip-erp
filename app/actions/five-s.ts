"use server"

import { revalidatePath } from "next/cache"
import { findOne, insertRow, removeWhere, selectWhere, updateById, selectAll, writeRows } from "@/lib/local-store"
import { FIVE_S_CATALOG } from "@/lib/constants/five-s-catalog"
import { canonicalFloor } from "@/lib/floor"
import { assertFiveSSheetFloor, assertFiveSTargetFloor, floorForNewTarget, requireActor, requireManager } from "@/lib/check-access"
import { checkStamp } from "@/lib/check-stamp"
import { isDayOffDate, isWeekend, scheduledDaysForCycle } from "@/lib/date-utils"

export async function getFiveSTargets() {
  return await selectAll("fiveSTargets")
}

export async function getFiveSTargetById(id: number) {
  return await findOne("fiveSTargets", (t: any) => t.id === id)
}

export async function createFiveSTarget(data: { name: string; floor?: string; department?: string; manager?: string; standard?: string }) {
  const actor = await requireManager()
  const floor = floorForNewTarget(actor, data.floor, data.name)
  const result = await insertRow("fiveSTargets", {
    ...data,
    floor: canonicalFloor(floor, data.name),
    createdAt: new Date().toISOString(),
  })
  revalidatePath("/checksheets/5s")
  return result
}

export async function deleteFiveSTarget(id: number) {
  const actor = await requireManager()
  await assertFiveSTargetFloor(actor, id)
  const items = await selectWhere("fiveSCheckItems", (i: any) => i.targetId === id)
  const sheets = await selectWhere("fiveSSheets", (s: any) => s.targetId === id)
  const itemCodes = new Set(items.map((i: any) => i.code))
  const sheetIds = new Set(sheets.map((s: any) => s.id))
  await removeWhere("fiveSEntries", (e: any) => itemCodes.has(e.itemCode) || sheetIds.has(e.sheetId))
  await removeWhere("fiveSCheckItems", (i: any) => i.targetId === id)
  await removeWhere("fiveSSheets", (s: any) => s.targetId === id)
  await removeWhere("fiveSTargets", (t: any) => t.id === id)
  revalidatePath("/checksheets/5s")
}

export async function updateFiveSTarget(id: number, data: { name?: string; floor?: string; department?: string; manager?: string; standard?: string }) {
  const actor = await requireManager()
  await assertFiveSTargetFloor(actor, id)
  const floor = data.floor !== undefined ? floorForNewTarget(actor, data.floor, data.name) : undefined
  const result = await updateById("fiveSTargets", id, {
    ...data,
    ...(floor !== undefined || data.name !== undefined
      ? { floor: canonicalFloor(floor ?? data.floor, data.name) }
      : {}),
  })
  revalidatePath("/checksheets/5s")
  revalidatePath(`/checksheets/5s/${id}`)
  return result
}

export async function getFiveSCheckItems(targetId: number) {
  const existing = await selectWhere("fiveSCheckItems", (i: any) => i.targetId === targetId)
  if (existing.length > 0) {
    return existing.sort((a: any, b: any) => a.category.localeCompare(b.category) || a.no - b.no)
  }
  // Seed with the default catalog on first access so existing behavior is preserved.
  return writeRows("fiveSCheckItems", {
    insert: FIVE_S_CATALOG.map((item) => ({
      targetId,
      category: item.category,
      no: item.no,
      content: item.content,
      cycle: item.cycle,
      code: `t${targetId}-${item.code}`,
    })),
  })
}

export async function createFiveSCheckItem(
  targetId: number,
  data: { category: string; content: string; cycle: string },
) {
  const actor = await requireManager()
  await assertFiveSTargetFloor(actor, targetId)
  const siblings = await selectWhere("fiveSCheckItems", (i: any) => i.targetId === targetId && i.category === data.category)
  const nextNo = siblings.length > 0 ? Math.max(...siblings.map((i: any) => i.no)) + 1 : 1
  const created = await insertRow("fiveSCheckItems", {
    targetId,
    category: data.category,
    no: nextNo,
    content: data.content,
    cycle: data.cycle || "일",
    code: `t${targetId}-c${Date.now()}`,
  })
  revalidatePath("/checksheets/5s")
  revalidatePath(`/checksheets/5s/${targetId}`)
  return created
}

export async function updateFiveSCheckItem(
  id: number,
  targetId: number,
  data: { content?: string; cycle?: string },
) {
  const actor = await requireManager()
  await assertFiveSTargetFloor(actor, targetId)
  const result = await updateById("fiveSCheckItems", id, data)
  revalidatePath("/checksheets/5s")
  revalidatePath(`/checksheets/5s/${targetId}`)
  return result
}

export async function deleteFiveSCheckItem(id: number, targetId: number) {
  const actor = await requireManager()
  await assertFiveSTargetFloor(actor, targetId)
  const item = await findOne<any>("fiveSCheckItems", (i: any) => i.id === id)
  await removeWhere("fiveSCheckItems", (i: any) => i.id === id)
  if (item) {
    await removeWhere("fiveSEntries", (e: any) => e.itemCode === item.code)
  }
  revalidatePath("/checksheets/5s")
  revalidatePath(`/checksheets/5s/${targetId}`)
}

export async function getOrCreateFiveSSheet(targetId: number, year: number, month: number) {
  const existing = await findOne("fiveSSheets", (s: any) => s.targetId === targetId && s.year === year && s.month === month)
  if (existing) return existing

  return await insertRow("fiveSSheets", {
    targetId,
    year,
    month,
    remarks: null,
    writer: null,
    reviewer: null,
    approver: null,
    createdAt: new Date().toISOString(),
  })
}

export async function getFiveSEntries(sheetId: number) {
  return await selectWhere("fiveSEntries", (e: any) => e.sheetId === sheetId)
}

export async function upsertFiveSEntry(sheetId: number, itemCode: string, day: number, value: string) {
  const actor = await requireActor()
  await assertFiveSSheetFloor(actor, sheetId)
  const stamp = checkStamp(actor, value || null)
  const existing = await findOne(
    "fiveSEntries",
    (e: any) => e.sheetId === sheetId && e.itemCode === itemCode && e.day === day,
  )

  if (existing) {
    await updateById("fiveSEntries", (existing as any).id, { value, ...stamp })
  } else {
    await insertRow("fiveSEntries", { sheetId, itemCode, day, value, ...stamp })
  }
  revalidatePath("/checksheets/5s")
  revalidatePath("/checksheets/5s/[targetId]", "layout")
}

export async function bulkFillFiveSEntries(
  sheetId: number,
  year: number,
  month: number,
  uptoDay: number,
  symbol: string,
  items: { code: string; cycle: string }[],
  fromDay = 1,
) {
  const actor = await requireActor()
  await assertFiveSSheetFloor(actor, sheetId)
  const sheet = await findOne<any>("fiveSSheets", (s: any) => s.id === sheetId)
  const holidays: number[] = sheet?.holidays ?? []
  const workdays: number[] = sheet?.workdays ?? []
  const isDayOff = (day: number) => isDayOffDate(year, month, day, holidays, workdays)
  const startDay = Math.max(1, fromDay)

  const sheetEntries = await selectWhere<any>("fiveSEntries", (e: any) => e.sheetId === sheetId)
  const byKey = new Map<string, any>()
  for (const entry of sheetEntries) {
    const key = `${entry.itemCode}:${entry.day}`
    if (!byKey.has(key)) byKey.set(key, entry)
  }
  const insert: Record<string, any>[] = []
  const patch: { id: number; patch: Record<string, any> }[] = []

  for (const item of items) {
    const hasNA = sheetEntries.some((e: any) => e.itemCode === item.code && e.value === "N/A")
    if (hasNA) continue

    const scheduledDays = scheduledDaysForCycle(
      year,
      month,
      startDay,
      uptoDay,
      item.cycle,
      isDayOff,
    )

    for (const day of scheduledDays) {
      const key = `${item.code}:${day}`
      const existing = byKey.get(key)
      if (existing?.value) continue
      const stamp = checkStamp(actor, symbol)
      if (existing) patch.push({ id: existing.id, patch: { value: symbol, ...stamp } })
      else insert.push({ sheetId, itemCode: item.code, day, value: symbol, ...stamp })
      byKey.set(key, { ...existing, value: symbol })
    }
  }
  await writeRows("fiveSEntries", { insert, patch })
  revalidatePath("/checksheets/5s")
  revalidatePath("/checksheets/5s/[targetId]", "layout")
}

export async function clearFiveSSheetEntries(sheetId: number) {
  const actor = await requireManager()
  await assertFiveSSheetFloor(actor, sheetId)
  await removeWhere("fiveSEntries", (e: any) => e.sheetId === sheetId)
  revalidatePath("/checksheets/5s")
  revalidatePath("/checksheets/5s/[targetId]", "layout")
}

export async function updateFiveSSheetFields(
  sheetId: number,
  fields: { remarks?: string; writer?: string; reviewer?: string; approver?: string },
) {
  const actor = await requireManager()
  await assertFiveSSheetFloor(actor, sheetId)
  await updateById("fiveSSheets", sheetId, fields)
  revalidatePath("/checksheets/5s")
  revalidatePath("/checksheets/5s/[targetId]", "layout")
}

export async function toggleFiveSHoliday(sheetId: number, day: number) {
  const actor = await requireManager()
  await assertFiveSSheetFloor(actor, sheetId)
  const sheet = await findOne<any>("fiveSSheets", (s: any) => s.id === sheetId)
  if (!sheet) return []
  if (isWeekend(sheet.year, sheet.month, day)) {
    const current: number[] = sheet.workdays ?? []
    const opening = !current.includes(day)
    const next = opening ? [...current, day].sort((a, b) => a - b) : current.filter((d) => d !== day)
    await updateById("fiveSSheets", sheetId, { workdays: next })
    if (!opening) {
      await removeWhere("fiveSEntries", (e: any) => e.sheetId === sheetId && e.day === day)
    }
    revalidatePath("/checksheets/5s")
    revalidatePath("/checksheets/5s/[targetId]", "layout")
    return next
  }
  const current: number[] = sheet.holidays ?? []
  const adding = !current.includes(day)
  const next = adding ? [...current, day].sort((a, b) => a - b) : current.filter((d) => d !== day)
  await updateById("fiveSSheets", sheetId, { holidays: next })
  if (adding) {
    await removeWhere("fiveSEntries", (e: any) => e.sheetId === sheetId && e.day === day)
  }
  revalidatePath("/checksheets/5s")
  revalidatePath("/checksheets/5s/[targetId]", "layout")
  return next
}
