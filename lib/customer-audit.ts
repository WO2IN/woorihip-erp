export type AuditKind = 'QSA' | 'QPA'

export interface AuditRow {
  id: string
  kind: AuditKind
  company: string
  scope: string
  auditDate: string
  count: number
  done: number
  dueDate: string
  closeDate: string
  doneDate: string
  dept: string
  owner: string
}

/** 저장된 데이터가 없을 때만 보여주는 화면 예시. 저장하지 않는다. */
export const SAMPLE_AUDIT_ROWS: AuditRow[] = [
  { id: 'sample-1', kind: 'QSA', company: '한중NCS', scope: '품질시스템 정기심사', auditDate: '2026-09-16', count: 22, done: 18, dueDate: '2026-10-31', closeDate: '', doneDate: '', dept: '품질관리부', owner: '차장 강희권' },
  { id: 'sample-2', kind: 'QSA', company: '넥스플러스', scope: '신규 협력사 품질심사', auditDate: '2026-05-20', count: 8, done: 8, dueDate: '2026-06-30', closeDate: '2026-06-24', doneDate: '2026-06-20', dept: '품질관리부', owner: '' },
  { id: 'sample-3', kind: 'QSA', company: '신흥SEC', scope: '연간 품질평가', auditDate: '2026-03-12', count: 5, done: 5, dueDate: '2026-04-30', closeDate: '2026-04-18', doneDate: '2026-04-15', dept: '품질관리부', owner: '' },
  { id: 'sample-4', kind: 'QPA', company: '한중NCS', scope: '도금공정 공정감사', auditDate: '2026-08-27', count: 10, done: 5, dueDate: '2026-10-15', closeDate: '', doneDate: '', dept: '품질관리부', owner: '차장 강희권' },
  { id: 'sample-5', kind: 'QPA', company: '넥스플러스', scope: '마스킹·주석도금 공정', auditDate: '2026-10-08', count: 5, done: 2, dueDate: '2026-11-07', closeDate: '', doneDate: '', dept: '품질관리부', owner: '' },
  { id: 'sample-6', kind: 'QPA', company: '신흥SEC', scope: '특별특성 공정점검', auditDate: '2026-11-18', count: 0, done: 0, dueDate: '', closeDate: '', doneDate: '', dept: '품질관리부', owner: '' },
]

export function todayIso() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function openOf(row: Pick<AuditRow, 'count' | 'done'>) {
  return Math.max(0, row.count - row.done)
}

export function rateOf(row: Pick<AuditRow, 'count' | 'done'>) {
  return row.count ? Math.round((row.done / row.count) * 1000) / 10 : 0
}

export function statusOf(row: AuditRow) {
  const open = openOf(row)
  const today = todayIso()
  if (row.auditDate && row.auditDate > today) return '예정'
  if (open === 0 && row.closeDate) return '종결'
  if (open > 0 && row.dueDate && row.dueDate < today) return '지연'
  if (open > 0 && row.dueDate && row.dueDate >= today) return '진행'
  return '미진행'
}

export function asKind(kind: string): AuditKind {
  return kind === 'QPA' || kind === 'SPA' ? 'QPA' : 'QSA'
}
