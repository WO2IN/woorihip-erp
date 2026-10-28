import ExcelJS from 'exceljs'

export interface ShipmentExcelStockRow {
  company: string
  product: string
  floor: string
  unit: string
  opening: number
  incoming: number
  outgoing: number
  stock: number
  defect?: number
  sample?: number
  workQuantity?: number
  finalStock?: number
  defectRate?: string
  lastDate: string
}

export interface ShipmentExcelLedgerRow {
  issueDate: string
  kind: string
  company: string
  product: string
  floor: string
  lot: string
  quantity: number
  unit: string
}

interface ColumnSpec {
  header: string
  key: string
  width: number
  align: 'left' | 'center' | 'right'
  numeric?: boolean
}

const FONT = '맑은 고딕'
const TEAL = 'FF0F766E'
const TEAL_SOFT = 'FFF0FDFA'
const HEADER_TEXT = 'FFFFFFFF'
const BODY = 'FF1E293B'
const MUTED = 'FF64748B'
const LINE = 'FFD1D5DB'
const ZEBRA = 'FFF8FAFC'
const IN_FILL = 'FFE0F2FE'
const IN_TEXT = 'FF0369A1'
const OUT_FILL = 'FFFFEDD5'
const OUT_TEXT = 'FFC2410C'
const NEGATIVE = 'FFBE123C'

const thin = { style: 'thin' as const, color: { argb: LINE } }
const border: Partial<ExcelJS.Borders> = { top: thin, left: thin, bottom: thin, right: thin }
const accent = { style: 'medium' as const, color: { argb: TEAL } }

const STOCK_COLUMNS: ColumnSpec[] = [
  { header: '업체명', key: 'company', width: 22, align: 'left' },
  { header: '품목', key: 'product', width: 28, align: 'left' },
  { header: '층', key: 'floor', width: 10, align: 'center' },
  { header: '단위', key: 'unit', width: 10, align: 'center' },
  { header: '기초재고', key: 'opening', width: 14, align: 'right', numeric: true },
  { header: '입고', key: 'incoming', width: 14, align: 'right', numeric: true },
  { header: '출고', key: 'outgoing', width: 14, align: 'right', numeric: true },
  { header: '현재고', key: 'stock', width: 14, align: 'right', numeric: true },
  { header: '최근일자', key: 'lastDate', width: 16, align: 'center' },
]

const FLOOR3_STOCK_COLUMNS: ColumnSpec[] = [
  { header: '업체명', key: 'company', width: 22, align: 'left' },
  { header: '품목', key: 'product', width: 28, align: 'left' },
  { header: '층', key: 'floor', width: 10, align: 'center' },
  { header: '단위', key: 'unit', width: 10, align: 'center' },
  { header: '작업수량', key: 'workQuantity', width: 14, align: 'right', numeric: true },
  { header: '입고', key: 'incoming', width: 14, align: 'right', numeric: true },
  { header: '출고', key: 'outgoing', width: 14, align: 'right', numeric: true },
  { header: '불량', key: 'defect', width: 12, align: 'right', numeric: true },
  { header: '불량률', key: 'defectRate', width: 12, align: 'right' },
  { header: '검사시료', key: 'sample', width: 12, align: 'right', numeric: true },
  { header: '현 재고수량', key: 'stock', width: 16, align: 'right', numeric: true },
  { header: '최종 재고수량', key: 'finalStock', width: 16, align: 'right', numeric: true },
  { header: '최근일자', key: 'lastDate', width: 16, align: 'center' },
]

const LEDGER_COLUMNS: ColumnSpec[] = [
  { header: '일자', key: 'issueDate', width: 14, align: 'center' },
  { header: '구분', key: 'kind', width: 10, align: 'center' },
  { header: '업체명', key: 'company', width: 22, align: 'left' },
  { header: '품목', key: 'product', width: 28, align: 'left' },
  { header: '층', key: 'floor', width: 10, align: 'center' },
  { header: '로트', key: 'lot', width: 24, align: 'left' },
  { header: '수량', key: 'quantity', width: 14, align: 'right', numeric: true },
  { header: '단위', key: 'unit', width: 10, align: 'center' },
]

function columnLetter(index: number) {
  let n = index
  let letters = ''
  while (n > 0) {
    const rem = (n - 1) % 26
    letters = String.fromCharCode(65 + rem) + letters
    n = Math.floor((n - 1) / 26)
  }
  return letters
}

function paintRow(row: ExcelJS.Row, columnCount: number, fill: string, bottom?: Partial<ExcelJS.Border>) {
  for (let column = 1; column <= columnCount; column += 1) {
    const cell = row.getCell(column)
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill } }
    if (bottom) cell.border = { bottom }
  }
}

type SheetRow = ShipmentExcelStockRow | ShipmentExcelLedgerRow

function writeSheet(
  workbook: ExcelJS.Workbook,
  name: string,
  title: string,
  columns: ColumnSpec[],
  rows: SheetRow[],
  tabColor: string,
  exportedAt: Date,
) {
  const sheet = workbook.addWorksheet(name, {
    views: [{ state: 'frozen', ySplit: 3, showGridLines: false, zoomScale: 110 }],
    properties: { tabColor: { argb: tabColor }, defaultRowHeight: 20 },
    pageSetup: {
      paperSize: 9,
      orientation: 'landscape',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      horizontalCentered: true,
      printTitlesRow: '1:3',
      margins: { left: 0.4, right: 0.4, top: 0.55, bottom: 0.45, header: 0.2, footer: 0.25 },
    },
    headerFooter: {
      oddFooter: '&LWOORI-HIP&C입/출고 관리&R&P / &N',
      evenFooter: '&LWOORI-HIP&C입/출고 관리&R&P / &N',
    },
  })

  sheet.columns = columns.map((column) => ({ key: column.key, width: column.width }))
  const columnCount = columns.length
  const lastColumn = columnLetter(columnCount)

  const titleRow = sheet.getRow(1)
  titleRow.height = 32
  paintRow(titleRow, columnCount, TEAL_SOFT)
  sheet.mergeCells(1, 1, 1, columnCount)
  const titleCell = sheet.getCell(1, 1)
  titleCell.value = title
  titleCell.font = { name: FONT, size: 16, bold: true, color: { argb: TEAL } }
  titleCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 }

  const metaRow = sheet.getRow(2)
  metaRow.height = 18
  paintRow(metaRow, columnCount, 'FFF8FAFC', accent)
  sheet.mergeCells(2, 1, 2, columnCount)
  const metaCell = sheet.getCell(2, 1)
  const stamp = exportedAt.toLocaleString('ko-KR', { hour12: false })
  metaCell.value = `출력 ${stamp}    ${rows.length.toLocaleString('ko-KR')}건`
  metaCell.font = { name: FONT, size: 9, color: { argb: MUTED } }
  metaCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 }

  const headerRow = sheet.getRow(3)
  headerRow.height = 24
  columns.forEach((column, index) => {
    const cell = headerRow.getCell(index + 1)
    cell.value = column.header
    cell.font = { name: FONT, size: 10, bold: true, color: { argb: HEADER_TEXT } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: TEAL } }
    cell.alignment = { vertical: 'middle', horizontal: 'center' }
    cell.border = {
      top: { style: 'thin', color: { argb: TEAL } },
      left: { style: 'thin', color: { argb: 'FF115E59' } },
      right: { style: 'thin', color: { argb: 'FF115E59' } },
      bottom: { style: 'thin', color: { argb: TEAL } },
    }
  })

  rows.forEach((data, rowIndex) => {
    const row = sheet.getRow(rowIndex + 4)
    row.height = 22
    const zebra = rowIndex % 2 === 1
    columns.forEach((column, columnIndex) => {
      const cell = row.getCell(columnIndex + 1)
      const raw = data[column.key as keyof SheetRow]
      const value = typeof raw === 'string' || typeof raw === 'number' ? raw : undefined
      const display = value === '' || value == null ? '-' : value
      cell.value = display
      cell.border = border
      cell.alignment = {
        vertical: 'middle',
        horizontal: column.align,
        indent: column.align === 'left' ? 1 : 0,
      }
      if (zebra) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ZEBRA } }

      let color = BODY
      let bold = false
      if (column.numeric && typeof display === 'number') {
        cell.numFmt = Number.isInteger(display) ? '#,##0' : '#,##0.##'
        if (column.key === 'stock' || column.key === 'finalStock') bold = true
        if (display < 0) color = NEGATIVE
      }
      if (column.key === 'kind' && display === '입고') {
        color = IN_TEXT
        bold = true
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: IN_FILL } }
      }
      if (column.key === 'kind' && display === '출고') {
        color = OUT_TEXT
        bold = true
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: OUT_FILL } }
      }
      cell.font = { name: FONT, size: 10, bold, color: { argb: color } }
    })
  })

  const lastRow = Math.max(3, rows.length + 3)
  sheet.autoFilter = `A3:${lastColumn}${lastRow}`
  sheet.pageSetup.printArea = `A1:${lastColumn}${lastRow}`
  return sheet
}

export async function buildShipmentWorkbook(input: {
  stock: ShipmentExcelStockRow[]
  ledger: ShipmentExcelLedgerRow[]
  floor3?: boolean
  exportedAt?: Date
}) {
  const exportedAt = input.exportedAt ?? new Date()
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'WOORI-HIP'
  workbook.created = exportedAt
  workbook.modified = exportedAt

  writeSheet(
    workbook,
    '재고현황',
    input.floor3 ? '입/출고 관리  ·  재고관리 3층' : '입/출고 관리  ·  재고현황',
    input.floor3 ? FLOOR3_STOCK_COLUMNS : STOCK_COLUMNS,
    input.stock,
    TEAL,
    exportedAt,
  )
  writeSheet(workbook, '수불부', '입/출고 관리  ·  수불부', LEDGER_COLUMNS, input.ledger, 'FF0369A1', exportedAt)

  return workbook.xlsx.writeBuffer()
}
