import { NextResponse } from 'next/server'
import { getUserFromHeaders } from '@/lib/auth'
import { getDashboardStats } from '@/lib/dashboard-stats'

export async function GET(req: Request) {
  if (!await getUserFromHeaders(req.headers)) {
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })
  }
  return NextResponse.json(await getDashboardStats())
}
