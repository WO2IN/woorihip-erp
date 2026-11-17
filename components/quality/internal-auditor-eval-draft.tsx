'use client'

import { useEffect, useRef, useState } from 'react'
import { ClipboardCheck, Layers, Link2, ListChecks, PenLine, Printer, Target, Users } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/components/auth/auth-context'
import { StampApprovalButton } from '@/components/approvals/stamp-approval-button'
import { getJsonAuthHeaders } from '@/lib/auth-client'
import { qualificationExamKind, type QualificationLedgerRow } from '@/lib/qualification-ledger'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { APPROVAL_STEPS, PAPERS, SET_OPERATION, type ApprovalStep, type ExamPaper, type InternalAuditorExamRecord } from '@/lib/internal-auditor-exam'
import { INSPECTOR_PAPERS, INSPECTOR_PASS_SCORE, INSPECTOR_SET_OPERATION } from '@/lib/inspector-exam'
import { ExamPrintSheet, waitForExamImages, type ExamPrintInput } from '@/components/quality/exam-print-sheet'
import { QualificationStatCard } from '@/components/quality/qualification-stat-card'
import { cn } from '@/lib/utils'

type ExamDraftConfig = {
  papers: ExamPaper[]
  kind: 'auditor' | 'inspector'
  setOperation: readonly string[]
  apiPath: string
  examTitle: string
  setSummary: string
  passScore: number
  passBasis: string
  defaultSupervisor: string
}

type RosterPerson = { id: string; name: string; meta: string }

const CHOICE_MARKS = ['①', '②', '③', '④']

function burstPieces(kind: 'pass' | 'fail') {
  const canvas = document.createElement('canvas')
  canvas.setAttribute('aria-hidden', 'true')
  canvas.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:80'
  document.body.appendChild(canvas)
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    canvas.remove()
    return () => {}
  }
  const fit = () => {
    canvas.width = window.innerWidth
    canvas.height = window.innerHeight
  }
  fit()
  const colors = kind === 'pass'
    ? ['#f59e0b', '#fde68a', '#10b981', '#34d399', '#38bdf8', '#f43f5e', '#a78bfa']
    : ['#e11d48', '#fb7185', '#9f1239', '#64748b']
  type Bit = { x: number; y: number; vx: number; vy: number; w: number; h: number; rot: number; vr: number; color: string; life: number }
  const bits: Bit[] = []
  const spawn = (count: number, lift: number) => {
    const originX = canvas.width / 2
    const originY = canvas.height / 2
    for (let i = 0; i < count; i += 1) {
      const angle = kind === 'pass' ? Math.random() * Math.PI * 2 : Math.PI * (0.15 + Math.random() * 0.7)
      const speed = kind === 'pass' ? 7 + Math.random() * 11 : 2 + Math.random() * 4
      bits.push({
        x: originX + (Math.random() - 0.5) * 40,
        y: originY,
        vx: Math.cos(angle) * speed * (kind === 'fail' ? (Math.random() < 0.5 ? -1 : 1) : 1),
        vy: Math.sin(angle) * speed - lift,
        w: 6 + Math.random() * 7,
        h: 3 + Math.random() * 5,
        rot: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 0.35,
        color: colors[i % colors.length],
        life: 1,
      })
    }
  }
  spawn(kind === 'pass' ? 110 : 28, kind === 'pass' ? 5 : -1)
  const second = kind === 'pass' ? window.setTimeout(() => spawn(50, 6), 160) : 0
  let frame = 0
  let gone = false
  const cleanup = () => {
    if (gone) return
    gone = true
    window.clearTimeout(second)
    cancelAnimationFrame(frame)
    canvas.remove()
  }
  const tick = () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    let alive = false
    for (const bit of bits) {
      bit.vy += kind === 'pass' ? 0.16 : 0.22
      bit.x += bit.vx
      bit.y += bit.vy
      bit.vx *= 0.99
      bit.rot += bit.vr
      bit.life -= kind === 'pass' ? 0.007 : 0.012
      if (bit.life <= 0) continue
      alive = true
      ctx.save()
      ctx.translate(bit.x, bit.y)
      ctx.rotate(bit.rot)
      ctx.globalAlpha = Math.max(bit.life, 0)
      ctx.fillStyle = bit.color
      ctx.fillRect(-bit.w / 2, -bit.h / 2, bit.w, bit.h)
      ctx.restore()
    }
    if (alive) frame = requestAnimationFrame(tick)
    else cleanup()
  }
  frame = requestAnimationFrame(tick)
  return cleanup
}

function scrollingParent(node: HTMLElement | null) {
  let current = node?.parentElement ?? null
  while (current) {
    const style = getComputedStyle(current)
    const scrolls = /(auto|scroll)/.test(`${style.overflowY} ${style.overflow}`)
    if (scrolls && current.scrollHeight > current.clientHeight + 8) return current
    current = current.parentElement
  }
  return null
}

const AUDITOR_EXAM: ExamDraftConfig = {
  papers: PAPERS,
  kind: 'auditor',
  setOperation: SET_OPERATION,
  apiPath: '/api/quality/internal-auditor-exams',
  examTitle: '내부심사원 시험',
  setSummary: '1안 기본 시험지 · 2안 IATF 포함 1건',
  passScore: 80,
  passBasis: 'WR-MP-1001 [부표2] ⑤ (확정 필요)',
  defaultSupervisor: '',
}

const INSPECTOR_EXAM: ExamDraftConfig = {
  papers: INSPECTOR_PAPERS,
  kind: 'inspector',
  setOperation: INSPECTOR_SET_OPERATION,
  apiPath: '/api/quality/inspector-exams',
  examTitle: '검사원 시험',
  setSummary: '1안 기본 시험지 · 2안 실기 확인',
  passScore: INSPECTOR_PASS_SCORE,
  passBasis: 'WR-MP-1002 [부표3] (확정 필요)',
  defaultSupervisor: '',
}

export function InternalAuditorEvalDraft() {
  return <QualificationExamDraft config={AUDITOR_EXAM} />
}

export function InspectorEvalDraft() {
  return <QualificationExamDraft config={INSPECTOR_EXAM} />
}

function QualificationExamDraft({ config }: { config: ExamDraftConfig }) {
  const { user } = useAuth()
  const [paperId, setPaperId] = useState(config.papers[0].id)
  const [roster, setRoster] = useState<RosterPerson[]>([])
  const [examineeId, setExamineeId] = useState('')
  const [examDate, setExamDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [supervisor, setSupervisor] = useState(config.defaultSupervisor)
  const [showKey, setShowKey] = useState(false)
  const [scoredPapers, setScoredPapers] = useState<Record<string, boolean>>({})
  const [gradeNotice, setGradeNotice] = useState<{ title: string; detail: string; tone: 'pass' | 'fail' | 'warn' } | null>(null)
  const [approvalSigns, setApprovalSigns] = useState<Partial<Record<ApprovalStep, string>>>({})
  const [approvalNames, setApprovalNames] = useState<Partial<Record<ApprovalStep, string>>>({})
  const [answers, setAnswers] = useState<Record<string, number[]>>(() =>
    Object.fromEntries(config.papers.map((paper) => [paper.id, paper.questions.map(() => -1)])),
  )
  const [savedRecords, setSavedRecords] = useState<InternalAuditorExamRecord[]>([])
  const [saving, setSaving] = useState(false)
  const appliedRecordRef = useRef('')

  const settingsRef = useRef<HTMLElement>(null)
  const scoreCardRef = useRef<HTMLElement>(null)
  const printRootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const cards = [settingsRef.current, scoreCardRef.current].filter((node): node is HTMLElement => node != null)
    const scroller = scrollingParent(cards[0] ?? null)
    if (!cards.length || !scroller) return

    let last = scroller.scrollTop
    let target = 0
    let shown = 0
    let frame = 0

    const paint = (value: number) => {
      const lifted = Math.abs(value) > 0.4
      const shift = lifted ? `translate3d(0, ${value.toFixed(2)}px, 0)` : ''
      for (const card of cards) card.style.transform = shift
    }

    const tick = () => {
      target *= 0.84
      shown += (target - shown) * 0.22
      if (Math.abs(shown) < 0.35 && Math.abs(target) < 0.35) {
        target = 0
        shown = 0
        paint(0)
        frame = 0
        return
      }
      paint(shown)
      frame = requestAnimationFrame(tick)
    }

    const onScroll = () => {
      const now = scroller.scrollTop
      const delta = now - last
      last = now
      if (!delta) return
      target = Math.max(-4, Math.min(4, target + delta * 0.05))
      if (!frame) frame = requestAnimationFrame(tick)
    }

    scroller.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      scroller.removeEventListener('scroll', onScroll)
      if (frame) cancelAnimationFrame(frame)
      paint(0)
    }
  }, [])

  useEffect(() => {
    let ignore = false
    fetch('/api/quality/qualifications', { cache: 'no-store' })
      .then((response) => response.json())
      .then((body: { data?: QualificationLedgerRow[] }) => {
        if (ignore) return
        const rows = Array.isArray(body.data) ? body.data : []
        const matched = rows
          .filter((row) => row.status !== 'cancelled' && qualificationExamKind(row.qualification) === config.kind && row.name.trim())
          .map((row) => ({
            id: row.id,
            name: row.name.trim(),
            meta: [row.department, row.rank, row.certNo].filter(Boolean).join(' · '),
          }))
        setRoster(matched)
        setExamineeId((current) => (matched.some((person) => person.id === current) ? current : matched[0]?.id ?? ''))
      })
      .catch(() => {
        if (ignore) return
        setRoster([])
        setExamineeId('')
      })
    return () => {
      ignore = true
    }
  }, [config.kind])

  const examineePerson = roster.find((person) => person.id === examineeId) ?? null
  const examinee = examineePerson?.name ?? ''

  useEffect(() => {
    let ignore = false
    const load = () => {
      fetch(config.apiPath, { cache: 'no-store' })
        .then((response) => response.json())
        .then((body: { data?: InternalAuditorExamRecord[] }) => {
          if (!ignore && Array.isArray(body.data)) setSavedRecords(body.data)
        })
        .catch(() => {})
    }
    load()
    window.addEventListener('focus', load)
    return () => {
      ignore = true
      window.removeEventListener('focus', load)
    }
  }, [config.apiPath])

  useEffect(() => {
    if (!gradeNotice) return
    const stop = gradeNotice.tone === 'warn' ? undefined : burstPieces(gradeNotice.tone)
    const timer = window.setTimeout(() => setGradeNotice(null), gradeNotice.tone === 'pass' ? 2200 : 1600)
    return () => {
      window.clearTimeout(timer)
      stop?.()
    }
  }, [gradeNotice])

  const paper = config.papers.find((item) => item.id === paperId) ?? config.papers[0]
  const savedForSheet = savedRecords
    .filter((record) => record.paperId === paper.id && (record.examineeId ? record.examineeId === examineeId : record.examinee === examinee))
    .sort((a, b) => (b.savedAt || '').localeCompare(a.savedAt || ''))[0] ?? null

  useEffect(() => {
    if (!examineeId) return
    const token = `${examineeId}:${paper.id}:${savedForSheet?.id ?? 'none'}`
    if (appliedRecordRef.current === token) return
    appliedRecordRef.current = token
    if (!savedForSheet || savedForSheet.answers.length !== paper.questions.length) {
      setAnswers((prev) => ({ ...prev, [paper.id]: paper.questions.map(() => -1) }))
      setScoredPapers((prev) => ({ ...prev, [paper.id]: false }))
      return
    }
    const signs: Partial<Record<ApprovalStep, string>> = {}
    const names: Partial<Record<ApprovalStep, string>> = {}
    for (const item of savedForSheet.approvals ?? []) {
      if (item.signedById) signs[item.step] = item.signedById
      if (item.signedByName) names[item.step] = item.signedByName
    }
    setAnswers((prev) => ({ ...prev, [paper.id]: savedForSheet.answers }))
    setScoredPapers((prev) => ({ ...prev, [paper.id]: true }))
    setExamDate(savedForSheet.examDate)
    setSupervisor(savedForSheet.supervisor || config.defaultSupervisor)
    setApprovalSigns(signs)
    setApprovalNames(names)
  }, [config.defaultSupervisor, examineeId, paper.id, paper.questions, savedForSheet])

  const approvalKey = `${savedForSheet?.id ?? ''}:${(savedForSheet?.approvals ?? []).map((item) => `${item.step}:${item.signedById}:${item.signedByName}`).join('|')}`
  const seenApproval = useRef('')
  useEffect(() => {
    if (!examineeId) return
    if (seenApproval.current === `${examineeId}:${paper.id}:${approvalKey}`) return
    seenApproval.current = `${examineeId}:${paper.id}:${approvalKey}`
    const signs: Partial<Record<ApprovalStep, string>> = {}
    const names: Partial<Record<ApprovalStep, string>> = {}
    for (const item of savedForSheet?.approvals ?? []) {
      if (item.signedById) signs[item.step] = item.signedById
      if (item.signedByName) names[item.step] = item.signedByName
    }
    setApprovalSigns(signs)
    setApprovalNames(names)
  }, [approvalKey, examineeId, paper.id, savedForSheet?.approvals])

  const isAdmin = user?.role === 'admin'
  const revealKey = isAdmin && showKey
  const pointEach = paper.questions.length ? Math.round(100 / paper.questions.length) : 0
  const picked = answers[paper.id] ?? paper.questions.map(() => -1)
  const correct = paper.questions.filter((question, index) => picked[index] === question.answer).length
  const score = paper.questions.length ? Math.round((correct / paper.questions.length) * 100) : 0
  const scored = Boolean(scoredPapers[paper.id]) && picked.every((value) => value >= 0)
  const printModel: ExamPrintInput = {
    kind: config.kind,
    examinee,
    examDate,
    supervisor: supervisor.trim(),
    paperId: paper.id,
    paperStep: paper.step,
    paperTitle: paper.title,
    answers: picked,
    correct,
    total: paper.questions.length,
    score,
    passed: score >= config.passScore,
    approvals: APPROVAL_STEPS.flatMap((step) =>
      approvalSigns[step] ? [{ step, signedById: approvalSigns[step], signedByName: approvalNames[step] ?? '' }] : [],
    ),
  }

  const choose = (index: number, option: number) => {
    setAnswers((prev) => {
      const next = [...(prev[paper.id] ?? paper.questions.map(() => -1))]
      next[index] = option
      return { ...prev, [paper.id]: next }
    })
    setScoredPapers((prev) => ({ ...prev, [paper.id]: false }))
  }

  const reset = () => {
    setAnswers((prev) => ({ ...prev, [paper.id]: paper.questions.map(() => -1) }))
    setScoredPapers((prev) => ({ ...prev, [paper.id]: false }))
    toast.message('답안과 채점 결과를 비웠습니다.')
  }

  const grade = () => {
    const missing = picked.filter((value) => value < 0).length
    if (missing > 0) {
      setGradeNotice({ title: '채점할 수 없습니다', detail: `${missing}문항이 비어 있습니다. 모두 고른 뒤 채점해 주세요.`, tone: 'warn' })
      return
    }
    const passed = score >= config.passScore
    setScoredPapers((prev) => ({ ...prev, [paper.id]: true }))
    setGradeNotice({
      title: passed ? '합격' : '불합격',
      detail: `${examinee} · ${score}점`,
      tone: passed ? 'pass' : 'fail',
    })
  }

  const save = async () => {
    if (!examinee) {
      toast.error('응시자를 선택해 주세요.')
      return
    }
    if (!scored) {
      toast.error('채점한 뒤에 저장해 주세요.')
      return
    }
    setSaving(true)
    try {
      const response = await fetch(config.apiPath, {
        method: 'POST',
        headers: getJsonAuthHeaders(user),
        body: JSON.stringify({
          examinee,
          examineeId: examineeId.startsWith('legacy:') ? '' : examineeId,
          examDate,
          supervisor: supervisor.trim(),
          paperId: paper.id,
          answers: picked,
          approvals: APPROVAL_STEPS.flatMap((step) =>
            approvalSigns[step] ? [{ step, signedById: approvalSigns[step], signedByName: approvalNames[step] ?? '' }] : [],
          ),
          basedOnId: savedForSheet?.id ?? '',
        }),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) {
        toast.error(typeof body.error === 'string' ? body.error : '저장하지 못했습니다.')
        return
      }
      const saved = body.data && typeof body.data === 'object' ? body.data as InternalAuditorExamRecord : null
      if (saved?.id) {
        appliedRecordRef.current = `${examineeId}:${paper.id}:${saved.id}`
        setSavedRecords((prev) => [saved, ...prev.filter((item) => item.id !== saved.id)])
      }
      toast.success(`${examinee} ${score}점 기록을 저장했습니다.`)
    } catch {
      toast.error('저장하지 못했습니다.')
    } finally {
      setSaving(false)
    }
  }

  const printExam = async () => {
    if (!examinee) {
      toast.error('응시자를 선택해 주세요.')
      return
    }
    if (!scored) {
      toast.error('채점한 뒤에 출력해 주세요.')
      return
    }
    const root = printRootRef.current
    if (!root) return
    const previousTitle = document.title
    document.body.classList.add('exam-sheet-print')
    document.title = `${config.examTitle}_${examinee}`
    let restored = false
    const restore = () => {
      if (restored) return
      restored = true
      document.body.classList.remove('exam-sheet-print')
      document.title = previousTitle
      window.removeEventListener('afterprint', restore)
    }
    try {
      await waitForExamImages(root)
      window.addEventListener('afterprint', restore)
      window.print()
      restore()
    } catch {
      restore()
      toast.error('시험지를 출력하지 못했습니다.')
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
    setApprovalNames((prev) => ({ ...prev, [label]: user.displayName || prev[label] || '' }))
  }

  return (
    <div className="mt-4 space-y-3">
      <div className="grid grid-cols-6 gap-2">
        {(
          [
            { icon: Layers, tone: 'bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300', label: '시험 세트', value: String(config.papers.length), unit: '건', sub: config.setSummary },
            { icon: Users, tone: 'bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300', label: '평가 대상', value: String(roster.length), unit: '명', sub: roster.length ? '자격인증대장 인원' : '대장에 해당 자격이 없습니다' },
            { icon: ClipboardCheck, tone: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300', label: '시험 점수 기록', value: String(savedRecords.length), unit: '건', sub: '저장된 채점 결과' },
            { icon: ListChecks, tone: 'bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300', label: '배점', value: String(paper.questions.length), unit: `문항 × ${pointEach}점`, sub: '4지선다 · 100점 만점' },
            { icon: Target, tone: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300', label: '합격 기준', value: String(config.passScore), unit: '점 이상', sub: config.passBasis },
            { icon: Link2, tone: 'bg-violet-50 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300', label: '결과 연계', value: '갱신 화면', sub: '저장한 응시·점수가 갱신 요건에 표시됩니다', valueClassName: 'text-base' },
          ] as const
        ).map((item) => (
          <QualificationStatCard key={item.label} {...item} />
        ))}
      </div>

      <div className="grid items-start gap-3 xl:grid-cols-[17.5rem_minmax(0,1fr)_17.5rem]">
        <aside ref={settingsRef} className="sticky top-3 z-10 max-h-[calc(100dvh-5.5rem)] self-start overflow-y-auto rounded-2xl border bg-card p-3 shadow-sm will-change-transform">
          <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-slate-100">
            <span className="flex size-6 items-center justify-center rounded-md bg-sky-600 text-[10px] text-white">01</span>
            시험 설정
          </h2>
          <div className="mt-3 space-y-2">
            {config.papers.map((item) => {
              const active = item.id === paper.id
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setPaperId(item.id)}
                  className={cn(
                    'flex w-full gap-2 rounded-xl border px-2.5 py-2 text-left',
                    active ? 'border-sky-300 bg-sky-50 dark:bg-sky-500/10' : 'border-transparent hover:bg-slate-50 dark:hover:bg-muted/40',
                  )}
                >
                  <span className={cn('mt-0.5 size-3.5 shrink-0 rounded-full border', active ? 'border-sky-600 bg-sky-600 shadow-[inset_0_0_0_2px_white]' : 'border-slate-300')} />
                  <span>
                    <span className="block text-sm font-bold text-slate-900 dark:text-slate-100">{item.step} · {item.title}</span>
                    <span className="mt-0.5 block text-xs leading-snug text-slate-700 dark:text-slate-300">{item.standards}</span>
                  </span>
                </button>
              )
            })}
          </div>
          <label className="mt-3 block text-[13px] font-semibold text-slate-900 dark:text-slate-100">
            응시자
            <Select value={examineeId} onValueChange={(value) => { if (value) setExamineeId(value) }}>
              <SelectTrigger aria-label="응시자" className="mt-1 h-9 w-full bg-background px-2.5 text-[15px] font-semibold text-slate-900 dark:text-slate-100">
                <SelectValue placeholder={roster.length ? '응시자 선택' : '대장 인원 없음'}>
                  {examineePerson ? (
                    <span className="flex min-w-0 items-baseline gap-1.5">
                      <span className="truncate">{examineePerson.name}</span>
                      {examineePerson.meta ? (
                        <span className="truncate text-[13px] font-normal text-slate-500">{examineePerson.meta}</span>
                      ) : null}
                    </span>
                  ) : null}
                </SelectValue>
              </SelectTrigger>
              <SelectContent side="top" align="start">
                <SelectGroup>
                  {roster.map((person) => (
                    <SelectItem key={person.id} value={person.id} className="text-[15px] text-slate-900 dark:text-slate-100">
                      {person.name}
                      <span className="font-normal text-slate-600 dark:text-slate-400">{person.meta}</span>
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </label>
          <label className="mt-2 block text-[13px] font-semibold text-slate-900 dark:text-slate-100">
            시험일
            <Input className="mt-1 h-9 w-full min-w-0 bg-background text-[15px] font-medium text-slate-900 md:text-[15px] dark:text-slate-100" type="date" value={examDate} onChange={(event) => setExamDate(event.target.value)} />
          </label>
          <label className="mt-2 block text-[13px] font-semibold text-slate-900 dark:text-slate-100">
            감독자
            <Input className="mt-1 h-9 w-full bg-background text-[15px] font-semibold text-slate-900 md:text-[15px] dark:text-slate-100" value={supervisor} onChange={(event) => setSupervisor(event.target.value)} placeholder="감독자 이름" />
          </label>
          {isAdmin && (
            <div className="mt-2">
              <p className="text-[13px] font-semibold text-slate-900 dark:text-slate-100">모범답안 (정답 해설)</p>
              <div className="mt-1 grid grid-cols-2 rounded-lg bg-slate-100 p-0.5 dark:bg-white/10">
                {([
                  [true, '정답 표시'],
                  [false, '정답 숨김'],
                ] as const).map(([value, label]) => (
                  <button
                    key={label}
                    type="button"
                    aria-pressed={showKey === value}
                    onClick={() => setShowKey(value)}
                    className={cn(
                      'h-8 rounded-md text-sm font-semibold text-slate-900 dark:text-slate-100',
                      showKey === value
                        ? value
                          ? 'bg-emerald-600 text-white shadow-sm'
                          : 'bg-white text-slate-900 shadow-sm ring-1 ring-black/10 dark:bg-slate-900 dark:text-slate-100 dark:ring-white/15'
                        : 'text-slate-600 hover:text-slate-900 dark:text-slate-400',
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="mt-3">
            <p className="text-sm font-bold text-slate-900 dark:text-slate-100">세트 운영 (안)</p>
            <ul className="mt-1 space-y-1 text-[13px] font-medium leading-snug text-slate-900 dark:text-slate-100">
              {config.setOperation.map((line) => (
                <li key={line}>· {line}</li>
              ))}
            </ul>
          </div>
        </aside>

        <section className="min-w-0">
          <article className="overflow-hidden border-2 border-slate-800 bg-white text-slate-900 shadow-[0_10px_28px_rgba(15,23,42,0.08)] dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:shadow-[0_8px_24px_rgba(0,0,0,0.35)]">
            <header className="grid items-center gap-3 border-b-2 border-slate-800 px-4 py-4 sm:grid-cols-[1fr_auto_1fr] dark:border-zinc-600">
              <div className="hidden sm:block" />
              <div className="text-center">
                <p className="text-[11px] tracking-[0.38em] text-slate-500 dark:text-zinc-400">WOORI-HIP · 품질관리</p>
                <h2 className="mt-1 text-[1.7rem] leading-none font-black tracking-[0.22em]">{config.examTitle}</h2>
                <p className="mt-2 text-sm font-bold">{paper.step} · {paper.title}</p>
                <p className="mt-0.5 text-[11px] text-slate-500 dark:text-zinc-400">{paper.standards}</p>
              </div>
              <table className="ml-auto border-collapse border border-slate-800 text-[11px] dark:border-zinc-600">
                <tbody>
                  <tr>
                    <th rowSpan={3} className="w-6 border border-slate-800 bg-slate-50 px-1 font-bold [writing-mode:vertical-rl] dark:border-zinc-600 dark:bg-zinc-800/80">결재</th>
                    {APPROVAL_STEPS.map((label) => (
                      <th key={label} className="w-16 border border-slate-800 px-1 py-0.5 text-center font-semibold dark:border-zinc-600">{label}</th>
                    ))}
                  </tr>
                  <tr>
                    {APPROVAL_STEPS.map((label) => {
                      const signUserId = approvalSigns[label]
                      return (
                        <td key={label} className="border border-slate-800 bg-white p-0.5 align-top dark:border-zinc-600 dark:bg-zinc-900">
                          <button
                            type="button"
                            onClick={() => signApproval(label)}
                            className={cn(
                              'flex h-8 w-full items-center justify-center rounded-[3px]',
                              signUserId
                                ? 'bg-white dark:bg-zinc-800'
                                : 'flex-col gap-0.5 border border-dashed border-slate-300 text-slate-400 hover:border-slate-500 hover:text-slate-600 dark:border-zinc-600 dark:text-zinc-500 dark:hover:border-zinc-400 dark:hover:text-zinc-200',
                            )}
                            aria-label={signUserId ? `${label} 서명 해제` : `${label} 서명`}
                          >
                            {signUserId ? (
                              <img
                                src={`/api/auth/signature?userId=${encodeURIComponent(signUserId)}`}
                                alt={`${label} 서명`}
                                className="max-h-8 max-w-[90%] object-contain"
                              />
                            ) : (
                              <>
                                <PenLine className="size-3" />
                                <span className="text-[8px] font-medium leading-none">서명</span>
                              </>
                            )}
                          </button>
                          {!signUserId ? (
                            <StampApprovalButton
                              className="mt-0.5 block w-full text-center print:hidden"
                              disabled={!savedForSheet}
                              hint="채점 저장 후 결재를 올릴 수 있습니다."
                              target={{
                                kind: 'exam',
                                examKind: config.kind,
                                recordId: savedForSheet?.id ?? '',
                                examinee,
                                step: label,
                              }}
                              title={`${config.examTitle} ${label}`}
                              body={`${examinee || '응시자'} · ${paper.step} ${label} 서명`}
                            />
                          ) : null}
                        </td>
                      )
                    })}
                  </tr>
                  <tr>
                    {APPROVAL_STEPS.map((label) => (
                      <td key={`${label}-name`} className="h-5 border border-slate-800 bg-white px-1 text-center text-[10px] dark:border-zinc-600 dark:bg-zinc-900">
                        {approvalNames[label] ? (
                          <span className="font-semibold">{approvalNames[label]}</span>
                        ) : (
                          <span className="text-slate-400">성명</span>
                        )}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </header>
            <dl className="grid grid-cols-2 border-b-2 border-slate-800 text-[12px] sm:grid-cols-5 dark:border-zinc-600">
              {[
                ['성명', examinee || '—'],
                ['시험일', examDate || '—'],
                ['감독자', supervisor.trim() || '—'],
                ['문항', `${paper.questions.length}문항`],
                ['득점', scored ? `${score} / 100` : '미채점'],
              ].map(([label, value]) => (
                <div key={label} className="flex min-w-0 border-slate-300 not-last:border-b sm:not-last:border-b-0 sm:[&:not(:last-child)]:border-r dark:border-zinc-700">
                  <dt className="w-14 shrink-0 bg-slate-100 px-2 py-2 text-center font-bold dark:bg-zinc-800/70">{label}</dt>
                  <dd className="min-w-0 flex-1 truncate px-2 py-2 font-semibold tabular-nums">{value}</dd>
                </div>
              ))}
            </dl>
            <p className="border-b border-dashed border-slate-400 px-5 py-2 text-[12px] leading-relaxed text-slate-600 dark:border-zinc-600 dark:text-zinc-400">
              ※ 각 문항에서 가장 알맞은 것 하나를 고르시오. 합격 기준은 {config.passScore}점입니다.
              {revealKey ? ' 초록 표시는 모범답안입니다.' : ''}
            </p>
            <ol className="grid sm:grid-cols-2" style={{ wordBreak: 'keep-all' }}>
              {paper.questions.map((question, index) => (
                  <li key={question.prompt} className="row-span-2 grid grid-rows-subgrid border-b border-slate-200 px-5 py-4 sm:odd:border-r dark:border-zinc-700/60">
                    <div className="pb-2">
                      <div className="flex items-baseline gap-2.5">
                        <span className="w-7 shrink-0 text-right text-base font-black tabular-nums">{index + 1}.</span>
                        <p className="min-w-0 flex-1 text-[15px] leading-7 font-semibold">{question.prompt}</p>
                      </div>
                      <p className="mt-0.5 pl-9 text-[11px] font-semibold tracking-wide text-slate-400">{question.tag}</p>
                    </div>
                    <div className="flex flex-col">
                    {question.options.map((option, optionIndex) => {
                        const selected = picked[index] === optionIndex
                        const isAnswer = revealKey && question.answer === optionIndex
                        return (
                          <label
                            key={option}
                            className={cn(
                              'flex cursor-pointer items-start gap-2 rounded-md py-1 pr-1.5 pl-9 text-[14px] leading-6',
                              selected && 'bg-amber-300 font-bold text-slate-950',
                            )}
                          >
                            <input
                              type="radio"
                              name={`${paper.id}-${index}`}
                              checked={selected}
                              onChange={() => choose(index, optionIndex)}
                              className="sr-only"
                            />
                            <span
                              className={cn(
                                'mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border text-[12px] leading-none',
                                selected ? 'border-slate-950 bg-slate-950 text-white' : 'border-slate-400 bg-white text-slate-700 dark:border-zinc-500 dark:bg-zinc-800 dark:text-zinc-200',
                              )}
                            >
                              {CHOICE_MARKS[optionIndex] ?? optionIndex + 1}
                            </span>
                            <span className="min-w-0 flex-1">{option}</span>
                            {isAnswer ? <span className="mt-0.5 shrink-0 rounded-full bg-emerald-600 px-1.5 text-[10px] leading-5 font-black text-white">정답</span> : null}
                          </label>
                        )
                      })}
                    </div>
                  </li>
              ))}
            </ol>
          </article>
        </section>

        <aside ref={scoreCardRef} className="sticky top-3 z-10 flex max-h-[calc(100dvh-5.5rem)] flex-col self-start overflow-y-auto rounded-2xl border bg-card p-3 shadow-sm will-change-transform">
          <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-slate-100">
            <span className="flex size-6 items-center justify-center rounded-md bg-sky-600 text-[10px] text-white">03</span>
            채점 결과
          </h2>
          <p className="mt-3 text-center">
            <span className="text-4xl font-black tabular-nums text-sky-700">{scored ? score : '—'}</span>
            <span className="text-base font-bold text-slate-700 dark:text-slate-300"> / 100점</span>
          </p>
          <p className={cn(
            'mx-auto mt-1 w-fit rounded-full px-2.5 py-1 text-xs font-bold',
            !scored ? 'bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-300' : score >= config.passScore ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700',
          )}>
            {scored ? (score >= config.passScore ? '합격' : '불합격') : '채점 전'}
          </p>
          <div className="relative mt-4 h-8">
            <div className="absolute inset-x-0 top-3 h-1.5 rounded-full bg-slate-100">
              <div className="h-full rounded-full bg-sky-500" style={{ width: `${scored ? score : 0}%` }} />
            </div>
            <div className="absolute top-1.5 h-4 w-0.5 -translate-x-1/2 bg-emerald-600" style={{ left: `${config.passScore}%` }} title="합격선" />
            <div className="absolute top-0 flex w-full justify-between text-[11px] font-medium text-slate-700 dark:text-slate-300">
              {[0, 20, 40, 60, 80, 100].map((mark) => (
                <span key={mark}>{mark}</span>
              ))}
            </div>
          </div>
          <p className="text-right text-xs text-emerald-700">합격선 {config.passScore}</p>
          <div className="mt-3 overflow-hidden rounded-xl border border-slate-200 dark:border-white/10">
            <p className="border-b border-slate-200 bg-slate-50 px-2.5 py-1.5 text-sm font-bold text-slate-950 dark:border-white/10 dark:bg-white/5 dark:text-white">평가 연명</p>
            <dl className="divide-y divide-slate-200 text-sm dark:divide-white/10">
              {(
                [
                  ['응시자', examinee || '—'],
                  ['시험일', examDate || '—'],
                  ['감독자', supervisor.trim() || '—'],
                  ['시험', `${paper.step} ${paper.title}`],
                  ['정답', scored ? `${correct} / ${paper.questions.length}` : '—'],
                  ['판정', scored ? (score >= config.passScore ? '합격' : '불합격') : '채점 전'],
                ] as const
              ).map(([label, value]) => (
                <div key={label} className="grid grid-cols-[4.2rem_minmax(0,1fr)] items-center">
                  <dt className="bg-slate-50 px-2.5 py-1.5 font-semibold text-slate-500 dark:bg-white/[0.03] dark:text-slate-400">{label}</dt>
                  <dd className={cn('truncate px-2 py-1.5 font-semibold text-slate-950 dark:text-white', label === '판정' && scored && (score >= config.passScore ? 'text-emerald-700' : 'text-rose-700'))}>{value}</dd>
                </div>
              ))}
            </dl>
          </div>
          <p className="mt-2 text-xs leading-snug text-slate-600 dark:text-slate-400">
            {savedForSheet ? `저장된 기록 ${savedForSheet.score}점 · ${savedForSheet.examDate}` : '채점한 뒤 저장하면 시험 기록으로 남습니다.'}
          </p>
          <Button type="button" className="mt-3 h-10 w-full bg-sky-700 text-sm text-white hover:bg-sky-800" onClick={grade}>
            채점
          </Button>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <Button type="button" variant="outline" className="h-10 text-sm" onClick={reset}>초기화</Button>
            <Button type="button" className="h-10 bg-sky-700 text-sm text-white hover:bg-sky-800" disabled={saving} onClick={save}>
              {saving ? '저장 중' : '저장'}
            </Button>
          </div>
          <Button type="button" variant="outline" className="mt-2 h-10 w-full gap-1.5 text-sm" onClick={() => void printExam()}>
            <Printer className="size-4" />
            출력
          </Button>
        </aside>
      </div>
      <div ref={printRootRef} className="exam-print-root" aria-hidden>
        <ExamPrintSheet exam={printModel} />
      </div>
      <Dialog open={gradeNotice != null} onOpenChange={(open) => { if (!open) setGradeNotice(null) }}>
        <DialogContent showCloseButton={false} className="max-w-[16rem] justify-items-center overflow-visible px-6 py-7 text-center">
          <style>{'@keyframes grade-pop{0%{transform:scale(.55)}55%{transform:scale(1.12)}100%{transform:scale(1)}}@keyframes grade-shake{0%,100%{transform:translateX(0)}20%{transform:translateX(-10px)}40%{transform:translateX(9px)}60%{transform:translateX(-6px)}80%{transform:translateX(4px)}}'}</style>
          <div className={cn(
            'grid justify-items-center gap-2',
            gradeNotice?.tone === 'pass' && 'animate-[grade-pop_480ms_cubic-bezier(.2,1.4,.4,1)]',
            gradeNotice?.tone === 'fail' && 'animate-[grade-shake_520ms_ease-in-out]',
          )}>
            <DialogTitle className={cn(
              'text-3xl font-black tracking-tight',
              gradeNotice?.tone === 'pass' && 'text-emerald-600 drop-shadow-[0_8px_18px_rgba(16,185,129,0.45)]',
              gradeNotice?.tone === 'fail' && 'text-rose-600',
              gradeNotice?.tone === 'warn' && 'text-xl text-slate-900',
            )}>
              {gradeNotice?.title}
            </DialogTitle>
            <DialogDescription className="text-sm font-semibold text-slate-700">{gradeNotice?.detail}</DialogDescription>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
