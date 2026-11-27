import { randomUUID } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { canManageUsers, getUserFromHeaders } from '@/lib/auth'
import { MANUAL_ABSENCES_COLLECTION, parseManualAbsence, type ManualAbsence } from '@/lib/manual-absences'
import { insertRecordPrepared } from '@/lib/records'

export const dynamic = 'force-dynamic'

// 관리자가 결재 없이 출장·연차·반차를 직접 등록한다.
export async function POST(request: NextRequest) {
  const user = await getUserFromHeaders(request.headers)
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })
  if (!canManageUsers(user.role)) return NextResponse.json({ error: '관리자만 등록할 수 있습니다.' }, { status: 403 })

  const parsed = parseManualAbsence(await request.json().catch(() => null))
  if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 })

  const created = await insertRecordPrepared<ManualAbsence>(MANUAL_ABSENCES_COLLECTION, () => ({
    id: randomUUID(),
    ...parsed.value,
    createdAt: new Date().toISOString(),
    createdBy: user.displayName,
  }))
  return NextResponse.json({ data: created }, { status: 201 })
}
