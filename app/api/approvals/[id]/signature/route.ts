import { NextRequest, NextResponse } from 'next/server'
import { getUserFromHeaders, readUserSignature } from '@/lib/auth'
import { APPROVALS_COLLECTION, visibleApproval, type ApprovalRequest } from '@/lib/approval'
import { listRecords } from '@/lib/records'
import { prepareSignature } from '@/lib/signature'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getUserFromHeaders(request.headers)
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })

  const { id } = await params
  const signerId = request.nextUrl.searchParams.get('userId') ?? ''
  const all = await listRecords<ApprovalRequest>(APPROVALS_COLLECTION)
  const item = all.find((entry) => entry.id === id)
  if (!item || !visibleApproval(item, user.id)) {
    return NextResponse.json({ error: '결재를 찾을 수 없습니다.' }, { status: 404 })
  }
  const onLine =
    item.steps.some((step) => step.userId === signerId && step.status === 'approved')
    || item.requesterId === signerId
  if (!onLine) return NextResponse.json({ error: '서명을 볼 수 없습니다.' }, { status: 403 })

  const image = await readUserSignature(signerId)
  if (!image) return new NextResponse(null, { status: 404 })
  const prepared = await prepareSignature(image)
  return new NextResponse(new Uint8Array(prepared ?? image), {
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'private, no-store',
    },
  })
}

export const dynamic = 'force-dynamic'
