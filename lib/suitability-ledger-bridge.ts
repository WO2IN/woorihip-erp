import type { QualificationLedgerRow } from '@/lib/qualification-ledger'

export type EvalSheetKind = 'inspector' | 'internal-audit'

export type SuitabilityScoresOverlay = {
  academic: number
  education: number
  skills: number[]
  career: number
  evalExam?: number
} | null

/** 적격성평가서에만 두는 필드(대장 id 기준) */
export type SuitabilityPersonOverlay = {
  scores?: SuitabilityScoresOverlay
  duty?: string
  auditType?: string
  requestDept?: string
  requested?: string
  /** 대장 갱신 예정일보다 평가 화면에서 수정한 값 */
  competencyReeval?: string
}

export type SuitabilitySheetPersisted = {
  overlays: Record<string, SuitabilityPersonOverlay>
  /** 대장에 없는 임시 추가 대상 (id: new-*) */
  extraPeople?: SuitabilityDraftPerson[]
  grantStatusesByPerson?: Record<string, string[]>
  practicalGateByPerson?: Record<string, string>
  /** 검사원 실기 ①~④ 항목별 합격·측정값 */
  inspectorPracticalByPerson?: Record<
    string,
    Record<
      string,
      {
        verdict: string
        score?: string
        effectiveness?: string
        deviation?: string
        grr?: string
        errors?: string
      }
    >
  >
  pipelineActiveByPerson?: Record<string, string>
}

/** suitability-sheet Person 과 동일 필드 (순환 import 방지) */
export type SuitabilityDraftPerson = {
  id: string
  evalType: EvalSheetKind
  name: string
  role: string
  certNo: string
  meta: string
  badge?: string
  note?: string
  dept: string
  title: string
  duty: string
  qual: string
  auditType: string
  requestDept: string
  issued: string
  requested: string
  expiryDate: string
  competencyReeval: string
  scores: SuitabilityScoresOverlay
}

export function evalSheetKindFromQualification(qualification: string): EvalSheetKind {
  return qualification === '내부품질감사' ? 'internal-audit' : 'inspector'
}

function roleLabels(evalType: EvalSheetKind, qualification: string) {
  if (evalType === 'internal-audit') {
    return { role: '내부심사원', qual: '내부심사원' }
  }
  return { role: '검사원', qual: qualification }
}

export function personFromQualificationLedgerRow(
  row: QualificationLedgerRow,
  overlay?: SuitabilityPersonOverlay | null,
): SuitabilityDraftPerson {
  const evalType = evalSheetKindFromQualification(row.qualification)
  const { role, qual } = roleLabels(evalType, row.qualification)
  const dept = row.department.trim()
  const title = row.rank.trim()
  const meta = [dept, title].filter(Boolean).join(' · ')

  return {
    id: row.id,
    evalType,
    name: row.name.trim(),
    role,
    certNo: row.certNo.trim(),
    meta,
    dept,
    title,
    duty: overlay?.duty?.trim() ?? '',
    qual,
    auditType: overlay?.auditType?.trim() || '신규',
    requestDept: overlay?.requestDept?.trim() ?? dept,
    issued: row.acquiredDate.trim(),
    requested: overlay?.requested?.trim() ?? '',
    expiryDate: row.expiryDate.trim(),
    competencyReeval: overlay?.competencyReeval?.trim() || row.plannedRenewalDate.trim() || '',
    scores: overlay?.scores !== undefined ? overlay.scores : null,
  }
}

export function mergeLedgerRowsWithSuitabilityStore(
  rows: QualificationLedgerRow[],
  store: SuitabilitySheetPersisted | null | undefined,
): SuitabilityDraftPerson[] {
  const overlays = store?.overlays ?? {}
  const ledgerIds = new Set(rows.map((row) => row.id))
  const fromLedger = rows.map((row) => personFromQualificationLedgerRow(row, overlays[row.id]))
  const extras = (store?.extraPeople ?? []).filter((person) => !ledgerIds.has(person.id))
  return [...fromLedger, ...extras]
}

export function extractOverlaysFromPeople(
  people: SuitabilityDraftPerson[],
  ledgerIds: Set<string>,
): Record<string, SuitabilityPersonOverlay> {
  const out: Record<string, SuitabilityPersonOverlay> = {}
  for (const person of people) {
    if (!ledgerIds.has(person.id)) continue
    out[person.id] = {
      scores: person.scores,
      duty: person.duty,
      auditType: person.auditType,
      requestDept: person.requestDept,
      requested: person.requested,
      competencyReeval: person.competencyReeval,
    }
  }
  return out
}
