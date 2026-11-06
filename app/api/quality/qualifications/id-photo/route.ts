import { NextRequest, NextResponse } from 'next/server'
import { canManageQualityRecords, getUserFromHeaders } from '@/lib/auth'
import { normalizeQualificationLedgerRow, sortQualificationLedger } from '@/lib/qualification-ledger'
import { deleteQualificationIdPhotoFile, reconcileQualificationIdPhoto } from '@/lib/qualification-id-photo'
import { getSetting, setSetting } from '@/lib/records'
import type { UserRole } from '@/lib/types'

export const runtime = 'nodejs'

const KEY = 'qualification-ledger'

export async function POST(request: NextRequest) {
  const user = await getUserFromHeaders(request.headers)
  const role = user?.role as UserRole | undefined
  if (!user || !role || !canManageQualityRecords(role)) {
    return NextResponse.json({ error: '관리자만 수정할 수 있습니다.' }, { status: 403 })
  }

  let body: { ledgerRowId?: string; photoBase64?: string; clear?: boolean }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: '요청 형식이 올바르지 않습니다.' }, { status: 400 })
  }

  const ledgerRowId = String(body.ledgerRowId ?? '').trim()
  if (!ledgerRowId) {
    return NextResponse.json({ error: '대상 ID가 필요합니다.' }, { status: 400 })
  }

  const stored = await getSetting<unknown>(KEY, null)
  if (!Array.isArray(stored)) {
    return NextResponse.json({ error: '자격인증 대장을 찾을 수 없습니다.' }, { status: 404 })
  }

  const index = stored.findIndex((item) => item && typeof item === 'object' && (item as { id?: string }).id === ledgerRowId)
  if (index < 0) {
    return NextResponse.json({ error: '대상을 찾을 수 없습니다.' }, { status: 404 })
  }

  const previous = normalizeQualificationLedgerRow(stored[index])
  if (!previous) {
    return NextResponse.json({ error: '대상을 찾을 수 없습니다.' }, { status: 404 })
  }

  try {
    const fileId = body.clear
      ? await (async () => {
          await deleteQualificationIdPhotoFile(previous.idPhotoFileId)
          return ''
        })()
      : await reconcileQualificationIdPhoto({
          ledgerRowId,
          dataUrl: body.photoBase64,
          previousFileId: previous.idPhotoFileId,
          uploadedBy: user.id,
          uploadedByName: user.displayName,
        })

    const next = [...stored]
    next[index] = { ...(stored[index] as Record<string, unknown>), idPhotoFileId: fileId, idPhoto: undefined }
    const normalized = next
      .map(normalizeQualificationLedgerRow)
      .filter((row): row is NonNullable<typeof row> => Boolean(row))
      .sort(sortQualificationLedger)
    await setSetting(KEY, normalized)

    return NextResponse.json({ fileId })
  } catch (error) {
    const message = error instanceof Error ? error.message : '증명사진 저장에 실패했습니다.'
    return NextResponse.json({ error: message.slice(0, 500) }, { status: 500 })
  }
}

export const dynamic = 'force-dynamic'
