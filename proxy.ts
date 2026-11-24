import { NextResponse, type NextRequest } from 'next/server'
import { SESSION_COOKIE, verifySessionToken } from '@/lib/auth'

const PUBLIC_PATHS = new Set(['/login', '/api/auth/login', '/api/auth/register', '/api/auth/session'])
// 관리자만 볼 수 있는 화면(고객관리·품질관리·KPI 관리·위험성평가)과 그 API. lib/nav.ts의 minRole: 'admin' 과 맞춘다.
const ADMIN_PAGE_PREFIXES = ['/customer', '/quality', '/risk-assessment']
const ADMIN_API_PREFIXES = ['/api/customer', '/api/quality', '/api/risk-assessment']

function under(pathname: string, prefixes: string[]) {
  return prefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  if (PUBLIC_PATHS.has(pathname)) return NextResponse.next()
  const user = await verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value)

  if (!user) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })
    }
    return NextResponse.redirect(new URL('/login', request.url))
  }

  if (user.role !== 'admin') {
    if (under(pathname, ADMIN_API_PREFIXES)) {
      return NextResponse.json({ error: '관리자만 이용할 수 있습니다.' }, { status: 403 })
    }
    if (under(pathname, ADMIN_PAGE_PREFIXES)) {
      return NextResponse.redirect(new URL('/', request.url))
    }
  }
  return NextResponse.next()
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon\\.ico|logo\\.png|logo-dark\\.png|icon\\.svg|icon-light-32x32\\.png|icon-dark-32x32\\.png|apple-icon\\.png).*)',
  ],
}
