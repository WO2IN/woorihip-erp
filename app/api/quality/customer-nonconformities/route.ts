import { NextRequest, NextResponse } from 'next/server'
import { v4 as uuidv4 } from 'uuid'
import {
  appendAuditLog,
  appendCustomerNonconformity,
  deleteCustomerNonconformity,
  readCustomerNonconformities,
  updateCustomerNonconformity,
} from '@/lib/storage'
import { canManageQualityRecords, getUserFromHeaders } from '@/lib/auth'
import type { CustomerNonconformity, WorkflowStatus } from '@/lib/non-conformity'
import { parseOccurrenceDate, WORKFLOW_STATUS_ORDER } from '@/lib/non-conformity'

function normalizeCustomerRow(row: CustomerNonconformity): CustomerNonconformity {
  return {
    ...row,
    occurrenceDate: parseOccurrenceDate(row.occurrenceDate, row.createdAt),
    countermeasurePlan: parseStatus(row.countermeasurePlan),
    processingResult: parseStatus(row.processingResult),
    effectivenessVerification: parseStatus(row.effectivenessVerification),
  }
}

function sortByOccurrenceDate(rows: CustomerNonconformity[]) {
  return [...rows].sort(
    (a, b) =>
      b.occurrenceDate.localeCompare(a.occurrenceDate) || b.createdAt.localeCompare(a.createdAt),
  )
}

function parseDefectQty(value: unknown): number | null | 'invalid' {
  if (value == null || value === '') return null
  const qty = typeof value === 'number' ? value : Number(String(value).replace(/,/g, '').trim())
  if (!Number.isFinite(qty) || qty < 0) return 'invalid'
  return Math.round(qty * 1000) / 1000
}

function parseStatus(value: unknown, fallback: WorkflowStatus = 'not_started'): WorkflowStatus {
  return WORKFLOW_STATUS_ORDER.includes(value as WorkflowStatus)
    ? (value as WorkflowStatus)
    : fallback
}

export async function GET() {
  return NextResponse.json({
    data: sortByOccurrenceDate((await readCustomerNonconformities()).map(normalizeCustomerRow)),
  })
}

export async function POST(req: NextRequest) {
  const user = await getUserFromHeaders(req.headers)
  if (!user || !canManageQualityRecords(user.role)) {
    return NextResponse.json({ error: '관리자만 등록할 수 있습니다.' }, { status: 403 })
  }
  const body = await req.json().catch(() => ({}))
  const occurrenceCompany = typeof body.occurrenceCompany === 'string' ? body.occurrenceCompany.trim() : ''
  const description = typeof body.description === 'string' ? body.description.trim() : ''
  if (!occurrenceCompany || !description) {
    return NextResponse.json({ error: '발생업체와 부적합내용은 필수입니다.' }, { status: 400 })
  }
  const now = new Date().toISOString()
  const defectType = typeof body.defectType === 'string' ? body.defectType.trim() : ''
  const partNo = typeof body.partNo === 'string' ? body.partNo.trim() : ''
  const defectQty = parseDefectQty(body.defectQty)
  if (defectQty === 'invalid') {
    return NextResponse.json({ error: '불량 수량은 0 이상의 숫자로 입력하세요.' }, { status: 400 })
  }
  const record: CustomerNonconformity = {
    id: uuidv4(),
    occurrenceDate: parseOccurrenceDate(body.occurrenceDate, now),
    occurrenceCompany,
    defectType: defectType || undefined,
    partNo: partNo || undefined,
    defectQty,
    description,
    countermeasurePlan: parseStatus(body.countermeasurePlan),
    processingResult: parseStatus(body.processingResult),
    effectivenessVerification: parseStatus(body.effectivenessVerification),
    remarks: typeof body.remarks === 'string' ? body.remarks.trim() : undefined,
    createdAt: now,
    updatedAt: now,
    createdBy: user.displayName,
    createdById: user.id,
  }
  await appendCustomerNonconformity(record)
  await appendAuditLog({
    action: 'CREATE',
    target: 'customer-nonconformity',
    detail: `고객 부적합 등록 (${occurrenceCompany})`,
    userId: user.id,
    userName: user.displayName,
  })
  return NextResponse.json({ data: record })
}

export async function PATCH(req: NextRequest) {
  const user = await getUserFromHeaders(req.headers)
  if (!user || !canManageQualityRecords(user.role)) {
    return NextResponse.json({ error: '관리자만 수정할 수 있습니다.' }, { status: 403 })
  }
  const body = await req.json().catch(() => ({}))
  const id = typeof body.id === 'string' ? body.id : ''
  if (!id) return NextResponse.json({ error: 'ID가 필요합니다.' }, { status: 400 })

  const updates: Partial<CustomerNonconformity> = { updatedAt: new Date().toISOString() }
  if (body.occurrenceDate !== undefined) updates.occurrenceDate = parseOccurrenceDate(body.occurrenceDate)
  if (typeof body.occurrenceCompany === 'string') updates.occurrenceCompany = body.occurrenceCompany.trim()
  if (body.defectType !== undefined) {
    updates.defectType = typeof body.defectType === 'string' ? body.defectType.trim() || undefined : undefined
  }
  if (body.partNo !== undefined) {
    updates.partNo = typeof body.partNo === 'string' ? body.partNo.trim() || undefined : undefined
  }
  if (body.defectQty !== undefined) {
    const defectQty = parseDefectQty(body.defectQty)
    if (defectQty === 'invalid') {
      return NextResponse.json({ error: '불량 수량은 0 이상의 숫자로 입력하세요.' }, { status: 400 })
    }
    updates.defectQty = defectQty
  }
  if (typeof body.description === 'string') updates.description = body.description.trim()
  if (typeof body.remarks === 'string') updates.remarks = body.remarks.trim()
  if (body.countermeasurePlan !== undefined) updates.countermeasurePlan = parseStatus(body.countermeasurePlan)
  if (body.processingResult !== undefined) updates.processingResult = parseStatus(body.processingResult)
  if (body.effectivenessVerification !== undefined) {
    updates.effectivenessVerification = parseStatus(body.effectivenessVerification)
  }

  const updated = await updateCustomerNonconformity(id, updates)
  if (!updated) return NextResponse.json({ error: '항목을 찾을 수 없습니다.' }, { status: 404 })
  return NextResponse.json({ data: normalizeCustomerRow(updated) })
}

export async function DELETE(req: NextRequest) {
  const user = await getUserFromHeaders(req.headers)
  if (!user || !canManageQualityRecords(user.role)) {
    return NextResponse.json({ error: '관리자만 삭제할 수 있습니다.' }, { status: 403 })
  }
  const { id } = await req.json().catch(() => ({}))
  if (!id || typeof id !== 'string') {
    return NextResponse.json({ error: 'ID가 필요합니다.' }, { status: 400 })
  }
  const removed = await deleteCustomerNonconformity(id)
  if (!removed) return NextResponse.json({ error: '항목을 찾을 수 없습니다.' }, { status: 404 })
  await appendAuditLog({
    action: 'DELETE',
    target: 'customer-nonconformity',
    detail: `고객 부적합 삭제 (${removed.occurrenceCompany})`,
    userId: user.id,
    userName: user.displayName,
  })
  return NextResponse.json({ success: true })
}
