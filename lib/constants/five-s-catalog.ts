export type FiveSCycle = "일" | "주" | "월"

export interface FiveSItem {
  code: string
  category: "정리" | "정돈" | "청소청결" | "표준화"
  no: number
  content: string
  cycle: FiveSCycle
}

export const FIVE_S_CATEGORIES = ["정리", "정돈", "청소청결", "표준화"] as const

export const FIVE_S_CATALOG: FiveSItem[] = [
  { code: "jr-1", category: "정리", no: 1, content: "불필요한 재료, 각종 비품 등은 없는가?", cycle: "일" },
  { code: "jr-2", category: "정리", no: 2, content: "불필요한 치 공구, 설비 재료 등은 없는가?", cycle: "일" },
  { code: "jr-3", category: "정리", no: 3, content: "쓰고 남은 재료나 원 부자재 등이 방치되어 있지 않은가?", cycle: "일" },
  { code: "jr-4", category: "정리", no: 4, content: "불필요한 것은 한눈에 알아볼 수 있도록 확실하게 하고 있는가?", cycle: "주" },
  { code: "jr-5", category: "정리", no: 5, content: "필요와 불필요의 기준은 정립되어 있는가?", cycle: "월" },

  { code: "jd-1", category: "정돈", no: 1, content: "장소, 품목, 수량표시 및 정/부 책임자가 분명하게 표시되어 있는가?", cycle: "월" },
  { code: "jd-2", category: "정돈", no: 2, content: "제품, 부품, 재료 등은 정해진 장소에 놓여 있는가?", cycle: "일" },
  { code: "jd-3", category: "정돈", no: 3, content: "BOX, PALLET에 표시된 품목 및 수량대로 부품이 놓여 있는가?", cycle: "일" },
  { code: "jd-4", category: "정돈", no: 4, content: "BOX, PALLET는 지정된 위치에 놓여 관리하고 있는가?", cycle: "일" },
  { code: "jd-5", category: "정돈", no: 5, content: "불용 물품의 적치장소는 지정되어 있는가?", cycle: "월" },

  { code: "cs-1", category: "청소청결", no: 1, content: "설비와 설비 주변은 깨끗하게 청소되어 있는가?", cycle: "일" },
  { code: "cs-2", category: "청소청결", no: 2, content: "지게차, 기계류, 제품 부품 등에 오일, 먼지, 누유는 없는가?", cycle: "월" },
  { code: "cs-3", category: "청소청결", no: 3, content: "통로나 물품 보관 장소의 구획선은 명확하게 되어 있는가?", cycle: "월" },
  { code: "cs-4", category: "청소청결", no: 4, content: "기계나 지게차의 점검과 청소를 하고 있는가?", cycle: "주" },
  { code: "cs-5", category: "청소청결", no: 5, content: "청소는 분담되어 있으며 습관화되어 있는가?", cycle: "월" },

  { code: "st-1", category: "표준화", no: 1, content: "현황판 기록관리가 되고 있으며 실물과 일치되고 있는가?", cycle: "주" },
  { code: "st-2", category: "표준화", no: 2, content: "공정 및 검사체크시트는 기록 관리되고 있는가?", cycle: "주" },
  { code: "st-3", category: "표준화", no: 3, content: "현품표는 정위치에 부착 관리되고 있는가?", cycle: "주" },
  { code: "st-4", category: "표준화", no: 4, content: "개선 후 유지관리가 잘되고 있는가?", cycle: "주" },
  { code: "st-5", category: "표준화", no: 5, content: "적극적으로 표준화를 실천하고 있는가?(표준화 실적)", cycle: "월" },
]

// Symbol cycle for input: ◎ (4) -> ○ (3) -> △ (2) -> V (1) -> × (0) -> N/A -> blank
export const FIVE_S_SYMBOLS = ["◎", "○", "△", "V", "×", "N/A", ""] as const

export function nextFiveSSymbol(current: string | null | undefined): string {
  const idx = FIVE_S_SYMBOLS.indexOf((current ?? "") as any)
  const nextIdx = (idx + 1) % FIVE_S_SYMBOLS.length
  return FIVE_S_SYMBOLS[nextIdx]
}
