/** 업무 진행: 완료 / 진행중 / 미진행 (양식의 색 점) */
export type WorkflowStatus = 'done' | 'in_progress' | 'not_started'

export const WORKFLOW_STATUS_ORDER: WorkflowStatus[] = ['done', 'in_progress', 'not_started']

export const WORKFLOW_STATUS_LABEL: Record<WorkflowStatus, string> = {
  done: '완료',
  in_progress: '진행중',
  not_started: '미진행',
}

export function nextWorkflowStatus(current: WorkflowStatus): WorkflowStatus {
  const index = WORKFLOW_STATUS_ORDER.indexOf(current)
  return WORKFLOW_STATUS_ORDER[(index + 1) % WORKFLOW_STATUS_ORDER.length]
}

/** YYYY-MM-DD (로컬 날짜) */
export function todayOccurrenceDate(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function parseOccurrenceDate(value: unknown, fallbackIso?: string): string {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value.trim())) {
    return value.trim()
  }
  if (fallbackIso) {
    const part = fallbackIso.slice(0, 10)
    if (/^\d{4}-\d{2}-\d{2}$/.test(part)) return part
  }
  return todayOccurrenceDate()
}

export interface CustomerNonconformity {
  id: string
  /** 발생일 YYYY-MM-DD */
  occurrenceDate: string
  occurrenceCompany: string
  /** 불량 유형 (미입력 시 내용 키워드로 추정) */
  defectType?: string
  /** 품번 */
  partNo?: string
  /** 불량 수량 */
  defectQty?: number | null
  description: string
  countermeasurePlan: WorkflowStatus
  processingResult: WorkflowStatus
  effectivenessVerification: WorkflowStatus
  remarks?: string
  createdAt: string
  updatedAt?: string
  createdBy?: string
  createdById?: string
}

export const CUSTOMER_NC_DEFECT_TYPES = [
  '외관',
  '치수',
  '성능',
  '포장',
  '수량',
  '이종혼입',
  '기타',
] as const

/** 접수일 기준 회신 기한(일). 미종결 건의 기한 초과 판정에 사용 */
export const CUSTOMER_NC_RESPONSE_DAYS = 14

export type CustomerNcStatusFilter = 'all' | 'in_progress' | 'closed' | 'overdue'

export function addDaysToIsoDate(iso: string, days: number): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso
  const date = new Date(`${iso}T12:00:00`)
  date.setDate(date.getDate() + days)
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function isCustomerNcClosed(row: Pick<CustomerNonconformity, 'countermeasurePlan' | 'processingResult' | 'effectivenessVerification'>) {
  return (
    row.countermeasurePlan === 'done' &&
    row.processingResult === 'done' &&
    row.effectivenessVerification === 'done'
  )
}

export function isCustomerNcStarted(row: Pick<CustomerNonconformity, 'countermeasurePlan' | 'processingResult' | 'effectivenessVerification'>) {
  return [row.countermeasurePlan, row.processingResult, row.effectivenessVerification].some((s) => s !== 'not_started')
}

export function isCustomerNcOverdue(
  row: Pick<CustomerNonconformity, 'occurrenceDate' | 'countermeasurePlan' | 'processingResult' | 'effectivenessVerification'>,
  today = todayOccurrenceDate(),
) {
  if (isCustomerNcClosed(row)) return false
  const due = addDaysToIsoDate(row.occurrenceDate, CUSTOMER_NC_RESPONSE_DAYS)
  return today > due
}

const DEFECT_TYPE_KEYWORDS: { type: (typeof CUSTOMER_NC_DEFECT_TYPES)[number]; tokens: string[] }[] = [
  { type: '외관', tokens: ['외관', '얼룩', 'scratch', '흠집', '오염'] },
  { type: '치수', tokens: ['치수', '공차', '두께'] },
  { type: '성능', tokens: ['성능', '특성', '전기', 'function'] },
  { type: '포장', tokens: ['포장', '라벨', '식별'] },
  { type: '수량', tokens: ['수량', '부족', '과다'] },
  { type: '이종혼입', tokens: ['이종', '혼입', '오조립'] },
]

export function customerNcDefectType(row: Pick<CustomerNonconformity, 'defectType' | 'description'>): string {
  const explicit = row.defectType?.trim()
  if (explicit) return explicit
  const text = row.description.toLowerCase()
  for (const { type, tokens } of DEFECT_TYPE_KEYWORDS) {
    if (tokens.some((token) => text.includes(token.toLowerCase()))) return type
  }
  return '기타'
}

export type ProcessNcActionKey = 'specialAcceptance' | 'quarantine' | 'rework' | 'scrap'

export const PROCESS_NC_ACTIONS: { key: ProcessNcActionKey; label: string }[] = [
  { key: 'specialAcceptance', label: '특채' },
  { key: 'quarantine', label: '격리' },
  { key: 'rework', label: '재작업' },
  { key: 'scrap', label: '폐기' },
]

export function emptyProcessNcActions(): Record<ProcessNcActionKey, boolean> {
  return {
    specialAcceptance: false,
    quarantine: false,
    rework: false,
    scrap: false,
  }
}

export interface ProcessNonconformity {
  id: string
  /** 발생일 YYYY-MM-DD */
  occurrenceDate: string
  /** 층 (1층, 2층, 3층) */
  occurrenceLine: string
  /** 라인 */
  lineName?: string
  /** 공정 */
  processName?: string
  partNo?: string
  defectType?: string
  defectQty?: number | null
  customerCompany: string
  description: string
  actions: Record<ProcessNcActionKey, boolean>
  /** 동일 불량 재발 */
  recurred?: boolean
  remarks?: string
  assignee?: string
  responsible?: string
  /** 없으면 처리결과만으로 단계를 잡는다 */
  countermeasurePlan?: WorkflowStatus
  processingResult: WorkflowStatus
  effectivenessVerification?: WorkflowStatus
  createdAt: string
  updatedAt?: string
  createdBy?: string
  createdById?: string
}
