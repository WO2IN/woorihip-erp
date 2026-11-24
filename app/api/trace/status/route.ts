import { NextRequest, NextResponse } from 'next/server'
import { canOperateFloor } from '@/lib/access'
import { canEdit, getUserFromHeaders } from '@/lib/auth'
import { findRecords, patchRecord } from '@/lib/records'
import { appendAuditLog, updateInventory } from '@/lib/storage'
import { findTraceBarcode, stageForStatus, TRACE_BARCODE_COLLECTION } from '@/lib/trace-barcode'
import { BARCODE_STATUS_LABEL, isBarcodeStatus, type StatusChangeResult, type TraceBarcode } from '@/lib/trace'

export const dynamic = 'force-dynamic'

const str = (value: unknown) => (typeof value === 'string' ? value.trim() : '')

/** 스캔 모드(작업중·작업완료·출하대기·출하완료)로 바코드를 찍었을 때 상태를 바꾼다. */
export async function POST(request: NextRequest) {
  const user = await getUserFromHeaders(request.headers)
  if (!user || !canEdit(user.role)) {
    return NextResponse.json({ error: '상태를 바꿀 권한이 없습니다. 조회만 할 수 있습니다.' }, { status: 403 })
  }
  const body = await request.json().catch(() => ({}))
  const code = str(body.code)
  const status = body.status
  if (!code) return NextResponse.json({ error: '바코드 값이 없습니다.' }, { status: 400 })
  if (!isBarcodeStatus(status)) return NextResponse.json({ error: '바꿀 상태가 올바르지 않습니다.' }, { status: 400 })

  const record = await findTraceBarcode(code)
  if (!record) return NextResponse.json({ error: '등록된 바코드가 아닙니다. 입고등록에서 발급했거나 직접 등록한 바코드만 쓸 수 있습니다.' }, { status: 404 })
  if (!canOperateFloor(user, record.floor)) {
    return NextResponse.json({ error: '다른 층 제품의 상태는 바꿀 수 없습니다.' }, { status: 403 })
  }

  const previous = record.status
  if (previous === status) {
    const unchanged: StatusChangeResult = { barcode: record.barcode, partner: record.company, product: record.product, previous, status, changed: false }
    return NextResponse.json({ data: unchanged })
  }

  if (status === 'shipReady') {
    const cardIds = new Set(
      (await findRecords<{ id: string; barcode?: string }>('lot-cards', (card) => str(card.barcode).toUpperCase() === record.barcode.toUpperCase())).map((card) => card.id),
    )
    const reports = cardIds.size > 0
      ? await findRecords<{ sourceLotCardId?: string }>('outgoing-reports', (report) => cardIds.has(str(report.sourceLotCardId)), 1)
      : []
    if (reports.length === 0) {
      return NextResponse.json({ error: '출하성적서가 아직 없습니다. 출하성적서를 만든 뒤 출하대기로 바꿔 주세요.' }, { status: 409 })
    }
  }

  const now = new Date().toISOString()
  const updated = await patchRecord<TraceBarcode>(TRACE_BARCODE_COLLECTION, record.id, (current) => ({
    status,
    statusLog: [...(current.statusLog ?? []), { status, at: now, by: user.displayName }].slice(-50),
  }))
  if (!updated) return NextResponse.json({ error: '바코드를 찾을 수 없습니다.' }, { status: 404 })

  // 입고 건의 기존 작업 단계 표시(입고 대기·작업 중·출고 대기)도 같이 맞춘다.
  if (record.inventoryId) await updateInventory(record.inventoryId, { workStage: stageForStatus(status) })

  await appendAuditLog({
    action: 'UPDATE',
    target: 'trace-barcode',
    detail: [`${record.company} · ${record.product}`, `${record.barcode} ${BARCODE_STATUS_LABEL[previous]} → ${BARCODE_STATUS_LABEL[status]}`].join('\n'),
    userId: user.id,
    userName: user.displayName,
  })

  const result: StatusChangeResult = { barcode: record.barcode, partner: record.company, product: record.product, previous, status, changed: true }
  return NextResponse.json({ data: result })
}
