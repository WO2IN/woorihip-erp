import { NextRequest, NextResponse } from 'next/server'
import { findUserById, getUserFromHeaders } from '@/lib/auth'
import { getSetting, setSetting } from '@/lib/records'
import { emptyStampEntry, readStampBook, SUITABILITY_STAMP_STEPS, SUITABILITY_STAMPS_KEY, type SuitabilityStampStep } from '@/lib/suitability-stamps'

function clip(value: unknown, max: number) {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

export async function GET() {
  const book = readStampBook(await getSetting(SUITABILITY_STAMPS_KEY, {}))
  return NextResponse.json({ data: book })
}

export async function PATCH(request: NextRequest) {
  const user = await getUserFromHeaders(request.headers)
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })

  const body = await request.json().catch(() => null) as { personId?: unknown; step?: unknown; action?: unknown; name?: unknown } | null
  const personId = clip(body?.personId, 80)
  const step = body?.step
  const action = body?.action
  if (!personId || typeof step !== 'string' || !SUITABILITY_STAMP_STEPS.includes(step as SuitabilityStampStep)) {
    return NextResponse.json({ error: '서명 칸이 올바르지 않습니다.' }, { status: 400 })
  }
  if (action !== 'sign' && action !== 'clear' && action !== 'name') {
    return NextResponse.json({ error: '서명 요청이 올바르지 않습니다.' }, { status: 400 })
  }

  const book = readStampBook(await getSetting(SUITABILITY_STAMPS_KEY, {}))
  const entry = book[personId] ?? emptyStampEntry()
  const stamp = step as SuitabilityStampStep

  if (action === 'sign') {
    const account = await findUserById(user.id)
    if (!account?.hasSignature) {
      return NextResponse.json({ error: '오른쪽 위 내 정보에서 서명 그림을 먼저 올려 주세요.' }, { status: 400 })
    }
    const existing = entry.signs[stamp]
    if (existing && existing !== user.id) {
      return NextResponse.json({ error: '이 칸에는 이미 서명이 있습니다.' }, { status: 400 })
    }
    entry.signs[stamp] = user.id
    const typed = clip(body?.name, 40)
    entry.names[stamp] = typed || entry.names[stamp] || user.displayName
  } else if (action === 'clear') {
    delete entry.signs[stamp]
    delete entry.names[stamp]
  } else {
    const typed = clip(body?.name, 40)
    if (typed) entry.names[stamp] = typed
    else delete entry.names[stamp]
  }

  if (Object.keys(entry.signs).length || Object.keys(entry.names).length) book[personId] = entry
  else delete book[personId]
  await setSetting(SUITABILITY_STAMPS_KEY, book)
  return NextResponse.json({ data: book })
}

export const dynamic = 'force-dynamic'
