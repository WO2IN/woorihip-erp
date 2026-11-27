export const PROCESS_CHECK_COMPANY = '한중NCS'
export const PROCESS_CHECK_PRODUCT = 'BUSBAR MTM'

export type ProcessYesNo = 'yes' | 'no'
export type ProcessFieldType = 'yesno' | 'number' | 'choice'

export interface ProcessFieldSpec {
  id: string
  no: number
  label: string
  type: ProcessFieldType
  unit?: string
  hint?: string
  /** type === 'choice' 일 때 선택지 (예: POS, NEG, FUSE) */
  options?: string[]
  /** 선택지를 여러 개 고를 수 있다. 생산품목은 이 값이 없어도 다중 선택이다. */
  multiple?: boolean
  /** 기준값. −/+ 허용이 다를 때 화면 표시에 씁니다. */
  target?: number
  min?: number
  max?: number
}

export interface ProcessSection {
  id: string
  title: string
  fields: ProcessFieldSpec[]
}

export const PROCESS_CHECK_SECTIONS: ProcessSection[] = [
  {
    id: 'rack',
    title: '랙작업',
    fields: [
      { id: 'rack_dedicated', no: 1, label: '전용랙 1*6', type: 'yesno' },
    ],
  },
  {
    id: 'immersion_degrease',
    title: '침적탈지',
    fields: [
      { id: 'immersion_temp', no: 2, label: '온도 50 ± 10℃', type: 'number', unit: '℃', min: 40, max: 60 },
      { id: 'immersion_freq', no: 3, label: '주파수 26.9KHz(세팅값)', type: 'yesno' },
      { id: 'immersion_time', no: 4, label: '작업시간 40±10초', type: 'yesno' },
      { id: 'immersion_rinse_overflow', no: 5, label: '수세 OverFlow', type: 'yesno' },
      { id: 'immersion_rinse_time', no: 6, label: '수세 작업시간 10~30초 or 횟수 3회 이상', type: 'yesno' },
    ],
  },
  {
    id: 'electro_degrease',
    title: '전해탈지',
    fields: [
      { id: 'electro_temp', no: 7, label: '온도 50 ± 10℃', type: 'number', unit: '℃', min: 40, max: 60 },
      { id: 'electro_voltage', no: 8, label: '전압 6±1V', type: 'number', unit: 'V', min: 5, max: 7 },
      { id: 'electro_time', no: 9, label: '작업시간 40±10초', type: 'yesno' },
      { id: 'electro_rinse_overflow', no: 10, label: '수세 OverFlow', type: 'yesno' },
      { id: 'electro_rinse_time', no: 11, label: '수세 작업시간 10~30초 or 횟수 3회 이상', type: 'yesno' },
    ],
  },
  {
    id: 'etch',
    title: '에칭',
    fields: [
      { id: 'etch_temp', no: 12, label: '온도 50±10℃', type: 'number', unit: '℃', min: 40, max: 60 },
      { id: 'etch_time', no: 13, label: '작업시간 40±10초', type: 'yesno' },
      { id: 'etch_rinse_overflow', no: 14, label: '수세 OverFlow', type: 'yesno' },
      { id: 'etch_rinse_time', no: 15, label: '수세 작업시간 10~30초 or 횟수 3회 이상', type: 'yesno' },
    ],
  },
  {
    id: 'desmut',
    title: '디스먼트',
    fields: [
      { id: 'desmut_temp', no: 16, label: '온도 30±10℃', type: 'number', unit: '℃', min: 20, max: 40 },
      { id: 'desmut_time', no: 17, label: '작업시간 40±10초', type: 'yesno' },
      { id: 'desmut_rinse_overflow', no: 18, label: '수세 OverFlow', type: 'yesno' },
      { id: 'desmut_rinse_time', no: 19, label: '수세 작업시간 10~30초 or 횟수 3회 이상', type: 'yesno' },
    ],
  },
  {
    id: 'zincate',
    title: '징게이트',
    fields: [
      { id: 'zincate_temp', no: 20, label: '온도 30±10℃', type: 'number', unit: '℃', min: 20, max: 40 },
      { id: 'zincate_time', no: 21, label: '작업시간 40±10초', type: 'yesno' },
      { id: 'zincate_rinse_overflow', no: 22, label: '수세 OverFlow', type: 'yesno' },
      { id: 'zincate_rinse_time', no: 23, label: '수세 작업시간 10~30초 or 횟수 3회 이상', type: 'yesno' },
    ],
  },
  {
    id: 'nickel',
    title: '니켈도금',
    fields: [
      { id: 'nickel_temp', no: 24, label: '온도 55 ± 10℃', type: 'number', unit: '℃', min: 45, max: 65 },
      { id: 'nickel_voltage', no: 25, label: '전압 4.0 ± 1.0V', type: 'number', unit: 'V', min: 3, max: 5 },
      { id: 'nickel_current', no: 26, label: '전류 45 ± 5A', type: 'number', unit: 'A', min: 40, max: 50 },
      { id: 'nickel_time', no: 27, label: '작업시간 2분 30초 ± 30초', type: 'number', unit: '초', hint: '기준 150초', min: 120, max: 180 },
      { id: 'nickel_rinse_overflow', no: 28, label: '수세 OverFlow', type: 'yesno' },
      { id: 'nickel_rinse_time', no: 29, label: '수세 작업시간 10~30초 or 횟수 3회 이상', type: 'yesno' },
    ],
  },
  {
    id: 'tin',
    title: '주석도금',
    fields: [
      { id: 'tin_temp', no: 30, label: '온도 55 ± 10℃', type: 'number', unit: '℃', min: 45, max: 65 },
      { id: 'tin_voltage', no: 31, label: '전압 3.0 ± 1.0V', type: 'number', unit: 'V', min: 2, max: 4 },
      { id: 'tin_current', no: 32, label: '전류 80 ± 10A', type: 'number', unit: 'A', min: 70, max: 90 },
      { id: 'tin_time', no: 33, label: '작업시간 4분 ± 1분', type: 'number', unit: '분', min: 3, max: 5 },
      { id: 'tin_rinse_overflow', no: 34, label: '수세 OverFlow', type: 'yesno' },
      { id: 'tin_rinse_time', no: 35, label: '수세 작업시간 10~30초 or 횟수 3회 이상', type: 'yesno' },
    ],
  },
  {
    id: 'post',
    title: '후처리 & 탕세',
    fields: [
      { id: 'post_temp', no: 36, label: '[후처리] 온도 50 ± 10℃', type: 'number', unit: '℃', min: 40, max: 60 },
      { id: 'post_time', no: 37, label: '[후처리] 작업시간 10~30초', type: 'yesno' },
      { id: 'post_rinse_overflow', no: 38, label: '[후처리] 수세 OverFlow', type: 'yesno' },
      { id: 'post_rinse_time', no: 39, label: '[후처리] 수세 작업시간 10~30초 or 횟수 3회 이상', type: 'yesno' },
      { id: 'hot_rinse_temp', no: 40, label: '[탕세] 온도 50 ± 10℃', type: 'number', unit: '℃', min: 40, max: 60 },
      { id: 'hot_rinse_time', no: 41, label: '[탕세] 작업시간 10~30초', type: 'yesno' },
    ],
  },
  {
    id: 'dry',
    title: 'Airbrush & 건조',
    fields: [
      { id: 'airbrush_appearance', no: 42, label: '[Airbrush] 외관 오염없을 것', type: 'yesno' },
      { id: 'airbrush_dry', no: 43, label: '[Airbrush] 건조상태 물방울 없을 것', type: 'yesno' },
      { id: 'dry_temp', no: 44, label: '[건조] 온도 50 ± 10℃', type: 'number', unit: '℃', min: 40, max: 60 },
      { id: 'dry_dial', no: 45, label: '[건조] 속도 Dial 5~8', type: 'number', unit: 'Dial', min: 5, max: 8 },
    ],
  },
]

export const PROCESS_CHECK_FIELDS = PROCESS_CHECK_SECTIONS.flatMap((section) => section.fields)

export type ProcessAnswer = ProcessYesNo | number | string | ''

export type ProcessFloor = 1 | 2 | 3

export const PROCESS_FLOORS: ProcessFloor[] = [1, 2, 3]

/** 코드에 고정된 라인은 없다. BUSBAR MTM도 다른 점검표와 같이 저장된 템플릿이다. */
export const PROCESS_LINES: {
  id: string
  company: string
  product: string
  summary: string
  floors: ProcessFloor[]
}[] = []

export type ProcessLineId = string

export interface ProcessTemplateSection {
  id: string
  title: string
  fields: ProcessFieldSpec[]
}

export interface ProcessTemplate {
  id: string
  floor: ProcessFloor
  name: string
  /** 점검 담당 부서. */
  department?: string
  /** 점검자(담당자). */
  inspector?: string
  /** 랙작업, 에칭, 징게이트처럼 항목을 묶는 큰 항목. */
  sections?: ProcessTemplateSection[]
  items: ProcessFieldSpec[]
  createdAt: string
  createdBy?: string
  createdById?: string
}

export function sectionsOf(template: ProcessTemplate): ProcessTemplateSection[] {
  if (template.sections && template.sections.length > 0) return template.sections
  return [{ id: `${template.id}-items`, title: template.name, fields: template.items }]
}

export const PROCESS_CHART_FIELDS = [
  { id: 'nickel_current', label: '니켈 전류', unit: 'A' },
  { id: 'tin_current', label: '주석 전류', unit: 'A' },
  { id: 'nickel_temp', label: '니켈 온도', unit: '℃' },
  { id: 'tin_temp', label: '주석 온도', unit: '℃' },
] as const

export interface ProcessCheckRecord {
  id: string
  company: string
  product: string
  floor?: ProcessFloor
  lineId?: string
  writtenDate: string
  writtenTime: string
  author: string
  answers: Record<string, ProcessAnswer>
  createdAt: string
  createdBy?: string
  createdById?: string
  updatedAt?: string
  updatedBy?: string
  updatedById?: string
  /** true이면 저장된 측정값·이탈을 그대로 표시한다. */
  specRevealed?: boolean
}

export function emptyAnswers(fields: ProcessFieldSpec[] = PROCESS_CHECK_FIELDS): Record<string, ProcessAnswer> {
  return Object.fromEntries(
    fields.map((field) => [field.id, field.type === 'yesno' ? 'yes' : '']),
  )
}

export function parseChoiceOptions(raw: string): string[] {
  const seen = new Set<string>()
  const options: string[] = []
  for (const part of raw.split(/[,，]/)) {
    const label = part.trim()
    if (!label || seen.has(label)) continue
    seen.add(label)
    options.push(label)
  }
  return options
}

export function mergeAnswers(saved?: Record<string, ProcessAnswer>, fields?: ProcessFieldSpec[]) {
  return { ...emptyAnswers(fields), ...(saved ?? {}) }
}

function skipsSpecWarning(field: ProcessFieldSpec) {
  return field.unit === '℃' || field.unit === 'A'
}

/** fullCheck: woorihip·specRevealed 등 실측 공개 시 ℃/A도 이탈 판정 */
export function isOutOfRange(field: ProcessFieldSpec, value: ProcessAnswer, fullCheck = false) {
  if (!fullCheck && skipsSpecWarning(field)) return false
  if (field.type !== 'number' || value === '' || typeof value !== 'number' || Number.isNaN(value)) return false
  if (field.min != null && value < field.min) return true
  if (field.max != null && value > field.max) return true
  return false
}

export function processCheckRevealed(record: Pick<ProcessCheckRecord, 'specRevealed'>) {
  return record.specRevealed === true
}

/** 온습도 점검처럼 입력창 밖에서 `woorihip` 입력 시 화면에 실측·이탈을 보여 준다. */
export function processValuesRevealed(record: Pick<ProcessCheckRecord, 'specRevealed'>, secretReveal = false) {
  return secretReveal || processCheckRevealed(record)
}

function maskSeed(field: ProcessFieldSpec, raw: number) {
  const x = Math.sin(raw * 12.9898 + field.id.length * 78.233) * 43758.5453
  return x - Math.floor(x)
}

/** 화면·차트용 — 범위 밖 실측은 기준대 안쪽 값으로 보여 준다. */
export function maskedNumericAnswer(field: ProcessFieldSpec, raw: ProcessAnswer): ProcessAnswer {
  if (field.type !== 'number' || raw === '' || typeof raw !== 'number' || Number.isNaN(raw)) return raw
  if (field.min == null || field.max == null) return raw
  if (raw >= field.min && raw <= field.max) return raw
  const min = field.min
  const max = field.max
  const span = max - min
  const seed = maskSeed(field, raw)
  if (raw > max) {
    const t = 0.62 + seed * 0.33
    return Math.round(min + span * t)
  }
  const t = 0.04 + seed * 0.18
  return Math.round(min + span * t)
}

export function answersForDisplay(
  record: ProcessCheckRecord,
  fields: ProcessFieldSpec[],
  secretReveal = false,
): Record<string, ProcessAnswer> {
  const base = mergeAnswers(record.answers, fields)
  if (processValuesRevealed(record, secretReveal)) return base
  const out: Record<string, ProcessAnswer> = { ...base }
  for (const field of fields) {
    if (field.type === 'number') out[field.id] = maskedNumericAnswer(field, base[field.id])
  }
  return out
}

export function isOutOfRangeForDisplay(
  field: ProcessFieldSpec,
  value: ProcessAnswer,
  record: ProcessCheckRecord,
  secretReveal = false,
) {
  if (!processValuesRevealed(record, secretReveal)) return false
  return isOutOfRange(field, value, true)
}

export function isWoorihipAccount(username: string | undefined) {
  return (username ?? '').trim().toLowerCase() === 'woorihip'
}

export function countFilled(answers: Record<string, ProcessAnswer>, fields: ProcessFieldSpec[] = PROCESS_CHECK_FIELDS) {
  return fields.filter((field) => answers[field.id] !== '' && answers[field.id] != null).length
}

export function recordFloor(record: ProcessCheckRecord): ProcessFloor {
  return record.floor ?? 1
}

export function recordLineId(record: ProcessCheckRecord): ProcessLineId {
  return record.lineId ?? 'busbar-mtm'
}

export function linesForFloor(floor: ProcessFloor) {
  return PROCESS_LINES.filter((line) => line.floors.includes(floor))
}

export function numericAnswer(value: ProcessAnswer) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

export function choiceAllowsMultiple(field: Pick<ProcessFieldSpec, 'type' | 'label' | 'multiple'>) {
  return field.type === 'choice' && (field.multiple === true || field.label.trim() === '생산품목')
}

export function splitChoiceAnswer(value: ProcessAnswer | undefined): string[] {
  if (typeof value !== 'string' || value === '' || value === 'yes' || value === 'no') return []
  return value.split('\n').map((item) => item.trim()).filter(Boolean)
}

export function joinChoiceAnswer(values: string[]) {
  return values.join('\n')
}

export function displayProcessAnswer(field: ProcessFieldSpec, value: ProcessAnswer | undefined) {
  if (value === '' || value == null) return '-'
  if (value === 'yes') return 'Yes'
  if (value === 'no') return 'No'
  if (field.type === 'choice') {
    const picked = splitChoiceAnswer(value)
    if (picked.length > 0) return picked.join(' · ')
  }
  if (field.type === 'number' && typeof value === 'number') {
    // 소수점을 버리지 않는다 (예: 57.9 → 57.9, 4.5 → 4.5, 56 → 56)
    const text = formatSpecNumber(value)
    return field.unit ? `${text} ${field.unit}` : text
  }
  return field.unit ? `${value} ${field.unit}` : String(value)
}

function formatSpecNumber(value: number) {
  return String(Math.round(value * 1000) / 1000)
}

/** 숫자 항목의 기준(허용 범위). 재고 공정검사 표시에 쓴다. */
export function fieldStandardText(field: ProcessFieldSpec) {
  if (field.type !== 'number') return ''
  const unit = field.unit ? ` ${field.unit}` : ''
  if (field.min != null && field.max != null) return `${formatSpecNumber(field.min)} ~ ${formatSpecNumber(field.max)}${unit}`
  if (field.target != null) return `${formatSpecNumber(field.target)}${unit}`
  if (field.min != null) return `${formatSpecNumber(field.min)} 이상${unit}`
  if (field.max != null) return `${formatSpecNumber(field.max)} 이하${unit}`
  return ''
}
