import { NextRequest, NextResponse } from 'next/server'
import { canManageQualityRecords, getUserFromHeaders } from '@/lib/auth'
import type { SuitabilitySheetPersisted } from '@/lib/suitability-ledger-bridge'
import { appendAuditLog } from '@/lib/storage'
import { getSetting, setSetting } from '@/lib/records'
import type { UserRole } from '@/lib/types'

const KEY = 'suitability-sheet'

const EMPTY: SuitabilitySheetPersisted = {
  overlays: {},
  extraPeople: [],
}

function normalizeStore(value: unknown): SuitabilitySheetPersisted {
  if (!value || typeof value !== 'object') return { ...EMPTY }
  const raw = value as SuitabilitySheetPersisted
  return {
    overlays: raw.overlays && typeof raw.overlays === 'object' ? raw.overlays : {},
    extraPeople: Array.isArray(raw.extraPeople) ? raw.extraPeople : [],
    grantStatusesByPerson:
      raw.grantStatusesByPerson && typeof raw.grantStatusesByPerson === 'object'
        ? raw.grantStatusesByPerson
        : undefined,
    practicalGateByPerson:
      raw.practicalGateByPerson && typeof raw.practicalGateByPerson === 'object'
        ? raw.practicalGateByPerson
        : undefined,
    pipelineActiveByPerson:
      raw.pipelineActiveByPerson && typeof raw.pipelineActiveByPerson === 'object'
        ? raw.pipelineActiveByPerson
        : undefined,
  }
}

export async function GET() {
  const stored = await getSetting<unknown>(KEY, null)
  return NextResponse.json({ data: normalizeStore(stored) })
}

export async function PUT(request: NextRequest) {
  const user = await getUserFromHeaders(request.headers)
  const role = user?.role as UserRole | undefined
  if (!user || !role || !canManageQualityRecords(role)) {
    return NextResponse.json({ error: '관리자만 저장할 수 있습니다.' }, { status: 403 })
  }

  const body = await request.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: '적격성평가 데이터가 올바르지 않습니다.' }, { status: 400 })
  }

  const data = normalizeStore(body.data ?? body)
  await setSetting(KEY, data)
  await appendAuditLog({
    action: 'UPDATE',
    target: 'suitability-sheet',
    detail: '적격성평가서 저장',
    userId: user.id,
    userName: user.displayName,
  })
  return NextResponse.json({ data })
}

export const dynamic = 'force-dynamic'
