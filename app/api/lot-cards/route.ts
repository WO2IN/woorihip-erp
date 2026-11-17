import { NextRequest, NextResponse } from 'next/server'
import { canEdit, getUserFromHeaders } from '@/lib/auth'
import { deleteRecord, listRecords, putRecord } from '@/lib/records'

const COLLECTION = 'lot-cards'

type LotCardRecord = { id: string; floor?: string }

function asCard(body: unknown): LotCardRecord | null {
  if (!body || typeof body !== 'object') return null
  const card = body as Record<string, unknown>
  const id = String(card.id ?? '').trim()
  if (!id) return null
  const floor = card.floor === '2' || card.floor === '3' ? card.floor : '1'
  return { ...card, id, floor }
}

export async function GET(req: NextRequest) {
  const requestUser = await getUserFromHeaders(req.headers)
  if (!requestUser) {
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })
  }
  const data = await listRecords<LotCardRecord>(COLLECTION)
  return NextResponse.json({ data })
}

export async function PUT(req: NextRequest) {
  const requestUser = await getUserFromHeaders(req.headers)
  if (!requestUser || !canEdit(requestUser.role)) {
    return NextResponse.json({ error: '이력카드 저장 권한이 없습니다.' }, { status: 403 })
  }
  const card = asCard(await req.json().catch(() => null))
  if (!card) return NextResponse.json({ error: '이력카드 내용이 올바르지 않습니다.' }, { status: 400 })
  const saved = await putRecord(COLLECTION, card)
  return NextResponse.json({ data: saved })
}

export async function DELETE(req: NextRequest) {
  const requestUser = await getUserFromHeaders(req.headers)
  if (!requestUser || !canEdit(requestUser.role)) {
    return NextResponse.json({ error: '이력카드 삭제 권한이 없습니다.' }, { status: 403 })
  }
  const body = await req.json().catch(() => null)
  const id = String(body?.id ?? '').trim()
  if (!id) return NextResponse.json({ error: '삭제할 이력카드가 없습니다.' }, { status: 400 })
  await deleteRecord(COLLECTION, id)
  return NextResponse.json({ ok: true })
}
