import { formatDotDate } from '@/lib/date-utils'
import { chosungSearch } from '@/lib/korean'

export type QualificationLedgerStatus = 'valid' | 'expiring' | 'expired' | 'cancelled'

export interface QualificationLedgerRow {
  id: string
  certNo: string
  qualification: string
  name: string
  department: string
  rank: string
  joinDate: string
  /** 연도(YYYY) → 갱신일 */
  renewals: Record<string, string>
  /** 기준년도+1 열에 표시할 갱신 예정일 */
  plannedRenewalDate: string
  cancelDate: string
  cancelReason: string
  acquiredDate: string
  expiryDate: string
  status: QualificationLedgerStatus
  suitabilityOnFile: boolean
  recognitionOnFile: boolean
  note: string
  /** MinIO stored_files.id (증명사진). */
  idPhotoFileId: string
}

export type QualificationLedgerFilters = {
  year: string
  qualification: string
  department: string
  rank: string
  status: string
  name: string
}

/** 자격인증대장 · 필터 자격명 */
export const QUALIFICATION_LEDGER_NAMES = [
  '내부품질감사',
  '품질검사원',
  '액분석',
  '출하공정목시검사',
  '권취 자격인증서',
  '수입·신뢰성 검사',
] as const

const QUALIFICATION_LEDGER_BADGE: Record<(typeof QUALIFICATION_LEDGER_NAMES)[number], string> = {
  내부품질감사: 'bg-violet-100 text-violet-800 ring-1 ring-inset ring-violet-200 dark:bg-violet-500/15 dark:text-violet-200 dark:ring-violet-500/30',
  품질검사원: 'bg-emerald-100 text-emerald-800 ring-1 ring-inset ring-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-200 dark:ring-emerald-500/30',
  액분석: 'bg-sky-100 text-sky-800 ring-1 ring-inset ring-sky-200 dark:bg-sky-500/15 dark:text-sky-200 dark:ring-sky-500/30',
  출하공정목시검사: 'bg-amber-100 text-amber-900 ring-1 ring-inset ring-amber-200 dark:bg-amber-500/15 dark:text-amber-100 dark:ring-amber-500/30',
  '권취 자격인증서': 'bg-rose-100 text-rose-800 ring-1 ring-inset ring-rose-200 dark:bg-rose-500/15 dark:text-rose-200 dark:ring-rose-500/30',
  '수입·신뢰성 검사': 'bg-teal-100 text-teal-800 ring-1 ring-inset ring-teal-200 dark:bg-teal-500/15 dark:text-teal-200 dark:ring-teal-500/30',
}

export function qualificationLedgerBadgeClass(qualification: string) {
  if ((QUALIFICATION_LEDGER_NAMES as readonly string[]).includes(qualification)) {
    return QUALIFICATION_LEDGER_BADGE[qualification as (typeof QUALIFICATION_LEDGER_NAMES)[number]]
  }
  return 'bg-slate-100 text-slate-700 ring-1 ring-inset ring-slate-200 dark:bg-muted dark:text-slate-200 dark:ring-border'
}

/** 조직 API에 없어도 대장·필터 소속 선택에 포함 */
export const QUALIFICATION_LEDGER_EXTRA_DEPARTMENTS = ['총괄'] as const

export function mergeQualificationLedgerDepartments(apiNames: string[]): string[] {
  const set = new Set<string>([...QUALIFICATION_LEDGER_EXTRA_DEPARTMENTS, ...apiNames])
  return [...set].sort((a, b) => a.localeCompare(b, 'ko'))
}

const LEGACY_QUALIFICATION_NAMES: Record<string, (typeof QUALIFICATION_LEDGER_NAMES)[number]> = {
  출하검사원: '출하공정목시검사',
  수입검사원: '수입·신뢰성 검사',
  '수입,신뢰성검사': '수입·신뢰성 검사',
  내부심사원: '내부품질감사',
  공정검사원: '품질검사원',
  '측정기 관리': '액분석',
}

/** 자격인증 등록 목록 양식 — 인증번호 QA-00 (2자리, 연도 없음) */
const SPREADSHEET_REF_ROWS: {
  certNo: string
  name: string
  qualification: (typeof QUALIFICATION_LEDGER_NAMES)[number]
  department: string
  rank: string
}[] = [
  { certNo: 'QA-00', name: '임종배', qualification: '내부품질감사', department: '총괄', rank: '상무' },
  { certNo: 'QA-03', name: '김영란', qualification: '수입·신뢰성 검사', department: '품질', rank: '대리' },
  { certNo: 'QA-10', name: '조승현', qualification: '내부품질감사', department: '품질', rank: '부장' },
  { certNo: 'QA-16', name: '', qualification: '권취 자격인증서', department: '생산', rank: '사원' },
  { certNo: 'QA-17', name: '현미', qualification: '출하공정목시검사', department: '품질', rank: '사원' },
  { certNo: 'QA-19', name: '김성환', qualification: '액분석', department: '품질', rank: '과장' },
  { certNo: 'QA-20', name: '김수호', qualification: '액분석', department: '품질', rank: '사원' },
  { certNo: 'QA-22', name: '유기곤', qualification: '내부품질감사', department: '영업', rank: '차장' },
  { certNo: 'QA-23', name: '나우인', qualification: '품질검사원', department: '품질', rank: '주임' },
  { certNo: 'QA-24', name: '고은채', qualification: '품질검사원', department: '품질', rank: '사원' },
  { certNo: 'QA-25', name: '심문경', qualification: '품질검사원', department: '품질', rank: '대리' },
]

export function parseQualificationLedgerName(value: unknown): (typeof QUALIFICATION_LEDGER_NAMES)[number] | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed) return null
  if ((QUALIFICATION_LEDGER_NAMES as readonly string[]).includes(trimmed)) {
    return trimmed as (typeof QUALIFICATION_LEDGER_NAMES)[number]
  }
  return LEGACY_QUALIFICATION_NAMES[trimmed] ?? null
}

const EXPIRING_DAYS = 90

/** 인증번호: QA-00 (2자리 일련번호) */
export function formatQualificationCertNo(sequence: number) {
  const seq = Number.isFinite(sequence) && sequence >= 0 ? Math.floor(sequence) : 0
  return `QA-${String(seq).padStart(2, '0')}`
}

export function isLegacyQualificationCertNo(certNo: string) {
  return /^Q[A]?-\d{4}-\d+$/i.test(certNo.trim())
}

export function normalizeQualificationCertNo(certNo: string): string {
  const trimmed = certNo.trim()
  if (!trimmed) return ''
  const short = trimmed.match(/^QA-(\d{1,2})$/i)
  if (short) return formatQualificationCertNo(Number(short[1]))
  const legacy = trimmed.match(/^Q[A]?-(\d{4})-(\d+)$/i)
  if (legacy) return formatQualificationCertNo(Number(legacy[2]))
  const loose = trimmed.match(/^Q[A]?-(\d+)$/i)
  if (loose) {
    const n = Number(loose[1])
    if (Number.isFinite(n) && n >= 0 && n < 100) return formatQualificationCertNo(n)
  }
  return trimmed
}

function parseCertNoNumber(certNo: string): number | null {
  const normalized = normalizeQualificationCertNo(certNo)
  const match = normalized.match(/^QA-(\d{2})$/i)
  if (!match) return null
  const n = Number(match[1])
  return Number.isFinite(n) ? n : null
}

function resolveSpreadsheetCert(row: QualificationLedgerRow): string | null {
  const name = row.name.trim()
  if (name) {
    if (name === '김성화') return 'QA-19'
    const byName = SPREADSHEET_REF_ROWS.find((ref) => ref.name === name)
    if (byName) return byName.certNo
  }
  const byProfile = SPREADSHEET_REF_ROWS.find(
    (ref) =>
      ref.qualification === row.qualification &&
      ref.department === row.department &&
      ref.rank === row.rank,
  )
  if (byProfile) return byProfile.certNo
  return null
}

function reconcileDuplicateCertNumbers(rows: QualificationLedgerRow[]): QualificationLedgerRow[] {
  const used = new Set<string>()
  return rows.map((row) => {
    const sheet = resolveSpreadsheetCert(row)
    let certNo = sheet ?? row.certNo.trim()

    if (certNo && used.has(certNo)) {
      if (sheet) {
        certNo = sheet
      } else if (isLegacyQualificationCertNo(row.certNo)) {
        certNo = normalizeQualificationCertNo(row.certNo)
      } else {
        let n = parseCertNoNumber(certNo) ?? 0
        do {
          n += 1
          certNo = formatQualificationCertNo(n)
        } while (used.has(certNo))
      }
    }

    if (!certNo) return row
    used.add(certNo)
    return { ...row, certNo }
  })
}

/** 신규 등록 시 사용할 다음 QA-XX */
export function allocateNextQualificationCertNo(rows: QualificationLedgerRow[]): string {
  let max = -1
  for (const row of rows) {
    const n = parseCertNoNumber(row.certNo)
    if (n != null && n > max) max = n
  }
  return formatQualificationCertNo(max + 1)
}

/** QA-2026-001 → QA-00 양식 (연도 제거). 양식표·성명·자격 프로필 우선. */
export function migrateQualificationLedgerCertNumbers(rows: QualificationLedgerRow[]): QualificationLedgerRow[] {
  let draft = rows.map((row) => {
    const sheet = resolveSpreadsheetCert(row)
    if (sheet) return { ...row, certNo: sheet }

    const raw = row.certNo.trim()
    if (isLegacyQualificationCertNo(raw)) {
      return { ...row, certNo: normalizeQualificationCertNo(raw) }
    }
    if (raw) return { ...row, certNo: normalizeQualificationCertNo(raw) }
    return row
  })

  draft = reconcileDuplicateCertNumbers(draft)

  for (let i = 0; i < draft.length; i++) {
    if (draft[i].certNo.trim()) continue
    draft[i] = { ...draft[i], certNo: allocateNextQualificationCertNo(draft) }
  }

  return draft.map((row) => enrichQualificationLedgerRow(row))
}

export function todayIso() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function parseIsoDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const [y, m, d] = value.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  return Number.isNaN(date.getTime()) ? null : date
}

export function deriveQualificationStatus(
  row: Pick<QualificationLedgerRow, 'status' | 'expiryDate'>,
  today = todayIso(),
): QualificationLedgerStatus {
  if (row.status === 'cancelled') return 'cancelled'
  const expiry = parseIsoDate(row.expiryDate)
  const now = parseIsoDate(today)
  if (!expiry || !now) return 'valid'
  const todayMs = now.getTime()
  const expiryMs = expiry.getTime()
  if (expiryMs < todayMs) return 'expired'
  const limit = new Date(now)
  limit.setDate(limit.getDate() + EXPIRING_DAYS)
  if (expiryMs <= limit.getTime()) return 'expiring'
  return 'valid'
}

export function statusLabel(status: QualificationLedgerStatus) {
  switch (status) {
    case 'valid':
      return '유효'
    case 'expiring':
      return '만료예정'
    case 'expired':
      return '만료'
    case 'cancelled':
      return '취소'
  }
}

export function ledgerRenewalYears(baseYear: string): [number, number, number] {
  const y = Number(baseYear)
  if (!Number.isFinite(y)) {
    const now = new Date().getFullYear()
    return [now - 1, now, now + 1]
  }
  return [y - 1, y, y + 1]
}

export function renewalCellText(row: QualificationLedgerRow, year: number, plannedColumn: boolean) {
  if (plannedColumn) {
    const planned = row.plannedRenewalDate || row.renewals[String(year)] || ''
    return planned ? displayIsoDate(planned) : '—'
  }
  const date = row.renewals[String(year)] ?? ''
  return date ? displayIsoDate(date) : '—'
}

export function rowMatchesYear(row: QualificationLedgerRow, year: string) {
  if (!year || !/^\d{4}$/.test(year)) return true
  const acquiredText = row.acquiredDate.trim()
  const expiryText = row.expiryDate.trim()
  const join = row.joinDate.trim()
  const hasRenewals = Object.keys(row.renewals ?? {}).some((key) => /^\d{4}$/.test(key))
  /** 등록 직후·일자 미입력 행은 연도 필터에서 숨기지 않음 */
  if (!acquiredText && !expiryText && !join && !hasRenewals && !row.plannedRenewalDate.trim() && !row.cancelDate.trim()) {
    return true
  }
  const renewalYears = Object.keys(row.renewals ?? {})
  if (renewalYears.includes(year)) return true
  if (row.plannedRenewalDate.startsWith(year)) return true
  if (row.joinDate.startsWith(year)) return true
  if (row.cancelDate.startsWith(year)) return true
  const acquiredYear = row.acquiredDate.slice(0, 4)
  const expiryYear = row.expiryDate.slice(0, 4)
  if (acquiredYear === year || expiryYear === year) return true
  const start = parseIsoDate(`${year}-01-01`)
  const end = parseIsoDate(`${year}-12-31`)
  const from = parseIsoDate(row.acquiredDate)
  const to = parseIsoDate(row.expiryDate)
  if (!start || !end || !from || !to) return false
  return from.getTime() <= end.getTime() && to.getTime() >= start.getTime()
}

export function filterQualificationLedger(rows: QualificationLedgerRow[], filters: QualificationLedgerFilters) {
  const nameQ = filters.name.trim()
  return rows.filter((row) => {
    const status = deriveQualificationStatus(row)
    if (filters.year && filters.year !== 'all' && !rowMatchesYear(row, filters.year)) return false
    if (filters.qualification !== 'all' && row.qualification !== filters.qualification) return false
    if (filters.department !== 'all' && row.department !== filters.department) return false
    if (filters.rank !== 'all' && row.rank !== filters.rank) return false
    if (filters.status !== 'all' && status !== filters.status) return false
    if (nameQ && !chosungSearch(row.name, nameQ)) return false
    return true
  })
}

export function summarizeQualificationLedger(rows: QualificationLedgerRow[], year: string) {
  const yearNum = /^\d{4}$/.test(year) ? Number(year) : new Date().getFullYear()
  const withStatus = rows.map((row) => ({ row, status: deriveQualificationStatus(row) }))
  const renewalDue = withStatus.filter(
    ({ row, status }) =>
      status !== 'cancelled' &&
      row.expiryDate.startsWith(String(yearNum)) &&
      (status === 'expiring' || status === 'expired' || status === 'valid'),
  ).length
  const renewalDone = rows.filter(
    (row) => deriveQualificationStatus(row) !== 'cancelled' && Boolean(row.renewals[String(yearNum)]),
  ).length
  const internalAudit = rows.filter(
    (row) => row.qualification === '내부품질감사' && deriveQualificationStatus(row) !== 'cancelled',
  ).length
  const suitability = rows.filter((row) => row.suitabilityOnFile).length
  const recognition = rows.filter((row) => row.recognitionOnFile).length
  const recognitionValid = withStatus.filter(({ row, status }) => row.recognitionOnFile && status === 'valid').length
  const recognitionExpired = withStatus.filter(
    ({ row, status }) => row.recognitionOnFile && (status === 'expired' || status === 'expiring'),
  ).length

  return {
    total: rows.length,
    internalAudit,
    renewalDue,
    renewalDone,
    suitability,
    recognition,
    recognitionValid,
    recognitionExpired,
  }
}

function parseRenewals(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object') return {}
  const out: Record<string, string> = {}
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (/^\d{4}$/.test(key) && typeof raw === 'string' && raw.trim()) out[key] = raw.trim()
  }
  return out
}

function enrichQualificationLedgerRow(row: QualificationLedgerRow): QualificationLedgerRow {
  const renewals = { ...row.renewals }
  if (row.acquiredDate) {
    const y = row.acquiredDate.slice(0, 4)
    if (/^\d{4}$/.test(y) && !renewals[y]) renewals[y] = row.acquiredDate
  }
  const cancelled = row.status === 'cancelled'
  const cancelDate = row.cancelDate || (cancelled && row.expiryDate ? row.expiryDate : '')
  const cancelReason = row.cancelReason || (cancelled ? row.note : '')
  const plannedRenewalDate = cancelled ? '' : row.plannedRenewalDate || row.expiryDate || ''

  const next: QualificationLedgerRow = {
    ...row,
    renewals,
    cancelDate,
    cancelReason,
    plannedRenewalDate: cancelled ? '' : plannedRenewalDate,
    certNo: row.certNo.trim() ? normalizeQualificationCertNo(row.certNo) : '',
  }
  return { ...next, status: deriveQualificationStatus(next) }
}

export function createQualificationLedgerRowDraft(input: {
  qualification: string
  name: string
  department?: string
  rank?: string
  joinDate?: string
  acquiredDate?: string
  expiryDate?: string
  note?: string
  certNo?: string
  idPhotoFileId?: string
}): QualificationLedgerRow | null {
  const acquired = input.acquiredDate?.trim() ?? ''
  const expiry = input.expiryDate?.trim() ?? ''
  const acquiredYear = acquired.slice(0, 4)
  const renewals =
    acquired && /^\d{4}-\d{2}-\d{2}$/.test(acquired) && /^\d{4}$/.test(acquiredYear)
      ? { [acquiredYear]: acquired }
      : {}

  const certNo = input.certNo?.trim() ? normalizeQualificationCertNo(input.certNo) : ''

  return normalizeQualificationLedgerRow({
    id: `ql-${Date.now().toString(36)}`,
    certNo,
    qualification: input.qualification,
    name: input.name,
    department: input.department?.trim() ?? '',
    rank: input.rank?.trim() ?? '',
    joinDate: input.joinDate?.trim() ?? '',
    renewals,
    plannedRenewalDate: expiry,
    cancelDate: '',
    cancelReason: '',
    acquiredDate: acquired,
    expiryDate: expiry,
    status: 'valid',
    suitabilityOnFile: false,
    recognitionOnFile: false,
    note: input.note?.trim() ?? '',
    idPhotoFileId: input.idPhotoFileId ?? '',
  })
}

export function updateQualificationLedgerRow(
  existing: QualificationLedgerRow,
  input: {
    qualification: string
    name: string
    department?: string
    rank?: string
    joinDate?: string
    acquiredDate?: string
    expiryDate?: string
    cancelDate?: string
    cancelReason?: string
    certNo?: string
    idPhotoFileId?: string
  },
): QualificationLedgerRow | null {
  const acquired = input.acquiredDate?.trim() ?? ''
  const expiry = input.expiryDate?.trim() ?? ''
  const cancelDate = input.cancelDate?.trim() ?? ''
  const cancelReason = input.cancelReason?.trim() ?? ''
  const certNo = input.certNo !== undefined ? input.certNo.trim() : existing.certNo
  return normalizeQualificationLedgerRow({
    ...existing,
    certNo,
    qualification: input.qualification,
    name: input.name,
    department: input.department?.trim() ?? '',
    rank: input.rank?.trim() ?? '',
    joinDate: input.joinDate?.trim() ?? '',
    acquiredDate: acquired,
    expiryDate: expiry,
    plannedRenewalDate: expiry || existing.plannedRenewalDate,
    cancelDate,
    cancelReason,
    status: cancelDate ? 'cancelled' : 'valid',
    idPhotoFileId: input.idPhotoFileId !== undefined ? input.idPhotoFileId : existing.idPhotoFileId,
  })
}

export function normalizeQualificationLedgerRow(value: unknown): QualificationLedgerRow | null {
  if (!value || typeof value !== 'object') return null
  const row = value as Record<string, unknown>
  if (typeof row.id !== 'string' || !row.id.trim()) return null
  if (typeof row.name !== 'string' || !row.name.trim()) return null
  const qualification = parseQualificationLedgerName(row.qualification)
  if (!qualification) return null

  const statusRaw = row.status
  const status: QualificationLedgerStatus =
    statusRaw === 'cancelled' || statusRaw === 'expired' || statusRaw === 'expiring' || statusRaw === 'valid'
      ? statusRaw
      : 'valid'

  const next: QualificationLedgerRow = {
    id: row.id.trim(),
    certNo: typeof row.certNo === 'string' ? row.certNo.trim() : '',
    qualification,
    name: row.name.trim(),
    department: typeof row.department === 'string' ? row.department.trim() : '',
    rank: typeof row.rank === 'string' ? row.rank.trim() : '',
    joinDate: typeof row.joinDate === 'string' ? row.joinDate.trim() : '',
    renewals: parseRenewals(row.renewals),
    plannedRenewalDate: typeof row.plannedRenewalDate === 'string' ? row.plannedRenewalDate.trim() : '',
    cancelDate: typeof row.cancelDate === 'string' ? row.cancelDate.trim() : '',
    cancelReason: typeof row.cancelReason === 'string' ? row.cancelReason.trim() : '',
    acquiredDate: typeof row.acquiredDate === 'string' ? row.acquiredDate.trim() : '',
    expiryDate: typeof row.expiryDate === 'string' ? row.expiryDate.trim() : '',
    status,
    suitabilityOnFile: row.suitabilityOnFile === true,
    recognitionOnFile: row.recognitionOnFile === true,
    note: typeof row.note === 'string' ? row.note.trim() : '',
    idPhotoFileId:
      typeof row.idPhotoFileId === 'string' && /^[a-f0-9-]{36}$/i.test(row.idPhotoFileId.trim())
        ? row.idPhotoFileId.trim()
        : '',
  }
  return enrichQualificationLedgerRow(next)
}

export function displayIsoDate(date: string) {
  return formatDotDate(date)
}

export function sortQualificationLedger(a: QualificationLedgerRow, b: QualificationLedgerRow) {
  return (
    a.qualification.localeCompare(b.qualification, 'ko') ||
    a.department.localeCompare(b.department, 'ko') ||
    a.name.localeCompare(b.name, 'ko')
  )
}
