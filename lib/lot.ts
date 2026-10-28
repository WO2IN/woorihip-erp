/** LOT 번호 앞뒤 공백 제거 */
export function normalizeLot(value?: string): string {
  return value?.trim() ?? ''
}

/** 등록 시 입력한 LOT 번호를 원문 형식 그대로 저장합니다. */
export function normalizeRegisteredLot(value?: string): string {
  return value?.trim() ?? ''
}

/** 발행일을 yyyy-MM-dd로 변환하고 실제 달력 날짜인지 검증 */
export function normalizeIssueDate(value?: string): string {
  const raw = value?.trim() ?? ''
  if (!raw) return ''

  let match = raw.match(/^(\d{4})[-./](\d{1,2})[-./](\d{1,2})$/)
  if (!match) match = raw.match(/^(\d{8})$/) ? [raw, raw.slice(0, 4), raw.slice(4, 6), raw.slice(6, 8)] : null
  if (!match) {
    const short = raw.match(/^(\d{2})[-./]?(\d{2})[-./]?(\d{2})$/)
    if (short) match = [raw, `20${short[1]}`, short[2], short[3]]
  }
  if (!match) throw new Error('발행일은 260910 또는 2026-09-10 형식으로 입력해주세요.')

  const [, year, month, day] = match
  const candidate = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)))
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== candidate) {
    throw new Error('존재하지 않는 발행일입니다.')
  }
  return candidate
}

/** 표시용 발행일 입력값을 yyyyMMdd로 반환 */
export function formatIssueDateInput(value?: string): string {
  const normalized = normalizeIssueDate(value)
  return normalized.replace(/-/g, '')
}

/** LOT 번호 앞뒤 공백 제거 */
/** 시작 LOT 기준으로 종료 순번을 전체 LOT 형식으로 조합 */
export function buildLotEnd(start: string, endSuffix: string): string {
  if (!start || !endSuffix) return ''

  const prefix = start.split('-')[0]
  const suffix = endSuffix.includes('-')
    ? endSuffix.trim().split('-').pop() ?? endSuffix.trim()
    : endSuffix.trim()

  return `${prefix}-${suffix}`
}
