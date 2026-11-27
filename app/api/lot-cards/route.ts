import { NextRequest, NextResponse } from 'next/server'
import { canEdit, getUserFromHeaders } from '@/lib/auth'
import { deleteRecord, findRecords, listRecords, patchRecord, patchRecordsWhere, putRecord } from '@/lib/records'

const COLLECTION = 'lot-cards'
const WORK_FIELDS = ['workStatus', 'workStartedAt', 'workStartedBy', 'workDoneAt', 'workDoneBy', 'workLine']

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
  const [previous] = await findRecords<Record<string, unknown>>(COLLECTION, (row) => row.id === card.id, 1)
  // 현장 작업 기록은 /api/lot-cards/work 에서만 바꾼다. 이력카드 화면이 예전 값을 들고 저장해도 덮어쓰지 않게 서버 값을 유지한다.
  if (previous) {
    for (const key of WORK_FIELDS) {
      if (key in previous) (card as Record<string, unknown>)[key] = previous[key]
      else delete (card as Record<string, unknown>)[key]
    }
  }
  const saved = await putRecord(COLLECTION, card)
  // 롤수를 바꾸면 이 카드가 나온 수입검사 성적서(LOT 롤수)와 같은 성적서에서 나온 다른 이력카드도 같이 바꾼다.
  const next = card as Record<string, unknown>
  const source = String(next.sourceIncomingId ?? '')
  const rollCount = String(next.rollCount ?? '')
  if (previous && source && rollCount !== String(previous.rollCount ?? '')) {
    await patchRecord<Record<string, unknown>>('incoming-inspections', source, { lotRoll: rollCount })
    await patchRecordsWhere<Record<string, unknown>>(COLLECTION, (row) => row.sourceIncomingId === source && row.id !== card.id, { rollCount })
  }
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
