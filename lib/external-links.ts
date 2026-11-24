export const EXTERNAL_LINKS_COLLECTION = 'external_links'
export const EXTERNAL_LINK_TITLE_MAX = 20
export const EXTERNAL_LINK_MAX = 30

export interface ExternalLink {
  id: string
  title: string
  url: string
  createdAt: string
  createdBy: string
}

/** http/https 주소만 받는다. 스킴이 없으면 https 를 붙이고, 잘못된 주소는 null. */
export function normalizeExternalUrl(value: unknown): string | null {
  const raw = typeof value === 'string' ? value.trim() : ''
  if (!raw) return null
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`
  try {
    const url = new URL(withScheme)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    if (!url.hostname.includes('.')) return null
    return url.toString()
  } catch {
    return null
  }
}
