import { NextRequest, NextResponse } from 'next/server'
import { canEdit, getUserFromHeaders } from '@/lib/auth'
import { MANUAL_TASKS_COLLECTION, type ManualTask } from '@/lib/manual-tasks'
import { deleteRecord, findRecords, patchRecord } from '@/lib/records'

export const dynamic = 'force-dynamic'

// 업무 완료 처리 (편집 권한이 있는 사용자)
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUserFromHeaders(request.headers)
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })
  if (!canEdit(user.role)) return NextResponse.json({ error: '업무를 변경할 권한이 없습니다.' }, { status: 403 })

  const body = await request.json().catch(() => ({}))
  if (body.done !== true) return NextResponse.json({ error: '완료 처리만 지원합니다.' }, { status: 400 })

  const { id } = await params
  const updated = await patchRecord<ManualTask>(MANUAL_TASKS_COLLECTION, id, { done: true })
  if (!updated) return NextResponse.json({ error: '업무를 찾을 수 없습니다.' }, { status: 404 })
  return NextResponse.json({ data: updated })
}

// 등록자 본인 또는 관리자만 삭제할 수 있다.
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUserFromHeaders(request.headers)
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })

  const { id } = await params
  const [target] = await findRecords<ManualTask>(MANUAL_TASKS_COLLECTION, (row) => row.id === id, 1)
  if (!target) return NextResponse.json({ error: '업무를 찾을 수 없습니다.' }, { status: 404 })
  if (user.role !== 'admin' && target.createdById !== user.id) {
    return NextResponse.json({ error: '등록한 사람 또는 관리자만 삭제할 수 있습니다.' }, { status: 403 })
  }

  await deleteRecord(MANUAL_TASKS_COLLECTION, id)
  return NextResponse.json({ ok: true })
}
