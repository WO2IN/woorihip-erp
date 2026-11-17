export const RICH_TEXT_HTML_MAX = 2_500_000
export const RICH_TEXT_PLAIN_MAX = 6000
export const RICH_IMAGE_DATA_MAX = 400_000
export const RICH_IMAGE_COUNT_MAX = 8

const ALLOWED = new Set(['a', 'b', 'strong', 'i', 'em', 'u', 's', 'strike', 'span', 'p', 'div', 'br', 'ul', 'ol', 'li', 'font', 'img', 'hr', 'table', 'tbody', 'thead', 'tr', 'td', 'th', 'sub', 'sup', 'blockquote'])
const DROP = ['script', 'style', 'iframe', 'object', 'embed', 'svg', 'math', 'link', 'meta', 'form', 'input', 'button', 'textarea', 'select', 'option', 'video', 'audio', 'canvas', 'noscript']
const VOID = new Set(['br', 'img', 'hr'])
const FONTS = new Set(['Nanum Gothic', 'Malgun Gothic', 'Gulim', 'Dotum', 'Batang', 'Arial', '나눔고딕', '맑은 고딕', '굴림', '돋움', '바탕'])

function safeColor(value: string) {
  const color = value.trim()
  if (/^#[0-9a-fA-F]{3,8}$/.test(color)) return color
  if (/^rgb\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*\)$/.test(color)) return color.replace(/\s+/g, '')
  return null
}

function safeStyle(raw: string) {
  const kept: string[] = []
  for (const part of raw.split(';')) {
    const index = part.indexOf(':')
    if (index < 0) continue
    const prop = part.slice(0, index).trim().toLowerCase()
    const value = part.slice(index + 1).trim()
    if (/url\(|expression|javascript|@import/i.test(value)) continue
    let next: string | null = null
    if (prop === 'color' || prop === 'background-color') next = safeColor(value)
    else if (prop === 'font-size') {
      const match = /^(\d{1,2}(?:\.\d)?)(pt|px)$/.exec(value)
      if (match) {
        const size = Number(match[1])
        if ((match[2] === 'pt' && size >= 8 && size <= 36) || (match[2] === 'px' && size >= 10 && size <= 48)) next = `${size}${match[2]}`
      }
    } else if (prop === 'font-family') {
      const name = value.replace(/["']/g, '').split(',')[0]?.trim() ?? ''
      if (FONTS.has(name)) next = name
    } else if (prop === 'text-align' && ['left', 'center', 'right', 'justify', 'start', 'end'].includes(value)) next = value === 'start' ? 'left' : value === 'end' ? 'right' : value
    else if ((prop === 'text-decoration' || prop === 'text-decoration-line') && ['underline', 'line-through', 'none'].includes(value)) next = value
    else if (prop === 'font-weight' && ['bold', 'normal', '700', '400'].includes(value)) next = value
    else if (prop === 'font-style' && ['italic', 'normal'].includes(value)) next = value
    else if (prop === 'margin-left') {
      const match = /^(\d{1,3})px$/.exec(value)
      if (match && Number(match[1]) <= 240) next = `${match[1]}px`
    } else if (prop === 'border-collapse' && value === 'collapse') next = value
    else if (prop === 'width' && (value === '100%' || /^\d{1,4}px$/.test(value))) next = value
    else if (prop === 'max-width' && value === '100%') next = value
    else if (prop === 'height' && /^\d{1,4}px$/.test(value)) next = value
    else if (prop === 'padding' && /^\d{1,2}px$/.test(value)) next = value
    else if (prop === 'border' && /^1px solid #[0-9a-fA-F]{3,8}$/.test(value)) next = value
    if (next == null) continue
    if (prop === 'text-decoration-line') kept.push(`text-decoration: ${next}`)
    else kept.push(`${prop}: ${next}`)
  }
  return kept.join('; ')
}

function safeSrc(src: string) {
  if (/^data:image\/(jpeg|png|gif|webp);base64,[a-z0-9+/=]+$/i.test(src) && src.length <= RICH_IMAGE_DATA_MAX) return src
  return null
}

function safeHref(href: string) {
  const value = href.trim()
  if (/^https?:\/\/[^\s"'<>]+$/i.test(value) && value.length < 500) return value
  return null
}

function parseAttrs(raw: string) {
  const out: Record<string, string> = {}
  const re = /([a-zA-Z:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g
  let match: RegExpExecArray | null
  while ((match = re.exec(raw))) out[match[1].toLowerCase()] = match[2] ?? match[3] ?? match[4] ?? ''
  return out
}

function cleanAttrs(tag: string, raw: string) {
  const attrs = parseAttrs(raw)
  const kept: string[] = []
  const style = attrs.style ? safeStyle(attrs.style) : ''
  if (style) kept.push(`style="${style}"`)
  if (tag === 'a') {
    const href = attrs.href ? safeHref(attrs.href) : null
    if (href) kept.push(`href="${href}"`)
  }
  if (tag === 'img') {
    const src = attrs.src ? safeSrc(attrs.src) : null
    if (!src) return null
    let imgStyle = style
    if (!/(^|;)\s*width\s*:/.test(imgStyle) && attrs.width && /^\d{2,4}$/.test(attrs.width)) {
      imgStyle = imgStyle ? `${imgStyle}; width: ${attrs.width}px` : `width: ${attrs.width}px`
    }
    const imageAttrs = [`src="${src}"`, 'alt=""']
    if (imgStyle) imageAttrs.unshift(`style="${imgStyle}"`)
    return ` ${imageAttrs.join(' ')}`
  }
  if (tag === 'font') {
    const color = attrs.color ? safeColor(attrs.color) : null
    if (color) kept.push(`color="${color}"`)
    const face = (attrs.face ?? '').replace(/["']/g, '').trim()
    if (FONTS.has(face)) kept.push(`face="${face}"`)
  }
  if ((tag === 'td' || tag === 'th') && attrs.colspan && /^[1-8]$/.test(attrs.colspan)) kept.push(`colspan="${attrs.colspan}"`)
  if ((tag === 'td' || tag === 'th') && attrs.rowspan && /^[1-8]$/.test(attrs.rowspan)) kept.push(`rowspan="${attrs.rowspan}"`)
  return kept.length ? ` ${kept.join(' ')}` : ''
}

export function sanitizeRichText(input: string) {
  let source = input.replace(/<!--[\s\S]*?-->/g, '')
  for (const tag of DROP) {
    source = source.replace(new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}>`, 'gi'), '')
    source = source.replace(new RegExp(`<${tag}\\b[^>]*\\/?>`, 'gi'), '')
  }
  return source.replace(/<\/?([a-zA-Z0-9]+)([^>]*)>/g, (full, name: string, attrs: string) => {
    const tag = name.toLowerCase()
    if (!ALLOWED.has(tag)) return ''
    if (full.startsWith('</')) return VOID.has(tag) ? '' : `</${tag}>`
    const clean = cleanAttrs(tag, attrs)
    if (clean == null) return ''
    if (VOID.has(tag)) return `<${tag}${clean}>`
    return `<${tag}${clean}>`
  })
}

export function richTextPlain(input: string) {
  return sanitizeRichText(input)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|tr|h\d|blockquote)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#39;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export function richTextIsEmpty(input: string) {
  return richTextPlain(input).length === 0
}
