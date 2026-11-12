import { NextRequest, NextResponse } from 'next/server'
import { getUserFromHeaders } from '@/lib/auth'
import { requireManager } from '@/lib/check-access'
import {
  DEFAULT_RELIABILITY_TARGETS,
  normalizeReliabilityTargets,
  summarizeReliabilityMonths,
  summarizeReliabilityYear,
  type EmergencyHistoryRow,
} from '@/lib/equipment-reliability'
import { selectAll } from '@/lib/local-store'
import { getSetting, setSetting } from '@/lib/records'
import type { UserRole } from '@/lib/types'

const SETTINGS_KEY = 'equipment-reliability-targets'

export async function GET(request: NextRequest) {
  const user = await getUserFromHeaders(request.headers)
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })

  const year = Number(new URL(request.url).searchParams.get('year')) || new Date().getFullYear()
  const [histories, equipment, saved] = await Promise.all([
    selectAll<EmergencyHistoryRow>('equipmentEmergencyHistories'),
    selectAll<{ id: number }>('equipment'),
    getSetting<unknown>(SETTINGS_KEY, null),
  ])
  const targets = normalizeReliabilityTargets(saved)
  const summary = summarizeReliabilityYear(year, histories, equipment.length, targets)
  const months = summarizeReliabilityMonths(year, histories, equipment.length, targets)

  return NextResponse.json({
    summary,
    months,
    targets,
    defaults: DEFAULT_RELIABILITY_TARGETS,
    historyCount: histories.filter((row) => row.occurredDate?.trim()).length,
  })
}

export async function PUT(request: NextRequest) {
  try {
    await requireManager()
  } catch {
    return NextResponse.json({ error: '관리자만 수정할 수 있습니다.' }, { status: 403 })
  }

  const user = await getUserFromHeaders(request.headers)
  const role = user?.role as UserRole | undefined
  if (!user || !role) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })

  const body = await request.json().catch(() => null)
  const targets = normalizeReliabilityTargets(body?.targets ?? body)
  await setSetting(SETTINGS_KEY, targets)

  const year = Number(body?.year) || new Date().getFullYear()
  const [histories, equipment] = await Promise.all([
    selectAll<EmergencyHistoryRow>('equipmentEmergencyHistories'),
    selectAll<{ id: number }>('equipment'),
  ])
  const summary = summarizeReliabilityYear(year, histories, equipment.length, targets)

  return NextResponse.json({ summary, targets })
}

export const dynamic = 'force-dynamic'
