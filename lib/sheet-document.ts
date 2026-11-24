'use client'

import { toCanvas } from 'html-to-image'
import { getAuthHeaders } from '@/lib/auth-client'
import { notifyDataChanged } from '@/lib/data-events'
import {
  CERTIFICATE_TYPE,
  INCOMING_INSPECTION_TYPE,
  LOT_CARD_TYPE,
  documentTypeLabel,
} from '@/lib/file-types'

/** 재고 관리 화면 3종 — 저장값(documentType) 기준 */
export type SheetDocumentKind = typeof INCOMING_INSPECTION_TYPE | typeof LOT_CARD_TYPE | typeof CERTIFICATE_TYPE

export interface SheetDocumentInput {
  /** 화면에 그려진 서식(<article>) */
  node: HTMLElement
  documentType: SheetDocumentKind
  /** 서식 한 장의 id. 같은 id를 다시 저장하면 문서탐색기의 문서를 교체한다. */
  sourceSheetId: string
  company: string
  product: string
  lotStart?: string
  material?: string
  specification?: string
  issueDate?: string
  floor?: string
}

export type SheetDocumentResult = { ok: true } | { ok: false; error: string }

// A4 (pt)
const PAGE_W = 595.28
const PAGE_H = 841.89
const SHEET_WIDTH_MM = 210
const PIXEL_RATIO = 2.5
/** 이력카드는 인쇄 여백(@page lot-card)이 5mm다. 나머지 서식은 여백 없이 용지 전체를 쓴다. */
const LOT_CARD_PAGE_MARGIN_MM = 5

function nextFrame() {
  return new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
}

/** 입력칸의 현재 값은 속성이 아니라 프로퍼티라 복제하면 사라진다. 복제본에 속성으로 옮겨 둔다. */
function copyFormValues(source: HTMLElement, copy: HTMLElement) {
  const from = source.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>('input, textarea, select')
  const to = copy.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>('input, textarea, select')
  from.forEach((field, index) => {
    const target = to[index]
    if (!target) return
    if (field instanceof HTMLInputElement && target instanceof HTMLInputElement) {
      if (field.type === 'checkbox' || field.type === 'radio') {
        if (field.checked) target.setAttribute('checked', '')
        else target.removeAttribute('checked')
      } else {
        target.setAttribute('value', field.value)
        target.value = field.value
      }
    } else if (field instanceof HTMLTextAreaElement && target instanceof HTMLTextAreaElement) {
      target.textContent = field.value
      target.value = field.value
    } else if (field instanceof HTMLSelectElement && target instanceof HTMLSelectElement) {
      Array.from(target.options).forEach((option, optionIndex) => {
        if (optionIndex === field.selectedIndex) option.setAttribute('selected', '')
        else option.removeAttribute('selected')
      })
      target.selectedIndex = field.selectedIndex
    }
  })
}

const HOST_CLASS = 'sheet-capture-host'
const PRINT_MEDIA = /(^|[\s,(])print([\s,)]|$)/

function isPrintMedia(mediaText: string) {
  return PRINT_MEDIA.test(mediaText) && !/\bnot\s+print\b/.test(mediaText)
}

/**
 * 인쇄할 때만 적용되는 스타일(@media print)을 모아, 복사본(.sheet-capture-host) 안에서만 항상 적용되는 CSS로 바꾼다.
 * 그러면 저장된 PDF가 화면 미리보기가 아니라 '인쇄했을 때' 모양(판정 표시, 글자 크기, 입력칸 테두리 등)으로 나온다.
 * `body.xxx-print ...` 로 시작하는 선택자는 복사본 자신(&)으로 바꾼다.
 */
function printStyleText() {
  const rules: string[] = []
  const walk = (list: CSSRuleList, inPrint: boolean) => {
    for (const rule of Array.from(list)) {
      if (rule instanceof CSSMediaRule) {
        walk(rule.cssRules, inPrint || isPrintMedia(rule.media.mediaText))
      } else if (rule instanceof CSSStyleRule) {
        if (!inPrint) continue
        const selector = rule.selectorText.replace(/(^|,\s*)body\.[\w-]+/g, '$1&')
        const body = rule.cssText.slice(rule.cssText.indexOf('{'))
        rules.push(`${selector}${body}`)
      } else if ('cssRules' in rule) {
        // @layer, @supports 처럼 안에 규칙을 담은 묶음
        walk((rule as CSSGroupingRule).cssRules, inPrint)
      }
    }
  }
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      walk(sheet.cssRules, false)
    } catch {
      // 다른 출처의 스타일시트는 읽을 수 없어 건너뛴다.
    }
  }
  return `.${HOST_CLASS}{${rules.join('\n')}}`
}

/**
 * 화면의 서식을 A4 용지 크기로 펼친 복사본을 화면 밖에 두고 그림으로 만든다.
 * 미리보기 배율(zoom)이나 창 크기와 상관없이 늘 같은 모양으로 저장된다.
 */
async function renderSheetCanvas(node: HTMLElement, pageMarginMm: number) {
  const host = document.createElement('div')
  host.className = HOST_CLASS
  host.setAttribute('aria-hidden', 'true')
  host.style.cssText = `position:fixed;left:-10000px;top:0;width:${SHEET_WIDTH_MM}mm;box-sizing:border-box;padding:${pageMarginMm}mm;background:#fff;pointer-events:none;z-index:-1;`
  const style = document.createElement('style')
  style.textContent = printStyleText()
  const copy = node.cloneNode(true) as HTMLElement
  copy.removeAttribute('inert')
  const innerWidth = `${SHEET_WIDTH_MM - pageMarginMm * 2}mm`
  copy.style.width = innerWidth
  copy.style.maxWidth = innerWidth
  copy.style.minWidth = '0'
  copy.style.zoom = '1'
  copy.style.margin = '0 auto'
  copy.style.boxShadow = 'none'
  copy.style.outline = 'none'
  copy.style.flex = 'none'
  host.append(style, copy)
  document.body.appendChild(host)
  try {
    copyFormValues(node, copy)
    if (document.fonts?.ready) await document.fonts.ready
    await nextFrame()
    await nextFrame()
    return await toCanvas(host, {
      pixelRatio: PIXEL_RATIO,
      backgroundColor: '#ffffff',
      // 복사본이 화면 밖(left:-10000px)에 있어도 그림에는 제자리에 그려지도록
      style: { position: 'static', left: 'auto', top: 'auto' },
    })
  } finally {
    host.remove()
  }
}

function canvasToJpeg(canvas: HTMLCanvasElement) {
  return new Promise<Uint8Array>((resolve, reject) => {
    canvas.toBlob(async (blob) => {
      if (!blob) {
        reject(new Error('서식을 그림으로 만들지 못했습니다.'))
        return
      }
      resolve(new Uint8Array(await blob.arrayBuffer()))
    }, 'image/jpeg', 0.92)
  })
}

/** JPEG 한 장을 A4 한 쪽짜리 PDF로 감싼다. (JPEG는 PDF가 그대로 읽을 수 있어 라이브러리 없이 만든다.) */
function jpegToPdf(jpeg: Uint8Array, pixelWidth: number, pixelHeight: number) {
  let width = PAGE_W
  let height = (pixelHeight / pixelWidth) * PAGE_W
  if (height > PAGE_H) {
    height = PAGE_H
    width = (pixelWidth / pixelHeight) * PAGE_H
  }
  const x = (PAGE_W - width) / 2
  const y = PAGE_H - height
  const encoder = new TextEncoder()
  const text = (value: string) => encoder.encode(value)
  const content = `q ${width.toFixed(2)} 0 0 ${height.toFixed(2)} ${x.toFixed(2)} ${y.toFixed(2)} cm /Im0 Do Q`

  const chunks: Uint8Array[] = []
  const offsets: number[] = []
  let length = 0
  const push = (chunk: Uint8Array) => {
    chunks.push(chunk)
    length += chunk.length
  }
  const object = (id: number, head: string, body?: Uint8Array, tail = '') => {
    offsets[id] = length
    push(text(`${id} 0 obj\n${head}`))
    if (body) {
      push(text('\nstream\n'))
      push(body)
      push(text('\nendstream'))
    }
    push(text(`${tail}\nendobj\n`))
  }

  push(text('%PDF-1.4\n'))
  object(1, '<< /Type /Catalog /Pages 2 0 R >>')
  object(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>')
  object(3, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`)
  object(4, `<< /Type /XObject /Subtype /Image /Width ${pixelWidth} /Height ${pixelHeight} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>`, jpeg)
  object(5, `<< /Length ${content.length} >>`, text(content))

  const xref = length
  let table = `xref\n0 6\n0000000000 65535 f \n`
  for (let id = 1; id <= 5; id += 1) table += `${String(offsets[id]).padStart(10, '0')} 00000 n \n`
  push(text(`${table}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`))

  const out = new Uint8Array(length)
  let at = 0
  for (const chunk of chunks) {
    out.set(chunk, at)
    at += chunk.length
  }
  return out
}

function safeName(value: string) {
  return value.replace(/[\\/:*?"<>|\r\n]/g, '_').replace(/\*/g, 'x').replace(/\s+/g, '_').trim()
}

function fileNameFor(input: SheetDocumentInput) {
  const date = (input.issueDate || '').replace(/[^0-9]/g, '').slice(0, 8)
  const parts = [documentTypeLabel(input.documentType), input.company, input.product, input.lotStart, date]
  return `${parts.map((part) => safeName(part ?? '')).filter(Boolean).join('_')}.pdf`
}

async function readError(response: Response, fallback: string) {
  const body = await response.json().catch(() => null)
  return typeof body?.error === 'string' ? body.error : fallback
}

/**
 * 재고 관리 서식(수입검사성적서·이력카드·출하성적서)을 PDF로 만들어 문서탐색기에 저장한다.
 * 같은 서식(sourceSheetId)을 다시 저장하면 앞서 저장한 문서를 교체한다.
 */
export async function saveSheetDocument(input: SheetDocumentInput): Promise<SheetDocumentResult> {
  const label = documentTypeLabel(input.documentType)
  if (!input.company.trim()) return { ok: false, error: `업체명이 없어 ${label}를 문서탐색기에 저장하지 못했습니다.` }
  try {
    const canvas = await renderSheetCanvas(input.node, input.documentType === LOT_CARD_TYPE ? LOT_CARD_PAGE_MARGIN_MM : 0)
    const jpeg = await canvasToJpeg(canvas)
    const pdf = jpegToPdf(jpeg, canvas.width, canvas.height)
    const name = fileNameFor(input)

    const formData = new FormData()
    formData.append('file', new File([pdf as BlobPart], name, { type: 'application/pdf' }))
    formData.append('company', input.company.trim())
    formData.append('documentType', input.documentType)
    formData.append('sourceSheetId', input.sourceSheetId)
    if (input.product.trim()) formData.append('product', input.product.trim())
    if (input.lotStart?.trim()) formData.append('lotStart', input.lotStart.trim())
    if (input.material?.trim()) formData.append('material', input.material.trim())
    if (input.specification?.trim()) formData.append('specification', input.specification.trim())
    if (input.issueDate?.trim()) formData.append('issueDate', input.issueDate.trim())
    if (input.floor) formData.append('shipmentFloor', input.floor)

    const response = await fetch('/api/upload', { method: 'POST', headers: getAuthHeaders(), body: formData })
    if (!response.ok) return { ok: false, error: await readError(response, `${label}를 문서탐색기에 저장하지 못했습니다.`) }
    notifyDataChanged('documents')
    notifyDataChanged('config')
    return { ok: true }
  } catch (error) {
    console.error('서식 PDF 저장 실패:', error)
    return { ok: false, error: `${label}를 문서탐색기에 저장하지 못했습니다.` }
  }
}

/** '완료 취소'할 때 문서탐색기에 자동 저장했던 문서를 치운다. */
export async function removeSheetDocument(documentType: SheetDocumentKind, sourceSheetId: string): Promise<SheetDocumentResult> {
  try {
    const params = new URLSearchParams({ documentType, sourceSheetId })
    const response = await fetch(`/api/upload?${params}`, { method: 'DELETE', headers: getAuthHeaders() })
    if (!response.ok) return { ok: false, error: await readError(response, '문서탐색기의 문서를 지우지 못했습니다.') }
    notifyDataChanged('documents')
    return { ok: true }
  } catch (error) {
    console.error('서식 PDF 삭제 실패:', error)
    return { ok: false, error: '문서탐색기의 문서를 지우지 못했습니다.' }
  }
}
