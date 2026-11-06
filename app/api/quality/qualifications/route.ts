import { NextRequest, NextResponse } from 'next/server'
import { canManageQualityRecords, getUserFromHeaders } from '@/lib/auth'
import {
  migrateQualificationLedgerCertNumbers,
  normalizeQualificationLedgerRow,
  sortQualificationLedger,
  type QualificationLedgerRow,
} from '@/lib/qualification-ledger'
import { parseDataUrlPhoto, reconcileQualificationIdPhoto } from '@/lib/qualification-id-photo'
import { appendAuditLog } from '@/lib/storage'
import { getSetting, setSetting } from '@/lib/records'
import type { UserRole } from '@/lib/types'

export const runtime = 'nodejs'

const KEY = 'qualification-ledger'
const SAMPLE_LEDGER_IDS = new Set(['ql-001', 'ql-002', 'ql-003', 'ql-004', 'ql-005', 'ql-006', 'ql-007', 'ql-008'])

type RawLedgerRow = Record<string, unknown> & { id?: string }

async function reconcileRowPhotoFromRaw(
  raw: RawLedgerRow,
  previousFileId: string | undefined,
  user?: { id: string; displayName: string },
) {
  const rowId = typeof raw.id === 'string' ? raw.id.trim() : ''
  if (!rowId) return ''

  const legacyDataUrl = parseDataUrlPhoto(raw.idPhoto) ? raw.idPhoto : undefined
  const pendingDataUrl = parseDataUrlPhoto(raw.idPhotoPending) ? raw.idPhotoPending : undefined
  const dataUrl = pendingDataUrl ?? legacyDataUrl

  return reconcileQualificationIdPhoto({
    ledgerRowId: rowId,
    dataUrl,
    fileId: raw.idPhotoFileId,
    previousFileId,
    uploadedBy: user?.id,
    uploadedByName: user?.displayName,
  })
}

async function persistLedgerRows(rows: QualificationLedgerRow[]) {
  const migrated = migrateQualificationLedgerCertNumbers(rows)
  const sorted = migrated.sort(sortQualificationLedger)
  await setSetting(KEY, sorted)
  return sorted
}

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

  let photoMigrationNeeded = false
  const reconciled: QualificationLedgerRow[] = []
  for (const item of kept) {
    const raw = item as RawLedgerRow
    const normalized = normalizeQualificationLedgerRow(raw)
    if (!normalized) continue

    const legacyDataUrl = parseDataUrlPhoto(raw.idPhoto)
    if (legacyDataUrl && !normalized.idPhotoFileId) {
      photoMigrationNeeded = true
      const fileId = await reconcileQualificationIdPhoto({
        ledgerRowId: normalized.id,
        dataUrl: raw.idPhoto,
      })
      reconciled.push({ ...normalized, idPhotoFileId: fileId })
      continue
    }
    reconciled.push(normalized)
  }

  const migrated = migrateQualificationLedgerCertNumbers(reconciled)
  const sorted = migrated.sort(sortQualificationLedger)
  const hadLegacyPhoto = kept.some(
    (item) => item && typeof item === 'object' && parseDataUrlPhoto((item as RawLedgerRow).idPhoto),
  )
  const beforeCert = migrateQualificationLedgerCertNumbers(
    kept.map((item) => normalizeQualificationLedgerRow(item)).filter((row): row is QualificationLedgerRow => Boolean(row)),
  ).sort(sortQualificationLedger)
  const certChanged = JSON.stringify(beforeCert) !== JSON.stringify(sorted)

  if (photoMigrationNeeded || hadLegacyPhoto || certChanged || kept.length !== reconciled.length) {
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

  const previous = await loadRows()
  const previousById = new Map(previous.map((row) => [row.id, row]))

  const reconciledRows: QualificationLedgerRow[] = []
  for (const item of body.rows) {
    if (!item || typeof item !== 'object') {
      return NextResponse.json({ error: '자격인증 데이터가 올바르지 않습니다.' }, { status: 400 })
    }
    const raw = item as RawLedgerRow
    const rowId = typeof raw.id === 'string' ? raw.id.trim() : ''
    if (!rowId) {
      return NextResponse.json({ error: '자격인증 데이터가 올바르지 않습니다.' }, { status: 400 })
    }

    const previousRow = previousById.get(rowId)
    const idPhotoFileId = await reconcileRowPhotoFromRaw(raw, previousRow?.idPhotoFileId, {
      id: user.id,
      displayName: user.displayName,
    })

    const normalized = normalizeQualificationLedgerRow({ ...raw, idPhotoFileId })
    if (!normalized) {
      return NextResponse.json({ error: '성명과 자격명은 필수입니다.' }, { status: 400 })
    }
    reconciledRows.push(normalized)
  }

  const sorted = await persistLedgerRows(reconciledRows)
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
