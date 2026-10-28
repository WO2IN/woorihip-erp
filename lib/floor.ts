export const FLOOR_OPTIONS = [
  { value: '1', label: '1층' },
  { value: '2', label: '2층' },
  { value: '3', label: '3층' },
] as const

const KNOWN_FLOORS = FLOOR_OPTIONS.map((option) => option.value)

function extractFloorNumber(value?: string | null): string | null {
  if (!value) return null
  const text = value.normalize('NFKC').trim()
  if (!text) return null

  const withSuffix = text.match(/(\d+)\s*층/)
  if (withSuffix) return withSuffix[1]

  const onlyNumber = text.match(/^(\d+)$/)
  if (onlyNumber) return onlyNumber[1]

  return null
}

export function detectFloor(floor?: string | null, name?: string | null): string {
  return extractFloorNumber(floor) ?? extractFloorNumber(name) ?? '미지정'
}

export function formatFloorLabel(floor?: string | null, name?: string | null): string {
  const key = detectFloor(floor, name)
  return key === '미지정' ? '층 미지정' : `${key}층`
}

export function canonicalFloor(floor?: string | null, name?: string | null): string | null {
  const key = detectFloor(floor, name)
  return key === '미지정' ? null : key
}

export function toFloorSelectValue(floor?: string | null, name?: string | null): string {
  return canonicalFloor(floor, name) ?? ''
}

export function groupByFloor<T extends { floor?: string | null; name?: string | null }>(items: T[]) {
  const floors = new Map<string, T[]>()
  for (const item of items) {
    const key = detectFloor(item.floor, item.name)
    const list = floors.get(key) ?? []
    list.push(item)
    floors.set(key, list)
  }

  const extras = [...floors.keys()]
    .filter((key) => key !== '미지정' && !KNOWN_FLOORS.includes(key as (typeof KNOWN_FLOORS)[number]))
    .sort((a, b) => Number(a) - Number(b))

  const keys = [...KNOWN_FLOORS, ...extras]
  if (floors.has('미지정')) keys.push('미지정')

  return keys.map((floor) => [floor, floors.get(floor) ?? []] as const)
}
