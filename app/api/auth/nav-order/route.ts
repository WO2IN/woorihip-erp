import { NextResponse } from 'next/server'
import { getUserFromHeaders, toPublicUser, updateUser } from '@/lib/auth'
import { normalizeNavOrder } from '@/lib/nav-order'

export async function PATCH(request: Request) {
  const requestUser = await getUserFromHeaders(request.headers)
  if (!requestUser) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })

  const body = await request.json().catch(() => null)
  const raw = body?.order
  if (raw !== null && !Array.isArray(raw)) {
    return NextResponse.json({ error: '메뉴 순서가 올바르지 않습니다.' }, { status: 400 })
  }

  const order = raw === null ? null : normalizeNavOrder(raw.filter((id: unknown): id is string => typeof id === 'string'))
  const user = await updateUser(requestUser.id, { navOrder: order })
  if (!user) return NextResponse.json({ error: '계정을 찾을 수 없습니다.' }, { status: 404 })
  return NextResponse.json({ ok: true, user: toPublicUser(user) })
}
