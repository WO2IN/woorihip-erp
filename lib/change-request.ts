export const REASON_OPTIONS = ['신규', '사양변경', '불량개선', '기타'] as const
export const TARGET_OPTIONS = ['사람', '자재', '기계·설비·JIG', '방법', '환경'] as const
export const CONTENT_OPTIONS = [
  '금형신규', '금형 일부수정', '포장(신규, 수정)', '금형이동', '설비추가', '설비개선',
  '제조공정', '재료변경', '출하검사자', '기능 인력', 'Lay-out', '기타',
] as const
export const SUBMISSIONS = ['측정Data', 'SAMPLE', '납입사양서', '선행확인', '신뢰성검토결과'] as const
export const HANDLING_OPTIONS = ['재고 소진 후 적용', '전수교체', '혼용 적용', '기타'] as const

export type SubmissionKey = (typeof SUBMISSIONS)[number]
export type SubmissionValue = '' | '유' | '무'
export const STAMP_KEYS = [
  'ourDraft',
  'ourReview',
  'ourDecision',
  'ourFinal',
  'customerDraft',
  'customerReview',
  'customerDecision',
  'customerFinal',
] as const
export type StampKey = (typeof STAMP_KEYS)[number]

const TEXT_LIMITS = {
  docNo: 40,
  ourDraft: 40,
  ourReview: 40,
  ourDecision: 40,
  ourFinal: 40,
  customerName: 80,
  customerDraft: 40,
  customerReview: 40,
  customerDecision: 40,
  customerFinal: 40,
  title: 120,
  company: 80,
  qualityOwner: 40,
  phone: 40,
  reason: 2000,
  product: 120,
  applyDate: 10,
  applyTarget: 200,
  changeMethod: 200,
  owner: 40,
  before: 4000,
  after: 4000,
} as const

type TextKey = keyof typeof TEXT_LIMITS

export interface ChangeRequest {
  id: string
  docNo: string
  ourDraft: string
  ourReview: string
  ourDecision: string
  ourFinal: string
  customerName: string
  customerDraft: string
  customerReview: string
  customerDecision: string
  customerFinal: string
  /** true면 입안·전결만 서명 (심의·결정은 이름만) */
  ourJeongyeol: boolean
  customerJeongyeol: boolean
  /** 결재칸에 넣은 계정 서명. 값은 사용자 id. */
  signs: Partial<Record<StampKey, string>>
  title: string
  company: string
  qualityOwner: string
  phone: string
  reasons: string[]
  reason: string
  targets: string[]
  contents: string[]
  submissions: Record<SubmissionKey, SubmissionValue>
  product: string
  applyDate: string
  applyTarget: string
  changeMethod: string
  owner: string
  handling: string[]
  before: string
  after: string
  beforeFiles: string[]
  afterFiles: string[]
  createdAt: string
  updatedAt: string
}

function text(value: unknown, limit: number) {
  return typeof value === 'string' ? value.trim().slice(0, limit) : ''
}

function choices(value: unknown, allowed: readonly string[]) {
  const selected = Array.isArray(value) ? value : []
  return allowed.filter((item) => selected.includes(item))
}

function stampSigns(value: unknown): Partial<Record<StampKey, string>> {
  if (!value || typeof value !== 'object') return {}
  const source = value as Record<string, unknown>
  const next: Partial<Record<StampKey, string>> = {}
  for (const key of STAMP_KEYS) {
    const id = text(source[key], 80)
    if (id) next[key] = id
  }
  return next
}

function fileNames(value: unknown) {
  return (Array.isArray(value) ? value : []).map((item) => text(item, 120)).filter((name) => /\.(png|jpe?g|gif|webp)$/i.test(name)).slice(0, 20)
}

export function emptySubmissions(): Record<SubmissionKey, SubmissionValue> {
  return { 측정Data: '', SAMPLE: '', 납입사양서: '', 선행확인: '', 신뢰성검토결과: '' }
}

export function emptyChangeRequest(): ChangeRequest {
  const now = new Date().toISOString()
  return {
    id: crypto.randomUUID(),
    docNo: '',
    ourDraft: '',
    ourReview: '',
    ourDecision: '',
    ourFinal: '',
    customerName: '',
    customerDraft: '',
    customerReview: '',
    customerDecision: '',
    customerFinal: '',
    ourJeongyeol: false,
    customerJeongyeol: false,
    signs: {},
    title: '',
    company: '우리하이피',
    qualityOwner: '',
    phone: '',
    reasons: [],
    reason: '',
    targets: [],
    contents: [],
    submissions: emptySubmissions(),
    product: '신흥 SEC 적용품',
    applyDate: '',
    applyTarget: '',
    changeMethod: '',
    owner: '',
    handling: [],
    before: '',
    after: '',
    beforeFiles: [],
    afterFiles: [],
    createdAt: now,
    updatedAt: now,
  }
}

export function normalizeChangeRequest(value: unknown, previous?: ChangeRequest | null): ChangeRequest | null {
  if (!value || typeof value !== 'object') return null
  const row = value as Record<string, unknown>
  const id = text(row.id, 80)
  if (!id) return null

  const next = emptyChangeRequest()
  next.id = id
  next.company = ''
  next.product = ''
  for (const key of Object.keys(TEXT_LIMITS) as TextKey[]) {
    let field = text(row[key], TEXT_LIMITS[key])
    if (key === 'applyDate' && field && !/^\d{4}-\d{2}-\d{2}$/.test(field)) field = ''
    next[key] = field
  }
  next.reasons = choices(row.reasons, REASON_OPTIONS)
  next.targets = choices(row.targets, TARGET_OPTIONS)
  next.contents = choices(row.contents, CONTENT_OPTIONS)
  next.handling = choices(row.handling, HANDLING_OPTIONS)
  next.submissions = emptySubmissions()
  if (row.submissions && typeof row.submissions === 'object') {
    const source = row.submissions as Record<string, unknown>
    for (const key of SUBMISSIONS) next.submissions[key] = source[key] === '유' || source[key] === '무' ? source[key] : ''
  }
  next.signs = stampSigns(row.signs)
  next.ourJeongyeol = row.ourJeongyeol === true
  next.customerJeongyeol = row.customerJeongyeol === true
  next.beforeFiles = fileNames(row.beforeFiles)
  next.afterFiles = fileNames(row.afterFiles)
  const now = new Date().toISOString()
  next.createdAt = previous?.createdAt || now
  next.updatedAt = now
  return next
}
