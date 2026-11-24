import { code128Modules } from '@/lib/code128'

export interface BarcodeLabel {
  barcode: string
  partner?: string
  product?: string
  lotNo?: string
  spec?: string
  date?: string
}

export const LABEL_SIZES = [
  { id: '100x50', label: '100 × 50mm', width: 100, height: 50 },
  { id: '80x40', label: '80 × 40mm', width: 80, height: 40 },
  { id: '60x30', label: '60 × 30mm', width: 60, height: 30 },
] as const
export type LabelSizeId = (typeof LABEL_SIZES)[number]['id']

const escape = (value: string) =>
  value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] as string)

/** Code128 막대를 SVG 문자열로. 1모듈 = viewBox 1칸이라 어느 크기로 늘려도 비율이 유지된다. */
export function barcodeSvg(value: string) {
  const modules = code128Modules(value.trim())
  if (!modules) return null
  const quiet = 10
  const total = modules.reduce((sum, size) => sum + size, 0) + quiet * 2
  let x = quiet
  let draw = true
  const bars: string[] = []
  for (const size of modules) {
    if (draw) bars.push(`<rect x="${x}" width="${size}" height="1"/>`)
    x += size
    draw = !draw
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} 1" preserveAspectRatio="none" shape-rendering="crispEdges"><rect width="${total}" height="1" fill="#fff"/><g fill="#000">${bars.join('')}</g></svg>`
}

function labelHtml(label: BarcodeLabel, width: number, height: number) {
  const svg = barcodeSvg(label.barcode) ?? ''
  const title = [label.partner, label.product].filter(Boolean).join(' · ')
  const meta = [label.lotNo && `LOT ${label.lotNo}`, label.spec, label.date].filter(Boolean).join('   ')
  const base = height / 50
  return `<section class="label" style="width:${width}mm;height:${height}mm;padding:${(2.5 * base).toFixed(2)}mm ${(3 * base).toFixed(2)}mm">
  ${title ? `<p class="title" style="font-size:${(3.4 * base).toFixed(2)}mm">${escape(title)}</p>` : ''}
  <div class="bars">${svg}</div>
  <p class="code" style="font-size:${(3.6 * base).toFixed(2)}mm">${escape(label.barcode)}</p>
  ${meta ? `<p class="meta" style="font-size:${(2.6 * base).toFixed(2)}mm">${escape(meta)}</p>` : ''}
</section>`
}

/** 라벨 프린터용 인쇄. 페이지 크기를 라벨 크기로 잡고 매수만큼 페이지를 만든다. */
export function printBarcodeLabels(label: BarcodeLabel, sizeId: LabelSizeId, copies: number) {
  const size = LABEL_SIZES.find((item) => item.id === sizeId) ?? LABEL_SIZES[0]
  const count = Math.min(100, Math.max(1, Math.floor(copies) || 1))
  const body = Array.from({ length: count }, () => labelHtml(label, size.width, size.height)).join('\n')
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${escape(label.barcode)}</title>
<style>
  @page { size: ${size.width}mm ${size.height}mm; margin: 0; }
  * { box-sizing: border-box; margin: 0; }
  html, body { background: #fff; color: #000; font-family: 'Pretendard', 'Malgun Gothic', sans-serif; }
  .label { display: flex; flex-direction: column; justify-content: center; overflow: hidden; break-after: page; page-break-after: always; }
  .label:last-child { break-after: auto; page-break-after: auto; }
  .title { font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .bars { flex: 1; min-height: 0; margin: 1.2mm 0 0.6mm; }
  .bars svg { display: block; width: 100%; height: 100%; }
  .code { text-align: center; font-family: 'Consolas', 'Courier New', monospace; font-weight: 700; letter-spacing: 0.12em; }
  .meta { margin-top: 0.6mm; text-align: center; white-space: nowrap; overflow: hidden; }
</style></head><body>${body}</body></html>`

  const frame = document.createElement('iframe')
  frame.setAttribute('aria-hidden', 'true')
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden'
  document.body.appendChild(frame)
  const doc = frame.contentDocument
  if (!doc || !frame.contentWindow) {
    frame.remove()
    return
  }
  doc.open()
  doc.write(html)
  doc.close()
  const win = frame.contentWindow
  window.setTimeout(() => {
    win.focus()
    win.print()
    window.setTimeout(() => frame.remove(), 1000)
  }, 150)
}
