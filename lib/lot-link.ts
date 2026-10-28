import { compactDate, displayLot, StockMovement } from './stock'
import { DocumentMetadata } from './types'
import { ProcessCheckRecord, ProcessFloor, recordFloor } from './process-checklist'

export function lotText(value?: string) {
  const text = (value || '').trim()
  return !text || text === '-' ? '' : text
}

export function lotsMatch(left?: string, right?: string) {
  const a = lotText(left)
  const b = lotText(right)
  if (!a || !b) return false
  if (a === b) return true
  const parts = (value: string) => value.split('~').map((part) => part.trim()).filter(Boolean)
  return parts(a).some((part) => parts(b).includes(part))
}

function floorsMatch(left?: string | number, right?: string | number) {
  const a = String(left ?? '').trim()
  const b = String(right ?? '').trim()
  if (!a || !b) return true
  return a === b
}

export function relatedMovements(anchor: StockMovement, movements: StockMovement[]) {
  const lot = lotText(anchor.lot)
  return movements.filter((row) => {
    if (row.company !== anchor.company || row.product !== anchor.product) return false
    if (row.floor !== anchor.floor || row.unit !== anchor.unit) return false
    const rowLot = lotText(row.lot)
    if (lot && rowLot) return lotsMatch(lot, rowLot)
    if (!lot && !rowLot) return row.issueDate === anchor.issueDate
    return false
  })
}

export function movementMatchesDocument(row: StockMovement, doc: DocumentMetadata) {
  if (doc.id === row.id || doc.linkedMovementId === row.id) return true
  if ((doc.company || '').trim() !== row.company) return false
  if ((doc.product || '').trim() !== row.product) return false
  if (!floorsMatch(doc.floor ?? doc.shipmentFloor, row.floor)) return false
  const docLot = lotText(displayLot(doc))
  const rowLot = lotText(row.lot)
  if (rowLot && docLot) return lotsMatch(rowLot, docLot)
  if (!rowLot && !docLot) return compactDate(doc.issueDate) === compactDate(row.issueDate)
  return false
}

export function certificatesFor(anchor: StockMovement, movements: StockMovement[], documents: DocumentMetadata[]) {
  const bundle = relatedMovements(anchor, movements)
  const seen = new Set<string>()
  const matched: DocumentMetadata[] = []
  for (const doc of documents) {
    if (doc.documentType !== '성적서' || doc.storagePath === 'INVENTORY') continue
    if (!bundle.some((row) => movementMatchesDocument(row, doc))) continue
    if (seen.has(doc.id)) continue
    seen.add(doc.id)
    matched.push(doc)
  }
  return matched
}

export function checksFor(anchor: StockMovement, movements: StockMovement[], records: ProcessCheckRecord[]) {
  const floor = Number(anchor.floor)
  if (floor !== 1 && floor !== 2 && floor !== 3) return []
  const dates = new Set(relatedMovements(anchor, movements).map((row) => compactDate(row.issueDate)))
  dates.add(compactDate(anchor.issueDate))
  return records
    .filter((record) => recordFloor(record) === (floor as ProcessFloor) && dates.has(compactDate(record.writtenDate)))
    .sort((a, b) => compactDate(b.writtenDate).localeCompare(compactDate(a.writtenDate)))
}

export function inboundNeedsCertificate(row: StockMovement, documents: DocumentMetadata[]) {
  if (row.kind !== '입고' || row.source === 'document') return false
  return !documents.some(
    (doc) => doc.documentType === '성적서' && doc.storagePath !== 'INVENTORY' && movementMatchesDocument(row, doc),
  )
}

export function attachCertificateHref(row: StockMovement) {
  const lot = lotText(row.lot).split('~')[0]?.trim() || ''
  const params = new URLSearchParams({
    link: row.id,
    company: row.company,
    product: row.product,
    floor: row.floor || '',
    lot,
    date: compactDate(row.issueDate),
    qty: String(row.quantity),
    unit: row.unit,
    movement: row.kind,
    type: '성적서',
  })
  return `/upload?${params.toString()}`
}
