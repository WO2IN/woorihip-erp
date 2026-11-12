'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Printer, Wrench } from 'lucide-react'
import { toast } from 'sonner'
import { PAGE_SHELL, PageHeader } from '@/components/shared/page-header'
import { Button } from '@/components/ui/button'
import { SearchableCombobox } from '@/components/ui/searchable-combobox'
import { useAuth } from '@/components/auth/auth-context'
import { getJsonAuthHeaders } from '@/lib/auth-client'
import type { ReliabilityPeriodStats } from '@/lib/equipment-reliability'
import { cn } from '@/lib/utils'
import {
  CATEGORY_OPTIONS,
  DEMO_EQUIPMENT,
  DEMO_MONTHS,
  EMPTY_CELL,
  EMPTY_FILTERS,
  EQUIPMENT_NO_OPTIONS,
  LINE_OPTIONS,
  MTBF_BAR_FAIL,
  MTBF_BAR_OK,
  MTBF_TARGET,
  MTTR_LINE,
  MTTR_TARGET,
  PERIOD_LABEL,
  REPORT_YEAR,
  TABS,
  aggregateMonths,
  decorateEquipment,
  filterEquipmentRows,
  formatCell,
  meetsTargets,
  monthColumnLabel,
  periodStatsToMonthRows,
  sumEquipment,
  type MonthRow,
  type MtbfFilters,
  type Tab,
} from './mtbf-mttr/model'
import { FilterField, SectionHeading, SheetRow, StatCard, VerdictBadge } from './mtbf-mttr/report-ui'
import { MtbfTrendChart } from './mtbf-mttr/trend-chart'

const FILTER_BTN = 'h-10 rounded-lg px-4'
const TABLE_TEXT = 'text-[13px]'
const META_TEXT = 'text-xs'

export function MtbfMttrView() {
  const { user } = useAuth()
  const [tab, setTab] = useState<Tab>('종합현황')
  const [filterDraft, setFilterDraft] = useState<MtbfFilters>(EMPTY_FILTERS)
  const [filters, setFilters] = useState<MtbfFilters>(EMPTY_FILTERS)
  const [months, setMonths] = useState<MonthRow[]>(DEMO_MONTHS)
  const [usingDemo, setUsingDemo] = useState(true)
  const [searching, setSearching] = useState(false)
  const [printing, setPrinting] = useState(false)

  const monthAgg = useMemo(() => aggregateMonths(months), [months])
  const equipmentRows = useMemo(
    () => decorateEquipment(filterEquipmentRows(DEMO_EQUIPMENT, filters)),
    [filters],
  )
  const equipmentTotals = useMemo(() => sumEquipment(equipmentRows), [equipmentRows])

  const runSearch = useCallback(async () => {
    setSearching(true)
    try {
      const response = await fetch(`/api/equipment/mtbf-mttr?year=${REPORT_YEAR}`, {
        headers: getJsonAuthHeaders(user),
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok) {
        throw new Error(typeof payload?.error === 'string' ? payload.error : '조회에 실패했습니다.')
      }

      setFilters({ ...filterDraft })
      const historyCount = Number(payload.historyCount) || 0
      const monthStats = Array.isArray(payload.months) ? (payload.months as ReliabilityPeriodStats[]) : []
      if (historyCount > 0 && monthStats.length === 12) {
        setMonths(periodStatsToMonthRows(REPORT_YEAR, monthStats))
        setUsingDemo(false)
        toast.success(`${REPORT_YEAR}년 고장·수리 이력 ${historyCount}건 기준으로 조회했습니다.`)
      } else {
        setMonths(DEMO_MONTHS)
        setUsingDemo(true)
        toast.message('등록된 고장 이력이 없어 예시 데이터로 표시합니다. 라인·설비 필터만 적용됩니다.')
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '조회에 실패했습니다.')
    } finally {
      setSearching(false)
    }
  }, [filterDraft, user])

  const printReport = useCallback(() => {
    if (tab !== '종합현황') {
      toast.message('종합현황 탭에서만 출력할 수 있습니다.')
      return
    }
    const previousTitle = document.title
    const onAfterPrint = () => {
      document.title = previousTitle
      document.body.classList.remove('mtbf-mttr-print')
      setPrinting(false)
      window.removeEventListener('afterprint', onAfterPrint)
    }
    document.body.classList.add('mtbf-mttr-print')
    document.title = `설비_MTBF_MTTR_관리현황_${REPORT_YEAR}`
    window.addEventListener('afterprint', onAfterPrint)
    setPrinting(true)
  }, [tab])

  useEffect(() => {
    if (!printing) return
    const id = window.setTimeout(() => window.print(), 60)
    return () => window.clearTimeout(id)
  }, [printing])

  const failHint = monthAgg.closed.length
    ? `월평균 ${(monthAgg.sumFail / monthAgg.closed.length).toFixed(1)}${monthAgg.peakFail ? ` · 최다 ${monthAgg.peakFail.label} ${monthAgg.peakFail.fail}건` : ''}`
    : '집계 월 없음'
  const repairHint = monthAgg.peakRepair?.repair != null ? `최장 ${monthAgg.peakRepair.label} ${monthAgg.peakRepair.repair.toFixed(1)}h` : '집계 월 없음'
  const bothMajority = monthAgg.closed.length > 0 && monthAgg.bothOk >= monthAgg.closed.length / 2

  return (
    <div className={cn(PAGE_SHELL, 'mtbf-mttr-print-root print:max-w-none print:gap-2 print:p-0')}>
      <PageHeader
        tone="violet"
        icon={Wrench}
        eyebrow="설비관리 / 성과지표(KPI) / MTBF · MTTR"
        title="설비 MTBF · MTTR 관리현황"
        description={<span className="print:hidden">조회기간 {PERIOD_LABEL} · 우리하이피(주) / 생산 설비</span>}
        className="mtbf-mttr-print-header print:rounded-md print:px-3 print:py-2 print:shadow-none print:[&_h1]:mt-0 print:[&_h1]:text-base print:[&_p]:text-[9px]"
        actions={<span className="no-print rounded-full bg-white/15 px-3 py-1 text-xs font-semibold text-white/90">레이아웃 예시</span>}
      />

      <div className="no-print flex flex-wrap gap-1 rounded-2xl border bg-card p-1 shadow-sm">
        {TABS.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setTab(item)}
            className={cn(
              'rounded-xl px-3 py-2 text-sm font-semibold transition-colors',
              tab === item ? 'bg-violet-600 text-white shadow-sm' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
          >
            {item}
          </button>
        ))}
      </div>

      <div className="no-print flex w-full flex-wrap items-end gap-3 rounded-xl border bg-slate-50/80 px-4 py-3 shadow-sm dark:bg-muted/25">
        <FilterField label="기준기간" className="w-full min-w-[11rem] sm:w-auto lg:min-w-[12rem] lg:flex-[1.1]">
          <div
            className="flex h-10 w-full items-center rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-800 shadow-sm dark:border-border dark:bg-background"
            aria-label="기준기간"
          >
            <span className="truncate">{PERIOD_LABEL}</span>
          </div>
        </FilterField>
        <FilterSelect
          label="라인"
          configName="mtbf-line"
          options={LINE_OPTIONS}
          value={filterDraft.line}
          className="w-full min-w-[9rem] sm:w-auto lg:flex-1"
          onChange={(line) => setFilterDraft((prev) => ({ ...prev, line }))}
        />
        <FilterSelect
          label="설비분류"
          configName="mtbf-category"
          options={CATEGORY_OPTIONS}
          value={filterDraft.category}
          className="w-full min-w-[9rem] sm:w-auto lg:flex-1"
          onChange={(category) => setFilterDraft((prev) => ({ ...prev, category }))}
        />
        <FilterSelect
          label="설비번호"
          configName="mtbf-equipment"
          options={EQUIPMENT_NO_OPTIONS}
          value={filterDraft.equipmentNo}
          className="w-full min-w-[10rem] sm:w-auto lg:min-w-[11rem] lg:flex-[1.25]"
          onChange={(equipmentNo) => setFilterDraft((prev) => ({ ...prev, equipmentNo }))}
        />
        <div className="ml-auto flex w-full flex-wrap items-center gap-2 sm:w-auto">
          <Button type="button" className={cn(FILTER_BTN, 'bg-blue-600 text-white hover:bg-blue-700')} disabled={searching} onClick={() => void runSearch()}>
            {searching ? '조회 중…' : '조회'}
          </Button>
          <Button type="button" variant="outline" className={cn(FILTER_BTN, 'bg-white px-3 dark:bg-background')} onClick={() => toast.message('고장등록은 레이아웃만 잡아 둔 상태입니다.')}>
            고장등록
          </Button>
          <Button type="button" variant="outline" className={cn(FILTER_BTN, 'bg-white px-3 dark:bg-background')} onClick={printReport}>
            <Printer className="mr-1.5 h-4 w-4" />
            출력
          </Button>
        </div>
      </div>

      {tab !== '종합현황' ? (
        <section className="rounded-2xl border bg-card px-6 py-16 text-center shadow-sm">
          <p className="text-base font-bold text-slate-900 dark:text-white">{tab}</p>
          <p className="mt-2 text-sm text-muted-foreground">이 탭은 자리만 잡아 두었습니다. 종합현황 레이아웃을 먼저 맞춰 두었습니다.</p>
        </section>
      ) : (
        <div className="mtbf-mttr-print-page flex flex-col gap-5">
          <p className="print-only text-[9px] font-medium leading-tight text-slate-800">
            조회 · {REPORT_YEAR}.01~12 · {filters.line} · {filters.category} · {filters.equipmentNo}
            {usingDemo ? ' · 예시' : ''} · 출력 {new Date().toLocaleDateString('ko-KR')}
          </p>
          <section className="mtbf-mttr-print-stats grid gap-3 sm:grid-cols-2 xl:grid-cols-6 print:grid-cols-6 print:gap-2">
            <StatCard
              label="누계 MTBF"
              value={monthAgg.cumMtbf == null ? '—' : String(monthAgg.cumMtbf)}
              unit="h"
              hint={`목표 ≥ ${MTBF_TARGET}h · ${monthAgg.cumMtbf == null ? '—' : monthAgg.cumMtbf >= MTBF_TARGET ? '달성' : `−${MTBF_TARGET - monthAgg.cumMtbf}h`} · 동시달성 ${monthAgg.bothOk}/${monthAgg.closed.length}개월`}
              tone={monthAgg.cumMtbf != null && monthAgg.cumMtbf >= MTBF_TARGET ? 'green' : 'rose'}
            />
            <StatCard
              label="누계 MTTR"
              value={monthAgg.cumMttr == null ? '—' : monthAgg.cumMttr.toFixed(2)}
              unit="h"
              hint={`목표 ≤ ${MTTR_TARGET.toFixed(1)}h · ${monthAgg.cumMttr == null ? '—' : monthAgg.cumMttr <= MTTR_TARGET ? '달성' : `+${(monthAgg.cumMttr - MTTR_TARGET).toFixed(2)}h`}`}
              tone={monthAgg.cumMttr != null && monthAgg.cumMttr <= MTTR_TARGET ? 'green' : 'rose'}
            />
            <StatCard label="고장건수 누계" value={String(monthAgg.sumFail)} unit="건" hint={failHint} />
            <StatCard label="총 수리시간" value={monthAgg.sumRepair.toFixed(1)} unit="h" hint={repairHint} />
            <StatCard
              label="설비 가용률"
              value={monthAgg.avgAvail == null ? '—' : monthAgg.avgAvail.toFixed(2)}
              unit="%"
              hint="월별 가용률 평균"
              tone="green"
            />
            <StatCard label="월 판정" value={`${monthAgg.bothOk}/${monthAgg.closed.length}`} unit="개월" hint="MTBF · MTTR 동시 달성 기준" tone="green" />
          </section>

          <section className="mtbf-mttr-print-mid grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.85fr)] print:grid-cols-2 print:gap-2">
            <article className="mtbf-mttr-print-chart-card flex flex-col rounded-2xl border bg-card p-4 shadow-sm">
              <header className="mb-3 flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-border/60 pb-3">
                <SectionHeading title="월별 MTBF · MTTR 추이" />
                <p className={cn(META_TEXT, 'text-muted-foreground')}>MTBF = 가동시간 ÷ 고장건수 · MTTR = 수리시간 ÷ 고장건수</p>
              </header>
              <MtbfTrendChart printing={printing} months={months} />
              <ChartLegend />
            </article>
            <EquipmentPanel rows={equipmentRows} totals={equipmentTotals} rangeLabel={monthAgg.rangeLabel} />
          </section>

          <KpiSheet months={months} monthAgg={monthAgg} bothMajority={bothMajority} />
        </div>
      )}
    </div>
  )
}

function FilterSelect({
  label,
  configName,
  options,
  value,
  className,
  onChange,
}: {
  label: string
  configName: string
  options: readonly string[]
  value: string
  className?: string
  onChange: (value: string) => void
}) {
  return (
    <FilterField label={label} className={className}>
      <SearchableCombobox
        appearance="form"
        configName={configName}
        options={[...options]}
        listAll
        creatable={false}
        clearable={false}
        value={value}
        onChange={onChange}
        placeholder="전체"
      />
    </FilterField>
  )
}

function ChartLegend() {
  return (
    <div className={cn('mtbf-mttr-print-legend mt-2 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-muted-foreground', META_TEXT)}>
      <LegendSwatch className="size-2.5 rounded-sm" color={MTBF_BAR_OK} label="MTBF 달성" />
      <LegendSwatch className="size-2.5 rounded-sm" color={MTBF_BAR_FAIL} label="MTBF 미달" />
      <span className="inline-flex items-center gap-1.5">
        <span className="h-0.5 w-4 rounded-full" style={{ backgroundColor: MTTR_LINE }} />
        <span className="size-1.5 rounded-full" style={{ backgroundColor: MTTR_LINE }} />
        MTTR(h)
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="size-2.5 rounded-full border-2 border-rose-500 bg-white" /> MTTR 초과
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="w-5 border-t border-dashed border-slate-400" />
        목표 MTBF ≥ {MTBF_TARGET}h · MTTR ≤ {MTTR_TARGET.toFixed(1)}h (동일 높이)
      </span>
    </div>
  )
}

function LegendSwatch({ className, color, label }: { className: string; color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={className} style={{ backgroundColor: color }} /> {label}
    </span>
  )
}

function EquipmentPanel({
  rows,
  totals,
  rangeLabel,
}: {
  rows: ReturnType<typeof decorateEquipment>
  totals: ReturnType<typeof sumEquipment>
  rangeLabel: string
}) {
  return (
    <article className="mtbf-mttr-print-equipment flex min-w-0 flex-col overflow-hidden rounded-2xl border bg-card shadow-sm">
      <header className="flex items-center justify-between gap-2 border-b px-4 py-3">
        <SectionHeading title="설비별 고장 · 수리 현황" />
        <span className={cn('shrink-0 rounded-full bg-slate-100 px-2.5 py-1 font-semibold text-slate-600 dark:bg-muted dark:text-slate-300', META_TEXT)}>
          {rangeLabel}
        </span>
      </header>
      <div className="overflow-x-auto">
        <table className={cn('w-full', TABLE_TEXT)}>
          <thead>
            <tr className="bg-slate-900 text-white">
              <th className="px-3 py-2.5 text-left text-sm font-semibold text-white">설비</th>
              {['고장', '수리(h)', 'MTTR', '고장비중', '판정'].map((head) => (
                <th key={head} className="px-2 py-2.5 text-center text-sm font-semibold whitespace-nowrap text-white">
                  {head}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border/80">
            {rows.map((row) => (
              <tr key={row.name} className="bg-card transition-colors hover:bg-slate-50/80 dark:hover:bg-muted/20">
                <td className="px-3 py-2.5">
                  <p className="font-semibold leading-snug text-slate-900 dark:text-white">
                    {row.name}
                    <span className="font-normal text-muted-foreground"> · {row.note}</span>
                  </p>
                </td>
                <td className="px-2 py-2.5 text-center font-medium tabular-nums text-slate-800 dark:text-slate-100">{row.fail}</td>
                <td className="px-2 py-2.5 text-center tabular-nums text-slate-700 dark:text-slate-200">{row.repair.toFixed(1)}</td>
                <td className={cn('px-2 py-2.5 text-center text-[13px] font-bold tabular-nums', mttrTone(row.mttr > MTTR_TARGET))}>{row.mttr.toFixed(2)}</td>
                <td className="px-3 py-2.5">
                  <ShareBar share={row.share} />
                </td>
                <td className="px-2 py-2.5 text-center">
                  <VerdictBadge ok={row.ok} />
                </td>
              </tr>
            ))}
            <tr className="border-t-2 border-slate-200 bg-slate-50/90 font-semibold dark:border-border dark:bg-muted/40">
              <td className="px-3 py-2.5 text-slate-900 dark:text-white">합계</td>
              <td className="px-2 py-2.5 text-center tabular-nums">{totals.fail}</td>
              <td className="px-2 py-2.5 text-center tabular-nums">{totals.repair.toFixed(1)}</td>
              <td className={cn('px-2 py-2.5 text-center text-[13px] font-bold tabular-nums', mttrTone(totals.mttr != null && totals.mttr > MTTR_TARGET))}>
                {totals.mttr == null ? EMPTY_CELL : totals.mttr.toFixed(2)}
              </td>
              <td className="px-3 py-2.5">
                <ShareBar share={100} solid />
              </td>
              <td className="px-2 py-2.5 text-center">
                <VerdictBadge ok={totals.ok} />
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <footer className={cn('mt-auto border-t bg-slate-50/90 px-4 py-3 leading-relaxed text-slate-600 dark:bg-muted/25 dark:text-slate-300', META_TEXT)}>
        <p>
          <span className="font-bold text-slate-800 dark:text-slate-100">중점</span> 정류기 · 여과펌프 = 고장의 48% → 예방보전(PM) 주기 단축 검토
        </p>
        <p className="mt-1.5">
          <span className="font-bold text-slate-800 dark:text-slate-100">MTTR</span> 호이스트 · 정류기 MTTR 2.0h 초과 → 예비품 확보 · 수리 표준화
        </p>
      </footer>
    </article>
  )
}

function mttrTone(over: boolean) {
  return over ? 'text-rose-600' : 'text-emerald-600'
}

function ShareBar({ share, solid }: { share: number; solid?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <span className={cn('h-2 min-w-[4.5rem] flex-1 overflow-hidden rounded-full', solid ? 'bg-rose-300 dark:bg-rose-600/60' : 'bg-rose-100 dark:bg-rose-950/30')}>
        {solid ? null : <span className="block h-full rounded-full bg-rose-400 dark:bg-rose-500/80" style={{ width: `${share}%` }} />}
      </span>
      <span className="w-9 shrink-0 text-right text-[13px] font-semibold tabular-nums text-slate-700 dark:text-slate-200">{share}%</span>
    </div>
  )
}

function KpiSheet({
  months,
  monthAgg,
  bothMajority,
}: {
  months: MonthRow[]
  monthAgg: ReturnType<typeof aggregateMonths>
  bothMajority: boolean
}) {
  const pendingOr = (value: string, index: number, ok: boolean) => (months[index]?.pending ? 'muted' : ok ? 'ok' : 'bad') as 'muted' | 'ok' | 'bad'

  return (
    <article className="mtbf-mttr-print-sheet overflow-hidden rounded-2xl border bg-card shadow-sm">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
        <SectionHeading title="월별 MTBF · MTTR KPI 집계표" />
        <p className={cn(META_TEXT, 'text-muted-foreground')}>단위 h, 건, % · 판정: MTBF ≥ 목표 그리고 MTTR ≤ 목표 → O · 미입력 월은 - 표기</p>
      </header>
      <div className="overflow-x-auto">
        <table className={cn('w-full min-w-[980px] border-collapse print:min-w-0', TABLE_TEXT)}>
          <thead>
            <tr className="bg-slate-900 text-white">
              <th className="sticky left-0 z-10 min-w-[9.5rem] bg-slate-900 px-3 py-2.5 text-left text-sm font-semibold text-white">구분</th>
              {months.map((row) => (
                <th
                  key={row.label}
                  className={cn('min-w-[3.1rem] bg-slate-900 px-1.5 py-2.5 text-center text-sm font-semibold tabular-nums text-white', row.pending && 'text-white/55')}
                >
                  {monthColumnLabel(row.label)}
                </th>
              ))}
              <th className="min-w-[3.5rem] bg-slate-800 px-2.5 py-2.5 text-center text-sm font-bold text-white">누계</th>
            </tr>
          </thead>
          <tbody>
            <SheetRow stripe={0} label="가동시간(h)" values={months.map((row) => formatCell(row.run))} total={monthAgg.sumRun.toLocaleString('ko-KR')} />
            <SheetRow stripe={1} label="고장건수(건)" values={months.map((row) => formatCell(row.fail))} total={String(monthAgg.sumFail)} />
            <SheetRow
              stripe={2}
              label="수리시간(h)"
              values={months.map((row) => (row.repair == null ? EMPTY_CELL : row.repair.toFixed(1)))}
              total={monthAgg.sumRepair.toFixed(1)}
            />
            <SheetRow
              stripe={3}
              label="MTBF 목표(h, 이상)"
              values={months.map((row) => (row.pending ? EMPTY_CELL : String(MTBF_TARGET)))}
              total={String(MTBF_TARGET)}
              muted
            />
            <SheetRow
              stripe={4}
              label="MTBF 실적(h)"
              values={months.map((row) => (row.pending ? EMPTY_CELL : String(row.mtbf)))}
              total={monthAgg.cumMtbf == null ? '—' : String(monthAgg.cumMtbf)}
              toneOf={(_, index) => pendingOr('', index, (months[index]?.mtbf ?? 0) >= MTBF_TARGET)}
              totalTone={monthAgg.cumMtbf != null && monthAgg.cumMtbf >= MTBF_TARGET ? 'ok' : 'bad'}
            />
            <SheetRow
              stripe={5}
              label="MTTR 목표(h, 이하)"
              values={months.map((row) => (row.pending ? EMPTY_CELL : MTTR_TARGET.toFixed(1)))}
              total={MTTR_TARGET.toFixed(1)}
              muted
            />
            <SheetRow
              stripe={6}
              label="MTTR 실적(h)"
              values={months.map((row) => (row.pending || row.mttr == null ? EMPTY_CELL : row.mttr.toFixed(2)))}
              total={monthAgg.cumMttr == null ? '—' : monthAgg.cumMttr.toFixed(2)}
              toneOf={(_, index) => pendingOr('', index, (months[index]?.mttr ?? 99) <= MTTR_TARGET)}
              totalTone={monthAgg.cumMttr != null && monthAgg.cumMttr <= MTTR_TARGET ? 'ok' : 'bad'}
            />
            <SheetRow
              stripe={7}
              label="가용률(%)"
              values={months.map((row) => (row.pending || row.avail == null ? EMPTY_CELL : row.avail.toFixed(1)))}
              total={monthAgg.avgAvail == null ? '—' : monthAgg.avgAvail.toFixed(2)}
            />
            <SheetRow
              stripe={8}
              label="판정"
              verdict
              values={months.map((row) => (row.pending ? EMPTY_CELL : meetsTargets(row) ? 'O' : 'X'))}
              total={`${monthAgg.bothOk}/${monthAgg.closed.length}`}
              toneOf={(value) => (value === 'O' ? 'ok' : value === 'X' ? 'bad' : 'muted')}
              totalTone={bothMajority ? 'ok' : 'bad'}
            />
          </tbody>
        </table>
      </div>
      <footer className={cn('flex flex-wrap items-center justify-between gap-3 border-t bg-slate-50/80 px-4 py-3 text-muted-foreground dark:bg-muted/20', META_TEXT)}>
        <p className="max-w-3xl leading-relaxed">
          누계 MTBF·MTTR은 월평균이 아닌 Σ가동시간 ÷ Σ고장건수, Σ수리시간 ÷ Σ고장건수로 산출 · 고장 = 설비 정지를 유발한 돌발고장(계획정지·PM 제외)
        </p>
        <span
          className={cn(
            'shrink-0 rounded-full px-2.5 py-1 font-bold tabular-nums',
            bothMajority
              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
              : 'bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300',
          )}
        >
          동시 달성 {monthAgg.bothOk}/{monthAgg.closed.length}
        </span>
      </footer>
    </article>
  )
}
