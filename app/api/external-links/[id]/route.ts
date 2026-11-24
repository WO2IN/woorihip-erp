import { NextRequest, NextResponse } from 'next/server'
import { canEdit, getUserFromHeaders } from '@/lib/auth'
import {
  EXTERNAL_LINKS_COLLECTION,
  EXTERNAL_LINK_TITLE_MAX,
  normalizeExternalUrl,
  type ExternalLink,
} from '@/lib/external-links'
import { deleteRecord, patchRecord } from '@/lib/records'

export const dynamic = 'force-dynamic'

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUserFromHeaders(request.headers)
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })
  if (!canEdit(user.role)) return NextResponse.json({ error: '링크를 수정할 권한이 없습니다.' }, { status: 403 })

  const body = await request.json().catch(() => null) as { title?: unknown; url?: unknown } | null
  const title = typeof body?.title === 'string' ? body.title.trim() : ''
  const url = normalizeExternalUrl(body?.url)
  if (!title) return NextResponse.json({ error: '이름을 입력해 주세요.' }, { status: 400 })
  if (title.length > EXTERNAL_LINK_TITLE_MAX) {
    return NextResponse.json({ error: `이름은 ${EXTERNAL_LINK_TITLE_MAX}자 이내로 입력해 주세요.` }, { status: 400 })
  }
  if (!url) return NextResponse.json({ error: '올바른 웹 주소(http, https)를 입력해 주세요.' }, { status: 400 })

  const { id } = await params
  const updated = await patchRecord<ExternalLink>(EXTERNAL_LINKS_COLLECTION, id, { title, url })
  if (!updated) return NextResponse.json({ error: '링크를 찾을 수 없습니다.' }, { status: 404 })
  return NextResponse.json({ data: updated })
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUserFromHeaders(request.headers)
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })
  if (!canEdit(user.role)) return NextResponse.json({ error: '링크를 삭제할 권한이 없습니다.' }, { status: 403 })

  const { id } = await params
  const removed = await deleteRecord<ExternalLink>(EXTERNAL_LINKS_COLLECTION, id)
  if (!removed) return NextResponse.json({ error: '링크를 찾을 수 없습니다.' }, { status: 404 })
  return NextResponse.json({ ok: true })
}
