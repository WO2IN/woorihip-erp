import type { UserRole } from '@/lib/types'

type Actor = { role: UserRole; floor?: 1 | 2 | 3 | null } | null | undefined

/** 관리자와 층이 없는 계정은 전 층. 그 외에는 지정된 층만 조작한다. */
export function homeFloor(user: Actor): 1 | 2 | 3 | null {
  if (!user || user.role === 'admin' || user.floor == null) return null
  return user.floor
}

export function canOperateFloor(user: Actor, floor: number | string | null | undefined): boolean {
  if (!user || user.role === 'viewer') return false
  const home = homeFloor(user)
  if (home == null) return true
  return String(home) === String(floor ?? '')
}
