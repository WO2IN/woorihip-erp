'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, Printer, Search } from 'lucide-react'
import { toast } from 'sonner'
import {
  CertificateSheet,
  draftFromRow,
  printable,
  waitForPrintImages,
  type CertPhoto,
} from '@/components/quality/recognition-certificate-draft'
import { ExamPrintSheet } from '@/components/quality/exam-print-sheet'
import { SuitabilityLedgerPrintPage } from '@/components/quality/suitability-sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  deriveQualificationStatus,
  qualificationExamKind,
  qualificationLedgerBadgeClass,
  statusLabel,
  type QualificationLedgerRow,
} from '@/lib/qualification-ledger'
import type { InternalAuditorExamRecord } from '@/lib/internal-auditor-exam'
import { suitabilityEvalDate, suitabilityScoreTotal, type SuitabilitySheetPersisted } from '@/lib/suitability-ledger-bridge'
import { cn } from '@/lib/utils'

type DocKey = 'suitability' | 'recognition' | 'exam'

type ExamRecord = InternalAuditorExamRecord

type PersonRow = {
  row: QualificationLedgerRow
  status: ReturnType<typeof deriveQualificationStatus>
  suitabilityTotal: number | null
  suitabilityDate: string
  recognitionReady: boolean
  exam: (ExamRecord & { kind: 'auditor' | 'inspector' }) | null
}

const STATUS_TONE = {
  valid: 'bg-emerald-50 text-emerald-700',
  expiring: 'bg-amber-50 text-amber-700',
  expired: 'bg-rose-50 text-rose-700',
  cancelled: 'bg-slate-100 text-slate-500',
} as const

function dotDate(iso: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso.replaceAll('-', '.') : iso || '—'
}

function photoFor(row: QualificationLedgerRow): CertPhoto | undefined {
  const fileId = row.idPhotoFileId.trim()
  return fileId ? { data: `/api/files/${fileId}`, mime: 'image/jpeg', name: '증명사진', fileId } : undefined
}

export function QualificationPrintHub() {
  const [rows, setRows] = useState<QualificationLedgerRow[]>([])
  const [store, setStore] = useState<SuitabilitySheetPersisted | null>(null)
  const [exams, setExams] = useState<{ auditor: ExamRecord[]; inspector: ExamRecord[] }>({ auditor: [], inspector: [] })
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [focus, setFocus] = useState<'all' | 'suitability' | 'exam' | 'recognition'>('all')
  const [picked, setPicked] = useState<Record<string, Partial<Record<DocKey, boolean>>>>({})
  const [options, setOptions] = useState({ border: true, seal: true, photo: true })
  const [printing, setPrinting] = useState(false)
  const printRootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let ignore = false
    Promise.all([
      fetch('/api/quality/qualifications', { cache: 'no-store' }).then((response) => response.json()).catch(() => ({ data: [] })),
      fetch('/api/quality/suitability', { cache: 'no-store' }).then((response) => response.json()).catch(() => ({ data: null })),
      fetch('/api/quality/internal-auditor-exams', { cache: 'no-store' }).then((response) => response.json()).catch(() => ({ data: [] })),
      fetch('/api/quality/inspector-exams', { cache: 'no-store' }).then((response) => response.json()).catch(() => ({ data: [] })),
    ])
      .then(([ledger, suitability, auditor, inspector]) => {
        if (ignore) return
        setRows(Array.isArray(ledger.data) ? ledger.data : [])
        setStore(suitability?.data ?? null)
        setExams({
          auditor: Array.isArray(auditor.data) ? auditor.data : [],
          inspector: Array.isArray(inspector.data) ? inspector.data : [],
        })
      })
      .finally(() => {
        if (!ignore) setLoading(false)
      })
    return () => {
      ignore = true
    }
  }, [])

  const people = useMemo<PersonRow[]>(() => {
    return rows.filter((row) => row.status !== 'cancelled').map((row) => {
      const overlay = store?.overlays?.[row.id]
      const kind = qualificationExamKind(row.qualification)
      const latest = kind
        ? exams[kind]
            .filter((exam) => (exam.examineeId ? exam.examineeId === row.id : exam.examinee.trim() === row.name.trim()))
            .sort((a, b) => b.examDate.localeCompare(a.examDate))[0]
        : undefined
      return {
        row,
        status: deriveQualificationStatus(row),
        suitabilityTotal: suitabilityScoreTotal(overlay?.scores ?? null),
        suitabilityDate: suitabilityEvalDate(overlay),
        recognitionReady: printable(row),
        exam: latest && kind ? { ...latest, kind } : null,
      }
    })
  }, [exams, rows, store])

  const visible = people.filter((item) => {
    if (focus === 'suitability' && item.suitabilityTotal == null) return false
    if (focus === 'exam' && !item.exam) return false
    if (focus === 'recognition' && (item.status === 'cancelled' || !item.recognitionReady)) return false
    const text = query.trim()
    if (!text) return true
    return [item.row.name, item.row.certNo, item.row.department, item.row.qualification].some((value) => value.includes(text))
  })

  const canPick = (item: PersonRow, key: DocKey) => {
    if (key === 'suitability') return item.suitabilityTotal != null
    if (key === 'exam') return item.exam != null
    return item.status !== 'cancelled'
  }

  const toggle = (id: string, key: DocKey) =>
    setPicked((prev) => ({ ...prev, [id]: { ...prev[id], [key]: !prev[id]?.[key] } }))

  const columnAll = (key: DocKey) => {
    const targets = visible.filter((item) => canPick(item, key))
    const allOn = targets.length > 0 && targets.every((item) => picked[item.row.id]?.[key])
    setPicked((prev) => {
      const next = { ...prev }
      for (const item of targets) next[item.row.id] = { ...next[item.row.id], [key]: !allOn }
      return next
    })
  }

  const rowAll = (item: PersonRow) => {
    const keys = (['suitability', 'recognition', 'exam'] as const).filter((key) => canPick(item, key))
    const allOn = keys.length > 0 && keys.every((key) => picked[item.row.id]?.[key])
    setPicked((prev) => ({
      ...prev,
      [item.row.id]: Object.fromEntries(keys.map((key) => [key, !allOn])),
    }))
  }

  const pages = people.flatMap((item) => {
    const choice = picked[item.row.id] ?? {}
    const list: { key: string; type: DocKey; item: PersonRow }[] = []
    if (choice.suitability && canPick(item, 'suitability')) list.push({ key: `${item.row.id}-suit`, type: 'suitability', item })
    if (choice.recognition && canPick(item, 'recognition')) list.push({ key: `${item.row.id}-cert`, type: 'recognition', item })
    if (choice.exam && canPick(item, 'exam')) list.push({ key: `${item.row.id}-exam`, type: 'exam', item })
    return list
  })
  const suitCount = pages.filter((page) => page.type === 'suitability').length
  const certCount = pages.filter((page) => page.type === 'recognition').length
  const examCount = pages.filter((page) => page.type === 'exam').length

  const printAll = async () => {
    const root = printRootRef.current
    if (!root || pages.length === 0) {
      toast.error('출력할 서류를 선택하세요.')
      return
    }
    setPrinting(true)
    const html = document.documentElement
    const previousTitle = document.title
    html.classList.add('qual-hub-print-html')
    document.body.classList.add('qual-hub-print')
    document.title = '자격인증_출력'
    let restored = false
    const restore = () => {
      if (restored) return
      restored = true
      html.classList.remove('qual-hub-print-html')
      document.body.classList.remove('qual-hub-print')
      document.title = previousTitle
      setPrinting(false)
      window.removeEventListener('afterprint', restore)
    }
    try {
      await waitForPrintImages(root)
      window.addEventListener('afterprint', restore)
      window.print()
      restore()
    } catch {
      restore()
      toast.error('출력에 실패했습니다.')
    }
  }

  const headCheck = (key: DocKey, label: string) => {
    const targets = visible.filter((item) => canPick(item, key))
    const onCount = targets.filter((item) => picked[item.row.id]?.[key]).length
    const state: boolean | 'some' = targets.length > 0 && onCount === targets.length ? true : onCount > 0 ? 'some' : false
    return (
      <button
        type="button"
        onClick={() => columnAll(key)}
        disabled={targets.length === 0}
        className="inline-flex items-center gap-2 font-bold text-slate-700 disabled:opacity-40 dark:text-slate-200"
      >
        <CheckMark state={state} />
        <span>{label}</span>
        <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[11px] font-semibold text-slate-500 tabular-nums dark:bg-white/10 dark:text-slate-300">{targets.length}</span>
      </button>
    )
  }

  return (
    <>
      <section className="mt-4 overflow-hidden rounded-2xl border bg-card shadow-sm">
        <header className="flex flex-wrap items-end justify-between gap-4 border-b px-5 py-4">
          <div>
            <h2 className="text-lg font-bold text-slate-950 dark:text-white">출력</h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">사람마다 뽑을 서류를 고른 뒤, 오른쪽에서 한 번에 인쇄합니다.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
              <Input
                className="h-10 w-56 bg-background pl-9 text-sm md:text-sm"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="이름, 번호, 소속, 자격"
              />
            </div>
            <Button
              type="button"
              className="h-10 gap-1.5 bg-emerald-700 px-4 text-white hover:bg-emerald-800 disabled:bg-slate-200 disabled:text-slate-500 dark:disabled:bg-white/10 dark:disabled:text-slate-400"
              disabled={printing || pages.length === 0}
              onClick={() => void printAll()}
            >
              <Printer className="size-4" />
              {printing ? '출력 중…' : pages.length ? `${pages.length}장 출력` : '출력할 서류 없음'}
            </Button>
          </div>
        </header>

        <div className="flex flex-wrap items-center gap-2 border-b px-5 py-3">
          {([
            ['all', '전체', people.length],
            ['suitability', '평가서 있음', people.filter((item) => item.suitabilityTotal != null).length],
            ['exam', '시험 있음', people.filter((item) => item.exam).length],
            ['recognition', '인정서 준비됨', people.filter((item) => item.status !== 'cancelled' && item.recognitionReady).length],
          ] as const).map(([key, label, count]) => (
            <button
              key={key}
              type="button"
              onClick={() => setFocus(key)}
              className={cn(
                'inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[13px] font-semibold',
                focus === key
                  ? 'border-slate-900 bg-slate-900 text-white dark:border-white dark:bg-white dark:text-slate-950'
                  : 'border-slate-200 bg-white text-slate-600 hover:border-slate-400 dark:border-white/10 dark:bg-transparent dark:text-slate-300',
              )}
            >
              {label}
              <span className={cn('tabular-nums', focus === key ? 'text-white/70 dark:text-slate-500' : 'text-slate-400')}>{count}</span>
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-slate-50 px-5 py-3 dark:bg-white/[0.03]">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="rounded-lg bg-white px-2.5 py-1 font-bold text-slate-900 shadow-sm dark:bg-black dark:text-white">
              선택 {pages.length}장
            </span>
            <CountChip label="평가서" count={suitCount} />
            <CountChip label="인정서" count={certCount} />
            <CountChip label="시험" count={examCount} />
            {pages.length > 0 ? (
              <button type="button" className="px-1 text-[13px] font-semibold text-slate-500 underline-offset-2 hover:underline" onClick={() => setPicked({})}>
                선택 해제
              </button>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-[12px] font-bold tracking-wide text-slate-400">인정서</span>
            {([
              ['border', '테두리'],
              ['seal', '직인'],
              ['photo', '사진'],
            ] as const).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setOptions((prev) => ({ ...prev, [key]: !prev[key] }))}
                className={cn(
                  'inline-flex h-8 items-center gap-1.5 rounded-full border px-2.5 text-[13px] font-semibold',
                  options[key]
                    ? 'border-emerald-600 bg-emerald-600 text-white'
                    : 'border-slate-200 bg-white text-slate-500 dark:border-white/10 dark:bg-transparent dark:text-slate-300',
                )}
              >
                <CheckMark state={options[key]} light={options[key]} />
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[68rem] border-collapse text-sm">
            <thead className="sticky top-0 z-10 bg-card">
              <tr className="border-b text-left text-[13px] text-slate-500">
                <th className="w-12 px-4 py-3" />
                <th className="px-3 py-3 font-bold">사람</th>
                <th className="px-3 py-3 font-bold">자격 · 상태</th>
                <th className="px-3 py-3">{headCheck('suitability', '적격성평가서')}</th>
                <th className="px-3 py-3">{headCheck('recognition', '자격인정서')}</th>
                <th className="px-3 py-3">{headCheck('exam', '시험')}</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-16 text-center text-sm text-muted-foreground">불러오는 중…</td>
                </tr>
              ) : visible.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-16 text-center text-sm text-muted-foreground">
                    {rows.length ? '조건에 맞는 사람이 없습니다.' : '자격인증대장에 등록된 인원이 없습니다.'}
                  </td>
                </tr>
              ) : (
                visible.map((item) => {
                  const choice = picked[item.row.id] ?? {}
                  const keys = (['suitability', 'recognition', 'exam'] as const).filter((key) => canPick(item, key))
                  const onCount = keys.filter((key) => choice[key]).length
                  const rowState: boolean | 'some' = onCount === 0 ? false : onCount === keys.length ? true : 'some'
                  return (
                    <tr
                      key={item.row.id}
                      className={cn('border-b border-slate-100 dark:border-white/10', onCount > 0 && 'bg-emerald-50/50 dark:bg-emerald-500/[0.06]')}
                    >
                      <td className="px-4 py-3 align-middle">
                        <button type="button" aria-label={`${item.row.name} 서류 모두 선택`} onClick={() => rowAll(item)} disabled={keys.length === 0}>
                          <CheckMark state={rowState} />
                        </button>
                      </td>
                      <td className="px-3 py-3 align-middle">
                        <div className="flex items-center gap-3">
                          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-sm font-black text-slate-700 dark:bg-white/10 dark:text-slate-100">
                            {(item.row.name || '?').slice(0, 1)}
                          </span>
                          <div className="min-w-0">
                            <p className="truncate text-[15px] font-bold text-slate-950 dark:text-white">{item.row.name || '이름 없음'}</p>
                            <p className="truncate text-[12px] text-slate-500">
                              {[item.row.certNo, item.row.department, item.row.rank].filter(Boolean).join(' · ') || '소속 없음'}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3 align-middle">
                        <div className="flex flex-col items-start gap-1.5">
                          <span className={cn('rounded-md px-2 py-0.5 text-[12px] font-bold', qualificationLedgerBadgeClass(item.row.qualification))}>
                            {item.row.qualification}
                          </span>
                          <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-bold', STATUS_TONE[item.status])}>
                            {statusLabel(item.status)}
                          </span>
                        </div>
                      </td>
                      <td className="px-3 py-3 align-middle">
                        <DocToggle
                          on={Boolean(choice.suitability)}
                          disabled={!canPick(item, 'suitability')}
                          onToggle={() => toggle(item.row.id, 'suitability')}
                          kicker="평가서"
                          title={item.suitabilityTotal != null ? `${item.suitabilityTotal}점` : '미작성'}
                          sub={item.suitabilityTotal != null ? (item.suitabilityDate ? `${dotDate(item.suitabilityDate)} 평가` : '평가일 없음') : '점수 입력 후 출력'}
                          tone={item.suitabilityTotal == null ? 'muted' : item.suitabilityTotal >= 80 ? 'ok' : 'warn'}
                        />
                      </td>
                      <td className="px-3 py-3 align-middle">
                        <DocToggle
                          on={Boolean(choice.recognition)}
                          disabled={!canPick(item, 'recognition')}
                          onToggle={() => toggle(item.row.id, 'recognition')}
                          kicker="인정서"
                          title={item.status === 'cancelled' ? '출력 제한' : item.recognitionReady ? '출력 가능' : '확인 필요'}
                          sub={item.status === 'cancelled' ? '취소된 자격' : `갱신 ${dotDate(item.row.expiryDate)}`}
                          tone={item.status === 'cancelled' ? 'muted' : item.recognitionReady ? 'ok' : 'warn'}
                        />
                      </td>
                      <td className="px-3 py-3 align-middle">
                        <DocToggle
                          on={Boolean(choice.exam)}
                          disabled={!canPick(item, 'exam')}
                          onToggle={() => toggle(item.row.id, 'exam')}
                          kicker="시험"
                          title={item.exam ? `${item.exam.score}점` : qualificationExamKind(item.row.qualification) ? '미응시' : '해당 없음'}
                          sub={item.exam ? `${item.exam.passed ? '합격' : '불합격'} · ${dotDate(item.exam.examDate)}${item.exam.paperStep ? ` · ${item.exam.paperStep}` : ''}` : '저장 후 출력'}
                          tone={!item.exam ? 'muted' : item.exam.passed ? 'ok' : 'bad'}
                        />
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      <div ref={printRootRef} className="qual-hub-print-root" aria-hidden>
        {pages.map((page) =>
          page.type === 'suitability' ? (
            <div key={page.key} className="qual-hub-page qual-hub-page-suit">
              <SuitabilityLedgerPrintPage row={page.item.row} store={store} />
            </div>
          ) : page.type === 'recognition' ? (
            <div key={page.key} className="qual-hub-page qual-hub-page-cert recognition-certificate-page">
              <CertificateSheet
                draft={draftFromRow(page.item.row)}
                photo={options.photo ? photoFor(page.item.row) : undefined}
                showPhoto={options.photo}
                showBorder={options.border}
                showSeal={options.seal}
              />
            </div>
          ) : page.item.exam ? (
            <div key={page.key} className="qual-hub-page qual-hub-page-exam">
              <ExamPrintSheet exam={{ ...page.item.exam, kind: page.item.exam.kind }} />
            </div>
          ) : null,
        )}
      </div>
    </>
  )
}

function CountChip({ label, count }: { label: string; count: number }) {
  return (
    <span className={cn('rounded-lg px-2 py-1 text-[13px] font-semibold', count > 0 ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-200' : 'text-slate-400')}>
      {label} {count}
    </span>
  )
}

function CheckMark({ state, light = false }: { state: boolean | 'some'; light?: boolean }) {
  const on = state === true
  return (
    <span
      className={cn(
        'flex size-[18px] shrink-0 items-center justify-center rounded-[5px] border',
        on || state === 'some'
          ? 'border-emerald-600 bg-emerald-600 text-white'
          : light
            ? 'border-white/70 bg-white/15'
            : 'border-slate-300 bg-white dark:border-white/20 dark:bg-transparent',
      )}
    >
      {on ? <Check className="size-3" strokeWidth={3} /> : state === 'some' ? <span className="h-0.5 w-2 rounded-full bg-white" /> : null}
    </span>
  )
}

function DocToggle({
  on,
  disabled,
  onToggle,
  kicker,
  title,
  sub,
  tone,
}: {
  on: boolean
  disabled: boolean
  onToggle: () => void
  kicker: string
  title: string
  sub: string
  tone: 'ok' | 'warn' | 'bad' | 'muted'
}) {
  const toneClass = {
    ok: 'text-emerald-700 dark:text-emerald-300',
    warn: 'text-amber-700 dark:text-amber-300',
    bad: 'text-rose-700 dark:text-rose-300',
    muted: 'text-slate-400',
  }[tone]
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onToggle}
      className={cn(
        'flex w-full min-w-[11.5rem] items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors',
        disabled
          ? 'cursor-not-allowed border-dashed border-slate-200 bg-slate-50/70 dark:border-white/10 dark:bg-white/[0.02]'
          : on
            ? 'border-emerald-500 bg-white shadow-[inset_3px_0_0_#059669] dark:bg-emerald-500/10'
            : 'border-slate-200 bg-white hover:border-slate-400 dark:border-white/10 dark:bg-transparent',
      )}
    >
      <CheckMark state={!disabled && on} />
      <span className="min-w-0">
        <span className="block text-[10px] font-bold tracking-wide text-slate-400">{kicker}</span>
        <span className={cn('block truncate text-[15px] leading-5 font-black', disabled ? 'text-slate-400' : toneClass)}>{title}</span>
        <span className={cn('block truncate text-[12px] font-medium', tone === 'bad' && !disabled ? 'text-rose-600' : 'text-slate-500')}>{sub}</span>
      </span>
    </button>
  )
}
