import { NextRequest, NextResponse } from 'next/server'
import { canOperateFloor } from '@/lib/access'
import { canEdit, getUserFromHeaders } from '@/lib/auth'
import { listRecords } from '@/lib/records'
import { appendAuditLog, readInventory, updateInventory } from '@/lib/storage'
import { findTraceBarcode, issueTraceBarcode, TRACE_BARCODE_COLLECTION } from '@/lib/trace-barcode'
import type { TraceBarcode, TraceBarcodeOption } from '@/lib/trace'

export const dynamic = 'force-dynamic'

const str = (value: unknown) => (typeof value === 'string' ? value.trim() : typeof value === 'number' ? String(value) : '')

/** 바코드 대장 목록. 이력카드에서 바코드를 고를 때 쓰며, company·product 를 주면 그 업체·품명 것만 돌려준다. */
export async function GET(request: NextRequest) {
  const user = await getUserFromHeaders(request.headers)
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })

  const company = str(request.nextUrl.searchParams.get('company'))
  const product = str(request.nextUrl.searchParams.get('product'))
  const [rows, cards] = await Promise.all([
    listRecords<TraceBarcode>(TRACE_BARCODE_COLLECTION),
    listRecords<{ barcode?: string }>('lot-cards'),
  ])
  const cardCount = new Map<string, number>()
  for (const card of cards) {
    const key = str(card.barcode).toUpperCase()
    if (key) cardCount.set(key, (cardCount.get(key) ?? 0) + 1)
  }
  const data: TraceBarcodeOption[] = rows
    .filter((row) => (!company || row.company === company) && (!product || row.product === product))
    .map((row) => ({ ...row, cardCount: cardCount.get(row.barcode.toUpperCase()) ?? 0 }))
  return NextResponse.json({ data })
}

/**
 * 바코드 발급.
 *  - inventoryId: 바코드가 없는 기존 입고등록에 바코드를 발급한다.
 *  - company·product: 입고등록 없이 출하까지 된 건처럼, 바코드만 따로 직접 등록한다.
 */
export async function POST(request: NextRequest) {
  const user = await getUserFromHeaders(request.headers)
  if (!user || !canEdit(user.role)) {
    return NextResponse.json({ error: '바코드를 만들 권한이 없습니다.' }, { status: 403 })
  }
  const body = await request.json().catch(() => ({}))

  const inventoryId = str(body.inventoryId)
  if (inventoryId) {
    const inbound = (await readInventory()).find((item) => item.id === inventoryId)
    if (!inbound) return NextResponse.json({ error: '입고 내역을 찾을 수 없습니다.' }, { status: 404 })
    if (!canOperateFloor(user, inbound.floor)) {
      return NextResponse.json({ error: '다른 층 입고에는 바코드를 만들 수 없습니다.' }, { status: 403 })
    }
    const existing = (inbound as { barcode?: string }).barcode ? await findTraceBarcode((inbound as { barcode?: string }).barcode as string) : null
    if (existing) return NextResponse.json({ data: existing })
    const record = await issueTraceBarcode({
      company: inbound.company,
      product: inbound.product,
      floor: inbound.floor,
      quantity: inbound.quantity,
      quantityUnit: inbound.quantityUnit,
      receivedAt: inbound.issueDate,
      source: 'inbound',
      inventoryId: inbound.id,
      by: user.displayName,
    })
    await updateInventory(inbound.id, { barcode: record.barcode })
    await appendAuditLog({
      action: 'CREATE',
      target: 'trace-barcode',
      detail: [`${record.company} · ${record.product}`, `${record.barcode} 발급 (입고 ${record.receivedAt})`].join('\n'),
      userId: user.id,
      userName: user.displayName,
    })
    return NextResponse.json({ data: record })
  }

  const company = str(body.company)
  const product = str(body.product)
  if (!company || !product) {
    return NextResponse.json({ error: '업체명과 품명을 입력해 주세요.' }, { status: 400 })
  }
  const floor = Math.min(3, Math.max(1, Number(body.floor) || 1))
  if (!canOperateFloor(user, floor as 1 | 2 | 3)) {
    return NextResponse.json({ error: '다른 층에는 바코드를 만들 수 없습니다.' }, { status: 403 })
  }
  const quantity = body.quantity === '' || body.quantity == null ? 0 : Number(body.quantity)
  if (!Number.isFinite(quantity) || quantity < 0) {
    return NextResponse.json({ error: '수량이 올바르지 않습니다.' }, { status: 400 })
  }
  const receivedAt = str(body.receivedAt)
  if (receivedAt && !/^\d{4}-\d{2}-\d{2}$/.test(receivedAt)) {
    return NextResponse.json({ error: '입고일자는 YYYY-MM-DD 형식이어야 합니다.' }, { status: 400 })
  }
  const record = await issueTraceBarcode({
    company,
    product,
    floor,
    quantity,
    quantityUnit: str(body.quantityUnit) || 'EA',
    receivedAt,
    source: 'manual',
    note: str(body.note),
    by: user.displayName,
  })
  await appendAuditLog({
    action: 'CREATE',
    target: 'trace-barcode',
    detail: [`${record.company} · ${record.product}`, `${record.barcode} 직접 등록 (입고등록 없음)`].join('\n'),
    userId: user.id,
    userName: user.displayName,
  })
  return NextResponse.json({ data: record })
}
