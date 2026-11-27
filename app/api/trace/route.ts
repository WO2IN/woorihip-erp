import { NextRequest, NextResponse } from 'next/server'
import { getUserFromHeaders } from '@/lib/auth'
import { lotsMatch } from '@/lib/lot-link'
import { findRecords, listRecords } from '@/lib/records'
import { displayLot } from '@/lib/stock'
import { readMetadata } from '@/lib/storage'
import { findTraceBarcode } from '@/lib/trace-barcode'
import type { TraceDoc, TraceFile, TraceInbound, TraceResult, TraceStep, TraceWorkLog } from '@/lib/trace'

export const dynamic = 'force-dynamic'

type Row = Record<string, unknown> & { id: string }

const str = (value: unknown) => (typeof value === 'string' ? value.trim() : typeof value === 'number' ? String(value) : '')
const day = (value: unknown) => {
  const text = str(value)
  return /^\d{4}-\d{2}-\d{2}/.test(text) ? text.slice(0, 10) : ''
}
const unique = (values: string[]) => [...new Set(values.filter(Boolean))]
const sum = (values: string[]) => {
  const numbers = values.map((value) => Number(value.replace(/,/g, ''))).filter((value) => Number.isFinite(value) && value > 0)
  return numbers.length === 0 ? '' : String(Math.round(numbers.reduce((total, value) => total + value, 0) * 100) / 100)
}

/**
 * 바코드(또는 LOT 번호)로 바코드 대장을 찾고, 그 바코드에 묶인 이력카드 전부와
 * 연결된 수입검사·출하성적서·성적서 문서, 상태 기록을 한 번에 돌려준다.
 * 입고 한 건이 LOT 여러 개·이력카드 여러 장으로 나뉘어도 바코드는 하나다.
 */
export async function GET(request: NextRequest) {
  const user = await getUserFromHeaders(request.headers)
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })

  const code = (request.nextUrl.searchParams.get('code') ?? '').trim()
  if (!code) return NextResponse.json({ error: '바코드 값이 없습니다.' }, { status: 400 })
  const upper = code.toUpperCase()

  const allCards = await listRecords<Row>('lot-cards')
  let record = await findTraceBarcode(code)
  if (!record) {
    // LOT 번호를 찍은 경우: 그 이력카드에 연결된 바코드로 찾는다.
    const byLot = allCards.find((row) => str(row.lotNo).toUpperCase() === upper && str(row.barcode))
    if (byLot) record = await findTraceBarcode(str(byLot.barcode))
  }
  if (!record) return NextResponse.json({ error: '등록된 바코드가 아닙니다. 입고등록에서 발급했거나 직접 등록한 바코드만 조회됩니다.' }, { status: 404 })

  const barcodeKey = record.barcode.toUpperCase()
  const cards = allCards
    .filter((row) => str(row.barcode).toUpperCase() === barcodeKey)
    .sort((a, b) => str(a.lotNo).localeCompare(str(b.lotNo), 'ko', { numeric: true }))
  const cardIds = new Set(cards.map((card) => card.id))
  const sheetIds = new Set(cards.map((card) => str(card.sourceIncomingId)).filter(Boolean))
  // 이력카드가 아직 없어도 같은 바코드로 연결된 수입검사·출하성적서는 함께 찾는다.
  const sheets = await findRecords<Row>('incoming-inspections', (row) => sheetIds.has(row.id) || str(row.barcode).toUpperCase() === barcodeKey)
  const sheetOf = new Map(sheets.map((sheet) => [sheet.id, sheet]))
  const reports = (await findRecords<Row>('outgoing-reports', (row) => cardIds.has(str(row.sourceLotCardId)) || str(row.barcode).toUpperCase() === barcodeKey))
    .sort((a, b) => str(a.issuedOn).localeCompare(str(b.issuedOn)))
  const cardLot = new Map(cards.map((card) => [card.id, str(card.lotNo)]))

  const ownInbound = record.inventoryId
    ? (await findRecords<Row>('inventory', (row) => row.id === record.inventoryId, 1))[0] ?? null
    : null
  // 입고등록을 고치면 바코드 대장의 사본보다 입고등록 쪽이 최신이므로 그쪽을 우선한다.
  const partner = str(ownInbound?.company) || record.company
  const product = str(ownInbound?.product) || record.product
  const receivedOn = day(ownInbound?.issueDate) || day(record.receivedAt)
  const floor = str(ownInbound?.floor) || String(record.floor || '') || str(cards[0]?.floor)
  const lots = unique(cards.map((card) => str(card.lotNo)))

  const metadata = lots.length > 0 && product ? await readMetadata() : []
  const documents: TraceFile[] = metadata
    // 완료할 때 자동 저장된 서류 사본은 이력 화면이 서식 그대로 보여 주므로 파일 목록에서 뺀다.
    .filter((doc) => doc.storagePath !== 'INVENTORY' && doc.storedFileId && !doc.sourceSheetId)
    .filter((doc) => str(doc.product) === product && (!partner || str(doc.company) === partner || reports.some((r) => str(r.customer) === str(doc.company))))
    .filter((doc) => lots.some((lot) => lotsMatch(displayLot(doc), lot)))
    .map((doc) => ({
      id: doc.id,
      name: doc.originalName || doc.filename,
      type: doc.documentType,
      issueDate: doc.issueDate,
      fileId: doc.storedFileId as string,
    }))

  // 작업일보에는 LOT/바코드가 없다. 업체·품명(규격)이 같고 입고일 이후인 기록을 같은 제품 흐름으로 본다.
  const names = new Set([product, ...cards.map((card) => str(card.spec)), ...cards.map((card) => str(card.product))].filter(Boolean))
  const sameProduct = (row: Row) => str(row.company) === partner && names.has(str(row.product))
  const sameFloor = (row: Row) => !floor || !str(row.floor) || str(row.floor) === floor

  const toInbound = (row: Row, own = false): TraceInbound => ({
    id: row.id,
    date: day(row.issueDate),
    quantity: [str(row.quantity), str(row.quantityUnit)].filter(Boolean).join(' '),
    lot: str(row.lotStart),
    ...(own ? { own: true } : {}),
  })
  let inbound: TraceInbound[] = []
  if (ownInbound) {
    // 이 바코드가 발급된 입고 건이 있으면 그 건만 보여 준다.
    inbound = [toInbound(ownInbound, true)]
  } else if (partner && names.size > 0) {
    // 직접 등록한 바코드: 업체·품명이 같은 입고 기록을 참고로 보여 준다.
    const rows = (await listRecords<Row>('inventory'))
      .filter((row) => row.movementType === '입고' && sameProduct(row) && sameFloor(row))
      .sort((a, b) => str(b.issueDate).localeCompare(str(a.issueDate)))
    const lotKeys = new Set(lots.map((lot) => lot.toUpperCase()))
    const exact = rows.filter((row) => lotKeys.has(str(row.lotStart).toUpperCase()))
    inbound = (exact.length > 0 ? exact : rows).slice(0, 5).map((row) => toInbound(row))
  }

  const windowStart = [receivedOn, ...inbound.map((row) => row.date)].filter(Boolean).sort()[0] ?? ''
  const windowEnd = reports.map((row) => day(row.issuedOn)).filter(Boolean).sort().pop() ?? ''
  const workRows = partner && names.size > 0
    ? (await listRecords<Row>('floor3WorkLogs'))
        .filter(sameProduct)
        .filter((row) => (!windowStart || day(row.workDate) >= windowStart) && (!windowEnd || day(row.workDate) <= windowEnd))
        .sort((a, b) => str(a.workDate).localeCompare(str(b.workDate)))
    : []
  const workLogs: TraceWorkLog[] = workRows.map((row) => ({
    id: row.id,
    date: day(row.workDate),
    work: Number(row.workQuantity) || 0,
    defect: Number(row.defectQuantity) || 0,
    unit: str(row.unit) || 'EA',
  }))

  const steps: TraceStep[] = []
  const push = (source: string, date: unknown, label: string, opts: { judge?: unknown; detail?: string; lot?: string } = {}) => {
    const at = day(date)
    if (!at) return
    steps.push({
      date: at,
      label,
      source,
      ...(opts.lot && cards.length > 1 ? { lot: opts.lot } : {}),
      ...(str(opts.judge) ? { judge: str(opts.judge) } : {}),
      ...(opts.detail ? { detail: opts.detail } : {}),
    })
  }
  if (inbound.length === 0) {
    push('입고등록', record.receivedAt, '입고', { detail: [record.quantity > 0 ? `${record.quantity} ${record.quantityUnit}` : '', '입고등록 없이 직접 등록한 바코드'].filter(Boolean).join(' · ') })
  }
  for (const row of inbound) push('입고등록', row.date, '입고', { detail: [row.quantity, row.lot && `LOT ${row.lot}`].filter(Boolean).join(' · ') })
  const widths = (full: unknown, gap: unknown, plate: unknown) =>
    [['전폭', full], ['간격', gap], ['도금폭', plate]]
      .map(([name, value]) => `${name} ${str(value) || '-'}`)
      .join(' · ')
  const thickness = (first: unknown, last: unknown, fallback: unknown) => {
    const parts = [str(first) && `초물 ${str(first)}`, str(last) && `종물 ${str(last)}`].filter(Boolean)
    if (parts.length > 0) return `${parts.join(' · ')} μm`
    return str(fallback) ? `${str(fallback)} μm` : ''
  }
  // 작업 이력에는 '완료'를 누른 서류만 올린다. 완료를 취소하면 다시 빠진다.
  // 수입검사: 성적서 한 장에 이력카드가 여러 장 붙어도 한 번만 올린다.
  const pushedSheets = new Set<string>()
  for (const card of cards) {
    const sheet = sheetOf.get(str(card.sourceIncomingId))
    if (sheet && sheet.done === true && !pushedSheets.has(sheet.id)) {
      pushedSheets.add(sheet.id)
      push('수입검사성적서', sheet.inspectedOn, '수입검사', { judge: sheet.judgment, detail: [str(sheet.thicknessValue) && `두께 ${str(sheet.thicknessValue)}`, str(sheet.widthValue) && `전폭 ${str(sheet.widthValue)}`].filter(Boolean).join(' · ') })
    }
    if (card.done !== true) continue
    const lot = str(card.lotNo)
    push('이력카드', card.maskDate, '마스킹', { judge: card.maskJudge, detail: widths(card.maskFullWidth, card.maskGap, card.maskPlateWidth), lot })
    push('이력카드', card.niDate, 'Ni 도금', { judge: card.niJudge, detail: thickness(card.niFirst, card.niLast, card.niThickness), lot })
    push('이력카드', card.auDate, 'Au 도금', { judge: card.auJudge, detail: thickness(card.auFirst, card.auLast, card.auThickness), lot })
    push('이력카드', card.snDate, 'Sn 도금', { judge: card.snJudge, detail: thickness(card.snFirst, card.snLast, card.snThickness), lot })
  }
  for (const log of workLogs) {
    push('작업일보', log.date, '작업', { detail: `작업 ${log.work.toLocaleString('ko-KR')}${log.unit}${log.defect > 0 ? ` · 불량 ${log.defect.toLocaleString('ko-KR')}` : ''}` })
  }
  for (const report of reports) {
    if (report.done !== true) continue
    push('출하성적서', report.issuedOn, '출하성적서 발행', { judge: report.judgment, detail: str(report.customer), lot: cardLot.get(str(report.sourceLotCardId)) })
  }
  steps.sort((a, b) => a.date.localeCompare(b.date))

  const docOf = (row: Row, date: unknown, judge: unknown, extra: { by?: string; note?: string; lot?: string } = {}): TraceDoc => ({
    id: row.id,
    date: day(date) || day(row.createdAt),
    judge: str(judge),
    done: row.done === true,
    ...(extra.lot ? { lot: extra.lot } : {}),
    ...(extra.by ? { by: extra.by } : {}),
    ...(extra.note ? { note: extra.note } : {}),
  })

  const cardWorkDates = cards.flatMap((card) => [card.workDate, card.niDate, card.auDate, card.snDate, card.maskDate]).map(day).filter(Boolean)
  const workDates = [...workLogs.map((log) => log.date), ...cardWorkDates].filter(Boolean).sort()
  // 작업 기간: 현장 작업에서 처음 '작업 시작'을 누른 시각 ~ 마지막 롤 '작업 완료' 시각. 아직 남은 롤이 있으면 '~ 진행 중'.
  // 현장 작업 기록이 없으면 예전처럼 작업일보·이력카드 작업일자로 잡는다.
  const stamp = (value: unknown) => {
    const at = Date.parse(str(value))
    return Number.isNaN(at) ? '' : new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(at))
  }
  const starts = cards.map((card) => str(card.workStartedAt)).filter(Boolean).sort()
  const allDone = cards.length > 0 && cards.every((card) => card.workStatus === 'done')
  const ends = cards.map((card) => str(card.workDoneAt)).filter(Boolean).sort()
  const workPeriod = starts.length > 0
    ? `${stamp(starts[0])} ~ ${allDone && ends.length > 0 ? stamp(ends[ends.length - 1]) : '진행 중'}`
    : workDates.length === 0 ? '' : workDates[0] === workDates[workDates.length - 1] ? workDates[0] : `${workDates[0]} ~ ${workDates[workDates.length - 1]}`

  const result: TraceResult = {
    barcode: record.barcode,
    status: record.status,
    statusLog: record.statusLog ?? [],
    source: record.source,
    partner,
    product,
    spec: unique(cards.map((card) => str(card.spec))).join(', '),
    material: unique(cards.map((card) => str(card.material))).join(', '),
    lots,
    floor,
    inboundQuantity: ownInbound
      ? [str(ownInbound.quantity), str(ownInbound.quantityUnit)].filter(Boolean).join(' ')
      : record.quantity > 0 ? `${record.quantity} ${record.quantityUnit}` : '',
    quantity: sum(cards.map((card) => str(card.quantity))),
    platedQuantity: sum(cards.map((card) => str(card.platedQuantity))),
    rollCount: sum(cards.map((card) => str(card.rollCount))),
    materialVendor: unique(cards.map((card) => str(card.materialVendor))).join(', '),
    receivedOn,
    workPeriod,
    steps,
    incomings: sheets
      .sort((a, b) => str(a.inspectedOn).localeCompare(str(b.inspectedOn)))
      .map((sheet) => docOf(sheet, sheet.inspectedOn, sheet.judgment, { by: str(sheet.inspector) })),
    cards: cards.map((card) => docOf(card, card.workDate || card.receivedAt, card.shipJudge, { lot: str(card.lotNo) })),
    reports: reports.map((row) =>
      docOf(row, row.issuedOn, row.judgment, {
        by: str(row.customer),
        note: str(row.lotSize) ? `LOT 수량 ${str(row.lotSize)}` : '',
        lot: cardLot.get(str(row.sourceLotCardId)),
      }),
    ),
    inbound,
    workLogs,
    documents,
  }
  return NextResponse.json({ data: result })
}
