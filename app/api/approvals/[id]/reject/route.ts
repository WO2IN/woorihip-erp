import { NextRequest, NextResponse } from 'next/server'
import { getUserFromHeaders } from '@/lib/auth'
import { APPROVALS_COLLECTION, applyReject, isApprovalError, markApprovalRead, type ApprovalRequest } from '@/lib/approval'
import { patchRecord } from '@/lib/records'
import { appendAuditLog } from '@/lib/storage'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getUserFromHeaders(request.headers)
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })

  const payload = await request.json().catch(() => null) as { reason?: unknown } | null
  const reason = typeof payload?.reason === 'string' ? payload.reason : ''
  const { id } = await params
  const now = new Date().toISOString()
  let failure = ''
  const updated = await patchRecord<ApprovalRequest>(APPROVALS_COLLECTION, id, (current) => {
    const next = applyReject(current, user.id, reason, now)
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
    detail: `결재 반려 · ${updated.title}`,
    userId: user.id,
    userName: user.displayName,
  })
  return NextResponse.json({ data: updated })
}

export const dynamic = 'force-dynamic'
