import { NextRequest, NextResponse } from 'next/server'
import { getUserFromHeaders } from '@/lib/auth'
import { APPROVALS_COLLECTION, markApprovalRead, visibleApproval, type ApprovalRequest } from '@/lib/approval'
import { patchRecord } from '@/lib/records'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getUserFromHeaders(request.headers)
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })

  const { id } = await params
  let failure = ''
  const updated = await patchRecord<ApprovalRequest>(APPROVALS_COLLECTION, id, (current) => {
    if (!visibleApproval(current, user.id)) {
      failure = '결재를 찾을 수 없습니다.'
      return {}
    }
    return markApprovalRead(current, user.id)
  })
  if (!updated) return NextResponse.json({ error: '결재를 찾을 수 없습니다.' }, { status: 404 })
  if (failure) return NextResponse.json({ error: failure }, { status: 404 })
  return NextResponse.json({ data: updated })
}

export const dynamic = 'force-dynamic'
