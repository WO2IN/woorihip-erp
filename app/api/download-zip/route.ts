import { NextRequest, NextResponse } from 'next/server'
import { PassThrough } from 'stream'
import { ZipArchive } from 'archiver'
import { readMetadata } from '@/lib/storage'
import { loadDocumentFile } from '@/lib/object-storage'
import { getUserFromHeaders } from '@/lib/auth'
import { documentDownloadName } from '@/lib/file-types'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  if (!await getUserFromHeaders(req.headers)) {
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })
  }
  const { ids } = await req.json()

  if (!ids || ids.length === 0) {
    return NextResponse.json(
      { error: '파일 없음' },
      { status: 400 }
    )
  }

  const metadata = await readMetadata()

  const stream = new PassThrough()

  const archive = new ZipArchive({
    zlib: { level: 9 }
  })

  archive.pipe(stream)

  for (const id of ids) {
    const doc = metadata.find(
      (item: any) => item.id === id
    )

    if (!doc) continue

    if (!doc.storagePath || doc.storagePath === 'INVENTORY' || doc.storagePath === 'MANUAL') continue
    const file = await loadDocumentFile(doc.storagePath)
    if (file) {
      archive.append(file, { name: documentDownloadName(doc) })
    }
  }

  archive.finalize()

  return new NextResponse(stream as any, {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition':
        'attachment; filename="documents.zip"',
    },
  })
}
