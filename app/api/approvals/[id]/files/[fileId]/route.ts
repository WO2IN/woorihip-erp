import { NextRequest, NextResponse } from 'next/server'
import { getUserFromHeaders } from '@/lib/auth'
import { readApprovalFile } from '@/lib/approval-files'
import { APPROVALS_COLLECTION, visibleApproval, type ApprovalRequest } from '@/lib/approval'
import { fileKind } from '@/lib/file-types'
import { listRecords } from '@/lib/records'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; fileId: string }> },
) {
  const user = await getUserFromHeaders(request.headers)
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })

  const { id, fileId } = await params
  const item = (await listRecords<ApprovalRequest>(APPROVALS_COLLECTION)).find((entry) => entry.id === id)
  if (!item || !visibleApproval(item, user.id) || !item.files?.some((file) => file.id === fileId)) {
    return NextResponse.json({ error: '첨부파일을 찾을 수 없습니다.' }, { status: 404 })
  }

  const file = await readApprovalFile(id, fileId)
  if (!file) return NextResponse.json({ error: '첨부파일을 찾을 수 없습니다.' }, { status: 404 })

  const kind = fileKind(file.name)
  const download = request.nextUrl.searchParams.get('download') === '1' || !kind?.preview
  const safeName = file.name.replace(/[\\/:*?"<>|\r\n]/g, '_')
  return new NextResponse(new Uint8Array(file.data), {
    headers: {
      'Content-Type': file.mime || kind?.mime || 'application/octet-stream',
      'Content-Disposition': download
        ? `attachment; filename*=UTF-8''${encodeURIComponent(safeName)}`
        : `inline; filename*=UTF-8''${encodeURIComponent(safeName)}`,
      'Cache-Control': 'private, no-store',
    },
  })
}

export const dynamic = 'force-dynamic'
