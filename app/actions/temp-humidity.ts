"use server"

import { revalidatePath } from "next/cache"
import { findOne, insertRow, removeWhere, selectWhere, updateById, selectAll, writeRows } from "@/lib/local-store"
import { canonicalFloor } from "@/lib/floor"
import { assertTempSheetFloor, assertTempTargetFloor, floorForNewTarget, requireActor, requireManager } from "@/lib/check-access"
import { checkStamp } from "@/lib/check-stamp"
import { getCheckerInitial, isWeekend } from "@/lib/date-utils"

export async function getTempHumidityTargets() {
  return await selectAll("tempHumidityTargets")
}

export async function getTempHumidityTargetById(id: number) {
  return await findOne("tempHumidityTargets", (t: any) => t.id === id)
}

export async function createTempHumidityTarget(data: {
  name: string
  floor?: string
  department?: string
  manager?: string
  standard?: string
  tempLower?: number | null
  tempUpper?: number | null
  humidityLower?: number | null
  humidityUpper?: number | null
}) {
  const actor = await requireManager()
  const floor = floorForNewTarget(actor, data.floor, data.name)
  const result = await insertRow("tempHumidityTargets", {
    tempLower: 10,
    tempUpper: 30,
    humidityLower: 0,
    humidityUpper: 60,
    ...data,
    floor: canonicalFloor(floor, data.name),
    createdAt: new Date().toISOString(),
  })
  revalidatePath("/checksheets/temp-humidity")
  return result
}

export async function deleteTempHumidityTarget(id: number) {
  const actor = await requireManager()
  await assertTempTargetFloor(actor, id)
  const sheets = await selectWhere("tempHumiditySheets", (s: any) => s.targetId === id)
  const sheetIds = new Set(sheets.map((s: any) => s.id))
  await removeWhere("tempHumidityEntries", (e: any) => sheetIds.has(e.sheetId))
  await removeWhere("tempHumidityIssues", (i: any) => sheetIds.has(i.sheetId) || i.targetId === id)
  await removeWhere("tempHumiditySheets", (s: any) => s.targetId === id)
  await removeWhere("tempHumidityTargets", (t: any) => t.id === id)
  revalidatePath("/checksheets/temp-humidity")
}

export async function updateTempHumidityTarget(
  id: number,
  data: {
    name?: string
    floor?: string
    department?: string
    manager?: string
    standard?: string
    tempLower?: number | null
    tempUpper?: number | null
    humidityLower?: number | null
    humidityUpper?: number | null
  },
) {
  const actor = await requireManager()
  await assertTempTargetFloor(actor, id)
  const floor = data.floor !== undefined ? floorForNewTarget(actor, data.floor, data.name) : undefined
  const result = await updateById("tempHumidityTargets", id, {
    ...data,
    ...(floor !== undefined || data.name !== undefined
      ? { floor: canonicalFloor(floor ?? data.floor, data.name) }
      : {}),
  })
  revalidatePath("/checksheets/temp-humidity")
  revalidatePath(`/checksheets/temp-humidity/${id}`)
  return result
}

export async function getOrCreateTempHumiditySheet(targetId: number, year: number, month: number) {
  const existing = await findOne("tempHumiditySheets", (s: any) => s.targetId === targetId && s.year === year && s.month === month)
  if (existing) return existing

  return await insertRow("tempHumiditySheets", {
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

export async function getTempHumidityEntries(sheetId: number) {
  return (await selectWhere("tempHumidityEntries", (e: any) => e.sheetId === sheetId)).sort(
    (a: any, b: any) => a.day - b.day,
  )
}

export async function upsertTempHumidityEntry(
  sheetId: number,
  day: number,
  fields: { temperature?: string | null; humidity?: string | null; checker?: string | null },
) {
  const actor = await requireActor()
  await assertTempSheetFloor(actor, sheetId)
  const existing = await findOne("tempHumidityEntries", (e: any) => e.sheetId === sheetId && e.day === day)
  const merged = { ...(existing as any), ...fields }
  const hasValue = Boolean(merged.temperature || merged.humidity || merged.checker)
  const stamp = checkStamp(actor, hasValue ? "1" : null)
  const checkerSource =
    fields.checker !== undefined
      ? fields.checker
      : merged.checker || (fields.temperature || fields.humidity ? actor.displayName : null)
  const checker = getCheckerInitial(checkerSource || "") || null
  const patch = {
    ...fields,
    ...stamp,
    ...(fields.checker !== undefined || checker ? { checker } : {}),
  }

  if (existing) {
    await updateById("tempHumidityEntries", (existing as any).id, patch)
  } else {
    await insertRow("tempHumidityEntries", { sheetId, day, ...patch })
  }
  revalidatePath("/checksheets/temp-humidity")
  revalidatePath("/checksheets/temp-humidity/[targetId]", "layout")
}

export async function bulkUpsertTempHumidityEntries(
  sheetId: number,
  entries: { day: number; temperature: string; humidity: string; checker?: string | null }[],
) {
  const actor = await requireActor()
  await assertTempSheetFloor(actor, sheetId)
  const byDay = new Map<number, any>()
  for (const entry of await selectWhere<any>("tempHumidityEntries", (e: any) => e.sheetId === sheetId)) {
    if (!byDay.has(entry.day)) byDay.set(entry.day, entry)
  }
  const insert: Record<string, any>[] = []
  const patches = new Map<number, Record<string, any>>()
  for (const { day, temperature, humidity, checker } of entries) {
    const existing = byDay.get(day)
    const stamp = checkStamp(actor, "1")
    if (existing) {
      const patch: Record<string, string> = {}
      if (!existing.temperature) patch.temperature = temperature
      if (!existing.humidity) patch.humidity = humidity
      const existingChecker = getCheckerInitial(existing.checker || "")
      const nextChecker = getCheckerInitial(checker || "") || existingChecker
      if (nextChecker && existing.checker !== nextChecker) patch.checker = nextChecker
      if (Object.keys(patch).length > 0) {
        Object.assign(existing, patch, stamp)
        if (existing.id !== undefined) patches.set(existing.id, { ...patches.get(existing.id), ...patch, ...stamp })
      }
    } else {
      const row = {
        sheetId,
        day,
        temperature,
        humidity,
        checker: getCheckerInitial(checker || actor.displayName),
        ...stamp,
      }
      insert.push(row)
      byDay.set(day, row)
    }
  }
  await writeRows("tempHumidityEntries", {
    insert,
    patch: [...patches].map(([id, patch]) => ({ id, patch })),
  })
  revalidatePath("/checksheets/temp-humidity")
  revalidatePath("/checksheets/temp-humidity/[targetId]", "layout")
}

export async function clearTempHumidityEntries(sheetId: number) {
  const actor = await requireManager()
  await assertTempSheetFloor(actor, sheetId)
  await removeWhere("tempHumidityEntries", (e: any) => e.sheetId === sheetId)
  revalidatePath("/checksheets/temp-humidity")
  revalidatePath("/checksheets/temp-humidity/[targetId]", "layout")
}

export async function updateTempHumiditySheetFields(
  sheetId: number,
  fields: { remarks?: string; writer?: string; reviewer?: string; approver?: string },
) {
  const actor = await requireManager()
  await assertTempSheetFloor(actor, sheetId)
  await updateById("tempHumiditySheets", sheetId, fields)
  revalidatePath("/checksheets/temp-humidity")
  revalidatePath("/checksheets/temp-humidity/[targetId]", "layout")
}

export async function toggleTempHumidityHoliday(sheetId: number, day: number) {
  const actor = await requireManager()
  await assertTempSheetFloor(actor, sheetId)
  const sheet = await findOne<any>("tempHumiditySheets", (s: any) => s.id === sheetId)
  if (!sheet) return []
  if (isWeekend(sheet.year, sheet.month, day)) {
    const current: number[] = sheet.workdays ?? []
    const opening = !current.includes(day)
    const next = opening ? [...current, day].sort((a, b) => a - b) : current.filter((d: number) => d !== day)
    await updateById("tempHumiditySheets", sheetId, { workdays: next })
    if (!opening) {
      await removeWhere("tempHumidityEntries", (e: any) => e.sheetId === sheetId && e.day === day)
    }
    revalidatePath("/checksheets/temp-humidity")
    revalidatePath("/checksheets/temp-humidity/[targetId]", "layout")
    return next
  }
  const current: number[] = sheet.holidays ?? []
  const next = current.includes(day) ? current.filter((d: number) => d !== day) : [...current, day].sort((a, b) => a - b)
  await updateById("tempHumiditySheets", sheetId, { holidays: next })
  if (!current.includes(day)) {
    await removeWhere("tempHumidityEntries", (e: any) => e.sheetId === sheetId && e.day === day)
  }
  revalidatePath("/checksheets/temp-humidity")
  revalidatePath("/checksheets/temp-humidity/[targetId]", "layout")
  return next
}

export interface TempHumidityIssueInput {
  day: number
  temperature?: string | null
  humidity?: string | null
  immediateAction: string
  remeasure?: string | null
  confirmedAt?: string | null
  productImpact?: string | null
  lot?: string | null
  cause?: string | null
  handler?: string | null
  approver?: string | null
  note?: string | null
}

function cleanText(value: string | null | undefined) {
  const text = (value ?? "").trim()
  return text || null
}

export async function getTempHumidityIssues(sheetId: number) {
  return (await selectWhere("tempHumidityIssues", (i: any) => i.sheetId === sheetId)).sort((a: any, b: any) => b.id - a.id)
}

export async function addTempHumidityIssue(sheetId: number, input: TempHumidityIssueInput) {
  const actor = await requireManager()
  await assertTempSheetFloor(actor, sheetId)
  const sheet = await findOne<any>("tempHumiditySheets", (s: any) => s.id === sheetId)
  if (!sheet) throw new Error("점검표를 찾을 수 없습니다.")
  const day = Math.floor(Number(input.day))
  if (!Number.isFinite(day) || day < 1 || day > 31) throw new Error("일자를 입력해주세요.")
  const immediateAction = cleanText(input.immediateAction)
  if (!immediateAction) throw new Error("즉시 조치를 선택해주세요.")

  const row = await insertRow("tempHumidityIssues", {
    sheetId,
    targetId: sheet.targetId,
    day,
    temperature: cleanText(input.temperature),
    humidity: cleanText(input.humidity),
    immediateAction,
    remeasure: cleanText(input.remeasure),
    confirmedAt: cleanText(input.confirmedAt),
    productImpact: cleanText(input.productImpact),
    lot: cleanText(input.lot),
    cause: cleanText(input.cause),
    handler: cleanText(input.handler) || actor.displayName,
    approver: cleanText(input.approver),
    note: cleanText(input.note),
    createdAt: new Date().toISOString(),
    createdBy: actor.displayName,
  })
  revalidatePath("/checksheets/temp-humidity")
  revalidatePath("/checksheets/temp-humidity/[targetId]", "layout")
  return row
}

export async function updateTempHumidityIssue(id: number, input: TempHumidityIssueInput) {
  const actor = await requireManager()
  const issue = await findOne<any>("tempHumidityIssues", (i: any) => i.id === id)
  if (!issue) throw new Error("이탈 기록을 찾을 수 없습니다.")
  await assertTempSheetFloor(actor, issue.sheetId)
  const day = Math.floor(Number(input.day))
  if (!Number.isFinite(day) || day < 1 || day > 31) throw new Error("일자를 입력해주세요.")
  const immediateAction = cleanText(input.immediateAction)
  if (!immediateAction) throw new Error("즉시 조치를 선택해주세요.")

  const row = await updateById("tempHumidityIssues", id, {
    day,
    temperature: cleanText(input.temperature),
    humidity: cleanText(input.humidity),
    immediateAction,
    remeasure: cleanText(input.remeasure),
    confirmedAt: cleanText(input.confirmedAt),
    productImpact: cleanText(input.productImpact),
    lot: cleanText(input.lot),
    cause: cleanText(input.cause),
    handler: cleanText(input.handler),
    approver: cleanText(input.approver),
    note: cleanText(input.note),
  })
  revalidatePath("/checksheets/temp-humidity")
  revalidatePath("/checksheets/temp-humidity/[targetId]", "layout")
  return row
}

export async function deleteTempHumidityIssue(id: number) {
  const actor = await requireManager()
  const issue = await findOne<any>("tempHumidityIssues", (i: any) => i.id === id)
  if (!issue) throw new Error("이탈 기록을 찾을 수 없습니다.")
  await assertTempSheetFloor(actor, issue.sheetId)
  await removeWhere("tempHumidityIssues", (i: any) => i.id === id)
  revalidatePath("/checksheets/temp-humidity")
  revalidatePath("/checksheets/temp-humidity/[targetId]", "layout")
}
