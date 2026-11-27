import { KPI_KINDS } from '@/lib/incoming-kpi'

const AUDIT_TARGET_LABELS: Record<string, string> = {
  document: '문서',
  config: '기초정보',
  user: '사용자',
  organization: '조직도',
  'process-template': '공정 점검표',
  'process-check': '공정 점검 기록',
  inventory: '입고',
  'floor3-work-log': '작업일보',
  'process-nonconformity': '공정 부적합',
  'customer-nonconformity': '고객 부적합',
  'development-change-requests': '4M 변경요청',
  'qualification-ledger': '자격인증 대장',
  'suitability-sheet': '적격성평가서',
  'customer-audits': '고객 심사',
  'lot-card': '이력카드',
  'trace-barcode': '바코드',
  approval: '결재',
  'inspector-exam': '검사원 평가',
  'internal-auditor-exam': '내부심사원 평가',
}

const KPI_TARGET_LABELS = Object.fromEntries(
  Object.values(KPI_KINDS).map((spec) => [spec.key, spec.title]),
) as Record<string, string>

export function getAuditTargetLabel(target: string) {
  const key = target.trim()
  if (!key) return '—'
  return AUDIT_TARGET_LABELS[key] ?? KPI_TARGET_LABELS[key] ?? key
}
