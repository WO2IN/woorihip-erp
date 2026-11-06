import { NextRequest, NextResponse } from 'next/server'
import { canManageQualityRecords, getUserFromHeaders } from '@/lib/auth'
import {
  migrateQualificationLedgerCertNumbers,
  normalizeQualificationLedgerRow,
  sortQualificationLedger,
} from '@/lib/qualification-ledger'
import { appendAuditLog } from '@/lib/storage'
import { getSetting, setSetting } from '@/lib/records'
import type { UserRole } from '@/lib/types'

const KEY = 'qualification-ledger'
const SAMPLE_LEDGER_IDS = new Set(['ql-001', 'ql-002', 'ql-003', 'ql-004', 'ql-005', 'ql-006', 'ql-007', 'ql-008'])

async function loadRows() {
  const stored = await getSetting<unknown>(KEY, null)
  if (!Array.isArray(stored) || stored.length === 0) return []
  const kept = stored.filter((item) => {
    if (!item || typeof item !== 'object') return false
    const id = (item as { id?: unknown }).id
    return typeof id !== 'string' || !SAMPLE_LEDGER_IDS.has(id)
  })
  if (kept.length !== stored.length) {
    await setSetting(KEY, kept)
  }
  if (kept.length === 0) return []
  const normalized = kept.map(normalizeQualificationLedgerRow).filter(Boolean) as NonNullable<
    ReturnType<typeof normalizeQualificationLedgerRow>
  >[]
  const migrated = migrateQualificationLedgerCertNumbers(normalized)
  const sorted = migrated.sort(sortQualificationLedger)
  const rowChanged = migrated.some((row, index) => {
    const raw = kept[index] as { certNo?: string; qualification?: string } | undefined
    return raw?.certNo !== row.certNo || raw?.qualification !== row.qualification
  })
  if (migrated.length !== kept.length || rowChanged) {
    await setSetting(KEY, sorted)
  }
  return sorted
}

export async function GET() {
  const data = await loadRows()
  return NextResponse.json({ data })
}

export async function PUT(request: NextRequest) {
  const user = await getUserFromHeaders(request.headers)
  const role = user?.role as UserRole | undefined
  if (!user || !role || !canManageQualityRecords(role)) {
    return NextResponse.json({ error: '관리자만 수정할 수 있습니다.' }, { status: 403 })
  }

  const body = await request.json().catch(() => null)
  if (!Array.isArray(body?.rows)) {
    return NextResponse.json({ error: '자격인증 데이터가 올바르지 않습니다.' }, { status: 400 })
  }

  const rows = body.rows.map(normalizeQualificationLedgerRow)
  if (rows.some((row: unknown) => !row)) {
    return NextResponse.json({ error: '성명과 자격명은 필수입니다.' }, { status: 400 })
  }

  const migrated = migrateQualificationLedgerCertNumbers(
    rows as NonNullable<ReturnType<typeof normalizeQualificationLedgerRow>>[],
  )
  const sorted = migrated.sort(sortQualificationLedger)
  await setSetting(KEY, sorted)
  await appendAuditLog({
    action: 'UPDATE',
    target: 'qualification-ledger',
    detail: typeof body.detail === 'string' && body.detail ? body.detail : '자격인증대장 수정',
    userId: user.id,
    userName: user.displayName,
  })
  return NextResponse.json({ data: sorted })
}

export const dynamic = 'force-dynamic'
