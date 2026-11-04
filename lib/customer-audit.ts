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
