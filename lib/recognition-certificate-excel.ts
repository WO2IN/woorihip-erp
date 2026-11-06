import path from 'node:path'
import ExcelJS from 'exceljs'
import JSZip from 'jszip'
import sharp from 'sharp'

const TEMPLATE = path.join(process.cwd(), 'templates', 'recognition-certificate.xlsx')

/** templates/recognition-certificate.xlsx — C8 증명사진, F26~F29 기재, C37 발행일 */
const PHOTO_ANCHOR = {
  tl: { col: 2, row: 7 },
  br: { col: 7, row: 23 },
} as const

export type RecognitionCertificateInput = {
  name: string
  department: string
  joinDate: string
  duty: string
  issueDate: string
  photoBase64?: string
  photoMime?: string
  includePhoto?: boolean
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
  const { width, height } = boxPixelSize(ws, PHOTO_ANCHOR)
  const fitted = await fitPhotoForBox(decoded.buffer, width, height)
  const id = book.addImage({ buffer: fitted as ExcelJS.Buffer, extension: 'jpeg' })
  ws.addImage(id, { ...PHOTO_ANCHOR, editAs: 'oneCell' })
}

export async function buildRecognitionCertificateWorkbook(input: RecognitionCertificateInput): Promise<Buffer> {
  const book = new ExcelJS.Workbook()
  await book.xlsx.readFile(TEMPLATE)
  const ws = book.worksheets[0]
  if (!ws) throw new Error('자격인정서 양식 시트를 찾을 수 없습니다.')

  writeText(ws, 'F26', input.name.trim())
  writeText(ws, 'F27', input.department.trim())
  writeText(ws, 'F28', displayDotDate(input.joinDate))
  writeText(ws, 'F29', input.duty.trim())

  const issueIso =
    input.issueDate.trim() && /^\d{4}-\d{2}-\d{2}$/.test(input.issueDate.trim())
      ? input.issueDate.trim()
      : new Date().toISOString().slice(0, 10)
  writeText(ws, 'C37', formatRecognitionIssueDateKorean(issueIso))

  if (input.includePhoto !== false && input.photoBase64?.trim()) {
    await placeIdPhoto(book, ws, input.photoBase64, input.photoMime)
  }

  return Buffer.from(await book.xlsx.writeBuffer())
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
