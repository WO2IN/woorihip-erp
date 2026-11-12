import ExcelJS from 'exceljs'

export interface CustomerNcExcelRow {
  code: string
  occurrenceDate: string
  company: string
  partNo: string
  defectType: string
  defectQty: number | ''
  description: string
  dueDate: string
  stage: string
  countermeasurePlan: string
  processingResult: string
  effectivenessVerification: string
  status: '종결' | '기한 초과' | '진행중'
  remarks: string
}

interface ColumnSpec {
  header: string
  key: keyof CustomerNcExcelRow
  width: number
  align: 'left' | 'center' | 'right'
  numeric?: boolean
  wrap?: boolean
}

const FONT = '맑은 고딕'
const INDIGO = 'FF4338CA'
const INDIGO_SOFT = 'FFEEF2FF'
const HEADER_TEXT = 'FFFFFFFF'
const BODY = 'FF1E293B'
const MUTED = 'FF64748B'
const LINE = 'FFD1D5DB'
const ZEBRA = 'FFF8FAFC'
const CLOSED_FILL = 'FFDCFCE7'
const CLOSED_TEXT = 'FF15803D'
const OVERDUE_FILL = 'FFFFE4E6'
const OVERDUE_TEXT = 'FFBE123C'
const OPEN_FILL = 'FFFFEDD5'
const OPEN_TEXT = 'FFC2410C'

const thin = { style: 'thin' as const, color: { argb: LINE } }
const border: Partial<ExcelJS.Borders> = { top: thin, left: thin, bottom: thin, right: thin }

const COLUMNS: ColumnSpec[] = [
  { header: '관리번호', key: 'code', width: 14, align: 'center' },
  { header: '접수일', key: 'occurrenceDate', width: 12, align: 'center' },
  { header: '고객사', key: 'company', width: 16, align: 'left' },
  { header: '품번', key: 'partNo', width: 18, align: 'left' },
  { header: '불량유형', key: 'defectType', width: 12, align: 'center' },
  { header: '불량수량', key: 'defectQty', width: 11, align: 'right', numeric: true },
  { header: '부적합 내용', key: 'description', width: 28, align: 'left', wrap: true },
  { header: '회신기한', key: 'dueDate', width: 12, align: 'center' },
  { header: '진행단계', key: 'stage', width: 12, align: 'center' },
  { header: '대책서', key: 'countermeasurePlan', width: 10, align: 'center' },
  { header: '처리', key: 'processingResult', width: 10, align: 'center' },
  { header: '유효성검증', key: 'effectivenessVerification', width: 11, align: 'center' },
  { header: '구분', key: 'status', width: 11, align: 'center' },
  { header: '대책 · 처리내용', key: 'remarks', width: 28, align: 'left', wrap: true },
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

function paintRow(row: ExcelJS.Row, columnCount: number, fill: string) {
  for (let column = 1; column <= columnCount; column += 1) {
    row.getCell(column).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill } }
  }
}

function statusStyle(status: CustomerNcExcelRow['status']) {
  if (status === '종결') return { fill: CLOSED_FILL, color: CLOSED_TEXT }
  if (status === '기한 초과') return { fill: OVERDUE_FILL, color: OVERDUE_TEXT }
  return { fill: OPEN_FILL, color: OPEN_TEXT }
}

export async function buildCustomerNcWorkbook(rows: CustomerNcExcelRow[], exportedAt = new Date(), subtitle?: string) {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'WOORI-HIP'
  workbook.created = exportedAt
  workbook.modified = exportedAt

  const columnCount = COLUMNS.length
  const lastColumn = columnLetter(columnCount)
  const sheet = workbook.addWorksheet('고객부적합', {
    views: [{ state: 'frozen', ySplit: 3, showGridLines: false, zoomScale: 105 }],
    properties: { tabColor: { argb: INDIGO }, defaultRowHeight: 22 },
    pageSetup: {
      paperSize: 9,
      orientation: 'landscape',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      horizontalCentered: true,
      printTitlesRow: '1:3',
      margins: { left: 0.35, right: 0.35, top: 0.5, bottom: 0.45, header: 0.2, footer: 0.25 },
    },
    headerFooter: {
      oddFooter: '&LWOORI-HIP&C고객 부적합 대장&R&P / &N',
    },
  })

  sheet.columns = COLUMNS.map((column) => ({ key: column.key, width: column.width }))

  const titleRow = sheet.getRow(1)
  titleRow.height = 34
  paintRow(titleRow, columnCount, INDIGO_SOFT)
  sheet.mergeCells(1, 1, 1, columnCount)
  const titleCell = sheet.getCell(1, 1)
  titleCell.value = '고객 부적합 대장'
  titleCell.font = { name: FONT, size: 16, bold: true, color: { argb: INDIGO } }
  titleCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 }

  const metaRow = sheet.getRow(2)
  metaRow.height = 20
  paintRow(metaRow, columnCount, 'FFF8FAFC')
  sheet.mergeCells(2, 1, 2, columnCount)
  const metaCell = sheet.getCell(2, 1)
  const stamp = exportedAt.toLocaleString('ko-KR', { hour12: false })
  const extra = subtitle?.trim() ? `    ${subtitle.trim()}` : ''
  metaCell.value = `출력 ${stamp}    ${rows.length.toLocaleString('ko-KR')}건${extra}`
  metaCell.font = { name: FONT, size: 9, color: { argb: MUTED } }
  metaCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 }

  const headerRow = sheet.getRow(3)
  headerRow.height = 26
  COLUMNS.forEach((column, index) => {
    const cell = headerRow.getCell(index + 1)
    cell.value = column.header
    cell.font = { name: FONT, size: 10, bold: true, color: { argb: HEADER_TEXT } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: INDIGO } }
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
    cell.border = {
      top: { style: 'thin', color: { argb: INDIGO } },
      left: { style: 'thin', color: { argb: 'FF3730A3' } },
      right: { style: 'thin', color: { argb: 'FF3730A3' } },
      bottom: { style: 'thin', color: { argb: INDIGO } },
    }
  })

  rows.forEach((data, rowIndex) => {
    const row = sheet.getRow(rowIndex + 4)
    row.height = 26
    const zebra = rowIndex % 2 === 1
    COLUMNS.forEach((column, columnIndex) => {
      const cell = row.getCell(columnIndex + 1)
      const raw = data[column.key]
      const empty = raw === '' || raw == null
      cell.value = empty ? '-' : raw
      cell.border = border
      cell.alignment = {
        vertical: 'middle',
        horizontal: column.align,
        indent: column.align === 'left' ? 1 : 0,
        wrapText: column.wrap,
      }
      if (zebra && column.key !== 'status') {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ZEBRA } }
      }
      if (column.numeric && typeof raw === 'number') {
        cell.numFmt = '#,##0'
      }
      let color = BODY
      let bold = column.key === 'code'
      if (column.key === 'status' && !empty) {
        const style = statusStyle(data.status)
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: style.fill } }
        color = style.color
        bold = true
      }
      cell.font = { name: FONT, size: 10, bold, color: { argb: color } }
    })
  })

  const lastRow = Math.max(3, rows.length + 3)
  sheet.autoFilter = `A3:${lastColumn}${lastRow}`
  sheet.pageSetup.printArea = `A1:${lastColumn}${lastRow}`
  return workbook.xlsx.writeBuffer()
}
