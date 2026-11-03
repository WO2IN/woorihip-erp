import { NextRequest, NextResponse } from 'next/server'
import { getUserFromHeaders } from '@/lib/auth'
import { normalizeChangeRequest } from '@/lib/change-request'
import { renderChangeRequestDownload } from '@/lib/change-request-excel'
import { decodeAttachments, filesForRow, loadStoredAttachments } from '@/lib/change-request-files'

export async function POST(request: NextRequest) {
  const user = await getUserFromHeaders(request.headers)
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })

  const body = await request.json().catch(() => null)
  const row = normalizeChangeRequest(body?.row)
  if (!row) return NextResponse.json({ error: '변경요청 내용이 올바르지 않습니다.' }, { status: 400 })

  let uploaded
  try {
    uploaded = decodeAttachments(body?.files)
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : '첨부는 png, jpg 사진만 올릴 수 있습니다.' }, { status: 400 })
  }
  const files = filesForRow(row, uploaded, await loadStoredAttachments(row))
  const download = await renderChangeRequestDownload(row, files)
  return new NextResponse(new Uint8Array(download.buffer), {
    headers: {
      'Content-Type': download.type,
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(download.filename)}`,
    },
  })
}

export const dynamic = 'force-dynamic'
