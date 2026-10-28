import { cookies } from 'next/headers'
import { SESSION_COOKIE, verifySessionToken } from '@/lib/auth'
import { findOne } from '@/lib/local-store'
import { detectFloor } from '@/lib/floor'
import type { User, UserRole } from '@/lib/types'

export interface CheckActor {
  id: string
  username: string
  displayName: string
  role: UserRole
  floor: 1 | 2 | 3 | null
}

export function canManageChecksheets(actor: CheckActor | null) {
  return actor?.role === 'editor' || actor?.role === 'admin'
}

export function canUseFloor(actor: CheckActor | null, floor: string | null | undefined, name?: string | null) {
  if (!actor?.floor || actor.role === 'admin') return true
  return detectFloor(floor, name) === String(actor.floor)
}

export async function currentActor(): Promise<CheckActor | null> {
  const jar = await cookies()
  const user = await verifySessionToken(jar.get(SESSION_COOKIE)?.value)
  return user ? toActor(user) : null
}

export async function requireActor() {
  const actor = await currentActor()
  if (!actor) throw new Error('로그인이 필요합니다.')
  return actor
}

export async function requireManager() {
  const actor = await requireActor()
  if (!canManageChecksheets(actor)) throw new Error('편집 권한이 없습니다.')
  return actor
}

export async function enforcedFloor(requested?: string | null) {
  const actor = await currentActor()
  if (actor?.floor && actor.role !== 'admin') return String(actor.floor)
  return requested ?? null
}

export function floorForNewTarget(actor: CheckActor, floor: string | null | undefined, name?: string | null) {
  if (actor.floor && actor.role !== 'admin') {
    if (floor && detectFloor(floor, name) !== String(actor.floor)) {
      throw new Error('다른 층에는 추가할 수 없습니다.')
    }
    return String(actor.floor)
  }
  return floor ?? null
}

export async function assertEquipmentFloor(actor: CheckActor, equipmentId: number) {
  const row = await findOne<{ id: number; floor: string | null; name: string }>(
    'equipment',
    (item) => item.id === equipmentId,
  )
  if (!row) throw new Error('설비를 찾을 수 없습니다.')
  if (!canUseFloor(actor, row.floor, row.name)) throw new Error('이 층 점검 권한이 없습니다.')
}

export async function assertDailySheetFloor(actor: CheckActor, sheetId: number) {
  const sheet = await findOne<{ id: number; equipmentId: number }>(
    'dailyCheckSheets',
    (item) => item.id === sheetId,
  )
  if (!sheet) throw new Error('점검표를 찾을 수 없습니다.')
  await assertEquipmentFloor(actor, sheet.equipmentId)
}

export async function assertFiveSTargetFloor(actor: CheckActor, targetId: number) {
  const row = await findOne<{ id: number; floor: string | null; name: string }>(
    'fiveSTargets',
    (item) => item.id === targetId,
  )
  if (!row) throw new Error('대상을 찾을 수 없습니다.')
  if (!canUseFloor(actor, row.floor, row.name)) throw new Error('이 층 점검 권한이 없습니다.')
}

export async function assertFiveSSheetFloor(actor: CheckActor, sheetId: number) {
  const sheet = await findOne<{ id: number; targetId: number }>('fiveSSheets', (item) => item.id === sheetId)
  if (!sheet) throw new Error('점검표를 찾을 수 없습니다.')
  await assertFiveSTargetFloor(actor, sheet.targetId)
}

export async function assertTempTargetFloor(actor: CheckActor, targetId: number) {
  const row = await findOne<{ id: number; floor: string | null; name: string }>(
    'tempHumidityTargets',
    (item) => item.id === targetId,
  )
  if (!row) throw new Error('대상을 찾을 수 없습니다.')
  if (!canUseFloor(actor, row.floor, row.name)) throw new Error('이 층 점검 권한이 없습니다.')
}

export async function assertTempSheetFloor(actor: CheckActor, sheetId: number) {
  const sheet = await findOne<{ id: number; targetId: number }>(
    'tempHumiditySheets',
    (item) => item.id === sheetId,
  )
  if (!sheet) throw new Error('점검표를 찾을 수 없습니다.')
  await assertTempTargetFloor(actor, sheet.targetId)
}

function toActor(user: User): CheckActor {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    role: user.role,
    floor: user.floor ?? null,
  }
}
