import { NextRequest, NextResponse } from 'next/server'
import { canManageUsers, getUserFromHeaders } from '@/lib/auth'
import { MANUAL_ABSENCES_COLLECTION, type ManualAbsence } from '@/lib/manual-absences'
import { deleteRecord } from '@/lib/records'

export const dynamic = 'force-dynamic'

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUserFromHeaders(request.headers)
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })
  if (!canManageUsers(user.role)) return NextResponse.json({ error: '관리자만 삭제할 수 있습니다.' }, { status: 403 })

  const { id } = await params
  const removed = await deleteRecord<ManualAbsence>(MANUAL_ABSENCES_COLLECTION, id)
  if (!removed) return NextResponse.json({ error: '기록을 찾을 수 없습니다.' }, { status: 404 })
  return NextResponse.json({ ok: true })
}
