'use client'

import { SessionUser } from './types'

const SESSION_KEY = 'wms_session'

export function getSession(): SessionUser | null {
  if (typeof window === 'undefined') return null

  try {
    const raw = localStorage.getItem(SESSION_KEY)

    if (!raw) return null

    return JSON.parse(raw) as SessionUser
  } catch {
    return null
  }
}

export function setSession(user: SessionUser): void {
  localStorage.setItem(
    SESSION_KEY,
    JSON.stringify(user)
  )
}

export function clearSession(): void {
  localStorage.removeItem(SESSION_KEY)
}

export function buildAuthHeaders(user: SessionUser): HeadersInit {
  return {
    'x-user-id': user.id,
    'x-user-name': encodeURIComponent(user.displayName),
    'x-user-role': user.role,
  }
}
