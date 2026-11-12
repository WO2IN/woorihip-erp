import ExcelJS from 'exceljs'

export interface ChangePointExcelRow {
  no: number
  requestedAt: string
  docNo: string
  title: string
  part: string
  product: string
  customer: string
  applyDate: string
  stage: string
  elapsed: number | null
  reason: string
}

interface ColumnSpec {
  header: string
  key: keyof ChangePointExcelRow
  width: number
  align: 'left' | 'center'
  wrap?: boolean
}

const FONT = '맑은 고딕'
const INK = 'FF111827'
const MUTED = 'FF4B5563'
const LINE = 'FF111827'
const HEADER_FILL = 'FFF3F4F6'
const SOFT = 'FFF9FAFB'
const ZEBRA = 'FFF8FAFC'
const EMERALD = 'FF047857'

const STAGE_FILL: Record<string, { fill: string; color: string }> = {
  접수: { fill: 'FFF1F5F9', color: 'FF334155' },
  '1차 검토': { fill: 'FFE0F2FE', color: 'FF0369A1' },
  '고객사 제출': { fill: 'FFEEF2FF', color: 'FF4338CA' },
  '승인 대기': { fill: 'FFFEF3C7', color: 'FFB45309' },
  '승인 완료': { fill: 'FFD1FAE5', color: 'FF047857' },
  '적용·초동 확인': { fill: 'FFEDE9FE', color: 'FF6D28D9' },
  종결: { fill: 'FFE2E8F0', color: 'FF1E293B' },
  반려: { fill: 'FFFFE4E6', color: 'FFBE123C' },
}

const thin = { style: 'thin' as const, color: { argb: 'FFD1D5DB' } }
const edge = { style: 'thin' as const, color: { argb: LINE } }
const border: Partial<ExcelJS.Borders> = { top: thin, left: thin, bottom: thin, right: thin }
const box: Partial<ExcelJS.Borders> = { top: edge, left: edge, bottom: edge, right: edge }

const COLUMNS: ColumnSpec[] = [
  { header: 'No', key: 'no', width: 7, align: 'center' },
  { header: '의뢰일', key: 'requestedAt', width: 13, align: 'center' },
  { header: '관리번호', key: 'docNo', width: 16, align: 'center' },
  { header: '변경 내용', key: 'title', width: 32, align: 'left', wrap: true },
  { header: '4M', key: 'part', width: 16, align: 'center' },
  { header: 'Model', key: 'product', width: 18, align: 'left' },
  { header: '고객사', key: 'customer', width: 14, align: 'center' },
  { header: '적용일', key: 'applyDate', width: 13, align: 'center' },
  { header: '진행', key: 'stage', width: 16, align: 'center' },
  { header: '경과', key: 'elapsed', width: 10, align: 'center' },
  { header: '변경 사유', key: 'reason', width: 36, align: 'left', wrap: true },
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

export async function buildChangePointWorkbook(input: {
  rows: ChangePointExcelRow[]
  flow: { label: string; count: number }[]
  period: string
  exportedAt?: Date
}) {
  const exportedAt = input.exportedAt ?? new Date()
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'WOORI-HIP'
  workbook.created = exportedAt
  workbook.modified = exportedAt

  const columnCount = COLUMNS.length
  const lastColumn = columnLetter(columnCount)
  const sheet = workbook.addWorksheet('4M 변경이력', {
    views: [{ state: 'frozen', ySplit: 4, showGridLines: false, zoomScale: 110 }],
    properties: { tabColor: { argb: EMERALD }, defaultRowHeight: 22 },
    pageSetup: {
      paperSize: 9,
      orientation: 'landscape',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      horizontalCentered: true,
      printTitlesRow: '1:4',
      margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.25 },
    },
    headerFooter: {
      oddFooter: '&LWOORI-HIP 품질팀&C4M 변경이력 대장&R&P / &N',
    },
  })

  sheet.columns = COLUMNS.map((column) => ({ key: column.key, width: column.width }))
  const stamp = exportedAt.toLocaleString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })

  const titleRow = sheet.getRow(1)
  titleRow.height = 34
  sheet.mergeCells(1, 1, 1, columnCount)
  const titleCell = sheet.getCell(1, 1)
  titleCell.value = '4M 변경이력 대장'
  titleCell.font = { name: FONT, size: 20, bold: true, color: { argb: INK } }
  titleCell.alignment = { vertical: 'middle', horizontal: 'center' }
  titleCell.border = { bottom: { style: 'medium', color: { argb: INK } } }

  const metaRow = sheet.getRow(2)
  metaRow.height = 20
  sheet.mergeCells(2, 1, 2, columnCount)
  const metaCell = sheet.getCell(2, 1)
  metaCell.value = `우리하이피(주)  품질팀      기준기간  ${input.period}      출력  ${stamp}      ${input.rows.length.toLocaleString('ko-KR')}건`
  metaCell.font = { name: FONT, size: 10, color: { argb: MUTED } }
  metaCell.alignment = { vertical: 'middle', horizontal: 'center' }

  const flowRow = sheet.getRow(3)
  flowRow.height = 24
  sheet.mergeCells(3, 1, 3, columnCount)
  const flowCell = sheet.getCell(3, 1)
  flowCell.value = input.flow.map((item, index) => `${index === 0 ? item.label : `${index}  ${item.label}`}   ${item.count}건`).join('        ')
  flowCell.font = { name: FONT, size: 10, bold: true, color: { argb: INK } }
  flowCell.alignment = { vertical: 'middle', horizontal: 'center' }
  flowCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: SOFT } }
  flowCell.border = box

  const headerRow = sheet.getRow(4)
  headerRow.height = 22
  COLUMNS.forEach((column, index) => {
    const cell = headerRow.getCell(index + 1)
    cell.value = column.header
    cell.font = { name: FONT, size: 10, bold: true, color: { argb: INK } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } }
    cell.alignment = { vertical: 'middle', horizontal: 'center' }
    cell.border = box
  })

  input.rows.forEach((data, rowIndex) => {
    const row = sheet.getRow(rowIndex + 5)
    row.height = data.reason.length > 40 || data.title.length > 28 ? 36 : 24
    const zebra = rowIndex % 2 === 1
    COLUMNS.forEach((column, columnIndex) => {
      const cell = row.getCell(columnIndex + 1)
      const raw = data[column.key]
      const empty = raw === '' || raw == null
      cell.value = column.key === 'elapsed' ? (data.elapsed == null ? '—' : data.elapsed) : empty ? '—' : raw
      cell.border = border
      cell.alignment = {
        vertical: 'middle',
        horizontal: column.align,
        indent: column.align === 'left' ? 1 : 0,
        wrapText: column.wrap,
      }
      if (zebra && column.key !== 'stage' && column.key !== 'elapsed') {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ZEBRA } }
      }
      let color = column.key === 'title' ? INK : MUTED
      let bold = column.key === 'no' || column.key === 'title'
      if (column.key === 'stage' && typeof raw === 'string' && STAGE_FILL[raw]) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: STAGE_FILL[raw].fill } }
        color = STAGE_FILL[raw].color
        bold = true
      }
      if (column.key === 'elapsed' && data.elapsed != null && data.elapsed > 30) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFE4E6' } }
        color = 'FFBE123C'
        bold = true
      }
      if (column.key === 'elapsed' && typeof data.elapsed === 'number') cell.numFmt = '0"일"'
      cell.font = { name: FONT, size: 10, bold, color: { argb: color } }
    })
  })

  const lastDataRow = Math.max(4, input.rows.length + 4)
  const signOff = sheet.getRow(lastDataRow + 2)
  signOff.height = 18
  ;([[1, 3], [4, 7], [8, columnCount]] as const).forEach(([start, end], index) => {
    const label = ['작성', '검토', '승인'][index]
    sheet.mergeCells(signOff.number, start, signOff.number, end)
    const cell = signOff.getCell(start)
    cell.value = `${label}                    (인)`
    cell.font = { name: FONT, size: 10, color: { argb: INK } }
    cell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 }
  })

  sheet.autoFilter = `A4:${lastColumn}${lastDataRow}`
  sheet.pageSetup.printArea = `A1:${lastColumn}${signOff.number}`
  return workbook.xlsx.writeBuffer()
}
