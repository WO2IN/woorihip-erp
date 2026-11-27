/** 층별 생산 라인. no 는 바코드 번호에 들어가는 라인 번호(1자리)다. */
export type ProductionLine = { no: number; label: string }

export const PRODUCTION_LINES: Record<1 | 2 | 3, ProductionLine[]> = {
  1: [
    { no: 1, label: '1·2' },
    { no: 2, label: '3·4' },
    { no: 3, label: '5·6' },
    { no: 4, label: '7·8' },
    { no: 5, label: '9·10' },
    { no: 6, label: '11·12' },
    { no: 7, label: '13·14' },
  ],
  2: [
    { no: 1, label: '1·2' },
    { no: 2, label: '3·4' },
    { no: 3, label: '5·6' },
    { no: 4, label: '7·8' },
    { no: 5, label: '9·10' },
    { no: 6, label: '11·12' },
  ],
  3: [
    { no: 1, label: '바렐' },
    { no: 2, label: '랙' },
  ],
}

export function linesOf(floor: number): ProductionLine[] {
  return PRODUCTION_LINES[floor as 1 | 2 | 3] ?? []
}

/** 화면 표시용 이름. 예: '1·2 라인', '바렐' */
export function lineName(floor: number, no: number | undefined): string {
  const line = linesOf(floor).find((item) => item.no === no)
  if (!line) return ''
  return floor === 3 ? line.label : `${line.label} 라인`
}
