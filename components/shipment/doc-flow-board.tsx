'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { ArrowRight, Barcode, CheckCircle2, ChevronRight, ClipboardCheck, FileCheck, Plus, Search, Trash2, type LucideIcon } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/components/auth/auth-context'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Input } from '@/components/ui/input'
import { PAGE_SHELL, PageHeader } from '@/components/shared/page-header'
import { getJsonAuthHeaders } from '@/lib/auth-client'
import { cn } from '@/lib/utils'

type Doc = {
  id: string
  done?: boolean
  createdAt?: string
  updatedAt?: string
  [key: string]: unknown
}

type StepState = 'none' | 'wip' | 'done'
type Chain = {
  key: string
  sheet?: Doc
  card?: Doc
  report?: Doc
  company: string
  item: string
  lotNo: string
  floor: string
  date: string
  updatedAt: string
  finished: boolean
}

const str = (value: unknown) => (typeof value === 'string' ? value.trim() : '')
const dayOf = (value: string) => (/^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : '')
const stateOf = (doc?: Doc): StepState => (!doc ? 'none' : doc.done ? 'done' : 'wip')

function buildChains(sheets: Doc[], cards: Doc[], reports: Doc[]): Chain[] {
  const cardBySheet = new Map<string, Doc>()
  const usedCards = new Set<string>()
  for (const card of cards) {
    const source = str(card.sourceIncomingId)
    if (source && !cardBySheet.has(source)) cardBySheet.set(source, card)
  }
  const reportByCard = new Map<string, Doc>()
  for (const report of reports) {
    const source = str(report.sourceLotCardId)
    if (source && !reportByCard.has(source)) reportByCard.set(source, report)
  }
  const usedReports = new Set<string>()
  const rows: Omit<Chain, 'company' | 'item' | 'lotNo' | 'floor' | 'date' | 'updatedAt' | 'finished'>[] = []

  for (const sheet of sheets) {
    const card = cardBySheet.get(sheet.id)
    const report = card ? reportByCard.get(card.id) : undefined
    if (card) usedCards.add(card.id)
    if (report) usedReports.add(report.id)
    rows.push({ key: `s-${sheet.id}`, sheet, card, report })
  }
  for (const card of cards) {
    if (usedCards.has(card.id)) continue
    const report = reportByCard.get(card.id)
    if (report) usedReports.add(report.id)
    rows.push({ key: `c-${card.id}`, card, report })
  }
  for (const report of reports) {
    if (!usedReports.has(report.id)) rows.push({ key: `r-${report.id}`, report })
  }

  return rows.map((row) => {
    const { sheet, card, report } = row
    const docs = [sheet, card, report].filter(Boolean) as Doc[]
    return {
      ...row,
      company: str(report?.customer) || str(card?.partner) || str(sheet?.company) || '(업체 미입력)',
      item: str(card?.product) || str(report?.product) || str(card?.spec) || str(sheet?.spec) || '(품목 미입력)',
      lotNo: str(report?.lotNo) || str(card?.lotNo),
      floor: str(sheet?.floor) || str(card?.floor) || str(report?.floor),
      date: dayOf(str(report?.issuedOn)) || dayOf(str(card?.workDate)) || dayOf(str(sheet?.inspectedOn)) || dayOf(str(docs[0].createdAt)),
      updatedAt: docs.map((doc) => str(doc.updatedAt)).sort().pop() ?? '',
      finished: !!report?.done,
    }
  })
}

const STEPS: { id: 'sheet' | 'card' | 'report'; label: string; icon: LucideIcon; href: string }[] = [
  { id: 'sheet', label: '수입검사', icon: ClipboardCheck, href: '/shipment/incoming-inspection' },
  { id: 'card', label: '이력카드', icon: Barcode, href: '/shipment/lot-card' },
  { id: 'report', label: '출하성적서', icon: FileCheck, href: '/shipment/outgoing-report' },
]

function StepPill({ chain, step }: { chain: Chain; step: (typeof STEPS)[number] }) {
  const doc = chain[step.id]
  const state = stateOf(doc)
  const Icon = step.icon
  const body = (
    <span
      className={cn(
        'flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors',
        state === 'done' && 'border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300',
        state === 'wip' && 'border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300',
        state === 'none' && 'border-dashed border-border text-muted-foreground/60',
      )}
    >
      {state === 'done' ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Icon className="h-3.5 w-3.5" />}
      {step.label}
      <span className="font-normal opacity-80">{state === 'done' ? '완료' : state === 'wip' ? '작성중' : '대기'}</span>
    </span>
  )
  return doc ? <Link href={`${step.href}?open=${encodeURIComponent(doc.id)}`}>{body}</Link> : body
}

function ChainRow({ chain, canWrite, onDelete }: { chain: Chain; canWrite: boolean; onDelete: () => void }) {
  return (
    <li className="flex flex-col gap-2 rounded-xl border border-border bg-card px-4 py-3 shadow-sm lg:flex-row lg:items-center lg:gap-4">
      <div className="min-w-0 lg:w-[34%]">
        <p className="truncate text-sm font-bold text-foreground">{chain.company}</p>
        <p className="truncate text-xs text-muted-foreground">
          {[chain.item, chain.lotNo && `LOT ${chain.lotNo}`].filter(Boolean).join(' · ')}
        </p>
      </div>
      <p className="text-xs tabular-nums text-muted-foreground lg:w-24">{chain.date || '날짜 없음'}</p>
      <div className="flex flex-1 flex-wrap items-center gap-1">
        {STEPS.map((step, index) => (
          <span key={step.id} className="flex items-center gap-1">
            <StepPill chain={chain} step={step} />
            {index < STEPS.length - 1 && <ChevronRight className="h-4 w-4 text-muted-foreground/50" />}
          </span>
        ))}
      </div>
      {canWrite && (
        <button
          type="button"
          title="삭제"
          aria-label="삭제"
          onClick={onDelete}
          className="ml-auto inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-red-500 hover:bg-red-50 hover:text-red-600"
        >
          <Trash2 className="size-4" />
        </button>
      )}
    </li>
  )
}

type Tab = 'active' | 'done'
type GroupBy = 'date' | 'company' | 'item'
const GROUPS: [GroupBy, string][] = [['date', '날짜별'], ['company', '업체별'], ['item', '품목별']]

const FLOORS = ['all', '1', '2', '3'] as const

export function DocFlowBoard() {
  const { user } = useAuth()
  const canWrite = user?.role === 'editor' || user?.role === 'admin'
  const [chains, setChains] = useState<Chain[]>([])
  const [ready, setReady] = useState(false)
  const [error, setError] = useState(false)
  const [tab, setTab] = useState<Tab>('active')
  const [floor, setFloor] = useState<(typeof FLOORS)[number]>('all')
  const [groupBy, setGroupBy] = useState<GroupBy>('date')
  const [pendingDelete, setPendingDelete] = useState<Chain | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [company, setCompany] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [query, setQuery] = useState('')

  useEffect(() => {
    const load = async (path: string) => {
      const res = await fetch(path, { cache: 'no-store' })
      const body = await res.json().catch(() => null)
      if (!res.ok || !Array.isArray(body?.data)) throw new Error(path)
      return body.data as Doc[]
    }
    Promise.all([load('/api/incoming-inspections'), load('/api/lot-cards'), load('/api/outgoing-reports')])
      .then(([sheets, cards, reports]) => setChains(buildChains(sheets, cards, reports)))
      .catch(() => setError(true))
      .finally(() => setReady(true))
  }, [])

  const scoped = floor === 'all' ? chains : chains.filter((chain) => chain.floor === floor)
  const active = scoped.filter((chain) => !chain.finished)
  const finished = scoped.filter((chain) => chain.finished)
  const addFloor = floor === 'all' ? '1' : floor
  const pool = tab === 'active' ? active : finished
  const companies = useMemo(() => [...new Set(pool.map((chain) => chain.company))].sort((a, b) => a.localeCompare(b, 'ko')), [pool])

  const keyword = query.trim().toLowerCase()
  const rows = pool
    .filter((chain) => !company || chain.company === company)
    .filter((chain) => !from || (chain.date && chain.date >= from))
    .filter((chain) => !to || (chain.date && chain.date <= to))
    .filter((chain) => !keyword || [chain.company, chain.item, chain.lotNo].some((text) => text.toLowerCase().includes(keyword)))
    .sort((a, b) => (b.date || '').localeCompare(a.date || '') || b.updatedAt.localeCompare(a.updatedAt))

  const groups = useMemo(() => {
    const map = new Map<string, Chain[]>()
    for (const chain of rows) {
      const key = groupBy === 'date' ? chain.date || '날짜 없음' : groupBy === 'company' ? chain.company : chain.item
      map.set(key, [...(map.get(key) ?? []), chain])
    }
    const entries = [...map.entries()]
    if (groupBy === 'date') entries.sort((a, b) => b[0].localeCompare(a[0]))
    else entries.sort((a, b) => a[0].localeCompare(b[0], 'ko'))
    return entries
  }, [rows, groupBy])

  async function removeChain(chain: Chain) {
    const targets = [
      chain.sheet ? ['/api/incoming-inspections', chain.sheet.id] : null,
      chain.card ? ['/api/lot-cards', chain.card.id] : null,
      chain.report ? ['/api/outgoing-reports', chain.report.id] : null,
    ].filter((item): item is [string, string] => item !== null)
    if (targets.length === 0) return
    setDeleting(true)
    try {
      const results = await Promise.all(targets.map(([path, id]) => fetch(path, {
        method: 'DELETE',
        headers: getJsonAuthHeaders(user),
        body: JSON.stringify({ id }),
      })))
      if (!results.every((response) => response.ok)) throw new Error('삭제하지 못했습니다.')
      setChains((current) => current.filter((item) => item.key !== chain.key))
      setPendingDelete(null)
      toast.success('묶음을 삭제했습니다.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '삭제하지 못했습니다.')
    } finally {
      setDeleting(false)
    }
  }

  const stageCount = (step: 'sheet' | 'card' | 'report') => active.filter((chain) => stateOf(chain[step]) === 'wip').length
  const waiting = (step: 'card' | 'report') => active.filter((chain) => (step === 'card' ? !chain.card && !!chain.sheet : !chain.report && !!chain.card)).length

  return (
    <div className={cn(PAGE_SHELL)}>
      <PageHeader
        tone="teal"
        icon={ArrowRight}
        eyebrow="재고 관리"
        title="입고 · 이력 · 출하 현황"
        description="수입검사 성적서 → 이력카드 → 출하성적서가 업체·품목별로 어디까지 진행됐는지 한눈에 봅니다."
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ['진행 중', active.length, 'text-foreground'],
          ['수입검사 작성중', stageCount('sheet'), 'text-amber-700'],
          ['이력카드 작성중 · 대기', `${stageCount('card')} · ${waiting('card')}`, 'text-amber-700'],
          ['출하 작성중 · 대기', `${stageCount('report')} · ${waiting('report')}`, 'text-amber-700'],
        ].map(([label, value, tone]) => (
          <div key={String(label)} className="rounded-xl border border-border bg-card px-4 py-3 shadow-sm">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className={cn('mt-1 text-2xl font-bold tabular-nums', String(tone))}>{value}</p>
          </div>
        ))}
      </div>

      <section className="rounded-2xl border border-white/70 bg-card/95 shadow-sm backdrop-blur">
        <div className="flex flex-wrap items-center gap-3 px-4 py-3">
          <div className="flex items-center gap-1 rounded-xl bg-slate-100 p-1 dark:bg-white/5" role="tablist" aria-label="층 선택">
            {FLOORS.map((item) => {
              const selected = floor === item
              // 층 숫자는 지금 선택한 상태(진행 중/완료)의 건수만 센다
              const count = chains.filter((chain) => (item === 'all' || chain.floor === item) && chain.finished === (tab === 'done')).length
              return (
                <button
                  key={item}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  onClick={() => setFloor(item)}
                  className={cn(
                    'flex h-9 items-center gap-1.5 rounded-lg px-4 text-sm font-semibold transition-all',
                    selected
                      ? 'bg-white text-teal-600 shadow-sm ring-1 ring-teal-100 dark:bg-white/10 dark:text-teal-300 dark:ring-0'
                      : 'text-slate-500 hover:text-slate-900 dark:hover:text-white',
                  )}
                >
                  {item === 'all' ? '전체' : `${item}층`}
                  <span className={cn('min-w-5 rounded-full px-1.5 text-[11px] tabular-nums', selected ? 'bg-teal-50 text-teal-600 dark:bg-teal-400/15 dark:text-teal-200' : 'bg-white/70 text-slate-400 dark:bg-white/5')}>
                    {count}
                  </span>
                </button>
              )
            })}
          </div>

          <div className="flex items-center gap-1 rounded-xl bg-slate-100 p-1 dark:bg-white/5" role="tablist" aria-label="진행 상태">
            {([['active', '진행 중', active.length], ['done', '완료', finished.length]] as [Tab, string, number][]).map(([id, label, count]) => {
              const selected = tab === id
              return (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  onClick={() => { setTab(id); setCompany('') }}
                  className={cn(
                    'flex h-9 items-center gap-1.5 rounded-lg px-4 text-sm font-semibold transition-all',
                    selected
                      ? id === 'active'
                        ? 'bg-amber-500 text-white shadow-sm'
                        : 'bg-emerald-600 text-white shadow-sm'
                      : 'text-slate-500 hover:text-slate-900 dark:hover:text-white',
                  )}
                >
                  {label}
                  <span className={cn('min-w-5 rounded-full px-1.5 text-[11px] tabular-nums', selected ? 'bg-white/25 text-white' : 'bg-white/70 text-slate-400 dark:bg-white/5')}>
                    {count}
                  </span>
                </button>
              )
            })}
          </div>

          {canWrite && (
            <Link
              href={`/shipment/incoming-inspection?floor=${addFloor}&new=1`}
              className="ml-auto inline-flex h-10 shrink-0 items-center gap-1.5 rounded-xl bg-gradient-to-r from-teal-500 to-teal-600 px-4 text-sm font-semibold text-white shadow-[0_6px_16px_-6px_rgb(13_148_136/0.55)] transition hover:from-teal-600 hover:to-teal-700"
            >
              <Plus className="h-4 w-4" />
              {floor === 'all' ? '새 입고 추가' : `${floor}층 입고 추가`}
            </Link>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t bg-slate-50/70 px-4 py-3 dark:bg-white/[0.02]">
          <div className="inline-flex items-center rounded-lg border bg-white p-0.5 dark:bg-transparent">
            {GROUPS.map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setGroupBy(id)}
                className={cn(
                  'h-8 rounded-md px-3 text-[13px] font-medium transition-colors',
                  groupBy === id ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900' : 'text-slate-500 hover:text-slate-900 dark:hover:text-white',
                )}
              >
                {label}
              </button>
            ))}
          </div>
          <select
            value={company}
            onChange={(event) => setCompany(event.target.value)}
            className="h-9 rounded-lg border border-input bg-white px-3 text-sm dark:bg-background"
            aria-label="업체 선택"
          >
            <option value="">전체 업체</option>
            {companies.map((name) => <option key={name} value={name}>{name}</option>)}
          </select>
          <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Input type="date" value={from} onChange={(event) => setFrom(event.target.value)} className="h-9 w-36 rounded-lg bg-white dark:bg-background" aria-label="시작일" />
            ~
            <Input type="date" value={to} onChange={(event) => setTo(event.target.value)} className="h-9 w-36 rounded-lg bg-white dark:bg-background" aria-label="종료일" />
          </div>
          <div className="relative min-w-40 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="업체 · 품목 · LOT 검색" className="h-9 rounded-lg bg-white pl-9 dark:bg-background" />
          </div>
        </div>
      </section>

      {!ready ? (
        <p className="py-16 text-center text-sm text-muted-foreground">불러오는 중…</p>
      ) : error ? (
        <p className="py-16 text-center text-sm text-destructive">서류 목록을 불러오지 못했습니다.</p>
      ) : groups.length === 0 ? (
        <div className="flex flex-col items-center rounded-2xl border border-dashed border-teal-200 bg-white/60 px-6 py-14 text-center dark:border-white/10 dark:bg-white/[0.02]">
          <span className="flex size-14 items-center justify-center rounded-full bg-teal-50 text-teal-500 dark:bg-teal-400/10">
            <ClipboardCheck className="size-6" />
          </span>
          <p className="mt-3 text-base font-semibold text-slate-800 dark:text-white">
            {tab === 'active'
              ? `${floor === 'all' ? '' : `${floor}층에 `}진행 중인 건이 없습니다`
              : '조건에 맞는 완료 건이 없습니다'}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">수입검사 성적서를 추가하면 이력카드 → 출하성적서로 이어집니다.</p>
          {canWrite && tab === 'active' && (
            <Link
              href={`/shipment/incoming-inspection?floor=${addFloor}&new=1`}
              className="mt-4 inline-flex h-9 items-center gap-1.5 rounded-lg bg-teal-600 px-4 text-sm font-semibold text-white hover:bg-teal-700"
            >
              <Plus className="h-4 w-4" />
              {floor === 'all' ? '새 입고 추가' : `${floor}층 입고 추가`}
            </Link>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          {groups.map(([name, items]) => (
            <section key={name}>
              <h2 className="mb-2 flex items-baseline gap-2 text-sm font-bold text-foreground">
                {name}
                <span className="text-xs font-normal text-muted-foreground">{items.length}건</span>
              </h2>
              <ul className="flex flex-col gap-2">
                {items.map((chain) => (
                  <ChainRow key={chain.key} chain={chain} canWrite={canWrite} onDelete={() => setPendingDelete(chain)} />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      <AlertDialog open={pendingDelete != null} onOpenChange={(next) => { if (!next && !deleting) setPendingDelete(null) }}>
        <AlertDialogContent className="sm:max-w-sm">
          <AlertDialogHeader className="w-full place-items-stretch text-left">
            <AlertDialogTitle className="text-left">이 묶음을 삭제할까요?</AlertDialogTitle>
            {pendingDelete ? (
              <dl className="grid grid-cols-[4.25rem_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-sm">
                <dt className="text-muted-foreground">업체</dt>
                <dd className="min-w-0 truncate">{pendingDelete.company}</dd>
                <dt className="text-muted-foreground">품목</dt>
                <dd className="min-w-0 truncate">{pendingDelete.item}</dd>
                <dt className="text-muted-foreground">삭제</dt>
                <dd className="min-w-0">{[pendingDelete.sheet && '수입검사', pendingDelete.card && '이력카드', pendingDelete.report && '출하성적서'].filter(Boolean).join(' · ')}</dd>
              </dl>
            ) : null}
            <AlertDialogDescription className="text-left text-pretty">연결된 서류가 함께 지워지고, 삭제한 뒤에는 되돌릴 수 없습니다.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>취소</AlertDialogCancel>
            <AlertDialogAction variant="destructive" disabled={deleting} onClick={() => pendingDelete && void removeChain(pendingDelete)}>
              {deleting ? '삭제 중…' : '삭제'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
