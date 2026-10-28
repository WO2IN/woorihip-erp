import fs from 'node:fs'
import path from 'node:path'
import { NextResponse } from 'next/server'
import { loadDocumentFile } from '@/lib/object-storage'
import { getUserFromHeaders } from '@/lib/auth'

const TYPES: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ fileName: string }> },
) {
  if (!await getUserFromHeaders(request.headers)) {
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })
  }
  const { fileName } = await params
  if (!fileName || fileName.includes('/') || fileName.includes('..')) {
    return NextResponse.json({ error: '잘못된 파일입니다.' }, { status: 400 })
  }

  const key = `uploads/equipment-photos/${fileName}`
  let buffer = await loadDocumentFile(key)
  if (!buffer) {
    const localPath = path.join(process.cwd(), 'public', key)
    if (fs.existsSync(localPath)) buffer = fs.readFileSync(localPath)
  }
  if (!buffer) return NextResponse.json({ error: '파일을 찾을 수 없습니다.' }, { status: 404 })

  const ext = fileName.split('.').pop()?.toLowerCase() || ''
  return new NextResponse(buffer, {
    headers: {
      'Content-Type': TYPES[ext] || 'application/octet-stream',
      'Cache-Control': 'private, max-age=86400',
    },
  })
}
