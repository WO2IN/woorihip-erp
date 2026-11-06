export const JOB_TITLES = [
  '사원',
  '주임',
  '대리',
  '과장',
  '차장',
  '부장',
  '상무',
  '대표',
  '사장',
] as const

/** 드롭다운 표시 순 (사장 → 사원) */
export const JOB_TITLES_MENU = [...JOB_TITLES].reverse()

/** 목록·선택 UI에 왕관 표시 */
export const CROWN_JOB_TITLES = new Set<string>(['사장', '대표', '상무'])

export function jobTitleHasCrown(title: string | null | undefined): boolean {
  const trimmed = title?.trim()
  return Boolean(trimmed && CROWN_JOB_TITLES.has(trimmed))
}

export type JobTitle = (typeof JOB_TITLES)[number]

export function parseJobTitle(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null
  const trimmed = String(value).trim()
  if (!trimmed || trimmed === 'none') return null
  return (JOB_TITLES as readonly string[]).includes(trimmed) ? trimmed : null
}

export function isAllowedJobTitle(value: unknown): boolean {
  if (value === null || value === undefined || value === '' || value === 'none') return true
  return (JOB_TITLES as readonly string[]).includes(String(value).trim())
}
