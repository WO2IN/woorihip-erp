export const SUITABILITY_STAMPS_KEY = 'suitability-stamps'

export const SUITABILITY_STAMP_STEPS = ['작성', '검토', '승인'] as const
export type SuitabilityStampStep = (typeof SUITABILITY_STAMP_STEPS)[number]

export type SuitabilityStampEntry = {
  signs: Partial<Record<SuitabilityStampStep, string>>
  names: Partial<Record<SuitabilityStampStep, string>>
}

export type SuitabilityStampBook = Record<string, SuitabilityStampEntry>

function clip(value: unknown, max: number) {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

export function readStampBook(value: unknown): SuitabilityStampBook {
  if (!value || typeof value !== 'object') return {}
  const book: SuitabilityStampBook = {}
  for (const [personId, entry] of Object.entries(value as Record<string, unknown>)) {
    const id = personId.trim().slice(0, 80)
    if (!id || !entry || typeof entry !== 'object') continue
    const source = entry as { signs?: unknown; names?: unknown }
    const signs: SuitabilityStampEntry['signs'] = {}
    const names: SuitabilityStampEntry['names'] = {}
    const signSource = source.signs && typeof source.signs === 'object' ? source.signs as Record<string, unknown> : {}
    const nameSource = source.names && typeof source.names === 'object' ? source.names as Record<string, unknown> : {}
    for (const step of SUITABILITY_STAMP_STEPS) {
      const userId = clip(signSource[step], 80)
      const name = clip(nameSource[step], 40)
      if (userId) signs[step] = userId
      if (name) names[step] = name
    }
    if (Object.keys(signs).length || Object.keys(names).length) book[id] = { signs, names }
  }
  return book
}

export function emptyStampEntry(): SuitabilityStampEntry {
  return { signs: {}, names: {} }
}
