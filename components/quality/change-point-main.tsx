'use client'

import { useEffect, useMemo, useState } from 'react'
import { CalendarDays, Check, ChevronRight, FileSpreadsheet, Inbox, PenLine, Plus, Search, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import { TARGET_OPTIONS, type ChangeRequest, type StampKey } from '@/lib/change-request'
import { chosungSearch } from '@/lib/korean'
import { cn } from '@/lib/utils'

const API = '/api/development/change-requests'

const STAGES = ['접수', '1차 검토', '고객사 제출', '승인 대기', '승인 완료', '적용·초동 확인', '종결', '반려'] as const
type Stage = (typeof STAGES)[number]

const FLOW: Stage[] = ['접수', '1차 검토', '고객사 제출', '승인 대기', '승인 완료']

const STAGE_STYLE: Record<Stage, { badge: string; dot: string }> = {
  접수: { badge: 'bg-slate-100 text-slate-700 dark:bg-white/10 dark:text-slate-200', dot: 'bg-slate-400' },
  '1차 검토': { badge: 'bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300', dot: 'bg-sky-500' },
  '고객사 제출': { badge: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300', dot: 'bg-indigo-500' },
  '승인 대기': { badge: 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300', dot: 'bg-amber-500' },
  '승인 완료': { badge: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300', dot: 'bg-emerald-500' },
  '적용·초동 확인': { badge: 'bg-violet-50 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300', dot: 'bg-violet-500' },
  종결: { badge: 'bg-slate-200 text-slate-800 dark:bg-white/15 dark:text-slate-100', dot: 'bg-slate-600' },
  반려: { badge: 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300', dot: 'bg-rose-500' },
}

const PART_STYLE: Record<string, string> = {
  사람: 'bg-sky-50 text-sky-700 ring-sky-100 dark:bg-sky-950/40 dark:text-sky-300 dark:ring-sky-900',
  자재: 'bg-amber-50 text-amber-700 ring-amber-100 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-900',
  '기계·설비·JIG': 'bg-violet-50 text-violet-700 ring-violet-100 dark:bg-violet-950/40 dark:text-violet-300 dark:ring-violet-900',
  방법: 'bg-emerald-50 text-emerald-700 ring-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-900',
  환경: 'bg-teal-50 text-teal-700 ring-teal-100 dark:bg-teal-950/40 dark:text-teal-300 dark:ring-teal-900',
}

type Filters = {
  from: string
  to: string
  part: string
  vendor: string
  stage: string
}

function yearRange() {
  const year = new Date().getFullYear()
  return { from: `${year}-01-01`, to: `${year}-12-31` }
}

function day(iso: string) {
  const date = iso.slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : ''
}

function dot(iso: string) {
  const date = day(iso)
  return date ? date.replaceAll('-', '.') : '—'
}

function signed(row: ChangeRequest, key: StampKey) {
  return Boolean(row.signs?.[key]?.trim())
}

function ourDone(row: ChangeRequest) {
  return row.ourJeongyeol ? signed(row, 'ourFinal') : signed(row, 'ourDecision')
}

function customerDone(row: ChangeRequest) {
  return row.customerJeongyeol ? signed(row, 'customerFinal') : signed(row, 'customerDecision')
}

function stageOf(row: ChangeRequest): Stage {
  if (customerDone(row) && ourDone(row)) return '승인 완료'
  if (signed(row, 'customerDraft') || signed(row, 'customerReview')) return '승인 대기'
  if (ourDone(row)) return '고객사 제출'
  if (signed(row, 'ourDraft') || signed(row, 'ourReview')) return '1차 검토'
  return '접수'
}

function requestDate(row: ChangeRequest) {
  return day(row.createdAt) || day(row.applyDate)
}

function elapsedDays(row: ChangeRequest) {
  const stage = stageOf(row)
  if (stage === '승인 완료' || stage === '종결' || stage === '반려') return null
  const date = requestDate(row)
  if (!date) return null
  const days = Math.floor((Date.now() - Date.parse(`${date}T00:00:00`)) / 86400000)
  return days >= 0 ? days : null
}

function clip(value: string, limit = 160) {
  const text = value.trim()
  if (!text) return ''
  return text.length > limit ? `${text.slice(0, limit)}…` : text
}

export function ChangePointMain({ onRegister, onEdit }: { onRegister: () => void; onEdit: (id: string) => void }) {
  const initial = yearRange()
  const [rows, setRows] = useState<ChangeRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState<Filters>({ ...initial, part: '전체', vendor: '전체', stage: '전체' })
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)

  useEffect(() => {
    let ignore = false
    fetch(API, { cache: 'no-store' })
      .then((response) => response.json())
      .then((body: { data?: ChangeRequest[] }) => {
        if (!ignore) setRows(Array.isArray(body.data) ? body.data : [])
      })
      .catch(() => {
        if (!ignore) setRows([])
      })
      .finally(() => {
        if (!ignore) setLoading(false)
      })
    return () => {
      ignore = true
    }
  }, [])

  const vendors = useMemo(() => {
    const names = new Set(rows.map((row) => row.customerName.trim()).filter(Boolean))
    return ['전체', ...names]
  }, [rows])

  const inPeriod = useMemo(
    () =>
      rows.filter((row) => {
        const date = requestDate(row)
        if (filters.from && date && date < filters.from) return false
        if (filters.to && date && date > filters.to) return false
        if (filters.vendor !== '전체' && row.customerName.trim() !== filters.vendor) return false
        return true
      }),
    [filters.from, filters.to, filters.vendor, rows],
  )

  const counted = useMemo(() => {
    const byStage = Object.fromEntries(STAGES.map((stage) => [stage, 0])) as Record<Stage, number>
    const byPart = Object.fromEntries(TARGET_OPTIONS.map((part) => [part, 0])) as Record<string, number>
    for (const row of inPeriod) {
      byStage[stageOf(row)] += 1
      for (const part of row.targets ?? []) if (part in byPart) byPart[part] += 1
    }
    const open = inPeriod.length - byStage['승인 완료'] - byStage.종결 - byStage.반려
    const overdue = inPeriod.filter((row) => (elapsedDays(row) ?? 0) > 30).length
    return { byStage, byPart, open, overdue }
  }, [inPeriod])

  const listed = useMemo(() => {
    const keyword = query.trim()
    return inPeriod
      .filter((row) => filters.part === '전체' || (row.targets ?? []).includes(filters.part))
      .filter((row) => filters.stage === '전체' || stageOf(row) === filters.stage)
      .filter((row) => !keyword || [row.title, row.product, row.docNo, row.customerName, row.reason].some((value) => chosungSearch(value || '', keyword)))
      .sort((a, b) => requestDate(b).localeCompare(requestDate(a)) || b.createdAt.localeCompare(a.createdAt))
  }, [filters.part, filters.stage, inPeriod, query])

  const selected = rows.find((row) => row.id === selectedId) ?? null
  const today = dot(new Date().toISOString())
  const setFilter = (patch: Partial<Filters>) => setFilters((prev) => ({ ...prev, ...patch }))

  const download = async () => {
    if (listed.length === 0 || exporting) return
    setExporting(true)
    try {
      const { buildChangePointWorkbook } = await import('@/lib/change-point-excel')
      const byStage = Object.fromEntries(STAGES.map((stage) => [stage, 0])) as Record<Stage, number>
      for (const row of listed) byStage[stageOf(row)] += 1
      const buffer = await buildChangePointWorkbook({
        rows: listed.map((row, index) => ({
          no: listed.length - index,
          requestedAt: dot(requestDate(row)),
          docNo: row.docNo,
          title: row.title || row.reason,
          part: (row.targets ?? []).join(' · '),
          product: row.product,
          customer: row.customerName,
          applyDate: row.applyDate ? dot(row.applyDate) : '',
          stage: stageOf(row),
          elapsed: elapsedDays(row),
          reason: row.reason,
        })),
        flow: [{ label: '전체보기', count: listed.length }, ...FLOW.map((stage) => ({ label: stage, count: byStage[stage] }))],
        period: `${dot(filters.from)} ~ ${dot(filters.to)}`,
      })
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
      const link = document.createElement('a')
      link.href = URL.createObjectURL(blob)
      link.download = `4M_변경이력_${today.replaceAll('.', '')}.xlsx`
      link.click()
      URL.revokeObjectURL(link.href)
      toast.success('엑셀 파일을 다운로드했습니다.')
    } catch {
      toast.error('엑셀 파일을 만들지 못했습니다.')
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-card shadow-[0_1px_2px_rgba(15,23,42,0.04)] dark:border-white/10">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-3.5">
          <div className="flex items-baseline gap-2">
            <h2 className="text-sm font-semibold">진행 흐름</h2>
            <span className="text-xs text-muted-foreground">단계를 누르면 그 단계만 봅니다</span>
          </div>
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span>전체 <b className="ml-0.5 font-semibold text-foreground tabular-nums">{inPeriod.length}</b>건</span>
            <span>진행 중 <b className="ml-0.5 font-semibold text-sky-700 tabular-nums dark:text-sky-300">{counted.open}</b>건</span>
            <span>30일 초과 <b className={cn('ml-0.5 font-semibold tabular-nums', counted.overdue ? 'text-rose-600' : 'text-foreground')}>{counted.overdue}</b>건</span>
            <span>반려 <b className="ml-0.5 font-semibold text-foreground tabular-nums">{counted.byStage.반려}</b>건</span>
          </div>
        </div>
        <ol className="grid grid-cols-2 sm:grid-cols-6">
          <li className="relative border-b border-slate-100 sm:border-r sm:border-b-0 dark:border-white/5">
            <button
              type="button"
              onClick={() => setFilter({ stage: '전체' })}
              className={cn(
                'flex w-full items-center gap-3 px-4 py-4 text-left transition-colors',
                filters.stage === '전체' ? 'bg-emerald-50/80 dark:bg-emerald-950/30' : 'hover:bg-slate-50 dark:hover:bg-white/5',
              )}
            >
              <span className={cn('flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-bold', filters.stage === '전체' ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-500 dark:bg-white/10 dark:text-slate-300')}>
                전
              </span>
              <span className="min-w-0">
                <span className="block text-xs text-muted-foreground">전체보기</span>
                <span className="block text-xl font-bold tabular-nums">{inPeriod.length}</span>
              </span>
            </button>
            <ChevronRight className="absolute top-1/2 -right-2.5 z-10 hidden size-5 -translate-y-1/2 rounded-full bg-card text-slate-300 sm:block dark:text-slate-600" />
          </li>
          {FLOW.map((stage, index) => {
            const active = filters.stage === stage
            const count = counted.byStage[stage]
            return (
              <li key={stage} className="relative border-b border-slate-100 sm:border-r sm:border-b-0 sm:last:border-r-0 dark:border-white/5">
                <button
                  type="button"
                  onClick={() => setFilter({ stage: active ? '전체' : stage })}
                  className={cn(
                    'flex w-full items-center gap-3 px-4 py-4 text-left transition-colors',
                    active ? 'bg-emerald-50/80 dark:bg-emerald-950/30' : 'hover:bg-slate-50 dark:hover:bg-white/5',
                  )}
                >
                  <span
                    className={cn(
                      'flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-bold tabular-nums',
                      active ? 'bg-emerald-600 text-white' : count > 0 ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900' : 'bg-slate-100 text-slate-400 dark:bg-white/5',
                    )}
                  >
                    {index + 1}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-xs text-muted-foreground">{stage}</span>
                    <span className={cn('block text-xl font-bold tabular-nums', count === 0 && 'text-slate-300 dark:text-slate-600')}>{count}</span>
                  </span>
                  {index < FLOW.length - 1 ? <ChevronRight className="absolute top-1/2 -right-2.5 z-10 hidden size-5 -translate-y-1/2 rounded-full bg-card text-slate-300 sm:block dark:text-slate-600" /> : null}
                </button>
              </li>
            )
          })}
        </ol>
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-card shadow-[0_1px_2px_rgba(15,23,42,0.04)] dark:border-white/10">
        <header className="flex flex-wrap items-center gap-3 px-5 pt-5 pb-4">
          <div className="mr-auto">
            <h2 className="text-lg font-bold tracking-tight">4M 변경이력 대장</h2>
            <p className="text-xs text-muted-foreground">기준일 {today} · 우리하이피(주) 품질팀</p>
          </div>
          <Button type="button" variant="outline" className="h-9" onClick={() => void download()} disabled={listed.length === 0 || exporting}>
            <FileSpreadsheet className="size-4" />{exporting ? '만드는 중' : '엑셀'}
          </Button>
          <Button type="button" className="h-9 bg-emerald-600 text-white shadow-sm shadow-emerald-600/20 hover:bg-emerald-700" onClick={onRegister}>
            <Plus className="size-4" />4M 등록
          </Button>
        </header>

        <div className="flex flex-wrap items-center gap-2 px-5 pb-4">
          <label className="relative min-w-[14rem] flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="제목, 모델, 관리번호, 고객사 검색" className="h-9 bg-slate-50 pl-9 dark:bg-white/5" />
          </label>
          <div className="flex h-9 items-center gap-1.5 rounded-lg border bg-background px-2.5 text-sm">
            <CalendarDays className="size-4 text-muted-foreground" />
            <input type="date" value={filters.from} onChange={(event) => setFilter({ from: event.target.value })} className="w-[7.4rem] bg-transparent text-sm outline-none" aria-label="시작일" />
            <span className="text-muted-foreground">~</span>
            <input type="date" value={filters.to} onChange={(event) => setFilter({ to: event.target.value })} className="w-[7.4rem] bg-transparent text-sm outline-none" aria-label="종료일" />
          </div>
          <select
            value={filters.vendor}
            onChange={(event) => setFilter({ vendor: event.target.value })}
            className="h-9 rounded-lg border bg-background px-2.5 text-sm"
            aria-label="고객사"
          >
            {vendors.map((name) => (
              <option key={name} value={name}>{name === '전체' ? '고객사 전체' : name}</option>
            ))}
          </select>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 border-y bg-slate-50/70 px-5 py-2.5 dark:bg-white/[0.02]">
          <span className="mr-1 text-[11px] font-semibold tracking-wide text-muted-foreground">4M</span>
          {['전체', ...TARGET_OPTIONS].map((part) => {
            const active = filters.part === part
            const count = part === '전체' ? inPeriod.length : counted.byPart[part]
            return (
              <button
                key={part}
                type="button"
                onClick={() => setFilter({ part })}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold transition-all',
                  active ? 'bg-slate-900 text-white shadow-sm dark:bg-white dark:text-slate-900' : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:ring-slate-300 dark:bg-white/5 dark:text-slate-300 dark:ring-white/10',
                )}
              >
                {part}
                <span className={cn('tabular-nums', active ? 'text-white/70 dark:text-slate-500' : 'text-slate-400')}>{count}</span>
              </button>
            )
          })}
          {filters.stage !== '전체' ? (
            <button
              type="button"
              onClick={() => setFilter({ stage: '전체' })}
              className="ml-auto inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
            >
              {filters.stage} <X className="size-3" />
            </button>
          ) : null}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[800px] text-sm">
            <thead>
              <tr className="text-[11px] font-semibold tracking-wide text-muted-foreground">
                <th className="w-14 px-5 py-3 text-left font-semibold">No</th>
                <th className="px-3 py-3 text-left font-semibold">변경 내용</th>
                <th className="px-3 py-3 text-left font-semibold">4M</th>
                <th className="px-3 py-3 text-left font-semibold">Model</th>
                <th className="px-3 py-3 text-left font-semibold">고객사</th>
                <th className="px-3 py-3 text-left font-semibold">의뢰일</th>
                <th className="px-3 py-3 text-left font-semibold">진행</th>
                <th className="w-20 px-5 py-3 text-right font-semibold">경과</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 border-t border-slate-100 dark:divide-white/5 dark:border-white/5">
              {loading ? (
                Array.from({ length: 3 }, (_, index) => (
                  <tr key={index}>
                    <td colSpan={8} className="px-5 py-4">
                      <div className="h-4 w-full animate-pulse rounded bg-slate-100 dark:bg-white/5" />
                    </td>
                  </tr>
                ))
              ) : listed.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-5 py-16">
                    <div className="flex flex-col items-center text-center">
                      <span className="flex size-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400 dark:bg-white/5">
                        <Inbox className="size-6" />
                      </span>
                      <p className="mt-3 text-sm font-semibold">조건에 맞는 변경 이력이 없습니다</p>
                      <p className="mt-1 text-xs text-muted-foreground">필터를 바꾸거나 새 4M 변경을 등록하세요.</p>
                      <Button type="button" size="sm" className="mt-4 bg-emerald-600 text-white hover:bg-emerald-700" onClick={onRegister}>
                        <Plus className="size-3.5" />4M 등록
                      </Button>
                    </div>
                  </td>
                </tr>
              ) : (
                listed.map((row, index) => {
                  const stage = stageOf(row)
                  const wait = elapsedDays(row)
                  return (
                    <tr key={row.id} className="group cursor-pointer transition-colors hover:bg-slate-50/80 dark:hover:bg-white/[0.03]" onClick={() => setSelectedId(row.id)}>
                      <td className="px-5 py-4 text-xs font-semibold tabular-nums text-muted-foreground">{listed.length - index}</td>
                      <td className="max-w-[18rem] px-3 py-4">
                        <p className="truncate font-semibold text-slate-900 group-hover:text-emerald-700 dark:text-white dark:group-hover:text-emerald-300">{row.title || row.reason || '제목 없음'}</p>
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">{row.docNo || '관리번호 없음'}{row.contents?.length ? ` · ${row.contents.join(', ')}` : ''}</p>
                      </td>
                      <td className="px-3 py-4">
                        <div className="flex flex-wrap gap-1">
                          {(row.targets ?? []).length ? row.targets.map((part) => <PartChip key={part} part={part} />) : <span className="text-muted-foreground">—</span>}
                        </div>
                      </td>
                      <td className="max-w-[8rem] truncate px-3 py-4 text-slate-700 dark:text-slate-300" title={row.product}>{row.product || '—'}</td>
                      <td className="px-3 py-4 text-slate-700 dark:text-slate-300">{row.customerName || '—'}</td>
                      <td className="px-3 py-4 tabular-nums text-muted-foreground">{dot(requestDate(row))}</td>
                      <td className="px-3 py-4"><StageBadge stage={stage} /></td>
                      <td className="px-5 py-4 text-right tabular-nums">
                        {wait == null ? (
                          <span className="text-slate-300 dark:text-slate-600">—</span>
                        ) : (
                          <span className={cn('rounded-md px-1.5 py-0.5 text-xs font-semibold', wait > 30 ? 'bg-rose-50 text-rose-600 dark:bg-rose-950/40' : 'text-slate-500')}>{wait}일</span>
                        )}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
        <footer className="flex items-center justify-between border-t px-5 py-3 text-xs text-muted-foreground">
          <span>{listed.length}건 표시</span>
          <span>행을 누르면 요약이 열립니다 · 경과는 의뢰일부터 승인 전까지</span>
        </footer>
      </section>

      <Sheet open={selected != null} onOpenChange={(open) => !open && setSelectedId(null)}>
        <SheetContent side="right" className="w-full gap-0 overflow-y-auto p-0 sm:max-w-[520px] [&>[data-slot=sheet-close]]:text-white [&>[data-slot=sheet-close]]:hover:bg-white/15">
          {selected ? <HistorySummary row={selected} onEdit={() => onEdit(selected.id)} /> : null}
        </SheetContent>
      </Sheet>
    </div>
  )
}

function HistorySummary({ row, onEdit }: { row: ChangeRequest; onEdit: () => void }) {
  const stage = stageOf(row)
  const flowIndex = FLOW.indexOf(stage)
  const submissions = Object.entries(row.submissions ?? {}).filter(([, value]) => value)
  const wait = elapsedDays(row)

  return (
    <div className="flex min-h-full flex-col">
      <div className="bg-gradient-to-br from-emerald-600 to-teal-700 px-6 pt-6 pb-5 text-white">
        <p className="text-xs font-medium text-white/75">{row.docNo || '관리번호 없음'} · {dot(requestDate(row))}</p>
        <SheetTitle className="mt-1.5 pr-8 text-lg leading-snug font-bold text-white">{row.title || row.reason || '제목 없음'}</SheetTitle>
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <span className="rounded-full bg-white/20 px-2.5 py-0.5 text-xs font-semibold">{stage}</span>
          {(row.targets ?? []).map((part) => (
            <span key={part} className="rounded-full bg-white/10 px-2.5 py-0.5 text-xs ring-1 ring-white/20">{part}</span>
          ))}
          {wait != null ? <span className="rounded-full bg-white/10 px-2.5 py-0.5 text-xs ring-1 ring-white/20">경과 {wait}일</span> : null}
        </div>
      </div>

      <div className="border-b px-6 py-4">
        <ol className="flex items-center">
          {FLOW.map((label, index) => {
            const done = flowIndex >= 0 && index <= flowIndex
            return (
              <li key={label} className="flex flex-1 items-center last:flex-none">
                <div className="flex flex-col items-center gap-1">
                  <span className={cn('flex size-6 items-center justify-center rounded-full text-[10px] font-bold', done ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-400 dark:bg-white/10')}>
                    {done ? <Check className="size-3.5" /> : index + 1}
                  </span>
                  <span className={cn('text-[10px] whitespace-nowrap', done ? 'font-semibold text-emerald-700 dark:text-emerald-300' : 'text-muted-foreground')}>{label}</span>
                </div>
                {index < FLOW.length - 1 ? <span className={cn('mx-1 mb-4 h-0.5 flex-1 rounded-full', flowIndex > index ? 'bg-emerald-500' : 'bg-slate-200 dark:bg-white/10')} /> : null}
              </li>
            )
          })}
        </ol>
      </div>

      <div className="flex-1 space-y-5 px-6 py-5">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-xl bg-slate-50 p-4 dark:bg-white/[0.04]">
          <Fact label="고객사" value={row.customerName} />
          <Fact label="Model" value={row.product} />
          <Fact label="적용일" value={row.applyDate ? dot(row.applyDate) : ''} />
          <Fact label="담당" value={row.owner || row.qualityOwner} />
          <Fact label="변경 내용" value={(row.contents ?? []).join(', ')} wide />
        </dl>

        <Block title="변경 사유" body={row.reason || (row.reasons ?? []).join(', ')} tags={row.reason ? row.reasons : undefined} />
        <Block title="적용 방법" body={[row.applyTarget, row.changeMethod].filter(Boolean).join(' · ')} tags={row.handling} />

        <div className="grid gap-3 sm:grid-cols-2">
          <CompareCard label="변경 전" body={clip(row.before)} files={row.beforeFiles?.length ?? 0} />
          <CompareCard label="변경 후" body={clip(row.after)} files={row.afterFiles?.length ?? 0} accent />
        </div>

        {submissions.length > 0 ? (
          <div>
            <p className="mb-2 text-[11px] font-semibold tracking-wide text-muted-foreground">제출물</p>
            <div className="flex flex-wrap gap-1.5">
              {submissions.map(([key, value]) => (
                <span key={key} className={cn('rounded-lg px-2.5 py-1 text-xs font-medium', value === '유' ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300' : 'bg-slate-100 text-slate-500 dark:bg-white/5')}>
                  {key} {value}
                </span>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      <div className="sticky bottom-0 flex gap-2 border-t bg-popover px-6 py-4">
        <Button type="button" className="h-10 flex-1 bg-emerald-600 text-white hover:bg-emerald-700" onClick={onEdit}>
          <PenLine className="size-4" />변경요청서 열기
        </Button>
      </div>
    </div>
  )
}

function Fact({ label, value, wide }: { label: string; value: string; wide?: boolean }) {
  return (
    <div className={cn('min-w-0', wide && 'col-span-2')}>
      <dt className="text-[11px] text-muted-foreground">{label}</dt>
      <dd className={cn('mt-0.5 text-sm font-medium', !value && 'text-slate-300 dark:text-slate-600')}>{value || '미입력'}</dd>
    </div>
  )
}

function Block({ title, body, tags }: { title: string; body: string; tags?: string[] }) {
  return (
    <div>
      <p className="mb-1.5 text-[11px] font-semibold tracking-wide text-muted-foreground">{title}</p>
      {tags?.length ? (
        <div className="mb-1.5 flex flex-wrap gap-1">
          {tags.map((tag) => (
            <span key={tag} className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600 dark:bg-white/10 dark:text-slate-300">{tag}</span>
          ))}
        </div>
      ) : null}
      {body || !tags?.length ? (
        <p className={cn('text-sm leading-relaxed whitespace-pre-line', !body && 'text-slate-300 dark:text-slate-600')}>{body || '미입력'}</p>
      ) : null}
    </div>
  )
}

function CompareCard({ label, body, files, accent }: { label: string; body: string; files: number; accent?: boolean }) {
  return (
    <div className={cn('rounded-xl border p-3.5', accent ? 'border-emerald-200 bg-emerald-50/40 dark:border-emerald-900 dark:bg-emerald-950/20' : 'border-slate-200 dark:border-white/10')}>
      <div className="flex items-center justify-between">
        <p className={cn('text-xs font-semibold', accent ? 'text-emerald-700 dark:text-emerald-300' : 'text-slate-500')}>{label}</p>
        {files ? <span className="text-[11px] text-muted-foreground">사진 {files}</span> : null}
      </div>
      <p className={cn('mt-1.5 text-sm leading-relaxed whitespace-pre-line', !body && 'text-slate-300 dark:text-slate-600')}>{body || '미입력'}</p>
    </div>
  )
}

function StageBadge({ stage }: { stage: Stage }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold whitespace-nowrap', STAGE_STYLE[stage].badge)}>
      <span className={cn('size-1.5 rounded-full', STAGE_STYLE[stage].dot)} />
      {stage}
    </span>
  )
}

function PartChip({ part }: { part: string }) {
  return <span className={cn('inline-flex rounded-md px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap ring-1', PART_STYLE[part] ?? PART_STYLE.방법)}>{part}</span>
}
