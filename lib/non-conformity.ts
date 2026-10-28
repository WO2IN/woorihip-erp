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

export function formatOccurrenceDateLabel(value: string): string {
  return value.replace(/-/g, '.')
}

export interface CustomerNonconformity {
  id: string
  /** 발생일 YYYY-MM-DD */
  occurrenceDate: string
  occurrenceCompany: string
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
  occurrenceLine: string
  customerCompany: string
  description: string
  actions: Record<ProcessNcActionKey, boolean>
  assignee?: string
  responsible?: string
  processingResult: WorkflowStatus
  createdAt: string
  updatedAt?: string
  createdBy?: string
  createdById?: string
}
