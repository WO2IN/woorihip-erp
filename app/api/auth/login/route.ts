import { NextRequest, NextResponse } from 'next/server'
import {
  authenticate,
  createSessionToken,
  SESSION_COOKIE,
  sessionCookieOptions,
  toPublicUser,
} from '@/lib/auth'

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { username, password } = body

  if (!username || !password) {
    return NextResponse.json(
      { error: '아이디와 비밀번호를 입력해주세요.' },
      { status: 400 }
    )
  }

  const user = await authenticate(username, password)

  if (!user) {
    return NextResponse.json(
      { error: '아이디 또는 비밀번호가 올바르지 않습니다.' },
      { status: 401 }
    )
  }

  if (user.status === 'pending') {
    return NextResponse.json(
      { error: '관리자 승인 대기 중입니다. 승인 후 로그인할 수 있습니다.' },
      { status: 403 }
    )
  }

  const response = NextResponse.json({
    success: true,
    user: toPublicUser(user),
  })
  response.cookies.set(SESSION_COOKIE, createSessionToken(user), sessionCookieOptions)
  return response
}
