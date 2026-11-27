import { randomUUID } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { canEdit, getUserFromHeaders } from '@/lib/auth'
import { MANUAL_TASKS_COLLECTION, parseManualTask, type ManualTask } from '@/lib/manual-tasks'
import { insertRecordPrepared, listRecords } from '@/lib/records'

export const dynamic = 'force-dynamic'

// 완료되지 않은 직접 등록 업무를 등록 순서대로 돌려준다.
export async function GET(request: NextRequest) {
  const user = await getUserFromHeaders(request.headers)
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })

  const rows = await listRecords<ManualTask>(MANUAL_TASKS_COLLECTION)
  const open = rows
    .filter((row) => !row.done)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  return NextResponse.json({ data: open })
}

// 편집 권한이 있는 사용자가 업무를 직접 등록한다.
export async function POST(request: NextRequest) {
  const user = await getUserFromHeaders(request.headers)
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })
  if (!canEdit(user.role)) return NextResponse.json({ error: '업무를 등록할 권한이 없습니다.' }, { status: 403 })

  const parsed = parseManualTask(await request.json().catch(() => null))
  if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 })

  const created = await insertRecordPrepared<ManualTask>(MANUAL_TASKS_COLLECTION, () => ({
    id: randomUUID(),
    ...parsed.value,
    done: false,
    createdAt: new Date().toISOString(),
    createdBy: user.displayName,
    createdById: user.id,
  }))
  return NextResponse.json({ data: created }, { status: 201 })
}
