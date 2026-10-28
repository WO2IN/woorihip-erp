"use server"

import fs from "node:fs"
import path from "node:path"
import { revalidatePath } from "next/cache"
import { findOne, insertRow, removeWhere, selectAll, selectWhere, updateById } from "@/lib/local-store"
import { assertEquipmentFloor, floorForNewTarget, requireManager } from "@/lib/check-access"
import { removeDocumentFile } from "@/lib/object-storage"

async function manageEquipment(id: number) {
  const actor = await requireManager()
  await assertEquipmentFloor(actor, id)
  return actor
}

async function deleteUpload(url: string) {
  if (!url || !url.startsWith("/uploads/")) return
  const key = url.replace(/^\/+/, "")
  try {
    await removeDocumentFile(key)
  } catch (error) {
    console.error("[v0] Failed to delete upload from storage:", error)
  }
  try {
    const filePath = path.join(process.cwd(), "public", key)
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
  } catch (error) {
    console.error("[v0] Failed to delete local upload file:", error)
  }
}

export async function getEquipmentList() {
  return (await selectAll("equipment")).sort((a, b) => {
    const floorA = Number.parseInt(a.floor, 10) || 999
    const floorB = Number.parseInt(b.floor, 10) || 999
    return floorA - floorB || a.name.localeCompare(b.name)
  })
}

export async function getEquipmentById(id: number) {
  return await findOne("equipment", (e) => e.id === id)
}

export interface EquipmentInput {
  name: string
  floor?: string
  department?: string
  manager?: string
  inspectorName?: string
  inspectorDesc?: string
  inspectorCycle?: string
  managerName?: string
  managerDesc?: string
  managerCycle?: string
  escalationNote?: string
}

export async function createEquipment(data: EquipmentInput) {
  const actor = await requireManager()
  const floor = floorForNewTarget(actor, data.floor, data.name)
  const created = await insertRow("equipment", {
    name: data.name,
    floor: floor || null,
    department: data.department || null,
    manager: data.manager || null,
    inspectorName: data.inspectorName || null,
    inspectorDesc: data.inspectorDesc || null,
    inspectorCycle: data.inspectorCycle || null,
    managerName: data.managerName || null,
    managerDesc: data.managerDesc || null,
    managerCycle: data.managerCycle || null,
    escalationNote: data.escalationNote || null,
    createdAt: new Date().toISOString(),
  })
  revalidatePath("/checksheets")
  revalidatePath("/checksheets/daily")
  return created
}

export async function updateEquipment(id: number, data: Partial<EquipmentInput>) {
  const actor = await manageEquipment(id)
  if (data.floor !== undefined) floorForNewTarget(actor, data.floor, data.name)
  await updateById("equipment", id, {
    ...(data.name !== undefined ? { name: data.name } : {}),
    ...(data.floor !== undefined ? { floor: data.floor || null } : {}),
    ...(data.department !== undefined ? { department: data.department || null } : {}),
    ...(data.manager !== undefined ? { manager: data.manager || null } : {}),
    ...(data.inspectorName !== undefined ? { inspectorName: data.inspectorName || null } : {}),
    ...(data.inspectorDesc !== undefined ? { inspectorDesc: data.inspectorDesc || null } : {}),
    ...(data.inspectorCycle !== undefined ? { inspectorCycle: data.inspectorCycle || null } : {}),
    ...(data.managerName !== undefined ? { managerName: data.managerName || null } : {}),
    ...(data.managerDesc !== undefined ? { managerDesc: data.managerDesc || null } : {}),
    ...(data.managerCycle !== undefined ? { managerCycle: data.managerCycle || null } : {}),
    ...(data.escalationNote !== undefined ? { escalationNote: data.escalationNote || null } : {}),
  })
  revalidatePath("/checksheets")
  revalidatePath("/checksheets/daily")
  revalidatePath(`/checksheets/daily/${id}`)
}

export async function deleteEquipment(id: number) {
  await manageEquipment(id)
  const photos = await selectWhere("equipmentPhotos", (p) => p.equipmentId === id)
  for (const photo of photos) {
    await deleteUpload(photo.url)
  }
  const sheets = await selectWhere("dailyCheckSheets", (s) => s.equipmentId === id)
  const sheetIds = new Set(sheets.map((s) => s.id))
  await removeWhere("dailyCheckEntries", (e) => sheetIds.has(e.sheetId))
  await removeWhere("dailyCheckIssues", (i) => sheetIds.has(i.sheetId))
  await removeWhere("dailyCheckSheets", (s) => s.equipmentId === id)
  await removeWhere("equipmentEmergencyGuides", (i) => i.equipmentId === id)
  await removeWhere("equipmentEmergencyHistories", (i) => i.equipmentId === id)
  await removeWhere("equipmentPhotos", (p) => p.equipmentId === id)
  await removeWhere("dailyCheckItems", (i) => i.equipmentId === id)
  await removeWhere("equipment", (e) => e.id === id)
  revalidatePath("/checksheets")
  revalidatePath("/checksheets/daily")
}

export async function getEquipmentPhotos(equipmentId: number) {
  return (await selectWhere("equipmentPhotos", (p) => p.equipmentId === equipmentId)).sort(
    (a, b) => a.sortOrder - b.sortOrder || a.id - b.id,
  )
}

export async function addEquipmentPhoto(equipmentId: number, url: string, label?: string) {
  await manageEquipment(equipmentId)
  const created = await insertRow("equipmentPhotos", {
    equipmentId,
    url,
    label: label || null,
    sortOrder: 0,
    createdAt: new Date().toISOString(),
  })
  revalidatePath(`/checksheets/daily/${equipmentId}`)
  return created
}

export async function updateEquipmentPhoto(id: number, equipmentId: number, url: string, oldUrl: string) {
  await manageEquipment(equipmentId)
  await updateById("equipmentPhotos", id, { url })
  await deleteUpload(oldUrl)
  revalidatePath(`/checksheets/daily/${equipmentId}`)
}

export async function deleteEquipmentPhoto(id: number, equipmentId: number, url: string) {
  await manageEquipment(equipmentId)
  await removeWhere("equipmentPhotos", (p) => p.id === id && p.equipmentId === equipmentId)
  await deleteUpload(url)
  revalidatePath(`/checksheets/daily/${equipmentId}`)
}

export async function getDailyCheckItems(equipmentId: number) {
  return (await selectWhere("dailyCheckItems", (i) => i.equipmentId === equipmentId)).sort(
    (a, b) => a.sortOrder - b.sortOrder || a.itemNo - b.itemNo,
  )
}

export async function createDailyCheckItem(
  equipmentId: number,
  data: { itemNo: number; content: string; area?: string; method?: string; cycle?: string; sortOrder?: number },
) {
  await manageEquipment(equipmentId)
  const created = await insertRow("dailyCheckItems", {
    equipmentId,
    itemNo: data.itemNo,
    content: data.content,
    area: data.area?.trim() || "",
    method: data.method?.trim() || "육안",
    cycle: data.cycle?.trim() || "일",
    sortOrder: data.sortOrder ?? data.itemNo,
  })
  revalidatePath(`/checksheets/daily/${equipmentId}`)
  return created
}

export async function updateDailyCheckItem(
  id: number,
  equipmentId: number,
  data: { itemNo?: number; content?: string; area?: string; method?: string; cycle?: string },
) {
  await manageEquipment(equipmentId)
  await updateById("dailyCheckItems", id, {
    ...(data.itemNo !== undefined ? { itemNo: data.itemNo } : {}),
    ...(data.content !== undefined ? { content: data.content } : {}),
    ...(data.area !== undefined ? { area: data.area.trim() } : {}),
    ...(data.method !== undefined ? { method: data.method?.trim() || "육안" } : {}),
    ...(data.cycle !== undefined ? { cycle: data.cycle?.trim() || "일" } : {}),
  })
  revalidatePath(`/checksheets/daily/${equipmentId}`)
}

export async function deleteDailyCheckItem(id: number, equipmentId: number) {
  await manageEquipment(equipmentId)
  await removeWhere("dailyCheckItems", (i) => i.id === id)
  revalidatePath(`/checksheets/daily/${equipmentId}`)
}

export async function getEquipmentEmergencyGuides(equipmentId: number) {
  return (await selectWhere("equipmentEmergencyGuides", (i) => i.equipmentId === equipmentId)).sort(
    (a, b) => a.sortOrder - b.sortOrder || a.id - b.id,
  )
}

export async function createEquipmentEmergencyGuide(
  equipmentId: number,
  data: {
    emergencyType?: string
    emergencyAction?: string
    sortOrder?: number
  },
) {
  await manageEquipment(equipmentId)
  const created = await insertRow("equipmentEmergencyGuides", {
    equipmentId,
    emergencyType: data.emergencyType || null,
    emergencyAction: data.emergencyAction || null,
    sortOrder: data.sortOrder ?? 0,
  })
  revalidatePath(`/checksheets/daily/${equipmentId}`)
  return created
}

export async function updateEquipmentEmergencyGuide(
  id: number,
  equipmentId: number,
  data: {
    emergencyType?: string
    emergencyAction?: string
  },
) {
  await manageEquipment(equipmentId)
  await updateById("equipmentEmergencyGuides", id, data)
  revalidatePath(`/checksheets/daily/${equipmentId}`)
}

export async function deleteEquipmentEmergencyGuide(id: number, equipmentId: number) {
  await manageEquipment(equipmentId)
  await removeWhere("equipmentEmergencyGuides", (i) => i.id === id)
  revalidatePath(`/checksheets/daily/${equipmentId}`)
}

export async function getEquipmentEmergencyHistories(equipmentId: number) {
  return (await selectWhere("equipmentEmergencyHistories", (i) => i.equipmentId === equipmentId)).sort(
    (a, b) => a.sortOrder - b.sortOrder || a.id - b.id,
  )
}

export async function createEquipmentEmergencyHistory(
  equipmentId: number,
  data: {
    occurredDate?: string
    cause?: string
    action?: string
    processedDate?: string
    note?: string
    sortOrder?: number
  },
) {
  await manageEquipment(equipmentId)
  const created = await insertRow("equipmentEmergencyHistories", {
    equipmentId,
    occurredDate: data.occurredDate || null,
    cause: data.cause || null,
    action: data.action || null,
    processedDate: data.processedDate || null,
    note: data.note || null,
    sortOrder: data.sortOrder ?? 0,
  })
  revalidatePath(`/checksheets/daily/${equipmentId}`)
  return created
}

export async function updateEquipmentEmergencyHistory(
  id: number,
  equipmentId: number,
  data: {
    occurredDate?: string
    cause?: string
    action?: string
    processedDate?: string
    note?: string
  },
) {
  await manageEquipment(equipmentId)
  await updateById("equipmentEmergencyHistories", id, data)
  revalidatePath(`/checksheets/daily/${equipmentId}`)
}

export async function deleteEquipmentEmergencyHistory(id: number, equipmentId: number) {
  await manageEquipment(equipmentId)
  await removeWhere("equipmentEmergencyHistories", (i) => i.id === id)
  revalidatePath(`/checksheets/daily/${equipmentId}`)
}
