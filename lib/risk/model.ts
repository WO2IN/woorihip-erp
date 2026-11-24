import areas from './seed-areas.json'
import laws from './laws.json'
import rules from './rules.json'
import chems from './chems.json'

export type RiskMethod = 'CL' | 'FS' | 'L3'
export type MatrixKey = '5x4' | '3x3'
export type RiskLevel = '' | '상' | '중' | '하'
export type ChecklistJudge = '' | '○' | '×' | 'N/A'
export type EvalType = '최초' | '정기' | '수시' | '상시'
export type RiskStatus = '작성중' | '완료'

export interface RiskRow {
  id: string
  process: string
  cat: string
  hazard: string
  current: string
  law: string
  measure: string
  owner: string
  due: string
  done: boolean
  doneDate: string
  p: number | ''
  s: number | ''
  p2: number | ''
  s2: number | ''
  judge: ChecklistJudge
  level: RiskLevel
  level2: RiskLevel
}

export interface RiskSign {
  write: string
  review: string
  approve: string
}

export interface RiskAssessment {
  id: string
  method: RiskMethod
  matrix: MatrixKey
  title: string
  area: string
  areaKey: string
  type: EvalType
  start: string
  end: string
  dept: string
  evaluator: string
  participants: string
  sign: RiskSign
  threshold: string
  status: RiskStatus
  memo: string
  createdAt: string
  rows: RiskRow[]
}

export interface RiskBiz {
  name: string
  ceo: string
  bizNo: string
  corpNo: string
  type: string
  item: string
  address: string
  tel: string
  fax: string
  email: string
  workers: string
  industry: string
  certs: string
  mgr: string
  safety: string
  health: string
  sup: string
}

export interface RiskSettings {
  company: string
  address: string
  dept: string
  participants: string
  processes: string[]
  biz: RiskBiz
}

export interface Grade {
  max: number
  g: string
  c: string
  act: string
}

type SeedArea = {
  key: string
  title: string
  area: string
  rows: Array<[string, string, string, string, number, number, string, string, number | null, number | null]>
}

export const SEED_AREAS = areas as SeedArea[]
export const LAWS = laws as Array<[string, string, string]>
export const RULES = rules as Array<[string, string, string]>
export const CHEMS = chems as Array<[string, string, string, string, string]>

export const METHODS: Record<RiskMethod, { name: string; short: string; sub: string; desc: string; when: string; basis: string }> = {
  CL: {
    name: '체크리스트법',
    short: '체크리스트법',
    sub: '점검항목별 적정(○)/부적정(×)',
    desc: '유해·위험요인별로 필요한 안전조치를 점검항목으로 구성하고, 현재 조치의 적정 여부를 ○/×로 판정한다.',
    when: '법령·기준 준수 여부 위주로 신속하게 점검할 때',
    basis: '사업장 위험성평가에 관한 지침 제7조',
  },
  FS: {
    name: '빈도·강도법',
    short: '빈도·강도법',
    sub: '위험 가능성 × 중대성 조합',
    desc: '가능성(빈도)과 중대성(강도)을 점수화하여 곱으로 위험성을 산출한다.',
    when: '설비·공정이 많고 위험도 순위를 정량 비교해야 할 때',
    basis: '사업장 위험성평가에 관한 지침 제7조(위험성평가의 방법)',
  },
  L3: {
    name: '위험성 수준 3단계 판단법',
    short: '3단계 판단법',
    sub: '상·중·하 직관적 판단',
    desc: '유해·위험요인별 위험성 수준을 상(높음)·중(보통)·하(낮음) 3단계로 직관 판단한다.',
    when: '점수화가 어렵거나 근로자 참여형으로 빠르게 평가할 때',
    basis: '사업장 위험성평가에 관한 지침 제7조',
  },
}

export const METHOD_ORDER: RiskMethod[] = ['CL', 'FS', 'L3']
export const METHOD_NO: Record<RiskMethod, string> = { CL: '①', FS: '②', L3: '③' }
export const EVAL_TYPES: EvalType[] = ['최초', '정기', '수시', '상시']

export const ZONES = [
  { id: 'site', name: '현장 (도금라인)', keys: ['1F', '2F', '3F'] },
  { id: 'wh', name: '창고', keys: ['WH'] },
  { id: 'lab', name: '분석실', keys: ['LAB'] },
  { id: 'etc', name: '기타', keys: [] as string[] },
]

export const KRAS: Array<[string, string, Array<[string, string]>]> = [
  ['1', '기계(설비)적 요인', [['1.1', '협착위험(감김, 끼임)'], ['1.2', '위험한 표면(절단, 베임, 긁힘)'], ['1.3', '기계(설비)의 낙하, 비래, 전복, 붕괴'], ['1.4', '충돌위험 부분'], ['1.5', '넘어짐(미끄러짐, 걸림, 헛디딤)'], ['1.6', '추락위험 부분(개구부 등)']]],
  ['2', '전기적 요인', [['2.1', '감전(안전전압 초과)'], ['2.2', '아크'], ['2.3', '정전기']]],
  ['3', '화학(물질)적 요인', [['3.1', '가스'], ['3.2', '증기'], ['3.3', '에어로졸·흄'], ['3.4', '액체·미스트'], ['3.5', '고체(분진)'], ['3.6', '반응성 물질'], ['3.7', '방사선'], ['3.8', '화재/폭발위험'], ['3.9', '복사열/폭발과압']]],
  ['4', '생물학적 요인', [['4.1', '병원성 미생물·바이러스에 의한 감염'], ['4.2', '유전자 변형물질(GMO)'], ['4.3', '알러지 및 미생물'], ['4.4', '동물'], ['4.5', '식물'], ['4.6', '화상']]],
  ['5', '작업특성 요인', [['5.1', '소음'], ['5.2', '초음파·초저주파음'], ['5.3', '진동'], ['5.4', '근로자 실수(휴먼에러)'], ['5.5', '저압 또는 고압상태'], ['5.6', '질식위험·산소결핍'], ['5.7', '중량물 취급작업'], ['5.8', '반복작업'], ['5.9', '불안정한 작업자세'], ['5.10', '작업(조작)도구']]],
  ['6', '작업환경 요인', [['6.1', '기후/고온/한랭'], ['6.2', '조명'], ['6.3', '공간 및 이동통로'], ['6.4', '주변 근로자'], ['6.5', '작업시간'], ['6.6', '조직 안전문화']]],
]

export const BIZ_FIELDS: Array<[keyof RiskBiz, string]> = [
  ['name', '상호(법인명)'], ['ceo', '대표자'], ['bizNo', '사업자등록번호'],
  ['corpNo', '법인등록번호'], ['type', '업태'], ['item', '종목'],
  ['address', '사업장 소재지'],
  ['tel', '대표 전화'], ['fax', '팩스'], ['email', '담당 이메일'],
  ['workers', '상시 근로자 수'], ['industry', '업종(산재보험 업종)'], ['certs', '보유 인증'],
  ['mgr', '안전보건관리책임자'], ['safety', '안전관리자(담당자)'], ['health', '보건관리자(담당자)'], ['sup', '관리감독자'],
]

const MATRIX: Record<MatrixKey, { name: string; src: string; pN: number; sN: number; th: number; pL: Array<[string, string]>; sL: Array<[string, string]>; grades: Grade[] }> = {
  '5x4': {
    name: '5×4 (가능성 5단계 × 중대성 4단계)', src: '사내 위험성평가 기준(5×4)', pN: 5, sN: 4, th: 9,
    pL: [
      ['최하', '피해가 발생할 가능성이 없음 — 전반적으로 안전조치가 잘 되어 있음'],
      ['하', '피해가 발생할 가능성이 낮음 — 가드·방호덮개·안전장치가 설치되어 있고 위험영역 출입이 곤란하며 안전수칙이 정비됨'],
      ['중', '부주의하면 피해가 발생할 가능성이 있음 — 안전장치 등은 설치되어 있으나 간격이 벌어지는 등 불비가 있음'],
      ['상', '피해가 발생할 가능성이 높음 — 안전장치가 없거나 상당한 불비가 있음'],
      ['최상', '피해가 발생할 가능성이 매우 높음 — 안전대책이 없고 표시·표지 불비, 안전수칙·작업표준 없음'],
    ],
    sL: [
      ['소', '아차사고 수준 / 화학물질·분진·소음 등 노출기준(권고기준)의 10% 미만'],
      ['중', '응급처치 및 의료기관 치료를 요하는 사고 / 노출기준의 10~50%'],
      ['대', '실명·절단 등 기록 및 작업손실 재해 / 노출기준의 50~100%'],
      ['최대', '사망사고를 초래할 수 있는 사고 / 노출기준 초과, 발암성·변이원성·생식독성 물질 취급'],
    ],
    grades: [
      { max: 3, g: '매우낮음', c: '#5b8f3a', act: '현재의 안전대책 유지' },
      { max: 6, g: '낮음', c: '#2e7d32', act: '근로자에게 유해·위험성 정보 및 주기적인 안전보건교육 제공' },
      { max: 8, g: '보통', c: '#c9a100', act: '안전대책 및 작업환경개선 대책을 통해 유해·위험 수준을 감소시킬 수 있는 단계' },
      { max: 12, g: '약간높음', c: '#e07000', act: '긴급 안전보건대책을 수립·개선하고, 설치된 환기장치 효율성 검토 및 성능개선 실시' },
      { max: 99, g: '매우높음', c: '#c62828', act: '즉시 작업중지, 작업을 지속하려면 즉시 개선 실행' },
    ],
  },
  '3x3': {
    name: '3×3 (가능성 3단계 × 중대성 3단계)', src: '3×3 간이형 — 사업장 자체 기준으로 확정 필요', pN: 3, sN: 3, th: 6,
    pL: [
      ['하', '발생 가능성이 낮음 — 안전조치가 되어 있어 피해 발생 가능성이 거의 없음'],
      ['중', '부주의하면 발생 가능 — 안전조치 일부 불비'],
      ['상', '발생 가능성이 높음 — 안전조치가 없거나 상당한 불비'],
    ],
    sL: [
      ['소', '아차사고 또는 응급처치 수준(휴업 없음)'],
      ['중', '휴업이 필요한 부상·질병'],
      ['대', '사망 또는 영구장해, 다수 재해'],
    ],
    grades: [
      { max: 2, g: '낮음', c: '#2e7d32', act: '허용 가능 — 현재 상태 유지, 근로자 교육' },
      { max: 4, g: '보통', c: '#e08a00', act: '개선 권고 — 감소대책 계획 수립·실행' },
      { max: 99, g: '높음', c: '#c62828', act: '허용 불가 — 즉시 개선, 개선 전 작업 제한' },
    ],
  },
}

export const L3_GUIDE: Record<Exclude<RiskLevel, ''>, { c: string; t: string; act: string }> = {
  상: { c: '#c62828', t: '높음', act: '허용 불가 — 즉시 개선, 개선 전 작업 중지 또는 제한' },
  중: { c: '#e08a00', t: '보통', act: '개선 권고 — 감소대책 계획 수립 후 실행' },
  하: { c: '#2e7d32', t: '낮음', act: '허용 가능 — 현재 안전조치 유지' },
}

export function matrixOf(key: MatrixKey) {
  return MATRIX[key]
}

export function krasLabel(code: string) {
  for (const group of KRAS) {
    const found = group[2].find((item) => item[0] === code)
    if (found) return `${found[0]} ${found[1]}`
  }
  return code
}

export function zoneOf(areaKey: string) {
  return ZONES.find((zone) => zone.keys.includes(areaKey))?.id ?? 'etc'
}

export function today() {
  const date = new Date()
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset())
  return date.toISOString().slice(0, 10)
}

export function riskId() {
  return crypto.randomUUID()
}

function levelOf(score: number): RiskLevel {
  if (score >= 9) return '상'
  if (score >= 6) return '중'
  return '하'
}

export function blankBiz(): RiskBiz {
  return {
    name: '', ceo: '', bizNo: '', corpNo: '', type: '', item: '', address: '',
    tel: '', fax: '', email: '', workers: '', industry: '', certs: '',
    mgr: '', safety: '', health: '', sup: '',
  }
}

export function defaultSettings(): RiskSettings {
  const biz = blankBiz()
  biz.name = '우리하이피(주)'
  biz.address = '경기도 안산시 단원구 정왕천동로94번길 39'
  biz.type = '제조업'
  biz.item = '금속 표면처리(전기도금)'
  biz.certs = 'IATF 16949'
  const processes: string[] = []
  for (const area of SEED_AREAS) {
    for (const row of area.rows) {
      if (!processes.includes(row[0])) processes.push(row[0])
    }
  }
  return {
    company: biz.name,
    address: biz.address,
    dept: '품질팀',
    participants: '',
    processes,
    biz,
  }
}

export function emptyRow(): RiskRow {
  return {
    id: riskId(), process: '', cat: '', hazard: '', current: '', law: '', measure: '',
    owner: '', due: '', done: false, doneDate: '', p: '', s: '', p2: '', s2: '',
    judge: '', level: '', level2: '',
  }
}

export function riskScore(row: RiskRow, after = false) {
  const p = Number(after ? row.p2 : row.p)
  const s = Number(after ? row.s2 : row.s)
  return p > 0 && s > 0 ? p * s : 0
}

export function gradeOf(matrix: MatrixKey, score: number) {
  if (!score) return null
  const grades = MATRIX[matrix].grades
  return grades.find((grade) => score <= grade.max) ?? grades[grades.length - 1]
}

export function thresholdOf(assessment: Pick<RiskAssessment, 'threshold' | 'matrix'>) {
  const value = Number(assessment.threshold)
  return value > 0 ? value : MATRIX[assessment.matrix || '5x4'].th
}

export function isMandatory(assessment: RiskAssessment, row: RiskRow) {
  if (assessment.method === 'FS') return riskScore(row) >= thresholdOf(assessment)
  if (assessment.method === 'CL') return row.judge === '×'
  return row.level === '상'
}

export function needsImprovement(assessment: RiskAssessment, row: RiskRow) {
  return isMandatory(assessment, row) || Boolean(row.measure.trim())
}

export function improvementStatus(row: RiskRow): 'done' | 'late' | 'prog' {
  if (row.done) return 'done'
  if (row.due && row.due < today()) return 'late'
  return 'prog'
}

export const STATUS_LABEL = { done: '완료', late: '지연', prog: '진행' } as const

export function decisionOf(assessment: RiskAssessment, row: RiskRow) {
  if (assessment.method === 'FS') {
    const score = riskScore(row)
    if (!score) return ''
    if (score >= thresholdOf(assessment)) return '개선'
    return row.measure.trim() ? '자체개선' : '적절'
  }
  if (assessment.method === 'CL') {
    if (row.judge === '×') return '개선'
    if (row.judge === '○') return row.measure.trim() ? '자체개선' : '적정'
    return row.judge
  }
  if (row.level === '상') return '즉시개선'
  if (row.level === '중') return '개선권고'
  if (row.level === '하') return '허용'
  return ''
}

function rowFromTemplate(template: SeedArea['rows'][number], method: RiskMethod): RiskRow {
  const row = emptyRow()
  const score = template[4] * template[5]
  row.process = template[0]
  row.cat = template[1]
  row.current = template[3]
  row.law = template[6] || ''
  row.hazard = template[2]
  if (method === 'FS') {
    row.p = template[4]
    row.s = template[5]
    if (template[7]) {
      row.measure = template[7]
      row.p2 = template[8] || ''
      row.s2 = template[9] || ''
    }
  }
  if (method === 'CL') {
    row.hazard = `${template[2]} — 방지조치 적정 여부`
    row.judge = score >= 8 ? '×' : '○'
    if (template[7]) row.measure = template[7]
  }
  if (method === 'L3') {
    row.level = levelOf(score)
    if (template[7]) {
      row.measure = template[7]
      row.level2 = template[8] && template[9] ? levelOf(template[8] * template[9]) : row.level === '상' ? '중' : '하'
    }
  }
  return row
}

export function assessmentFromArea(key: string, method: RiskMethod, settings: RiskSettings, withScores = true): RiskAssessment {
  const area = SEED_AREAS.find((item) => item.key === key)
  const year = new Date().getFullYear()
  const rows = area && withScores
    ? area.rows.map((row) => rowFromTemplate(row, method))
    : area
      ? area.rows.map((row) => {
          const blank = rowFromTemplate(row, method)
          blank.p = ''
          blank.s = ''
          blank.p2 = ''
          blank.s2 = ''
          blank.judge = ''
          blank.level = ''
          blank.level2 = ''
          blank.measure = ''
          return blank
        })
      : [emptyRow()]
  return {
    id: riskId(),
    method,
    matrix: '5x4',
    title: area ? `${year}년 ${area.title.replace(' 위험성평가', '')} 위험성평가 (${METHODS[method].name})` : `${year}년 위험성평가 (${METHODS[method].name})`,
    area: area?.area || '',
    areaKey: area?.key || '',
    type: '정기',
    start: today(),
    end: today(),
    dept: settings.dept || '품질팀',
    evaluator: '',
    participants: settings.participants || '',
    sign: { write: '', review: '', approve: '' },
    threshold: '',
    status: '작성중',
    memo: withScores && area ? '예시 데이터다. 현장 확인과 근로자 참여 평가로 수정한다.' : '',
    createdAt: new Date().toISOString(),
    rows,
  }
}

export function buildSeed() {
  const settings = defaultSettings()
  const assessments = SEED_AREAS.flatMap((area) => METHOD_ORDER.map((method) => assessmentFromArea(area.key, method, settings, true)))
  return { settings, assessments }
}

export function distribution(assessment: RiskAssessment) {
  if (assessment.method === 'CL') {
    const counts = { '○': 0, '×': 0, 'N/A': 0, '': 0 }
    for (const row of assessment.rows) counts[row.judge] += 1
    return [
      ['○ 적정', counts['○'], '#2e7d32'],
      ['× 부적정', counts['×'], '#c62828'],
      ['N/A', counts['N/A'], '#8a97a6'],
      ['미판정', counts[''], '#cfd8e2'],
    ] as Array<[string, number, string]>
  }
  if (assessment.method === 'L3') {
    const counts = { 상: 0, 중: 0, 하: 0, '': 0 }
    for (const row of assessment.rows) counts[row.level] += 1
    return [
      ['상(높음)', counts['상'], '#c62828'],
      ['중(보통)', counts['중'], '#e08a00'],
      ['하(낮음)', counts['하'], '#2e7d32'],
      ['미판정', counts[''], '#cfd8e2'],
    ] as Array<[string, number, string]>
  }
  const buckets = new Map<string, number>()
  let none = 0
  for (const row of assessment.rows) {
    const score = riskScore(row)
    if (!score) {
      none += 1
      continue
    }
    const grade = gradeOf(assessment.matrix, score)
    if (!grade) continue
    buckets.set(grade.g, (buckets.get(grade.g) || 0) + 1)
  }
  const grades = [...MATRIX[assessment.matrix].grades].reverse().map((grade) => [grade.g, buckets.get(grade.g) || 0, grade.c] as [string, number, string])
  grades.push(['미판정', none, '#cfd8e2'])
  return grades
}
