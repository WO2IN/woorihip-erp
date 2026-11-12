'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { CalendarRange, Check, ChevronDown, ChevronLeft, ChevronRight, CircleCheck, CirclePause, Info, RotateCw, Users } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/components/auth/auth-context'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Input } from '@/components/ui/input'
import { getJsonAuthHeaders } from '@/lib/auth-client'
import {
  deriveQualificationStatus,
  qualificationExamKind,
  todayIso,
  type QualificationLedgerRow,
} from '@/lib/qualification-ledger'
import {
  inspectorPracticalLine,
  practicalGateLine,
  suitabilityEvalDate,
  suitabilityScoreTotal,
  type SuitabilitySheetPersisted,
} from '@/lib/suitability-ledger-bridge'
import { cn } from '@/lib/utils'

const RENEWAL_KINDS = ['정기', '수시', '복귀'] as const
type RenewalKind = (typeof RENEWAL_KINDS)[number]
const RENEWAL_VERDICTS = ['적격', '부적격'] as const
type RenewalVerdict = (typeof RENEWAL_VERDICTS)[number]

const FILTERS = [
  { id: '전체', label: '전체' },
  { id: 'D-90', label: 'D-90 이내' },
] as const
type ScheduleFilter = (typeof FILTERS)[number]['id']

const RENEWAL_BASIS = [
  { term: '갱신', body: '내부심사원은 역량 재평가, 검사원은 실기·교육 충족 후 만료일을 1년 연장합니다.' },
  { term: '정지', body: '재평가 부적격, 자격 정지 합의, 대상 기준 미달일 때 자격을 멈춥니다.' },
  { term: '취소', body: '퇴사, 유효기간 만료, 인증서 제외가 확정되면 자격을 취소합니다.' },
  { term: '절차', body: '갱신 대상 확인 → 자격 유지 요건 → 역량 재평가 → 부장 승인 → 대장 · 인정서.' },
] as const

const PROCESS_STEPS = [
  { title: '갱신 대상 확인', detail: 'D-90 알림 · 대상 확정' },
  { title: '자격 유지 요건', detail: '연 1회 심사 참여 실적' },
  { title: '역량 재평가', detail: '적격성평가서 · 시험' },
  { title: '부장 승인', detail: '재평가 결과 결재' },
  { title: '대장 · 인정서', detail: '갱신일 입력 · 발행' },
] as const
const CANCEL_REASONS = ['선택하세요', '퇴사', '불합격', '유출', '미수행'] as const
const RETURN_CONDITIONS = ['재교육 · 재평가', '재교육', '재평가'] as const
/** 대장 연도 열이 비어 있을 때 보여주는 갱신 일정. 대장에 날짜가 있으면 그쪽이 우선입니다. */
const SCHEDULE_DRAFT: Record<string, { recent?: string; next?: string }> = {
  'QA-00': { recent: '2026-01-05', next: '2027-01-04' },
  'QA-01': { recent: '2026-01-05', next: '2027-01-04' },
  'QA-02': { recent: '2026-01-05', next: '2027-01-04' },
  'QA-03': { recent: '2026-01-05', next: '2027-01-04' },
  'QA-10': { recent: '2026-01-05', next: '2027-01-04' },
  'QA-16': { recent: '2025-01-03', next: '2027-01-04' },
  'QA-17': { recent: '2026-01-05', next: '2027-01-04' },
  'QA-19': { recent: '2026-01-05', next: '2027-01-04' },
  'QA-20': { recent: '2026-01-05', next: '2027-01-04' },
  'QA-22': { recent: '2026-01-30', next: '2027-01-04' },
  'QA-23': { next: '2027-08-14' },
  'QA-24': { next: '2027-08-28' },
  'QA-25': { next: '2027-09-07' },
}

/** 대장 2026.01.05 인증취소 기록. 취소일자가 비어 있으면 미기재입니다. */
const CANCEL_LOG = [
  { name: '서우미', certNo: 'QA-11', date: '2025-02-08', reason: '퇴사' },
  { name: '도유진', certNo: 'QA-18', date: '2025-04-15', reason: '퇴사' },
  { name: '루아', certNo: 'QA-18', date: '2025-07-01', reason: '퇴사' },
  { name: '최영석', certNo: 'QA-01', date: '', reason: '퇴사' },
  { name: '조미혜', certNo: 'QA-02', date: '', reason: '퇴사' },
  { name: '김한욱', certNo: 'QA-04', date: '', reason: '퇴사' },
  { name: '이승자', certNo: 'QA-05', date: '', reason: '퇴사' },
  { name: '송국진', certNo: 'QA-06', date: '', reason: '퇴사' },
  { name: '김연진', certNo: 'QA-07', date: '', reason: '퇴사' },
  { name: '이영희', certNo: 'QA-08', date: '', reason: '퇴사' },
  { name: '나윤환', certNo: 'QA-09', date: '', reason: '퇴사' },
  { name: '윤희', certNo: 'QA-12', date: '', reason: '퇴사' },
] as const

type ExamHit = {
  id: string
  examineeId?: string
  examinee: string
  examDate: string
  score: number
  passed: boolean
  paperTitle: string
  paperStep: string
  passScore: number
  source: 'auditor' | 'inspector'
}

function parseIso(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(year, month - 1, day)
  return Number.isNaN(date.getTime()) ? null : date
}

function daysUntil(iso: string, today: string) {
  const target = parseIso(iso)
  const now = parseIso(today)
  if (!target || !now) return null
  return Math.round((target.getTime() - now.getTime()) / 86_400_000)
}

const CANCEL_REASON_LABELS = ['퇴사', '불합격', '유효', '미수행', '재평가 부적격', '유효기간 만료', '자격 정지', '본인 요청', '기타'] as const

/** 취소 이력 표시용. 과거에 처리·체크 항목까지 한 줄로 저장된 값도 짧은 사유만 보여 줍니다. */
function cancelHistoryReason(raw: string) {
  if (!raw.trim()) return '퇴사'
  const known = CANCEL_REASON_LABELS.find((label) => raw.includes(label))
  if (known) return known
  const first = raw.split(' · ').find((part) => part && part !== '취소' && part !== '정지')
  return first || raw
}

function dotDate(iso: string) {
  return iso ? iso.replaceAll('-', '.') : '—'
}

function dLabel(days: number) {
  if (days === 0) return 'D-day'
  return days > 0 ? `D-${days}` : `D+${Math.abs(days)}`
}

function recentRenewal(row: QualificationLedgerRow) {
  const dates = Object.values(row.renewals).filter((value) => /^\d{4}-\d{2}-\d{2}$/.test(value)).sort()
  return dates.at(-1) || SCHEDULE_DRAFT[row.certNo]?.recent || ''
}

function scheduleDate(row: QualificationLedgerRow) {
  return row.plannedRenewalDate || row.expiryDate || SCHEDULE_DRAFT[row.certNo]?.next || ''
}

function basisLabel(qualification: string) {
  if (qualification === '내부품질감사') return '[부표2]'
  if (qualification === '품질검사원' || qualification === '수입·신뢰성 검사' || qualification === '출하공정목시검사') return '[부표3]'
  return '—'
}

function passLine(qualification: string) {
  return qualification === '내부품질감사' ? 80 : 60
}

function basisDocument(qualification: string) {
  if (qualification === '내부품질감사') return 'WR-MP-1001 [부표2] 자격 유지 (연 1회 심사 참여 + 연 1회 역량 재평가)'
  if (qualification === '품질검사원' || qualification === '수입·신뢰성 검사' || qualification === '출하공정목시검사') return 'WR-MP-1002 [부표3] 연 1회 정기 재평가'
  return '별도 자격 기준'
}

function addYears(iso: string, years: number) {
  const date = parseIso(iso)
  if (!date) return ''
  date.setFullYear(date.getFullYear() + years)
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

function YearPicker({ year, years, onChange }: { year: string; years: string[]; onChange: (value: string) => void }) {
  const [open, setOpen] = useState(false)
  const index = Math.max(0, years.indexOf(year))

  function shift(delta: number) {
    const next = years[index + delta]
    if (next) onChange(next)
  }

  return (
    <div className="inline-flex items-center gap-0.5 rounded-xl border border-slate-200 bg-white p-1 shadow-sm dark:border-white/10 dark:bg-card">
      <button
        type="button"
        aria-label="이전 연도"
        disabled={index <= 0}
        onClick={() => shift(-1)}
        className="flex size-8 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 disabled:pointer-events-none disabled:opacity-30 dark:hover:bg-white/10 dark:hover:text-white"
      >
        <ChevronLeft className="size-4" />
      </button>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-sm font-semibold text-slate-800 transition-colors hover:bg-slate-100 dark:text-slate-100 dark:hover:bg-white/10">
          <CalendarRange className="size-4 text-sky-600" />
          <span className="tabular-nums">{year}년</span>
          <ChevronDown className={cn('size-3.5 text-slate-400 transition-transform', open && 'rotate-180')} />
        </PopoverTrigger>
        <PopoverContent align="end" className="w-52 gap-2 p-3">
          <p className="text-[11px] font-semibold tracking-wide text-slate-400">연도</p>
          <div className="grid grid-cols-2 gap-1">
            {years.map((item) => {
              const selected = item === year
              return (
                <button
                  key={item}
                  type="button"
                  onClick={() => { onChange(item); setOpen(false) }}
                  className={cn(
                    'rounded-lg px-2 py-2 text-sm tabular-nums transition-colors',
                    selected
                      ? 'bg-slate-800 font-semibold text-white'
                      : 'text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-white/10',
                  )}
                >
                  {item}년
                </button>
              )
            })}
          </div>
        </PopoverContent>
      </Popover>
      <button
        type="button"
        aria-label="다음 연도"
        disabled={index >= years.length - 1}
        onClick={() => shift(1)}
        className="flex size-8 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 disabled:pointer-events-none disabled:opacity-30 dark:hover:bg-white/10 dark:hover:text-white"
      >
        <ChevronRight className="size-4" />
      </button>
    </div>
  )
}

export function RenewalCancelView() {
  const { user } = useAuth()
  const today = todayIso()
  const defaultYear = String(Number(today.slice(0, 4)) + 1)
  const [rows, setRows] = useState<QualificationLedgerRow[]>([])
  const [exams, setExams] = useState<ExamHit[]>([])
  const [suitabilityStore, setSuitabilityStore] = useState<SuitabilitySheetPersisted | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [year, setYear] = useState(defaultYear)
  const [filter, setFilter] = useState<ScheduleFilter>('전체')
  const [selectedId, setSelectedId] = useState('')
  const [centerTab, setCenterTab] = useState<'process' | 'history'>('process')
  const [stepOverride, setStepOverride] = useState<Record<string, number>>({})
  const [reevalDate, setReevalDate] = useState(today)
  const [nextExpiry, setNextExpiry] = useState('')
  const [renewalKind, setRenewalKind] = useState<RenewalKind>('정기')
  const [participationDate, setParticipationDate] = useState('')
  const [certRenewalDate, setCertRenewalDate] = useState('')
  const [verdict, setVerdict] = useState<RenewalVerdict>('적격')
  const [participationNote, setParticipationNote] = useState('')
  const [gapChecked, setGapChecked] = useState(false)
  const [attach, setAttach] = useState({ ledger: true, cert: false, edu: false, exam: false })
  const [cancelFlags, setCancelFlags] = useState({ record: true, recall: false, roster: false, assign: false })
  const [approvals, setApprovals] = useState({ draft: false, review: false, approve: false })
  const [actionKind, setActionKind] = useState<'취소' | '정지'>('취소')
  const [reasonPick, setReasonPick] = useState<string>(CANCEL_REASONS[0])
  const [cancelDate, setCancelDate] = useState(today)
  const [returnCondition, setReturnCondition] = useState<string>(RETURN_CONDITIONS[0])
  const [cancelOpen, setCancelOpen] = useState(false)

  useEffect(() => {
    Promise.all([
      fetch('/api/quality/qualifications', { cache: 'no-store' }).then((response) => response.json()),
      fetch('/api/quality/suitability', { cache: 'no-store' }).then((response) => response.json()).catch(() => ({ data: null })),
      fetch('/api/quality/internal-auditor-exams', { cache: 'no-store' }).then((response) => response.json()).catch(() => ({ data: [] })),
      fetch('/api/quality/inspector-exams', { cache: 'no-store' }).then((response) => response.json()).catch(() => ({ data: [] })),
    ])
      .then(([ledger, suitability, auditor, inspector]) => {
        setRows(Array.isArray(ledger.data) ? ledger.data : [])
        setSuitabilityStore(suitability?.data ?? null)
        type RawExam = Omit<ExamHit, 'passScore' | 'source'> & { paperStep?: string }
        const toExam = (item: RawExam, passScore: number, source: ExamHit['source'], index: number): ExamHit => ({
          id: item.id || `${source}-${index}`,
          examineeId: item.examineeId,
          examinee: item.examinee,
          examDate: item.examDate,
          score: item.score,
          passed: item.passed,
          paperTitle: item.paperTitle,
          paperStep: item.paperStep?.trim() || '',
          passScore,
          source,
        })
        const auditorExams: ExamHit[] = Array.isArray(auditor.data)
          ? auditor.data.map((item: RawExam, index: number) => toExam(item, 80, 'auditor', index))
          : []
        const inspectorExams: ExamHit[] = Array.isArray(inspector.data)
          ? inspector.data.map((item: RawExam, index: number) => toExam(item, 60, 'inspector', index))
          : []
        setExams([...auditorExams, ...inspectorExams])
      })
      .catch(() => toast.error('자격인증 대장을 불러오지 못했습니다.'))
      .finally(() => setLoading(false))
  }, [])

  const schedule = useMemo(() => {
    return rows
      .map((row) => {
        const date = scheduleDate(row)
        const recent = recentRenewal(row)
        return {
          row,
          date,
          recent,
          acquired: row.acquiredDate || recent,
          days: date ? daysUntil(date, today) : null,
          cancelled: deriveQualificationStatus(row, today) === 'cancelled' || Boolean(row.cancelDate),
        }
      })
      .sort((a, b) => {
        if (a.cancelled !== b.cancelled) return a.cancelled ? 1 : -1
        if (!a.date && !b.date) return a.row.name.localeCompare(b.row.name, 'ko')
        if (!a.date) return 1
        if (!b.date) return -1
        return a.date.localeCompare(b.date) || a.row.name.localeCompare(b.row.name, 'ko')
      })
  }, [rows, today])

  const yearRows = schedule.filter((item) => !item.date || item.date.startsWith(year))
  const within90 = yearRows.filter((item) => !item.cancelled && item.days != null && item.days >= 0 && item.days <= 90)
  const visible = yearRows.filter((item) => {
    if (filter === 'D-90') return !item.cancelled && item.days != null && item.days >= 0 && item.days <= 90
    return true
  })

  const selected = schedule.find((item) => item.row.id === selectedId) ?? visible[0] ?? null
  const years = useMemo(() => {
    const set = new Set<string>([defaultYear, today.slice(0, 4)])
    for (const item of schedule) {
      if (item.date) set.add(item.date.slice(0, 4))
    }
    return [...set].sort()
  }, [schedule, defaultYear, today])

  useEffect(() => {
    if (!selected) return
    setReevalDate(today)
    setNextExpiry(addYears(today, 1))
    setRenewalKind('정기')
    setParticipationDate(selected.recent || '')
    setCertRenewalDate(selected.row.acquiredDate || '')
    setVerdict('적격')
    setParticipationNote('')
    setGapChecked(false)
    setAttach({ ledger: true, cert: false, edu: false, exam: false })
    setCancelFlags({ record: true, recall: false, roster: false, assign: false })
    setApprovals({ draft: false, review: false, approve: false })
    setActionKind('취소')
    setReasonPick(CANCEL_REASONS[0])
    setCancelDate(today)
    setReturnCondition(RETURN_CONDITIONS[0])
  }, [selected?.row.id, selected?.date, selected?.recent, selected?.row.acquiredDate, today])

  const completed = schedule.filter((item) => {
    const age = item.recent ? daysUntil(item.recent, today) : null
    return age != null && age <= 0 && age >= -365
  })
  const cancelled = schedule.filter((item) => item.cancelled)
  const dueSpan = within90.length
    ? `D-${Math.min(...within90.map((item) => item.days ?? 0))} ~ D-90`
    : 'D-90 이내 없음'

  const examSource = selected ? qualificationExamKind(selected.row.qualification) : null
  const personExams = selected
    ? exams
        .filter((exam) => {
          if (!examSource || exam.source !== examSource) return false
          if (exam.examineeId) return exam.examineeId === selected.row.id
          return exam.examinee.trim() === selected.row.name.trim()
        })
        .sort((a, b) => b.examDate.localeCompare(a.examDate))
    : []
  const latestExam = personExams[0] ?? null
  const practicalLine = useMemo(() => {
    if (!selected) return { actual: '미평가', judge: '미확인' }
    if (examSource === 'auditor') return practicalGateLine(suitabilityStore?.practicalGateByPerson?.[selected.row.id])
    if (examSource === 'inspector') return inspectorPracticalLine(suitabilityStore?.inspectorPracticalByPerson?.[selected.row.id])
    return { actual: '해당 없음', judge: '미확인' }
  }, [examSource, selected, suitabilityStore])
  const suitabilityLine = useMemo(() => {
    if (!selected) return { actual: '—', judge: '미확인' as const }
    const overlay = suitabilityStore?.overlays?.[selected.row.id]
    const total = suitabilityScoreTotal(overlay?.scores ?? null)
    const evalDate = suitabilityEvalDate(overlay)
    const pass = passLine(selected.row.qualification)
    if (total == null) {
      return {
        actual: selected.row.suitabilityOnFile ? '평가서만 등록됨' : '미평가',
        judge: (selected.row.suitabilityOnFile ? '미확인' : '재평가 필요') as '미확인' | '재평가 필요',
      }
    }
    const actual = evalDate ? `${total}점 (${dotDate(evalDate)} 평가)` : `${total}점`
    return { actual, judge: (total >= pass ? '충족' : '재평가 필요') as '충족' | '재평가 필요' }
  }, [selected, suitabilityStore])
  const derivedStep = !selected ? 0 : approvals.approve ? 3 : latestExam ? 2 : 1
  const currentStep = selected ? (stepOverride[selected.row.id] ?? derivedStep) : 0

  const persist = async (nextRows: QualificationLedgerRow[], detail: string) => {
    if (user?.role !== 'admin') {
      toast.error('관리자만 저장할 수 있습니다.')
      return false
    }
    setSaving(true)
    try {
      const response = await fetch('/api/quality/qualifications', {
        method: 'PUT',
        headers: getJsonAuthHeaders(user),
        body: JSON.stringify({ rows: nextRows, detail }),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) {
        toast.error(typeof body.error === 'string' ? body.error : '저장하지 못했습니다.')
        return false
      }
      setRows(Array.isArray(body.data) ? body.data : nextRows)
      toast.success(detail)
      return true
    } catch {
      toast.error('저장하지 못했습니다.')
      return false
    } finally {
      setSaving(false)
    }
  }

  const registerRenewal = () => {
    if (!selected) return
    const expiry = nextExpiry || addYears(selected.date || today, 1)
    if (!reevalDate || !expiry) {
      toast.error('갱신일과 다음 만료일을 확인해 주세요.')
      return
    }
    const renewalYear = reevalDate.slice(0, 4)
    const nextRows = rows.map((row) =>
      row.id === selected.row.id
        ? {
            ...row,
            renewals: { ...row.renewals, [renewalYear]: reevalDate },
            expiryDate: expiry,
            plannedRenewalDate: expiry,
            acquiredDate: certRenewalDate || row.acquiredDate,
            note: participationNote.trim() ? `${verdict} · ${participationNote.trim()}` : row.note,
            status: 'valid' as const,
            cancelDate: '',
            cancelReason: '',
          }
        : row,
    )
    void persist(nextRows, `${selected.row.name || '대상'} 자격을 ${dotDate(expiry)}까지 갱신했습니다.`).then((ok) => {
      if (ok) setStepOverride((prev) => ({ ...prev, [selected.row.id]: 4 }))
    })
  }

  const cancelSelected = () => {
    if (!selected) return
    if (reasonPick === '선택하세요') {
      toast.error('취소·정지 사유를 선택해 주세요.')
      return
    }
    const reasonLabel = reasonPick !== '선택하세요' ? reasonPick : actionKind
    const nextRows = rows.map((row) =>
      row.id === selected.row.id
        ? { ...row, status: 'cancelled' as const, cancelDate: cancelDate || today, cancelReason: reasonLabel }
        : row,
    )
    void persist(nextRows, `${selected.row.name || '대상'} 자격을 ${actionKind}했습니다.`).then((ok) => {
      if (ok) setCancelOpen(false)
    })
  }

  const historyRows = [
    ...cancelled
      .filter((item) => !CANCEL_LOG.some((entry) => entry.certNo === item.row.certNo && entry.name === item.row.name))
      .map((item) => ({
        name: item.row.name || '이름 없음',
        certNo: item.row.certNo || '—',
        date: item.row.cancelDate,
        reason: cancelHistoryReason(item.row.cancelReason),
      })),
    ...CANCEL_LOG,
  ]
  const undatedCancels = historyRows.filter((item) => !item.date).length

  return (
    <div className="mt-4 space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-black text-slate-950 dark:text-white">자격 갱신·취소 관리</h2>
          <p className="text-[13px] text-slate-500">자격 보유자의 갱신 심사 및 자격 상태를 관리합니다.</p>
        </div>
        <YearPicker year={year} years={years} onChange={setYear} />
      </div>

      <div className="grid grid-cols-2 gap-2 xl:grid-cols-4">
        {[
          { icon: Users, label: '전체 대상', value: `${rows.length}명`, sub: '자격 보유자 전체', tone: 'bg-sky-50 text-sky-700' },
          { icon: RotateCw, label: '갱신 예정', value: `${within90.length}명`, sub: dueSpan, tone: 'bg-sky-50 text-sky-700' },
          { icon: CircleCheck, label: '갱신 완료', value: `${completed.length}명`, sub: '최근 1년 이내', tone: 'bg-emerald-50 text-emerald-700' },
          { icon: CirclePause, label: '취소·정지', value: `${cancelled.length}명`, sub: '자격 정지 대상', tone: 'bg-rose-50 text-rose-600' },
        ].map((item) => (
          <article key={item.label} className="flex items-center gap-3 rounded-2xl border bg-card px-4 py-3 shadow-sm">
            <span className={cn('flex size-10 shrink-0 items-center justify-center rounded-full', item.tone)}>
              <item.icon className="size-5" />
            </span>
            <div className="min-w-0">
              <p className="text-[12px] text-slate-500">{item.label}</p>
              <p className="text-xl font-black tabular-nums text-slate-950 dark:text-white">{item.value}</p>
              <p className="truncate text-[11px] text-slate-400">{item.sub}</p>
            </div>
          </article>
        ))}
      </div>

      <div className="grid items-stretch gap-3 xl:grid-cols-[26rem_minmax(0,1fr)]">
        <section className="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border bg-card shadow-sm">
          <header className="flex items-center justify-between bg-slate-800 px-3 py-2.5 text-white">
            <h3 className="flex items-center gap-1.5 text-sm font-bold">
              <CalendarRange className="size-4" />
              갱신 일정
            </h3>
            <p className="text-[11px] text-slate-300">기준일 {dotDate(today)}</p>
          </header>
          <div className="flex gap-1 px-3 pt-2">
            {FILTERS.map((item) => {
              const count = item.id === '전체' ? yearRows.length : within90.length
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setFilter(item.id)}
                  className={cn(
                    'rounded-md px-2 py-1 text-[12px] font-semibold',
                    filter === item.id ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-300',
                  )}
                >
                  {item.label} {count}
                </button>
              )
            })}
          </div>
          <div className="mt-2 min-h-0 flex-1 overflow-auto">
            <table className="w-full border-collapse text-sm">
              <thead className="sticky top-0 bg-card text-left text-[13px] text-slate-400">
                <tr className="border-y border-slate-100 dark:border-white/10">
                  {['이름', '소속', '자격 번호', '다음 갱신일', 'D-day'].map((label, index) => (
                    <th key={label} className={cn('py-1.5 font-semibold', index === 0 ? 'pl-4 pr-1.5' : 'px-1.5')}>{label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={5} className="px-3 py-8 text-slate-500">일정을 불러오는 중입니다.</td></tr>
                ) : visible.length === 0 ? (
                  <tr><td colSpan={5} className="px-3 py-8 text-slate-500">이 조건의 갱신 대상이 없습니다.</td></tr>
                ) : visible.map((item) => {
                  const active = selected?.row.id === item.row.id
                  return (
                    <tr
                      key={item.row.id}
                      onClick={() => setSelectedId(item.row.id)}
                      className={cn(
                        'cursor-pointer border-b border-slate-100 dark:border-white/10',
                        active ? 'bg-sky-50 dark:bg-sky-500/10' : 'hover:bg-slate-50 dark:hover:bg-white/5',
                      )}
                    >
                      <td className="py-1.5 pl-4 pr-1.5 font-semibold text-slate-900 dark:text-slate-100">{item.row.name || '이름 없음'}</td>
                      <td className="px-1.5 py-1.5 text-slate-600 dark:text-slate-300">{item.row.department || '—'}</td>
                      <td className="px-1.5 py-1.5 text-slate-600 dark:text-slate-300">
                        <span className="block tabular-nums">{item.row.certNo || '—'}</span>
                        <span className="text-[10px] text-slate-400">{basisLabel(item.row.qualification)}</span>
                      </td>
                      <td className="px-1.5 py-1.5 tabular-nums text-slate-700 dark:text-slate-200">{item.date ? dotDate(item.date) : '—'}</td>
                      <td className="px-1.5 py-1.5">
                        {item.cancelled ? (
                          <span className="rounded-full bg-rose-100 px-1.5 py-0.5 text-[10px] font-bold text-rose-700">정지</span>
                        ) : item.days == null ? (
                          <span className="text-slate-400">—</span>
                        ) : (
                          <span className={cn(
                            'rounded-full px-1.5 py-0.5 text-[13px] font-bold tabular-nums',
                            item.days <= 90 ? 'bg-rose-100 text-rose-600' : 'bg-slate-100 text-slate-500 dark:bg-white/10',
                          )}>
                            {dLabel(item.days)}
                          </span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div className="shrink-0 border-t px-3 py-2 text-[12px] leading-relaxed text-slate-500">
            <p>
              ※ 다음 갱신 = 대장 2027년 열 · [부표2] 내부심사원 연 1회 역량 재평가 ·
              <br />
              [부표3] 검사원 연 1회 정기 재평가
            </p>
            <p className="mt-1">
              <span className="font-bold text-amber-600">!</span>
              {' '}단: 대장 2026년 열에 2025.01.03 입력 · 품질검사원 3명: 대장 2027년 열 날짜의 연도 확인 필요
            </p>
          </div>
        </section>

        <section className="flex h-full min-h-0 flex-col rounded-2xl border bg-card p-4 shadow-sm">
          <div className="flex items-center gap-4 border-b border-slate-200 dark:border-white/10">
            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={() => setCenterTab('process')}
                className={cn(
                  '-mb-px border-b-2 pb-2 text-base font-bold',
                  centerTab === 'process' ? 'border-sky-600 text-sky-700' : 'border-transparent text-slate-400',
                )}
              >
                갱신 처리
              </button>
              <button
                type="button"
                onClick={() => setCenterTab('history')}
                className={cn(
                  '-mb-px border-b-2 pb-2 text-base font-bold',
                  centerTab === 'history' ? 'border-sky-600 text-sky-700' : 'border-transparent text-slate-400',
                )}
              >
                취소 이력
              </button>
            </div>
            <div className="mb-px ml-auto shrink-0">
              <RenewalBasisHint align="end" />
            </div>
          </div>
          {centerTab === 'history' ? (
            <div className="mt-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="flex items-center gap-2 text-base font-bold text-slate-900 dark:text-white">
                  <span className="flex size-6 items-center justify-center rounded-md bg-rose-600 text-[11px] text-white">05</span>
                  취소 이력
                </h3>
                <p className="text-sm text-slate-500">대장(2026.01.05) 인증취소 기록</p>
              </div>
              <table className="mt-3 w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-[13px] text-slate-500">
                    {['성명', '번호', '취소일자', '사유'].map((label) => (
                      <th key={label} className="px-2 py-2 font-semibold">{label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {historyRows.map((item) => (
                    <tr key={`${item.certNo}-${item.name}`} className="border-b border-slate-100 dark:border-white/10">
                      <td className="px-2 py-2 font-semibold text-slate-900 dark:text-slate-100">{item.name}</td>
                      <td className="px-2 py-2 tabular-nums text-slate-600">{item.certNo}</td>
                      <td className="px-2 py-2 tabular-nums text-slate-700">{item.date ? dotDate(item.date) : '미기재'}</td>
                      <td className="px-2 py-2 text-rose-700">{item.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-2 text-[13px] leading-relaxed text-slate-500">
                {undatedCancels}건은 사유가 ‘퇴사’만 기재되어 있습니다. 실제 퇴사일 확인 후 입력합니다.
              </p>
            </div>
          ) : null}
          {centerTab === 'process' && selected ? (
            <RenewalProcess
              selected={selected}
              latestExam={latestExam}
              suitabilityActual={suitabilityLine.actual}
              suitabilityJudge={suitabilityLine.judge}
              practicalActual={practicalLine.actual}
              practicalJudge={practicalLine.judge}
              currentStep={currentStep}
              renewalKind={renewalKind}
              participationDate={participationDate}
              certRenewalDate={certRenewalDate}
              reevalDate={reevalDate}
              nextExpiry={nextExpiry}
              verdict={verdict}
              participationNote={participationNote}
              gapChecked={gapChecked}
              attach={attach}
              saving={saving}
              onStep={(index) => setStepOverride((prev) => ({ ...prev, [selected.row.id]: index }))}
              onRenewalKind={setRenewalKind}
              onParticipationDate={setParticipationDate}
              onCertRenewalDate={setCertRenewalDate}
              onReevalDate={(value) => {
                setReevalDate(value)
                setNextExpiry(addYears(value, 1))
              }}
              onVerdict={setVerdict}
              onParticipationNote={setParticipationNote}
              onGapChecked={setGapChecked}
              onAttach={(key) => setAttach((prev) => ({ ...prev, [key]: !prev[key] }))}
              onSave={registerRenewal}
              onOpenCancel={() => setCancelOpen(true)}
            />
          ) : null}
          {centerTab === 'process' && !selected ? (
            <p className="py-16 text-center text-sm text-slate-500">{loading ? '대장을 불러오는 중입니다.' : '갱신할 자격을 일정에서 고르세요.'}</p>
          ) : null}
        </section>
      </div>
      {selected ? (
        <CancelPanel
          open={cancelOpen}
          onOpenChange={setCancelOpen}
          person={selected}
          actionKind={actionKind}
          reasonPick={reasonPick}
          cancelDate={cancelDate}
          returnCondition={returnCondition}
          cancelFlags={cancelFlags}
          saving={saving}
          onActionKind={setActionKind}
          onReasonPick={setReasonPick}
          onCancelDate={setCancelDate}
          onReturnCondition={setReturnCondition}
          onCancelFlag={(key) => setCancelFlags((prev) => ({ ...prev, [key]: !prev[key] }))}
          onCancel={cancelSelected}
        />
      ) : null}
    </div>
  )
}

type SchedulePerson = {
  row: QualificationLedgerRow
  date: string
  recent: string
  acquired: string
  days: number | null
  cancelled: boolean
}

function RenewalBasisHint({ align = 'center' }: { align?: 'center' | 'end' }) {
  const [open, setOpen] = useState(false)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const show = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current)
    setOpen(true)
  }

  const hide = () => {
    closeTimer.current = setTimeout(() => setOpen(false), 150)
  }

  return (
    <div className="relative shrink-0" onMouseEnter={show} onMouseLeave={hide}>
      <button
        type="button"
        aria-label="갱신 기준 보기"
        aria-expanded={open}
        className="flex size-7 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 shadow-sm transition-colors hover:border-sky-300 hover:text-sky-600 dark:border-white/15 dark:bg-card"
        onFocus={show}
        onBlur={hide}
      >
        <Info className="size-4" strokeWidth={2.25} />
      </button>
      {open ? (
        <div
          role="tooltip"
          className={cn(
            'absolute top-full z-[90] mt-2 w-[19rem] rounded-xl border border-slate-200 bg-white p-3 text-left text-[13px] leading-relaxed text-slate-600 shadow-lg dark:border-white/15 dark:bg-card dark:text-slate-300',
            align === 'end' ? 'right-0' : 'left-1/2 -translate-x-1/2',
          )}
        >
          <p className="mb-2 text-[13px] font-bold text-slate-900 dark:text-white">갱신 기준</p>
          {RENEWAL_BASIS.map((item) => (
            <p key={item.term} className="mt-1.5 first:mt-0">
              <span className="font-bold text-slate-900 dark:text-white">{item.term}. </span>
              {item.body}
            </p>
          ))}
        </div>
      ) : null}
    </div>
  )
}

function ToggleChip({ checked, label, tone = 'sky', onToggle }: { checked: boolean; label: string; tone?: 'sky' | 'rose'; onToggle: () => void }) {
  return (
    <label
      className={cn(
        'inline-flex h-9 cursor-pointer select-none items-center gap-1.5 rounded-full border px-3 text-[12px] font-medium leading-none transition-colors',
        checked
          ? tone === 'rose'
            ? 'border-rose-200 bg-rose-50 text-rose-700'
            : 'border-sky-200 bg-sky-50 text-sky-700'
          : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:text-slate-700 dark:bg-card',
      )}
    >
      <input className="sr-only" type="checkbox" checked={checked} onChange={onToggle} />
      <Check className={cn('size-3.5', checked ? 'opacity-100' : 'opacity-30')} strokeWidth={3} />
      {label}
    </label>
  )
}

function judgeClass(value: string) {
  if (value === '충족' || value === '확인') return 'bg-emerald-100 text-emerald-700'
  if (value === '재평가 필요') return 'bg-amber-100 text-amber-800'
  return 'bg-slate-100 text-slate-500'
}

function RenewalProcess({
  selected,
  latestExam,
  suitabilityActual,
  suitabilityJudge,
  practicalActual,
  practicalJudge,
  currentStep,
  renewalKind,
  participationDate,
  certRenewalDate,
  reevalDate,
  nextExpiry,
  verdict,
  participationNote,
  gapChecked,
  attach,
  saving,
  onStep,
  onRenewalKind,
  onParticipationDate,
  onCertRenewalDate,
  onReevalDate,
  onVerdict,
  onParticipationNote,
  onGapChecked,
  onAttach,
  onSave,
  onOpenCancel,
}: {
  selected: SchedulePerson
  latestExam: ExamHit | null
  suitabilityActual: string
  suitabilityJudge: string
  practicalActual: string
  practicalJudge: string
  currentStep: number
  renewalKind: RenewalKind
  participationDate: string
  certRenewalDate: string
  reevalDate: string
  nextExpiry: string
  verdict: RenewalVerdict
  participationNote: string
  gapChecked: boolean
  attach: { ledger: boolean; cert: boolean; edu: boolean; exam: boolean }
  saving: boolean
  onStep: (index: number) => void
  onRenewalKind: (value: RenewalKind) => void
  onParticipationDate: (value: string) => void
  onCertRenewalDate: (value: string) => void
  onReevalDate: (value: string) => void
  onVerdict: (value: RenewalVerdict) => void
  onParticipationNote: (value: string) => void
  onGapChecked: (value: boolean) => void
  onAttach: (key: 'ledger' | 'cert' | 'edu' | 'exam') => void
  onSave: () => void
  onOpenCancel: () => void
}) {
  const qualification = selected.row.qualification
  const auditor = qualification === '내부품질감사'
  const pass = passLine(qualification)
  const examActual = !latestExam
    ? '미응시'
    : `응시 · ${latestExam.score}점 (${dotDate(latestExam.examDate)}${latestExam.paperStep ? ` · ${latestExam.paperStep}` : ''})`
  const examJudge = !latestExam ? '미확인' : latestExam.score >= pass ? '충족' : '재평가 필요'
  const statusText = selected.cancelled ? '취소·정지' : currentStep >= PROCESS_STEPS.length - 1 ? '갱신 완료' : '갱신 진행 중'
  const requirements = [
    { name: auditor ? '내부심사 참여' : '정기 재평가 참여', rule: auditor ? '연 1회 이상 ([부표2])' : '연 1회 ([부표3])', actual: participationNote.trim() || '입력', judge: participationNote.trim() ? '확인' : '미확인' },
    { name: auditor ? '역량 재평가 (적격성평가서)' : '적격성평가서', rule: `${pass}점 이상`, actual: suitabilityActual, judge: suitabilityJudge },
    { name: auditor ? '내부심사원 시험' : '검사원 시험', rule: `${pass}점 이상 (1안 · 2안)`, actual: examActual, judge: examJudge },
    { name: auditor ? '심사 실기 확인' : '검사원 실기', rule: auditor ? '적격성평가서 실기' : '실기 ①~④ 합격', actual: practicalActual, judge: practicalJudge },
    { name: '1년 이상 심사 미수행 여부', rule: '해당 시 정지 · 재교육', actual: gapChecked ? '해당' : '확인 전', judge: gapChecked ? '해당' : '미확인' },
  ]

  return (
    <div>
      <div className="mt-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-[22px] font-black text-slate-950 dark:text-white">{selected.row.name || '이름 없음'}</h3>
            <span className={cn(
              'rounded-full px-2.5 py-1 text-[12px] font-bold',
              selected.cancelled ? 'bg-rose-100 text-rose-700' : statusText === '갱신 완료' ? 'bg-emerald-100 text-emerald-700' : 'bg-emerald-50 text-emerald-600',
            )}>
              {statusText}
            </span>
          </div>
          <Button type="button" variant="outline" className="h-8 gap-1.5 border-rose-200 px-3 text-[13px] font-semibold text-rose-600 hover:bg-rose-50 hover:text-rose-700" onClick={onOpenCancel}>
            <CirclePause className="size-4" />
            취소 · 정지 등록
          </Button>
        </div>
        <p className="mt-1 text-sm text-slate-500">
          {selected.row.certNo || '번호 없음'} · {selected.row.department || '소속 없음'}
          <span className="mx-1.5 text-slate-300">|</span>
          자격 취득일 {dotDate(selected.acquired)}
        </p>
        <ol className="relative mt-5 grid grid-cols-5">
          <span className="absolute top-4 right-[10%] left-[10%] h-px bg-slate-200" />
          {PROCESS_STEPS.map((step, index) => {
            const reached = index <= currentStep
            return (
              <li key={step.title} className="relative z-10 flex flex-col items-center">
                <button
                  type="button"
                  aria-label={`${index + 1}. ${step.title}. ${step.detail}`}
                  onClick={() => onStep(index)}
                  className={cn(
                    'flex size-8 items-center justify-center rounded-full text-sm font-bold',
                    reached ? 'bg-sky-600 text-white' : 'bg-white text-slate-400 ring-1 ring-slate-300 dark:bg-card',
                  )}
                >
                  {reached ? '✓' : index + 1}
                </button>
                <span className={cn('mt-2 px-1 text-center text-[13px] font-semibold leading-tight', reached ? 'text-sky-700' : 'text-slate-400')}>{step.title}</span>
              </li>
            )
          })}
        </ol>
      </div>

      <div className="mt-4">
        <h4 className="flex items-center gap-2 text-[15px] font-bold text-slate-900 dark:text-white">
          <span className="flex size-6 items-center justify-center rounded-md bg-sky-600 text-[11px] text-white">03</span>
          갱신 내용
        </h4>
        <div className="mt-2 overflow-hidden rounded-xl border border-slate-200 dark:border-white/10">
          <div className="grid grid-cols-1 gap-x-3 gap-y-3 px-3 py-3 sm:grid-cols-2 xl:grid-cols-4 xl:items-end">
            <div className="block">
              <span className="text-[13px] font-semibold text-slate-500">갱신 구분</span>
              <div
                className="mt-1 grid h-9 grid-cols-3 gap-0.5 rounded-lg border border-slate-200 bg-slate-100 p-0.5 dark:border-white/10 dark:bg-white/10"
                role="radiogroup"
                aria-label="갱신 구분"
              >
                {RENEWAL_KINDS.map((item) => (
                  <button
                    key={item}
                    type="button"
                    role="radio"
                    aria-checked={renewalKind === item}
                    onClick={() => onRenewalKind(item)}
                    className={cn(
                      'rounded-md text-[13px] font-bold transition-all',
                      renewalKind === item
                        ? 'bg-sky-600 text-white shadow-sm'
                        : 'bg-transparent font-medium text-slate-500 hover:bg-white/70 hover:text-slate-800 dark:hover:bg-white/5',
                    )}
                  >
                    {item}
                  </button>
                ))}
              </div>
            </div>
            <label className="block">
              <span className="text-[13px] font-semibold text-slate-500">최근 심사 참여일</span>
              <Input className="mt-1 h-9 bg-background text-sm md:text-sm" type="date" value={participationDate} onChange={(event) => onParticipationDate(event.target.value)} />
            </label>
            <label className="block">
              <span className="text-[13px] font-semibold text-slate-500">재평가일</span>
              <Input className="mt-1 h-9 bg-background text-sm md:text-sm" type="date" value={reevalDate} onChange={(event) => onReevalDate(event.target.value)} />
            </label>
            <div className="block">
              <span className="text-[13px] font-semibold text-slate-500">재평가 결과</span>
              <div
                className="mt-1 grid h-9 grid-cols-2 gap-0.5 rounded-lg border border-slate-200 bg-slate-100 p-0.5 dark:border-white/10 dark:bg-white/10"
                role="radiogroup"
                aria-label="재평가 결과"
              >
                {RENEWAL_VERDICTS.map((item) => {
                  const selected = verdict === item
                  return (
                    <button
                      key={item}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => onVerdict(item)}
                      className={cn(
                        'rounded-md text-[13px] transition-all',
                        selected
                          ? item === '적격'
                            ? 'bg-emerald-600 font-bold text-white shadow-sm'
                            : 'bg-rose-600 font-bold text-white shadow-sm'
                          : 'bg-transparent font-medium text-slate-500 hover:bg-white/70 hover:text-slate-800 dark:hover:bg-white/5',
                      )}
                    >
                      {item}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-x-3 gap-y-3 border-t border-slate-200 bg-slate-50 px-3 py-3 sm:grid-cols-2 xl:grid-cols-4 xl:items-end dark:border-white/10 dark:bg-white/[0.03]">
            <div>
              <p className="text-[13px] font-semibold text-slate-500">현재 갱신일 (대장)</p>
              <p className="mt-1 flex h-9 items-center text-sm font-semibold tabular-nums text-slate-800 dark:text-slate-100">{dotDate(selected.recent)}</p>
            </div>
            <label className="block">
              <span className="text-[13px] font-semibold text-slate-500">인정서 갱신일</span>
              <Input className="mt-1 h-9 bg-background text-sm md:text-sm" type="date" value={certRenewalDate} onChange={(event) => onCertRenewalDate(event.target.value)} />
            </label>
            <div>
              <p className="text-[13px] font-semibold text-slate-500">다음 갱신 예정</p>
              <p className="mt-1 flex h-9 items-center text-sm font-semibold tabular-nums text-slate-800 dark:text-slate-100">{dotDate(selected.date)}</p>
            </div>
            <div>
              <p className="text-[13px] font-semibold text-slate-500">갱신 후 다음 예정</p>
              <p className="mt-1 flex h-9 items-center text-sm font-bold tabular-nums text-sky-700">{dotDate(nextExpiry)}</p>
            </div>
          </div>
        </div>

        <div className="mt-3 overflow-hidden rounded-xl border border-slate-200 dark:border-white/10">
          <table className="w-full table-fixed border-collapse text-sm">
            <colgroup>
              <col className="w-[30%]" />
              <col className="w-[24%]" />
              <col />
              <col className="w-28" />
            </colgroup>
            <thead>
              <tr className="bg-slate-50 text-left text-[13px] text-slate-500 dark:bg-white/5">
                <th className="px-3 py-2 font-semibold">갱신 요건</th>
                <th className="px-3 py-2 font-semibold">기준</th>
                <th className="px-3 py-2 font-semibold">실적</th>
                <th className="px-3 py-2 text-right font-semibold whitespace-nowrap">판정</th>
              </tr>
            </thead>
            <tbody>
              {requirements.map((item) => (
                <tr key={item.name} className="border-t border-slate-100 dark:border-white/10">
                  <td className="px-3 py-2.5 font-medium text-slate-800 dark:text-slate-100">{item.name}</td>
                  <td className="px-3 py-2.5 text-slate-500">{item.rule}</td>
                  <td className="px-3 py-2.5 text-slate-700 dark:text-slate-200">
                    {item.name.includes('참여') || item.name.includes('정기') ? (
                      <Input className="h-9 bg-background text-sm md:text-sm" value={participationNote} onChange={(event) => onParticipationNote(event.target.value)} placeholder="실적 입력" />
                    ) : item.name.startsWith('1년') ? (
                      <ToggleChip tone="rose" checked={gapChecked} label={item.actual} onToggle={() => onGapChecked(!gapChecked)} />
                    ) : item.actual}
                  </td>
                  <td className="px-3 py-2.5 text-right whitespace-nowrap"><span className={cn('inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-[13px] font-bold', judgeClass(item.judge))}>{item.judge}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-t border-slate-200 bg-slate-50 px-3 py-2.5 dark:border-white/10 dark:bg-white/[0.03]">
            <div className="flex min-h-9 min-w-0 flex-wrap items-center gap-1.5">
              {([
                ['ledger', '대장 갱신 반영'],
                ['cert', '인정서 갱신일 정정 · 재발행'],
                ['edu', '교육일지 첨부'],
                ['exam', '재평가 시험 결과 첨부'],
              ] as const).map(([key, label]) => (
                <ToggleChip key={key} checked={attach[key]} label={label} onToggle={() => onAttach(key)} />
              ))}
            </div>
            <Button type="button" className="h-9 shrink-0 self-center bg-sky-700 px-4 text-sm text-white hover:bg-sky-800" disabled={saving} onClick={onSave}>
              {saving ? '저장 중' : '갱신 저장'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

function CancelPanel({
  open,
  onOpenChange,
  person,
  actionKind,
  reasonPick,
  cancelDate,
  returnCondition,
  cancelFlags,
  saving,
  onActionKind,
  onReasonPick,
  onCancelDate,
  onReturnCondition,
  onCancelFlag,
  onCancel,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  person: SchedulePerson
  actionKind: '취소' | '정지'
  reasonPick: string
  cancelDate: string
  returnCondition: string
  cancelFlags: { record: boolean; recall: boolean; roster: boolean; assign: boolean }
  saving: boolean
  onActionKind: (value: '취소' | '정지') => void
  onReasonPick: (value: string) => void
  onCancelDate: (value: string) => void
  onReturnCondition: (value: string) => void
  onCancelFlag: (key: 'record' | 'recall' | 'roster' | 'assign') => void
  onCancel: () => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[30rem] gap-0 overflow-hidden p-0 sm:max-w-[30rem]">
        <div className="border-b border-slate-100 px-5 py-4 dark:border-white/10">
          <DialogTitle className="flex items-center gap-2 text-base font-bold text-slate-900 dark:text-white">
            <CirclePause className="size-5 text-rose-500" />
            취소 · 정지 등록
          </DialogTitle>
          <DialogDescription className="mt-1 text-[13px] text-slate-500">
            <span className="font-semibold text-slate-800 dark:text-slate-100">{person.row.name || '이름 없음'}</span>
            {' '}· {person.row.certNo || '번호 없음'} · {person.row.qualification || '자격 없음'}
          </DialogDescription>
        </div>
        <div className="space-y-4 px-5 py-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-[13px] font-semibold text-slate-600">처리 구분</p>
              <div className="mt-1.5 grid h-9 grid-cols-2 rounded-lg bg-slate-100 p-1 dark:bg-white/10" role="radiogroup" aria-label="처리 구분">
                {(['취소', '정지'] as const).map((item) => (
                  <button
                    key={item}
                    type="button"
                    role="radio"
                    aria-checked={actionKind === item}
                    onClick={() => onActionKind(item)}
                    className={cn(
                      'rounded-md text-sm font-semibold transition-colors',
                      actionKind === item ? 'bg-white text-rose-600 shadow-sm dark:bg-card' : 'text-slate-500 hover:text-slate-700',
                    )}
                  >
                    {item}
                  </button>
                ))}
              </div>
            </div>
            <label className="block">
              <span className="text-[13px] font-semibold text-slate-600">{actionKind} 일자</span>
              <Input className="mt-1.5 h-9 bg-background text-sm md:text-sm" type="date" value={cancelDate} onChange={(event) => onCancelDate(event.target.value)} />
            </label>
            <label className="block">
              <span className="text-[13px] font-semibold text-slate-600">사유</span>
              <select className="mt-1.5 h-9 w-full rounded-md border border-input bg-background px-2 text-sm" value={reasonPick} onChange={(event) => onReasonPick(event.target.value)}>
                {CANCEL_REASONS.map((item) => <option key={item}>{item}</option>)}
              </select>
            </label>
            <label className="block">
              <span className={cn('text-[13px] font-semibold', actionKind === '정지' ? 'text-slate-600' : 'text-slate-400')}>복귀 조건 (정지 시)</span>
              <select
                className="mt-1.5 h-9 w-full rounded-md border border-input bg-background px-2 text-sm disabled:bg-slate-50 disabled:text-slate-400"
                value={returnCondition}
                disabled={actionKind !== '정지'}
                onChange={(event) => onReturnCondition(event.target.value)}
              >
                {RETURN_CONDITIONS.map((item) => <option key={item}>{item}</option>)}
              </select>
            </label>
          </div>
          <div>
            <p className="text-[13px] font-semibold text-slate-600">함께 처리</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {([
                ['record', '대장 인증취소 일자 · 사유 기록'],
                ['recall', '자격인정서 회수 · 무료 처리'],
                ['roster', '자격자 명단 삭제'],
                ['assign', '업무 배정 해제 통보'],
              ] as const).map(([key, label]) => (
                <ToggleChip key={key} tone="rose" checked={cancelFlags[key]} label={label} onToggle={() => onCancelFlag(key)} />
              ))}
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-100 bg-slate-50 px-5 py-3 dark:border-white/10 dark:bg-white/[0.03]">
          <Button type="button" variant="outline" className="h-9 px-4 text-sm" onClick={() => onOpenChange(false)}>닫기</Button>
          <Button type="button" className="h-9 bg-rose-600 px-4 text-sm font-semibold text-white hover:bg-rose-700" disabled={saving} onClick={onCancel}>
            {saving ? '저장 중' : `${actionKind} 등록`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
