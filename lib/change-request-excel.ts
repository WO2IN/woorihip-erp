import path from 'node:path'
import ExcelJS from 'exceljs'
import JSZip from 'jszip'
import sharp from 'sharp'
import {
  CONTENT_OPTIONS,
  HANDLING_OPTIONS,
  REASON_OPTIONS,
  SUBMISSIONS,
  TARGET_OPTIONS,
  type ChangeRequest,
  type StampKey,
} from '@/lib/change-request'
import type { ChangeRequestFile } from '@/lib/change-request-files'
import { formatDotDate } from '@/lib/date-utils'
import { readUserSignature } from '@/lib/auth'
import { signatureForBox } from '@/lib/signature'

const TEMPLATE = path.join(process.cwd(), 'templates', '4m-change-request.xlsx')

function markBoxes(source: string, options: readonly string[], selected: readonly string[]) {
  const sorted = [...options].sort((a, b) => b.length - a.length)
  let next = source
  for (const option of sorted) {
    const mark = selected.includes(option) ? '☑' : '□'
    next = next.replace(`□ ${option}`, `${mark} ${option}`).replace(`□${option}`, `${mark}${option}`)
  }
  return next
}

function markSubmissions(source: string, row: ChangeRequest) {
  let index = 0
  return source.replace(/□/g, () => {
    const key = SUBMISSIONS[Math.floor(index / 2)]
    const yes = index % 2 === 0
    index += 1
    const value = key ? row.submissions[key] : ''
    if (yes && value === '유') return '☑'
    if (!yes && value === '무') return '☑'
    return '□'
  })
}

function cellText(value: ExcelJS.CellValue) {
  if (typeof value === 'string') return value
  if (value && typeof value === 'object' && 'richText' in value) return value.richText.map((part) => part.text).join('')
  return ''
}

const bodyFont: Partial<ExcelJS.Font> = {
  name: '맑은 고딕',
  family: 3,
  charset: 129,
  scheme: 'minor',
  size: 11,
  bold: false,
  color: { argb: 'FF000000' },
}

function writeBody(cell: ExcelJS.Cell, value: string, size = 11) {
  cell.value = value
  cell.font = { ...bodyFont, size }
}

type EmbeddedImage = { buffer: Buffer; extension: 'jpeg' | 'png' | 'gif' }

function imageKind(buffer: Buffer): EmbeddedImage['extension'] | 'other' | null {
  if (buffer.length > 8 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) return 'png'
  if (buffer.length > 3 && buffer[0] === 0xff && buffer[1] === 0xd8) return 'jpeg'
  if (buffer.length > 6 && buffer.subarray(0, 3).toString('ascii') === 'GIF') return 'gif'
  return null
}

async function embeddableImage(file: ChangeRequestFile): Promise<EmbeddedImage | null> {
  const kind = imageKind(file.data)
  if (kind) return { buffer: file.data, extension: kind }
  const lower = file.name.toLowerCase()
  const webp = file.data.length > 12 && file.data.subarray(0, 4).toString('ascii') === 'RIFF' && file.data.subarray(8, 12).toString('ascii') === 'WEBP'
  if (!webp && !/\.(webp|bmp|tif|tiff|heic|heif)$/.test(lower)) return null
  try {
    return { buffer: await sharp(file.data).png().toBuffer(), extension: 'png' }
  } catch {
    return null
  }
}

function imageTop(text: string, charsPerLine: number) {
  if (!text.trim()) return 22.3
  const lines = text.split('\n').reduce((count, line) => {
    const length = [...line.trim()].length
    return count + Math.max(1, Math.ceil(length / charsPerLine))
  }, 0)
  return Math.min(22 + lines + 0.35, 42)
}

function columnPx(width: number) {
  return Math.trunc(((256 * width + Math.trunc(128 / 7)) / 256) * 7)
}

function rowPx(height: number) {
  return (height || 15) * (96 / 72)
}

function shiftCol(form: ExcelJS.Worksheet, start: number, pixels: number) {
  let col = start
  let left = pixels
  while (left > 0.5) {
    const index = Math.floor(col)
    const width = columnPx(form.getColumn(index + 1).width || 8)
    const remain = width * (1 - (col - index))
    if (left <= remain) return col + left / width
    left -= remain
    col = index + 1
  }
  return col
}

function shiftRow(form: ExcelJS.Worksheet, start: number, pixels: number) {
  let row = start
  let left = pixels
  while (left > 0.5) {
    const index = Math.floor(row)
    const height = rowPx(form.getRow(index + 1).height || 15)
    const remain = height * (1 - (row - index))
    if (left <= remain) return row + left / height
    left -= remain
    row = index + 1
  }
  return row
}

function spanPx(form: ExcelJS.Worksheet, start: number, end: number, axis: 'col' | 'row') {
  let px = 0
  const first = Math.floor(start)
  const last = Math.floor(end)
  for (let index = first; index <= last; index += 1) {
    const size = axis === 'col' ? columnPx(form.getColumn(index + 1).width || 8) : rowPx(form.getRow(index + 1).height || 15)
    const from = index === first ? start - first : 0
    const to = index === last ? end - last : 1
    px += size * Math.max(0, to - from)
  }
  return px
}

async function placeImages(
  book: ExcelJS.Workbook,
  form: ExcelJS.Worksheet,
  files: ChangeRequestFile[],
  box: { col: number; colEnd: number; row: number },
) {
  const images: Array<EmbeddedImage & { width: number; height: number }> = []
  for (const file of files) {
    const image = await embeddableImage(file)
    if (!image) continue
    const meta = await sharp(image.buffer).metadata()
    if (!meta.width || !meta.height) continue
    images.push({ ...image, width: meta.width, height: meta.height })
  }
  if (!images.length || box.row >= 45) return
  const maxW = spanPx(form, box.col, box.colEnd, 'col')
  const maxH = spanPx(form, box.row, 46.7, 'row')
  if (maxW < 20 || maxH < 20) return
  const columns = images.length === 1 ? 1 : images.length <= 4 ? 2 : 3
  const gridRows = Math.ceil(images.length / columns)
  const gap = 8
  const cellW = (maxW - gap * (columns - 1)) / columns
  const cellH = (maxH - gap * (gridRows - 1)) / gridRows
  images.forEach((image, index) => {
    const column = index % columns
    const gridRow = Math.floor(index / columns)
    const aspect = image.width / image.height
    let width = cellW
    let height = width / aspect
    if (height > cellH) {
      height = cellH
      width = height * aspect
    }
    const x = column * (cellW + gap) + (cellW - width) / 2
    const y = gridRow * (cellH + gap)
    const id = book.addImage({ buffer: image.buffer as ExcelJS.Buffer, extension: image.extension })
    form.addImage(id, {
      tl: { col: shiftCol(form, box.col, x), row: shiftRow(form, box.row, y) },
      br: { col: shiftCol(form, box.col, x + width), row: shiftRow(form, box.row, y + height) },
      editAs: 'oneCell',
    })
  })
}

/** templates/4m-change-request.xlsx — 서명 I4:J6·AB4:AD6, 이름 7행 */
const STAMP_LAYOUT: Record<
  StampKey,
  { nameCell: string; sign: { tl: { col: number; row: number }; br: { col: number; row: number } } }
> = {
  ourDraft: { nameCell: 'C7', sign: { tl: { col: 2, row: 3 }, br: { col: 4, row: 6 } } },
  ourReview: { nameCell: 'E7', sign: { tl: { col: 4, row: 3 }, br: { col: 6, row: 6 } } },
  ourDecision: { nameCell: 'G7', sign: { tl: { col: 6, row: 3 }, br: { col: 8, row: 6 } } },
  ourFinal: { nameCell: 'I7', sign: { tl: { col: 8, row: 3 }, br: { col: 10, row: 6 } } },
  customerDraft: { nameCell: 'V7', sign: { tl: { col: 21, row: 3 }, br: { col: 23, row: 6 } } },
  customerReview: { nameCell: 'X7', sign: { tl: { col: 23, row: 3 }, br: { col: 25, row: 6 } } },
  customerDecision: { nameCell: 'Z7', sign: { tl: { col: 25, row: 3 }, br: { col: 27, row: 6 } } },
  customerFinal: { nameCell: 'AB7', sign: { tl: { col: 27, row: 3 }, br: { col: 30, row: 6 } } },
}

function boxSize(form: ExcelJS.Worksheet, box: { tl: { col: number; row: number }; br: { col: number; row: number } }) {
  let width = 0
  let height = 0
  for (let column = box.tl.col; column < box.br.col; column += 1) width += columnPx(form.getColumn(column + 1).width || 8)
  for (let row = box.tl.row; row < box.br.row; row += 1) height += rowPx(form.getRow(row + 1).height || 15)
  return { width, height }
}

async function placeStamp(book: ExcelJS.Workbook, form: ExcelJS.Worksheet, buffer: Buffer, box: { tl: { col: number; row: number }; br: { col: number; row: number } }) {
  const size = boxSize(form, box)
  const fitted = await signatureForBox(buffer, size.width, size.height)
  if (!fitted) return
  const id = book.addImage({ buffer: fitted as ExcelJS.Buffer, extension: 'png' })
  form.addImage(id, { tl: box.tl, br: box.br, editAs: 'oneCell' })
}

export async function buildChangeRequestWorkbook(row: ChangeRequest, files: ChangeRequestFile[] = []) {
  const book = new ExcelJS.Workbook()
  await book.xlsx.readFile(TEMPLATE)
  const form = book.getWorksheet('변경점신고서')
  if (!form) throw new Error('변경요청서 양식을 찾지 못했습니다.')
  const list = book.getWorksheet('Sheet1')

  writeBody(form.getCell('Z1'), row.docNo)
  if (row.customerName) writeBody(form.getCell('U3'), row.customerName)

  const stampImages = new Map<string, Buffer>()
  const loadSign = async (id: string) => {
    if (stampImages.has(id)) return
    const image = await readUserSignature(id).catch(() => null)
    if (image) stampImages.set(id, image)
  }

  const signKeysForSide = (side: 'our' | 'customer'): StampKey[] => {
    const jeongyeol = side === 'our' ? row.ourJeongyeol : row.customerJeongyeol
    const prefix = side === 'our' ? 'our' : 'customer'
    if (jeongyeol) return [`${prefix}Draft` as StampKey, `${prefix}Final` as StampKey]
    return [`${prefix}Draft` as StampKey, `${prefix}Review` as StampKey, `${prefix}Decision` as StampKey]
  }

  const nameEntries: [StampKey, string][] = [
    ['ourDraft', row.ourDraft],
    ['ourReview', row.ourReview],
    ['ourDecision', row.ourDecision],
    ['ourFinal', row.ourFinal],
    ['customerDraft', row.customerDraft],
    ['customerReview', row.customerReview],
    ['customerDecision', row.customerDecision],
    ['customerFinal', row.customerFinal],
  ]
  for (const [key, value] of nameEntries) {
    if (value) writeBody(form.getCell(STAMP_LAYOUT[key].nameCell), value)
  }

  for (const key of [...signKeysForSide('our'), ...signKeysForSide('customer')]) {
    const id = row.signs?.[key]
    if (id) await loadSign(id)
  }

  for (const key of [...signKeysForSide('our'), ...signKeysForSide('customer')]) {
    const image = stampImages.get(row.signs?.[key] || '')
    if (image) await placeStamp(book, form, image, STAMP_LAYOUT[key].sign)
  }
  writeBody(form.getCell('F9'), row.title)
  form.getCell('F10').value = ` 업체명: ${row.company}     품질 담당: ${row.qualityOwner}      연락처: ${row.phone}`
  form.getCell('F11').value = markBoxes(cellText(form.getCell('F11').value), REASON_OPTIONS, row.reasons).replace(/ {2,}/g, ' ')
  writeBody(form.getCell('F12'), row.reason, 10)
  form.getCell('F13').value = markBoxes(cellText(form.getCell('F13').value), TARGET_OPTIONS, row.targets)
  form.getCell('F14').value = markBoxes(cellText(form.getCell('F14').value), CONTENT_OPTIONS, row.contents)
  form.getCell('F15').value = markBoxes(cellText(form.getCell('F15').value), CONTENT_OPTIONS, row.contents)
  form.getCell('F17').value = markSubmissions(cellText(form.getCell('F17').value), row)
  form.getCell('F18').value = row.product
  form.getCell('T18').value = formatDotDate(row.applyDate, '')
  form.getCell('F19').value = row.applyTarget
  form.getCell('T19').value = row.changeMethod
  form.getCell('F20').value = row.owner
  form.getCell('T20').value = markBoxes(cellText(form.getCell('T20').value), HANDLING_OPTIONS, row.handling)
  form.getCell('T21').value = markBoxes(cellText(form.getCell('T21').value), HANDLING_OPTIONS, row.handling)
  form.getCell('A23').value = row.before
  form.getCell('O23').value = row.after
  form.getCell('A23').alignment = { ...form.getCell('A23').alignment, vertical: 'top', wrapText: true }
  form.getCell('O23').alignment = { ...form.getCell('O23').alignment, vertical: 'top', wrapText: true }
  await placeImages(book, form, files.filter((file) => file.side === 'before'), { col: 0.2, colEnd: 13.8, row: imageTop(row.before, 18) })
  await placeImages(book, form, files.filter((file) => file.side === 'after'), { col: 14.2, colEnd: 29.8, row: imageTop(row.after, 22) })

  if (list) book.removeWorksheet(list.id)

  const buffer = Buffer.from(await book.xlsx.writeBuffer())
  const extras: ChangeRequestFile[] = []
  for (const file of files) {
    if (!(await embeddableImage(file))) extras.push(file)
  }
  return { buffer, extras }
}

export async function renderChangeRequestDownload(row: ChangeRequest, files: ChangeRequestFile[] = []) {
  const { buffer, extras } = await buildChangeRequestWorkbook(row, files)
  const date = new Date().toISOString().slice(0, 10)
  const xlsxName = `4M_변경요청서_${date}.xlsx`
  if (!extras.length) {
    return {
      buffer,
      filename: xlsxName,
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }
  }
  const zip = new JSZip()
  zip.file(xlsxName, buffer)
  for (const file of extras) {
    const folder = file.side === 'before' ? '첨부/변경전' : '첨부/변경후'
    const safeName = file.name.replace(/[\\/]/g, '_').slice(0, 80)
    zip.file(`${folder}/${safeName}`, file.data)
  }
  return {
    buffer: await zip.generateAsync({ type: 'nodebuffer' }),
    filename: `4M_변경요청서_${date}.zip`,
    type: 'application/zip',
  }
}
