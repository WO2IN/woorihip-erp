// 한국어 초성 추출 유틸리티

const CHOSUNG = ['ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ']

// 겹자음 → 대표 단자음 매핑 (필터 버튼용)
const CHOSUNG_GROUP: Record<string, string[]> = {
  'ㄱ': ['ㄱ', 'ㄲ'],
  'ㄴ': ['ㄴ'],
  'ㄷ': ['ㄷ', 'ㄸ'],
  'ㄹ': ['ㄹ'],
  'ㅁ': ['ㅁ'],
  'ㅂ': ['ㅂ', 'ㅃ'],
  'ㅅ': ['ㅅ', 'ㅆ'],
  'ㅇ': ['ㅇ'],
  'ㅈ': ['ㅈ', 'ㅉ'],
  'ㅊ': ['ㅊ'],
  'ㅋ': ['ㅋ'],
  'ㅌ': ['ㅌ'],
  'ㅍ': ['ㅍ'],
  'ㅎ': ['ㅎ'],
}

/** 단자음 필터 버튼 목록 */
export const FILTER_CONSONANTS = Object.keys(CHOSUNG_GROUP)

/** 한 글자의 초성을 추출 (한글이 아니면 원문자 반환) */
export function getChosung(char: string): string {
  const code = char.charCodeAt(0)
  if (code >= 0xAC00 && code <= 0xD7A3) {
    return CHOSUNG[Math.floor((code - 0xAC00) / 28 / 21)]
  }
  return char
}

/** 문자열의 첫 글자 초성 반환 */
export function getFirstChosung(str: string): string {
  if (!str) return ''
  return getChosung(str[0])
}

/** 특정 단자음 필터에 해당하는지 확인 */
export function matchesChosung(str: string, filter: string): boolean {
  if (!str) return false
  const first = getFirstChosung(str)
  const group = CHOSUNG_GROUP[filter]
  if (!group) return false
  return group.includes(first)
}

/** 초성 검색 — 검색어의 각 글자 초성이 대상 문자열 초성 순서와 일치하는지 확인 */
export function chosungSearch(target: string, query: string): boolean {
  if (!query) return true
  if (!target) return false

  // 검색어가 초성으로만 이루어진 경우 초성 매칭
  const isAllChosung = [...query].every(c => CHOSUNG.includes(c) || FILTER_CONSONANTS.includes(c))

  if (isAllChosung) {
    // 초성 시퀀스 매칭: 대상 문자열의 초성 배열에서 검색 초성 시퀀스 포함 여부
    const targetChosungs = [...target].map(getChosung)
    const queryChosungs = [...query]
    outer: for (let i = 0; i <= targetChosungs.length - queryChosungs.length; i++) {
      for (let j = 0; j < queryChosungs.length; j++) {
        const group = CHOSUNG_GROUP[queryChosungs[j]]
        const tc = targetChosungs[i + j]
        if (group ? !group.includes(tc) : tc !== queryChosungs[j]) continue outer
      }
      return true
    }
    return false
  }

  // 일반 텍스트 포함 검색
  return target.toLowerCase().includes(query.toLowerCase())
}
