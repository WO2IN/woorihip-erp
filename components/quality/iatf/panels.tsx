'use client'

import { useState, type ReactNode } from 'react'
import {
  AlertCircle,
  ArrowUpRight,
  Award,
  Building2,
  CalendarClock,
  CheckCircle2,
  CircleDashed,
  Clock3,
  FileText,
  Plus,
  ShieldCheck,
  Sparkles,
  Users,
  type LucideIcon,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  AUDIT_ROWS,
  CLAUSE_CARDS,
  DOCUMENTS,
  DOC_REVISIONS,
  FINDINGS,
  OPEN_FINDINGS,
  PROCESS_SHARE,
  TIMELINE,
  YEAR_BARS,
} from './demo'

function soon(label: string) {
  toast.message(`${label}은 레이아웃만 잡아 둔 상태입니다.`)
}

const primaryBtn = 'gap-1.5 bg-emerald-600 text-white shadow-sm shadow-emerald-600/20 hover:bg-emerald-700'

function Panel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <section className={cn('rounded-2xl border border-slate-200/80 bg-card shadow-[0_1px_2px_rgba(15,23,42,0.04)] dark:border-white/10', className)}>
      {children}
    </section>
  )
}

function PanelHead({ icon: Icon, title, sub, action }: { icon: LucideIcon; title: string; sub?: string; action?: ReactNode }) {
  return (
    <header className="flex items-center justify-between gap-3 px-5 pt-5">
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
          <Icon className="size-4" />
        </span>
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold text-slate-900 dark:text-white">{title}</h3>
          {sub ? <p className="truncate text-xs text-muted-foreground">{sub}</p> : null}
        </div>
      </div>
      {action}
    </header>
  )
}

export function YearlyPanel() {
  const maxBar = Math.max(...YEAR_BARS.map((bar) => bar.done + bar.open))
  const clauseTotal = CLAUSE_CARDS.reduce((acc, item) => acc + Number(item.value.replace('건', '')), 0)
  const clauseTones = ['bg-emerald-600', 'bg-teal-500', 'bg-sky-500', 'bg-amber-400']

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard icon={AlertCircle} tone="slate" label="올해 지적" value="6" unit="건" note="2차 사후관리 · 경부적합" />
        <KpiCard icon={Clock3} tone="amber" label="개선 진행" value="2" unit="건" note="유효성 확인 대기" />
        <KpiCard icon={CheckCircle2} tone="emerald" label="완료" value="4" unit="건" note="완료율 67%" progress={67} />
        <KpiCard icon={CalendarClock} tone="sky" label="다음 인증심사" value="2027" unit="년" note="재인증 · 일정 확인 필요" />
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <Panel>
          <PanelHead icon={Sparkles} title="연도별 지적사항" sub="부적합 = 개선 진행 + 완료" />
          <div className="flex h-56 items-end justify-around gap-6 px-6 pt-6 pb-2">
            {YEAR_BARS.map((bar) => {
              const total = bar.done + bar.open
              const height = (total / maxBar) * 170
              return (
                <div key={bar.year} className="flex flex-1 flex-col items-center gap-2">
                  <span className="text-sm font-semibold tabular-nums text-slate-800 dark:text-slate-100">{total}</span>
                  <div className="flex w-full max-w-14 flex-col overflow-hidden rounded-xl bg-slate-100 dark:bg-muted" style={{ height }}>
                    {bar.open > 0 ? <span className="bg-gradient-to-b from-amber-300 to-amber-400" style={{ flex: bar.open }} /> : null}
                    <span className="bg-gradient-to-b from-emerald-500 to-emerald-600" style={{ flex: bar.done }} />
                  </div>
                  <span className="text-xs font-medium text-muted-foreground">{bar.year.replace(' 예시', '')}</span>
                </div>
              )
            })}
          </div>
          <div className="flex justify-center gap-5 px-5 pb-5 text-xs text-muted-foreground">
            <Legend className="bg-emerald-500" label="완료" />
            <Legend className="bg-amber-400" label="개선 진행" />
          </div>
        </Panel>

        <Panel>
          <PanelHead icon={ShieldCheck} title="IATF 인증심사 현황" sub="인증기관 NQA" />
          <ul className="mt-3 space-y-2 px-3 pb-3">
            {AUDIT_ROWS.map((row) => (
              <li key={row.year} className="flex items-center gap-4 rounded-xl px-3 py-3 transition-colors hover:bg-slate-50 dark:hover:bg-white/5">
                <ProgressRing value={row.rate} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-slate-600 dark:bg-muted dark:text-slate-300">{row.year}</span>
                    <p className="truncate text-sm font-medium">{row.name.replace(' 예시', '')}</p>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {row.date} · 지적 {row.found}건 · 개선 {row.open}건 · 완료 {row.done}건
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <Panel>
          <PanelHead icon={FileText} title="조항별 지적 (2026)" sub={`총 ${clauseTotal}건`} />
          <div className="px-5 pt-5 pb-5">
            <div className="flex h-3 gap-0.5 overflow-hidden rounded-full">
              {CLAUSE_CARDS.map((item, index) => (
                <span key={item.label} className={clauseTones[index]} style={{ flex: Number(item.value.replace('건', '')) }} />
              ))}
            </div>
            <ul className="mt-5 grid grid-cols-2 gap-3">
              {CLAUSE_CARDS.map((item, index) => (
                <li key={item.label} className="flex items-center gap-2.5 rounded-xl border border-slate-100 px-3 py-2.5 dark:border-white/10">
                  <span className={cn('size-2.5 shrink-0 rounded-full', clauseTones[index])} />
                  <span className="min-w-0 flex-1 truncate text-sm text-slate-600 dark:text-slate-300">{item.label}</span>
                  <span className="text-sm font-semibold tabular-nums">{item.value}</span>
                </li>
              ))}
            </ul>
          </div>
        </Panel>

        <Panel>
          <PanelHead
            icon={Clock3}
            title="개선 진행 항목"
            sub="유효성 확인 후 완료 처리"
            action={<span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">{OPEN_FINDINGS.length}건</span>}
          />
          <ul className="mt-3 space-y-2 px-3 pb-3">
            {OPEN_FINDINGS.map((row) => (
              <li key={row.no} className="rounded-xl border border-amber-100 bg-amber-50/40 px-4 py-3 dark:border-amber-900/40 dark:bg-amber-950/10">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold">{row.no}</span>
                    <ClauseChip clause={row.clause} />
                  </div>
                  <StatusBadge status="개선" />
                </div>
                <p className="mt-2 text-sm font-medium">{row.summary}</p>
                <p className="mt-1 text-xs text-muted-foreground">{row.process} · {row.doc} · {row.action}</p>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </div>
  )
}

const FINDING_STEPS = ['부적합 등록', '시정조치', '유효성 확인'] as const

export function FindingsPanel() {
  const [selectedNo, setSelectedNo] = useState(FINDINGS[0].no)
  const [filter, setFilter] = useState<'전체' | '개선' | '완료'>('전체')
  const selected = FINDINGS.find((row) => row.no === selectedNo) ?? FINDINGS[0]
  const rows = FINDINGS.filter((row) => filter === '전체' || row.status === filter)
  const step = selected.status === '완료' ? 3 : 2

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-3">
        <Segmented
          value={filter}
          onChange={setFilter}
          items={[
            { key: '전체', label: '전체', count: FINDINGS.length },
            { key: '개선', label: '개선 진행', count: FINDINGS.filter((row) => row.status === '개선').length },
            { key: '완료', label: '완료', count: FINDINGS.filter((row) => row.status === '완료').length },
          ]}
        />
        <span className="text-xs text-muted-foreground">2026 · IATF 16949 2차 사후관리심사</span>
        <div className="ml-auto flex gap-2">
          <Button type="button" size="sm" variant="outline" onClick={() => soon('엑셀')}>엑셀</Button>
          <Button type="button" size="sm" className={primaryBtn} onClick={() => soon('지적사항 등록')}>
            <Plus className="size-3.5" /> 지적사항 등록
          </Button>
        </div>
      </div>

      <Panel className="overflow-hidden">
        <div className="flex flex-wrap items-start justify-between gap-4 bg-gradient-to-r from-emerald-600 to-teal-700 px-5 py-4 text-white">
          <div className="min-w-0">
            <p className="text-xs font-semibold text-white/80">{selected.no} · {selected.grade} · {selected.clause}</p>
            <p className="mt-1 text-base font-semibold leading-snug">{selected.summary}</p>
            <p className="mt-1 text-sm text-white/80">{selected.action}</p>
          </div>
          <span className="rounded-full bg-white/20 px-2.5 py-1 text-xs font-semibold">{selected.status}</span>
        </div>
        <div className="grid gap-4 px-5 py-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:items-center">
          <ol className="flex items-center">
            {FINDING_STEPS.map((label, index) => {
              const done = index < step
              return (
                <li key={label} className="flex flex-1 items-center last:flex-none">
                  <div className="flex items-center gap-1.5">
                    <span
                      className={cn(
                        'flex size-6 items-center justify-center rounded-full text-[11px] font-bold',
                        done ? 'bg-emerald-600 text-white' : 'border border-dashed border-slate-300 text-slate-400',
                      )}
                    >
                      {done ? <CheckCircle2 className="size-3.5" /> : index + 1}
                    </span>
                    <span className={cn('text-xs whitespace-nowrap', done ? 'font-semibold text-emerald-700 dark:text-emerald-300' : 'text-muted-foreground')}>{label}</span>
                  </div>
                  {index < FINDING_STEPS.length - 1 ? (
                    <span className={cn('mx-2 h-px w-6 shrink-0', index < step - 1 ? 'bg-emerald-500' : 'bg-slate-200 dark:bg-slate-700')} />
                  ) : null}
                </li>
              )
            })}
          </ol>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground lg:justify-end">
            <span>{selected.doc}</span>
            <span>{selected.process}</span>
            <span>완료일 {selected.closed}</span>
          </div>
        </div>
      </Panel>

      <Panel className="min-w-0 overflow-hidden">
        <div className="grid grid-cols-[4.5rem_6.75rem_minmax(0,1fr)_4.75rem] items-center gap-3 border-b bg-slate-50/80 px-5 py-2.5 text-[11px] font-semibold tracking-wide text-muted-foreground dark:bg-white/[0.03]">
          <span>No</span>
          <span>조항</span>
          <span>지적 요지</span>
          <span className="text-right">상태</span>
        </div>
        <ul className="divide-y divide-slate-100 dark:divide-white/5">
          {rows.map((row) => {
            const active = row.no === selected.no
            return (
              <li key={row.no}>
                <button
                  type="button"
                  onClick={() => setSelectedNo(row.no)}
                  className={cn(
                    'relative grid w-full grid-cols-[4.5rem_6.75rem_minmax(0,1fr)_4.75rem] items-center gap-3 px-5 py-3.5 text-left transition-colors',
                    active ? 'bg-emerald-50/80 dark:bg-emerald-950/25' : 'hover:bg-slate-50 dark:hover:bg-white/5',
                  )}
                >
                  {active ? <span className="absolute inset-y-2 left-0 w-1 rounded-r-full bg-emerald-600" /> : null}
                  <span className="text-sm font-semibold tabular-nums">{row.no}</span>
                  <ClauseChip clause={row.clause} />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{row.summary}</span>
                    <span className="block truncate text-xs text-muted-foreground">{row.doc} · {row.process}</span>
                  </span>
                  <span className="justify-self-end"><StatusBadge status={row.status} /></span>
                </button>
              </li>
            )
          })}
        </ul>
      </Panel>
    </div>
  )
}

export function SchedulePanel() {
  return (
    <div className="flex flex-col gap-5">
      <Panel>
        <PanelHead icon={CalendarClock} title="IATF 3년 인증 주기" sub="재인증 → 1차 사후 → 2차 사후 → 재인증" />
        <ol className="relative grid gap-4 px-5 pt-8 pb-6 md:grid-cols-4">
          <span className="absolute top-[3.1rem] right-[12.5%] left-[12.5%] hidden h-0.5 rounded-full bg-gradient-to-r from-emerald-500 via-amber-400 to-slate-200 md:block dark:to-slate-700" />
          {TIMELINE.map((item) => (
            <li key={item.year} className="relative flex flex-col items-center text-center">
              <span
                className={cn(
                  'relative z-10 flex size-9 items-center justify-center rounded-full border-4 border-card',
                  item.state === 'done' && 'bg-emerald-600 text-white',
                  item.state === 'current' && 'bg-amber-400 text-white shadow-lg shadow-amber-400/40',
                  item.state === 'next' && 'bg-slate-100 text-slate-400 dark:bg-muted',
                )}
              >
                {item.state === 'done' ? <CheckCircle2 className="size-4" /> : item.state === 'current' ? <Clock3 className="size-4" /> : <CircleDashed className="size-4" />}
              </span>
              <div
                className={cn(
                  'mt-3 w-full rounded-xl border px-3 py-3',
                  item.state === 'current' ? 'border-amber-200 bg-amber-50/60 dark:border-amber-900/50 dark:bg-amber-950/20' : 'border-slate-100 dark:border-white/10',
                )}
              >
                <p className="text-sm font-bold tabular-nums">{item.year}</p>
                <p className="mt-1 text-[13px] font-medium">{item.title.replace(' 예시', '')}</p>
                <p className="mt-1 text-xs text-muted-foreground">{item.note}</p>
              </div>
            </li>
          ))}
        </ol>
      </Panel>

      <Panel className="overflow-hidden">
        <PanelHead
          icon={ShieldCheck}
          title="심사 이력"
          sub="인증기관 NQA"
          action={
            <Button type="button" size="sm" className={primaryBtn} onClick={() => soon('심사 등록')}>
              <Plus className="size-3.5" /> 심사 등록
            </Button>
          }
        />
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-y bg-slate-50/80 text-[11px] font-semibold tracking-wide text-muted-foreground dark:bg-white/[0.03]">
                <th className="px-5 py-2.5 text-left font-semibold">연도</th>
                <th className="px-3 py-2.5 text-left font-semibold">심사</th>
                <th className="px-3 py-2.5 text-center font-semibold">일자</th>
                <th className="px-3 py-2.5 text-center font-semibold">지적</th>
                <th className="px-3 py-2.5 text-center font-semibold">개선</th>
                <th className="px-3 py-2.5 text-center font-semibold">완료</th>
                <th className="px-5 py-2.5 text-left font-semibold">완료율</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-white/5">
              {AUDIT_ROWS.map((row) => (
                <tr key={row.year} className="hover:bg-slate-50/60 dark:hover:bg-white/5">
                  <td className="px-5 py-3.5 font-semibold tabular-nums">{row.year}</td>
                  <td className="px-3 py-3.5 font-medium">{row.name.replace(' 예시', '')}</td>
                  <td className="px-3 py-3.5 text-center tabular-nums text-muted-foreground">{row.date}</td>
                  <td className="px-3 py-3.5 text-center tabular-nums">{row.found}</td>
                  <td className="px-3 py-3.5 text-center tabular-nums text-amber-700 dark:text-amber-400">{row.open}</td>
                  <td className="px-3 py-3.5 text-center tabular-nums text-emerald-700 dark:text-emerald-400">{row.done}</td>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-2">
                      <span className="h-1.5 w-24 overflow-hidden rounded-full bg-slate-100 dark:bg-muted">
                        <span className="block h-full rounded-full bg-emerald-500" style={{ width: `${row.rate}%` }} />
                      </span>
                      <span className="text-xs font-semibold tabular-nums">{row.rate}%</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  )
}

export function CertificationPanel() {
  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-5 2xl:grid-cols-[minmax(0,1.35fr)_minmax(0,0.85fr)]">
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-600 via-emerald-700 to-teal-800 p-6 text-white shadow-lg shadow-emerald-900/10">
          <span className="pointer-events-none absolute -top-16 -right-16 size-56 rounded-full bg-white/10" />
          <span className="pointer-events-none absolute -bottom-20 right-24 size-40 rounded-full bg-white/5" />
          <div className="relative flex items-start justify-between gap-4">
            <div>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-semibold">
                <CheckCircle2 className="size-3.5" /> 유효
              </span>
              <h3 className="mt-3 text-2xl font-bold tracking-tight">IATF 16949:2016</h3>
              <p className="mt-1 font-mono text-sm text-white/80">IATF 0545442 · CB 19621-T</p>
            </div>
            <span className="flex size-14 items-center justify-center rounded-2xl bg-white/15 ring-1 ring-white/20">
              <Award className="size-7" />
            </span>
          </div>
          <dl className="relative mt-6 grid gap-4 sm:grid-cols-3">
            <CertFact label="인증기관" value="NQA" />
            <CertFact label="최근 심사" value="2026.07 2차 사후" sub="경부적합 6건" />
            <CertFact label="다음 심사" value="2027 재인증" sub="유효기간 확인 필요" />
          </dl>
          <div className="relative mt-6 flex flex-wrap gap-2">
            {['인증서 사본', '심사 보고서', '인증 범위'].map((label) => (
              <button
                key={label}
                type="button"
                onClick={() => soon(label)}
                className="inline-flex items-center gap-1 rounded-lg bg-white/15 px-3 py-1.5 text-xs font-semibold transition-colors hover:bg-white/25"
              >
                {label} <ArrowUpRight className="size-3" />
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-1">
          <PendingCert name="ISO 9001:2015" />
          <PendingCert name="ISO 14001:2015" />
        </div>
      </div>

      <Panel>
        <PanelHead icon={Building2} title="인증 범위 · 사업장" />
        <div className="grid gap-4 p-5 md:grid-cols-3">
          <SiteFact icon={Building2} label="사업장" value="우리하이피(주)" sub="경기 안산시 단원구 정왕천동로94번길 39" />
          <SiteFact icon={Users} label="주요 고객사" value="한온NCS · 넥스플러스 · 신흥SEC" />
          <SiteFact icon={ShieldCheck} label="관리 부서" value="품질팀" sub="인증 범위는 인증서 기재 내용 입력 필요" />
        </div>
      </Panel>
    </div>
  )
}

export function DocumentPanel() {
  const [selectedNo, setSelectedNo] = useState(DOCUMENTS[0].no)
  const selected = DOCUMENTS.find((row) => row.no === selectedNo) ?? DOCUMENTS[0]
  const revisions = selected.no === 'WR-SP-0602' ? DOC_REVISIONS : [{ rev: selected.rev, date: selected.date, note: '개정 내용은 예시입니다.' }]
  const shareTotal = PROCESS_SHARE.reduce((acc, item) => acc + item.count, 0)

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard icon={FileText} tone="emerald" label="관리 문서" value="29" unit="종" note="현행 유효본 기준" />
        <KpiCard icon={Sparkles} tone="sky" label="2026년 개정" value="28" unit="종" note="2026.09.23 일괄 개정" />
        <KpiCard icon={Building2} tone="slate" label="프로세스" value="3" unit="개" note="경영 10 · 고객지향 5 · 지원 14" />
        <KpiCard icon={CalendarClock} tone="amber" label="가장 최근 개정" value="10.20" unit="" note="WR-SP-0602 · Rev.3" />
      </div>

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.25fr)_minmax(300px,0.75fr)]">
        <Panel className="overflow-hidden">
          <PanelHead
            icon={FileText}
            title="문서 총괄 현황"
            sub="주요 8종 표시 · 전체 29종"
            action={
              <div className="flex gap-2">
                <Button type="button" size="sm" variant="outline" onClick={() => soon('문서 등록')}>문서 등록</Button>
                <Button type="button" size="sm" className={primaryBtn} onClick={() => soon('개정 등록')}>
                  <Plus className="size-3.5" /> 개정 등록
                </Button>
              </div>
            }
          />
          <ul className="mt-4 divide-y divide-slate-100 border-t dark:divide-white/5">
            {DOCUMENTS.map((row) => {
              const active = row.no === selected.no
              return (
                <li key={row.no}>
                  <button
                    type="button"
                    onClick={() => setSelectedNo(row.no)}
                    className={cn(
                      'relative flex w-full items-center gap-4 px-5 py-3 text-left transition-colors',
                      active ? 'bg-emerald-50/70 dark:bg-emerald-950/25' : 'hover:bg-slate-50 dark:hover:bg-white/5',
                    )}
                  >
                    {active ? <span className="absolute inset-y-2 left-0 w-1 rounded-r-full bg-emerald-600" /> : null}
                    <span className={cn('flex size-9 shrink-0 items-center justify-center rounded-lg', active ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-500 dark:bg-muted')}>
                      <FileText className="size-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{row.name}</span>
                      <span className="block font-mono text-xs text-muted-foreground">{row.no}</span>
                    </span>
                    <KindChip kind={row.kind} />
                    <span className="w-20 text-right">
                      <span className="block text-xs font-semibold">{row.rev}</span>
                      <span className={cn('block text-xs tabular-nums', row.date.startsWith('2023') ? 'text-rose-600' : 'text-muted-foreground')}>{row.date}</span>
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        </Panel>

        <div className="flex flex-col gap-5 xl:sticky xl:top-4">
          <Panel className="overflow-hidden">
            <div className="border-b bg-slate-50/80 px-5 py-4 dark:bg-white/[0.03]">
              <p className="font-mono text-xs text-emerald-700 dark:text-emerald-300">{selected.no}</p>
              <h3 className="mt-1 text-lg font-semibold">{selected.name}</h3>
              <div className="mt-2 flex gap-2">
                <KindChip kind={selected.kind} />
                <span className="rounded-md bg-white px-2 py-0.5 text-[11px] font-semibold ring-1 ring-slate-200 dark:bg-card dark:ring-white/10">{selected.rev}</span>
              </div>
            </div>
            <ol className="relative space-y-4 px-5 py-5">
              <span className="absolute top-6 bottom-6 left-[1.6rem] w-px bg-slate-200 dark:bg-slate-700" />
              {revisions.map((row, index) => (
                <li key={row.rev} className="relative flex gap-3">
                  <span className={cn('relative z-10 mt-0.5 size-3 shrink-0 rounded-full ring-4 ring-card', index === 0 ? 'bg-emerald-600' : 'bg-slate-300')} />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">
                      {row.rev} <span className="ml-1 text-xs font-normal tabular-nums text-muted-foreground">{row.date}</span>
                    </p>
                    <p className="mt-1 text-sm leading-relaxed text-slate-600 dark:text-slate-300">{row.note}</p>
                  </div>
                </li>
              ))}
            </ol>
            <div className="border-t px-5 py-3">
              <button type="button" onClick={() => soon('상세 보기')} className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 hover:underline dark:text-emerald-300">
                전체 개정이력 보기 <ArrowUpRight className="size-3" />
              </button>
            </div>
          </Panel>

          <Panel>
            <PanelHead icon={Building2} title="프로세스별 분포" sub={`${shareTotal}종`} />
            <ul className="space-y-3 p-5">
              {PROCESS_SHARE.map((item) => (
                <li key={item.label}>
                  <div className="mb-1.5 flex justify-between text-xs">
                    <span className="font-medium">{item.label}</span>
                    <span className="tabular-nums text-muted-foreground">{item.count}종 · {Math.round((item.count / shareTotal) * 100)}%</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-muted">
                    <span className={cn('block h-full rounded-full', item.tone)} style={{ width: `${(item.count / shareTotal) * 100}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      </div>
    </div>
  )
}

export function SketchPanel({ title, lines }: { title: string; lines: string[] }) {
  const icons = [ShieldCheck, Sparkles, CheckCircle2]
  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-4 md:grid-cols-3">
        {lines.map((line, index) => {
          const Icon = icons[index % icons.length]
          return (
            <Panel key={line} className="group p-5 transition-shadow hover:shadow-md">
              <span className="flex size-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700 transition-colors group-hover:bg-emerald-600 group-hover:text-white dark:bg-emerald-950/50 dark:text-emerald-300">
                <Icon className="size-5" />
              </span>
              <h3 className="mt-4 text-base font-semibold">{line}</h3>
              <p className="mt-1 text-sm text-muted-foreground">계획 · 실시 · 결과</p>
              <div className="mt-4 space-y-2">
                {['계획', '실시', '후속 조치'].map((row) => (
                  <div key={row} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-xs dark:bg-white/[0.04]">
                    <span className="text-slate-600 dark:text-slate-300">{row}</span>
                    <span className="text-muted-foreground">-</span>
                  </div>
                ))}
              </div>
            </Panel>
          )
        })}
      </div>
      <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 px-6 py-10 text-center dark:border-white/10">
        <CircleDashed className="size-6 text-slate-300" />
        <p className="mt-2 text-sm font-medium">{title}</p>
        <p className="mt-1 text-xs text-muted-foreground">참고 PDF에 없는 화면이라 자리만 잡아 두었습니다.</p>
        <Button type="button" size="sm" className={cn(primaryBtn, 'mt-4')} onClick={() => soon(title)}>
          <Plus className="size-3.5" /> 등록
        </Button>
      </div>
    </div>
  )
}

const KPI_TONES = {
  slate: 'bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-300',
  amber: 'bg-amber-50 text-amber-600 dark:bg-amber-950/50 dark:text-amber-300',
  emerald: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-300',
  sky: 'bg-sky-50 text-sky-600 dark:bg-sky-950/50 dark:text-sky-300',
} as const

function KpiCard({
  icon: Icon,
  tone,
  label,
  value,
  unit,
  note,
  progress,
}: {
  icon: LucideIcon
  tone: keyof typeof KPI_TONES
  label: string
  value: string
  unit: string
  note: string
  progress?: number
}) {
  return (
    <Panel className="p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        <span className={cn('flex size-9 items-center justify-center rounded-xl', KPI_TONES[tone])}>
          <Icon className="size-[18px]" />
        </span>
      </div>
      <p className="mt-2 text-3xl font-bold tracking-tight tabular-nums">
        {value}
        {unit ? <span className="ml-1 text-base font-medium text-muted-foreground">{unit}</span> : null}
      </p>
      {progress != null ? (
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-muted">
          <span className="block h-full rounded-full bg-emerald-500" style={{ width: `${progress}%` }} />
        </div>
      ) : null}
      <p className="mt-2 text-xs text-muted-foreground">{note}</p>
    </Panel>
  )
}

function ProgressRing({ value }: { value: number }) {
  const radius = 18
  const circumference = 2 * Math.PI * radius
  return (
    <span className="relative flex size-12 shrink-0 items-center justify-center">
      <svg viewBox="0 0 44 44" className="size-12 -rotate-90">
        <circle cx="22" cy="22" r={radius} fill="none" strokeWidth="4" className="stroke-slate-100 dark:stroke-white/10" />
        <circle
          cx="22"
          cy="22"
          r={radius}
          fill="none"
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - value / 100)}
          className={value >= 100 ? 'stroke-emerald-500' : 'stroke-amber-400'}
        />
      </svg>
      <span className="absolute text-[11px] font-bold tabular-nums">{value}%</span>
    </span>
  )
}

function Segmented<T extends string>({
  value,
  onChange,
  items,
}: {
  value: T
  onChange: (value: T) => void
  items: { key: T; label: string; count: number }[]
}) {
  return (
    <div className="inline-flex rounded-xl bg-slate-100 p-1 dark:bg-white/5">
      {items.map((item) => (
        <button
          key={item.key}
          type="button"
          onClick={() => onChange(item.key)}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all',
            value === item.key ? 'bg-white text-slate-900 shadow-sm dark:bg-card dark:text-white' : 'text-slate-500 hover:text-slate-800 dark:text-slate-400',
          )}
        >
          {item.label}
          <span className={cn('rounded-full px-1.5 text-[10px] tabular-nums', value === item.key ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' : 'bg-slate-200/70 dark:bg-white/10')}>
            {item.count}
          </span>
        </button>
      ))}
    </div>
  )
}

function StatusBadge({ status }: { status: '완료' | '개선' }) {
  const done = status === '완료'
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold',
        done ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300' : 'bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300',
      )}
    >
      <span className={cn('size-1.5 rounded-full', done ? 'bg-emerald-500' : 'bg-amber-500')} />
      {status}
    </span>
  )
}

function ClauseChip({ clause }: { clause: string }) {
  return <span className="inline-flex w-fit rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] font-medium text-slate-600 dark:bg-white/10 dark:text-slate-300">{clause}</span>
}

const KIND_TONES: Record<string, string> = {
  경영: 'bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300',
  고객지향: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300',
  지원: 'bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-300',
}

function KindChip({ kind }: { kind: string }) {
  return <span className={cn('rounded-md px-2 py-0.5 text-[11px] font-semibold', KIND_TONES[kind] ?? KIND_TONES.지원)}>{kind}</span>
}

function Legend({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn('size-2.5 rounded-sm', className)} />
      {label}
    </span>
  )
}

function CertFact({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl bg-white/10 px-3.5 py-3 ring-1 ring-white/10">
      <dt className="text-[11px] text-white/70">{label}</dt>
      <dd className="mt-1 text-sm font-semibold">{value}</dd>
      {sub ? <dd className="mt-0.5 text-[11px] text-white/70">{sub}</dd> : null}
    </div>
  )
}

function PendingCert({ name }: { name: string }) {
  return (
    <Panel className="flex items-center gap-4 border-dashed p-5">
      <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-300">
        <Award className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">{name}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">인증기관 · 번호 · 유효기간 입력 필요</p>
      </div>
      <button type="button" onClick={() => soon(`${name} 입력`)} className="rounded-lg bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-700 hover:bg-amber-100 dark:bg-amber-950/40 dark:text-amber-300">
        확인 필요
      </button>
    </Panel>
  )
}

function SiteFact({ icon: Icon, label, value, sub }: { icon: LucideIcon; label: string; value: string; sub?: string }) {
  return (
    <div className="flex gap-3 rounded-xl bg-slate-50 p-4 dark:bg-white/[0.04]">
      <Icon className="mt-0.5 size-4 shrink-0 text-emerald-600" />
      <div className="min-w-0">
        <p className="text-[11px] text-muted-foreground">{label}</p>
        <p className="mt-0.5 text-sm font-semibold">{value}</p>
        {sub ? <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p> : null}
      </div>
    </div>
  )
}
