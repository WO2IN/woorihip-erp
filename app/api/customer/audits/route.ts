import { NextRequest, NextResponse } from 'next/server'
import { canEdit, getUserFromHeaders } from '@/lib/auth'
import { appendAuditLog } from '@/lib/storage'
import { getSetting, setSetting } from '@/lib/records'
import type { UserRole } from '@/lib/types'

const KEY = 'customer-audits'
const TEXT_FIELDS = ['company', 'scope', 'auditDate', 'dueDate', 'closeDate', 'doneDate', 'dept', 'owner'] as const
const COUNT_FIELDS = ['count', 'done'] as const

function normalizeRow(value: unknown) {
  if (!value || typeof value !== 'object') return null
  const row = value as Record<string, unknown>
  if (typeof row.id !== 'string' || !row.id) return null
  const kind = row.kind === 'QSA' || row.kind === 'SQA' ? 'QSA' : row.kind === 'QPA' || row.kind === 'SPA' ? 'QPA' : null
  if (!kind) return null
  if (typeof row.company !== 'string' || !row.company.trim()) return null

  const next: Record<string, unknown> = { id: row.id, kind }
  for (const field of TEXT_FIELDS) next[field] = typeof row[field] === 'string' ? (row[field] as string).trim() : ''
  for (const field of COUNT_FIELDS) {
    const count = Number(row[field])
    next[field] = Number.isFinite(count) && count > 0 ? Math.floor(count) : 0
  }
  if ((next.done as number) > (next.count as number)) next.done = next.count
  return next
}

export async function GET() {
  const rows = await getSetting<unknown>(KEY, null)
  return NextResponse.json({ data: Array.isArray(rows) ? rows : null })
}

export async function PUT(request: NextRequest) {
  const user = await getUserFromHeaders(request.headers)
  const role = user?.role as UserRole | undefined
  if (!user || !role || !canEdit(role)) {
    return NextResponse.json({ error: '수정 권한이 없습니다.' }, { status: 403 })
  }

  const body = await request.json().catch(() => null)
  if (!Array.isArray(body?.rows)) {
    return NextResponse.json({ error: '심사 데이터가 올바르지 않습니다.' }, { status: 400 })
  }

  const rows = body.rows.map(normalizeRow)
  if (rows.some((row: unknown) => !row)) {
    return NextResponse.json({ error: '구분과 고객사는 꼭 입력해야 합니다.' }, { status: 400 })
  }

  await setSetting(KEY, rows)
  await appendAuditLog({
    action: 'UPDATE',
    target: 'customer-audits',
    detail: typeof body.detail === 'string' && body.detail ? body.detail : '고객심사현황 수정',
    userId: user.id,
    userName: user.displayName,
  })
  return NextResponse.json({ data: rows })
}

export const dynamic = 'force-dynamic'
