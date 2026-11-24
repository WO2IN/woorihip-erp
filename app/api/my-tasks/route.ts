import { NextRequest, NextResponse } from 'next/server'
import { getUserFromHeaders } from '@/lib/auth'
import { canOperateFloor } from '@/lib/access'
import { localDate } from '@/lib/dashboard-stats'
import { writeMyTaskCheck } from '@/lib/my-tasks'

const TASK_KEY = /^[123]:(daily|5s|temp|process|worklog)$/

export async function POST(req: NextRequest) {
  const user = await getUserFromHeaders(req.headers)
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const key = String(body.key ?? '')
  if (!TASK_KEY.test(key)) return NextResponse.json({ error: '잘못된 업무입니다.' }, { status: 400 })

  const floor = key.charAt(0)
  if (user.role === 'admin' || !canOperateFloor(user, floor)) {
    return NextResponse.json({ error: '담당 층의 업무만 완료 처리할 수 있습니다.' }, { status: 403 })
  }

  await writeMyTaskCheck(user.id, localDate(), key, Boolean(body.done))
  return NextResponse.json({ ok: true })
}
