import { NAV } from './nav'

export const NAV_SECTION_IDS = NAV.map((section) => section.id)

const KNOWN = new Set<string>(NAV_SECTION_IDS)

export function normalizeNavOrder(order: readonly string[] | null | undefined): string[] {
  const next: string[] = []
  for (const id of order ?? []) {
    if (KNOWN.has(id) && !next.includes(id)) next.push(id)
  }
  for (const id of NAV_SECTION_IDS) {
    if (!next.includes(id)) next.push(id)
  }
  return next
}

export function applyNavOrder<T extends { id: string }>(sections: T[], order: readonly string[] | null | undefined): T[] {
  const rank = new Map(normalizeNavOrder(order).map((id, index) => [id, index]))
  return [...sections].sort((a, b) => (rank.get(a.id) ?? 999) - (rank.get(b.id) ?? 999))
}

/** 화면에 보이는 메뉴의 새 순서를 전체 순서에 반영한다. 권한 때문에 숨은 메뉴는 제자리에 둔다. */
export function mergeVisibleOrder(order: readonly string[] | null | undefined, visibleOrder: string[]) {
  const full = normalizeNavOrder(order)
  const visible = new Set(visibleOrder)
  let cursor = 0
  return full.map((id) => (visible.has(id) ? visibleOrder[cursor++] : id))
}

export function isDefaultNavOrder(order: readonly string[] | null | undefined) {
  return normalizeNavOrder(order).every((id, index) => id === NAV_SECTION_IDS[index])
}
