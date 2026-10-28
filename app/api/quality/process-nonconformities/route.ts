import { NextRequest, NextResponse } from 'next/server'
import { v4 as uuidv4 } from 'uuid'
import {
  appendAuditLog,
  appendProcessNonconformity,
  deleteProcessNonconformity,
  readProcessNonconformities,
  updateProcessNonconformity,
} from '@/lib/storage'
import { canEdit, getUserFromHeaders } from '@/lib/auth'
import type { ProcessNcActionKey, ProcessNonconformity } from '@/lib/non-conformity'
import {
  emptyProcessNcActions,
  PROCESS_NC_ACTIONS,
  parseOccurrenceDate,
  WORKFLOW_STATUS_ORDER,
  type WorkflowStatus,
} from '@/lib/non-conformity'

function parseStatus(value: unknown, fallback: WorkflowStatus = 'not_started'): WorkflowStatus {
  return WORKFLOW_STATUS_ORDER.includes(value as WorkflowStatus)
    ? (value as WorkflowStatus)
    : fallback
}

function normalizeProcessRow(row: ProcessNonconformity): ProcessNonconformity {
  return {
    ...row,
    occurrenceDate: parseOccurrenceDate(row.occurrenceDate, row.createdAt),
    processingResult: parseStatus(row.processingResult),
    actions: parseActions(row.actions),
  }
}

function sortByOccurrenceDate(rows: ProcessNonconformity[]) {
  return [...rows].sort(
    (a, b) =>
      b.occurrenceDate.localeCompare(a.occurrenceDate) || b.createdAt.localeCompare(a.createdAt),
  )
}

function parseActions(raw: unknown): Record<ProcessNcActionKey, boolean> {
  const base = emptyProcessNcActions()
  if (!raw || typeof raw !== 'object') return base
  const source = raw as Record<string, unknown>
  for (const { key } of PROCESS_NC_ACTIONS) {
    if (typeof source[key] === 'boolean') base[key] = source[key]
  }
  return base
}

export async function GET() {
  return NextResponse.json({
    data: sortByOccurrenceDate((await readProcessNonconformities()).map(normalizeProcessRow)),
  })
}

export async function POST(req: NextRequest) {
  const user = await getUserFromHeaders(req.headers)
  if (!user || !canEdit(user.role)) {
    return NextResponse.json({ error: '등록 권한이 없습니다.' }, { status: 403 })
  }
  const body = await req.json().catch(() => ({}))
  const occurrenceLine = typeof body.occurrenceLine === 'string' ? body.occurrenceLine.trim() : ''
  const customerCompany = typeof body.customerCompany === 'string' ? body.customerCompany.trim() : ''
  const description = typeof body.description === 'string' ? body.description.trim() : ''
  if (!occurrenceLine || !customerCompany || !description) {
    return NextResponse.json({ error: '발생라인, 고객사, 부적합내용은 필수입니다.' }, { status: 400 })
  }
  const now = new Date().toISOString()
  const record: ProcessNonconformity = {
    id: uuidv4(),
    occurrenceDate: parseOccurrenceDate(body.occurrenceDate, now),
    occurrenceLine,
    customerCompany,
    description,
    actions: parseActions(body.actions),
    assignee: typeof body.assignee === 'string' ? body.assignee.trim() : undefined,
    responsible: typeof body.responsible === 'string' ? body.responsible.trim() : undefined,
    processingResult: parseStatus(body.processingResult),
    createdAt: now,
    updatedAt: now,
    createdBy: user.displayName,
    createdById: user.id,
  }
  await appendProcessNonconformity(record)
  await appendAuditLog({
    action: 'CREATE',
    target: 'process-nonconformity',
    detail: `공정 부적합 등록 (${occurrenceLine} / ${customerCompany})`,
    userId: user.id,
    userName: user.displayName,
  })
  return NextResponse.json({ data: record })
}

export async function PATCH(req: NextRequest) {
  const user = await getUserFromHeaders(req.headers)
  if (!user || !canEdit(user.role)) {
    return NextResponse.json({ error: '수정 권한이 없습니다.' }, { status: 403 })
  }
  const body = await req.json().catch(() => ({}))
  const id = typeof body.id === 'string' ? body.id : ''
  if (!id) return NextResponse.json({ error: 'ID가 필요합니다.' }, { status: 400 })

  const updates: Partial<ProcessNonconformity> = { updatedAt: new Date().toISOString() }
  if (body.occurrenceDate !== undefined) updates.occurrenceDate = parseOccurrenceDate(body.occurrenceDate)
  if (typeof body.occurrenceLine === 'string') updates.occurrenceLine = body.occurrenceLine.trim()
  if (typeof body.customerCompany === 'string') updates.customerCompany = body.customerCompany.trim()
  if (typeof body.description === 'string') updates.description = body.description.trim()
  if (typeof body.assignee === 'string') updates.assignee = body.assignee.trim()
  if (typeof body.responsible === 'string') updates.responsible = body.responsible.trim()
  if (body.processingResult !== undefined) updates.processingResult = parseStatus(body.processingResult)
  if (body.actions !== undefined) updates.actions = parseActions(body.actions)

  const updated = await updateProcessNonconformity(id, updates)
  if (!updated) return NextResponse.json({ error: '항목을 찾을 수 없습니다.' }, { status: 404 })
  return NextResponse.json({ data: normalizeProcessRow(updated) })
}

export async function DELETE(req: NextRequest) {
  const user = await getUserFromHeaders(req.headers)
  if (!user || !canEdit(user.role)) {
    return NextResponse.json({ error: '삭제 권한이 없습니다.' }, { status: 403 })
  }
  const { id } = await req.json().catch(() => ({}))
  if (!id || typeof id !== 'string') {
    return NextResponse.json({ error: 'ID가 필요합니다.' }, { status: 400 })
  }
  const removed = await deleteProcessNonconformity(id)
  if (!removed) return NextResponse.json({ error: '항목을 찾을 수 없습니다.' }, { status: 404 })
  await appendAuditLog({
    action: 'DELETE',
    target: 'process-nonconformity',
    detail: `공정 부적합 삭제 (${removed.occurrenceLine})`,
    userId: user.id,
    userName: user.displayName,
  })
  return NextResponse.json({ success: true })
}
