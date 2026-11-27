/**
 * 품목(규격) 이름은 숫자 사이 곱하기를 '*'로 통일한다. 예) 0.15x91, 0.15 X 91, 0.15×91 → 0.15*91
 * 숫자 사이가 아닌 x(예: BUSBAR MAX)는 그대로 둔다.
 */
export function normalizeProductName(value: string): string {
  return value.trim().replace(/(\d)\s*[xX×]\s*(?=\d)/g, '$1*')
}

/** 검색용 글자. x·X·×·* 를 같은 글자로 보고, 대소문자를 가리지 않는다. */
export function searchText(value: string): string {
  return value.toLowerCase().replace(/[x×*]/g, '*')
}
