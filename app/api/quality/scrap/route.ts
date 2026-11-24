import { NextRequest, NextResponse } from 'next/server'
import { canEdit, getUserFromHeaders } from '@/lib/auth'
import { getSetting, setSetting } from '@/lib/records'
import type { UserRole } from '@/lib/types'

export const runtime = 'nodejs'

const KEY = 'quality-scrap'
const KINDS = new Set(['원자재', '반제품', '완제품', '부자재', '기타'])
const STATUSES = new Set(['등록', '검토중', '승인대기', '폐기승인'])

function text(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeRow(item: unknown) {
  if (!item || typeof item !== 'object') return null
  const row = item as Record<string, unknown>
  const id = text(row.id)
  const name = text(row.name)
  const reason = text(row.reason)
  if (!id || !name || !reason) return null
  return {
    id,
    no: text(row.no),
    registeredOn: text(row.registeredOn),
    kind: KINDS.has(text(row.kind)) ? text(row.kind) : '기타',
    company: text(row.company),
    department: text(row.department),
    name,
    lotNo: text(row.lotNo),
    qty: text(row.qty),
    reason,
    location: text(row.location),
    owner: text(row.owner),
    status: STATUSES.has(text(row.status)) ? text(row.status) : '등록',
  }
}

async function loadRows() {
  const stored = await getSetting<unknown>(KEY, [])
  if (!Array.isArray(stored)) return []
  return stored.map(normalizeRow).filter((row) => row !== null)
}

export async function GET() {
  return NextResponse.json({ data: await loadRows() })
}

export async function PUT(request: NextRequest) {
  const user = await getUserFromHeaders(request.headers)
  const role = user?.role as UserRole | undefined
  if (!user || !role || !canEdit(role)) {
    return NextResponse.json({ error: '수정 권한이 없습니다.' }, { status: 403 })
  }

  const body = await request.json().catch(() => null)
  if (!Array.isArray(body?.rows)) {
    return NextResponse.json({ error: '폐기품 데이터가 올바르지 않습니다.' }, { status: 400 })
  }

  const rows = body.rows.map(normalizeRow).filter((row: ReturnType<typeof normalizeRow>) => row !== null)
  await setSetting(KEY, rows)
  return NextResponse.json({ data: rows })
}
