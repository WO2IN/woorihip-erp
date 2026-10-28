import { NextResponse } from 'next/server'
import { getUserFromHeaders, findUserById, SESSION_COOKIE, sessionCookieOptions, toPublicUser } from '@/lib/auth'

function clearedResponse(body: object, status = 200) {
  const response = NextResponse.json(body, { status })
  response.cookies.set(SESSION_COOKIE, '', { ...sessionCookieOptions, maxAge: 0 })
  return response
}

export async function POST(request: Request) {
  const requestUser = await getUserFromHeaders(request.headers)
  const user = requestUser ? await findUserById(requestUser.id) : null
  if (!user) return clearedResponse({ ok: false }, 401)
  return NextResponse.json({ ok: true, user: toPublicUser(user) })
}

export async function DELETE() {
  return clearedResponse({ ok: true })
}
