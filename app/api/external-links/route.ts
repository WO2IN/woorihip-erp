import { randomUUID } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { canEdit, getUserFromHeaders } from '@/lib/auth'
import {
  EXTERNAL_LINKS_COLLECTION,
  EXTERNAL_LINK_MAX,
  EXTERNAL_LINK_TITLE_MAX,
  normalizeExternalUrl,
  type ExternalLink,
} from '@/lib/external-links'
import { insertRecordPrepared, listRecords } from '@/lib/records'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const user = await getUserFromHeaders(request.headers)
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })
  const links = await listRecords<ExternalLink>(EXTERNAL_LINKS_COLLECTION)
  return NextResponse.json({ data: links })
}

export async function POST(request: NextRequest) {
  const user = await getUserFromHeaders(request.headers)
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })
  if (!canEdit(user.role)) return NextResponse.json({ error: '링크를 등록할 권한이 없습니다.' }, { status: 403 })

  const body = await request.json().catch(() => null) as { title?: unknown; url?: unknown } | null
  const title = typeof body?.title === 'string' ? body.title.trim() : ''
  const url = normalizeExternalUrl(body?.url)
  if (!title) return NextResponse.json({ error: '이름을 입력해 주세요.' }, { status: 400 })
  if (title.length > EXTERNAL_LINK_TITLE_MAX) {
    return NextResponse.json({ error: `이름은 ${EXTERNAL_LINK_TITLE_MAX}자 이내로 입력해 주세요.` }, { status: 400 })
  }
  if (!url) return NextResponse.json({ error: '올바른 웹 주소(http, https)를 입력해 주세요.' }, { status: 400 })

  try {
    const created = await insertRecordPrepared<ExternalLink>(EXTERNAL_LINKS_COLLECTION, (existing) => {
      if (existing.length >= EXTERNAL_LINK_MAX) throw new Error('LIMIT')
      return { id: randomUUID(), title, url, createdAt: new Date().toISOString(), createdBy: user.displayName }
    })
    return NextResponse.json({ data: created }, { status: 201 })
  } catch (error) {
    if (error instanceof Error && error.message === 'LIMIT') {
      return NextResponse.json({ error: `링크는 최대 ${EXTERNAL_LINK_MAX}개까지 등록할 수 있습니다.` }, { status: 400 })
    }
    throw error
  }
}
