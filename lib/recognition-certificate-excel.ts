import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { readQualificationIdPhotoPlaceholderDataUrl } from '@/lib/qualification-id-photo-placeholder.server'
import ExcelJS from 'exceljs'
import JSZip from 'jszip'
import sharp from 'sharp'

const TEMPLATE = path.join(process.cwd(), 'templates', 'recognition-certificate.xlsx')

/** 이 양식은 열 너비 1 = 6pt. B를 넓히고 H를 같은 만큼 줄여 테두리 너비는 유지한 채 성명 칸만 오른쪽으로 옮긴다. */
const COLUMN_POINT = 6
const FIELD_NUDGE_PT = 30

/** 증명사진이 들어갈 칸. 너비 계산용이며, 실제 위치는 성명 칸을 민 뒤에도 페이지 가운데다. */
const PHOTO_BOX = {
  tl: { col: 2, row: 7 },
  br: { col: 7, row: 23 },
} as const

export type RecognitionCertificateInput = {
  name: string
  certNo?: string
  department: string
  joinDate: string
  /** 자격갱신일. 비어 있으면 칸을 비운다. */
  renewalDate?: string
  duty: string
  issueDate: string
  photoBase64?: string
  photoMime?: string
  includePhoto?: boolean
  /** 대표이사 이름 옆 회사 날인. 끄지 않으면 넣는다. */
  includeSeal?: boolean
}

function displayDotDate(iso: string) {
  const trimmed = iso.trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed
  return trimmed.replace(/-/g, '.')
}

export function formatRecognitionIssueDateKorean(iso: string) {
  const trimmed = iso.trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed
  const [year, month, day] = trimmed.split('-').map(Number)
  return `${year}년 ${month}월 ${day}일`
}

function writeText(ws: ExcelJS.Worksheet, address: string, value: string) {
  ws.getCell(address).value = value
}

function columnPx(width: number | undefined) {
  return Math.round((width ?? 8) * 7 + 5)
}

function rowPx(height: number | undefined) {
  return Math.round((height ?? 15) * 4 / 3)
}

function boxPixelSize(ws: ExcelJS.Worksheet, box: { tl: { col: number; row: number }; br: { col: number; row: number } }) {
  let width = 0
  let height = 0
  for (let col = box.tl.col; col < box.br.col; col += 1) {
    width += columnPx(ws.getColumn(col + 1).width)
  }
  for (let row = box.tl.row; row < box.br.row; row += 1) {
    height += rowPx(ws.getRow(row + 1).height)
  }
  return { width: Math.max(width, 40), height: Math.max(height, 40) }
}

async function photoBuffer(base64: string, mime?: string) {
  const raw = base64.replace(/^data:[^;]+;base64,/, '')
  const input = Buffer.from(raw, 'base64')
  if (!input.length) return null
  try {
    const meta = await sharp(input).metadata()
    if (!meta.width || !meta.height) return null
    const extension: 'jpeg' | 'png' = mime?.includes('png') ? 'png' : 'jpeg'
    const buffer =
      extension === 'png'
        ? await sharp(input).png().toBuffer()
        : await sharp(input).jpeg({ quality: 92 }).toBuffer()
    return { buffer, extension }
  } catch {
    return null
  }
}

async function fitPhotoForBox(buffer: Buffer, maxW: number, maxH: number) {
  const meta = await sharp(buffer).metadata()
  if (!meta.width || !meta.height) return buffer
  const scale = Math.min(maxW / meta.width, maxH / meta.height, 1)
  const width = Math.max(1, Math.round(meta.width * scale))
  const height = Math.max(1, Math.round(meta.height * scale))
  return sharp(buffer).resize({ width, height, fit: 'inside' }).jpeg({ quality: 92 }).toBuffer()
}

async function placeIdPhoto(
  book: ExcelJS.Workbook,
  ws: ExcelJS.Worksheet,
  base64: string,
  mime?: string,
) {
  const decoded = await photoBuffer(base64, mime)
  if (!decoded) return
  const { width, height } = boxPixelSize(ws, PHOTO_BOX)
  const fitted = await fitPhotoForBox(decoded.buffer, width, height)
  const id = book.addImage({ buffer: fitted as unknown as ExcelJS.Buffer, extension: 'jpeg' })
  // B열을 30pt 늘린 뒤에도 사진은 원래 자리(C열 시작, G열 끝)에 둔다. colOff 단위는 EMU.
  ws.addImage(id, {
    tl: { nativeCol: 1, nativeColOff: emu(54), nativeRow: PHOTO_BOX.tl.row, nativeRowOff: 0 },
    br: { nativeCol: 6, nativeColOff: emu(21.75), nativeRow: PHOTO_BOX.br.row, nativeRowOff: 0 },
    editAs: 'oneCell',
  } as unknown as ExcelJS.ImageRange)
}

const EMU_PER_PT = 12700
const emu = (points: number) => Math.round(points * EMU_PER_PT)
const LOGO = path.join(process.cwd(), 'public', 'logo.png')
const COMPANY_SEAL = path.join(process.cwd(), 'public', 'company-seal.png')
/** 이름 옆에 찍는 날인 지름. 20pt 서명보다 조금 크다. */
const SEAL_SIZE_PT = 46

/** 서명 아래 선·자격인정번호·로고 자리를 만들려고 줄이는 빈 줄 높이(pt). */
const TIGHTER_ROWS: Record<number, number> = { 24: 10, 25: 10, 31: 11, 32: 11, 35: 11, 36: 11, 38: 8 }
const FOOTER_GAP_ROW = 40
const FOOTER_LINE_ROW = 41
const FOOTER_ROW = 42
/** 인정번호·로고가 놓이는 최소 높이. 그 아래는 테두리 끝까지 같은 행이 이어진다. */
const FOOTER_ROW_PT = 26
const FOOTER_RIGHT_PT = 378.75
const LOGO_HEIGHT_PT = 24
const PAGE_SLACK_PT = 8

function rowPt(ws: ExcelJS.Worksheet, row: number) {
  return ws.getRow(row).height ?? ws.properties.defaultRowHeight ?? 15
}

function rowsPt(ws: ExcelJS.Worksheet, first: number, last: number) {
  let total = 0
  for (let row = first; row <= last; row += 1) total += rowPt(ws, row)
  return total
}

function columnStartPt(ws: ExcelJS.Worksheet, col: number) {
  let total = 0
  for (let index = 1; index < col; index += 1) total += (ws.getColumn(index).width ?? 9) * COLUMN_POINT
  return total
}

/** 열 번호(1부터)와 그 안의 위치(pt)로 바꾼다. */
function colAt(ws: ExcelJS.Worksheet, points: number) {
  let col = 1
  while (columnStartPt(ws, col + 1) <= points) col += 1
  return { nativeCol: col - 1, nativeColOff: emu(points - columnStartPt(ws, col)) }
}

function rowAt(ws: ExcelJS.Worksheet, points: number) {
  let row = 1
  let top = 0
  while (top + rowPt(ws, row) <= points) {
    top += rowPt(ws, row)
    row += 1
  }
  return { nativeRow: row - 1, nativeRowOff: emu(points - top) }
}

/** 맑은 고딕 20pt 굵은 글의 폭. 인쇄본에서 한글 20.04pt, 공백 7.07pt로 확인했다. */
function signatureWidthPt(name: string) {
  let width = 0
  for (const char of `대표이사    ${name}`) width += char === ' ' ? 7.07 : 20.04
  return width
}

async function placeCompanySeal(book: ExcelJS.Workbook, ws: ExcelJS.Worksheet, signerName: string) {
  const meta = await sharp(COMPANY_SEAL).metadata()
  if (!meta.width || !meta.height) return
  const sealWidth = (SEAL_SIZE_PT * meta.width) / meta.height
  const mergedLeft = columnStartPt(ws, 2)
  const mergedRight = columnStartPt(ws, 9)
  const textRight = (mergedLeft + mergedRight) / 2 + signatureWidthPt(signerName) / 2
  const sealLeft = textRight - 8
  const rowTop = rowsPt(ws, 1, 38)
  const sealTop = rowTop + rowPt(ws, 39) / 2 - SEAL_SIZE_PT / 2
  const sealId = book.addImage({
    buffer: (await readFile(COMPANY_SEAL)) as unknown as ExcelJS.Buffer,
    extension: 'png',
  })
  ws.addImage(sealId, {
    tl: { ...colAt(ws, sealLeft), ...rowAt(ws, sealTop) },
    br: { ...colAt(ws, sealLeft + sealWidth), ...rowAt(ws, sealTop + SEAL_SIZE_PT) },
    editAs: 'oneCell',
  } as unknown as ExcelJS.ImageRange)
}

async function addFooter(book: ExcelJS.Workbook, ws: ExcelJS.Worksheet, certNo: string) {
  const border = ws.getImages().find((image) => image.range.tl.nativeRow === 0)
  const br = border?.range.br
  if (!br) return
  // 테두리는 행에 묶여 있어서, 행 높이를 바꾸기 전 아래 끝 위치를 기억했다가 그대로 되돌린다.
  // Excel이 행 높이를 픽셀 단위로 올려 잡아서, 원래 끝까지 쓰면 마지막 행이 2쪽으로 밀린다.
  const borderBottom = rowsPt(ws, 1, br.nativeRow) + br.nativeRowOff / EMU_PER_PT - PAGE_SLACK_PT

  for (const [row, height] of Object.entries(TIGHTER_ROWS)) ws.getRow(Number(row)).height = height
  ws.getRow(FOOTER_GAP_ROW).height = 14
  ws.getRow(FOOTER_LINE_ROW).height = 4
  ws.getRow(FOOTER_ROW).height = Math.max(FOOTER_ROW_PT, borderBottom - rowsPt(ws, 1, FOOTER_ROW - 1) + 0.5)

  let top = 0
  let row = 1
  while (top + rowPt(ws, row) < borderBottom) {
    top += rowPt(ws, row)
    row += 1
  }
  br.nativeRow = row - 1
  br.nativeRowOff = emu(borderBottom - top)

  for (let col = 2; col <= 8; col += 1) {
    ws.getCell(FOOTER_LINE_ROW, col).border = { bottom: { style: 'thin', color: { argb: 'FF000000' } } }
  }

  const label = ws.getCell(FOOTER_ROW, 2)
  label.value = certNo ? `자격인정번호 ${certNo}` : '자격인정번호'
  label.font = { name: '맑은 고딕', size: 10 }
  label.alignment = { horizontal: 'left', vertical: 'top' }

  const meta = await sharp(LOGO).metadata()
  if (!meta.width || !meta.height) return
  const logoWidth = (LOGO_HEIGHT_PT * meta.width) / meta.height
  const logoTop = 0
  const logoId = book.addImage({ buffer: (await readFile(LOGO)) as unknown as ExcelJS.Buffer, extension: 'png' })
  ws.addImage(logoId, {
    tl: { ...colAt(ws, FOOTER_RIGHT_PT - logoWidth), nativeRow: FOOTER_ROW - 1, nativeRowOff: emu(logoTop) },
    br: { ...colAt(ws, FOOTER_RIGHT_PT), nativeRow: FOOTER_ROW - 1, nativeRowOff: emu(logoTop + LOGO_HEIGHT_PT) },
    editAs: 'oneCell',
  } as unknown as ExcelJS.ImageRange)
}

export async function buildRecognitionCertificateWorkbook(input: RecognitionCertificateInput): Promise<Buffer> {
  const book = new ExcelJS.Workbook()
  await book.xlsx.readFile(TEMPLATE)
  const ws = book.worksheets[0]
  if (!ws) throw new Error('자격인정서 양식 시트를 찾을 수 없습니다.')

  // 성명 줄이 발행일보다 왼쪽에 있어서, B를 넓히고 H를 줄여 기재 칸만 오른쪽으로 민다.
  ws.getColumn(2).width = (54 + FIELD_NUDGE_PT) / COLUMN_POINT
  ws.getColumn(8).width = (54 - FIELD_NUDGE_PT) / COLUMN_POINT

  writeText(ws, 'F26', input.name.trim())
  writeText(ws, 'F27', input.department.trim())
  writeText(ws, 'F28', displayDotDate(input.joinDate))
  writeText(ws, 'F29', displayDotDate(input.renewalDate ?? ''))
  writeText(ws, 'F30', input.duty.trim())

  const issueIso =
    input.issueDate.trim() && /^\d{4}-\d{2}-\d{2}$/.test(input.issueDate.trim())
      ? input.issueDate.trim()
      : new Date().toISOString().slice(0, 10)
  writeText(ws, 'C37', formatRecognitionIssueDateKorean(issueIso))
  ws.unMergeCells('C37:G37')
  ws.mergeCells('C37:F37')
  ws.getCell('C37').alignment = { horizontal: 'center', vertical: 'middle' }
  ws.getCell('C37').font = { name: '맑은 고딕', size: 14, bold: true }

  // 대표이사와 이름을 한 칸에 붙여 가운데 둔다. B~H 가운데가 페이지 가운데다.
  const signerName = String(ws.getCell('G39').value ?? '홍성호').trim() || '홍성호'
  ws.getCell('C39').value = null
  ws.getCell('G39').value = null
  ws.mergeCells('B39:H39')
  ws.getCell('B39').value = `대표이사    ${signerName}`
  ws.getCell('B39').font = { name: '맑은 고딕', size: 20, bold: true }
  ws.getCell('B39').alignment = { horizontal: 'center', vertical: 'middle' }

  for (const address of ['B33', 'B34'] as const) {
    const cell = ws.getCell(address)
    cell.font = { name: '맑은 고딕', size: 16, bold: true, color: { argb: 'FF000000' } }
  }
  ws.getRow(33).height = 22
  ws.getRow(34).height = 22

  await addFooter(book, ws, input.certNo?.trim() ?? '')
  if (input.includeSeal !== false) await placeCompanySeal(book, ws, signerName)

  if (input.includePhoto !== false) {
    let photoBase64 = input.photoBase64?.trim() ? input.photoBase64 : ''
    let photoMime = input.photoMime
    if (!photoBase64) {
      const placeholder = await readQualificationIdPhotoPlaceholderDataUrl()
      photoBase64 = placeholder.data
      photoMime = placeholder.mime
    }
    await placeIdPhoto(book, ws, photoBase64, photoMime)
  }

  ws.pageSetup.horizontalCentered = true
  ws.pageSetup.fitToPage = false
  ws.pageSetup.scale = 100

  const buffer = Buffer.from(await book.xlsx.writeBuffer())
  return finalizeCertificateWorkbook(buffer)
}

/** 테두리가 걸쳐 있는 범위. 이 범위를 인쇄 영역으로 잡아야 좌우 여백이 같다. */
const PRINT_AREA = '$A$1:$I$42'

function shapeAnchors(drawingXml: string) {
  const anchors = drawingXml.match(/<xdr:twoCellAnchor[\s\S]*?<\/xdr:twoCellAnchor>/g) ?? []
  return anchors.filter((anchor) => !anchor.includes('<xdr:pic>'))
}

function maxDrawingId(xml: string) {
  let max = 1
  for (const match of xml.matchAll(/\bid="(\d+)"/g)) {
    max = Math.max(max, Number(match[1]))
  }
  return max
}

function withFreshIds(anchorXml: string, ids: { next: number }) {
  return anchorXml.replace(/(<xdr:cNvPr\b[^>]*\bid=")(\d+)"/g, (_match, prefix: string) => {
    ids.next += 1
    return `${prefix}${ids.next}"`
  })
}

/** ExcelJS가 글상자(자격인정서)와 밑줄을 지우므로 원본 도형을 다시 붙이고, 테두리 기준으로 가로 가운데 정렬한다. */
async function finalizeCertificateWorkbook(buffer: Buffer) {
  const zip = await JSZip.loadAsync(buffer)
  const template = await JSZip.loadAsync(await readFile(TEMPLATE))
  const drawingPath = Object.keys(zip.files).find((name) => /^xl\/drawings\/drawing\d+\.xml$/.test(name))
  const originalDrawing = await template.file('xl/drawings/drawing1.xml')?.async('string')
  const drawingFile = drawingPath ? zip.file(drawingPath) : null
  if (!drawingPath || !drawingFile || !originalDrawing) {
    throw new Error('자격인정서 양식의 제목 도형을 찾지 못했습니다.')
  }

  const drawing = await drawingFile.async('string')
  const shapes = shapeAnchors(originalDrawing)
  if (!shapes.length) throw new Error('자격인정서 제목 도형을 찾지 못했습니다.')
  if (!drawing.includes('자 격 인 정 서')) {
    const ids = { next: maxDrawingId(drawing) }
    const restored = shapes.map((anchor) => withFreshIds(anchor, ids)).join('')
    zip.file(drawingPath, drawing.replace('</xdr:wsDr>', `${restored}</xdr:wsDr>`))
  }

  const workbookPath = 'xl/workbook.xml'
  const workbookFile = zip.file(workbookPath)
  if (!workbookFile) throw new Error('자격인정서 통합문서를 찾지 못했습니다.')
  let workbook = await workbookFile.async('string')
  const sheetName = workbook.match(/<sheet\b[^>]*\bname="([^"]+)"/)?.[1] ?? 'Sheet1'
  const printRef = `'${sheetName.replace(/'/g, "''")}'!${PRINT_AREA}`
  if (workbook.includes('name="_xlnm.Print_Area"')) {
    workbook = workbook.replace(
      /(<definedName\b[^>]*name="_xlnm\.Print_Area"[^>]*>)[\s\S]*?(<\/definedName>)/,
      `$1${printRef}$2`,
    )
  } else {
    const defined = `<definedNames><definedName name="_xlnm.Print_Area" localSheetId="0">${printRef}</definedName></definedNames>`
    workbook = workbook.includes('<calcPr')
      ? workbook.replace('<calcPr', `${defined}<calcPr`)
      : workbook.replace('</workbook>', `${defined}</workbook>`)
  }
  zip.file(workbookPath, workbook)

  const sheetPath = Object.keys(zip.files).find((name) => /^xl\/worksheets\/sheet\d+\.xml$/.test(name))
  const sheetFile = sheetPath ? zip.file(sheetPath) : null
  if (!sheetPath || !sheetFile) throw new Error('자격인정서 시트를 찾지 못했습니다.')
  let sheet = await sheetFile.async('string')
  if (sheet.includes('<printOptions')) {
    if (!sheet.includes('horizontalCentered=')) {
      sheet = sheet.replace('<printOptions', '<printOptions horizontalCentered="1"')
    } else {
      sheet = sheet.replace(/horizontalCentered="[^"]*"/, 'horizontalCentered="1"')
    }
  } else {
    sheet = sheet.replace('<pageMargins', '<printOptions horizontalCentered="1"/><pageMargins')
  }
  zip.file(sheetPath, sheet)

  return Buffer.from(await zip.generateAsync({ type: 'nodebuffer' }))
}

export async function renderRecognitionCertificateDownload(people: RecognitionCertificateInput[]) {
  if (!people.length) throw new Error('출력할 인원이 없습니다.')
  if (people.length === 1) {
    const person = people[0]
    const buffer = await buildRecognitionCertificateWorkbook(person)
    return {
      buffer,
      filename: `자격인정서_${person.name.trim() || '미정'}.xlsx`,
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }
  }
  const zip = new JSZip()
  for (const person of people) {
    const name = person.name.trim() || '미정'
    const buffer = await buildRecognitionCertificateWorkbook(person)
    zip.file(`자격인정서_${name}.xlsx`, buffer)
  }
  return {
    buffer: await zip.generateAsync({ type: 'nodebuffer' }),
    filename: `자격인정서_${people.length}명.zip`,
    contentType: 'application/zip',
  }
}
