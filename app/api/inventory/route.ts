import { NextRequest, NextResponse } from 'next/server'
import { appendAuditLog, appendInventory, deleteInventory, readInventory, updateInventory, type InventoryRecord } from '@/lib/storage'
import { canEdit, getUserFromHeaders } from '@/lib/auth'
import { canOperateFloor } from '@/lib/access'
import { normalizeIssueDate } from '@/lib/lot'
import type { WorkStage } from '@/lib/stock'

const STAGE_LABEL = { waiting: '입고 대기', working: '작업 중', ready: '출고 대기' } as const

function inventoryChanges(before: InventoryRecord, after: InventoryRecord) {
  const lines: string[] = []
  if (before.company !== after.company) lines.push(`업체: ${before.company} → ${after.company}`)
  if (before.product !== after.product) lines.push(`품목: ${before.product} → ${after.product}`)
  if (before.floor !== after.floor) lines.push(`층: ${before.floor}층 → ${after.floor}층`)
  if (before.quantity !== after.quantity || before.quantityUnit !== after.quantityUnit) {
    lines.push(`수량: ${before.quantity}${before.quantityUnit} → ${after.quantity}${after.quantityUnit}`)
  }
  if (before.issueDate !== after.issueDate) lines.push(`입고일: ${before.issueDate || '-'} → ${after.issueDate || '-'}`)
  if ((before.lotStart || '') !== (after.lotStart || '')) lines.push(`로트: ${before.lotStart || '-'} → ${after.lotStart || '-'}`)
  if ((before.defectQuantity || 0) !== (after.defectQuantity || 0)) {
    lines.push(`불량: ${before.defectQuantity || 0} → ${after.defectQuantity || 0}`)
  }
  if ((before.sampleQuantity || 0) !== (after.sampleQuantity || 0)) {
    lines.push(`검사시료: ${before.sampleQuantity || 0} → ${after.sampleQuantity || 0}`)
  }
  if (lines.length === 0) lines.push('저장했지만 바뀐 내용은 없습니다.')
  return lines
}

function parseNonNegative(value: unknown, label: string) {
  if (value == null || value === '') return 0
  const number = Number(value)
  if (!Number.isFinite(number) || number < 0) {
    throw new Error(`${label}는 0 이상이어야 합니다.`)
  }
  return number
}

function parseIssueDate(value: unknown) {
  if (value == null || String(value).trim() === '') return ''
  try {
    return normalizeIssueDate(String(value))
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : '입고일자가 올바르지 않습니다.')
  }
}

export async function GET() {
  return NextResponse.json({ data: await readInventory() })
}

export async function DELETE(req: NextRequest) {
  const requestUser = await getUserFromHeaders(req.headers)
  if (!requestUser || !canEdit(requestUser.role)) {
    return NextResponse.json({ error: '입고 삭제 권한이 없습니다.' }, { status: 403 })
  }

  const { id } = await req.json().catch(() => ({}))
  if (!id || typeof id !== 'string') {
    return NextResponse.json({ error: '삭제할 입고 ID가 필요합니다.' }, { status: 400 })
  }

  const target = (await readInventory()).find((item) => item.id === id)
  if (target && !canOperateFloor(requestUser, target.floor)) {
    return NextResponse.json({ error: '다른 층 입고는 삭제할 수 없습니다.' }, { status: 403 })
  }
  const removed = await deleteInventory(id)
  if (!removed) {
    return NextResponse.json({ error: '입고 내역을 찾을 수 없습니다.' }, { status: 404 })
  }

  await appendAuditLog({
    action: 'DELETE',
    target: 'inventory',
    detail: [
      `${removed.company} · ${removed.product}`,
      `${removed.floor}층 · ${removed.quantity}${removed.quantityUnit} 입고 삭제`,
    ].join('\n'),
    userId: requestUser.id,
    userName: requestUser.displayName,
  })

  return NextResponse.json({ success: true, data: removed })
}

export async function PATCH(req: NextRequest) {
  const requestUser = await getUserFromHeaders(req.headers)
  if (!requestUser || !canEdit(requestUser.role)) {
    return NextResponse.json({ error: '입고 수정 권한이 없습니다.' }, { status: 403 })
  }

  const body = await req.json().catch(() => ({}))
  if (!body.id || typeof body.id !== 'string') {
    return NextResponse.json({ error: '수정할 입고 ID가 필요합니다.' }, { status: 400 })
  }
  const previous = (await readInventory()).find((item) => item.id === body.id)
  if ('workStage' in body && body.quantity == null) {
    if (!previous) return NextResponse.json({ error: '입고 내역을 찾을 수 없습니다.' }, { status: 404 })
    if (!canOperateFloor(requestUser, previous.floor)) {
      return NextResponse.json({ error: '다른 층 소재는 바꿀 수 없습니다.' }, { status: 403 })
    }
    const stage: WorkStage | undefined = body.workStage === 'working' || body.workStage === 'ready' ? body.workStage : undefined
    const updated = await updateInventory(body.id, { workStage: stage })
    if (!updated) return NextResponse.json({ error: '입고 내역을 찾을 수 없습니다.' }, { status: 404 })
    await appendAuditLog({
      action: 'UPDATE',
      target: 'inventory',
      detail: [`${updated.company} · ${updated.product}`, `작업 단계: ${STAGE_LABEL[previous.workStage ?? 'waiting']} → ${STAGE_LABEL[stage ?? 'waiting']}`].join('\n'),
      userId: requestUser.id,
      userName: requestUser.displayName,
    })
    return NextResponse.json({ success: true, data: updated })
  }
  const quantity = Number(body.quantity)
  if (!Number.isFinite(quantity) || quantity < 0) {
    return NextResponse.json({ error: '수량은 0 이상이어야 합니다.' }, { status: 400 })
  }
  let issueDate: string | undefined
  try {
    issueDate = parseIssueDate(body.issueDate) || undefined
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : '입고일자가 올바르지 않습니다.' }, { status: 400 })
  }
  const floor = body.floor == null ? undefined : Math.min(3, Math.max(1, Number(body.floor) || 1)) as 1 | 2 | 3
  if (!previous) return NextResponse.json({ error: '입고 내역을 찾을 수 없습니다.' }, { status: 404 })
  const nextFloor = floor ?? previous.floor
  if (!canOperateFloor(requestUser, previous.floor) || !canOperateFloor(requestUser, nextFloor)) {
    return NextResponse.json({ error: '다른 층 입고는 수정할 수 없습니다.' }, { status: 403 })
  }
  let quality: { defectQuantity?: number; sampleQuantity?: number } = {}
  try {
    if (nextFloor === 3) {
      if (body.defectQuantity != null) quality.defectQuantity = parseNonNegative(body.defectQuantity, '불량수')
      if (body.sampleQuantity != null) quality.sampleQuantity = parseNonNegative(body.sampleQuantity, '검사시료수')
    } else if (floor != null) {
      quality = { defectQuantity: 0, sampleQuantity: 0 }
    }
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : '수량이 올바르지 않습니다.' }, { status: 400 })
  }
  const updated = await updateInventory(body.id, {
    quantity,
    quantityUnit: body.quantityUnit || 'EA',
    ...(issueDate ? { issueDate } : {}),
    ...(body.company != null ? { company: String(body.company).trim() } : {}),
    ...(body.product != null ? { product: String(body.product).trim() } : {}),
    ...(floor != null ? { floor } : {}),
    ...(body.lotStart != null ? { lotStart: String(body.lotStart).trim() } : {}),
    ...quality,
  })
  if (!updated) return NextResponse.json({ error: '입고 내역을 찾을 수 없습니다.' }, { status: 404 })

  const changes = previous ? inventoryChanges(previous, updated) : [`수량 ${updated.quantity}${updated.quantityUnit}`]
  await appendAuditLog({
    action: 'UPDATE',
    target: 'inventory',
    detail: [`${updated.company} · ${updated.product}`, ...changes].join('\n'),
    userId: requestUser.id,
    userName: requestUser.displayName,
  })
  return NextResponse.json({ success: true, data: updated })
}

export async function POST(req: NextRequest) {
  const requestUser = await getUserFromHeaders(req.headers)
  if (!requestUser || !canEdit(requestUser.role)) {
    return NextResponse.json({ error: '입고 등록 권한이 없습니다.' }, { status: 403 })
  }

  const body = await req.json()
  if (!body.company || !body.product || !body.quantity || Number(body.quantity) <= 0) {
    return NextResponse.json({ error: '업체명, 품목, 수량은 필수입니다.' }, { status: 400 })
  }

  const now = new Date().toISOString()
  let issueDate = now.slice(0, 10)
  const floor = Math.min(3, Math.max(1, Number(body.floor) || 1)) as 1 | 2 | 3
  if (!canOperateFloor(requestUser, floor)) {
    return NextResponse.json({ error: '다른 층에는 입고를 등록할 수 없습니다.' }, { status: 403 })
  }
  let defectQuantity = 0
  let sampleQuantity = 0
  try {
    issueDate = parseIssueDate(body.issueDate) || issueDate
    if (floor === 3) {
      defectQuantity = parseNonNegative(body.defectQuantity, '불량수')
      sampleQuantity = parseNonNegative(body.sampleQuantity, '검사시료수')
    }
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : '입고일자가 올바르지 않습니다.' }, { status: 400 })
  }
  const record = {
    id: crypto.randomUUID(),
    company: String(body.company).trim(),
    product: String(body.product).trim(),
    floor,
    quantity: Number(body.quantity),
    quantityUnit: body.quantityUnit || 'EA',
    issueDate,
    lotStart: body.lotStart || '',
    ...(floor === 3 ? { defectQuantity, sampleQuantity } : {}),
    movementType: '입고' as const,
    storagePath: 'INVENTORY' as const,
    createdAt: now,
    createdBy: requestUser.displayName,
    createdById: requestUser.id,
  }

  await appendInventory(record)
  await appendAuditLog({
    action: 'CREATE',
    target: 'inventory',
    detail: [
      `${record.company} · ${record.product}`,
      `${record.floor}층 · ${record.quantity}${record.quantityUnit} · ${record.issueDate} 입고 등록${
        record.floor === 3 ? ` · 불량 ${defectQuantity} · 검사시료 ${sampleQuantity}` : ''
      }`,
    ].join('\n'),
    userId: requestUser.id,
    userName: requestUser.displayName,
  })

  return NextResponse.json({ success: true, data: record })
}
