import { NextRequest, NextResponse } from 'next/server'
import { findUserById, getUserFromHeaders } from '@/lib/auth'
import { APPROVALS_COLLECTION, applySign, isApprovalError, markApprovalRead, type ApprovalRequest } from '@/lib/approval'
import { applyApprovalTarget } from '@/lib/approval-apply'
import { listRecords, patchRecord } from '@/lib/records'
import { appendAuditLog } from '@/lib/storage'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getUserFromHeaders(request.headers)
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })
  const account = await findUserById(user.id)
  if (!account?.hasSignature) {
    return NextResponse.json({ error: '오른쪽 위 내 정보에서 서명 그림을 먼저 올려 주세요.' }, { status: 400 })
  }

  const { id } = await params
  const now = new Date().toISOString()
  const current = (await listRecords<ApprovalRequest>(APPROVALS_COLLECTION)).find((item) => item.id === id)
  if (!current) return NextResponse.json({ error: '결재를 찾을 수 없습니다.' }, { status: 404 })
  const preview = applySign(current, user.id, now)
  if (isApprovalError(preview)) return NextResponse.json({ error: preview.error }, { status: 400 })
  if (preview.status === 'approved') {
    const applied = await applyApprovalTarget(current.target, { id: user.id, displayName: user.displayName })
    if (!applied.ok) return NextResponse.json({ error: applied.error }, { status: 400 })
  }

  let failure = ''
  const updated = await patchRecord<ApprovalRequest>(APPROVALS_COLLECTION, id, (row) => {
    const next = applySign(row, user.id, now)
    if (isApprovalError(next)) {
      failure = next.error
      return {}
    }
    return markApprovalRead(next, user.id)
  })
  if (!updated) return NextResponse.json({ error: '결재를 찾을 수 없습니다.' }, { status: 404 })
  if (failure) return NextResponse.json({ error: failure }, { status: 400 })

  await appendAuditLog({
    action: 'UPDATE',
    target: 'approval',
    detail: `결재 승인 · ${updated.title}`,
    userId: user.id,
    userName: user.displayName,
  })
  return NextResponse.json({ data: updated })
}

export const dynamic = 'force-dynamic'
