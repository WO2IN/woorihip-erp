import { NextRequest, NextResponse } from 'next/server'
import { canEdit, getUserFromHeaders } from '@/lib/auth'
import { deleteRecord, listRecords, putRecord } from '@/lib/records'

const COLLECTION = 'incoming-inspections'

function asSheet(body: unknown): { id: string } | null {
  if (!body || typeof body !== 'object') return null
  const sheet = body as Record<string, unknown>
  const id = String(sheet.id ?? '').trim()
  if (!id) return null
  return { ...sheet, id }
}

export async function GET(req: NextRequest) {
  const requestUser = await getUserFromHeaders(req.headers)
  if (!requestUser) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })
  const data = await listRecords<{ id: string }>(COLLECTION)
  return NextResponse.json({ data })
}

export async function PUT(req: NextRequest) {
  const requestUser = await getUserFromHeaders(req.headers)
  if (!requestUser || !canEdit(requestUser.role)) {
    return NextResponse.json({ error: '수입검사 성적서 저장 권한이 없습니다.' }, { status: 403 })
  }
  const sheet = asSheet(await req.json().catch(() => null))
  if (!sheet) return NextResponse.json({ error: '성적서 내용이 올바르지 않습니다.' }, { status: 400 })
  const saved = await putRecord(COLLECTION, sheet)
  return NextResponse.json({ data: saved })
}

export async function DELETE(req: NextRequest) {
  const requestUser = await getUserFromHeaders(req.headers)
  if (!requestUser || !canEdit(requestUser.role)) {
    return NextResponse.json({ error: '수입검사 성적서 삭제 권한이 없습니다.' }, { status: 403 })
  }
  const body = await req.json().catch(() => null)
  const id = String(body?.id ?? '').trim()
  if (!id) return NextResponse.json({ error: '삭제할 성적서가 없습니다.' }, { status: 400 })
  await deleteRecord(COLLECTION, id)
  return NextResponse.json({ ok: true })
}

export const dynamic = 'force-dynamic'
