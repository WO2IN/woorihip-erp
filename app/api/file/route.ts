import { NextRequest, NextResponse } from 'next/server'
import { loadDocumentFile } from '@/lib/object-storage'
import { getUserFromHeaders } from '@/lib/auth'
import { fileKind } from '@/lib/file-types'

export async function GET(req: NextRequest) {
  if (!await getUserFromHeaders(req.headers)) {
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })
  }
  const { searchParams } = new URL(req.url)
  const filePath = searchParams.get('path')
  if (!filePath) return NextResponse.json({ error: '경로가 없습니다.' }, { status: 400 })

  if (filePath.includes('..')) {
    return NextResponse.json({ error: '잘못된 경로입니다.' }, { status: 400 })
  }

  const buffer = await loadDocumentFile(filePath)
  if (!buffer) {
    return NextResponse.json({ error: '파일을 찾을 수 없습니다.' }, { status: 404 })
  }
  const kind = fileKind(filePath)
  const download = searchParams.get('download') === 'true' || !kind?.preview
  const downloadName = searchParams.get('downloadName') || filePath.split('/').pop() || 'document.pdf'
  const safeDownloadName = downloadName.replace(/[\\/:*?"<>|\r\n]/g, '_')

  return new NextResponse(buffer, {
    headers: {
      'Content-Type': kind?.mime ?? 'application/octet-stream',
      'Content-Disposition': download
        ? `attachment; filename*=UTF-8''${encodeURIComponent(safeDownloadName)}`
        : 'inline',
    },
  })
}
