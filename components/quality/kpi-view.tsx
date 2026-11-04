'use client'

import { Fragment, useEffect, useMemo, useState, type FormEvent, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react'
import { Bar, BarChart, CartesianGrid, Cell, ComposedChart, LabelList, Line, LineChart, ReferenceLine, XAxis, YAxis } from 'recharts'
import { ArrowDown, ArrowUp, ArrowUpDown, BarChart3, CheckCircle2, ChevronLeft, ChevronRight, Lock, LockOpen, Package, Pencil, Printer, Search, Target, Trash2, TriangleAlert, Trophy } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/components/auth/auth-context'
import { PageHeader } from '@/components/shared/page-header'
import { Button } from '@/components/ui/button'
import { ChartContainer, ChartTooltip } from '@/components/ui/chart'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { SearchableCombobox } from '@/components/ui/searchable-combobox'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger } from '@/components/ui/select'
import { buildAuthHeaders } from '@/lib/auth-client'
import type { Floor3WorkLog } from '@/lib/floor3-work-log'
import {
  EMPTY_STATE,
  FLOORS,
  KPI_KINDS,
  defaultKpiSummaryTableTitle,
  SCAR_LABEL,
  kpiMonthNotYetArrived,
  monthKey,
  sampleState,
  deliveryOrderCountIndex,
  shipmentCountForYear,
  shipmentCountIndex,
  summarize,
  summarizeOutgoingKpi,
  summarizeDeliveryKpi,
  summarizeReply,
  targetFor,
  formatKpiRate,
  formatKpiRateFromParts,
  formatKpiRateGap,
  type KpiKind,
  type Floor,
  type LotResult,
  type InspectionLot,
  type KpiState,
  type PeriodStat,
  type ScarStatus,
} from '@/lib/incoming-kpi'
import { chosungSearch } from '@/lib/korean'
import { cn } from '@/lib/utils'

const DELIVERY_ACTION_LABEL: Record<ScarStatus, string> = {
  none: '미조치',
  issued: '원인 등록',
  action: '조치 중',
  closed: '조치 완료',
}

const FIELD = 'h-9 rounded-lg border bg-card px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40'
/** 출하 ComposedChart — 카드 높이에 맞춰 늘림 */
const KPI_OUTGOING_CHART_CLASS =
  '!aspect-auto block h-full min-h-[252px] w-full shrink-0 !justify-start [&_.recharts-responsive-container]:!h-full [&_.recharts-responsive-container]:!w-full'
/** 수입·공정·고객·납기 막대 차트 — 옆 분기·반기표와 높이 맞춤 */
const KPI_RATE_BAR_CHART_CLASS =
  '!aspect-auto block h-full min-h-[280px] w-full flex-1 !justify-start [&_.recharts-responsive-container]:!h-full [&_.recharts-responsive-container]:!min-h-[280px] [&_.recharts-responsive-container]:!w-full'
const pct = formatKpiRate
const dot = (date: string) => date.replace(/-/g, '.')

function todayIso() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

export function KpiView({ kind = 'incoming' }: { kind?: KpiKind }) {
  const spec = KPI_KINDS[kind]
  const delivery = kind === 'delivery'
  const { user } = useAuth()
  const canManage = user?.role === 'admin'
  const [state, setState] = useState<KpiState>(EMPTY_STATE)
  const [sample, setSample] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [year, setYear] = useState(() => new Date().getFullYear())
  const [printing, setPrinting] = useState(false)
  const [catalog, setCatalog] = useState<{ companies: string[]; productsByCompany: Record<string, string[]> }>({ companies: [], productsByCompany: {} })
  const [savedClosed, setSavedClosed] = useState<string[]>([])
  const [shipmentByMonth, setShipmentByMonth] = useState<Record<string, number>>({})
  const [workLogs, setWorkLogs] = useState<Floor3WorkLog[]>([])
  const [targetsOpen, setTargetsOpen] = useState(false)

  const derived = kind === 'outgoing'
  const linked = kind === 'outgoing' || kind === 'customer'

  /** 저장된 검사가 하나도 없으면 목표는 저장된 값을 쓰고, LOT만 예시로 보여 준다. 출하·고객부적합은 원본 기록을 쓴다. */
  const apply = (data: KpiState | null, source = catalog, shipmentIndex?: Record<string, number>) => {
    if (linked) {
      setState(data ?? EMPTY_STATE)
      setShipmentByMonth({})
      setSample(false)
      setSavedClosed(data?.closed ?? [])
      return
    }
    if (data && (data.lots.length > 0 || (delivery && Object.keys(shipmentIndex ?? {}).length > 0))) {
      setState(data)
      setShipmentByMonth(shipmentIndex ?? {})
      setSample(false)
      setSavedClosed(data.closed)
      return
    }
    const demo = sampleState(new Date(), source, kind)
    setState(data ? { ...demo, target: data.target, monthTargets: data.monthTargets } : demo)
    setShipmentByMonth(shipmentIndex ?? {})
    setSample(true)
    setSavedClosed(data?.closed ?? [])
  }

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setSample(false)
    fetch(`/api/quality/kpi?kind=${kind}`, { cache: 'no-store' })
      .then((response) => response.json())
      .then((result) => {
        if (cancelled) return
        const source = result.catalog?.companies && result.catalog?.productsByCompany ? result.catalog : catalog
        setCatalog(source)
        apply(result.data ?? null, source, result.shipmentByMonth)
        if (!cancelled && kind === 'outgoing') setWorkLogs(Array.isArray(result.workLogs) ? result.workLogs : [])
      })
      .catch(() => { if (!cancelled) toast.error(`${spec.name} 데이터를 불러오지 못했습니다.`) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, spec.name])

  const deliveryShipmentByMonth = useMemo(() => {
    if (!delivery) return {}
    if (sample && Object.keys(shipmentByMonth).length === 0) {
      return shipmentCountIndex(state.lots.filter((lot) => lot.date.startsWith(`${year}-`)))
    }
    return shipmentByMonth
  }, [delivery, sample, shipmentByMonth, state.lots, year])
  const summary = useMemo(
    () => (delivery
      ? summarizeDeliveryKpi(state, year, deliveryShipmentByMonth)
      : kind === 'outgoing'
        ? summarizeOutgoingKpi(state, workLogs, year)
        : summarize(state, year)),
    [delivery, deliveryShipmentByMonth, kind, state, workLogs, year],
  )
  const deliveryOrdersByMonth = useMemo(
    () => (delivery ? deliveryOrderCountIndex(state.lots, deliveryShipmentByMonth, year) : {}),
    [delivery, state.lots, deliveryShipmentByMonth, year],
  )
  const standardCloseReport = useMemo(
    () => (delivery ? undefined : buildStandardCloseReport({ kind, state, year, certificates: derived, summary })),
    [delivery, kind, state, year, derived, summary],
  )
  const years = useMemo(() => {
    const set = new Set([new Date().getFullYear(), ...state.lots.map((lot) => Number(lot.date.slice(0, 4)))])
    if (delivery) {
      for (const key of Object.keys(deliveryShipmentByMonth)) set.add(Number(key.slice(0, 4)))
    }
    return [...set].sort((a, b) => b - a)
  }, [delivery, deliveryShipmentByMonth, state.lots])
  const closed = useMemo(() => new Set(state.closed), [state.closed])

  /** 예시나 성적서 집계를 보는 중이면 LOT는 저장하지 않고 목표·마감만 저장한다 */
  const base = linked || sample
    ? { ...EMPTY_STATE, target: state.target, monthTargets: state.monthTargets, closed: linked ? state.closed : savedClosed }
    : state

  const persist = async (next: KpiState, detail: string) => {
    if (!user) return false
    setSaving(true)
    try {
      const response = await fetch('/api/quality/kpi', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...buildAuthHeaders(user) },
        body: JSON.stringify({ kind, state: next, detail }),
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(result.error || '저장하지 못했습니다.')
      apply(result.data, catalog, result.shipmentByMonth)
      return true
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '저장하지 못했습니다.')
      return false
    } finally {
      setSaving(false)
    }
  }

  const saveTargets = async (target: number, monthTargets: Record<string, number>) => {
    const ok = await persist({ ...base, target, monthTargets }, `${spec.name} 목표 변경: 기본 ${target}%`)
    if (ok) {
      toast.success('목표를 저장했습니다.')
      setTargetsOpen(false)
    }
  }

  const toggleClose = async (key: string) => {
    const isClosed = base.closed.includes(key)
    const next = isClosed ? base.closed.filter((month) => month !== key) : [...base.closed, key]
    const ok = await persist({ ...base, closed: next }, `${spec.name} ${key} ${isClosed ? '마감 해제' : '마감'}`)
    if (ok) toast.success(isClosed ? '마감을 해제했습니다.' : '마감했습니다.')
  }

  const processYear = kind === 'process' ? quantityOutcome(summary.lots) : null
  const reportLayout = Boolean(delivery || standardCloseReport)
  const customerMonths = useMemo(
    () => (kind === 'customer' ? summarizeReply(state, year).months : summary.months),
    [kind, state, year, summary.months],
  )

  const setPrintBodyClasses = (on: boolean) => {
    if (on) {
      document.body.classList.add('kpi-close-print')
      if (reportLayout) document.body.classList.add('kpi-close-print-delivery')
      return
    }
    document.body.classList.remove('kpi-close-print')
    document.body.classList.remove('kpi-close-print-delivery')
  }

  useEffect(() => {
    const onBefore = () => setPrintBodyClasses(true)
    const onAfter = () => {
      setPrinting(false)
      setPrintBodyClasses(false)
    }
    window.addEventListener('beforeprint', onBefore)
    window.addEventListener('afterprint', onAfter)
    return () => {
      setPrinting(false)
      setPrintBodyClasses(false)
      window.removeEventListener('beforeprint', onBefore)
      window.removeEventListener('afterprint', onAfter)
    }
  }, [reportLayout])

  useEffect(() => {
    if (!printing || !reportLayout) return
    let cancelled = false
    const run = () => {
      if (cancelled) return
      window.print()
    }
    const id = window.requestAnimationFrame(() => {
      window.requestAnimationFrame(run)
    })
    return () => {
      cancelled = true
      window.cancelAnimationFrame(id)
    }
  }, [printing, reportLayout])

  const printReport = () => {
    if (!reportLayout) return
    setPrintBodyClasses(true)
    setPrinting(true)
  }

  return (
    <>
    {!printing && (
    <div className="mx-auto box-border flex w-full min-w-0 max-w-[1400px] flex-col gap-3 px-4 py-4 sm:px-6 sm:py-5">
        <PageHeader
          tone="green"
          icon={BarChart3}
          eyebrow="KPI · KPI 관리"
          title={spec.title}
          description={spec.description}
          stat={processYear
          ? { label: `${year}년 공정 불량률`, value: processYear.rate == null ? '—' : processYear.rate.toFixed(3), unit: processYear.rate == null ? undefined : '%', sub: `목표 ${state.target}% 이하` }
          : kind === 'customer'
          ? { label: `${year}년 접수`, value: summary.total.inspected.toLocaleString('ko-KR'), unit: '건', sub: summary.total.inspected ? `회신율 ${((summary.lots.filter((lot) => lot.scar === 'closed').length / summary.total.inspected) * 100).toFixed(3)}%` : '접수 없음' }
          : delivery
          ? {
            label: `${year}년 연간 납기준수율`,
            value: summary.total.inspected ? summary.total.rate.toFixed(3) : '—',
            unit: summary.total.inspected ? '%' : undefined,
            sub: summary.total.inspected
              ? `목표 ${state.target}% 이상 · ${summary.total.ok ? '연간 목표 달성' : '연간 목표 미달'}`
              : '납품 실적 없음',
          }
          : derived
          ? {
            label: `${year}년 출하검사 불량률`,
            value: summary.total.inspected ? summary.total.rate.toFixed(3) : '—',
            unit: summary.total.inspected ? '%' : undefined,
            sub: summary.total.rateBase && summary.total.rateBase > 0
              ? `불량 ${summary.total.defect.toLocaleString('ko-KR')} ÷ 출하 ${summary.total.rateBase.toLocaleString('ko-KR')} · 목표 ${state.target}% 이하`
              : '성적서 출하수량 없음',
          }
          : { label: `${year}년 LOT 불량률`, value: summary.total.inspected ? summary.total.rate.toFixed(3) : '—', unit: summary.total.inspected ? '%' : undefined, sub: `목표 ${state.target}% 이하` }}
        />

      {loading ? (
        <p className="py-20 text-center text-sm text-muted-foreground">불러오는 중…</p>
      ) : (
        <Overview
          state={state}
          year={year}
          certificates={derived}
          customer={kind === 'customer'}
          process={kind === 'process'}
          delivery={delivery}
          shipmentByMonth={deliveryShipmentByMonth}
          onOpenTargets={canManage ? () => setTargetsOpen(true) : undefined}
          onPrint={printReport}
          years={years}
          onYearChange={setYear}
          summaryTableTitle={defaultKpiSummaryTableTitle(kind)}
          workLogs={kind === 'outgoing' ? workLogs : undefined}
        />
      )}

    </div>
    )}

    <Dialog open={targetsOpen} onOpenChange={setTargetsOpen}>
      <DialogContent className="flex max-h-[min(92vh,880px)] max-w-4xl flex-col gap-0 overflow-hidden p-0 sm:max-w-4xl">
        <DialogHeader className="shrink-0 border-b px-5 py-4 text-left">
          <DialogTitle>목표 설정</DialogTitle>
          <DialogDescription>
            {delivery ? '연간·월별 납기준수율 목표' : kind === 'customer' ? '연간·월별 회신율 목표' : derived ? '연간·월별 출하검사 불량률 목표' : '연간·월별 LOT 불량률 목표'}
            {' · '}{year}년
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <TargetTab
            key={`${year}-${state.target}-${JSON.stringify(state.monthTargets)}`}
            state={state}
            year={year}
            canManage={canManage && !sample}
            saving={saving}
            certificates={derived}
            customer={kind === 'customer'}
            delivery={delivery}
            workLogs={kind === 'outgoing' ? workLogs : undefined}
            shipmentByMonth={delivery ? deliveryShipmentByMonth : undefined}
            onSave={saveTargets}
          />
        </div>
      </DialogContent>
    </Dialog>

    {!loading && reportLayout && printing && (
      <KpiClosePrintSheet
        title={spec.title}
        year={year}
        sample={sample}
        delivery={delivery}
        customer={kind === 'customer'}
        months={customerMonths}
        deliveryReport={delivery ? { ordersByMonth: deliveryOrdersByMonth, total: summary.total, quarters: summary.quarters, halves: summary.halves } : undefined}
        standardReport={standardCloseReport}
        closed={closed}
        canManage={canManage && !sample}
        saving={saving}
        onToggle={toggleClose}
      />
    )}
    </>
  )
}

function Overview({ state, year, certificates = false, customer = false, process = false, delivery = false, shipmentByMonth = {}, onOpenTargets, onPrint, years, onYearChange, summaryTableTitle, workLogs = [] }: { state: KpiState; year: number; certificates?: boolean; customer?: boolean; process?: boolean; delivery?: boolean; shipmentByMonth?: Record<string, number>; onOpenTargets?: () => void; onPrint?: () => void; years?: number[]; onYearChange?: (year: number) => void; summaryTableTitle: string; workLogs?: Floor3WorkLog[] }) {
  const summary = useMemo(() => {
    if (delivery) return summarizeDeliveryKpi(state, year, shipmentByMonth)
    if (certificates) return summarizeOutgoingKpi(state, workLogs, year)
    return summarize(state, year)
  }, [certificates, delivery, shipmentByMonth, state, workLogs, year])
  const { total, months, quarters, halves, judged, achieved, zeroMonths } = summary
  const deliveryOrderByMonth = useMemo(() => {
    if (!delivery) return { map: new Map<string, number>(), total: 0 }
    const index = deliveryOrderCountIndex(state.lots, shipmentByMonth, year)
    const map = new Map(Object.entries(index))
    return { map, total: Object.values(index).reduce((sum, count) => sum + count, 0) }
  }, [delivery, shipmentByMonth, state.lots, year])
  const deliveryPeriodOrders = useMemo(() => {
    if (!delivery) return { quarters: [] as number[], halves: [] as number[] }
    const sumKeys = (keys: string[]) => keys.reduce((sum, key) => sum + (deliveryOrderByMonth.map.get(key) ?? 0), 0)
    return {
      quarters: [0, 1, 2, 3].map((quarter) => sumKeys(months.slice(quarter * 3, quarter * 3 + 3).map((month) => month.key))),
      halves: [0, 1].map((half) => sumKeys(months.slice(half * 6, half * 6 + 6).map((month) => month.key))),
    }
  }, [delivery, deliveryOrderByMonth.map, months])
  const replySummary = useMemo(() => (customer ? summarizeReply({ ...state, lots: summary.lots }, year) : null), [customer, state, summary.lots, year])
  const shipped = useMemo(() => quantityByMonth(summary.lots), [summary.lots])
  const outgoingMonthOpen = (key: string) => !kpiMonthNotYetArrived(year, key)
  const achieveRate = judged ? Math.round((achieved / judged) * 100) : 0
  const received = customer ? summary.lots.filter((lot) => lot.result === 'fail') : []
  const replied = received.filter((lot) => lot.scar === 'closed').length
  const acting = received.filter((lot) => lot.scar === 'action').length
  const replyRate = received.length ? (replied / received.length) * 100 : null
  const customerChart = useMemo(() => months.map((month) => {
    const lots = summary.lots.filter((lot) => lot.date.startsWith(month.key) && lot.result === 'fail')
    return { ...month, received: lots.length, closed: lots.filter((lot) => lot.scar === 'closed').length }
  }), [months, summary.lots])
  const elapsedMonths = year < new Date().getFullYear() ? 12 : year > new Date().getFullYear() ? 0 : new Date().getMonth() + 1
  const quietMonths = customerChart.slice(0, elapsedMonths).filter((month) => month.received === 0).length
  const processTotals = process ? quantityOutcome(summary.lots) : null
  const processMonths = process
    ? months.map((month) => {
        const outcome = quantityOutcome(summary.lots.filter((lot) => lot.date.startsWith(month.key)))
        return {
          ...month,
          produced: outcome.produced,
          defectQty: outcome.defect,
          qtyRate: outcome.rate,
          ok: outcome.rate == null ? null : outcome.rate <= month.target,
        }
      })
    : []
  const processJudged = processMonths.filter((month) => month.ok != null)
  const processAchievedMonths = processJudged.filter((month) => month.ok)
  const processRanked = [...processJudged].sort((a, b) => (a.qtyRate ?? 0) - (b.qtyRate ?? 0))
  const processLow = processRanked[0]
  const processHigh = processRanked[processRanked.length - 1]
  const processAchieveRate = processJudged.length ? Math.round((processAchievedMonths.length / processJudged.length) * 100) : 0
  const processPeriods = (size: number, labelOf: (index: number) => string) => Array.from({ length: 12 / size }, (_, index) => {
    const slice = processMonths.slice(index * size, index * size + size)
    const produced = slice.reduce((sum, month) => sum + month.produced, 0)
    const defect = slice.reduce((sum, month) => sum + month.defectQty, 0)
    const rate = produced > 0 ? (defect / produced) * 100 : 0
    const target = Math.min(...slice.map((month) => month.target))
    return { key: `${labelOf(index)}`, label: labelOf(index), inspected: produced, defect, rate, target, ok: produced > 0 ? rate <= target : null }
  })
  const periodHeads = customer ? ['접수', '조치', '회신율'] : process ? ['생산량', '불량수량', '불량률'] : certificates ? ['출하', '불량', '불량률'] : ['검사', '불량', '불량률']
  const periodQuarters: PeriodStat[] = customer ? replySummary?.quarters ?? [] : process ? processPeriods(3, (index) => `${index + 1}분기`) : quarters
  const periodHalves: PeriodStat[] = customer ? replySummary?.halves ?? [] : process ? processPeriods(6, (index) => (index === 0 ? '상반기' : '하반기')) : halves
  const periodTotal: PeriodStat = customer && replySummary
    ? replySummary.total
    : process && processTotals
      ? { key: 'total', label: '누계', inspected: processTotals.produced, defect: processTotals.defect, rate: processTotals.rate ?? 0, target: total.target, ok: processTotals.rate == null ? null : processTotals.rate <= total.target }
      : total
  const deliveryShipTotal = useMemo(
    () => (delivery ? shipmentCountForYear(shipmentByMonth, year, months.map((month) => month.key)) : 0),
    [delivery, shipmentByMonth, year, months],
  )
  const overviewRateMonths = useMemo((): PeriodStat[] => {
    if (customer && replySummary) return replySummary.months
    if (process) {
      return processMonths.map((month) => ({
        key: month.key,
        label: month.label,
        inspected: month.produced,
        defect: month.defectQty,
        rate: month.qtyRate ?? 0,
        target: month.target,
        ok: month.ok,
      }))
    }
    return months
  }, [customer, replySummary, process, processMonths, months])
  const overviewChartTarget = customer && replySummary ? replySummary.total.target : total.target
  const overviewRateJudged = customer && replySummary ? replySummary.judged : process ? processJudged.length : judged
  const overviewChartTitle = delivery
    ? '월별 납기준수율 추이'
    : customer
      ? '월별 회신율 추이'
      : process
        ? '월별 공정 불량률 추이'
        : certificates
          ? '월별 출하검사 현황'
          : '월별 LOT 불량률'
  const outgoingLegend: [string, string][] = [
    ['bg-blue-600', '출하 Kg 막대'],
    ['bg-violet-500', '출하 EA 막대'],
    ['bg-emerald-500', '불량률(목표 이하)'],
    ['bg-rose-500', '불량률(목표 초과)'],
    ['border border-dashed border-blue-400 bg-transparent', `목표 ${total.target}%`],
  ]
  const rateLegend: [string, string][] = [
    ['bg-emerald-600', '목표 달성'],
    ['bg-rose-500', '미달'],
    ['border border-dashed border-slate-400 bg-transparent', '목표'],
  ]
  const shipUnits = shippedUnits(shipped)
  const primaryShipUnit = defaultShipUnit(shipped)
  const otherShipText = shipUnits
    .filter((unit) => unit !== primaryShipUnit)
    .map((unit) => `${formatShipQuantity(shipped.total[unit])} ${unit}`)
    .join(' · ')

  return (
    <div className="space-y-3">
      {(onPrint || (years && years.length > 0 && onYearChange)) && (
        <div className="flex flex-wrap items-center justify-end gap-2">
          {onPrint && (
            <Button type="button" variant="outline" size="sm" onClick={onPrint}>
              <Printer /> 출력
            </Button>
          )}
          {years && years.length > 0 && onYearChange && (
            <select aria-label="연도" value={year} onChange={(event) => onYearChange(Number(event.target.value))} className={FIELD}>
              {years.map((item) => <option key={item} value={item}>{item}년</option>)}
            </select>
          )}
        </div>
      )}
      <section className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-5 xl:gap-4">
        {delivery ? (
          <>
            <StatTile
              icon={Target}
              label="목표"
              value={String(total.target)}
              unit="%"
              sub={`${year}년 연간 KPI · 이상`}
            />
            <StatTile
              icon={Package}
              label="발주건"
              value={deliveryOrderByMonth.total ? deliveryOrderByMonth.total.toLocaleString('ko-KR') : '—'}
              unit={deliveryOrderByMonth.total ? '건' : undefined}
              sub={`${year}년 누계`}
            />
            <StatTile
              icon={Package}
              label="납품건"
              value={deliveryShipTotal ? deliveryShipTotal.toLocaleString('ko-KR') : '—'}
              unit={deliveryShipTotal ? '건' : undefined}
              sub="성적서(출고) 기준"
            />
            <StatTile
              icon={TriangleAlert}
              label="납기지연건"
              value={total.inspected ? total.defect.toLocaleString('ko-KR') : '—'}
              unit={total.inspected ? '건' : undefined}
              sub={total.inspected ? `약 ${((total.defect / total.inspected) * 100).toFixed(3)}%` : '납품 없음'}
              tone="rose"
            />
            <StatTile
              icon={CheckCircle2}
              label="납기준수율"
              value={total.inspected ? total.rate.toFixed(3) : '—'}
              unit={total.inspected ? '%' : undefined}
              sub={total.inspected ? (total.ok ? '연간 목표 달성' : '연간 목표 미달') : '납품 실적 없음'}
              tone={total.ok === false ? 'rose' : total.ok ? 'green' : undefined}
            />
          </>
        ) : process && processTotals ? (
          <>
            <StatTile
              icon={Package}
              label="총 생산량(검사수량)"
              value={formatQty(processTotals.produced)}
              sub={`${year}년 누계 · 검사 ${summary.lots.length.toLocaleString('ko-KR')}건`}
            />
            <StatTile icon={TriangleAlert} label="총 불량수량" value={formatQty(processTotals.defect)} sub={`${year}년 누계`} tone={processTotals.defect > 0 ? 'rose' : undefined} />
            <StatTile icon={CheckCircle2} label="누계 공정 불량률" value={processTotals.rate == null ? '—' : processTotals.rate.toFixed(3)} unit={processTotals.rate == null ? undefined : '%'} sub={`목표 ${total.target}% 이하`} tone={processTotals.rate == null ? undefined : processTotals.rate <= total.target ? 'green' : 'rose'} />
            <StatTileRange
              icon={BarChart3}
              title="최고/최저 불량률"
              high={processJudged.length && processHigh?.qtyRate != null ? { value: `${processHigh.qtyRate.toFixed(3)}%`, meta: processHigh.label, tone: processHigh.ok === false ? 'rose' : undefined } : undefined}
              low={processJudged.length && processLow?.qtyRate != null ? { value: `${processLow.qtyRate.toFixed(3)}%`, meta: processLow.label, tone: 'green' } : undefined}
              emptyLabel="판정할 달 없음"
            />
            <StatTile
              icon={Trophy}
              label="목표 달성 월수"
              value={`${processAchievedMonths.length} / 12`}
              unit="개월"
              sub={processJudged.length ? `달성률 ${processAchieveRate}% · 판정 ${processJudged.length}개월` : '판정할 달 없음'}
            />
          </>
        ) : customer ? (
          <>
            <StatTile icon={Package} label="고객부적합 접수" value={received.length.toLocaleString('ko-KR')} unit="건" sub={`${year}년 누계`} tone={received.length ? 'rose' : undefined} />
            <StatTile icon={TriangleAlert} label="부적합 조치" value={(replied + acting).toLocaleString('ko-KR')} unit="건" sub={`완료 ${replied} · 진행 ${acting}`} />
            <StatTile icon={CheckCircle2} label="누계 회신율" value={replyRate == null ? '—' : replyRate.toFixed(3)} unit={replyRate == null ? undefined : '%'} sub={received.length ? `완료 ${replied} / 접수 ${received.length}` : '접수 없음'} tone={replyRate == null ? undefined : replyRate >= total.target ? 'green' : 'rose'} />
            <StatTile
              icon={CheckCircle2}
              label="무부적합 월"
              value={`${quietMonths} / 12`}
              unit="개월"
              sub={`${year}년 · 경과 ${elapsedMonths}개월 중`}
              tone={quietMonths > 0 ? 'green' : undefined}
            />
            <StatTile
              icon={Trophy}
              label="목표달성"
              value={`${replySummary?.achieved ?? 0} / 12`}
              unit="개월"
              sub={replySummary?.judged ? `달성률 ${Math.round((replySummary.achieved / replySummary.judged) * 100)}% · 판정 ${replySummary.judged}개월` : '접수된 달 없음'}
            />
          </>
        ) : certificates ? (
          <>
            <StatTile
              icon={Package}
              label="총 출하수량"
              value={shipUnits.length ? formatShipQuantity(shipped.total[primaryShipUnit]) : '—'}
              unit={shipUnits.length ? primaryShipUnit : undefined}
              sub={otherShipText ? `+ ${otherShipText}` : `${year}년 성적서 누계`}
            />
            <StatTile
              icon={BarChart3}
              label="출하검사 수량"
              value={total.inspected ? total.inspected.toLocaleString('ko-KR') : '—'}
              sub={`${year}년 작업일보 검사시료`}
            />
            <StatTile
              icon={TriangleAlert}
              label="검출 불량수량"
              value={total.defect ? total.defect.toLocaleString('ko-KR') : '—'}
              sub={`${year}년 작업일보 불량수`}
              tone={total.defect > 0 ? 'rose' : undefined}
            />
            <StatTile
              icon={CheckCircle2}
              label="출하검사 불량률"
              value={total.rateBase && total.rateBase > 0 ? total.rate.toFixed(3) : '—'}
              unit={total.rateBase && total.rateBase > 0 ? '%' : undefined}
              sub={`불량 ÷ 출하 · 목표 ${total.target}% 이하`}
              tone={total.ok === false ? 'rose' : total.ok ? 'green' : undefined}
            />
            <StatTile
              icon={Trophy}
              label="목표 달성 월수"
              value={`${achieved} / 12`}
              unit="개월"
              sub={judged ? `달성률 ${achieveRate}% · 판정 ${judged}개월` : '출하 실적 있는 달 없음'}
            />
          </>
        ) : (
          <>
            <StatTile
              icon={Package}
              label="총 검사 LOT"
              value={total.inspected.toLocaleString('ko-KR')}
              unit="LOT"
              sub={`${year}년 누계`}
            />
            <StatTile
              icon={TriangleAlert}
              label="총 불량 LOT"
              value={total.defect.toLocaleString('ko-KR')}
              unit="LOT"
              sub={`${year}년 누계`}
              tone={total.defect > 0 ? 'rose' : undefined}
            />
            <StatTile
              icon={CheckCircle2}
              label="누계 LOT 불량률"
              value={total.inspected ? total.rate.toFixed(3) : '—'}
              unit={total.inspected ? '%' : undefined}
              sub={`목표 ${total.target}% 이하`}
              tone={total.ok === false ? 'rose' : total.ok ? 'green' : undefined}
            />
            <StatTile
              icon={CheckCircle2}
              label="무불량(0 LOT) 월수"
              value={`${zeroMonths} / 12`}
              unit="개월"
              sub={judged ? `판정 ${judged}개월` : '판정한 달 없음'}
              tone={zeroMonths > 0 ? 'green' : undefined}
            />
            <StatTile
              icon={Trophy}
              label="목표 달성월수"
              value={`${achieved} / 12`}
              unit="개월"
              sub={judged ? `달성률 ${achieveRate}% · 판정 ${judged}개월` : '검사한 달 없음'}
            />
          </>
        )}
      </section>

      <section className={cn(
        'grid min-w-0 gap-4 xl:min-h-[22rem] xl:items-stretch',
        certificates
          ? 'xl:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]'
          : 'xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]',
      )}>
        <Card
          className="flex h-full min-h-[18rem] flex-col xl:min-h-0"
          title={overviewChartTitle}
          aside={<Legend items={certificates ? outgoingLegend : rateLegend} />}
        >
          {certificates ? (
            <OutgoingKpiVisual year={year} months={months} shipped={shipped} target={total.target} className="min-h-0 flex-1" />
          ) : overviewRateJudged === 0 ? (
            <div className="flex min-h-[280px] flex-1 items-center justify-center">
              <Empty text={customer ? `${year}년 접수된 고객부적합이 없습니다.` : delivery ? `${year}년 납품 기록이 없습니다.` : `${year}년 검사 기록이 없습니다.`} />
            </div>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col">
              <KpiRateBarChart
                months={overviewRateMonths}
                target={overviewChartTarget}
                customer={customer}
                process={process}
                delivery={delivery}
                certificates={false}
              />
            </div>
          )}
        </Card>

        <div className="flex min-h-0 min-w-0 flex-col xl:h-full">
          {delivery ? (
            <KpiPeriodPanel
              title="분기 · 반기 납기준수"
              heads={['발주', '납품', '지연', '준수율']}
              quarters={quarters.map((row, index) => deliveryLine(row, deliveryPeriodOrders.quarters[index] ?? 0))}
              halves={halves.map((row, index) => deliveryLine(row, deliveryPeriodOrders.halves[index] ?? 0))}
              total={deliveryLine(total, deliveryOrderByMonth.total)}
              higherBetter
            />
          ) : (
            <KpiPeriodPanel
              title={customer ? '분기 · 반기 회신율' : process ? '분기 · 반기 공정 불량률' : certificates ? '분기 · 반기 출하검사' : '분기 · 반기 수입검사'}
              aside={certificates ? `단위 ${outgoingUnitLegend(shipped)}` : undefined}
              heads={periodHeads}
              quarters={periodQuarters.map((row) => periodLine(row, { outgoing: certificates }))}
              halves={periodHalves.map((row) => periodLine(row, { outgoing: certificates }))}
              total={periodLine(periodTotal, { outgoing: certificates })}
              higherBetter={customer}
            />
          )}
        </div>
      </section>

      <section className="min-w-0">
        <Card
          title={summaryTableTitle}
          aside={onOpenTargets ? (
            <Button type="button" variant="outline" size="sm" onClick={onOpenTargets}>
              <Target /> 목표 설정
            </Button>
          ) : undefined}
        >
          <div className="overflow-x-auto">
          <table className="w-full text-[13px] leading-snug">
            <colgroup>
              <col className={customer ? 'w-[7rem]' : delivery ? 'w-[7.25rem]' : 'w-[5.5rem]'} />
            </colgroup>
            <thead>
              <tr className="border-b text-[13px] text-muted-foreground">
                <th className="py-2 pr-2 text-left font-medium">구분</th>
                {months.map((month) => <th key={month.key} className="px-1 py-2 text-right font-medium">{month.label}</th>)}
                <th className="py-2 pl-1 text-right font-medium">합계</th>
              </tr>
            </thead>
              <tbody className="tabular-nums">
                {customer ? (
                  <>
                    <SummaryRow label="회신율 목표" months={customerChart} cell={(month) => `${month.target}%`} total={`${total.target}%`} emphasis />
                    <SummaryRow label="부적합건수" months={customerChart} cell={(month) => (month.inspected || month.received ? String(month.received) : '—')} total={String(received.length)} />
                    <SummaryRow label="조치건수" months={customerChart} cell={(month) => (month.inspected || month.received ? String(month.closed) : '—')} total={String(replied)} />
                    <SummaryRow label="회신율(원본)" months={customerChart} cell={(month) => replyText(month.closed, month.received)} total={replyRate == null ? '—' : pct(replyRate)} />
                    <SummaryRow label="목표대비" months={customerChart} cell={(month) => <ReplyGap rate={replyOf(month.closed, month.received)} target={month.target} />} total={replyRate == null ? '—' : <ReplyGap rate={replyRate} target={total.target} />} />
                  </>
                ) : process && processTotals ? (
                  <>
                    <SummaryRow label="목표" months={processMonths} cell={(month) => `${month.target}%`} total={`${total.target}%`} emphasis />
                    <SummaryRow label="생산량" months={processMonths} cell={(month) => (month.inspected ? formatQty(month.produced) : '—')} total={processTotals.produced ? formatQty(processTotals.produced) : '—'} />
                    <SummaryRow label="검사수량" months={processMonths} cell={(month) => (month.inspected ? String(month.inspected) : '—')} total={String(summary.lots.length)} />
                    <SummaryRow label="불량수량" months={processMonths} cell={(month) => (month.inspected ? formatQty(month.defectQty) : '—')} total={formatQty(processTotals.defect)} />
                    <SummaryRow label="불량률" months={processMonths} cell={(month) => (month.qtyRate == null ? '—' : pct(month.qtyRate))} total={processTotals.rate == null ? '—' : pct(processTotals.rate)} danger />
                    <SummaryRow label="목표 대비" months={processMonths} cell={(month) => (month.qtyRate == null ? '—' : gapText(month.qtyRate, month.target))} total={processTotals.rate == null ? '—' : gapText(processTotals.rate, total.target)} compare totalOk={processTotals.rate == null ? null : processTotals.rate <= total.target} />
                  </>
                ) : certificates ? (
                  <>
                    <SummaryRow label="목표 불량률" months={months} cell={(month) => `${month.target}%`} total={`${total.target}%`} emphasis />
                    {(shipUnits.length ? shipUnits : (['Kg'] as QuantityUnit[])).map((unit) => (
                      <SummaryRow
                        key={unit}
                        label={`출하수량(${unit})`}
                        months={months}
                        cell={(month) => (outgoingMonthOpen(month.key) ? formatShipQuantity(shipped.byMonth.get(month.key)?.[unit] ?? 0) : '—')}
                        total={formatShipQuantity(shipped.total[unit] ?? 0)}
                      />
                    ))}
                    <SummaryRow label="검사수량" months={months} cell={(month) => (outgoingMonthOpen(month.key) ? formatQty(month.inspected) : '—')} total={formatQty(total.inspected)} />
                    <SummaryRow label="불량수량" months={months} cell={(month) => (outgoingMonthOpen(month.key) ? formatQty(month.defect) : '—')} total={formatQty(total.defect)} />
                    <SummaryRow
                      label="불량률"
                      months={months}
                      cell={(month) => (outgoingMonthOpen(month.key)
                        ? <span title={outgoingRateHint(month)}>{formatKpiRateFromParts(month.defect, (month as PeriodStat).rateBase ?? 0)}{(month as PeriodStat).rateBaseUnit ? ` (${(month as PeriodStat).rateBaseUnit})` : ''}</span>
                        : '—')}
                      total={(total.rateBase ?? 0) > 0 ? <span title={outgoingRateHint(total)}>{pct(total.rate)}{total.rateBaseUnit ? ` (${total.rateBaseUnit})` : ''}</span> : '—'}
                      danger
                    />
                    <SummaryRow
                      label="목표대비"
                      months={months}
                      cell={(month) => (outgoingMonthOpen(month.key) ? <span title={outgoingRateHint(month)}>{gapText(month.rate, month.target)}</span> : '—')}
                      total={<span title={outgoingRateHint(total)}>{gapText(total.rate, total.target)}</span>}
                      compare
                      totalOk={total.ok}
                    />
                    <SummaryRow label="판정" months={months} cell={(month) => (outgoingMonthOpen(month.key) ? <Verdict ok={month.ok} compact passLabel="합격" failLabel="불합격" /> : '—')} total={`${achieved}/${judged}`} />
                  </>
                ) : delivery ? (
                  <>
                    <SummaryRow label="목표" months={months} cell={(month) => <SummaryUnit value={month.target} unit="%" />} total={<SummaryUnit value={total.target} unit="%" />} emphasis />
                    <SummaryRow
                      label="발주건"
                      months={months}
                      cell={(month) => {
                        const count = deliveryOrderByMonth.map.get(month.key) ?? 0
                        return count ? <SummaryUnit value={count} unit="건" /> : '—'
                      }}
                      total={deliveryOrderByMonth.total ? <SummaryUnit value={deliveryOrderByMonth.total} unit="건" /> : '—'}
                    />
                    <SummaryRow
                      label="납품건"
                      months={months}
                      cell={(month) => {
                        const count = shipmentByMonth[month.key] ?? 0
                        return count ? <SummaryUnit value={count} unit="건" /> : '—'
                      }}
                      total={(() => {
                        const sum = shipmentCountForYear(shipmentByMonth, year, months.map((month) => month.key))
                        return sum ? <SummaryUnit value={sum} unit="건" /> : '—'
                      })()}
                    />
                    <SummaryRow label="납기지연건" months={months} cell={(month) => (month.inspected ? <SummaryUnit value={month.defect} unit="건" /> : '—')} total={<SummaryUnit value={total.defect} unit="건" />} />
                    <SummaryRow label="납기준수율" months={months} cell={(month) => (month.inspected ? <SummaryUnit value={month.rate.toFixed(3)} unit="%" /> : '—')} total={total.inspected ? <SummaryUnit value={total.rate.toFixed(3)} unit="%" /> : '—'} />
                    <SummaryRow label="목표대비" months={months} cell={(month) => (month.inspected ? <ReplyGap rate={month.rate} target={month.target} /> : '—')} total={total.inspected ? <ReplyGap rate={total.rate} target={total.target} /> : '—'} compare totalOk={total.ok} />
                    <SummaryRow label="판정" months={months} cell={(month) => <Verdict ok={month.ok} compact />} total={`${achieved}/${judged}`} />
                  </>
                ) : (
                  <>
                    <SummaryRow label="목표" months={months} cell={(month) => `${month.target}%`} total={`${total.target}%`} emphasis />
                    <SummaryRow label="검사 LOT" months={months} cell={(month) => (month.inspected ? String(month.inspected) : '—')} total={String(total.inspected)} />
                    <SummaryRow label="불량 LOT" months={months} cell={(month) => (month.inspected ? String(month.defect) : '—')} total={String(total.defect)} />
                    <SummaryRow label="LOT 불량률" months={months} cell={(month) => (month.inspected ? formatKpiRateFromParts(month.defect, month.inspected) : '—')} total={total.inspected ? pct(total.rate) : '—'} danger />
                    <SummaryRow
                      label="목표대비"
                      months={months}
                      cell={(month) => (month.inspected ? <DefectGap rate={month.rate} target={month.target} /> : '—')}
                      total={total.inspected ? <DefectGap rate={total.rate} target={total.target} /> : '—'}
                      compare
                      totalOk={total.ok}
                    />
                    <SummaryRow label="판정" months={months} cell={(month) => <Verdict ok={month.ok} compact />} total={`${achieved}/${judged}`} />
                  </>
                )}
                {!delivery && (process || customer) && (
                  <tr>
                    <td className="py-2 pr-2 font-medium">판정</td>
                    {process ? processMonths.map((month) => (
                      <td key={month.key} className="px-1 py-2 text-right"><Verdict ok={month.ok} compact /></td>
                    )) : customerChart.map((month) => {
                      const rate = replyOf(month.closed, month.received)
                      return <td key={month.key} className="px-1 py-2 text-right"><Verdict ok={rate == null ? null : rate >= month.target} compact /></td>
                    })}
                    <td className="py-2 pl-1 text-right font-semibold">
                      {process
                        ? `${processAchievedMonths.length}/${processJudged.length}`
                        : `${customerChart.filter((month) => { const rate = replyOf(month.closed, month.received); return rate != null && rate >= month.target }).length}/${customerChart.filter((month) => month.received > 0).length}`}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </section>
    </div>
  )
}

const PAGE_SIZE = 25
const LOT_SORT_KEYS = ['date', 'vendor', 'product', 'floor', 'quantity', 'result', 'defect', null] as const
type LotSortKey = Exclude<(typeof LOT_SORT_KEYS)[number], null>

function compareLots(a: InspectionLot, b: InspectionLot, key: LotSortKey) {
  if (key === 'date') return a.date.localeCompare(b.date)
  if (key === 'vendor') return a.vendor.localeCompare(b.vendor, 'ko')
  if (key === 'product') return a.product.localeCompare(b.product, 'ko')
  if (key === 'floor') return Number(a.floor) - Number(b.floor)
  if (key === 'quantity') return a.quantity - b.quantity
  if (key === 'result') return (a.result === 'fail' ? 1 : 0) - (b.result === 'fail' ? 1 : 0)
  return (a.defect || a.note).localeCompare(b.defect || b.note, 'ko')
}

function LotsTab({ lots, closed, canManage, certificates = false, customer = false, delivery = false, onEdit, onRemove }: { lots: InspectionLot[]; closed: Set<string>; canManage: boolean; certificates?: boolean; customer?: boolean; delivery?: boolean; onEdit: (lot: InspectionLot) => void; onRemove: (lot: InspectionLot) => void }) {
  const [month, setMonth] = useState('all')
  const [result, setResult] = useState<'all' | 'pass' | 'fail'>('all')
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(0)
  const [sort, setSort] = useState<{ key: LotSortKey; dir: 'asc' | 'desc' }>({ key: 'date', dir: 'desc' })
  const months = [...new Set(lots.map((lot) => lot.date.slice(0, 7)))].sort().reverse()
  const rows = lots.filter((lot) =>
    (month === 'all' || lot.date.startsWith(month))
    && (result === 'all' || lot.result === result)
    && (!query.trim() || [lot.vendor, lot.product, lot.defect, lot.note].some((value) => chosungSearch(value, query.trim()))))
  const sorted = [...rows].sort((a, b) => compareLots(a, b, sort.key) * (sort.dir === 'asc' ? 1 : -1) || b.date.localeCompare(a.date) || b.id.localeCompare(a.id))
  const pageCount = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE))
  const current = Math.min(page, pageCount - 1)
  const shown = sorted.slice(current * PAGE_SIZE, current * PAGE_SIZE + PAGE_SIZE)
  const toggleSort = (key: string) => {
    if (!(LOT_SORT_KEYS as readonly string[]).includes(key)) return
    const sortKey = key as LotSortKey
    setSort((currentSort) => currentSort.key === sortKey
      ? { key: sortKey, dir: currentSort.dir === 'asc' ? 'desc' : 'asc' }
      : { key: sortKey, dir: sortKey === 'date' || sortKey === 'quantity' ? 'desc' : 'asc' })
    setPage(0)
  }
  const pickMonth = (value: string | null) => {
    if (!value) return
    setMonth(value)
    setPage(0)
  }
  const pickResult = (value: typeof result) => {
    setResult(value)
    setPage(0)
  }
  const monthLabel = month === 'all' ? '전체' : `${Number(month.slice(5))}월${closed.has(month) ? ' · 마감' : ''}`

  return (
    <Card
      title={customer ? '고객부적합' : delivery ? '납품 내역' : certificates ? '출하검사 실적' : '검사 LOT'}
      aside={<span className="text-xs text-muted-foreground">{rows.length.toLocaleString('ko-KR')}건</span>}
    >
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Select value={month} onValueChange={pickMonth}>
          <SelectTrigger aria-label="월" className="h-9 min-w-[6.5rem] bg-card">
            <span>{monthLabel}</span>
          </SelectTrigger>
          <SelectContent align="start">
            <SelectGroup>
              <SelectItem value="all">전체</SelectItem>
              {months.map((key) => (
                <SelectItem key={key} value={key}>{Number(key.slice(5))}월{closed.has(key) ? ' · 마감' : ''}</SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
        {!customer && <div role="group" aria-label="판정" className="grid h-9 grid-cols-3 gap-0.5 rounded-lg border bg-muted/40 p-0.5">
          {([['all', '전체'], ['pass', delivery ? '준수' : '합격'], ['fail', delivery ? '지연' : '불합격']] as const).map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={result === value}
              onClick={() => pickResult(value)}
              className={cn(
                'rounded-md px-2.5 text-[13px] font-semibold transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/40',
                result === value ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:bg-background hover:text-foreground',
              )}
            >
              {label}
            </button>
          ))}
        </div>}
        <label className="relative ml-auto w-full sm:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(event) => { setQuery(event.target.value); setPage(0) }}
            placeholder={customer ? '업체, 부적합 내용 검색' : delivery ? '업체, 품목, 지연 사유 검색' : '업체명, 품목, 불량 내용 검색'}
            className={cn(FIELD, 'w-full pl-9')}
          />
        </label>
      </div>
      {rows.length === 0 ? (
        <Empty text={customer ? '조건에 맞는 고객부적합이 없습니다.' : delivery ? '조건에 맞는 납품이 없습니다.' : certificates ? '조건에 맞는 출하검사 실적이 없습니다.' : '조건에 맞는 검사가 없습니다.'} />
      ) : (
        <div>
          <Pager page={current} pageCount={pageCount} total={rows.length} onPage={setPage} edge="top" />
          <div className="overflow-x-auto">
          <Table
            heads={customer ? ['발생일', '업체', '부적합내용', '조치'] : delivery ? ['납품일', '약속납기', '업체명', '품목', '수량', '준수', '지연 사유', ''] : ['검사일', '업체명', '품목', '층', '수량', '판정', '불량 내용', '']}
            align={customer ? ['left', 'left', 'left', 'left'] : delivery ? ['left', 'left', 'left', 'left', 'right', 'left', 'left', 'right'] : ['left', 'left', 'left', 'left', 'right', 'left', 'left', 'right']}
            sort={{ active: sort.key, dir: sort.dir, keys: customer ? ['date', 'vendor', 'defect', null] : delivery ? ['date', 'vendor', 'product', 'quantity', 'result', null] : LOT_SORT_KEYS, onSort: toggleSort }}
          >
            {shown.map((lot) => {
              const locked = closed.has(lot.date.slice(0, 7))
              return (
                <tr key={lot.id} className="border-b last:border-0">
                  <td className="whitespace-nowrap py-2 pr-3 tabular-nums">{dot(lot.date)}</td>
                  {customer ? (
                    <>
                      <td className="py-2 pr-3 font-medium">{lot.vendor}</td>
                      <td className="max-w-[24rem] truncate py-2 pr-3 text-muted-foreground">{lot.defect || '—'}</td>
                      <td className="py-2 pr-3">{lot.scar === 'closed' ? '완료' : lot.scar === 'action' ? '진행' : '미진행'}</td>
                    </>
                  ) : delivery ? (
                    <>
                      <td className={cn('whitespace-nowrap py-2 pr-3 tabular-nums', lot.result === 'fail' && 'font-medium text-rose-600')}>{lot.scarDue ? dot(lot.scarDue) : '—'}</td>
                      <td className="py-2 pr-3 font-medium">{lot.vendor}</td>
                      <td className="py-2 pr-3">{lot.product || '—'}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{lot.quantity ? `${lot.quantity.toLocaleString('ko-KR', { maximumFractionDigits: 2 })} ${lot.unit ?? ''}`.trim() : '—'}</td>
                      <td className="py-2 pr-3"><ResultBadge result={lot.result} passLabel="준수" failLabel="지연" /></td>
                      <td className="max-w-[16rem] truncate py-2 pr-3 text-muted-foreground">{lot.result === 'fail' ? (lot.defect || lot.note || '—') : '—'}</td>
                      <td className="whitespace-nowrap py-2 text-right">
                        {locked ? (
                          <Lock className="ml-auto h-3.5 w-3.5 text-muted-foreground" aria-label="마감됨" />
                        ) : canManage ? (
                          <span className="inline-flex gap-1">
                            <Button variant="ghost" size="icon-sm" aria-label="수정" onClick={() => onEdit(lot)}><Pencil /></Button>
                            <Button variant="ghost" size="icon-sm" aria-label="삭제" onClick={() => onRemove(lot)}><Trash2 /></Button>
                          </span>
                        ) : null}
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="py-2 pr-3 font-medium">{lot.vendor}</td>
                      <td className="py-2 pr-3">{lot.product || '—'}</td>
                      <td className="py-2 pr-3">{lot.floor}층</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{lot.quantity ? `${lot.quantity.toLocaleString('ko-KR', { maximumFractionDigits: 2 })} ${lot.unit ?? ''}`.trim() : '—'}</td>
                      <td className="py-2 pr-3"><ResultBadge result={lot.result} /></td>
                      <td className="max-w-[16rem] truncate py-2 pr-3 text-muted-foreground">{lot.defect || lot.note || '—'}</td>
                      <td className="whitespace-nowrap py-2 text-right">
                        {locked ? (
                          <Lock className="ml-auto h-3.5 w-3.5 text-muted-foreground" aria-label="마감됨" />
                        ) : canManage ? (
                          <span className="inline-flex gap-1">
                            <Button variant="ghost" size="icon-sm" aria-label="수정" onClick={() => onEdit(lot)}><Pencil /></Button>
                            <Button variant="ghost" size="icon-sm" aria-label="삭제" onClick={() => onRemove(lot)}><Trash2 /></Button>
                          </span>
                        ) : null}
                      </td>
                    </>
                  )}
                </tr>
              )
            })}
          </Table>
          </div>
          <Pager page={current} pageCount={pageCount} total={rows.length} onPage={setPage} edge="bottom" />
        </div>
      )}
    </Card>
  )
}

function deliveryOrderRef(id: string, index: number) {
  const tail = id.replace(/^sample-delivery-/, '').replace(/\D/g, '').slice(-4).padStart(4, '0')
  return `SO-${String(index + 1).padStart(4, '0')}${tail ? `-${tail}` : ''}`
}

function daysBetweenIso(from: string, to: string) {
  if (!from || !to) return null
  const start = new Date(`${from}T12:00:00`).getTime()
  const end = new Date(`${to}T12:00:00`).getTime()
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null
  return Math.round((end - start) / 86_400_000)
}

function DeliveryOrdersTab({ lots, canManage, onEdit }: { lots: InspectionLot[]; canManage: boolean; onEdit: (lot: InspectionLot) => void }) {
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<'all' | 'pass' | 'fail'>('all')
  const rows = lots.filter((lot) =>
    (status === 'all' || lot.result === status)
    && (!query.trim() || [lot.vendor, lot.product, lot.defect, lot.note].some((value) => chosungSearch(value, query.trim()))))
  const sorted = [...rows].sort((a, b) => (b.scarDue || b.date).localeCompare(a.scarDue || a.date) || b.date.localeCompare(a.date))
  const onTime = rows.filter((lot) => lot.result === 'pass').length
  const late = rows.filter((lot) => lot.result === 'fail').length

  return (
    <div className="space-y-4">
      <section className="grid min-w-0 rounded-2xl border bg-card shadow-sm sm:grid-cols-3">
        <Metric label="수주·발주 건" value={String(rows.length)} unit="건" sub="등록된 납품 기준" />
        <Metric label="납기 준수" value={String(onTime)} unit="건" sub="약속 납기 이내 납품" tone={onTime ? 'green' : undefined} />
        <Metric label="납기 지연" value={String(late)} unit="건" sub="약속 납기 초과" tone={late ? 'rose' : undefined} />
      </section>
      <Card
        title="수주·발주관리"
        aside={<span className="max-w-xs text-right text-xs leading-5 text-muted-foreground">납품 등록 시 업체·품목·약속납기를 함께 기록합니다.</span>}
      >
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <div role="group" aria-label="납기상태" className="grid h-9 grid-cols-3 gap-0.5 rounded-lg border bg-muted/40 p-0.5">
            {([['all', '전체'], ['pass', '준수'], ['fail', '지연']] as const).map(([value, label]) => (
              <button
                key={value}
                type="button"
                aria-pressed={status === value}
                onClick={() => setStatus(value)}
                className={cn(
                  'rounded-md px-2.5 text-[13px] font-semibold transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/40',
                  status === value ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:bg-background hover:text-foreground',
                )}
              >
                {label}
              </button>
            ))}
          </div>
          <label className="relative ml-auto w-full sm:w-72">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="업체, 품목, 관리번호 검색"
              className={cn(FIELD, 'w-full pl-9')}
            />
          </label>
        </div>
        {sorted.length === 0 ? (
          <Empty text="등록된 수주·발주가 없습니다. 납품 등록으로 추가할 수 있습니다." />
        ) : (
          <div className="overflow-x-auto">
            <Table heads={['관리번호', '업체', '품목', '수량', '약속납기', '납품일', '납기상태', '']} align={['left', 'left', 'left', 'right', 'left', 'left', 'left', 'right']}>
              {sorted.map((lot, index) => (
                <tr key={lot.id} className="border-b last:border-0">
                  <td className="whitespace-nowrap py-2 pr-3 font-mono text-xs text-muted-foreground">{deliveryOrderRef(lot.id, index)}</td>
                  <td className="py-2 pr-3 font-medium">{lot.vendor}</td>
                  <td className="py-2 pr-3">{lot.product || '—'}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{lot.quantity ? lot.quantity.toLocaleString('ko-KR') : '—'}</td>
                  <td className="whitespace-nowrap py-2 pr-3 tabular-nums">{lot.scarDue ? dot(lot.scarDue) : '—'}</td>
                  <td className="whitespace-nowrap py-2 pr-3 tabular-nums">{dot(lot.date)}</td>
                  <td className="py-2 pr-3"><ResultBadge result={lot.result} passLabel="준수" failLabel="지연" /></td>
                  <td className="py-2 text-right">
                    {canManage && (
                      <Button variant="ghost" size="icon-sm" aria-label="수정" onClick={() => onEdit(lot)}><Pencil /></Button>
                    )}
                  </td>
                </tr>
              ))}
            </Table>
          </div>
        )}
      </Card>
    </div>
  )
}

function DeliveryScheduleTab({ lots, year }: { lots: InspectionLot[]; year: number }) {
  const months = [...new Set(lots.map((lot) => (lot.scarDue || lot.date).slice(0, 7)))].filter((key) => key.startsWith(`${year}-`)).sort()
  const [month, setMonth] = useState<string>(() => months.at(-1) ?? 'all')
  const rows = lots
    .filter((lot) => lot.scarDue && (month === 'all' || lot.scarDue.startsWith(month)))
    .sort((a, b) => a.scarDue.localeCompare(b.scarDue) || a.date.localeCompare(b.date))
  const overdue = rows.filter((lot) => lot.result === 'fail').length

  return (
    <div className="space-y-4">
      <section className="grid min-w-0 rounded-2xl border bg-card shadow-sm sm:grid-cols-3">
        <Metric label="약속 납기" value={String(rows.length)} unit="건" sub={`${year}년 일정`} />
        <Metric label="지연 납품" value={String(overdue)} unit="건" sub="실제 납품이 약속 초과" tone={overdue ? 'rose' : undefined} />
        <Metric label="일정 대비" value={rows.length ? `${Math.round(((rows.length - overdue) / rows.length) * 100)}` : '—'} unit={rows.length ? '%' : ''} sub="준수 비율(일정 기준)" />
      </section>
      <Card title="납기일정" aside={<span className="text-xs text-muted-foreground">약속납기 순</span>}>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Select value={month} onValueChange={(value) => value && setMonth(value)}>
            <SelectTrigger aria-label="월" className="h-9 min-w-[6.5rem] bg-card">
              <span>{month === 'all' ? '전체' : `${Number(month.slice(5))}월`}</span>
            </SelectTrigger>
            <SelectContent align="start">
              <SelectGroup>
                <SelectItem value="all">전체</SelectItem>
                {months.map((key) => (
                  <SelectItem key={key} value={key}>{Number(key.slice(5))}월</SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
        {rows.length === 0 ? (
          <Empty text={`${year}년 약속 납기 일정이 없습니다.`} />
        ) : (
          <div className="overflow-x-auto">
            <Table heads={['약속납기', 'D-day', '업체', '품목', '실제납품', '상태']} align={['left', 'right', 'left', 'left', 'left', 'left']}>
              {rows.map((lot) => {
                const slip = daysBetweenIso(lot.scarDue, lot.date)
                const dLabel = slip == null ? '—' : slip === 0 ? 'D-day' : slip > 0 ? `D+${slip}` : `D${slip}`
                return (
                  <tr key={lot.id} className="border-b last:border-0">
                    <td className="whitespace-nowrap py-2 pr-3 tabular-nums font-medium">{dot(lot.scarDue)}</td>
                    <td className={cn('py-2 pr-3 text-right tabular-nums text-sm font-semibold', slip != null && slip > 0 && 'text-rose-600', slip != null && slip <= 0 && 'text-emerald-600')}>{dLabel}</td>
                    <td className="py-2 pr-3 font-medium">{lot.vendor}</td>
                    <td className="py-2 pr-3">{lot.product || '—'}</td>
                    <td className="whitespace-nowrap py-2 pr-3 tabular-nums">{dot(lot.date)}</td>
                    <td className="py-2 pr-3"><ResultBadge result={lot.result} passLabel="준수" failLabel="지연" /></td>
                  </tr>
                )
              })}
            </Table>
          </div>
        )}
      </Card>
    </div>
  )
}

function Pager({ page, pageCount, total, onPage, edge }: { page: number; pageCount: number; total: number; onPage: (page: number) => void; edge: 'top' | 'bottom' }) {
  if (pageCount <= 1) return null
  const start = page * PAGE_SIZE + 1
  const end = Math.min(total, (page + 1) * PAGE_SIZE)
  const marks = new Set([0, pageCount - 1, page - 1, page, page + 1].filter((item) => item >= 0 && item < pageCount))
  const pages = [...marks].sort((a, b) => a - b)
  return (
    <div className={cn('flex flex-wrap items-center justify-between gap-2', edge === 'top' ? 'mb-3' : 'mt-3 border-t pt-3')}>
      <p className="text-xs tabular-nums text-muted-foreground">{start.toLocaleString('ko-KR')}–{end.toLocaleString('ko-KR')} / {total.toLocaleString('ko-KR')}건</p>
      <div className="flex items-center gap-1">
        <Button type="button" variant="outline" size="sm" disabled={page === 0} onClick={() => onPage(page - 1)}>
          <ChevronLeft /> 이전
        </Button>
        {pages.map((item, index) => (
          <span key={item} className="flex items-center gap-1">
            {index > 0 && item - pages[index - 1] > 1 && <span className="px-1 text-xs text-muted-foreground">…</span>}
            <button
              type="button"
              aria-current={item === page ? 'page' : undefined}
              onClick={() => onPage(item)}
              className={cn(
                'h-7 min-w-7 rounded-lg px-2 text-[13px] font-semibold tabular-nums',
                item === page ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted',
              )}
            >
              {item + 1}
            </button>
          </span>
        ))}
        <Button type="button" variant="outline" size="sm" disabled={page >= pageCount - 1} onClick={() => onPage(page + 1)}>
          다음 <ChevronRight />
        </Button>
      </div>
    </div>
  )
}

const SCAR_SORT_KEYS = ['date', 'vendor', 'product', 'defect', 'scar', 'due', null] as const
type ScarSortKey = Exclude<(typeof SCAR_SORT_KEYS)[number], null>
const SCAR_RANK: Record<ScarStatus, number> = { none: 0, issued: 1, action: 2, closed: 3 }

function compareScar(a: InspectionLot, b: InspectionLot, key: ScarSortKey) {
  if (key === 'date') return a.date.localeCompare(b.date)
  if (key === 'vendor') return a.vendor.localeCompare(b.vendor, 'ko')
  if (key === 'product') return a.product.localeCompare(b.product, 'ko')
  if (key === 'defect') return a.defect.localeCompare(b.defect, 'ko')
  if (key === 'scar') return SCAR_RANK[a.scar] - SCAR_RANK[b.scar]
  if (!a.scarDue && b.scarDue) return 1
  if (a.scarDue && !b.scarDue) return -1
  return a.scarDue.localeCompare(b.scarDue)
}

function ScarTab({ lots, canManage, customer = false, delivery = false, onChange, onRemove }: {
  lots: InspectionLot[]
  canManage: boolean
  customer?: boolean
  delivery?: boolean
  onChange: (lot: InspectionLot, patch: Partial<Pick<InspectionLot, 'scar' | 'scarDue' | 'defect' | 'note'>>) => void
  onRemove: (lot: InspectionLot) => void
}) {
  const [sort, setSort] = useState<{ key: ScarSortKey; dir: 'asc' | 'desc' }>({ key: 'date', dir: 'desc' })
  const [editingId, setEditingId] = useState<string | null>(null)
  const counts = (['none', 'issued', 'action', 'closed'] as ScarStatus[]).map((status) => [status, lots.filter((lot) => lot.scar === status).length] as const)
  const today = todayIso()
  const sorted = [...lots].sort((a, b) => compareScar(a, b, sort.key) * (sort.dir === 'asc' ? 1 : -1) || b.date.localeCompare(a.date) || b.id.localeCompare(a.id))
  const toggleSort = (key: string) => {
    if (!(SCAR_SORT_KEYS as readonly string[]).includes(key)) return
    const sortKey = key as ScarSortKey
    setSort((current) => current.key === sortKey
      ? { key: sortKey, dir: current.dir === 'asc' ? 'desc' : 'asc' }
      : { key: sortKey, dir: sortKey === 'date' ? 'desc' : 'asc' })
  }
  if (delivery) {
    const actionCounts = (['none', 'issued', 'action', 'closed'] as ScarStatus[]).map((status) => [status, lots.filter((lot) => lot.scar === status).length] as const)
    return (
      <div className="space-y-4">
        <section className="grid min-w-0 rounded-2xl border bg-card shadow-sm sm:grid-cols-4">
          {actionCounts.map(([status, count]) => (
            <Metric key={status} label={DELIVERY_ACTION_LABEL[status]} value={String(count)} unit="건" tone={status === 'none' && count ? 'rose' : status === 'closed' && count ? 'green' : undefined} />
          ))}
        </section>
        <Card title="지연사유 · 조치" aside={<span className="text-xs text-muted-foreground">{lots.length.toLocaleString('ko-KR')}건</span>}>
          {lots.length === 0 ? (
            <Empty text="지연된 납품이 없습니다." />
          ) : (
            <div className="overflow-x-auto">
              <Table
                heads={['납품일', '약속납기', '업체', '품목', '지연 사유', '조치', '']}
                align={['left', 'left', 'left', 'left', 'left', 'left', 'right']}
                sort={{ active: sort.key, dir: sort.dir, keys: ['date', 'due', 'vendor', 'product', 'defect', 'scar', null], onSort: toggleSort }}
              >
                {sorted.map((lot) => {
                  const editing = canManage && editingId === lot.id
                  return (
                    <tr key={lot.id} className="border-b last:border-0">
                      <td className="whitespace-nowrap py-2 pr-3 tabular-nums">{dot(lot.date)}</td>
                      <td className="whitespace-nowrap py-2 pr-3 tabular-nums font-medium text-rose-600">{lot.scarDue ? dot(lot.scarDue) : '—'}</td>
                      <td className="py-2 pr-3 font-medium">{lot.vendor}</td>
                      <td className="py-2 pr-3">{lot.product || '—'}</td>
                      <td className="max-w-[14rem] py-2 pr-3">
                        {editing ? (
                          <input
                            aria-label="지연 사유"
                            value={lot.defect}
                            onChange={(event) => onChange(lot, { defect: event.target.value })}
                            className={cn(FIELD, 'h-8 w-full min-w-[10rem] text-[13px]')}
                          />
                        ) : (
                          <span className="block truncate text-muted-foreground">{lot.defect || lot.note || '—'}</span>
                        )}
                      </td>
                      <td className="py-2 pr-3">
                        {editing ? (
                          <Select value={lot.scar} onValueChange={(value) => value && onChange(lot, { scar: value as ScarStatus })}>
                            <SelectTrigger aria-label="조치 상태" className="h-8 min-w-[6.5rem] bg-card">
                              <span>{DELIVERY_ACTION_LABEL[lot.scar]}</span>
                            </SelectTrigger>
                            <SelectContent align="start">
                              <SelectGroup>
                                {(Object.keys(DELIVERY_ACTION_LABEL) as ScarStatus[]).map((status) => (
                                  <SelectItem key={status} value={status}>{DELIVERY_ACTION_LABEL[status]}</SelectItem>
                                ))}
                              </SelectGroup>
                            </SelectContent>
                          </Select>
                        ) : (
                          <span className="text-[13px]">{DELIVERY_ACTION_LABEL[lot.scar]}</span>
                        )}
                      </td>
                      <td className="py-2 text-right">
                        {canManage && (
                          <span className="inline-flex gap-1">
                            <Button variant="ghost" size="icon-sm" aria-label="수정" aria-pressed={editing} onClick={() => setEditingId(editing ? null : lot.id)}><Pencil /></Button>
                            <Button variant="ghost" size="icon-sm" aria-label="삭제" onClick={() => onRemove(lot)}><Trash2 /></Button>
                          </span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </Table>
            </div>
          )}
        </Card>
      </div>
    )
  }
  return (
    <div className="space-y-4">
      <section className="grid min-w-0 rounded-2xl border bg-card shadow-sm sm:grid-cols-4">
        {counts.map(([status, count]) => (
          <Metric key={status} label={`SCAR ${SCAR_LABEL[status]}`} value={String(count)} unit="건" tone={status === 'none' && count ? 'rose' : undefined} />
        ))}
      </section>
      <Card title={customer ? '고객 부적합 · 조치' : '불합격 LOT · 시정조치(SCAR)'} aside={customer ? <span className="text-xs text-muted-foreground">조치는 부적합관리에서 바뀝니다</span> : undefined}>
        {lots.length === 0 ? (
          <Empty text={customer ? '등록된 고객부적합이 없습니다.' : '불합격 LOT가 없습니다.'} />
        ) : (
          <div className="overflow-x-auto">
            <Table
              heads={['검사일', '업체명', '품목', '불량 내용', 'SCAR 상태', '조치 기한', '']}
              align={['left', 'left', 'left', 'left', 'left', 'left', 'right']}
              sort={{ active: sort.key, dir: sort.dir, keys: SCAR_SORT_KEYS, onSort: toggleSort }}
            >
              {sorted.map((lot) => {
                const late = lot.scarDue && lot.scar !== 'closed' && lot.scarDue < today
                const editing = canManage && editingId === lot.id
                return (
                  <tr key={lot.id} className="border-b last:border-0">
                    <td className="whitespace-nowrap py-2 pr-3 tabular-nums">{dot(lot.date)}</td>
                    <td className="py-2 pr-3 font-medium">{lot.vendor}</td>
                    <td className="py-2 pr-3">{lot.product || '—'}</td>
                    <td className="max-w-[14rem] truncate py-2 pr-3">{lot.defect || '—'}</td>
                    <td className="py-2 pr-3">
                      {editing ? (
                        <Select value={lot.scar} onValueChange={(value) => value && onChange(lot, { scar: value as ScarStatus })}>
                          <SelectTrigger aria-label="SCAR 상태" className="h-8 min-w-[6.5rem] bg-card">
                            <span>{SCAR_LABEL[lot.scar]}</span>
                          </SelectTrigger>
                          <SelectContent align="start">
                            <SelectGroup>
                              {(Object.keys(SCAR_LABEL) as ScarStatus[]).map((status) => (
                                <SelectItem key={status} value={status}>{SCAR_LABEL[status]}</SelectItem>
                              ))}
                            </SelectGroup>
                          </SelectContent>
                        </Select>
                      ) : (
                        <span className="text-[13px]">{SCAR_LABEL[lot.scar]}</span>
                      )}
                    </td>
                    <td className="py-2 pr-3">
                      {editing ? (
                        <input
                          type="date"
                          aria-label="조치 기한"
                          value={lot.scarDue}
                          onChange={(event) => onChange(lot, { scarDue: event.target.value })}
                          className={cn(FIELD, 'h-8 w-[9.5rem] text-[13px]', late && 'border-rose-300 text-rose-600')}
                        />
                      ) : (
                        <span className={cn('text-[13px] tabular-nums', late && 'font-medium text-rose-600')}>{lot.scarDue ? dot(lot.scarDue) : '—'}</span>
                      )}
                    </td>
                    <td className="py-2 text-right">
                      {canManage && (
                        <span className="inline-flex gap-1">
                          <Button variant="ghost" size="icon-sm" aria-label="수정" aria-pressed={editing} onClick={() => setEditingId(editing ? null : lot.id)}><Pencil /></Button>
                          <Button variant="ghost" size="icon-sm" aria-label="삭제" onClick={() => onRemove(lot)}><Trash2 /></Button>
                        </span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </Table>
          </div>
        )}
      </Card>
    </div>
  )
}

function VendorTab({ rows, target, certificates = false, customer = false, delivery = false }: { rows: PeriodStat[]; target: number; certificates?: boolean; customer?: boolean; delivery?: boolean }) {
  const max = Math.max(target * 2, ...rows.map((row) => row.rate), 1)
  const higherGoal = customer || delivery
  return (
    <Card title={customer ? '업체별 회신율' : delivery ? '업체별 납기준수율' : '업체별 불량률'} aside={<span className="text-xs text-muted-foreground">{higherGoal ? `목표 ${target}% 이상` : `목표 ${target}% 이하`}</span>}>
      {rows.length === 0 ? (
        <Empty text={customer ? '접수된 업체가 없습니다.' : delivery ? '납품 기록이 있는 업체가 없습니다.' : certificates ? '출하검사 실적이 있는 업체가 없습니다.' : '검사한 업체가 없습니다.'} />
      ) : (
        <Table heads={customer ? ['업체명', '접수', '조치완료', '회신율', '판정'] : delivery ? ['업체명', '납품', '지연', '준수율', '판정'] : ['업체명', certificates ? '출하검사 실적' : '검사 LOT', certificates ? '불량 건수' : '불량 LOT', '불량률', '판정']} align={['left', 'right', 'right', 'left', 'right']}>
          {rows.map((row) => (
            <tr key={row.key} className="border-b last:border-0">
              <td className="py-2.5 pr-3 font-medium">{row.label}</td>
              <td className="py-2.5 pr-3 text-right tabular-nums">{row.inspected}</td>
              <td className="py-2.5 pr-3 text-right tabular-nums">{row.defect}</td>
              <td className="w-[40%] py-2.5 pr-3">
                <div className="relative flex items-center gap-3">
                  <span className="relative h-2 flex-1 rounded-full bg-muted">
                    <span className={cn('absolute inset-y-0 left-0 rounded-full', row.ok === false ? 'bg-rose-500' : 'bg-blue-500')} style={{ width: `${(row.rate / max) * 100}%` }} />
                    <span className="absolute -top-1 h-4 w-px bg-rose-400" style={{ left: `${(target / max) * 100}%` }} />
                  </span>
                  <span className="w-14 text-right text-xs tabular-nums">{pct(row.rate)}</span>
                </div>
              </td>
              <td className="py-2.5 text-right"><Verdict ok={row.ok} /></td>
            </tr>
          ))}
        </Table>
      )}
    </Card>
  )
}

function TargetTab({ state, year, canManage, saving, certificates = false, customer = false, delivery = false, workLogs = [], shipmentByMonth = {}, onSave }: { state: KpiState; year: number; canManage: boolean; saving: boolean; certificates?: boolean; customer?: boolean; delivery?: boolean; workLogs?: Floor3WorkLog[]; shipmentByMonth?: Record<string, number>; onSave: (target: number, months: Record<string, number>) => void }) {
  const [target, setTarget] = useState(String(state.target))
  const [overrides, setOverrides] = useState<Record<string, string>>(() =>
    Object.fromEntries(Object.entries(state.monthTargets).map(([key, value]) => [key, String(value)])))
  const [selected, setSelected] = useState<Set<number>>(() => new Set())
  const [bulk, setBulk] = useState('')
  const parsed = Number(target)
  const valid = target.trim() !== '' && Number.isFinite(parsed) && parsed >= 0 && parsed <= 100
  const base = valid ? parsed : state.target
  const MONTH_NUMBERS = Array.from({ length: 12 }, (_, index) => index + 1)
  const keyOf = (month: number) => monthKey(year, month)
  const rateOf = (value: string | undefined) => {
    if (value == null || value.trim() === '') return null
    const number = Number(value)
    return Number.isFinite(number) && number >= 0 && number <= 100 ? number : NaN
  }

  const draftTargets = useMemo(() => {
    const months: Record<string, number> = {}
    for (const [key, value] of Object.entries(overrides)) {
      const number = rateOf(value)
      if (number != null && !Number.isNaN(number) && number !== base) months[key] = number
    }
    return months
  }, [overrides, base])
  const summarizeFor = useMemo(() => (s: KpiState, y: number) => {
    if (delivery) return summarizeDeliveryKpi(s, y, shipmentByMonth)
    if (customer) return summarizeReply(s, y)
    if (certificates) return summarizeOutgoingKpi(s, workLogs, y)
    return summarize(s, y)
  }, [certificates, customer, delivery, shipmentByMonth, workLogs])
  const higherGoal = customer || delivery
  const before = useMemo(() => summarizeFor(state, year), [summarizeFor, state, year])
  const after = useMemo(() => summarizeFor({ ...state, target: base, monthTargets: draftTargets }, year), [summarizeFor, state, year, base, draftTargets])
  const changes = MONTH_NUMBERS.filter((month) => before.months[month - 1].target !== after.months[month - 1].target).length
  const dirty = changes > 0 || base !== state.target
  const today = new Date()
  const remaining = MONTH_NUMBERS.filter((month) => year > today.getFullYear() || (year === today.getFullYear() && month >= today.getMonth() + 1))

  const setMonths = (months: number[], value: string) =>
    setOverrides((current) => ({ ...current, ...Object.fromEntries(months.map((month) => [keyOf(month), value])) }))
  const pick = (months: number[]) => setSelected((current) => {
    const all = months.every((month) => current.has(month))
    const next = new Set(current)
    for (const month of months) {
      if (all) next.delete(month)
      else next.add(month)
    }
    return next
  })
  const toggle = (month: number) => setSelected((current) => {
    const next = new Set(current)
    if (next.has(month)) next.delete(month)
    else next.add(month)
    return next
  })
  const applyBulk = (value: string) => {
    if (selected.size === 0) return
    const number = rateOf(value)
    if (Number.isNaN(number)) return toast.error('0~100 사이 숫자로 입력해 주세요.')
    setMonths([...selected], value)
    setSelected(new Set())
    setBulk('')
  }
  const step = (delta: number) => setTarget((current) => {
    const number = Number(current)
    const next = Math.min(100, Math.max(0, Math.round(((Number.isFinite(number) ? number : state.target) + delta) * 10) / 10))
    return String(next)
  })
  const reset = () => {
    setTarget(String(state.target))
    setOverrides(Object.fromEntries(Object.entries(state.monthTargets).map(([key, value]) => [key, String(value)])))
    setSelected(new Set())
    setBulk('')
  }
  const [dragMonth, setDragMonth] = useState<number | null>(null)
  const [dragScale, setDragScale] = useState<number | null>(null)
  const autoMax = Math.max(
    5,
    Math.ceil(Math.max(state.target, base, ...before.months.map((month) => Math.max(month.rate, month.target)), ...after.months.map((month) => month.target)) * 1.4),
  )
  const scaleMax = dragScale ?? autoMax
  const setFromPointer = (month: number, element: HTMLElement, clientX: number, max: number) => {
    const rect = element.getBoundingClientRect()
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / Math.max(1, rect.width)))
    const value = Math.round(ratio * max * 10) / 10
    setMonths([month], value === base ? '' : String(value))
  }
  const startDrag = (month: number, event: PointerEvent<HTMLElement>) => {
    if (!canManage || event.button !== 0) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    setDragMonth(month)
    setDragScale(scaleMax)
    setFromPointer(month, event.currentTarget, event.clientX, scaleMax)
  }
  const moveDrag = (month: number, event: PointerEvent<HTMLElement>) => {
    if (dragMonth !== month || dragScale == null) return
    setFromPointer(month, event.currentTarget, event.clientX, dragScale)
  }
  const endDrag = () => {
    setDragMonth(null)
    setDragScale(null)
  }
  const nudge = (month: number, current: number, event: KeyboardEvent<HTMLElement>) => {
    const delta = event.key === 'ArrowRight' || event.key === 'ArrowUp' ? 1 : event.key === 'ArrowLeft' || event.key === 'ArrowDown' ? -1 : 0
    if (!canManage || delta === 0) return
    event.preventDefault()
    const value = Math.min(100, Math.max(0, Math.round((current + delta * (event.shiftKey ? 1 : 0.1)) * 10) / 10))
    setMonths([month], value === base ? '' : String(value))
  }

  const focusNext = (month: number) => {
    const next = document.querySelector<HTMLInputElement>(`[data-target-month="${month + 1}"]`)
    next?.focus()
    next?.select()
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!valid) return toast.error('기본 목표는 0~100 사이 숫자로 입력해 주세요.')
    const months: Record<string, number> = {}
    for (const [key, value] of Object.entries(overrides)) {
      if (value.trim() === '') continue
      const number = Number(value)
      if (!Number.isFinite(number) || number < 0 || number > 100) return toast.error(`${Number(key.slice(5))}월 목표를 확인해 주세요.`)
      if (number !== parsed) months[key] = number
    }
    onSave(parsed, months)
  }

  return (
    <form onSubmit={submit} className="grid gap-4">
      <section className="grid min-w-0 overflow-x-auto rounded-xl border bg-card shadow-sm md:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
        <div className="px-4 py-3">
          <p className="text-[13px] font-semibold text-muted-foreground">{delivery ? '연간 기본 목표 · 납기준수율' : customer ? '연간 기본 목표 · 회신율' : certificates ? '연간 기본 목표 · 불량률' : '연간 기본 목표 · LOT 불량률'}</p>
          <div className="mt-2 flex items-center gap-1.5">
            <button type="button" aria-label="목표 0.1 내리기" disabled={!canManage} onClick={() => step(-0.1)} className="flex h-9 w-9 items-center justify-center rounded-lg border text-lg font-bold text-muted-foreground hover:bg-muted disabled:opacity-40">−</button>
            <span className="flex h-9 items-center gap-1 rounded-lg border bg-background px-2.5 focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/30">
              <input
                id="kpi-target"
                aria-label="연간 기본 목표"
                inputMode="decimal"
                value={target}
                disabled={!canManage}
                onChange={(event) => setTarget(event.target.value.replace(/[^\d.]/g, ''))}
                className="w-14 bg-transparent text-right text-xl font-bold tabular-nums outline-none"
              />
              <span className="text-sm font-semibold text-muted-foreground">{higherGoal ? '% 이상' : '% 이하'}</span>
            </span>
            <button type="button" aria-label="목표 0.1 올리기" disabled={!canManage} onClick={() => step(0.1)} className="flex h-9 w-9 items-center justify-center rounded-lg border text-lg font-bold text-muted-foreground hover:bg-muted disabled:opacity-40">+</button>
          </div>
          {canManage && (
            <div className="mt-2 flex flex-wrap gap-1">
              {(delivery ? ['90', '92', '95', '98', '100'] : higherGoal ? ['80', '85', '90', '95', '100'] : ['0.5', '1', '1.5', '2', '3', '5']).map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setTarget(value)}
                  className={cn('h-7 rounded-full border px-2.5 text-xs font-semibold transition-colors', String(parsed) === value ? 'border-primary bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground')}
                >
                  {value}%
                </button>
              ))}
            </div>
          )}
          <p className="mt-2 text-xs leading-5 text-muted-foreground">따로 정하지 않은 달은 이 값으로 판정합니다. {delivery ? '준수 건 ÷ 납품 건이 목표 이상이면 달성입니다.' : customer ? '조치완료 ÷ 접수가 목표 이상이면 달성입니다.' : certificates ? '작업일보 불량수량 ÷ 성적서 출하수량이 목표 이하이면 달성입니다.' : '불량 LOT ÷ 검사 LOT가 목표 이하이면 달성입니다.'}</p>
        </div>
        <div className="grid grid-cols-2 border-t bg-muted/30 md:border-l md:border-t-0">
          <PreviewStat label="목표 달성" before={`${before.achieved} / ${before.judged}`} after={`${after.achieved} / ${after.judged}`} unit="개월" changed={before.achieved !== after.achieved} />
          <PreviewStat label="연간 판정" before={before.total.ok == null ? '—' : before.total.ok ? '달성' : '미달'} after={after.total.ok == null ? '—' : after.total.ok ? '달성' : '미달'} changed={before.total.ok !== after.total.ok} note={after.total.inspected ? `실적 ${after.total.rate.toFixed(3)}%` : (customer ? '접수 없음' : delivery ? '납품 없음' : '검사 없음')} />
        </div>
      </section>

      <Card
        title={`${year}년 월별 목표`}
        aside={canManage ? (
          <div className="flex flex-wrap items-center justify-end gap-2">
            {dirty && (
              <span className="mr-1 hidden text-xs text-muted-foreground lg:inline">
                달성 {before.achieved}/{before.judged} → {after.achieved}/{after.judged}개월
              </span>
            )}
            <Button type="button" variant="outline" size="sm" onClick={() => setMonths(MONTH_NUMBERS, '')}>
              모두 기본으로
            </Button>
            {dirty && (
              <Button type="button" variant="ghost" size="sm" onClick={reset}>
                취소
              </Button>
            )}
            <Button type="submit" size="sm" disabled={!dirty || saving}>
              {saving ? '저장 중…' : '저장'}
            </Button>
          </div>
        ) : undefined}
      >
        {canManage && (
          <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border bg-muted/30 px-3 py-2">
            <span className="text-xs font-semibold text-muted-foreground">빠른 선택</span>
            {[
              ['전체', MONTH_NUMBERS],
              ['1분기', [1, 2, 3]],
              ['2분기', [4, 5, 6]],
              ['3분기', [7, 8, 9]],
              ['4분기', [10, 11, 12]],
              ['남은 달', remaining],
            ].map(([label, months]) => {
              const list = months as number[]
              const on = list.length > 0 && list.every((month) => selected.has(month))
              return (
                <button
                  key={label as string}
                  type="button"
                  disabled={list.length === 0}
                  onClick={() => pick(list)}
                  className={cn('h-7 rounded-full border px-3 text-xs font-semibold transition-colors disabled:opacity-40', on ? 'border-primary bg-primary/10 text-primary' : 'bg-card text-muted-foreground hover:text-foreground')}
                >
                  {label as string}
                </button>
              )
            })}
            {selected.size > 0 && (
              <div className="ml-auto flex items-center gap-2">
                <span className="text-xs font-semibold text-primary">{selected.size}개월 선택</span>
                <span className="flex h-8 items-center gap-1 rounded-lg border bg-background px-2">
                  <input
                    aria-label="선택한 달 목표"
                    inputMode="decimal"
                    value={bulk}
                    placeholder={String(base)}
                    onChange={(event) => setBulk(event.target.value.replace(/[^\d.]/g, ''))}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault()
                        applyBulk(bulk)
                      }
                    }}
                    className="w-12 bg-transparent text-right text-sm font-semibold tabular-nums outline-none"
                  />
                  <span className="text-xs text-muted-foreground">%</span>
                </span>
                <Button type="button" size="sm" disabled={bulk.trim() === ''} onClick={() => applyBulk(bulk)}>적용</Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => applyBulk('')}>기본으로</Button>
              </div>
            )}
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-[13px]">
            <thead>
              <tr className="border-b bg-muted/40 text-xs text-muted-foreground">
                {canManage && <th className="w-8 py-3" />}
                <th className="py-3 pr-3 text-left font-medium">월</th>
                <th className="py-3 pr-3 text-right font-medium">
                  <span className="block">{customer ? '접수' : delivery ? '납품' : certificates ? '출하검사 실적' : '검사한 LOT'}</span>
                  <span className="block font-normal text-muted-foreground/70">{customer ? '그 중 조치완료' : delivery ? '그 중 지연' : '그 중 불량'}</span>
                </th>
                <th className="py-3 pr-3 text-left font-medium">
                  <span className="block">{customer ? '실적 회신율' : delivery ? '실적 준수율' : '실적 불량률'}{canManage ? ' · 점을 끌면 목표' : ''}</span>
                  <span className="block font-normal text-muted-foreground/70">색 막대는 실적, 점은 목표</span>
                </th>
                <th className="w-40 py-3 pr-3 text-left font-medium">
                  <span className="block">이 달 목표</span>
                  <span className="block font-normal text-muted-foreground/70">비우면 기본 {base}%</span>
                </th>
                <th className="w-16 py-3 text-right font-medium">판정</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {MONTH_NUMBERS.map((month) => {
                const key = keyOf(month)
                const row = after.months[month - 1]
                const value = overrides[key] ?? ''
                const custom = value.trim() !== '' && rateOf(value) !== base
                const invalid = Number.isNaN(rateOf(value))
                const changed = before.months[month - 1].target !== row.target
                const scale = scaleMax
                const dragging = dragMonth === month
                return (
                  <tr key={key} className={cn('border-b last:border-0', selected.has(month) && 'bg-primary/5')}>
                    {canManage && (
                      <td className="py-1.5">
                        <input type="checkbox" aria-label={`${month}월 선택`} checked={selected.has(month)} onChange={() => toggle(month)} className="h-4 w-4 accent-[oklch(0.52_0.19_258)]" />
                      </td>
                    )}
                    <td className="py-1.5 pr-3 font-semibold">
                      {month}월
                      {changed && <span className="ml-1.5 rounded bg-sky-100 px-1 py-px text-[10px] font-semibold text-sky-700 dark:bg-sky-400/15 dark:text-sky-300">변경</span>}
                    </td>
                    <td className="py-1.5 pr-3 text-right">
                      {row.inspected > 0 ? (
                        <div className="leading-tight" title={customer ? `접수 ${row.inspected}건 중 조치완료 ${row.defect}건` : delivery ? `납품 ${row.inspected}건 중 지연 ${row.defect}건` : `${certificates ? '출하검사 실적' : '검사'} ${row.inspected}건 중 불량 ${row.defect}건`}>
                          <div className="text-foreground"><span className="font-semibold">{row.inspected}</span><span className="ml-1 text-[11px] font-medium text-muted-foreground">{customer || certificates || delivery ? '건' : 'LOT'}</span></div>
                          <div className="text-[11px] text-muted-foreground">{customer ? '조치' : delivery ? '지연' : '불량'} <span className={cn('font-semibold', row.defect > 0 ? 'text-rose-600' : 'text-foreground')}>{row.defect}</span></div>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">{customer ? '접수 없음' : delivery ? '납품 없음' : '검사 없음'}</span>
                      )}
                    </td>
                    <td className="py-1.5 pr-3">
                      <div className="flex items-center gap-2">
                        <span
                          className={cn('relative flex h-7 flex-1 touch-none select-none items-center', canManage && 'cursor-ew-resize')}
                          onPointerDown={(event) => startDrag(month, event)}
                          onPointerMove={(event) => moveDrag(month, event)}
                          onPointerUp={endDrag}
                          onPointerCancel={endDrag}
                        >
                          <span className="relative h-2 w-full rounded-full bg-muted">
                            {row.inspected > 0 && (
                              <span className={cn('absolute inset-y-0 left-0 rounded-full', row.ok === false ? 'bg-rose-500' : 'bg-emerald-500')} style={{ width: `${Math.min(100, (row.rate / scale) * 100)}%` }} />
                            )}
                            <span className="absolute -inset-y-1 w-0.5 -translate-x-1/2 rounded-full bg-slate-700 dark:bg-white" style={{ left: `${Math.min(100, (row.target / scale) * 100)}%` }} />
                          </span>
                          <span
                            role="slider"
                            tabIndex={canManage ? 0 : -1}
                            aria-label={`${month}월 목표`}
                            aria-valuemin={0}
                            aria-valuemax={scale}
                            aria-valuenow={row.target}
                            aria-valuetext={`${row.target}%`}
                            onKeyDown={(event) => nudge(month, row.target, event)}
                            className={cn(
                              'absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 bg-white shadow-sm outline-none transition-[width,height] focus-visible:ring-3 focus-visible:ring-ring/40 dark:bg-slate-900',
                              custom || changed ? 'border-primary' : 'border-slate-700 dark:border-white',
                              dragging && 'h-5 w-5',
                              !canManage && 'hidden',
                            )}
                            style={{ left: `${Math.min(100, (row.target / scale) * 100)}%` }}
                          />
                          {dragging && (
                            <span className="pointer-events-none absolute -top-5 -translate-x-1/2 rounded bg-slate-900 px-1.5 py-0.5 text-[11px] font-semibold text-white dark:bg-white dark:text-slate-900" style={{ left: `${Math.min(100, (row.target / scale) * 100)}%` }}>
                              {row.target}%
                            </span>
                          )}
                        </span>
                        <span className="w-14 text-right leading-tight" title={row.inspected ? (customer ? `회신율 ${formatKpiRate(row.rate)} (조치 ${row.defect} ÷ 접수 ${row.inspected})` : delivery ? `준수율 ${formatKpiRate(row.rate)} (준수 ${row.inspected - row.defect} ÷ 납품 ${row.inspected})` : `실적 불량률 ${formatKpiRateFromParts(row.defect, row.inspected)} (불량 ${row.defect} ÷ 검사 ${row.inspected})`) : (customer ? '접수 없음' : delivery ? '납품 없음' : '검사 없음')}>
                          <span className="block text-[10px] font-medium text-muted-foreground">실적</span>
                          <span className={cn('text-sm font-bold', row.ok === false ? 'text-rose-600' : row.inspected ? 'text-emerald-600' : 'text-muted-foreground')}>{row.inspected ? (customer || delivery ? formatKpiRate(row.rate) : formatKpiRateFromParts(row.defect, row.inspected)) : '—'}</span>
                        </span>
                      </div>
                    </td>
                    <td className="py-1.5 pr-3">
                      <span className={cn(
                        'flex h-8 items-center gap-1 rounded-lg border px-2 focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/30',
                        custom ? 'border-primary/50 bg-primary/5' : 'bg-background',
                        invalid && 'border-rose-400',
                      )}>
                        <input
                          data-target-month={month}
                          aria-label={`${month}월 목표`}
                          inputMode="decimal"
                          value={value}
                          placeholder={`${base}`}
                          disabled={!canManage}
                          onChange={(event) => setMonths([month], event.target.value.replace(/[^\d.]/g, ''))}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter' || event.key === 'ArrowDown') {
                              event.preventDefault()
                              focusNext(month)
                            }
                            if (event.key === 'ArrowUp') {
                              event.preventDefault()
                              focusNext(month - 2)
                            }
                          }}
                          className="w-full min-w-0 bg-transparent text-right text-sm font-semibold outline-none placeholder:font-normal placeholder:text-muted-foreground/60"
                        />
                        <span className="text-xs text-muted-foreground">%</span>
                        {custom ? (
                          canManage && <button type="button" aria-label={`${month}월 기본 목표로`} onClick={() => setMonths([month], '')} className="ml-0.5 rounded px-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground">×</button>
                        ) : (
                          <span className="ml-0.5 shrink-0 whitespace-nowrap rounded bg-muted px-1 text-[10px] font-semibold text-muted-foreground">기본</span>
                        )}
                      </span>
                    </td>
                    <td className="py-1.5 text-right"><Verdict ok={row.ok} compact /></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span>실적 % = {delivery ? '준수 건 ÷ 납품 건' : customer ? '조치완료 ÷ 접수' : certificates ? '불량수량 ÷ 출하수량' : '불량 LOT ÷ 검사 LOT'}</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-2 w-4 rounded-full bg-emerald-500" />{higherGoal ? '실적이 목표 이상 · 달성' : '실적이 목표 이하 · 달성'}</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-2 w-4 rounded-full bg-rose-500" />{higherGoal ? '실적이 목표보다 낮음 · 미달' : '실적이 목표보다 높음 · 미달'}</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded-full border-2 border-slate-700 bg-white dark:border-white dark:bg-slate-900" />점 = 목표{canManage ? ', 끌어서 조정' : ''}</span>
        </p>
      </Card>
    </form>
  )
}

function quantityOutcome(lots: InspectionLot[]) {
  const producedQty = lots.reduce((sum, lot) => sum + (Number.isFinite(lot.quantity) ? lot.quantity : 0), 0)
  const defectQty = lots.filter((lot) => lot.result === 'fail').reduce((sum, lot) => sum + (Number.isFinite(lot.quantity) ? lot.quantity : 0), 0)
  const produced = producedQty > 0 ? producedQty : lots.length
  const defect = producedQty > 0 ? defectQty : lots.filter((lot) => lot.result === 'fail').length
  const rate = produced > 0 ? (defect / produced) * 100 : null
  return { produced, defect, rate }
}

function formatQty(value: number) {
  return value.toLocaleString('ko-KR', { maximumFractionDigits: 1 })
}

function rateAxisMax(peak: number) {
  const padded = Math.max(peak * 1.15 + 0.3, peak + 0.8)
  if (padded <= 6) return Math.max(4, Math.ceil(padded))
  if (padded <= 15) return Math.ceil(padded / 3) * 3
  if (padded <= 40) return Math.ceil(padded / 5) * 5
  if (padded <= 75) return Math.ceil(padded / 15) * 15
  return 100
}

function rateChartAxis(months: PeriodStat[], higherBetter = false) {
  const active = months.filter((month) => month.inspected)
  const rates = active.map((month) => month.rate)
  if (!rates.length) return { min: 0, max: 100, ticks: [0, 25, 50, 75, 100] }

  if (higherBetter) {
    const minRate = Math.min(...rates)
    const min = Math.max(0, Math.min(85, Math.floor(minRate / 5) * 5 - 5))
    const max = 100
    const step = (max - min) / 4
    const ticks = [0, 1, 2, 3, 4].map((index) => (index === 4 ? max : Math.round(min + step * index)))
    return { min, max, ticks }
  }

  const peak = Math.max(...rates, ...active.map((month) => month.target))
  const max = rateAxisMax(peak)
  const min = 0
  const step = max / 4
  const ticks = [0, 1, 2, 3, 4].map((index) => {
    const value = index === 4 ? max : step * index
    return Math.round(value * 10) / 10
  })
  return { min, max, ticks }
}

type StandardCloseReportData = {
  variant: 'inspection' | 'customer' | 'process'
  certificates: boolean
  months: PeriodStat[]
  total: PeriodStat
  quarters: PeriodStat[]
  halves: PeriodStat[]
  judged: number
  achieved: number
  zeroMonths?: number
  /** 고객부적합: 조치(완료+진행) 건수 */
  actionTotal?: number
  /** 고객부적합: 접수 없었던 달(연간·경과 월 기준) */
  noNcMonths?: number
  /** 출하검사: 월별 출하 수량(단위별) */
  shipped?: ReturnType<typeof quantityByMonth>
  /** 공정: 판정 월 중 최고·최저 불량률 */
  processRateHigh?: { label: string; rate: number }
  processRateLow?: { label: string; rate: number }
  processLotCount?: number
}

type PeriodLine = { key: string; label: string; counts: (number | null)[]; rate: number | null; target: number; ok: boolean | null }

function lineRateText(line: PeriodLine) {
  if (line.rate == null) return '—'
  if (line.counts.length > 2) return formatKpiRate(line.rate)
  const base = line.counts[0]
  const defect = line.counts[1]
  if (base != null && base > 0 && defect != null) return formatKpiRateFromParts(defect, base)
  return formatKpiRate(line.rate)
}

function periodLine(row: PeriodStat, options?: { outgoing?: boolean }): PeriodLine {
  if (options?.outgoing) {
    const base = row.rateBase ?? 0
    const hasRate = base > 0
    return {
      key: row.key,
      label: row.label,
      counts: [hasRate ? base : null, hasRate || row.defect > 0 ? row.defect : null],
      rate: hasRate ? row.rate : null,
      target: row.target,
      ok: row.ok,
    }
  }
  const has = row.inspected > 0
  return { key: row.key, label: row.label, counts: [has ? row.inspected : null, has ? row.defect : null], rate: has ? row.rate : null, target: row.target, ok: row.ok }
}

function aggregateProcessPeriod(slice: PeriodStat[], key: string, label: string): PeriodStat {
  const produced = slice.reduce((sum, month) => sum + month.inspected, 0)
  const defect = slice.reduce((sum, month) => sum + month.defect, 0)
  const rate = produced > 0 ? (defect / produced) * 100 : 0
  const target = Math.min(...slice.map((month) => month.target))
  return { key, label, inspected: produced, defect, rate, target, ok: produced > 0 ? rate <= target : null }
}

function buildStandardCloseReport(input: {
  kind: KpiKind
  state: KpiState
  year: number
  certificates: boolean
  summary: ReturnType<typeof summarize>
}): StandardCloseReportData {
  const { kind, state, year, certificates, summary } = input
  if (kind === 'customer') {
    const reply = summarizeReply(state, year)
    const replied = reply.lots.filter((lot) => lot.scar === 'closed').length
    const acting = reply.lots.filter((lot) => lot.scar === 'action').length
    const elapsedMonths = year < new Date().getFullYear() ? 12 : year > new Date().getFullYear() ? 0 : new Date().getMonth() + 1
    const noNcMonths = reply.months.slice(0, elapsedMonths).filter((month) => month.inspected === 0).length
    return {
      variant: 'customer',
      certificates: false,
      months: reply.months,
      quarters: reply.quarters,
      halves: reply.halves,
      total: { ...reply.total, label: '누계' },
      judged: reply.judged,
      achieved: reply.achieved,
      actionTotal: replied + acting,
      noNcMonths,
    }
  }
  if (kind === 'process') {
    const lots = summary.lots
    const months = summary.months.map((month) => {
      const outcome = quantityOutcome(lots.filter((lot) => lot.date.startsWith(month.key)))
      const rate = outcome.rate ?? 0
      return {
        key: month.key,
        label: month.label,
        inspected: outcome.produced,
        defect: outcome.defect,
        rate,
        target: month.target,
        ok: outcome.rate == null ? null : outcome.rate <= month.target,
      }
    })
    const quarters = [0, 1, 2, 3].map((quarter) => aggregateProcessPeriod(months.slice(quarter * 3, quarter * 3 + 3), `Q${quarter + 1}`, `${quarter + 1}분기`))
    const halves = [0, 1].map((half) => aggregateProcessPeriod(months.slice(half * 6, half * 6 + 6), half === 0 ? 'H1' : 'H2', half === 0 ? '상반기' : '하반기'))
    const totalOutcome = quantityOutcome(lots)
    const total: PeriodStat = {
      key: String(year),
      label: '누계',
      inspected: totalOutcome.produced,
      defect: totalOutcome.defect,
      rate: totalOutcome.rate ?? 0,
      target: summary.total.target,
      ok: totalOutcome.rate == null ? null : totalOutcome.rate <= summary.total.target,
    }
    const judgedMonths = months.filter((month) => month.ok != null)
    const judged = judgedMonths.length
    const achieved = judgedMonths.filter((month) => month.ok).length
    const ranked = [...judgedMonths].sort((a, b) => a.rate - b.rate)
    const low = ranked[0]
    const high = ranked[ranked.length - 1]
    return {
      variant: 'process',
      certificates: false,
      months,
      quarters,
      halves,
      total,
      judged,
      achieved,
      processLotCount: lots.length,
      processRateLow: low ? { label: low.label, rate: low.rate } : undefined,
      processRateHigh: high ? { label: high.label, rate: high.rate } : undefined,
    }
  }
  return {
    variant: 'inspection',
    certificates,
    months: summary.months,
    quarters: summary.quarters,
    halves: summary.halves,
    total: { ...summary.total, label: '누계' },
    judged: summary.judged,
    achieved: summary.achieved,
    zeroMonths: summary.zeroMonths,
    ...(certificates ? { shipped: quantityByMonth(summary.lots) } : {}),
  }
}

type QuantityBucket = { Kg: number; EA: number; R: number }

function quantityByMonth(lots: InspectionLot[]) {
  const byMonth = new Map<string, QuantityBucket>()
  const total: QuantityBucket = { Kg: 0, EA: 0, R: 0 }
  for (const lot of lots) {
    const unit = lot.unit === 'EA' || lot.unit === 'R' ? lot.unit : 'Kg'
    const key = lot.date.slice(0, 7)
    const bucket = byMonth.get(key) ?? { Kg: 0, EA: 0, R: 0 }
    bucket[unit] += lot.quantity
    total[unit] += lot.quantity
    byMonth.set(key, bucket)
  }
  return { byMonth, total }
}

const QUANTITY_UNITS = ['Kg', 'EA', 'R'] as const
type QuantityUnit = (typeof QUANTITY_UNITS)[number]

function shippedUnits(shipped: ReturnType<typeof quantityByMonth>) {
  return QUANTITY_UNITS.filter((unit) => shipped.total[unit] > 0)
}

/** 데이터가 있는 달이 가장 많은 단위 */
function defaultShipUnit(shipped: ReturnType<typeof quantityByMonth>): QuantityUnit {
  const units = shippedUnits(shipped)
  if (!units.length) return 'Kg'
  const monthsWith = (unit: QuantityUnit) => [...shipped.byMonth.values()].filter((bucket) => bucket[unit] > 0).length
  return [...units].sort((a, b) => monthsWith(b) - monthsWith(a))[0]
}

function quantityLines(bucket?: QuantityBucket) {
  if (!bucket) return [{ amount: '0', unit: '' }]
  const parts = (['Kg', 'EA', 'R'] as const)
    .filter((unit) => bucket[unit] > 0)
    .map((unit) => ({
      amount: bucket[unit].toLocaleString('ko-KR', { maximumFractionDigits: 1 }),
      unit,
    }))
  return parts.length ? parts : [{ amount: '0', unit: '' }]
}

function KpiRateBarChart({ months, target, customer = false, process = false, delivery = false, certificates = false }: {
  months: PeriodStat[]
  target: number
  customer?: boolean
  process?: boolean
  delivery?: boolean
  certificates?: boolean
}) {
  const higherBetter = customer || delivery
  const axis = useMemo(() => rateChartAxis(months, higherBetter), [months, higherBetter])
  const chartData = useMemo(
    () => months.map((month) => {
      if (!month.inspected) return { ...month, rate: null, barRate: null }
      const barRate = month.rate === 0 ? Math.max(axis.min + (axis.max - axis.min) * 0.02, 0.12) : month.rate
      return { ...month, rate: month.rate, barRate }
    }),
    [months, axis.max, axis.min],
  )
  return (
    <ChartContainer config={{ rate: { label: '실적', color: '#2563eb' } }} className={KPI_RATE_BAR_CHART_CLASS}>
      <BarChart data={chartData} barCategoryGap="24%" margin={{ top: 28, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 12 }} height={20} />
        <YAxis
          domain={[axis.min, axis.max]}
          ticks={axis.ticks}
          padding={{ top: 8, bottom: 0 }}
          tickLine={false}
          axisLine={false}
          width={44}
          tick={{ fontSize: 11 }}
          tickFormatter={(value) => `${value}%`}
        />
        <ReferenceLine y={target} stroke="#94a3b8" strokeDasharray="5 5" strokeWidth={1.5} />
        <ChartTooltip
          cursor={{ fill: 'rgba(37, 99, 235, 0.06)' }}
          content={({ active, payload }) => (
            <MonthTip
              active={active}
              row={payload?.[0]?.payload as PeriodStat | undefined}
              customer={customer}
              process={process}
              certificates={certificates}
              delivery={delivery}
            />
          )}
        />
        <Bar dataKey="barRate" name="rate" maxBarSize={28} radius={[4, 4, 0, 0]} isAnimationActive={false}>
          {months.map((month) => (
            <Cell
              key={month.key}
              fill={!month.inspected ? 'transparent' : month.ok ? '#16a34a' : month.ok === false ? '#e11d48' : '#2563eb'}
            />
          ))}
          <LabelList
            dataKey="rate"
            position="top"
            content={(props) => {
              const { x, y, width, index } = props
              const row = chartData[index ?? -1]
              if (x == null || y == null || width == null || !row?.inspected || row.rate == null) return null
              return (
                <text x={Number(x) + Number(width) / 2} y={Number(y) - 6} textAnchor="middle" className="fill-slate-600 text-[11px] font-semibold">
                  {formatKpiRate(row.rate)}
                </text>
              )
            }}
          />
        </Bar>
      </BarChart>
    </ChartContainer>
  )
}

function formatShipQuantity(value: number) {
  return value.toLocaleString('ko-KR', { maximumFractionDigits: 1 })
}

function formatOutgoingRate(rate: number, defect?: number, base?: number) {
  if (defect != null && base != null && base > 0) return formatKpiRateFromParts(defect, base)
  return formatKpiRate(rate)
}

function OutgoingRateBarLabel(
  props: { x?: number | string; y?: number | string; width?: number | string; height?: number | string; index?: number },
  rows: { rate: number | null; ok: boolean | null; defect: number; rateBase: number }[],
) {
  const { x, y, width, height, index } = props
  const row = rows[index ?? -1]
  if (x == null || y == null || width == null || row?.rate == null) return null
  const cx = Number(x) + Number(width) / 2
  const barH = Number(height ?? 0)
  const lift = barH < 16 ? 28 : 14
  const cy = Number(y) - lift
  const label = formatOutgoingRate(row.rate, row.defect, row.rateBase)
  const failed = row.ok === false
  const stroke = failed ? '#fb7185' : '#4ade80'
  const fill = failed ? '#be123c' : '#15803d'
  const pillW = Math.max(44, label.length * 7 + 14)
  return (
    <g pointerEvents="none">
      <rect x={cx - pillW / 2} y={cy - 15} width={pillW} height={18} rx={5} fill="white" stroke={stroke} strokeWidth={1.25} className="dark:fill-slate-900" />
      <text x={cx} y={cy - 3} textAnchor="middle" fontSize={12} fontWeight={700} fill={fill}>
        {label}
      </text>
    </g>
  )
}

function OutgoingMonthTip({
  active,
  row,
  target,
  showKg,
  showEa,
}: {
  active?: boolean
  row?: {
    label: string
    rate: number | null
    ok: boolean | null
    rateBase: number
    defect: number
    Kg: number | null
    EA: number | null
  }
  target: number
  showKg: boolean
  showEa: boolean
}) {
  if (!active || !row) return null
  if (row.Kg == null && row.rate == null) return null
  const failed = row.ok === false
  return (
    <div className="min-w-[12rem] overflow-hidden rounded-xl border border-border/60 bg-popover text-popover-foreground shadow-xl">
      <div className="flex items-center justify-between gap-2 border-b bg-muted/50 px-3 py-2">
        <span className="text-sm font-bold text-foreground">{row.label}월</span>
        {row.rate != null && (
          <span
            className={cn(
              'rounded-full px-2 py-0.5 text-[10px] font-bold',
              failed ? 'bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300' : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300',
            )}
          >
            {failed ? '미달' : '달성'}
          </span>
        )}
      </div>
      <div className="space-y-2.5 px-3 py-2.5 text-xs">
        {row.rate != null && (
          <div>
            <p className="text-[10px] font-semibold text-muted-foreground">불량률</p>
            <p className={cn('text-xl font-bold tabular-nums leading-tight', failed ? 'text-rose-600' : 'text-emerald-600')}>
              {formatOutgoingRate(row.rate, row.defect, row.rateBase)}
            </p>
            <p className="mt-0.5 text-[11px] font-medium text-muted-foreground">목표 {target}% 이하 · {gapText(row.rate, target)}</p>
          </div>
        )}
        <dl className="grid grid-cols-[3.5rem_1fr] gap-x-2 gap-y-1 border-t border-border/50 pt-2">
          <dt className="text-muted-foreground">출하</dt>
          <dd className="text-right font-semibold tabular-nums">{formatQty(row.rateBase)}</dd>
          <dt className="text-muted-foreground">불량</dt>
          <dd className={cn('text-right font-semibold tabular-nums', row.defect > 0 && 'text-rose-600')}>{formatQty(row.defect)}</dd>
          {showKg && row.Kg != null && (row.Kg ?? 0) > 0 && (
            <>
              <dt className="text-blue-600 dark:text-blue-400">Kg</dt>
              <dd className="text-right font-semibold tabular-nums text-blue-700 dark:text-blue-300">{formatShipQuantity(row.Kg)}</dd>
            </>
          )}
          {showEa && row.EA != null && (row.EA ?? 0) > 0 && (
            <>
              <dt className="text-violet-600 dark:text-violet-400">EA</dt>
              <dd className="text-right font-semibold tabular-nums text-violet-700 dark:text-violet-300">{formatShipQuantity(row.EA)}</dd>
            </>
          )}
        </dl>
      </div>
    </div>
  )
}

function OutgoingKpiVisual({ year, months, shipped, target, className }: {
  year: number
  months: PeriodStat[]
  shipped: ReturnType<typeof quantityByMonth>
  target: number
  className?: string
}) {
  type OutgoingChartRow = {
    key: string
    label: string
    Kg: number | null
    EA: number | null
    rate: number | null
    ok: boolean | null
    inspected: number
    defect: number
    rateBase: number
  }
  const shipChart = useMemo((): OutgoingChartRow[] => months.map((month) => {
    const upcoming = kpiMonthNotYetArrived(year, month.key)
    const bucket = shipped.byMonth.get(month.key)
    const rateBase = month.rateBase ?? 0
    const hasShip = !upcoming && ((bucket?.Kg ?? 0) > 0 || (bucket?.EA ?? 0) > 0)
    return {
      key: month.key,
      label: month.label.replace('월', ''),
      Kg: upcoming ? null : (bucket?.Kg ?? 0),
      EA: upcoming ? null : (bucket?.EA ?? 0),
      rate: hasShip || (!upcoming && month.defect > 0) ? month.rate : null,
      ok: upcoming ? null : month.ok,
      inspected: month.inspected,
      defect: month.defect,
      rateBase,
    }
  }), [months, shipped.byMonth, year])
  const showKg = shipChart.some((row) => (row.Kg ?? 0) > 0)
  const showEa = shipChart.some((row) => (row.EA ?? 0) > 0)
  const rateMax = useMemo(() => {
    const rates = shipChart.map((row) => row.rate).filter((value): value is number => value != null)
    return Math.max(target, ...rates, 1) * 1.08
  }, [shipChart, target])
  const axisTick = (value: number) => {
    if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
    if (value >= 10_000) return `${Math.round(value / 1_000)}k`
    return value.toLocaleString('ko-KR', { maximumFractionDigits: 0 })
  }
  return (
    <div className={cn('kpi-close-chart flex h-full min-h-[22rem] w-full min-w-0 flex-col gap-1', className)}>
      <p className="shrink-0 text-[11px] font-medium text-muted-foreground">
        월별 막대 · Kg/EA 출하 · 불량률=불량÷그달 출하량(많은 단위) · 점선=목표 {target}%
      </p>
      <div className="relative min-h-[18rem] flex-1 print:min-h-0">
        <ChartContainer
          config={{
            Kg: { label: 'Kg', color: '#2563eb' },
            EA: { label: 'EA', color: '#8b5cf6' },
            rate: { label: '불량률', color: '#16a34a' },
          }}
          initialDimension={{ width: 960, height: 360 }}
          className={cn(
            KPI_OUTGOING_CHART_CLASS,
            'absolute inset-0 max-w-none !h-full !min-h-[18rem] print:!min-h-0',
          )}
        >
          <ComposedChart data={shipChart} margin={{ top: 36, right: showEa ? 8 : 8, left: 4, bottom: 4 }} barCategoryGap="18%" barGap={2}>
            <CartesianGrid vertical={false} strokeDasharray="3 3" />
            <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 10 }} height={18} />
            <YAxis yAxisId="rate" hide domain={[0, rateMax]} />
            {showKg && (
              <YAxis
                yAxisId="kg"
                tickLine={false}
                axisLine={false}
                width={36}
                tick={{ fontSize: 10 }}
                tickFormatter={axisTick}
              />
            )}
            {showEa && (
              <YAxis
                yAxisId={showKg ? 'ea' : 'kg'}
                orientation={showKg ? 'right' : 'left'}
                tickLine={false}
                axisLine={false}
                width={36}
                tick={{ fontSize: 10 }}
                tickFormatter={axisTick}
              />
            )}
            {!showKg && !showEa && (
              <YAxis
                yAxisId="kg"
                hide
              />
            )}
            <ReferenceLine yAxisId="rate" y={target} stroke="#60a5fa" strokeDasharray="5 5" strokeWidth={1.5} />
            <ChartTooltip
              cursor={{ fill: 'rgba(37, 99, 235, 0.06)' }}
              wrapperStyle={{ outline: 'none' }}
              content={({ active, payload }) => (
                <OutgoingMonthTip
                  active={active}
                  row={payload?.[0]?.payload as OutgoingChartRow | undefined}
                  target={target}
                  showKg={showKg}
                  showEa={showEa}
                />
              )}
            />
            {showKg && (
              <Bar yAxisId="kg" dataKey="Kg" name="출하 Kg" fill="#2563eb" maxBarSize={showEa ? 10 : 18} radius={[3, 3, 0, 0]} isAnimationActive={false} />
            )}
            {showEa && (
              <Bar yAxisId={showKg ? 'ea' : 'kg'} dataKey="EA" name="출하 EA" fill="#8b5cf6" maxBarSize={showKg ? 10 : 18} radius={[3, 3, 0, 0]} isAnimationActive={false} />
            )}
            <Bar yAxisId="rate" dataKey="rate" name="불량률" maxBarSize={14} radius={[4, 4, 0, 0]} isAnimationActive={false}>
              {shipChart.map((row) => (
                <Cell
                  key={row.key}
                  fill={row.rate == null ? 'transparent' : row.ok === false ? '#e11d48' : '#16a34a'}
                />
              ))}
              <LabelList
                dataKey="rate"
                content={(props) => OutgoingRateBarLabel(props, shipChart)}
              />
            </Bar>
          </ComposedChart>
        </ChartContainer>
      </div>
      <p className="shrink-0 text-[10px] leading-tight text-muted-foreground">
        같은 달 막대 = 출하 Kg/EA + 불량률 · %는 막대 위 · 상세는 하단 집계표
      </p>
    </div>
  )
}

function RateBars({ months, target, min, max, ticks }: { months: PeriodStat[]; target: number; min: number; max: number; ticks: number[] }) {
  const span = max - min || 1
  const level = (value: number) => `${Math.min(100, Math.max(0, ((value - min) / span) * 100))}%`
  return (
    <div className="kpi-close-chart flex min-h-[220px] flex-1 gap-2 text-[10px] text-muted-foreground print:min-h-0 print:flex-none">
      <div className="relative w-8 shrink-0 pb-4">
        {ticks.map((tick) => (
          <span key={tick} className="absolute right-0 translate-y-1/2 tabular-nums" style={{ bottom: `calc(1rem + (100% - 1rem) * ${(tick - min) / span})` }}>
            {tick}%
          </span>
        ))}
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="relative flex-1 border-b border-slate-300">
          {ticks.map((tick) => (
            <span key={tick} className="absolute inset-x-0 border-t border-dashed border-slate-200" style={{ bottom: level(tick) }} />
          ))}
          <span className="absolute inset-x-0 z-10 border-t-[1.5px] border-dashed border-slate-500" style={{ bottom: level(Math.min(max, Math.max(min, target))) }} />
          <div className="absolute inset-0 grid grid-cols-12 items-end gap-1 px-1">
            {months.map((month) => (
              <div key={month.key} className="flex h-full flex-col items-center justify-end">
                {month.inspected > 0 && (
                  <>
                    <span className="mb-0.5 whitespace-nowrap text-[9px] font-semibold leading-none text-slate-600">
                      {formatKpiRate(month.rate)}
                    </span>
                    <div
                      className={cn('w-3/5 max-w-7 rounded-t-[3px]', month.ok === false ? 'bg-rose-600' : 'bg-emerald-600')}
                      style={{ height: month.rate === 0 ? '2px' : level(month.rate) }}
                    />
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
        <div className="grid h-4 grid-cols-12 gap-1 px-1">
          {months.map((month) => <span key={month.key} className="text-center leading-4">{month.label}</span>)}
        </div>
      </div>
    </div>
  )
}

function gapTextValue(rate: number, target: number) {
  const gap = Math.round((rate - target) * 1000) / 1000
  return formatKpiRateGap(gap)
}

function DefectGap({ rate, target }: { rate: number; target: number }) {
  const ok = rate <= target
  return <span className={cn('font-semibold', ok ? 'text-emerald-600' : 'text-rose-600')}>{gapTextValue(rate, target)}</span>
}

function StandardCloseReport({ year, data, closed, current, canManage, saving, onToggle, monthlyOnly = false }: {
  year: number
  data: StandardCloseReportData
  closed: Set<string>
  current: string
  canManage: boolean
  saving: boolean
  onToggle: (key: string) => void
  monthlyOnly?: boolean
}) {
  const { variant, certificates, months, total, quarters, halves, judged, achieved, zeroMonths, actionTotal, noNcMonths, shipped, processRateHigh, processRateLow } = data
  const higherBetter = variant === 'customer'
  const rateAxis = useMemo(() => rateChartAxis(months, higherBetter), [months, higherBetter])
  const numCell = 'px-2 py-2 text-right tabular-nums'
  const labels = variant === 'customer'
    ? {
      chart: '월별 회신율 추이',
      chartNote: `점선: 목표 ${total.target}% 이상 · 초록 달성 · 빨강 미달`,
      periodTitle: '분기 · 반기 회신율',
      heads: ['접수', '조치', '회신율'],
      colA: '접수',
      colB: '조치',
      rate: '회신율',
      unit: '건',
    }
    : variant === 'process'
      ? {
        chart: '월별 공정 불량률 추이',
        chartNote: `점선: 목표 ${total.target}% 이하 · 초록 달성 · 빨강 미달`,
        periodTitle: '분기 · 반기 공정 불량률',
        heads: ['생산량', '불량수량', '불량률'],
        colA: '생산량',
        colB: '불량수량',
        rate: '불량률',
        unit: '',
      }
      : {
        chart: certificates ? '월별 출하검사 현황' : '월별 불량률 추이',
        chartNote: certificates
          ? `막대=출하 Kg/EA + 불량률(%) · 회색 점선=목표`
          : `점선: 목표 ${total.target}% 이하 · 초록 달성 · 빨강 미달`,
        periodTitle: certificates ? '분기 · 반기 출하검사' : '분기 · 반기 수입검사',
        heads: certificates ? ['출하', '불량', '불량률'] : ['검사', '불량', '불량률'],
        colA: certificates ? '출하' : '검사',
        colB: '불량',
        rate: certificates ? '불량률' : '불량률',
        unit: certificates ? '' : 'LOT',
      }

  const formatCount = (value: number) => {
    if (variant === 'process') return formatQty(value)
    if (variant === 'customer') return `${value.toLocaleString('ko-KR')}건`
    if (certificates) return value.toLocaleString('ko-KR')
    return `${value.toLocaleString('ko-KR')} LOT`
  }

  const outgoingShipUnits: QuantityUnit[] =
    certificates && shipped ? (shippedUnits(shipped).length ? shippedUnits(shipped) : ['Kg']) : []
  const outgoingSplitShip = outgoingShipUnits.length > 0

  const colAOf = (row: PeriodStat) => (certificates ? row.rateBase ?? 0 : row.inspected)
  const hasRow = (row: PeriodStat) => {
    if (outgoingSplitShip && shipped) {
      if (row === total || row.label === '누계') {
        return outgoingShipUnits.some((unit) => shipped.total[unit] > 0) || row.defect > 0
      }
      const bucket = shipped.byMonth.get(row.key)
      const anyShip = outgoingShipUnits.some((unit) => (bucket?.[unit] ?? 0) > 0)
      return anyShip || row.defect > 0
    }
    return certificates ? (row.rateBase ?? 0) > 0 || row.defect > 0 : row.inspected > 0
  }
  const colAText = (row: PeriodStat) => {
    const value = colAOf(row)
    if (!value) return '—'
    return certificates && row.rateBaseUnit ? `${formatCount(value)} ${row.rateBaseUnit}` : formatCount(value)
  }
  const shipUnitCell = (monthKey: string, unit: QuantityUnit, active: boolean) => {
    if (!shipped || !active) return '—'
    return formatShipQuantity(shipped.byMonth.get(monthKey)?.[unit] ?? 0)
  }
  const shipUnitTotalCell = (unit: QuantityUnit) => {
    if (!shipped) return '—'
    return formatShipQuantity(shipped.total[unit] ?? 0)
  }

  const compareCell = (rate: number, target: number) => (
    higherBetter ? <ReplyGap rate={rate} target={target} /> : <DefectGap rate={rate} target={target} />
  )

  const monthlyTable = (
      <article className="kpi-close-card kpi-close-report-card min-w-0 overflow-hidden rounded-2xl border bg-card shadow-sm print:overflow-visible print:shadow-none">
        <div className="kpi-close-report-head border-b px-4 py-3 print:px-2 print:py-1.5">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">월별 KPI 실적</h3>
          <p className="mt-0.5 text-[11px] text-muted-foreground print:hidden">{year}년 · {labels.colA} · {labels.colB} · {labels.rate}</p>
        </div>
        <div className="overflow-x-auto">
          <table className="kpi-close-report w-full min-w-[42rem] table-fixed text-[13px]">
            <thead>
              <tr className="border-b bg-muted/40 text-xs text-muted-foreground">
                <th className="py-2 pl-4 pr-2 text-left font-medium">월</th>
                <th className="px-2 py-2 text-right font-medium">목표</th>
                {outgoingSplitShip
                  ? outgoingShipUnits.map((unit) => (
                    <th key={unit} className="px-2 py-2 text-right font-medium">{`출하 ${unit}`}</th>
                  ))
                  : <th className="px-2 py-2 text-right font-medium">{labels.colA}</th>}
                <th className="px-2 py-2 text-right font-medium">{labels.colB}</th>
                <th className="px-2 py-2 text-right font-medium">{labels.rate}</th>
                <th className="px-2 py-2 text-right font-medium">목표대비</th>
                <th className="px-2 py-2 text-right font-medium">판정</th>
                <th className="px-2 py-2 text-right font-medium print:hidden">상태</th>
                <th className="no-print py-2 pl-2 pr-4 text-right font-medium">마감</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {months.map((month) => {
                const isClosed = closed.has(month.key)
                const future = month.key > current
                const now = month.key === current
                return (
                  <tr key={month.key} className={cn('border-b', now && 'bg-primary/5', isClosed && 'bg-muted/30')}>
                    <td className="py-2 pl-4 pr-2 font-semibold">
                      {month.label}
                      {now && <span className="ml-1 rounded bg-primary/10 px-1 py-px text-[10px] font-semibold text-primary print:hidden">이번</span>}
                    </td>
                    <td className={numCell}>{month.target}%</td>
                    {outgoingSplitShip
                      ? outgoingShipUnits.map((unit) => (
                        <td key={unit} className={numCell}>{shipUnitCell(month.key, unit, !future)}</td>
                      ))
                      : <td className={numCell}>{hasRow(month) ? colAText(month) : '—'}</td>}
                    <td className={cn(numCell, month.defect > 0 && 'font-semibold text-rose-600')}>{hasRow(month) ? formatCount(month.defect) : '—'}</td>
                    <td className={cn(numCell, 'font-semibold', month.ok === false && 'text-rose-600', month.ok && 'text-emerald-600')}>{hasRow(month) ? pct(month.rate) : '—'}</td>
                    <td className={numCell}>{hasRow(month) ? compareCell(month.rate, month.target) : '—'}</td>
                    <td className={numCell}><Verdict ok={month.ok} compact /></td>
                    <td className={cn(numCell, 'text-xs font-semibold print:hidden')}>
                      {future ? '예정' : isClosed ? '마감' : '진행'}
                    </td>
                    <td className="no-print py-2 pl-2 pr-4 text-right">
                      {canManage && !future && (
                        <Button type="button" variant={isClosed ? 'outline' : 'secondary'} size="sm" disabled={saving} onClick={() => onToggle(month.key)}>
                          {isClosed ? <><LockOpen /> 해제</> : <><Lock /> 마감</>}
                        </Button>
                      )}
                    </td>
                  </tr>
                )
              })}
              <tr className="bg-muted/60 font-semibold">
                <td className="py-2.5 pl-4 pr-2">누계</td>
                <td className={numCell}>{total.target}%</td>
                {outgoingSplitShip
                  ? outgoingShipUnits.map((unit) => (
                    <td key={unit} className={numCell}>{shipUnitTotalCell(unit)}</td>
                  ))
                  : <td className={numCell}>{hasRow(total) ? colAText(total) : '—'}</td>}
                <td className={cn(numCell, total.defect > 0 && 'text-rose-600')}>{hasRow(total) ? formatCount(total.defect) : '—'}</td>
                <td className={cn(numCell, total.ok === false && 'text-rose-600', total.ok && 'text-emerald-600')}>{hasRow(total) ? pct(total.rate) : '—'}</td>
                <td className={numCell}>{hasRow(total) ? compareCell(total.rate, total.target) : '—'}</td>
                <td className={numCell}><Verdict ok={total.ok} compact /></td>
                <td className={cn(numCell, 'print:hidden')}>—</td>
                <td className="no-print" />
              </tr>
            </tbody>
          </table>
        </div>
      </article>
  )

  if (monthlyOnly) return monthlyTable

  return (
    <div className="kpi-close-delivery grid gap-4 print:gap-2">
      <div className={cn(
        'kpi-close-stats grid grid-cols-2 gap-2',
        'kpi-close-stats-5 sm:grid-cols-3 lg:grid-cols-5',
      )}>
        {variant === 'customer' ? (
          <>
            <CloseStat label="고객부적합 접수" value={total.inspected ? total.inspected.toLocaleString('ko-KR') : '0'} unit="건" tone={total.inspected ? 'rose' : undefined} />
            <CloseStat label="부적합 조치" value={String(actionTotal ?? 0)} unit="건" />
            <CloseStat label="누계 회신율" value={total.inspected ? total.rate.toFixed(3) : '—'} unit={total.inspected ? '%' : ''} tone={total.ok === false ? 'rose' : total.ok ? 'green' : undefined} />
            <CloseStat label="무부적합 월" value={`${noNcMonths ?? 0} / 12`} unit="개월" tone={(noNcMonths ?? 0) > 0 ? 'green' : undefined} />
            <CloseStat label="목표달성" value={`${achieved} / 12`} unit="개월" />
          </>
        ) : variant === 'process' ? (
          <>
            <CloseStat label="총 생산량(검사수량)" value={total.inspected ? formatQty(total.inspected) : '—'} unit="" />
            <CloseStat label="총 불량수량" value={total.defect ? formatQty(total.defect) : '0'} unit="" tone={total.defect > 0 ? 'rose' : undefined} />
            <CloseStat label="누계 공정 불량률" value={total.inspected ? total.rate.toFixed(3) : '—'} unit={total.inspected ? '%' : ''} tone={total.ok === false ? 'rose' : total.ok ? 'green' : undefined} />
            <CloseStatRange
              label="최고/최저 불량률"
              high={processRateHigh ? { value: `${processRateHigh.rate.toFixed(3)}%`, meta: processRateHigh.label } : undefined}
              low={processRateLow ? { value: `${processRateLow.rate.toFixed(3)}%`, meta: processRateLow.label } : undefined}
            />
            <CloseStat label="목표 달성 월수" value={`${achieved} / 12`} unit="개월" />
          </>
        ) : certificates && shipped ? (
          <>
            <CloseStat
              label="총 출하수량"
              value={<QuantityText bucket={shipped.total} />}
              unit=""
              compact
            />
            <CloseStat label="출하검사 수량" value={total.inspected ? total.inspected.toLocaleString('ko-KR') : '—'} unit="" />
            <CloseStat label="검출 불량수량" value={total.defect ? total.defect.toLocaleString('ko-KR') : '—'} unit="" tone={total.defect > 0 ? 'rose' : undefined} />
            <CloseStat label="출하검사 불량률" value={total.inspected ? total.rate.toFixed(3) : '—'} unit={total.inspected ? '%' : ''} tone={total.ok === false ? 'rose' : total.ok ? 'green' : undefined} />
            <CloseStat label="목표 달성 월수" value={`${achieved} / 12`} unit="개월" />
          </>
        ) : (
          <>
            <CloseStat label="총 검사 LOT" value={total.inspected ? total.inspected.toLocaleString('ko-KR') : '—'} unit={total.inspected ? 'LOT' : ''} />
            <CloseStat label="총 불량 LOT" value={total.defect ? total.defect.toLocaleString('ko-KR') : '—'} unit={total.defect ? 'LOT' : ''} tone={total.defect > 0 ? 'rose' : undefined} />
            <CloseStat label="누계 LOT 불량률" value={total.inspected ? total.rate.toFixed(3) : '—'} unit={total.inspected ? '%' : ''} tone={total.ok === false ? 'rose' : total.ok ? 'green' : undefined} />
            <CloseStat label="무불량(0 LOT) 월수" value={`${zeroMonths ?? 0} / 12`} unit="개월" tone={(zeroMonths ?? 0) > 0 ? 'green' : undefined} />
            <CloseStat label="목표 달성월수" value={`${achieved} / 12`} unit="개월" />
          </>
        )}
      </div>

      <div className="kpi-close-top grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <article className="kpi-close-card kpi-close-chart-card flex min-w-0 flex-col rounded-2xl border bg-card p-4 shadow-sm print:shadow-none">
          <h3 className="mb-3 text-sm font-bold text-slate-900 dark:text-white">{labels.chart}</h3>
          {certificates && shipped ? (
            <OutgoingKpiVisual year={year} months={months} shipped={shipped} target={total.target} />
          ) : (
            <RateBars months={months} target={total.target} min={rateAxis.min} max={rateAxis.max} ticks={rateAxis.ticks} />
          )}
          <p className="kpi-close-chart-note mt-2 text-[11px] text-muted-foreground">{labels.chartNote}</p>
        </article>
        <KpiPeriodPanel
          className="kpi-close-card"
          title={labels.periodTitle}
          aside={certificates && shipped ? `단위 ${outgoingUnitLegend(shipped)}` : undefined}
          heads={labels.heads}
          quarters={quarters.map((row) => periodLine(row, { outgoing: certificates }))}
          halves={halves.map((row) => periodLine(row, { outgoing: certificates }))}
          total={periodLine(total, { outgoing: certificates })}
          higherBetter={higherBetter}
        />
      </div>

      {monthlyTable}
    </div>
  )
}

function DeliveryCloseReport({ year, months, ordersByMonth, total, quarters, halves, closed, current, canManage, saving, onToggle, monthlyOnly = false }: {
  year: number
  months: PeriodStat[]
  ordersByMonth: Record<string, number>
  total: PeriodStat
  quarters: PeriodStat[]
  halves: PeriodStat[]
  closed: Set<string>
  current: string
  canManage: boolean
  saving: boolean
  onToggle: (key: string) => void
  monthlyOnly?: boolean
}) {
  const orderTotal = useMemo(() => Object.values(ordersByMonth).reduce((sum, count) => sum + count, 0), [ordersByMonth])
  const rateAxis = useMemo(() => rateChartAxis(months, true), [months])

  const quarterOrders = [0, 1, 2, 3].map((quarter) =>
    months.slice(quarter * 3, quarter * 3 + 3).reduce((sum, month) => sum + (ordersByMonth[month.key] ?? 0), 0),
  )
  const halfOrders = [0, 1].map((half) =>
    months.slice(half * 6, half * 6 + 6).reduce((sum, month) => sum + (ordersByMonth[month.key] ?? 0), 0),
  )

  const numCell = 'px-2 py-2 text-right tabular-nums'

  const monthlyTable = (
      <article className="kpi-close-card kpi-close-report-card min-w-0 overflow-hidden rounded-2xl border bg-card shadow-sm print:overflow-visible print:shadow-none">
        <div className="kpi-close-report-head border-b px-4 py-3 print:px-2 print:py-1.5">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">월별 KPI 실적</h3>
          <p className="mt-0.5 text-[11px] text-muted-foreground print:hidden">{year}년 · 발주·납품·지연·준수율</p>
        </div>
        <div className="overflow-x-auto">
          <table className="kpi-close-report w-full min-w-[46rem] table-fixed text-[13px]">
            <thead>
              <tr className="border-b bg-muted/40 text-xs text-muted-foreground">
                <th className="py-2 pl-4 pr-2 text-left font-medium">월</th>
                <th className="px-2 py-2 text-right font-medium">목표</th>
                <th className="px-2 py-2 text-right font-medium">발주</th>
                <th className="px-2 py-2 text-right font-medium">납품</th>
                <th className="px-2 py-2 text-right font-medium">지연</th>
                <th className="px-2 py-2 text-right font-medium">준수율</th>
                <th className="px-2 py-2 text-right font-medium">목표대비</th>
                <th className="px-2 py-2 text-right font-medium">판정</th>
                <th className="px-2 py-2 text-right font-medium print:hidden">상태</th>
                <th className="no-print py-2 pl-2 pr-4 text-right font-medium">마감</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {months.map((month) => {
                const orders = ordersByMonth[month.key] ?? 0
                const isClosed = closed.has(month.key)
                const future = month.key > current
                const now = month.key === current
                return (
                  <tr key={month.key} className={cn('border-b', now && 'bg-primary/5', isClosed && 'bg-muted/30')}>
                    <td className="py-2 pl-4 pr-2 font-semibold">
                      {month.label}
                      {now && <span className="ml-1 rounded bg-primary/10 px-1 py-px text-[10px] font-semibold text-primary print:hidden">이번</span>}
                    </td>
                    <td className={numCell}>{month.target}%</td>
                    <td className={numCell}>{orders ? `${orders.toLocaleString('ko-KR')}건` : '—'}</td>
                    <td className={numCell}>{month.inspected ? `${month.inspected.toLocaleString('ko-KR')}건` : '—'}</td>
                    <td className={cn(numCell, month.defect > 0 && 'font-semibold text-rose-600')}>{month.inspected ? `${month.defect.toLocaleString('ko-KR')}건` : '—'}</td>
                    <td className={cn(numCell, 'font-semibold', month.ok === false && 'text-rose-600', month.ok && 'text-emerald-600')}>{month.inspected ? pct(month.rate) : '—'}</td>
                    <td className={numCell}>{month.inspected ? <ReplyGap rate={month.rate} target={month.target} /> : '—'}</td>
                    <td className={numCell}><Verdict ok={month.ok} compact /></td>
                    <td className={cn(numCell, 'text-xs font-semibold print:hidden')}>
                      {future ? '예정' : isClosed ? '마감' : '진행'}
                    </td>
                    <td className="no-print py-2 pl-2 pr-4 text-right">
                      {canManage && !future && (
                        <Button type="button" variant={isClosed ? 'outline' : 'secondary'} size="sm" disabled={saving} onClick={() => onToggle(month.key)}>
                          {isClosed ? <><LockOpen /> 해제</> : <><Lock /> 마감</>}
                        </Button>
                      )}
                    </td>
                  </tr>
                )
              })}
              <tr className="bg-muted/60 font-semibold">
                <td className="py-2.5 pl-4 pr-2">누계</td>
                <td className={numCell}>{total.target}%</td>
                <td className={numCell}>{orderTotal ? `${orderTotal.toLocaleString('ko-KR')}건` : '—'}</td>
                <td className={numCell}>{total.inspected ? `${total.inspected.toLocaleString('ko-KR')}건` : '—'}</td>
                <td className={cn(numCell, total.defect > 0 && 'text-rose-600')}>{total.inspected ? `${total.defect.toLocaleString('ko-KR')}건` : '—'}</td>
                <td className={cn(numCell, total.ok === false && 'text-rose-600', total.ok && 'text-emerald-600')}>{total.inspected ? pct(total.rate) : '—'}</td>
                <td className={numCell}>{total.inspected ? <ReplyGap rate={total.rate} target={total.target} /> : '—'}</td>
                <td className={numCell}><Verdict ok={total.ok} compact /></td>
                <td className={cn(numCell, 'print:hidden')}>—</td>
                <td className="no-print" />
              </tr>
            </tbody>
          </table>
        </div>
      </article>
  )

  if (monthlyOnly) return monthlyTable

  return (
    <div className="kpi-close-delivery grid gap-4 print:gap-2">
      <div className="kpi-close-stats kpi-close-stats-5 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        <CloseStat label="목표" value={String(total.target)} unit="%" />
        <CloseStat label="발주건" value={orderTotal ? orderTotal.toLocaleString('ko-KR') : '—'} unit={orderTotal ? '건' : ''} />
        <CloseStat label="납품건" value={total.inspected ? total.inspected.toLocaleString('ko-KR') : '—'} unit={total.inspected ? '건' : ''} />
        <CloseStat label="납기지연건" value={total.inspected ? total.defect.toLocaleString('ko-KR') : '—'} unit={total.inspected ? '건' : ''} tone="rose" />
        <CloseStat label="납기준수율" value={total.inspected ? total.rate.toFixed(3) : '—'} unit={total.inspected ? '%' : ''} tone={total.ok === false ? 'rose' : total.ok ? 'green' : undefined} />
      </div>

      <div className="kpi-close-top grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <article className="kpi-close-card kpi-close-chart-card flex min-w-0 flex-col rounded-2xl border bg-card p-4 shadow-sm print:shadow-none">
          <h3 className="mb-3 text-sm font-bold text-slate-900 dark:text-white">월별 납기준수율 추이</h3>
          <RateBars months={months} target={total.target} min={rateAxis.min} max={rateAxis.max} ticks={rateAxis.ticks} />
          <p className="kpi-close-chart-note mt-2 text-[11px] text-muted-foreground">점선: 목표 {total.target}% · 초록 달성 · 빨강 미달</p>
        </article>

        <KpiPeriodPanel
          className="kpi-close-card"
          title="분기 · 반기 납기준수"
          heads={['발주', '납품', '지연', '준수율']}
          quarters={quarters.map((row, index) => deliveryLine(row, quarterOrders[index] ?? 0))}
          halves={halves.map((row, index) => deliveryLine(row, halfOrders[index] ?? 0))}
          total={deliveryLine(total, orderTotal)}
          higherBetter
        />
      </div>

      {monthlyTable}
    </div>
  )
}

function KpiClosePrintSheet({ title, year, months, closed, sample, delivery, customer, deliveryReport, standardReport, canManage, saving, onToggle }: {
  title: string
  year: number
  months: PeriodStat[]
  closed: Set<string>
  sample: boolean
  delivery: boolean
  customer: boolean
  deliveryReport?: { ordersByMonth: Record<string, number>; total: PeriodStat; quarters: PeriodStat[]; halves: PeriodStat[] }
  standardReport?: StandardCloseReportData
  canManage: boolean
  saving: boolean
  onToggle: (key: string) => void
}) {
  const today = new Date()
  const current = monthKey(today.getFullYear(), today.getMonth() + 1)
  const reportLayout = Boolean((delivery && deliveryReport) || standardReport)

  return (
    <section className={cn('kpi-close-sheet grid gap-4', reportLayout && 'kpi-close-sheet-delivery')}>
      <div className="kpi-close-head">
        <p className="text-xs font-semibold text-muted-foreground">WOORI-HIP · {title}</p>
        <h2 className="mt-0.5 text-lg font-bold text-slate-900 dark:text-white">
          {delivery ? `${year}년 납기준수 보고서` : reportLayout ? `${year}년 KPI 보고서` : `${year}년 월마감`}
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          출력일 {today.toLocaleDateString('ko-KR')}
          {sample ? ' · 예시 데이터' : ''}
        </p>
      </div>

      {delivery && deliveryReport ? (
        <DeliveryCloseReport
          year={year}
          months={months}
          ordersByMonth={deliveryReport.ordersByMonth}
          total={deliveryReport.total}
          quarters={deliveryReport.quarters}
          halves={deliveryReport.halves}
          closed={closed}
          current={current}
          canManage={canManage}
          saving={saving}
          onToggle={onToggle}
        />
      ) : standardReport ? (
        <StandardCloseReport
          year={year}
          data={standardReport}
          closed={closed}
          current={current}
          canManage={canManage}
          saving={saving}
          onToggle={onToggle}
        />
      ) : null}
    </section>
  )
}

function CloseStat({ label, value, unit, tone, compact = false }: { label: string; value: ReactNode; unit: string; tone?: 'rose' | 'green'; compact?: boolean }) {
  const dense = compact || (typeof value === 'string' && value.length > 11)
  return (
    <div className="min-w-0 rounded-xl border bg-card px-4 py-3 print:px-2 print:py-2">
      <p className="text-xs font-medium leading-snug text-muted-foreground">{label}</p>
      <div className={cn(
        'mt-1 font-bold tabular-nums text-slate-900 dark:text-white',
        dense ? 'text-sm leading-snug' : 'text-xl leading-none',
        tone === 'rose' && 'text-rose-600',
        tone === 'green' && 'text-emerald-600',
      )}>
        {value}
        {unit ? <span className="ml-1 text-xs font-semibold text-muted-foreground">{unit}</span> : null}
      </div>
    </div>
  )
}

function LotDialog({ open, onOpenChange, lot, companies, productsByCompany, closed, saving, registerLabel, description, quantityLabel, delivery = false, onSubmit }: {
  open: boolean
  onOpenChange: (open: boolean) => void
  lot: InspectionLot | null
  companies: string[]
  productsByCompany: Record<string, string[]>
  closed: Set<string>
  saving: boolean
  registerLabel: string
  description: string
  quantityLabel: string
  delivery?: boolean
  onSubmit: (lot: InspectionLot) => void
}) {
  const [form, setForm] = useState<InspectionLot>(() => lot ?? {
    id: typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `lot-${Date.now()}`,
    date: todayIso(),
    vendor: '',
    product: '',
    floor: '1',
    quantity: 0,
    result: 'pass',
    defect: '',
    scar: 'none',
    scarDue: '',
    note: '',
  })
  const set = <K extends keyof InspectionLot>(key: K, value: InspectionLot[K]) => setForm((current) => ({ ...current, [key]: value }))
  const setDeliveryDate = (date: string) => setForm((current) => {
    const result = deliveryResult(date, current.scarDue)
    return { ...current, date, result, scar: 'none' }
  })
  const setPromisedDate = (scarDue: string) => setForm((current) => {
    const result = deliveryResult(current.date, scarDue)
    return { ...current, scarDue, result, scar: 'none' }
  })
  const locked = closed.has(form.date.slice(0, 7))

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const companyProducts = productsByCompany[form.vendor] ?? []
    if (!form.date || !form.vendor.trim()) return toast.error(delivery ? '납품일과 업체명을 선택해 주세요.' : '검사일과 업체명을 선택해 주세요.')
    if (delivery && !form.scarDue) return toast.error('약속 납기를 입력해 주세요.')
    if (!companies.includes(form.vendor)) return toast.error('등록된 업체 목록에서 선택해 주세요.')
    if (companyProducts.length === 0) return toast.error('이 업체에 저장된 품목이 없습니다.')
    if (!companyProducts.includes(form.product)) return toast.error('이 업체가 생산하는 품목을 선택해 주세요.')
    if (locked) return toast.error('마감된 달입니다. 월별 마감에서 해제한 뒤 등록해 주세요.')
    const result = delivery ? deliveryResult(form.date, form.scarDue) : form.result
    if (result === 'fail' && !form.defect.trim()) return toast.error(delivery ? '지연이면 지연 사유를 입력해 주세요.' : '불합격이면 불량 내용을 입력해 주세요.')
    onSubmit({
      ...form,
      vendor: form.vendor.trim(),
      product: form.product.trim(),
      result,
      scar: delivery && result === 'pass' ? 'none' : form.scar,
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={submit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>{lot ? (delivery ? '납품 수정' : '검사 수정') : registerLabel}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-3">
            <Field label={delivery ? '실제 납품일' : '검사일'} required>
              <Input type="date" value={form.date} onChange={(event) => (delivery ? setDeliveryDate(event.target.value) : set('date', event.target.value))} aria-invalid={locked} />
            </Field>
            {delivery ? (
              <Field label="약속 납기" required>
                <Input type="date" value={form.scarDue} onChange={(event) => setPromisedDate(event.target.value)} />
              </Field>
            ) : (
              <Field label="층" asGroup>
                <div className="grid h-8 grid-cols-3 gap-0.5 rounded-lg border bg-muted/40 p-0.5">
                  {FLOORS.map((floor) => {
                    const selected = form.floor === floor
                    return (
                      <button
                        key={floor}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => set('floor', floor)}
                        className={cn(
                          'rounded-md text-[13px] font-semibold transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/40',
                          selected ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:bg-background hover:text-foreground',
                        )}
                      >
                        {floor}층
                      </button>
                    )
                  })}
                </div>
              </Field>
            )}
            <Field label="업체명" required>
              <SearchableCombobox
                configName="companies"
                options={companies}
                listAll
                creatable={false}
                clearable={false}
                value={form.vendor}
                onChange={(value) => {
                  const allowed = productsByCompany[value] ?? []
                  setForm((current) => ({ ...current, vendor: value, product: allowed.includes(current.product) ? current.product : '' }))
                }}
                placeholder="업체명"
              />
            </Field>
            <Field label="품목" required>
              <SearchableCombobox
                configName="products"
                options={productsByCompany[form.vendor] ?? []}
                listAll
                creatable={false}
                clearable={false}
                disabled={!form.vendor}
                value={form.product}
                onChange={(value) => set('product', value)}
                placeholder={form.vendor ? ((productsByCompany[form.vendor] ?? []).length ? '품목 선택' : '저장된 품목 없음') : '품목 선택'}
              />
            </Field>
            <Field label={quantityLabel}>
              <Input inputMode="numeric" value={form.quantity ? String(form.quantity) : ''} onChange={(event) => set('quantity', Math.max(0, Math.floor(Number(event.target.value.replace(/\D/g, '')) || 0)))} placeholder="0" />
            </Field>
            {delivery ? (
              <Field label="준수 여부" asGroup className="col-span-2">
                <p className="flex h-8 items-center rounded-lg border bg-muted/30 px-3 text-[13px] font-semibold">
                  <ResultBadge result={form.result} passLabel="준수" failLabel="지연" />
                  <span className="ml-2 text-xs font-normal text-muted-foreground">납품일이 약속 납기를 넘기면 지연으로 집계됩니다.</span>
                </p>
              </Field>
            ) : (
              <Field label="판정" asGroup>
                <div className="grid h-8 grid-cols-2 gap-1 rounded-lg border p-0.5">
                  {(['pass', 'fail'] as const).map((value) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => set('result', value)}
                      className={cn(
                        'rounded-md text-[13px] font-semibold',
                        form.result === value ? (value === 'pass' ? 'bg-emerald-600 text-white' : 'bg-rose-600 text-white') : 'text-muted-foreground hover:bg-muted',
                      )}
                    >
                      {value === 'pass' ? '합격' : '불합격'}
                    </button>
                  ))}
                </div>
              </Field>
            )}
          </div>

          {form.result === 'fail' && (
            <div className="grid grid-cols-2 gap-3 rounded-xl border border-rose-100 bg-rose-50/50 p-3 dark:border-rose-500/20 dark:bg-rose-500/5">
              <Field label={delivery ? '지연 사유' : '불량 내용'} required className="col-span-2">
                <Input value={form.defect} onChange={(event) => set('defect', event.target.value)} placeholder={delivery ? '예: 원자재 지연, 물량 변경' : '예: 치수 이탈, 외관 흠집'} />
              </Field>
              {!delivery && (
                <>
                  <Field label="SCAR 상태">
                    <select value={form.scar} onChange={(event) => set('scar', event.target.value as ScarStatus)} className={cn(FIELD, 'h-8 w-full')}>
                      {(Object.keys(SCAR_LABEL) as ScarStatus[]).map((status) => <option key={status} value={status}>{SCAR_LABEL[status]}</option>)}
                    </select>
                  </Field>
                  <Field label="조치 기한">
                    <Input type="date" value={form.scarDue} onChange={(event) => set('scarDue', event.target.value)} />
                  </Field>
                </>
              )}
            </div>
          )}

          <Field label="비고">
            <Input value={form.note} onChange={(event) => set('note', event.target.value)} placeholder="선택 입력" />
          </Field>

          {locked && <p className="text-xs font-medium text-rose-600">{Number(form.date.slice(5, 7))}월은 마감되었습니다.</p>}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>취소</Button>
            <Button type="submit" disabled={saving || locked}>{saving ? '저장 중…' : '저장'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function Field({ label, required, asGroup, className, children }: { label: string; required?: boolean; asGroup?: boolean; className?: string; children: ReactNode }) {
  const Wrapper = asGroup ? 'div' : 'label'
  return (
    <Wrapper className={cn('grid gap-1.5', className)} {...(asGroup ? { role: 'group', 'aria-label': label } : {})}>
      <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">{label}{required && <span className="ml-0.5 text-rose-500">*</span>}</span>
      {children}
    </Wrapper>
  )
}

function Card({ title, aside, children, className }: { title: string; aside?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <article className={cn('min-w-0 rounded-2xl border bg-card p-5 shadow-sm', className)}>
      <div className="mb-4 flex shrink-0 items-center justify-between gap-3">
        <h2 className="text-[15px] font-bold text-slate-900 dark:text-white">{title}</h2>
        {aside}
      </div>
      {children}
    </article>
  )
}

function StatTileRange({ icon: Icon, title, high, low, emptyLabel = '—' }: {
  icon: typeof Package
  title: string
  high?: { value: string; meta?: string; tone?: 'rose' | 'green' }
  low?: { value: string; meta?: string; tone?: 'rose' | 'green' }
  emptyLabel?: string
}) {
  const hasData = Boolean(high && low)
  return (
    <article className="min-w-0 rounded-2xl border bg-card p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="shrink-0 rounded-xl bg-muted p-2.5 text-muted-foreground">
          <Icon className="h-5 w-5" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-medium leading-snug text-muted-foreground">{title}</p>
          {hasData ? (
            <>
              <div className="mt-1 flex items-baseline gap-x-1 whitespace-nowrap text-[20px] font-bold leading-tight tabular-nums xl:text-[22px]">
                {[high, low].map((item, i) => (
                  <Fragment key={i}>
                    {i === 1 && <span className="text-sm font-semibold text-muted-foreground">/</span>}
                    <span className={cn(
                      'text-slate-900 dark:text-white',
                      item?.tone === 'rose' && 'text-rose-600',
                      item?.tone === 'green' && 'text-emerald-600',
                    )}>
                      {item?.value.replace(/%$/, '')}
                      {item?.value.endsWith('%') && <span className="ml-0.5 text-sm font-semibold">%</span>}
                    </span>
                  </Fragment>
                ))}
              </div>
              <p className="mt-1.5 text-xs leading-snug text-muted-foreground">
                {high?.meta && low?.meta ? `최고 ${high.meta} · 최저 ${low.meta}` : high?.meta ?? low?.meta}
              </p>
            </>
          ) : (
            <p className="mt-1 text-[22px] font-bold leading-tight text-muted-foreground xl:text-[24px]">{emptyLabel}</p>
          )}
        </div>
      </div>
    </article>
  )
}

function CloseStatRange({ label, high, low }: {
  label: string
  high?: { value: string; meta?: string }
  low?: { value: string; meta?: string }
}) {
  const hasData = Boolean(high && low)
  return (
    <div className="min-w-0 rounded-xl border bg-card px-3 py-2.5 print:px-2 print:py-2">
      <p className="text-[10px] font-medium leading-snug text-muted-foreground">{label}</p>
      {hasData ? (
        <div className="mt-1.5 grid grid-cols-2 gap-2 text-center">
          <div>
            <p className="text-[9px] text-muted-foreground">최고</p>
            <p className="text-sm font-bold tabular-nums text-rose-600">{high?.value}</p>
            <p className="text-[9px] text-muted-foreground">{high?.meta}</p>
          </div>
          <div>
            <p className="text-[9px] text-muted-foreground">최저</p>
            <p className="text-sm font-bold tabular-nums text-emerald-600">{low?.value}</p>
            <p className="text-[9px] text-muted-foreground">{low?.meta}</p>
          </div>
        </div>
      ) : (
        <p className="mt-1 text-sm font-bold">—</p>
      )}
    </div>
  )
}

function StatTile({ icon: Icon, label, value, unit, sub, tone, compactValue = false }: {
  icon: typeof Package
  label: string
  value: ReactNode
  unit?: string
  sub?: string
  tone?: 'rose' | 'green'
  compactValue?: boolean
}) {
  const compact = compactValue || (typeof value === 'string' && value.length > 10)
  return (
    <article className="min-w-0 rounded-2xl border bg-card p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <div className={cn(
          'shrink-0 rounded-xl p-2.5',
          tone === 'rose' && 'bg-rose-50 text-rose-600 dark:bg-rose-500/10',
          tone === 'green' && 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10',
          !tone && 'bg-muted text-muted-foreground',
        )}>
          <Icon className="h-5 w-5" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-medium leading-snug text-muted-foreground">{label}</p>
          <div className={cn(
            'mt-1 font-bold tabular-nums',
            compact ? 'text-[15px] leading-snug' : 'text-[22px] leading-tight xl:text-[24px]',
            tone === 'rose' && 'text-rose-600',
            tone === 'green' && 'text-emerald-600',
          )}>
            {value}
            {unit && <span className="ml-1 text-sm font-semibold text-muted-foreground">{unit}</span>}
          </div>
          {sub && <p className="mt-1.5 text-xs leading-snug text-muted-foreground">{sub}</p>}
        </div>
      </div>
    </article>
  )
}

function outgoingUnitLegend(shipped: ReturnType<typeof quantityByMonth>) {
  const units = shippedUnits(shipped)
  if (!units.length) return 'KG / EA'
  return units.map((unit) => (unit === 'Kg' ? 'KG' : unit)).join(' / ')
}

const compactQty = new Intl.NumberFormat('ko-KR', { notation: 'compact', maximumFractionDigits: 1 })

function periodStatusTone(ok: boolean | null) {
  if (ok == null) return { stroke: 'stroke-slate-300 dark:stroke-slate-600', track: 'stroke-slate-100 dark:stroke-slate-800', text: 'text-muted-foreground' }
  return ok
    ? { stroke: 'stroke-emerald-500', track: 'stroke-emerald-100 dark:stroke-emerald-500/15', text: 'text-emerald-600 dark:text-emerald-400' }
    : { stroke: 'stroke-rose-500', track: 'stroke-rose-100 dark:stroke-rose-500/15', text: 'text-rose-600 dark:text-rose-400' }
}

/** 높을수록 좋은 KPI는 0~100%, 낮을수록 좋은 KPI는 목표의 2배(또는 기간 최댓값)를 한 바퀴로 본다 */
function PeriodRing({ rate, rateText, target, ok, scale, higherBetter, size }: { rate: number | null; rateText: string; target: number; ok: boolean | null; scale: number; higherBetter: boolean; size: number }) {
  const radius = 15.9155
  const span = higherBetter ? 100 : scale
  const fill = rate == null || span <= 0 ? 0 : Math.min(1, Math.max(0, rate / span))
  const targetAt = span > 0 ? Math.min(1, Math.max(0, target / span)) : null
  const tone = periodStatusTone(rate == null ? null : ok)
  const angle = targetAt == null ? 0 : targetAt * 2 * Math.PI - Math.PI / 2
  return (
    <div className="kpi-period-ring relative shrink-0" style={{ width: size, height: size }}>
      <svg viewBox="0 0 36 36" className="size-full">
        <circle cx="18" cy="18" r={radius} fill="none" strokeWidth="3.4" className={tone.track} />
        {fill > 0 && (
          <circle
            cx="18"
            cy="18"
            r={radius}
            fill="none"
            strokeWidth="3.4"
            strokeLinecap="round"
            strokeDasharray={`${fill * 100} 100`}
            transform="rotate(-90 18 18)"
            className={cn(tone.stroke, 'transition-[stroke-dasharray] duration-500')}
          />
        )}
        {targetAt != null && targetAt > 0 && targetAt < 1 && (
          <circle cx={18 + radius * Math.cos(angle)} cy={18 + radius * Math.sin(angle)} r="1.5" className="fill-slate-700 stroke-white dark:fill-slate-200 dark:stroke-slate-900" strokeWidth="0.8" />
        )}
      </svg>
      <span className={cn('absolute inset-0 flex items-center justify-center font-bold tabular-nums tracking-tight', tone.text, size >= 64 ? 'text-[13px]' : 'text-[11px]')}>
        {rateText}
      </span>
    </div>
  )
}

function periodCountText(heads: string[], line: PeriodLine, full = false) {
  return line.counts
    .map((value, index) => (value == null ? null : `${heads[index]} ${full ? formatQty(value) : compactQty.format(value)}`))
    .filter(Boolean)
    .join(' · ')
}

function KpiPeriodPanel({ title, aside, heads, quarters, halves, total, higherBetter = false, className }: {
  title: string
  aside?: string
  heads: string[]
  quarters: PeriodLine[]
  halves: PeriodLine[]
  total: PeriodLine
  higherBetter?: boolean
  className?: string
}) {
  const lines = [...quarters, ...halves, total]
  const target = total.target
  const scale = Math.max(target * 2, ...lines.map((line) => line.rate ?? 0))
  const countHeads = heads.slice(0, -1)
  const dangerIndex = higherBetter && countHeads.length < 3 ? -1 : countHeads.length - 1

  return (
    <article className={cn('kpi-period-panel flex h-full min-h-0 flex-1 flex-col rounded-2xl border bg-card p-4 shadow-sm print:shadow-none', className)}>
      <header className="mb-3 flex shrink-0 items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="truncate text-[15px] font-bold text-slate-900 dark:text-white">{title}</h2>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            목표 {target}% {higherBetter ? '이상' : '이하'}
            {aside && <span> · {aside}</span>}
          </p>
        </div>
        {target > 0 && (
          <span className="flex shrink-0 items-center gap-1 text-[10px] text-muted-foreground">
            <span className="size-1.5 rounded-full bg-slate-700 dark:bg-slate-200" /> 목표 위치
          </span>
        )}
      </header>

      <div className="grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)_minmax(0,1fr)] gap-2">
        <div className="grid min-h-0 grid-cols-4 gap-2">
          {quarters.map((line) => (
            <div
              key={line.key}
              title={periodCountText(countHeads, line, true) || undefined}
              className="flex min-h-0 min-w-0 flex-col items-center justify-center gap-1.5 rounded-xl border border-border/60 bg-muted/25 px-1 py-2"
            >
              <span className="text-[11px] font-semibold text-muted-foreground">{line.label}</span>
              <PeriodRing rate={line.rate} rateText={lineRateText(line)} target={target} ok={line.ok} scale={scale} higherBetter={higherBetter} size={58} />
              <VerdictPill ok={line.rate == null ? null : line.ok} />
            </div>
          ))}
        </div>
        <div className="grid min-h-0 grid-cols-2 gap-2">
          {halves.map((line) => (
            <div key={line.key} className="flex min-h-0 min-w-0 items-center gap-3 rounded-xl border border-border/60 bg-muted/25 px-3 py-2">
              <PeriodRing rate={line.rate} rateText={lineRateText(line)} target={target} ok={line.ok} scale={scale} higherBetter={higherBetter} size={66} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-1">
                  <span className="text-xs font-bold text-slate-900 dark:text-white">{line.label}</span>
                  <VerdictPill ok={line.rate == null ? null : line.ok} />
                </div>
                <dl className="mt-1.5 space-y-0.5 text-[11px]">
                  {line.counts.map((value, index) => (
                    <div key={countHeads[index]} className="flex items-baseline justify-between gap-2">
                      <dt className="text-muted-foreground">{countHeads[index]}</dt>
                      <dd
                        title={value == null ? undefined : formatQty(value)}
                        className={cn('truncate font-semibold tabular-nums text-slate-800 dark:text-slate-100', index === dangerIndex && (value ?? 0) > 0 && 'text-rose-600 dark:text-rose-400')}
                      >
                        {value == null ? '—' : compactQty.format(value)}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
            </div>
          ))}
        </div>
      </div>

      <footer className="mt-3 flex shrink-0 items-center gap-3 rounded-xl bg-slate-900 px-3.5 py-2.5 text-white dark:bg-slate-800">
        <span className="shrink-0 text-xs font-semibold text-slate-300">연간 누계</span>
        <span className="min-w-0 flex-1 truncate text-[11px] tabular-nums text-slate-400" title={periodCountText(countHeads, total, true)}>
          {periodCountText(countHeads, total, true) || '—'}
        </span>
        <span className={cn('shrink-0 text-base font-bold tabular-nums', total.rate != null && total.ok === false ? 'text-rose-400' : 'text-emerald-400', total.rate == null && 'text-slate-400')}>
          {lineRateText(total)}
        </span>
        <VerdictPill ok={total.rate == null ? null : total.ok} />
      </footer>
    </article>
  )
}

function VerdictPill({ ok }: { ok: boolean | null }) {
  if (ok == null) return <span className="text-[10px] text-muted-foreground">—</span>
  return (
    <span className={cn(
      'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold',
      ok
        ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300'
        : 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300',
    )}>
      <span className={cn('size-1.5 rounded-full', ok ? 'bg-emerald-500' : 'bg-rose-500')} />
      {ok ? '달성' : '미달'}
    </span>
  )
}

function deliveryLine(row: PeriodStat, orders: number): PeriodLine {
  const has = row.inspected > 0
  return {
    key: row.key,
    label: row.label,
    counts: [orders || null, has ? row.inspected : null, has ? row.defect : null],
    rate: has ? row.rate : null,
    target: row.target,
    ok: row.ok,
  }
}

function Metric({ label, value, unit, sub, tone }: { label: string; value: string; unit?: string; sub?: string; tone?: 'rose' | 'green' }) {
  return (
    <div className="border-b px-5 py-4 last:border-b-0 sm:border-r xl:border-b-0 xl:last:border-r-0">
      <p className="text-[13px] font-medium text-muted-foreground">{label}</p>
      <p className={cn('mt-1.5 text-[28px] font-bold leading-none tabular-nums text-slate-900 dark:text-white', tone === 'rose' && 'text-rose-600 dark:text-rose-400', tone === 'green' && 'text-emerald-600 dark:text-emerald-400')}>
        {value}
        {unit && <span className="ml-1 text-sm font-semibold text-muted-foreground">{unit}</span>}
      </p>
      {sub && <p className="mt-1.5 text-xs text-muted-foreground">{sub}</p>}
    </div>
  )
}

function Table({ heads, align, children, sort }: {
  heads: string[]
  align: ('left' | 'right')[]
  children: ReactNode
  sort?: { active: string; dir: 'asc' | 'desc'; keys: readonly (string | null)[]; onSort: (key: string) => void }
}) {
  return (
    <table className="w-full text-[13px]">
      <thead>
        <tr className="border-b text-xs text-muted-foreground">
          {heads.map((head, index) => {
            const key = sort?.keys[index]
            return (
              <th key={`${head}-${index}`} className={cn('py-2 pr-3 font-medium last:pr-0', align[index] === 'right' ? 'text-right' : 'text-left')}>
                {key ? (
                  <button
                    type="button"
                    onClick={() => sort.onSort(key)}
                    aria-label={`${head} 정렬`}
                    className={cn('inline-flex items-center gap-1 hover:text-foreground', align[index] === 'right' && 'flex-row-reverse')}
                  >
                    {head}
                    {sort.active === key
                      ? (sort.dir === 'asc' ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />)
                      : <ArrowUpDown className="size-3 opacity-50" />}
                  </button>
                ) : head}
              </th>
            )
          })}
        </tr>
      </thead>
      <tbody>{children}</tbody>
    </table>
  )
}

function SummaryUnit({ value, unit }: { value: number | string; unit: '건' | '%' }) {
  return (
    <span className="inline-flex items-baseline justify-end gap-0.5 tabular-nums">
      <span>{typeof value === 'number' ? value.toLocaleString('ko-KR') : value}</span>
      <span className="text-[11px] font-medium text-muted-foreground">{unit}</span>
    </span>
  )
}

function SummaryRow<T extends PeriodStat>({ label, months, cell, total, danger, muted, emphasis, compare, totalOk }: { label: ReactNode; months: T[]; cell: (month: T, index: number) => ReactNode; total: ReactNode; danger?: boolean; muted?: boolean; emphasis?: boolean; compare?: boolean; totalOk?: boolean | null }) {
  return (
    <tr className={cn('border-b', muted && 'text-muted-foreground', emphasis && 'bg-sky-50 font-semibold dark:bg-sky-500/10')}>
      <td className={cn('py-2 pr-2 font-medium', emphasis ? 'text-sky-950 dark:text-sky-100' : 'text-foreground')}>{label}</td>
      {months.map((month, index) => (
        <td key={month.key} className={cn(
          'px-1 py-2 text-right align-top',
          emphasis && 'text-sky-950 dark:text-sky-100',
          danger && month.ok === false && 'font-semibold text-rose-600',
          compare && month.inspected > 0 && (month.ok ? 'font-semibold text-emerald-600' : 'font-semibold text-rose-600'),
        )}>{cell(month, index)}</td>
      ))}
      <td className={cn(
        'py-2 pl-1 text-right align-top font-semibold',
        emphasis && 'text-sky-950 dark:text-sky-100',
        compare && totalOk === true && 'text-emerald-600',
        compare && totalOk === false && 'text-rose-600',
      )}>{total}</td>
    </tr>
  )
}

function QuantityText({ bucket }: { bucket?: QuantityBucket }) {
  return (
    <span className="block">
      {quantityLines(bucket).map((line) => (
        <span key={`${line.amount}-${line.unit}`} className="block">
          {line.amount}
          {line.unit && <span className="ml-0.5 text-[11px] font-medium text-muted-foreground">{line.unit}</span>}
        </span>
      ))}
    </span>
  )
}

function gapText(rate: number, target: number) {
  const gap = Math.round((rate - target) * 1000) / 1000
  return formatKpiRateGap(gap)
}

function outgoingRateHint(month: PeriodStat) {
  if (!(month.rateBase ?? 0)) return undefined
  const unit = month.rateBaseUnit ?? ''
  return `작업일보·성적서 ${unit} 기준 · 표의 불량/검사 합계 ÷ 출하 ${month.rateBase!.toLocaleString('ko-KR')}${unit ? ` ${unit}` : ''} (불량률은 작업일보 단위와 맞는 출하로 계산)`
}

function replyOf(closed: number, received: number) {
  return received > 0 ? (closed / received) * 100 : null
}

function replyText(closed: number, received: number) {
  const rate = replyOf(closed, received)
  return rate == null ? '—' : pct(rate)
}

function ReplyGap({ rate, target }: { rate: number | null; target: number }) {
  if (rate == null) return '—'
  const ok = rate >= target
  return <span className={cn('font-semibold', ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600')}>{gapText(rate, target)}</span>
}

function Verdict({ ok, compact, passLabel = '달성', failLabel = '미달', className }: { ok: boolean | null; compact?: boolean; passLabel?: string; failLabel?: string; className?: string }) {
  if (ok == null) return <span className="text-xs text-muted-foreground/60">—</span>
  return (
    <span className={cn(
      'inline-flex items-center gap-1 text-xs font-semibold',
      className,
      ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400',
    )}>
      <span className={cn('h-1.5 w-1.5 rounded-full', ok ? 'bg-emerald-500' : 'bg-rose-500')} />
      {ok ? passLabel : failLabel}
    </span>
  )
}

function ResultBadge({ result, passLabel = '합격', failLabel = '불합격' }: { result: InspectionLot['result']; passLabel?: string; failLabel?: string }) {
  return (
    <span className={cn(
      'inline-flex rounded-md px-1.5 py-0.5 text-[11px] font-semibold',
      result === 'pass' ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300' : 'bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300',
    )}>
      {result === 'pass' ? passLabel : failLabel}
    </span>
  )
}

function deliveryResult(actual: string, promised: string): LotResult {
  if (!actual || !promised) return 'pass'
  return actual <= promised ? 'pass' : 'fail'
}

function Legend({ items }: { items: [string, string][] }) {
  return (
    <div className="flex gap-4 text-xs text-muted-foreground">
      {items.map(([swatch, label]) => (
        <span key={label} className="inline-flex items-center gap-1.5"><span className={cn('inline-block h-2 w-3 rounded-sm', swatch)} />{label}</span>
      ))}
    </div>
  )
}

function PreviewStat({ label, before, after, unit, changed, note }: { label: string; before: string; after: string; unit?: string; changed: boolean; note?: string }) {
  return (
    <div className="flex flex-col justify-center border-r px-4 py-3 last:border-r-0">
      <p className="text-[13px] font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-bold leading-none tabular-nums text-slate-900 dark:text-white">
        {after}
        {unit && <span className="ml-1 text-sm font-semibold text-muted-foreground">{unit}</span>}
      </p>
      <p className={cn('mt-1 text-xs', changed ? 'font-semibold text-sky-700 dark:text-sky-300' : 'text-muted-foreground')}>
        {changed ? `저장 전 ${before}` : (note ?? '변경 없음')}
      </p>
    </div>
  )
}

type CustomerMonth = PeriodStat & { received: number; closed: number }

function MonthTip({ active, row, customer = false, process = false, delivery = false, certificates = false }: { active?: boolean; row?: PeriodStat & Partial<CustomerMonth>; customer?: boolean; process?: boolean; delivery?: boolean; certificates?: boolean }) {
  if (!active || !row) return null
  if (customer) {
    const received = row.received ?? row.inspected ?? 0
    const closed = row.closed ?? row.defect ?? 0
    return (
      <div className="rounded-xl border bg-card px-3 py-2 text-xs shadow-lg">
        <p className="font-semibold">{row.label}</p>
        <p className="mt-1 text-muted-foreground">접수 {received.toLocaleString('ko-KR')}건 · 조치완료 {closed.toLocaleString('ko-KR')}건</p>
        <p className={cn('mt-0.5 font-semibold', row.ok ? 'text-slate-700 dark:text-slate-200' : 'text-rose-600')}>
          회신율 {pct(row.rate)} (목표 {row.target}% 이상)
        </p>
      </div>
    )
  }
  return (
    <div className="rounded-xl border bg-card px-3 py-2 text-xs shadow-lg">
      <p className="font-semibold">{row.label}</p>
      {row.inspected ? (
        <>
          <p className="mt-1 text-muted-foreground">
            {delivery
              ? `납품 ${row.inspected.toLocaleString('ko-KR')}건 · 지연 ${row.defect.toLocaleString('ko-KR')}건`
              : certificates
                ? `출하 ${(row.rateBase ?? 0).toLocaleString('ko-KR')} · 불량 ${row.defect.toLocaleString('ko-KR')}`
                : `${process ? '생산량' : '전체'} ${row.inspected.toLocaleString('ko-KR')} · ${process ? '불량수량' : '불량'} ${row.defect.toLocaleString('ko-KR')}`}
          </p>
          <p className={cn('mt-0.5 font-semibold', row.ok ? 'text-slate-700 dark:text-slate-200' : 'text-rose-600')}>
            {delivery ? '납기준수율' : '불량률'} {pct(row.rate)} (목표 {row.target}% {delivery ? '이상' : '이하'})
          </p>
        </>
      ) : (
        <p className="mt-1 text-muted-foreground">{delivery ? '납품 없음' : '검사 없음'}</p>
      )}
    </div>
  )
}

function Empty({ text }: { text: string }) {
  return <p className="py-14 text-center text-sm text-muted-foreground">{text}</p>
}
