import { NextRequest, NextResponse } from 'next/server'
import { canOperateFloor } from '@/lib/access'
import { normalizeProductName } from '@/lib/product-name'
import { canEdit, getUserFromHeaders } from '@/lib/auth'
import { deleteRecordsWhere, listRecords } from '@/lib/records'
import { appendAuditLog, readInventory, updateInventory } from '@/lib/storage'
import { canIssueTraceBarcode, findTraceBarcode, issueTraceBarcode, TRACE_BARCODE_COLLECTION } from '@/lib/trace-barcode'
import type { TraceBarcode, TraceBarcodeOption } from '@/lib/trace'

export const dynamic = 'force-dynamic'

const str = (value: unknown) => (typeof value === 'string' ? value.trim() : typeof value === 'number' ? String(value) : '')

/** 바코드 대장 목록. 이력카드에서 바코드를 고를 때 쓰며, company·product 를 주면 그 업체·품명 것만 돌려준다. */
export async function GET(request: NextRequest) {
  const user = await getUserFromHeaders(request.headers)
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })

  const company = str(request.nextUrl.searchParams.get('company'))
  const product = str(request.nextUrl.searchParams.get('product'))
  const [rows, cards, inventory] = await Promise.all([
    listRecords<TraceBarcode>(TRACE_BARCODE_COLLECTION),
    listRecords<{ barcode?: string }>('lot-cards'),
    readInventory(),
  ])
  // 입고로 발급된 바코드인데 그 입고가 지워졌으면 목록에서 뺀다.
  const inventoryIds = new Set(inventory.map((item) => item.id))
  const cardCount = new Map<string, number>()
  for (const card of cards) {
    const key = str(card.barcode).toUpperCase()
    if (key) cardCount.set(key, (cardCount.get(key) ?? 0) + 1)
  }
  const data: TraceBarcodeOption[] = rows
    .filter((row) => !(row.source === 'inbound' && row.inventoryId && !inventoryIds.has(row.inventoryId)))
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
  if (!canIssueTraceBarcode(user)) {
    return NextResponse.json({ error: '테스트 단계라 지정된 계정만 바코드를 만들 수 있습니다.' }, { status: 403 })
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
  const product = normalizeProductName(str(body.product))
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

/**
 * 입고 한 건의 바코드를 없앤다. 입고 기록은 남고 바코드만 빠진다.
 * 그 바코드로 쓴 수입검사·이력카드·출하성적서가 있으면 막는다.
 */
export async function DELETE(request: NextRequest) {
  const user = await getUserFromHeaders(request.headers)
  if (!user || !canEdit(user.role)) {
    return NextResponse.json({ error: '바코드를 제거할 권한이 없습니다.' }, { status: 403 })
  }
  const body = await request.json().catch(() => ({}))
  const inventoryId = str(body.inventoryId)
  const inbound = (await readInventory()).find((item) => item.id === inventoryId)
  if (!inbound) return NextResponse.json({ error: '입고 내역을 찾을 수 없습니다.' }, { status: 404 })
  if (!canOperateFloor(user, inbound.floor)) {
    return NextResponse.json({ error: '다른 층 입고의 바코드는 제거할 수 없습니다.' }, { status: 403 })
  }
  const barcode = str((inbound as { barcode?: string }).barcode)
  if (!barcode) return NextResponse.json({ error: '바코드가 없는 입고입니다.' }, { status: 400 })

  const upper = barcode.toUpperCase()
  const linked = (
    await Promise.all(['incoming-inspections', 'lot-cards', 'outgoing-reports'].map((name) => listRecords<{ barcode?: string }>(name)))
  ).flat().some((doc) => str(doc.barcode).toUpperCase() === upper)
  if (linked) {
    return NextResponse.json({ error: '이 바코드로 작성한 서류가 있어 제거할 수 없습니다. 서류를 먼저 지우세요.' }, { status: 409 })
  }

  await deleteRecordsWhere<TraceBarcode>(TRACE_BARCODE_COLLECTION, (row) => row.barcode.toUpperCase() === upper)
  await updateInventory(inbound.id, { barcode: '', flow: false } as Record<string, unknown>)
  await appendAuditLog({
    action: 'DELETE',
    target: 'trace-barcode',
    detail: [`${inbound.company} · ${inbound.product}`, `${barcode} 바코드 제거 (입고 ${inbound.issueDate})`].join('\n'),
    userId: user.id,
    userName: user.displayName,
  })
  return NextResponse.json({ success: true })
}
