import { NextRequest, NextResponse } from 'next/server'
import {
  appendAuditLog,
  deleteFloor3WorkLog,
  readFloor3WorkLogs,
  saveFloor3WorkLog,
} from '@/lib/storage'
import { Floor3WorkLog } from '@/lib/floor3-work-log'
import { canEdit, getUserFromHeaders } from '@/lib/auth'
import { canOperateFloor } from '@/lib/access'
import { normalizeIssueDate } from '@/lib/lot'

async function recomputeTotals(company: string, product: string, unit: string) {
  const group = (await readFloor3WorkLogs())
    .filter((item) => item.company === company && item.product === product && item.unit === unit)
    .sort((a, b) => a.workDate.localeCompare(b.workDate) || a.id.localeCompare(b.id))
  let sum = 0
  for (const item of group) {
    sum += item.workQuantity || 0
    if (item.totalQuantity !== sum) await saveFloor3WorkLog({ ...item, totalQuantity: sum })
  }
}

function parseNonNegative(value: unknown, label: string) {
  if (value == null || value === '') return 0
  const number = Number(value)
  if (!Number.isFinite(number) || number < 0) {
    throw new Error(`${label} 값은 0 이상이어야 합니다.`)
  }
  return number
}

export async function GET() {
  return NextResponse.json({ data: await readFloor3WorkLogs() })
}

export async function POST(req: NextRequest) {
  const requestUser = await getUserFromHeaders(req.headers)
  if (!requestUser || !canEdit(requestUser.role)) {
    return NextResponse.json({ error: '기록 권한이 없습니다.' }, { status: 403 })
  }
  if (!canOperateFloor(requestUser, 3)) {
    return NextResponse.json({ error: '3층 작업일보는 3층 담당만 기록할 수 있습니다.' }, { status: 403 })
  }

  const body = await req.json().catch(() => ({}))
  const company = String(body.company || '').trim()
  const product = String(body.product || '').trim()
  const unit = String(body.unit || 'EA').trim() || 'EA'
  if (!company || !product) {
    return NextResponse.json({ error: '업체와 품목은 필수입니다.' }, { status: 400 })
  }

  let workDate = ''
  let workQuantity = 0
  let defectQuantity = 0
  let sampleQuantity = 0
  try {
    workDate = normalizeIssueDate(String(body.workDate || ''))
    if (!workDate) throw new Error('일자를 입력해주세요.')
    workQuantity = parseNonNegative(body.workQuantity, '작업수량')
    defectQuantity = parseNonNegative(body.defectQuantity, '불량수')
    sampleQuantity = parseNonNegative(body.sampleQuantity, '검사시료')
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : '수량이 올바르지 않습니다.' }, { status: 400 })
  }
  if (workQuantity === 0 && defectQuantity === 0 && sampleQuantity === 0) {
    return NextResponse.json({ error: '작업수량, 불량수, 검사시료 중 하나는 입력해주세요.' }, { status: 400 })
  }

  const existing = (await readFloor3WorkLogs()).find((item) =>
    (body.id && item.id === body.id) ||
    (item.company === company && item.product === product && item.unit === unit && item.workDate === workDate),
  )
  const now = new Date().toISOString()
  const record: Floor3WorkLog = {
    id: existing?.id || crypto.randomUUID(),
    company,
    product,
    floor: 3,
    unit,
    workDate,
    workQuantity,
    defectQuantity,
    sampleQuantity,
    totalQuantity: 0,
    createdAt: existing?.createdAt || now,
    createdBy: existing?.createdBy || requestUser.displayName,
    createdById: existing?.createdById || requestUser.id,
    updatedAt: existing ? now : undefined,
  }
  await saveFloor3WorkLog(record)
  await recomputeTotals(company, product, unit)
  if (existing && (existing.company !== company || existing.product !== product || existing.unit !== unit)) {
    await recomputeTotals(existing.company, existing.product, existing.unit)
  }
  const saved = (await readFloor3WorkLogs()).find((item) => item.id === record.id) || record
  await appendAuditLog({
    action: existing ? 'UPDATE' : 'CREATE',
    target: 'inventory',
    detail: [
      `${saved.company} · ${saved.product}`,
      `3층 · ${saved.workDate} 작업 ${saved.workQuantity} · 불량 ${saved.defectQuantity} · 검사시료 ${saved.sampleQuantity} · 총 작업 ${saved.totalQuantity}`,
    ].join('\n'),
    userId: requestUser.id,
    userName: requestUser.displayName,
  })
  return NextResponse.json({ success: true, data: saved, updated: Boolean(existing) })
}

export async function DELETE(req: NextRequest) {
  const requestUser = await getUserFromHeaders(req.headers)
  if (!requestUser || !canEdit(requestUser.role)) {
    return NextResponse.json({ error: '삭제 권한이 없습니다.' }, { status: 403 })
  }
  if (!canOperateFloor(requestUser, 3)) {
    return NextResponse.json({ error: '3층 작업일보는 3층 담당만 삭제할 수 있습니다.' }, { status: 403 })
  }
  const { id } = await req.json().catch(() => ({}))
  if (!id || typeof id !== 'string') {
    return NextResponse.json({ error: '삭제할 기록 ID가 필요합니다.' }, { status: 400 })
  }
  const removed = await deleteFloor3WorkLog(id)
  if (!removed) return NextResponse.json({ error: '기록을 찾을 수 없습니다.' }, { status: 404 })
  await recomputeTotals(removed.company, removed.product, removed.unit)
  await appendAuditLog({
    action: 'DELETE',
    target: 'inventory',
    detail: [
      `${removed.company} · ${removed.product}`,
      `3층 · ${removed.workDate} 작업 기록 삭제`,
    ].join('\n'),
    userId: requestUser.id,
    userName: requestUser.displayName,
  })
  return NextResponse.json({ success: true, data: removed })
}
