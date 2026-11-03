import { NextRequest, NextResponse } from 'next/server'
import { getUserFromHeaders } from '@/lib/auth'
import { fileKind } from '@/lib/file-types'
import { getStoredFile, readStoredFileBytes } from '@/lib/stored-files'

export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (!await getUserFromHeaders(req.headers)) {
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })
  }
  const { id } = await context.params
  if (!/^[a-f0-9-]{36}$/i.test(id)) {
    return NextResponse.json({ error: '잘못된 파일 ID입니다.' }, { status: 400 })
  }
  const row = await getStoredFile(id)
  if (!row) return NextResponse.json({ error: '파일을 찾을 수 없습니다.' }, { status: 404 })
  const buffer = await readStoredFileBytes(row)
  if (!buffer?.length) return NextResponse.json({ error: '파일을 찾을 수 없습니다.' }, { status: 404 })

  const kind = fileKind(row.original_name) ?? fileKind(row.object_key)
  const download = req.nextUrl.searchParams.get('download') === 'true' || !kind?.preview
  const safeName = row.original_name.replace(/[\\/:*?"<>|\r\n]/g, '_')

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': row.mime ?? kind?.mime ?? 'application/octet-stream',
      'Content-Disposition': download
        ? `attachment; filename*=UTF-8''${encodeURIComponent(safeName)}`
        : 'inline',
      'Cache-Control': 'private, no-store',
    },
  })
}

export const dynamic = 'force-dynamic'
