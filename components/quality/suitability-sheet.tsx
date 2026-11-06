'use client'

import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { PenLine, X } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/components/auth/auth-context'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger } from '@/components/ui/select'
import { getJsonAuthHeaders } from '@/lib/auth-client'
import type { QualificationLedgerRow } from '@/lib/qualification-ledger'
import {
  extractOverlaysFromPeople,
  mergeLedgerRowsWithSuitabilityStore,
  type SuitabilityDraftPerson,
  type SuitabilitySheetPersisted,
} from '@/lib/suitability-ledger-bridge'
import { JOB_TITLES_MENU } from '@/lib/user-job-titles'
import { cn } from '@/lib/utils'

type Scores = {
  academic: number
  education: number
  skills: number[]
  career: number
  /** 검사원/내부심사원 평가 (10문항 · 1점×10, 추후 문항 UI 연동) */
  evalExam: number
}

type EvalSheetKind = 'inspector' | 'internal-audit'

const EVAL_SHEET_TABS: { id: 'all' | EvalSheetKind; label: string }[] = [
  { id: 'all', label: '전체' },
  { id: 'internal-audit', label: '내부심사원' },
  { id: 'inspector', label: '검사원' },
]

const EVAL_FORM_OPTIONS: { id: EvalSheetKind; label: string; basis: string; passDoc: string }[] = [
  { id: 'inspector', label: '검사원', basis: 'WR-MP-1002 [부표3]', passDoc: 'WR-MP-1002 [부표3]' },
  { id: 'internal-audit', label: '내부심사원', basis: 'WR-MP-1001 [부표2]', passDoc: 'WR-MP-1001 [부표2]' },
]

const GRANT_MANAGEMENT_ROWS: Record<EvalSheetKind, { term: string; detail: string }[]> = {
  inspector: [
    { term: '재평가', detail: '연 1회 정기 · 6개월 이상 \n검사 미수행 시' },
    { term: '정지', detail: '판정 오류로 고객 유출 · 불만 → 즉시 정지 → 재교육 → 재평가 합격 시 복귀' },
    { term: '기록', detail: '적격성 평가표 · 자격자 명단 · 교육일지' },
  ],
  'internal-audit': [],
}

/** 내부심사원 적격성평가서 — 사이드 「자격 관리 기준」(WR-MP-1001 부표2) */
const INTERNAL_AUDIT_QUAL_CRITERIA: { term: string; detail: string }[] = [
  { term: '단독심사', detail: '공동심사 2회 이상 수행 후 \n가능 · 자기 부서 심사 금지' },
  { term: '자격 유지', detail: '연 1회 이상 심사 참여 + \n연 1회 역량 재평가' },
  { term: '자격 정지', detail: '1년 이상 심사 미수행 시 \n재교육 후 재평가\n(IATF 16949 7.2.3)' },
]

const GRANT_PIPELINE: Record<EvalSheetKind, { id: string; label: string }[]> = {
  inspector: [
    { id: 'ojt', label: 'OJT 완료' },
    { id: 'score', label: '점수 평가' },
    { id: 'practical', label: '실기 ①~④' },
    { id: 'approve', label: '부장 승인' },
    { id: 'register', label: '명단 등재' },
  ],
  'internal-audit': [
    { id: 'train', label: '교육·참관' },
    { id: 'score', label: '점수 평가' },
    { id: 'joint', label: '공동심사' },
    { id: 'approve', label: '부장 승인' },
    { id: 'register', label: '명단 등재' },
  ],
}

const DEFAULT_PIPELINE_ACTIVE: Record<EvalSheetKind, string> = {
  inspector: 'practical',
  'internal-audit': 'joint',
}

const APPROVAL_STEPS = ['작성', '검토', '승인'] as const
type ApprovalStep = (typeof APPROVAL_STEPS)[number]

type Person = {
  id: string
  evalType: EvalSheetKind
  name: string
  role: string
  certNo: string
  meta: string
  badge?: string
  note?: string
  dept: string
  title: string
  duty: string
  qual: string
  auditType: string
  requestDept: string
  issued: string
  requested: string
  expiryDate: string
  competencyReeval: string
  scores: Scores | null
}

const ACADEMIC = [
  { label: '대졸 이상', point: 25 },
  { label: '초대졸', point: 20 },
  { label: '고졸', point: 15 },
]
const EDUCATION = [
  { label: '20H 이상', point: 20 },
  { label: '20H 미만', point: 15 },
  { label: '10H 미만', point: 10 },
  { label: '5h 미만', point: 5 },
]
const CAREER = [
  { label: '5년 이상', point: 25 },
  { label: '4년 미만', point: 20 },
  { label: '3년 미만', point: 15 },
  { label: '2년 미만', point: 10 },
  { label: '1년 미만', point: 5 },
]

/** 학력 25 · 교육 20 · 숙련도 20 · 경력 25 · 평가구분 10 */
const SCORE_TOTAL_MAX = 100
const SKILL_ROWS_BY_EVAL: Record<EvalSheetKind, string[]> = {
  inspector: ['제품 도면 해독', '제품 도금두께 측정', '측정기 운영', '제품 목시검사'],
  'internal-audit': [
    'ISO 9001 · IATF 16949 요구사항 이해',
    '고객 및 Core Tools 요구사항 이해',
    '내부심사 운영 및 종결 방법 이해',
    '제품 요구사항 및 적합성 검증 방법 이해',
  ],
}

function skillRowsFor(evalType: EvalSheetKind) {
  return SKILL_ROWS_BY_EVAL[evalType]
}
const SKILL_SCALE = [5, 4, 3, 2, 1]
const EVAL_EXAM_MAX = 10
const EVAL_EXAM_SCALE = [10, 9, 8, 7, 6, 5, 4, 3, 2, 1]

function evalExamItemLabel(evalType: EvalSheetKind) {
  return evalType === 'inspector' ? '검사원 평가' : '내부심사원 평가'
}

type GrantStepStatus = 'check' | 'done' | 'wait'

const GRANT_STEP_STATUS: Record<GrantStepStatus, { label: string; className: string }> = {
  check: { label: '확인필요', className: 'border-amber-200 bg-amber-50 text-amber-800' },
  done: { label: '완료', className: 'border-emerald-200 bg-emerald-50 text-emerald-800' },
  wait: { label: '대기', className: 'border-slate-200 bg-slate-100 text-slate-600' },
}

const GRANT_STATUS_CYCLE: GrantStepStatus[] = ['check', 'done', 'wait']

const DEFAULT_GRANT_STATUSES: GrantStepStatus[] = ['check', 'done', 'check', 'check', 'check', 'wait']

const GRANT_STEP_AUTO_INDEX = 4

type PracticalGate = 'unevaluated' | 'pass' | 'fail'

const PRACTICAL_GATE_CYCLE: PracticalGate[] = ['unevaluated', 'pass', 'fail']

type InspectorPracticalItemId = 'standard' | 'visual' | 'thickness' | 'recording'

type InspectorPracticalItemState = {
  verdict: PracticalGate
  score: string
  effectiveness: string
  deviation: string
  grr: string
  errors: string
}

const INSPECTOR_PRACTICAL_ITEM_IDS: InspectorPracticalItemId[] = ['standard', 'visual', 'thickness', 'recording']

const INSPECTOR_PRACTICAL_ITEMS: {
  id: InspectorPracticalItemId
  no: string
  title: string
  subtitle: string
  core?: boolean
  fields: 'score' | 'effectiveness' | 'thickness' | 'errors'
  basis: string
}[] = [
  {
    id: 'standard',
    no: '①',
    title: '검사기준서·한도견본',
    subtitle: '필기 또는 구술',
    fields: 'score',
    basis: '기준: 80점 이상 (확정 필요)',
  },
  {
    id: 'visual',
    no: '②',
    title: '외관 판정 능력',
    subtitle: '양품·불량 혼합 시편 반복 판정',
    core: true,
    fields: 'effectiveness',
    basis: '기준: 판정 유효성 90% 이상 (AIAG MSA 계수형)',
  },
  {
    id: 'thickness',
    no: '③',
    title: '도금두께 측정',
    subtitle: '표준시편 측정 · Gage R&R',
    core: true,
    fields: 'thickness',
    basis: '기준: 허용오차 이내 · GR&R 수용',
  },
  {
    id: 'recording',
    no: '④',
    title: '기록·판정 절차',
    subtitle: '실습: 성적서·표찰·대장',
    fields: 'errors',
    basis: '기준: 누락·오기 0건',
  },
]

function emptyInspectorPracticalState(): Record<InspectorPracticalItemId, InspectorPracticalItemState> {
  return {
    standard: { verdict: 'unevaluated', score: '', effectiveness: '', deviation: '', grr: '', errors: '' },
    visual: { verdict: 'unevaluated', score: '', effectiveness: '', deviation: '', grr: '', errors: '' },
    thickness: { verdict: 'unevaluated', score: '', effectiveness: '', deviation: '', grr: '', errors: '' },
    recording: { verdict: 'unevaluated', score: '', effectiveness: '', deviation: '', grr: '', errors: '' },
  }
}

function inspectorPracticalGateFromItems(items: Record<InspectorPracticalItemId, InspectorPracticalItemState>): PracticalGate {
  const verdicts = INSPECTOR_PRACTICAL_ITEM_IDS.map((id) => items[id]?.verdict ?? 'unevaluated')
  if (verdicts.some((v) => v === 'fail')) return 'fail'
  if (verdicts.every((v) => v === 'pass')) return 'pass'
  return 'unevaluated'
}

function grantProcedureStepDefs(formKind: EvalSheetKind, total: number | null) {
  const passLine = passThreshold(formKind)
  const listRecord = formKind === 'internal-audit' ? '내부심사원 명단' : '검사원 명단'
  return [
    { no: '①', title: '선정', requirement: '경력 1년 이상', record: '명단(후보)' },
    { no: '②', title: '교육', requirement: 'IATF · Core Tools', record: '교육일지 20HR' },
    { no: '③', title: '참관', requirement: '심사 1회 이상 참관', record: '참관 기록' },
    { no: '④', title: '공동심사', requirement: '심사원과 1회 이상', record: '심사보고서' },
    {
      no: '⑤',
      title: '평가',
      requirement: `평가표 ${passLine}점 이상`,
      record: total != null ? `평가서 ${total}점` : '평가서 —',
    },
    { no: '⑥', title: '자격부여', requirement: '품질관리부장 승인', record: listRecord },
  ]
}

function mergeGrantSteps(
  defs: ReturnType<typeof grantProcedureStepDefs>,
  statuses: GrantStepStatus[],
  writtenOk: boolean,
) {
  return defs.map((def, index) => {
    const status =
      index === GRANT_STEP_AUTO_INDEX ? ((writtenOk ? 'done' : 'check') as GrantStepStatus) : statuses[index]
    return {
      ...def,
      status,
      statusEditable: index !== GRANT_STEP_AUTO_INDEX,
    }
  })
}

function grantProcedureRef(formKind: EvalSheetKind) {
  return formKind === 'internal-audit' ? 'WR-MP-1001 [부표2]' : 'WR-MP-1002 [부표3]'
}

function practicalCriterionLabel(formKind: EvalSheetKind) {
  return formKind === 'inspector' ? '② 실기 ①~④ 전 항목 합격' : '② 참관·공동심사 절차 완료'
}

function finalGrantVerdict(hasScores: boolean, scoreMet: boolean, practical: PracticalGate) {
  if (!hasScores || !scoreMet || practical === 'unevaluated') {
    return { label: '보류', className: 'text-sm font-bold text-amber-600' }
  }
  if (practical === 'fail') {
    return { label: '부적격', className: 'text-sm font-bold text-rose-600' }
  }
  return { label: '적격', className: 'text-sm font-bold text-emerald-700' }
}

function totalOf(scores: Scores | null) {
  if (!scores) return null
  return (
    scores.academic +
    scores.education +
    scores.skills.reduce((sum, value) => sum + value, 0) +
    scores.career +
    (scores.evalExam ?? 0)
  )
}

const SCORE_TABLE_HEAD =
  'border border-slate-300 bg-sky-100 px-2 py-2 text-xs font-bold text-slate-800 dark:border-slate-600 dark:bg-sky-950/40 dark:text-slate-100'
const SCORE_TABLE_CELL =
  'border border-slate-200 px-2 py-2.5 align-middle text-[13px] text-slate-800 dark:border-slate-600'
const SCORE_TABLE_GROUP =
  'border border-slate-200 bg-slate-50/60 px-1.5 py-2.5 align-middle text-center text-[13px] font-bold leading-snug text-slate-800 dark:border-slate-600 dark:bg-muted/20'
const SCORE_TABLE_SCORE =
  'border border-slate-200 bg-slate-50/80 px-1.5 py-2.5 text-center text-base font-bold tabular-nums text-slate-900 dark:border-slate-600 dark:bg-muted/20'
const SCORE_TABLE_ITEM =
  'font-semibold leading-snug text-slate-700 whitespace-normal break-keep dark:text-slate-200'
const SCORE_TABLE_CRITERIA =
  'border border-slate-200 px-1.5 py-2.5 align-middle text-[13px] text-slate-800 dark:border-slate-600'

/** 숙련도 5·4·3·2·1 — 열 정렬용 */
const SCORE_SKILL_GRID = 'grid grid-cols-5 gap-1 print:hidden'
/** 학력·교육·경력 — 가변 너비 pill */
const SCORE_OPTION_ROW = 'flex flex-wrap items-center gap-1.5 print:hidden'

function scoreSkillChoiceTone(point: number, selected: number) {
  return cn(
    'inline-flex size-9 shrink-0 items-center justify-center rounded-md border text-sm font-bold tabular-nums transition-colors',
    point === selected
      ? 'border-transparent bg-[#00875A] text-white shadow-sm'
      : 'border-slate-300 bg-white text-slate-800 hover:border-emerald-600/45 dark:border-slate-500 dark:bg-background',
  )
}

function scoreOptionChoiceTone(point: number, selected: number) {
  return cn(
    'rounded-md border px-2 py-2 text-center text-xs font-semibold leading-tight whitespace-nowrap transition-colors',
    point === selected
      ? 'border-transparent bg-[#00875A] text-white shadow-sm'
      : 'border-slate-300 bg-white text-slate-800 hover:border-emerald-600/45 dark:border-slate-500 dark:bg-background',
  )
}

function evalRoleBadgeClass(evalType: EvalSheetKind) {
  return evalType === 'internal-audit'
    ? 'bg-violet-100 text-violet-800 ring-1 ring-violet-200/80 dark:bg-violet-500/15 dark:text-violet-300 dark:ring-violet-500/30'
    : 'bg-sky-100 text-sky-800 ring-1 ring-sky-200/80 dark:bg-sky-500/15 dark:text-sky-300 dark:ring-sky-500/30'
}

function toDateInput(value: string) {
  const trimmed = value.trim()
  if (!trimmed) return ''
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed
  const match = trimmed.match(/^(\d{4})[./-](\d{1,2})[./-](\d{1,2})$/)
  if (!match) return ''
  return `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`
}

function formatSheetDate(value: string) {
  const iso = toDateInput(value)
  return iso ? iso.replaceAll('-', '.') : ''
}

function formatListExpiry(expiryDate: string) {
  return formatSheetDate(expiryDate) || '(미기재)'
}

function withCurrentOption(options: readonly string[], current: string) {
  const trimmed = current.trim()
  if (trimmed && !options.includes(trimmed)) return [trimmed, ...options]
  return [...options]
}

const AUDIT_TYPE_OPTIONS = ['신규', '재평가', '정기', '특별'] as const

function evalRoleFromKind(kind: EvalSheetKind) {
  return kind === 'inspector'
    ? { role: '검사원', qual: '검사원' }
    : { role: '내부심사원', qual: '내부심사원' }
}

function passThreshold(evalType: EvalSheetKind) {
  return evalType === 'internal-audit' ? 80 : 60
}

function writtenVerdict(evalType: EvalSheetKind, total: number | null): '적격' | '미달' | null {
  if (total == null) return null
  return total >= passThreshold(evalType) ? '적격' : '미달'
}

export function SuitabilitySheet() {
  const { user } = useAuth()
  const canPersist = user?.role === 'admin'
  const [people, setPeople] = useState<Person[]>([])
  const [sheetLoading, setSheetLoading] = useState(true)
  const [hydrated, setHydrated] = useState(false)
  const ledgerIdsRef = useRef<Set<string>>(new Set())
  const [departments, setDepartments] = useState<string[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [sheetTab, setSheetTab] = useState<'all' | EvalSheetKind>('all')
  const [formKind, setFormKind] = useState<EvalSheetKind>('inspector')
  const [step, setStep] = useState<ApprovalStep>('작성')
  const [approvalNames, setApprovalNames] = useState<Record<ApprovalStep, string>>({ 작성: '', 검토: '', 승인: '' })
  const [approvalSigns, setApprovalSigns] = useState<Partial<Record<ApprovalStep, string>>>({})
  const [grantStatusesByPerson, setGrantStatusesByPerson] = useState<Record<string, GrantStepStatus[]>>({})
  const [practicalGateByPerson, setPracticalGateByPerson] = useState<Record<string, PracticalGate>>({})
  const [inspectorPracticalByPerson, setInspectorPracticalByPerson] = useState<
    Record<string, Record<InspectorPracticalItemId, InspectorPracticalItemState>>
  >({})
  const [pipelineActiveByPerson, setPipelineActiveByPerson] = useState<Record<string, string>>({})
  const filteredPeople = useMemo(() => {
    if (sheetTab === 'all') return people
    return people.filter((item) => item.evalType === sheetTab)
  }, [people, sheetTab])

  const tabCounts = useMemo(
    () => ({
      all: people.length,
      'internal-audit': people.filter((item) => item.evalType === 'internal-audit').length,
      inspector: people.filter((item) => item.evalType === 'inspector').length,
    }),
    [people],
  )

  useEffect(() => {
    if (!filteredPeople.some((item) => item.id === selectedId) && filteredPeople[0]) {
      setSelectedId(filteredPeople[0].id)
    }
  }, [filteredPeople, selectedId])

  useEffect(() => {
    fetch('/api/organization', { cache: 'no-store' })
      .then((response) => response.json())
      .then((result) => {
        const list = Array.isArray(result.data?.departments) ? result.data.departments : []
        const names = list
          .map((department: { name?: string }) => (typeof department.name === 'string' ? department.name.trim() : ''))
          .filter(Boolean)
          .sort((a: string, b: string) => a.localeCompare(b, 'ko'))
        setDepartments(names)
      })
      .catch(() => setDepartments([]))
  }, [])

  useEffect(() => {
    let cancelled = false
    setSheetLoading(true)
    Promise.all([
      fetch('/api/quality/qualifications', { cache: 'no-store' }),
      fetch('/api/quality/suitability', { cache: 'no-store' }),
    ])
      .then(async ([ledgerRes, storeRes]) => {
        const ledgerJson = await ledgerRes.json()
        const storeJson = await storeRes.json()
        if (cancelled) return

        const rows: QualificationLedgerRow[] = Array.isArray(ledgerJson.data) ? ledgerJson.data : []
        const store = (storeJson.data ?? null) as SuitabilitySheetPersisted | null
        ledgerIdsRef.current = new Set(rows.map((row) => row.id))
        const merged = mergeLedgerRowsWithSuitabilityStore(rows, store)
        setPeople(merged as Person[])

        if (store?.grantStatusesByPerson) {
          setGrantStatusesByPerson(store.grantStatusesByPerson as Record<string, GrantStepStatus[]>)
        }
        if (store?.practicalGateByPerson) {
          setPracticalGateByPerson(store.practicalGateByPerson as Record<string, PracticalGate>)
        }
        if (store?.inspectorPracticalByPerson) {
          setInspectorPracticalByPerson(
            store.inspectorPracticalByPerson as Record<
              string,
              Record<InspectorPracticalItemId, InspectorPracticalItemState>
            >,
          )
        }
        if (store?.pipelineActiveByPerson) {
          setPipelineActiveByPerson(store.pipelineActiveByPerson)
        }

        setHydrated(true)
        if (merged.length > 0) {
          setSelectedId((prev) => (merged.some((item) => item.id === prev) ? prev : merged[0]!.id))
        }
      })
      .catch(() => toast.error('적격성평가서·대장 데이터를 불러오지 못했습니다.'))
      .finally(() => {
        if (!cancelled) setSheetLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [])

  const persistSuitability = useCallback(async (): Promise<boolean> => {
    if (!user || !canPersist) return false
    const ledgerIds = ledgerIdsRef.current
    const payload: SuitabilitySheetPersisted = {
      overlays: extractOverlaysFromPeople(people as SuitabilityDraftPerson[], ledgerIds),
      extraPeople: people.filter((item) => !ledgerIds.has(item.id)) as SuitabilityDraftPerson[],
      grantStatusesByPerson: grantStatusesByPerson as Record<string, string[]>,
      practicalGateByPerson,
      inspectorPracticalByPerson,
      pipelineActiveByPerson,
    }

    const response = await fetch('/api/quality/suitability', {
      method: 'PUT',
      headers: getJsonAuthHeaders(user),
      body: JSON.stringify({ data: payload }),
    })
    if (!response.ok) return false

    const ledgerRes = await fetch('/api/quality/qualifications', { cache: 'no-store' })
    const ledgerJson = await ledgerRes.json()
    if (!Array.isArray(ledgerJson.data)) return false

    const nextRows = (ledgerJson.data as QualificationLedgerRow[]).map((row) => {
      if (!ledgerIds.has(row.id)) return row
      const linked = people.find((item) => item.id === row.id)
      return { ...row, suitabilityOnFile: linked?.scores != null }
    })

    const ledgerPut = await fetch('/api/quality/qualifications', {
      method: 'PUT',
      headers: getJsonAuthHeaders(user),
      body: JSON.stringify({ rows: nextRows, detail: '적격성평가서 연동' }),
    })
    return ledgerPut.ok
  }, [
    canPersist,
    grantStatusesByPerson,
    people,
    pipelineActiveByPerson,
    practicalGateByPerson,
    inspectorPracticalByPerson,
    user,
  ])

  useEffect(() => {
    if (!hydrated) return
    const timer = window.setTimeout(() => {
      void persistSuitability()
    }, 900)
    return () => window.clearTimeout(timer)
  }, [hydrated, persistSuitability])

  const person = people.find((item) => item.id === selectedId) ?? null
  const total = totalOf(person?.scores ?? null)
  const passLine = passThreshold(formKind)
  const writtenOk = (total ?? 0) >= passLine
  const grantStepDefs = useMemo(() => grantProcedureStepDefs(formKind, total), [formKind, total])
  const grantStatuses = person ? grantStatusesByPerson[person.id] ?? DEFAULT_GRANT_STATUSES : DEFAULT_GRANT_STATUSES
  const grantSteps = useMemo(
    () => mergeGrantSteps(grantStepDefs, grantStatuses, writtenOk),
    [grantStepDefs, grantStatuses, writtenOk],
  )
  const grantRef = grantProcedureRef(formKind)

  const cycleGrantStepStatus = (index: number) => {
    if (!person || index === GRANT_STEP_AUTO_INDEX) return
    setGrantStatusesByPerson((prev) => {
      const current = [...(prev[person.id] ?? DEFAULT_GRANT_STATUSES)]
      const status = current[index]
      const next = GRANT_STATUS_CYCLE[(GRANT_STATUS_CYCLE.indexOf(status) + 1) % GRANT_STATUS_CYCLE.length]
      current[index] = next
      return { ...prev, [person.id]: current }
    })
  }

  const inspectorPracticalItems = useMemo(
    () =>
      person
        ? { ...emptyInspectorPracticalState(), ...(inspectorPracticalByPerson[person.id] ?? {}) }
        : emptyInspectorPracticalState(),
    [person, inspectorPracticalByPerson],
  )
  const practicalGate = useMemo(() => {
    if (person && formKind === 'inspector') {
      return inspectorPracticalGateFromItems(inspectorPracticalItems)
    }
    return person ? practicalGateByPerson[person.id] ?? 'unevaluated' : 'unevaluated'
  }, [person, formKind, inspectorPracticalItems, practicalGateByPerson])
  const pipelineSteps = GRANT_PIPELINE[formKind]
  const pipelineActive = person ? pipelineActiveByPerson[person.id] ?? DEFAULT_PIPELINE_ACTIVE[formKind] : DEFAULT_PIPELINE_ACTIVE[formKind]
  const grantManagementRows = GRANT_MANAGEMENT_ROWS[formKind]
  const hasScores = person?.scores != null
  const scoreCriterionMet = hasScores && writtenOk
  const finalVerdict = finalGrantVerdict(hasScores, writtenOk, practicalGate)

  const cyclePracticalGate = () => {
    if (!person || formKind === 'inspector') return
    setPracticalGateByPerson((prev) => {
      const current = prev[person.id] ?? 'unevaluated'
      const next = PRACTICAL_GATE_CYCLE[(PRACTICAL_GATE_CYCLE.indexOf(current) + 1) % PRACTICAL_GATE_CYCLE.length]
      return { ...prev, [person.id]: next }
    })
  }

  const patchInspectorPractical = (
    itemId: InspectorPracticalItemId,
    patch: Partial<InspectorPracticalItemState>,
  ) => {
    if (!person) return
    setInspectorPracticalByPerson((prev) => {
      const current = { ...emptyInspectorPracticalState(), ...(prev[person.id] ?? {}) }
      const nextItems = { ...current, [itemId]: { ...current[itemId], ...patch } }
      return { ...prev, [person.id]: nextItems }
    })
  }

  const setPipelineActive = (stepId: string) => {
    if (!person) return
    setPipelineActiveByPerson((prev) => ({ ...prev, [person.id]: stepId }))
  }
  const scoreQualified = total != null && writtenOk
  const formMeta = EVAL_FORM_OPTIONS.find((item) => item.id === formKind) ?? EVAL_FORM_OPTIONS[0]
  const skillRows = skillRowsFor(formKind)

  useEffect(() => {
    if (!person) return
    setFormKind(person.evalType)
  }, [person])

  const selectSheetTab = (tab: 'all' | EvalSheetKind) => {
    setSheetTab(tab)
    if (tab === 'all') return
    setFormKind(tab)
    const pool = people.filter((item) => item.evalType === tab)
    if (pool.length && !pool.some((item) => item.id === selectedId)) {
      setSelectedId(pool[0].id)
    }
  }

  const signApproval = (label: ApprovalStep) => {
    if (approvalSigns[label]) {
      setApprovalSigns((prev) => {
        const next = { ...prev }
        delete next[label]
        return next
      })
      setApprovalNames((prev) => ({ ...prev, [label]: '' }))
      return
    }
    if (!user?.hasSignature || !user.id) {
      toast.error('오른쪽 위 내 정보에서 서명 그림을 먼저 올려 주세요.')
      return
    }
    setApprovalSigns((prev) => ({ ...prev, [label]: user.id }))
    if (!approvalNames[label].trim() && user.displayName) {
      setApprovalNames((prev) => ({ ...prev, [label]: user.displayName ?? '' }))
    }
  }

  const summary = useMemo(() => {
    const withSheet = people.filter((item) => totalOf(item.scores) != null)
    const written = withSheet.length
    const passed = withSheet.filter((item) => (totalOf(item.scores) ?? 0) >= 60).length
    const failed = written - passed
    const totals = withSheet.map((item) => totalOf(item.scores)!)
    const average = totals.length ? Math.round(totals.reduce((sum, value) => sum + value, 0) / totals.length) : 0
    const expiring2027 = people.filter((item) => item.competencyReeval.replace(/\D/g, '').startsWith('2027')).length
    const missingExpiry = people.filter((item) => !item.competencyReeval.trim() && !item.expiryDate.trim())
    const missingSheet = people.filter((item) => totalOf(item.scores) == null)
    return {
      written,
      passed,
      failed,
      average,
      expiring2027,
      missingExpiry,
      missingSheet,
      writtenNames: withSheet.map((item) => item.name).join(' · '),
      missingExpiryNames: missingExpiry.map((item) => item.name).join(' · '),
    }
  }, [people])

  const patchScores = (next: Scores) => {
    if (!person) return
    setPeople((prev) => prev.map((item) => (item.id === person.id ? { ...item, scores: next } : item)))
  }

  const patchPerson = (updates: Partial<Person>) => {
    if (!person) return
    setPeople((prev) =>
      prev.map((item) => {
        if (item.id !== person.id) return item
        const merged = { ...item, ...updates }
        if (updates.dept !== undefined || updates.title !== undefined) {
          const dept = updates.dept ?? item.dept
          const title = updates.title ?? item.title
          if (dept.trim() || title.trim()) {
            merged.meta = [dept.trim(), title.trim()].filter(Boolean).join(' · ')
          }
        }
        return merged
      }),
    )
  }

  const changePersonEvalType = (kind: EvalSheetKind) => {
    if (!person) return
    const { role, qual } = evalRoleFromKind(kind)
    const skills = person.scores?.skills ?? [0, 0, 0, 0]
    patchPerson({
      evalType: kind,
      role,
      qual,
      scores: person.scores ? { ...person.scores, skills: skills.map(() => 0) } : null,
    })
    setPipelineActiveByPerson((prev) => ({
      ...prev,
      [person.id]: DEFAULT_PIPELINE_ACTIVE[kind],
    }))
  }

  const baseScores = (): Scores =>
    person?.scores ?? { academic: 0, education: 0, skills: [0, 0, 0, 0], career: 0, evalExam: 0 }

  const bars = person?.scores
    ? [
        { label: '학력', value: person.scores.academic, max: 25 },
        { label: '교육', value: person.scores.education, max: 20 },
        { label: '숙련도', value: person.scores.skills.reduce((sum, value) => sum + value, 0), max: 20 },
        { label: '경력', value: person.scores.career, max: 25 },
        { label: '평가구분', value: person.scores.evalExam ?? 0, max: EVAL_EXAM_MAX },
      ]
    : []

  const printEvaluationSheet = useCallback(() => {
    if (!person) {
      toast.error('출력할 평가 대상을 선택하세요.')
      return
    }
    const previousTitle = document.title
    const root = document.documentElement
    const sheet = document.querySelector('.suitability-one-page')
    const hidden: HTMLElement[] = []
    const conceal = (element: Element) => {
      if (!(element instanceof HTMLElement)) return
      if (element === sheet) return
      if (sheet && element.contains(sheet)) {
        ;[...element.children].forEach(conceal)
        return
      }
      hidden.push(element)
      element.dataset.printHidden = element.style.display
      element.style.setProperty('display', 'none', 'important')
    }
    if (sheet) conceal(document.body)
    root.classList.add('suitability-print-root')
    document.body.classList.add('suitability-print')
    document.title = `적격성평가서_${person.name}`
    const restore = () => {
      hidden.forEach((element) => {
        element.style.display = element.dataset.printHidden ?? ''
        delete element.dataset.printHidden
      })
      document.body.classList.remove('suitability-print')
      root.classList.remove('suitability-print-root')
      document.title = previousTitle
      window.removeEventListener('afterprint', restore)
    }
    window.addEventListener('afterprint', restore)
    window.print()
  }, [person])

  const subjectRows: [string, string][] = person
    ? [
    ['성명', person.name],
    ['부서명', person.dept],
    ['직책', person.title],
    ['현 직무', person.duty],
    ['자격 구분', person.qual],
    ['심사 유형', person.auditType || '—'],
    ['요청 부서', person.requestDept || '—'],
    ['요청 일자', formatSheetDate(person.requested) || '미입력'],
    ['자격 발급일', formatSheetDate(person.issued) || '—'],
    ['자격 만료일', formatSheetDate(person.expiryDate) || '(미기재)'],
    ['인증번호', person.certNo],
    ['역량 재평가', formatSheetDate(person.competencyReeval) || '(미기재)'],
  ]
    : []
  const approvalBadge = sheetApprovalStatus(approvalSigns)
  const educationLabel = formKind === 'inspector' ? '검사원 교육 이수' : '내부심사원 교육 이수'
  const selectedLabel = (options: { label: string; point: number }[], point: number) =>
    options.find((option) => option.point === point)?.label ?? '—'

  return (
    <div className="suitability-sheet-print flex flex-col gap-3">
      {person && (
      <article className="suitability-one-page">
        <header className="suitability-one-head">
          <h2>적격성평가서 ({formMeta.label})</h2>
          <table className="suitability-one-approval">
            <tbody>
              <tr>
                <th rowSpan={3} className="suit-print-approval-label">
                  결재
                </th>
                {APPROVAL_STEPS.map((label) => (
                  <th key={label}>{label}</th>
                ))}
              </tr>
              <tr>
                {APPROVAL_STEPS.map((label) => (
                  <td key={label} className="suit-print-approval-sign">
                    {approvalSigns[label] ? (
                      <img
                        src={`/api/auth/signature?userId=${encodeURIComponent(approvalSigns[label])}`}
                        alt={`${label} 서명`}
                      />
                    ) : null}
                  </td>
                ))}
              </tr>
              <tr>
                {APPROVAL_STEPS.map((label) => (
                  <td key={`${label}-name`}>{approvalNames[label]}</td>
                ))}
              </tr>
            </tbody>
          </table>
        </header>
        <h3>평가 대상자</h3>
        <table className="suitability-one-subject">
          <colgroup>
            {Array.from({ length: 6 }, (_, index) => (
              <col key={index} />
            ))}
          </colgroup>
          <tbody>
            {[0, 1].map((row) => {
              const cells = subjectRows.slice(row * 6, row * 6 + 6)
              return (
                <Fragment key={row}>
                  <tr>
                    {cells.map(([label]) => (
                      <th key={label} scope="col">{label}</th>
                    ))}
                  </tr>
                  <tr>
                    {cells.map(([label, value]) => (
                      <td key={label}>{value}</td>
                    ))}
                  </tr>
                </Fragment>
              )
            })}
          </tbody>
        </table>
        {formKind === 'inspector' ? (
          <>
            <h3>실기 평가 · 4개 항목 모두 합격 필수</h3>
            <table className="suitability-one-extra suitability-one-extra-practical">
              <thead>
                <tr>
                  <th>항목</th>
                  <th>내용</th>
                  <th>측정</th>
                  <th>기준</th>
                  <th>판정</th>
                </tr>
              </thead>
              <tbody>
                {INSPECTOR_PRACTICAL_ITEMS.map((def) => {
                  const row = inspectorPracticalItems[def.id]
                  const measure =
                    def.fields === 'score'
                      ? row.score || '—'
                      : def.fields === 'effectiveness'
                        ? row.effectiveness ? `${row.effectiveness}%` : '—'
                        : def.fields === 'thickness'
                          ? `편차 ${row.deviation || '—'} · GRR ${row.grr || '—'}%`
                          : row.errors ? `${row.errors}건` : '—'
                  const verdict = row.verdict === 'pass' ? '합격' : row.verdict === 'fail' ? '불합격' : '미평가'
                  return (
                    <tr key={def.id}>
                      <td>{def.no} {def.title}{def.core ? ' (핵심)' : ''}</td>
                      <td>{def.subtitle}</td>
                      <td>{measure}</td>
                      <td>{def.basis.replace(/^기준:\s*/, '')}</td>
                      <td>{verdict}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </>
        ) : (
          <>
            <h3>자격부여 절차</h3>
            <table className="suitability-one-extra suitability-one-extra-grant">
              <thead>
                <tr>
                  <th>단계</th>
                  <th>요건</th>
                  <th>기록</th>
                  <th>상태</th>
                </tr>
              </thead>
              <tbody>
                {grantSteps.map((step) => (
                  <tr key={step.title}>
                    <td>{step.no} {step.title}</td>
                    <td>{step.requirement}</td>
                    <td>{step.record}</td>
                    <td>{GRANT_STEP_STATUS[step.status].label}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
        <h3>적격성 평가 항목 및 점수</h3>
        <table className="suitability-one-scores">
          <colgroup>
            <col className="group" />
            <col />
            <col />
            <col className="score" />
          </colgroup>
          <thead>
            <tr>
              <th className="suit-print-col-group">구분</th>
              <th className="suit-print-col-item">평가 항목</th>
              <th className="suit-print-col-select">선택</th>
              <th className="suit-print-col-score">점수</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="suit-print-col-group">학력<br />25점</td>
              <td className="suit-print-col-item">최종학력</td>
              <td className="suit-print-col-select">{selectedLabel(ACADEMIC, person.scores?.academic ?? 0)}</td>
              <td className="suit-print-col-score">{person.scores?.academic || '—'}</td>
            </tr>
            <tr>
              <td className="suit-print-col-group">교육<br />20점</td>
              <td className="suit-print-col-item">{educationLabel}</td>
              <td className="suit-print-col-select">{selectedLabel(EDUCATION, person.scores?.education ?? 0)}</td>
              <td className="suit-print-col-score">{person.scores?.education || '—'}</td>
            </tr>
            {skillRows.map((label, index) => (
              <tr key={label}>
                {index === 0 && (
                  <td rowSpan={skillRows.length} className="suit-print-col-group">
                    숙련도<br />20점
                  </td>
                )}
                <td className="suit-print-col-item">{label}</td>
                <td className="suit-print-col-select">{person.scores?.skills[index] ?? '—'}</td>
                <td className="suit-print-col-score">{person.scores?.skills[index] || '—'}</td>
              </tr>
            ))}
            <tr>
              <td className="suit-print-col-group">경력<br />25점</td>
              <td className="suit-print-col-item">근무기간</td>
              <td className="suit-print-col-select">{selectedLabel(CAREER, person.scores?.career ?? 0)}</td>
              <td className="suit-print-col-score">{person.scores?.career || '—'}</td>
            </tr>
            <tr>
              <td className="suit-print-col-group">평가구분<br />10점</td>
              <td className="suit-print-col-item">{evalExamItemLabel(person.evalType)}</td>
              <td className="suit-print-col-select">
                {person.scores?.evalExam != null && person.scores.evalExam > 0
                  ? `${person.scores.evalExam}점 / ${EVAL_EXAM_MAX}문항`
                  : '—'}
              </td>
              <td className="suit-print-col-score">{person.scores?.evalExam || '—'}</td>
            </tr>
          </tbody>
        </table>
        <p className="suitability-one-total">합계 {total ?? '—'} / {SCORE_TOTAL_MAX}점 · 합격 기준 {passLine}점</p>
      </article>
      )}
      <div className="no-print grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <SummaryCard
          label="적격성평가서"
          value={`${summary.written}건`}
          sub={summary.writtenNames || '작성 완료 없음'}
          subNames={summary.written > 0}
        />
        <SummaryCard
          label="적격판정"
          value={`${summary.passed}건`}
          sub={summary.failed > 0 ? `적격 ${summary.passed} · 미달 ${summary.failed}` : '60점 이상 적격'}
        />
        <SummaryCard
          label="평균 점수"
          value={summary.written > 0 ? `${summary.average}점` : '—'}
          sub={summary.written > 0 ? `작성 ${summary.written}명 기준` : '평가서 작성 후 집계'}
        />
        <SummaryCard label="2027년 만료" value={`${summary.expiring2027}건`} sub="갱신·만료 예정" />
        <SummaryCard
          label="만료일 미기재"
          value={`${summary.missingExpiry.length}명`}
          sub={summary.missingExpiryNames || '—'}
          subNames={summary.missingExpiry.length > 0}
        />
        <SummaryCard label="합격 기준" value="60점" sub="점수 + 실기·절차 충족" />
      </div>

      <div className="suitability-print-layout grid items-start gap-3 lg:grid-cols-[minmax(15rem,17.5rem)_minmax(0,1fr)_280px] lg:items-stretch">
        <section className="no-print flex min-h-0 flex-col rounded-2xl border border-slate-200 bg-card p-3 shadow-sm dark:border-slate-700">
          <div className="flex shrink-0 items-center justify-between gap-2 border-b border-slate-100 pb-2.5 dark:border-border">
            <SheetSectionHeading no="01">평가서 목록</SheetSectionHeading>
            <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-slate-600 dark:bg-muted dark:text-slate-300">
              {filteredPeople.length}명
            </span>
          </div>
          <div
            role="tablist"
            aria-label="평가서 구분"
            className="mt-3 flex gap-1 rounded-full bg-slate-100 p-1 dark:bg-muted"
          >
            {EVAL_SHEET_TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={sheetTab === tab.id}
                onClick={() => selectSheetTab(tab.id)}
                className={cn(
                  'flex flex-1 items-center justify-center gap-1 rounded-full px-1 py-1.5 text-xs transition-colors',
                  sheetTab === tab.id
                    ? 'bg-white font-bold text-emerald-700 shadow-sm dark:bg-card dark:text-emerald-400'
                    : 'font-medium text-slate-500 hover:text-slate-800 dark:text-slate-400',
                )}
              >
                <span>{tab.label}</span>
                <span className={cn('tabular-nums', sheetTab === tab.id ? 'text-emerald-600' : 'text-slate-400')}>
                  {tabCounts[tab.id]}
                </span>
              </button>
            ))}
          </div>
          <ul className="mt-3 min-h-0 flex-1 space-y-2 overflow-y-auto pr-0.5">
            {sheetLoading && (
              <li className="rounded-xl border border-dashed border-slate-200 px-3 py-8 text-center text-xs text-slate-400">
                불러오는 중…
              </li>
            )}
            {!sheetLoading && filteredPeople.length === 0 && (
              <li className="rounded-xl border border-dashed border-slate-200 px-3 py-8 text-center text-xs text-slate-400">
                등록된 평가 대상이 없습니다.
              </li>
            )}
            {filteredPeople.map((item) => {
              const itemTotal = totalOf(item.scores)
              const verdict = writtenVerdict(item.evalType, itemTotal)
              const active = item.id === person?.id
              const place = [item.dept, item.title].filter(Boolean).join(' · ')
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(item.id)}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors',
                      active
                        ? 'border-emerald-200 bg-emerald-50 shadow-[inset_3px_0_0_0_#059669] dark:border-emerald-800 dark:bg-emerald-950/40'
                        : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:bg-card dark:hover:bg-muted/40',
                    )}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate text-sm font-bold text-slate-900 dark:text-slate-100">{item.name}</span>
                        <span
                          className={cn(
                            'shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none',
                            evalRoleBadgeClass(item.evalType),
                          )}
                        >
                          {item.role}
                        </span>
                      </div>
                      <p className="mt-1 truncate text-[11px] text-slate-500 dark:text-slate-400">
                        {place || '부서 미지정'}
                      </p>
                      <p className="mt-0.5 text-[11px] text-slate-400">만료 {formatListExpiry(item.expiryDate)}</p>
                      {(item.badge || item.note) && (
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {item.badge && (
                            <span className="rounded-md bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
                              {item.badge}
                            </span>
                          )}
                          {item.note && (
                            <span className="rounded-md bg-rose-50 px-1.5 py-0.5 text-[10px] font-semibold text-rose-600 dark:bg-rose-500/15 dark:text-rose-300">
                              {item.note}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="flex w-11 shrink-0 flex-col items-end">
                      <span
                        className={cn(
                          'font-bold tabular-nums leading-none',
                          itemTotal != null ? 'text-xl text-slate-900 dark:text-slate-100' : 'text-lg text-slate-300',
                        )}
                      >
                        {itemTotal ?? '—'}
                      </span>
                      {verdict && (
                        <span
                          className={cn(
                            'mt-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none',
                            verdict === '적격'
                              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300'
                              : 'bg-rose-100 text-rose-600 dark:bg-rose-500/15 dark:text-rose-300',
                          )}
                        >
                          {verdict}
                        </span>
                      )}
                    </div>
                  </button>
                </li>
              )
            })}
          </ul>
        </section>

        {person ? (
        <>
        <section className="suitability-print-main min-w-0 rounded-2xl border bg-card p-4 shadow-sm print:border-0 print:p-0 print:shadow-none">
          <div className="mb-4 hidden text-center print:block">
            <p className="text-base font-bold text-slate-900">적격성평가서 ({formMeta.label})</p>
            <p className="mt-0.5 text-xs text-slate-600">
              평가대상 {person.name} · {formMeta.basis}
            </p>
          </div>
          <header className="no-print flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-3 dark:border-border">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-lg font-bold tracking-tight text-slate-900 dark:text-slate-50">
                  적격성평가서 ({formMeta.label})
                </h3>
                <span
                  className={cn(
                    'rounded-full border px-2.5 py-0.5 text-[11px] font-bold',
                    APPROVAL_STATUS_BADGE[approvalBadge.tone],
                  )}
                >
                  {approvalBadge.label}
                </span>
              </div>
              <dl className="mt-2 flex flex-wrap gap-x-5 gap-y-1.5 text-[13px] leading-snug">
                <div className="flex gap-2">
                  <dt className="font-semibold text-slate-600 dark:text-slate-300">문서번호</dt>
                  <dd className="text-muted-foreground">—</dd>
                </div>
                <div className="flex gap-2">
                  <dt className="font-semibold text-slate-600 dark:text-slate-300">평가대상</dt>
                  <dd className="font-semibold text-slate-800 dark:text-slate-100">{person.name}</dd>
                </div>
                <div className="flex gap-2">
                  <dt className="font-semibold text-slate-600 dark:text-slate-300">평가양식</dt>
                  <dd className="font-medium text-slate-700 dark:text-slate-200">{formMeta.label}용</dd>
                </div>
                <div className="flex gap-2">
                  <dt className="font-semibold text-slate-600 dark:text-slate-300">근거</dt>
                  <dd className="font-medium text-slate-700 dark:text-slate-200">{formMeta.basis}</dd>
                </div>
              </dl>
            </div>
            <SuitabilityApprovalStrip
              step={step}
              onStep={setStep}
              names={approvalNames}
              signs={approvalSigns}
              onNameChange={(label, value) => setApprovalNames((prev) => ({ ...prev, [label]: value }))}
              onSign={signApproval}
            />
          </header>

          <div className="suitability-print-target mt-4 print:mt-0">
          <SheetSectionHeading no="02">평가 대상자</SheetSectionHeading>
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6 print:grid-cols-6 print:gap-1">
            <EditableField label="성명" value={person.name} onChange={(value) => patchPerson({ name: value })} />
            <SelectField
              label="부서명"
              value={person.dept}
              allowEmpty
              emptyLabel="부서 선택"
              options={withCurrentOption(departments, person.dept).map((item) => ({ value: item, label: item }))}
              onChange={(value) => patchPerson({ dept: value })}
            />
            <SelectField
              label="직책"
              value={person.title}
              allowEmpty
              emptyLabel="직책 선택"
              options={withCurrentOption(JOB_TITLES_MENU, person.title).map((item) => ({ value: item, label: item }))}
              onChange={(value) => patchPerson({ title: value })}
            />
            <EditableField label="현 직무" value={person.duty} onChange={(value) => patchPerson({ duty: value })} />
            <SelectField
              label="자격 구분"
              value={person.evalType}
              options={[
                { value: 'inspector', label: '검사원' },
                { value: 'internal-audit', label: '내부심사원' },
              ]}
              onChange={(value) => changePersonEvalType(value as EvalSheetKind)}
            />
            <SelectField
              label="심사 유형"
              value={person.auditType || AUDIT_TYPE_OPTIONS[0]}
              options={AUDIT_TYPE_OPTIONS.map((item) => ({ value: item, label: item }))}
              onChange={(value) => patchPerson({ auditType: value })}
            />
            <SelectField
              label="요청 부서"
              value={person.requestDept}
              allowEmpty
              emptyLabel="부서 선택"
              options={withCurrentOption(departments, person.requestDept).map((item) => ({ value: item, label: item }))}
              onChange={(value) => patchPerson({ requestDept: value })}
            />
            <DateField label="요청 일자" value={person.requested} onChange={(value) => patchPerson({ requested: value })} />
            <DateField label="자격 발급일" value={person.issued} onChange={(value) => patchPerson({ issued: value })} />
            <DateField label="자격 만료일" value={person.expiryDate} onChange={(value) => patchPerson({ expiryDate: value })} />
            <EditableField
              label="인증번호 (대장 연계)"
              value={person.certNo}
              placeholder="미입력"
              onChange={(value) => patchPerson({ certNo: value })}
            />
            <DateField
              label="역량 재평가"
              value={person.competencyReeval}
              onChange={(value) => patchPerson({ competencyReeval: value })}
            />
          </div>
          <p className="no-print mt-2 text-[11px] text-muted-foreground">
            역량 재평가 연 1회 · 입력 내용은 새로고침 시 초기화됩니다
          </p>
          </div>

          <div className="suitability-print-scores mt-5 border-t border-slate-200 pt-4 print:mt-3 print:border-0 print:pt-2 dark:border-border">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <SheetSectionHeading no="03">적격성 평가 항목 및 점수</SheetSectionHeading>
              <p className="no-print text-xs text-muted-foreground">선택 시 점수 자동 반영 · 합격 {passLine}점 이상</p>
            </div>
            <div className="mt-2 overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm print:overflow-visible print:rounded-md print:shadow-none dark:border-slate-600 dark:bg-card">
            <table className="suitability-score-table w-full min-w-[36rem] table-fixed border-collapse print:min-w-0 print:text-[10px]">
              <colgroup>
                <col style={{ width: '8%' }} />
                <col style={{ width: '36%' }} />
                <col style={{ width: '9%' }} />
                <col style={{ width: '9%' }} />
                <col style={{ width: '9%' }} />
                <col style={{ width: '9%' }} />
                <col style={{ width: '9%' }} />
                <col style={{ width: '11%' }} />
              </colgroup>
              <thead>
                <tr>
                  <th className={cn(SCORE_TABLE_HEAD, 'text-center')}>구분</th>
                  <th className={cn(SCORE_TABLE_HEAD, 'text-left')}>평가 항목</th>
                  <th className={cn(SCORE_TABLE_HEAD, 'text-center')} colSpan={5}>
                    평가 기준 (배점)
                  </th>
                  <th className={cn(SCORE_TABLE_HEAD, 'text-center')}>점수</th>
                </tr>
              </thead>
              <tbody>
                <ScaleRow
                  group="학력"
                  weight="25점"
                  item="최종학력"
                  options={ACADEMIC}
                  selected={person.scores?.academic ?? 0}
                  onSelect={(point) => patchScores({ ...baseScores(), academic: point })}
                />
                <ScaleRow
                  group="교육"
                  weight="20점"
                  item={formKind === 'inspector' ? '검사원 교육 이수' : '내부심사원 교육 이수'}
                  options={EDUCATION}
                  selected={person.scores?.education ?? 0}
                  onSelect={(point) => patchScores({ ...baseScores(), education: point })}
                />
                {skillRows.map((label, index) => (
                  <tr key={label}>
                    {index === 0 && (
                      <td rowSpan={skillRows.length} className={SCORE_TABLE_GROUP}>
                        숙련도
                        <div className="mt-0.5 text-[11px] font-medium text-muted-foreground">20점</div>
                      </td>
                    )}
                    <td className={cn(SCORE_TABLE_CELL, SCORE_TABLE_ITEM)}>{label}</td>
                    <td className={cn(SCORE_TABLE_CRITERIA)} colSpan={5}>
                      <span className="hidden font-semibold print:inline">
                        선택 {person.scores?.skills[index] ?? '—'}점
                      </span>
                      <div className={SCORE_SKILL_GRID}>
                        {SKILL_SCALE.map((point) => (
                          <button
                            key={point}
                            type="button"
                            className={cn(scoreSkillChoiceTone(point, person.scores?.skills[index] ?? 0), 'mx-auto')}
                            onClick={() => {
                              const current = baseScores()
                              const skills = [...current.skills]
                              skills[index] = point
                              patchScores({ ...current, skills })
                            }}
                          >
                            {point}
                          </button>
                        ))}
                      </div>
                    </td>
                    <td className={SCORE_TABLE_SCORE}>{person.scores?.skills[index] ?? '—'}</td>
                  </tr>
                ))}
                <ScaleRow
                  group="경력"
                  weight="25점"
                  item="근무기간"
                  options={CAREER}
                  selected={person.scores?.career ?? 0}
                  onSelect={(point) => patchScores({ ...baseScores(), career: point })}
                />
                <tr>
                  <td className={SCORE_TABLE_GROUP}>
                    평가구분
                    <div className="mt-0.5 text-[10px] font-medium text-muted-foreground">{EVAL_EXAM_MAX}점</div>
                  </td>
                  <td className={cn(SCORE_TABLE_CELL, SCORE_TABLE_ITEM)}>{evalExamItemLabel(person.evalType)}</td>
                  <td className={cn(SCORE_TABLE_CRITERIA)} colSpan={5}>
                    <span className="hidden font-semibold print:inline">
                      {person.scores?.evalExam ? `${person.scores.evalExam}점` : '—'}
                    </span>
                    <div className="grid grid-cols-5 gap-1.5 print:hidden">
                      {EVAL_EXAM_SCALE.map((point) => (
                        <button
                          key={point}
                          type="button"
                          className={cn(scoreOptionChoiceTone(point, person.scores?.evalExam ?? 0), 'min-w-0 w-full')}
                          onClick={() => patchScores({ ...baseScores(), evalExam: point })}
                        >
                          {point}
                          <span className="font-medium">점</span>
                        </button>
                      ))}
                    </div>
                  </td>
                  <td className={SCORE_TABLE_SCORE}>{person.scores?.evalExam || '—'}</td>
                </tr>
              </tbody>
            </table>
            </div>
            <p className="mt-2 hidden text-right text-xs font-bold tabular-nums print:block">
              합계 {total ?? '—'} / {SCORE_TOTAL_MAX}점 · 합격 기준 {passLine}점
            </p>
          </div>
          {!person.scores && (
            <p className="no-print mt-2 text-xs font-semibold text-rose-600">평가서가 없습니다. 항목을 선택하면 점수가 기록됩니다.</p>
          )}

          <div className="no-print mt-4">
            {formKind === 'inspector' ? (
              <InspectorPracticalEvalSection
                items={inspectorPracticalItems}
                onPatch={patchInspectorPractical}
              />
            ) : (
              <>
                <SheetSectionHeading no="04">자격부여 절차</SheetSectionHeading>
                <p className="text-xs text-muted-foreground">{grantRef} · 단계별 기록 확인 후 자격 등재</p>
                <div className="mt-2 grid grid-cols-6 gap-2">
                  {grantSteps.map((step, stepIndex) => {
                    const badge = GRANT_STEP_STATUS[step.status]
                    const badgeClass = `shrink-0 rounded-md border px-2 py-0.5 text-[11px] font-semibold leading-none ${badge.className}`
                    return (
                      <div
                        key={step.title}
                        className="min-w-0 rounded-lg border border-slate-200 bg-white px-2.5 py-2.5 shadow-sm dark:border-border dark:bg-card"
                      >
                        <div className="flex items-start justify-between gap-1.5">
                          <p className="text-[13px] font-bold leading-snug text-slate-800 dark:text-slate-100">
                            {step.no} {step.title}
                          </p>
                          {step.statusEditable ? (
                            <button
                              type="button"
                              title="클릭하여 상태 변경 (확인필요 → 완료 → 대기)"
                              onClick={() => cycleGrantStepStatus(stepIndex)}
                              className={`${badgeClass} transition-opacity hover:opacity-90`}
                            >
                              {badge.label}
                            </button>
                          ) : (
                            <span className={badgeClass} title="평가 점수에 따라 자동 반영">
                              {badge.label}
                            </span>
                          )}
                        </div>
                        <p className="mt-2 text-xs leading-snug text-slate-600 dark:text-slate-300">{step.requirement}</p>
                        <p className="mt-1.5 text-xs leading-snug text-muted-foreground">
                          <span className="font-semibold text-slate-500">기록:</span> {step.record}
                        </p>
                      </div>
                    )
                  })}
                </div>
              </>
            )}
          </div>

        </section>

        <aside className="no-print suitability-print-aside flex h-full min-h-0 flex-col gap-3 lg:sticky lg:top-4 lg:self-stretch">
          <section className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4 shadow-sm dark:border-border dark:bg-muted/20">
            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">평가 결과</h3>
            <div className="mt-3 flex items-start justify-between gap-2">
              <p className="text-[2.5rem] font-extrabold leading-none tabular-nums text-blue-600 dark:text-blue-400">
                {total ?? '—'}
                <span className="ml-1 text-sm font-semibold text-slate-400">/ {SCORE_TOTAL_MAX}점</span>
              </p>
              {total != null && (
                <span
                  className={cn(
                    'mt-1 shrink-0 rounded-full border px-2.5 py-0.5 text-xs font-bold',
                    scoreQualified
                      ? 'border-emerald-200 bg-white text-emerald-700 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-400'
                      : 'border-rose-200 bg-white text-rose-700 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-400',
                  )}
                >
                  {scoreQualified ? '적격' : '미적격'}
                </span>
              )}
            </div>

            <div className="relative mt-4">
              <div className="relative h-4 overflow-hidden rounded-full bg-slate-200/90 dark:bg-muted">
                <div
                  className="absolute inset-y-0 left-0 rounded-full bg-blue-500 transition-[width]"
                  style={{ width: `${Math.min(((total ?? 0) / SCORE_TOTAL_MAX) * 100, 100)}%` }}
                />
                <div
                  className="absolute inset-y-0 z-[1] w-0.5 bg-amber-500"
                  style={{ left: `${passLine}%` }}
                  title={`합격 ${passLine}점`}
                />
              </div>
              <p
                className="absolute -bottom-4 text-[10px] font-semibold text-amber-600 dark:text-amber-400"
                style={{ left: `${passLine}%`, transform: 'translateX(-50%)' }}
              >
                합격 {passLine}
              </p>
            </div>

            <ul className="mt-8 space-y-2.5">
              {bars.map((bar) => (
                <li key={bar.label}>
                  <div className="flex justify-between text-[11px] font-medium text-slate-700 dark:text-slate-300">
                    <span>{bar.label}</span>
                    <span className="tabular-nums text-slate-500">
                      {bar.value}/{bar.max}
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-200/90 dark:bg-muted">
                    <div
                      className="h-full rounded-full bg-blue-500/90"
                      style={{ width: `${bar.max ? (bar.value / bar.max) * 100 : 0}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>

            {person.scores ? (
              formKind === 'internal-audit' ? (
                <div className="mt-4 space-y-2 border-t border-slate-200/80 pt-3 dark:border-border">
                  <p className="text-[11px] leading-relaxed text-slate-700 dark:text-slate-300">
                    {scoreQualified ? (
                      <>
                        상기자는 해당 부문의 업무를 수행하는 데 자격사항이 적격하므로 자격인증 등록대장에 등록하며, 자격인증의
                        유효기간은 2년으로 한다.
                      </>
                    ) : (
                      <>
                        상기자는 합격 기준({passLine}점)에 미달하여 자격인증 등록대장 등재를 보류한다. 항목별 배점 보완 후
                        재평가
                      </>
                    )}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    ※ 합격 기준: {passLine}점 이상 ({formMeta.passDoc})
                  </p>
                </div>
              ) : (
                <GrantFinalVerdictPanel
                  className="mt-4"
                  passLine={passLine}
                  formKind={formKind}
                  hasScores={hasScores}
                  scoreCriterionMet={scoreCriterionMet}
                  practicalGate={practicalGate}
                  finalVerdict={finalVerdict}
                  onCyclePracticalGate={cyclePracticalGate}
                />
              )
            ) : (
              <p className="mt-4 text-[11px] text-muted-foreground">평가 항목을 선택하면 결과가 집계됩니다.</p>
            )}
          </section>

          {formKind === 'internal-audit' ? (
            <section className="shrink-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-border dark:bg-card">
              <h3 className="border-b border-slate-200 bg-slate-50/80 px-3 py-2 text-sm font-bold text-slate-900 dark:border-border dark:bg-muted/20 dark:text-slate-100">
                자격 관리 기준
              </h3>
              <dl className="divide-y divide-slate-200 text-sm dark:divide-border">
                {INTERNAL_AUDIT_QUAL_CRITERIA.map((row) => (
                  <div key={row.term} className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-2 px-3 py-2.5">
                    <dt className="font-bold text-slate-800 dark:text-slate-200">{row.term}</dt>
                    <dd className="whitespace-pre-wrap leading-relaxed text-slate-600 dark:text-slate-400">{row.detail}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ) : (
            <section className="shrink-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-border dark:bg-card">
              <h3 className="border-b border-slate-200 bg-slate-50/80 px-3 py-2 text-sm font-bold text-slate-900 dark:border-border dark:bg-muted/20 dark:text-slate-100">
                자격 부여 · 관리 기준
              </h3>
              <div className="border-b border-dashed border-slate-200 px-2.5 py-2.5 dark:border-border">
                <GrantPipelineFlow steps={pipelineSteps} activeId={pipelineActive} onSelect={setPipelineActive} />
              </div>
              <dl className="divide-y divide-dashed divide-slate-200 text-sm dark:divide-border">
                {grantManagementRows.map((row) => (
                  <div key={row.term} className="grid grid-cols-[3.5rem_minmax(0,1fr)] gap-2 px-3 py-2.5">
                    <dt className="font-bold text-slate-800 dark:text-slate-200">{row.term}</dt>
                    <dd className="whitespace-pre-wrap leading-relaxed text-slate-600 dark:text-slate-400">{row.detail}</dd>
                  </div>
                ))}
              </dl>
            </section>
          )}

          <section className="no-print mt-auto shrink-0 rounded-2xl border border-slate-200 bg-card p-4 shadow-sm dark:border-border">
            <p className="whitespace-pre-wrap text-center text-xs leading-relaxed text-muted-foreground">
              {'결재 승인 후 평가 점수 수정 불가 · 수정 시\n사유 입력 및 이력 기록'}
            </p>
            <div className="mt-3 space-y-2.5">
              <Button
                type="button"
                className="h-10 w-full text-sm font-semibold bg-slate-600 text-white shadow-sm hover:bg-slate-700 dark:bg-slate-500 dark:hover:bg-slate-400"
                onClick={printEvaluationSheet}
              >
                출력
              </Button>
              <div className="grid grid-cols-2 gap-2.5">
                <Button
                  type="button"
                  className="h-10 text-sm font-semibold bg-blue-600 text-white shadow-sm hover:bg-blue-700"
                  onClick={() => toast.message('결재 요청 기능은 준비 중입니다.')}
                >
                  결재 요청
                </Button>
                <Button
                  type="button"
                  className="h-10 text-sm font-semibold bg-emerald-700 text-white shadow-sm hover:bg-emerald-800"
                  disabled
                  title="준비 중"
                >
                  자격인정서 발행
                </Button>
              </div>
            </div>
          </section>
        </aside>
        </>
        ) : (
          <section className="flex min-h-80 items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-card px-6 py-16 text-center lg:col-span-2 dark:border-slate-700">
            <div>
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">등록된 평가 대상이 없습니다.</p>
              <p className="mt-1 text-xs text-muted-foreground">왼쪽에서 평가 대상을 추가한 뒤 내용을 입력하세요.</p>
            </div>
          </section>
        )}
      </div>
    </div>
  )
}

const APPROVAL_STATUS_BADGE = {
  emerald:
    'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-300',
  blue: 'border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-500/40 dark:bg-blue-500/10 dark:text-blue-300',
  amber:
    'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200',
} as const

function sheetApprovalStatus(signs: Partial<Record<ApprovalStep, string>>) {
  if (signs['승인']) return { label: '승인 완료', tone: 'emerald' as const }
  if (signs['검토']) return { label: '결재 진행', tone: 'blue' as const }
  return { label: '결재 대기', tone: 'amber' as const }
}

function SheetSectionHeading({ no, children, className }: { no: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <span
        aria-hidden
        className="inline-flex min-w-[1.625rem] shrink-0 items-center justify-center rounded-md bg-blue-600 px-1.5 py-0.5 text-xs font-bold tabular-nums leading-none text-white shadow-sm print:hidden"
      >
        {no}
      </span>
      <h4 className="text-base font-bold text-slate-900 dark:text-slate-100">
        <span className="hidden print:inline">{no}. </span>
        {children}
      </h4>
    </div>
  )
}

const SUMMARY_CARD_NAME_VISIBLE = 3

function SummaryCardOthersBadge({ names, badgeClass }: { names: string[]; badgeClass: string }) {
  const [open, setOpen] = useState(false)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  if (names.length === 0) return null
  const label = names.join(' · ')

  const show = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current)
    setOpen(true)
  }
  const hideSoon = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current)
    closeTimer.current = setTimeout(() => setOpen(false), 120)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        type="button"
        className={cn(
          badgeClass,
          'cursor-help border-dashed border-emerald-300/90 dark:border-emerald-500/50',
        )}
        aria-label={`외 ${names.length}명: ${label}`}
        onMouseEnter={show}
        onMouseLeave={hideSoon}
        onFocus={show}
        onBlur={hideSoon}
      >
        외 {names.length}명
      </PopoverTrigger>
      <PopoverContent
        side="bottom"
        align="start"
        sideOffset={6}
        className="w-max max-w-[min(18rem,calc(100vw-2rem))] p-2 text-[10px] font-semibold leading-snug"
        onMouseEnter={show}
        onMouseLeave={hideSoon}
      >
        {label}
      </PopoverContent>
    </Popover>
  )
}

function SummaryCard({
  label,
  value,
  sub,
  subNames = false,
}: {
  label: string
  value: string
  sub: string
  subNames?: boolean
}) {
  const nameParts = subNames ? sub.split(' · ').filter(Boolean) : []
  const showAll = nameParts.length <= SUMMARY_CARD_NAME_VISIBLE
  const head = showAll ? nameParts : nameParts.slice(0, SUMMARY_CARD_NAME_VISIBLE)
  const tail = showAll ? [] : nameParts.slice(SUMMARY_CARD_NAME_VISIBLE)
  const nameBadgeClass =
    'inline-flex shrink-0 rounded-md border border-emerald-200/90 bg-emerald-50 px-1.5 py-0.5 text-[11px] font-bold text-emerald-950 dark:border-emerald-500/35 dark:bg-emerald-950/50 dark:text-emerald-100'

  return (
    <article className="relative flex min-h-[5.75rem] flex-col overflow-visible rounded-2xl border bg-card px-3 py-2.5 shadow-sm">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="text-lg font-extrabold tabular-nums text-slate-900 dark:text-slate-100">{value}</p>
      {subNames && head.length > 0 ? (
        <div className="mt-auto min-w-0 overflow-visible border-t border-slate-200/90 pt-2 dark:border-border">
          <p className="flex min-w-0 flex-wrap items-center gap-1 overflow-visible">
            {head.map((name) => (
              <span key={name} className={cn(nameBadgeClass, 'max-w-[4.5rem] truncate')} title={name}>
                {name}
              </span>
            ))}
            <SummaryCardOthersBadge names={tail} badgeClass={nameBadgeClass} />
          </p>
        </div>
      ) : (
        <p className="mt-auto text-[10px] text-slate-400">{sub}</p>
      )}
    </article>
  )
}

function SuitabilityApprovalStrip({
  step,
  onStep,
  names,
  signs,
  onNameChange,
  onSign,
}: {
  step: ApprovalStep
  onStep: (step: ApprovalStep) => void
  names: Record<ApprovalStep, string>
  signs: Partial<Record<ApprovalStep, string>>
  onNameChange: (step: ApprovalStep, value: string) => void
  onSign: (step: ApprovalStep) => void
}) {
  return (
    <div className="flex shrink-0 overflow-hidden rounded-sm border border-slate-400 bg-white text-[10px] dark:border-slate-600">
      <div className="flex w-7 shrink-0 items-center justify-center self-stretch border-r border-slate-300 bg-slate-100 px-0.5 text-[10px] font-bold text-slate-700 [writing-mode:vertical-rl] dark:border-slate-600 dark:bg-muted/50 dark:text-slate-200">
        결재
      </div>
      <div className="grid w-[10.5rem] grid-cols-3 divide-x divide-slate-300 dark:divide-slate-600">
          {APPROVAL_STEPS.map((label) => {
            const signUserId = signs[label]
            return (
              <div key={label} className="flex min-w-0 flex-col">
                <button
                  type="button"
                  onClick={() => onStep(label)}
                  className={cn(
                    'border-b border-slate-300 py-px text-[9px] font-semibold dark:border-slate-600',
                    step === label ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600 dark:bg-muted',
                  )}
                >
                  {label}
                </button>
                <div className="border-b border-slate-200 p-px dark:border-slate-600">
                  {signUserId ? (
                    <div className="group relative flex h-8 items-center justify-center rounded-[3px] border border-emerald-300/80 bg-white dark:border-emerald-500/40">
                      <img
                        src={`/api/auth/signature?userId=${encodeURIComponent(signUserId)}`}
                        alt={`${label} 서명`}
                        className="max-h-6 max-w-[90%] object-contain"
                      />
                      <button
                        type="button"
                        onClick={() => onSign(label)}
                        aria-label={`${label} 서명 해제`}
                        title="서명 해제"
                        className="absolute right-0 top-0 flex size-3.5 items-center justify-center rounded-full bg-background/90 text-muted-foreground ring-1 ring-border hover:text-destructive"
                      >
                        <X className="size-2" />
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onSign(label)}
                      className="flex h-8 w-full flex-col items-center justify-center gap-0 rounded-[3px] border border-dashed border-slate-300 text-muted-foreground transition-colors hover:border-emerald-400 hover:bg-emerald-50/70 hover:text-emerald-700 dark:border-slate-600 dark:hover:bg-emerald-400/10"
                    >
                      <PenLine className="size-3" />
                      <span className="text-[8px] font-medium leading-none">서명</span>
                    </button>
                  )}
                </div>
                <input
                  aria-label={`${label} 성명`}
                  value={names[label]}
                  placeholder="성명"
                  onChange={(event) => onNameChange(label, event.target.value)}
                  className="h-5 w-full min-w-0 border-0 bg-transparent px-0.5 text-center text-[9px] outline-none placeholder:text-muted-foreground/70"
                />
              </div>
            )
          })}
      </div>
    </div>
  )
}

function PracticalMeasureField({
  label,
  value,
  unit,
  inputMode,
  dense,
  onChange,
}: {
  label: string
  value: string
  unit?: string
  inputMode?: 'decimal' | 'numeric'
  dense?: boolean
  onChange: (value: string) => void
}) {
  return (
    <label className="flex items-center gap-1.5 text-xs text-slate-700 dark:text-slate-200">
      <span className={cn('shrink-0 font-semibold', dense ? 'w-8' : 'w-[4.5rem]')}>{label}</span>
      <span className="relative min-w-0 flex-1">
        <Input
          inputMode={inputMode}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className={cn(
            'h-8 border-slate-200 bg-white px-2 text-[13px] tabular-nums shadow-none dark:border-border dark:bg-background',
            unit && 'pr-7',
          )}
        />
        {unit ? (
          <span className="pointer-events-none absolute top-1/2 right-1.5 -translate-y-1/2 text-[11px] font-medium text-slate-400">
            {unit}
          </span>
        ) : null}
      </span>
    </label>
  )
}

function InspectorPracticalEvalSection({
  items,
  onPatch,
}: {
  items: Record<InspectorPracticalItemId, InspectorPracticalItemState>
  onPatch: (itemId: InspectorPracticalItemId, patch: Partial<InspectorPracticalItemState>) => void
}) {
  const passed = INSPECTOR_PRACTICAL_ITEMS.filter((item) => items[item.id].verdict === 'pass').length
  const failed = INSPECTOR_PRACTICAL_ITEMS.filter((item) => items[item.id].verdict === 'fail').length

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <SheetSectionHeading no="04">실기 평가</SheetSectionHeading>
          <span className="rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[11px] font-bold text-rose-700 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-300">
            개정 반영
          </span>
          <span
            className={cn(
              'rounded-full px-2 py-0.5 text-[11px] font-bold tabular-nums',
              failed > 0
                ? 'bg-rose-100 text-rose-800 dark:bg-rose-500/15 dark:text-rose-200'
                : passed === INSPECTOR_PRACTICAL_ITEMS.length
                  ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-200'
                  : 'bg-slate-100 text-slate-600 dark:bg-muted dark:text-slate-300',
            )}
          >
            합격 {passed}/4
          </span>
        </div>
        <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
          WR-SP-0701 [부표3] · 4개 항목 모두 합격 필수
        </p>
      </div>
      <div className="mt-2 grid grid-cols-1 items-stretch gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {INSPECTOR_PRACTICAL_ITEMS.map((def) => {
          const row = items[def.id]
          return (
            <article
              key={def.id}
              className={cn(
                'flex h-full flex-col overflow-hidden rounded-xl border bg-white shadow-sm dark:bg-card',
                row.verdict === 'pass' && 'border-emerald-300 dark:border-emerald-500/50',
                row.verdict === 'fail' && 'border-rose-300 dark:border-rose-500/50',
                row.verdict === 'unevaluated' && 'border-slate-200 dark:border-border',
              )}
            >
              <div
                className={cn(
                  'h-0.5 shrink-0',
                  row.verdict === 'pass' && 'bg-emerald-500',
                  row.verdict === 'fail' && 'bg-rose-500',
                  row.verdict === 'unevaluated' && 'bg-slate-200 dark:bg-slate-700',
                )}
              />
              <div className="flex flex-1 flex-col px-2.5 py-2">
                <div className="flex items-center gap-1.5">
                  <span className="inline-flex size-4 shrink-0 items-center justify-center rounded-full bg-slate-800 text-[9px] font-bold text-white dark:bg-slate-200 dark:text-slate-900">
                    {def.no}
                  </span>
                  <p className="min-w-0 flex-1 truncate text-[13px] font-bold text-slate-900 dark:text-slate-100">
                    {def.title}
                  </p>
                  {def.core ? (
                    <span className="shrink-0 rounded-full bg-rose-600 px-1.5 py-0.5 text-[10px] leading-none font-bold text-white">
                      핵심
                    </span>
                  ) : null}
                </div>
                <p className="mt-0.5 truncate text-[11px] leading-tight text-slate-500 dark:text-slate-400" title={def.subtitle}>
                  {def.subtitle}
                </p>
                <div className="mt-1.5 flex min-h-[4.25rem] flex-col justify-center rounded-md bg-slate-50 px-2 py-1.5 dark:bg-muted/40">
                  {def.fields === 'score' && (
                    <PracticalMeasureField
                      label="점수"
                      value={row.score}
                      inputMode="decimal"
                      onChange={(score) => onPatch(def.id, { score })}
                    />
                  )}
                  {def.fields === 'effectiveness' && (
                    <PracticalMeasureField
                      label="유효성"
                      value={row.effectiveness}
                      unit="%"
                      inputMode="decimal"
                      onChange={(effectiveness) => onPatch(def.id, { effectiveness })}
                    />
                  )}
                  {def.fields === 'thickness' && (
                    <div className="grid grid-cols-2 gap-1.5">
                      <PracticalMeasureField
                        dense
                        label="편차"
                        value={row.deviation}
                        onChange={(deviation) => onPatch(def.id, { deviation })}
                      />
                      <PracticalMeasureField
                        dense
                        label="GRR"
                        value={row.grr}
                        unit="%"
                        inputMode="decimal"
                        onChange={(grr) => onPatch(def.id, { grr })}
                      />
                    </div>
                  )}
                  {def.fields === 'errors' && (
                    <PracticalMeasureField
                      label="누락·오기"
                      value={row.errors}
                      unit="건"
                      inputMode="numeric"
                      onChange={(errors) => onPatch(def.id, { errors })}
                    />
                  )}
                </div>
                <p
                  className="mt-1 min-h-[2.125rem] line-clamp-2 text-[11px] leading-snug text-slate-500 dark:text-slate-400"
                  title={def.basis}
                >
                  {def.basis}
                </p>
                <div className="mt-auto grid grid-cols-2 gap-1 pt-1.5">
                  <button
                    type="button"
                    onClick={() => onPatch(def.id, { verdict: row.verdict === 'pass' ? 'unevaluated' : 'pass' })}
                    className={cn(
                      'h-8 rounded-md border text-xs font-bold transition-colors',
                      row.verdict === 'pass'
                        ? 'border-emerald-600 bg-emerald-600 text-white'
                        : 'border-slate-200 bg-white text-slate-600 hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-800 dark:border-border dark:bg-background dark:text-slate-300',
                    )}
                  >
                    합격
                  </button>
                  <button
                    type="button"
                    onClick={() => onPatch(def.id, { verdict: row.verdict === 'fail' ? 'unevaluated' : 'fail' })}
                    className={cn(
                      'h-8 rounded-md border text-xs font-bold transition-colors',
                      row.verdict === 'fail'
                        ? 'border-rose-600 bg-rose-600 text-white'
                        : 'border-slate-200 bg-white text-slate-600 hover:border-rose-300 hover:bg-rose-50 hover:text-rose-800 dark:border-border dark:bg-background dark:text-slate-300',
                    )}
                  >
                    불합격
                  </button>
                </div>
              </div>
            </article>
          )
        })}
      </div>
    </div>
  )
}

function GrantFinalVerdictPanel({
  className,
  passLine,
  formKind,
  hasScores,
  scoreCriterionMet,
  practicalGate,
  finalVerdict,
  onCyclePracticalGate,
}: {
  className?: string
  passLine: number
  formKind: EvalSheetKind
  hasScores: boolean
  scoreCriterionMet: boolean
  practicalGate: PracticalGate
  finalVerdict: { label: string; className: string }
  onCyclePracticalGate: () => void
}) {
  return (
    <div
      className={cn(
        'overflow-hidden rounded-xl border border-slate-200 bg-slate-50/90 dark:border-border dark:bg-muted/30',
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2 border-b border-slate-200/80 px-3 py-2.5 text-xs dark:border-border">
        <span className="text-slate-700 dark:text-slate-300">① 적격성 점수 {passLine}점 이상</span>
        {!hasScores ? (
          <CriterionBadge tone="muted" label="미평가" />
        ) : scoreCriterionMet ? (
          <CriterionBadge tone="pass" label="충족" />
        ) : (
          <CriterionBadge tone="fail" label="미충족" />
        )}
      </div>
      <div className="flex items-center justify-between gap-2 border-b border-slate-200/80 px-3 py-2.5 text-xs dark:border-border">
        <span className="text-slate-700 dark:text-slate-300">{practicalCriterionLabel(formKind)}</span>
        <button
          type="button"
          title={
            formKind === 'inspector'
              ? '실기 ①~④ 항목 합격·불합격에 따라 자동 반영'
              : '클릭하여 상태 변경 (미평가 → 충족 → 미충족)'
          }
          onClick={onCyclePracticalGate}
          disabled={formKind === 'inspector'}
          className={cn(
            'rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-emerald-600',
            formKind === 'inspector' && 'cursor-default',
          )}
        >
          {practicalGate === 'unevaluated' && <CriterionBadge tone="muted" label="미평가" />}
          {practicalGate === 'pass' && <CriterionBadge tone="pass" label="충족" />}
          {practicalGate === 'fail' && <CriterionBadge tone="fail" label="미충족" />}
        </button>
      </div>
      <div className="flex items-center justify-between gap-2 px-3 py-2.5 text-xs">
        <span className="font-bold text-slate-800 dark:text-slate-100">최종 판정</span>
        <span className={cn(finalVerdict.className, 'text-xs')}>{finalVerdict.label}</span>
      </div>
    </div>
  )
}

function CriterionBadge({ tone, label }: { tone: 'pass' | 'fail' | 'muted'; label: string }) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 rounded-md border px-2 py-0.5 text-xs font-bold',
        tone === 'pass' && 'border-emerald-200 bg-emerald-50 text-emerald-800',
        tone === 'fail' && 'border-rose-200 bg-rose-50 text-rose-700',
        tone === 'muted' && 'border-slate-200 bg-white text-slate-500 dark:bg-card',
      )}
    >
      {label}
    </span>
  )
}

function GrantPipelineFlow({
  steps,
  activeId,
  onSelect,
  splitIndex = 3,
}: {
  steps: { id: string; label: string }[]
  activeId: string
  onSelect: (id: string) => void
  splitIndex?: number
}) {
  const firstLine = steps.slice(0, splitIndex)
  const secondLine = steps.slice(splitIndex)

  const renderStep = (step: { id: string; label: string }, showArrow: boolean) => (
    <Fragment key={step.id}>
      {showArrow && <span className="shrink-0 text-slate-400">→</span>}
      <button
        type="button"
        onClick={() => onSelect(step.id)}
        className={cn(
          'shrink-0 rounded-full px-2.5 py-1.5 text-[13px] font-semibold whitespace-nowrap transition-colors',
          activeId === step.id
            ? 'bg-slate-800 text-white shadow-sm dark:bg-slate-700'
            : 'text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-muted',
        )}
      >
        {step.label}
      </button>
    </Fragment>
  )

  return (
    <div className="space-y-1.5 text-[13px] leading-snug">
      <div className="flex flex-nowrap items-center gap-0.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {firstLine.map((step, index) => renderStep(step, index > 0))}
        <span className="shrink-0 text-slate-400">→</span>
        <span className="shrink-0 font-semibold text-slate-500">…</span>
      </div>
      <div className="flex flex-nowrap items-center gap-0.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {secondLine.map((step, index) => renderStep(step, index > 0))}
      </div>
    </div>
  )
}

const fieldLabelClass = 'text-[10px] font-medium text-slate-500 dark:text-slate-400'
const fieldControlClass =
  'mt-0.5 h-9 w-full rounded-md border border-slate-300 bg-white px-2 text-sm text-slate-900 shadow-sm dark:border-slate-600 dark:bg-card dark:text-slate-100 print:border-slate-400 print:bg-white print:shadow-none'

function EditableField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
}) {
  return (
    <label className="block min-w-0">
      <span className={fieldLabelClass}>{label}</span>
      <Input
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className={cn(fieldControlClass, 'placeholder:text-slate-400')}
      />
    </label>
  )
}

const SELECT_EMPTY = '__empty__'

function SelectField({
  label,
  value,
  options,
  onChange,
  allowEmpty = false,
  emptyLabel = '선택',
}: {
  label: string
  value: string
  options: { value: string; label: string }[]
  onChange: (value: string) => void
  allowEmpty?: boolean
  emptyLabel?: string
}) {
  const selected = options.find((option) => option.value === value)
  const shown = selected?.label || (value ? value : emptyLabel)

  return (
    <div className="block min-w-0">
      <span className={fieldLabelClass}>{label}</span>
      <Select
        value={value || (allowEmpty ? SELECT_EMPTY : undefined)}
        onValueChange={(next) => onChange(!next || next === SELECT_EMPTY ? '' : next)}
      >
        <SelectTrigger
          aria-label={label}
          size="sm"
          className={cn(
            fieldControlClass,
            'w-full justify-between gap-2 px-2.5 font-normal shadow-sm data-[size=sm]:h-9 data-[size=sm]:rounded-md',
            !value && 'text-slate-400',
          )}
        >
          <span className="truncate">{shown}</span>
        </SelectTrigger>
        <SelectContent align="start" className="p-1">
          <SelectGroup>
            {allowEmpty && <SelectItem value={SELECT_EMPTY}>{emptyLabel}</SelectItem>}
            {options
              .filter((option) => option.value)
              .map((option) => (
                <SelectItem key={option.value} value={option.value} className="py-1.5 pl-2 text-[13px]">
                  {option.label}
                </SelectItem>
              ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </div>
  )
}

function DateField({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (value: string) => void
}) {
  return (
    <label className="block min-w-0">
      <span className={fieldLabelClass}>{label}</span>
      <Input
        type="date"
        value={toDateInput(value)}
        onChange={(event) => onChange(event.target.value)}
        className={cn(fieldControlClass, 'tabular-nums')}
      />
    </label>
  )
}

function ScaleRow({
  group,
  weight,
  item,
  options,
  selected,
  onSelect,
}: {
  group: string
  weight: string
  item: string
  options: { label: string; point: number }[]
  selected: number
  onSelect: (point: number) => void
}) {
  return (
    <tr>
      <td className={SCORE_TABLE_GROUP}>
        {group}
        <div className="mt-0.5 text-[11px] font-medium text-muted-foreground">{weight}</div>
      </td>
      <td className={cn(SCORE_TABLE_CELL, SCORE_TABLE_ITEM)}>{item}</td>
      <td className={cn(SCORE_TABLE_CRITERIA)} colSpan={5}>
        <p className="hidden text-[11px] font-medium print:block">
          {options.find((option) => option.point === selected)?.label ?? '—'}{' '}
          <span className="tabular-nums">({selected || '—'})</span>
        </p>
        <div className={options.length >= 5 ? cn(SCORE_SKILL_GRID, 'items-stretch') : SCORE_OPTION_ROW}>
          {options.map((option) => (
            <button
              key={option.label}
              type="button"
              className={cn(
                scoreOptionChoiceTone(option.point, selected),
                options.length >= 5 && 'min-w-0 w-full px-1 py-1.5 text-[11px] leading-tight',
              )}
              onClick={() => onSelect(option.point)}
            >
              {option.label} <span className="tabular-nums">{option.point}</span>
            </button>
          ))}
        </div>
      </td>
      <td className={SCORE_TABLE_SCORE}>{selected || '—'}</td>
    </tr>
  )
}
