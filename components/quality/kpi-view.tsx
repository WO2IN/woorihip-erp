'use client'

import { useEffect, useMemo, useState, type FormEvent, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react'
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import { ArrowDown, ArrowUp, ArrowUpDown, BarChart3, ChevronLeft, ChevronRight, Lock, LockOpen, Pencil, Plus, Printer, Search, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/components/auth/auth-context'
import { PageHeader } from '@/components/shared/page-header'
import { Button } from '@/components/ui/button'
import { ChartContainer, ChartTooltip } from '@/components/ui/chart'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { SearchableCombobox } from '@/components/ui/searchable-combobox'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger } from '@/components/ui/select'
import { buildAuthHeaders } from '@/lib/auth-client'
import {
  EMPTY_STATE,
  FLOORS,
  KPI_KINDS,
  SCAR_LABEL,
  monthKey,
  sampleState,
  summarize,
  summarizeReply,
  targetFor,
  type KpiKind,
  type Floor,
  type InspectionLot,
  type KpiState,
  type PeriodStat,
  type ScarStatus,
} from '@/lib/incoming-kpi'
import { chosungSearch } from '@/lib/korean'
import { cn } from '@/lib/utils'

const TAB_KEYS = ['overview', 'lots', 'scar', 'vendors', 'targets', 'close'] as const
type TabKey = (typeof TAB_KEYS)[number]

const FIELD = 'h-9 rounded-lg border bg-card px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40'
const pct = (value: number) => `${value.toFixed(2)}%`
const dot = (date: string) => date.replace(/-/g, '.')

function todayIso() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

export function KpiView({ kind = 'incoming' }: { kind?: KpiKind }) {
  const spec = KPI_KINDS[kind]
  const tabs: { key: TabKey; label: string }[] = [
    { key: 'overview', label: '종합현황' },
    { key: 'lots', label: spec.register },
    { key: 'scar', label: '불량 · SCAR' },
    { key: 'vendors', label: '업체 분석' },
    { key: 'targets', label: '목표 설정' },
    { key: 'close', label: '월마감' },
  ].filter((item) => !(kind === 'outgoing' && item.key === 'lots'))
  const { user } = useAuth()
  const canManage = user?.role === 'admin'
  const [state, setState] = useState<KpiState>(EMPTY_STATE)
  const [sample, setSample] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [tab, setTab] = useState<TabKey>('overview')
  const [year, setYear] = useState(() => new Date().getFullYear())
  const [editing, setEditing] = useState<InspectionLot | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [formKey, setFormKey] = useState(0)
  const [pendingDelete, setPendingDelete] = useState<InspectionLot | null>(null)
  const [catalog, setCatalog] = useState<{ companies: string[]; productsByCompany: Record<string, string[]> }>({ companies: [], productsByCompany: {} })
  const [savedClosed, setSavedClosed] = useState<string[]>([])

  const derived = kind === 'outgoing'
  const linked = kind === 'outgoing' || kind === 'customer'

  /** 저장된 검사가 하나도 없으면 목표는 저장된 값을 쓰고, LOT만 예시로 보여 준다. 출하·고객부적합은 원본 기록을 쓴다. */
  const apply = (data: KpiState | null, source = catalog) => {
    if (linked) {
      setState(data ?? EMPTY_STATE)
      setSample(false)
      setSavedClosed(data?.closed ?? [])
      return
    }
    if (data && data.lots.length > 0) {
      setState(data)
      setSample(false)
      setSavedClosed(data.closed)
      return
    }
    const demo = sampleState(new Date(), source, kind)
    setState(data ? { ...demo, target: data.target, monthTargets: data.monthTargets } : demo)
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
        apply(result.data ?? null, source)
      })
      .catch(() => { if (!cancelled) toast.error(`${spec.name} 데이터를 불러오지 못했습니다.`) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, spec.name])

  const summary = useMemo(() => summarize(state, year), [state, year])
  const years = useMemo(() => {
    const set = new Set([new Date().getFullYear(), ...state.lots.map((lot) => Number(lot.date.slice(0, 4)))])
    return [...set].sort((a, b) => b - a)
  }, [state.lots])
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
      apply(result.data)
      return true
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '저장하지 못했습니다.')
      return false
    } finally {
      setSaving(false)
    }
  }

  const openCreate = () => {
    setEditing(null)
    setFormKey((key) => key + 1)
    setFormOpen(true)
  }

  const openEdit = (lot: InspectionLot) => {
    if (sample) return toast.info('예시 데이터는 수정할 수 없습니다. 새 검사를 등록하면 실제 데이터로 시작합니다.')
    if (closed.has(lot.date.slice(0, 7))) return toast.error('마감된 달의 검사는 수정할 수 없습니다.')
    setEditing(lot)
    setFormKey((key) => key + 1)
    setFormOpen(true)
  }

  const saveLot = async (lot: InspectionLot) => {
    if (closed.has(lot.date.slice(0, 7)) && !sample) {
      toast.error('마감된 달에는 검사를 등록할 수 없습니다.')
      return
    }
    const exists = base.lots.some((row) => row.id === lot.id)
    const lots = exists ? base.lots.map((row) => (row.id === lot.id ? lot : row)) : [lot, ...base.lots]
    const ok = await persist({ ...base, lots }, `${spec.name} ${exists ? '수정' : '등록'}: ${lot.vendor} ${lot.product} (${lot.date})`)
    if (ok) {
      setFormOpen(false)
      toast.success(exists ? '검사를 수정했습니다.' : '검사를 등록했습니다.')
    }
  }

  const askRemove = (lot: InspectionLot) => {
    if (!sample && closed.has(lot.date.slice(0, 7))) return toast.error('마감된 달의 검사는 삭제할 수 없습니다.')
    setPendingDelete(lot)
  }

  const confirmRemove = async () => {
    const lot = pendingDelete
    if (!lot) return
    setPendingDelete(null)
    if (sample) {
      setState((current) => ({ ...current, lots: current.lots.filter((row) => row.id !== lot.id) }))
      return
    }
    const ok = await persist({ ...state, lots: state.lots.filter((row) => row.id !== lot.id) }, `${spec.name} 삭제: ${lot.vendor} ${lot.product} (${lot.date})`)
    if (ok) toast.success('삭제했습니다.')
  }

  const updateScar = async (lot: InspectionLot, patch: Partial<Pick<InspectionLot, 'scar' | 'scarDue'>>) => {
    const next = { ...state, lots: state.lots.map((row) => (row.id === lot.id ? { ...row, ...patch } : row)) }
    if (sample) {
      setState(next)
      return
    }
    await persist(next, `SCAR 변경: ${lot.vendor} (${lot.date})`)
  }

  const saveTargets = async (target: number, monthTargets: Record<string, number>) => {
    const ok = await persist({ ...base, target, monthTargets }, `${spec.name} 목표 변경: 기본 ${target}%`)
    if (ok) toast.success('목표를 저장했습니다.')
  }

  const toggleClose = async (key: string) => {
    const isClosed = base.closed.includes(key)
    const next = isClosed ? base.closed.filter((month) => month !== key) : [...base.closed, key]
    const ok = await persist({ ...base, closed: next }, `${spec.name} ${key} ${isClosed ? '마감 해제' : '마감'}`)
    if (ok) toast.success(isClosed ? '마감을 해제했습니다.' : '마감했습니다.')
  }

  const processYear = kind === 'process' ? quantityOutcome(summary.lots) : null

  return (
    <main className="mx-auto flex w-full max-w-[1400px] flex-col gap-5 p-6">
      <div className={tab === 'close' ? 'no-print' : undefined}>
        <PageHeader
          tone="green"
          icon={BarChart3}
          eyebrow="KPI · KPI 관리"
          title={spec.title}
          description={spec.description}
          stat={processYear
          ? { label: `${year}년 공정 불량률`, value: processYear.rate == null ? '—' : processYear.rate.toFixed(2), unit: processYear.rate == null ? undefined : '%', sub: `목표 ${state.target}% 이하` }
          : kind === 'customer'
          ? { label: `${year}년 접수`, value: summary.total.inspected.toLocaleString('ko-KR'), unit: '건', sub: summary.total.inspected ? `회신율 ${((summary.lots.filter((lot) => lot.scar === 'closed').length / summary.total.inspected) * 100).toFixed(1)}%` : '접수 없음' }
          : derived
          ? { label: `${year}년 출하검사 실적`, value: summary.total.inspected.toLocaleString('ko-KR'), unit: '건', sub: `목표 ${state.target}% 이하` }
          : { label: `${year}년 LOT 불량률`, value: summary.total.inspected ? summary.total.rate.toFixed(2) : '—', unit: summary.total.inspected ? '%' : undefined, sub: `목표 ${state.target}% 이하` }}
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <nav className="flex gap-1 overflow-x-auto rounded-xl border bg-card p-1" aria-label={`${spec.title} 메뉴`}>
          {tabs.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setTab(item.key)}
              className={cn(
                'h-8 shrink-0 rounded-lg px-3 text-[13px] font-semibold transition-colors',
                tab === item.key ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900' : 'text-slate-600 hover:bg-muted dark:text-slate-300',
              )}
            >
              {item.label}
            </button>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <select aria-label="연도" value={year} onChange={(event) => setYear(Number(event.target.value))} className={FIELD}>
            {years.map((item) => <option key={item} value={item}>{item}년</option>)}
          </select>
          {canManage && !linked && (
            <Button size="lg" onClick={openCreate} disabled={saving}>
              <Plus /> 검사 등록
            </Button>
          )}
        </div>
      </div>

      {sample && !loading && (
        <p className={cn('rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-[13px] text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200', tab === 'close' && 'no-print')}>
          저장된 검사가 없어 예시 LOT를 보여 주고 있습니다. 목표와 마감은 저장해도 예시는 그대로 남고, 첫 검사를 등록하면 예시가 사라지고 실제 데이터로 시작합니다.
        </p>
      )}

      {loading ? (
        <p className="py-20 text-center text-sm text-muted-foreground">불러오는 중…</p>
      ) : (
        <>
          {tab === 'overview' && <Overview state={state} year={year} certificates={derived} customer={kind === 'customer'} process={kind === 'process'} />}
          {tab === 'lots' && <LotsTab lots={summary.lots} closed={closed} canManage={canManage && !sample && !linked} certificates={derived} customer={kind === 'customer'} onEdit={openEdit} onRemove={askRemove} />}
          {tab === 'scar' && <ScarTab lots={summary.lots.filter((lot) => lot.result === 'fail')} canManage={canManage && !linked} customer={kind === 'customer'} onChange={updateScar} onRemove={askRemove} />}
          {tab === 'vendors' && <VendorTab rows={kind === 'customer' ? summarizeReply(state, year).vendors : summary.vendors} target={state.target} certificates={derived} customer={kind === 'customer'} />}
          {tab === 'targets' && <TargetTab key={`${year}-${state.target}-${JSON.stringify(state.monthTargets)}`} state={state} year={year} canManage={canManage} saving={saving} certificates={derived} customer={kind === 'customer'} onSave={saveTargets} />}
          {tab === 'close' && <CloseTab title={spec.title} year={year} months={kind === 'customer' ? summarizeReply(state, year).months : summary.months} closed={closed} sample={sample} certificates={derived} customer={kind === 'customer'} canManage={canManage && !sample} saving={saving} onToggle={toggleClose} />}
        </>
      )}

      <LotDialog
        key={formKey}
        open={formOpen}
        onOpenChange={setFormOpen}
        lot={editing}
        companies={catalog.companies}
        productsByCompany={catalog.productsByCompany}
        closed={sample ? new Set() : closed}
        saving={saving}
        registerLabel={spec.register}
        description={spec.dialog}
        quantityLabel={spec.quantity}
        onSubmit={saveLot}
      />
      <AlertDialog open={pendingDelete != null} onOpenChange={(open) => { if (!open) setPendingDelete(null) }}>
        <AlertDialogContent className="sm:max-w-sm">
          <AlertDialogHeader className="w-full place-items-stretch text-left">
            <AlertDialogTitle className="text-left">검사를 삭제할까요?</AlertDialogTitle>
            {pendingDelete && (
              <dl className="grid grid-cols-[4.25rem_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-sm">
                <dt className="text-muted-foreground">검사일</dt>
                <dd className="min-w-0">{dot(pendingDelete.date)}</dd>
                <dt className="text-muted-foreground">업체명</dt>
                <dd className="min-w-0 truncate">{pendingDelete.vendor}</dd>
                <dt className="text-muted-foreground">품목</dt>
                <dd className="min-w-0 truncate">{pendingDelete.product || '—'}</dd>
              </dl>
            )}
            <AlertDialogDescription className="text-left text-pretty">
              삭제한 뒤에는 되돌릴 수 없습니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction variant="destructive" disabled={saving} onClick={confirmRemove}>삭제</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  )
}

function Overview({ state, year, certificates = false, customer = false, process = false }: { state: KpiState; year: number; certificates?: boolean; customer?: boolean; process?: boolean }) {
  const [scope, setScope] = useState<'all' | 'vendor'>('all')
  const [vendor, setVendor] = useState('')
  const vendors = useMemo(() => {
    const names = new Set(state.lots.filter((lot) => lot.date.startsWith(`${year}-`)).map((lot) => lot.vendor))
    return [...names].sort((a, b) => a.localeCompare(b, 'ko'))
  }, [state.lots, year])
  const selected = vendors.includes(vendor) ? vendor : (vendors[0] ?? '')
  const summary = useMemo(() => {
    const lots = scope === 'vendor' && selected ? state.lots.filter((lot) => lot.vendor === selected) : state.lots
    return summarize({ ...state, lots }, year)
  }, [state, year, scope, selected])
  const { total, months, quarters, halves, judged, achieved, zeroMonths, streak } = summary
  const replySummary = useMemo(() => (customer ? summarizeReply({ ...state, lots: summary.lots }, year) : null), [customer, state, summary.lots, year])
  const shipped = useMemo(() => quantityByMonth(summary.lots), [summary.lots])
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
  let quietStreak = 0
  for (let index = elapsedMonths - 1; index >= 0 && customerChart[index].received === 0; index -= 1) quietStreak += 1
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
  const processChart = processMonths.map((month) => ({
    ...month,
    inspected: month.produced,
    defect: month.defectQty,
    rate: month.qtyRate ?? 0,
  }))
  const processPeriods = (size: number, labelOf: (index: number) => string) => Array.from({ length: 12 / size }, (_, index) => {
    const slice = processMonths.slice(index * size, index * size + size)
    const produced = slice.reduce((sum, month) => sum + month.produced, 0)
    const defect = slice.reduce((sum, month) => sum + month.defectQty, 0)
    const rate = produced > 0 ? (defect / produced) * 100 : 0
    const target = Math.min(...slice.map((month) => month.target))
    return { key: `${labelOf(index)}`, label: labelOf(index), inspected: produced, defect, rate, target, ok: produced > 0 ? rate <= target : null }
  })
  const chartScale = monthlyScale(Math.max(0, ...(customer
    ? customerChart.map((month) => Math.max(month.received, month.closed))
    : process
      ? processChart.map((month) => month.inspected)
      : months.map((month) => month.inspected))))

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div role="group" aria-label="집계 범위" className="grid h-9 grid-cols-2 gap-0.5 rounded-lg border bg-muted/40 p-0.5">
          {([['all', '전체'], ['vendor', '업체별']] as const).map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={scope === value}
              onClick={() => setScope(value)}
              className={cn(
                'rounded-md px-3 text-[13px] font-semibold transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/40',
                scope === value ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:bg-background hover:text-foreground',
              )}
            >
              {label}
            </button>
          ))}
        </div>
        {scope === 'vendor' && vendors.length > 0 && (
          <Select value={selected} onValueChange={(value) => value && setVendor(value)}>
            <SelectTrigger aria-label="업체명" className="h-9 min-w-[10rem] bg-card">
              <span>{selected}</span>
            </SelectTrigger>
            <SelectContent align="start">
              <SelectGroup>
                {vendors.map((name) => <SelectItem key={name} value={name}>{name}</SelectItem>)}
              </SelectGroup>
            </SelectContent>
          </Select>
        )}
        {scope === 'vendor' && vendors.length === 0 && <p className="text-sm text-muted-foreground">{customer ? '접수된 업체가 없습니다.' : certificates ? '출하검사 실적이 있는 업체가 없습니다.' : '검사한 업체가 없습니다.'}</p>}
      </div>
      <section className="grid overflow-hidden rounded-2xl border bg-card shadow-sm sm:grid-cols-2 xl:grid-cols-5">
        {process && processTotals ? (
          <>
            <Metric label="총생산량 (검사수량)" value={formatQty(processTotals.produced)} sub={`${year}년 누계`} />
            <Metric label="총 불량수량" value={formatQty(processTotals.defect)} sub="불합격 수량" tone={processTotals.defect ? 'rose' : undefined} />
            <Metric label="누계 공정 불량률" value={processTotals.rate == null ? '—' : processTotals.rate.toFixed(2)} unit={processTotals.rate == null ? '' : '%'} sub={`목표 ${total.target}% 이하`} tone={processTotals.rate == null ? undefined : processTotals.rate <= total.target ? 'green' : 'rose'} />
            <Metric label="목표 달성 월수" value={processJudged.length ? `${processAchievedMonths.length} / ${processJudged.length}` : '—'} unit={processJudged.length ? '개월' : ''} sub={processAchievedMonths.length ? processAchievedMonths.map((month) => month.label).join(', ') : '달성한 달 없음'} />
            <Metric
              label="최고/최저 불량률"
              value={processHigh?.qtyRate != null && processLow?.qtyRate != null ? `${processHigh.qtyRate.toFixed(2)} / ${processLow.qtyRate.toFixed(2)}` : '—'}
              unit={processHigh ? '%' : ''}
              sub={processHigh && processLow ? (processHigh.label === processLow.label ? processHigh.label : `최고 ${processHigh.label} · 최저 ${processLow.label}`) : '판정할 달 없음'}
              tone={processHigh?.ok === false ? 'rose' : processHigh ? 'green' : undefined}
            />
          </>
        ) : customer ? (
          <>
            <Metric label="고객부적합 접수" value={received.length.toLocaleString('ko-KR')} unit="건" sub={`${year}년 누계`} tone={received.length ? 'rose' : undefined} />
            <Metric label="부적합 조치" value={(replied + acting).toLocaleString('ko-KR')} unit="건" sub={`완료 ${replied} · 진행 ${acting}`} />
            <Metric label="누계 회신율" value={replyRate == null ? '—' : replyRate.toFixed(1)} unit={replyRate == null ? '' : '%'} sub={received.length ? `완료 ${replied} / 접수 ${received.length}` : '접수 없음'} tone={replyRate == null ? undefined : replyRate >= 100 ? 'green' : 'rose'} />
            <Metric label="목표 달성" value={`${replySummary?.achieved ?? 0} / ${replySummary?.judged ?? 0}`} unit="개월" sub={replySummary?.judged ? `달성률 ${Math.round(((replySummary.achieved) / replySummary.judged) * 100)}%` : '접수된 달 없음'} />
            <Metric label="무부적합 월" value={`${quietMonths}`} unit="개월" sub={quietStreak ? `최근 ${quietStreak}개월 연속` : '최근 달에 부적합 있음'} />
          </>
        ) : (
          <>
            <Metric label={certificates ? '출하검사 실적' : '총 검사 LOT'} value={total.inspected.toLocaleString('ko-KR')} unit={certificates ? '건' : 'LOT'} sub={`${year}년 누계`} />
            <Metric label={certificates ? '불량' : '불량 LOT'} value={total.defect.toLocaleString('ko-KR')} unit={certificates ? '건' : 'LOT'} sub="불합격 판정" tone={total.defect ? 'rose' : undefined} />
            <Metric label={certificates ? '불량률' : 'LOT 불량률'} value={total.inspected ? total.rate.toFixed(2) : '—'} unit={total.inspected ? '%' : ''} sub={`목표 ${total.target}% 이하`} tone={total.ok === false ? 'rose' : total.ok ? 'green' : undefined} />
            <Metric label="목표 달성" value={`${achieved} / ${judged}`} unit="개월" sub={judged ? `달성률 ${achieveRate}%` : '검사한 달 없음'} />
            <Metric label="무불량 월" value={`${zeroMonths}`} unit="개월" sub={streak ? `최근 ${streak}개월 연속` : '최근 달에 불량 있음'} />
          </>
        )}
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Card
          title={customer ? '월별 접수 · 조치' : process ? '월별 생산량' : certificates ? '월별 출하검사 실적' : '월별 검사 LOT'}
          aside={<Legend items={customer ? [['bg-rose-500', '접수'], ['bg-blue-600', '조치완료']] : [['bg-blue-600', process ? '생산량' : certificates ? '출하검사 실적' : '검사'], ['bg-rose-500', process ? '불량수량' : '불량']]} />}
          className="flex flex-col"
        >
          {judged === 0 ? (
            <Empty text={customer ? `${year}년 접수된 고객부적합이 없습니다.` : certificates ? `${year}년 등록된 출하검사 실적이 없습니다.` : `${year}년 검사 기록이 없습니다.`} />
          ) : customer ? (
            <ChartContainer config={{ received: { label: '접수', color: '#e11d48' }, closed: { label: '조치완료', color: '#2563eb' } }} className="aspect-auto h-auto min-h-[280px] w-full flex-1">
              <BarChart data={customerChart} barGap={3} barCategoryGap="22%" margin={{ top: 28, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 12 }} />
                <YAxis domain={[0, chartScale.top]} ticks={chartScale.ticks} allowDecimals={false} tickLine={false} axisLine={false} width={44} tick={{ fontSize: 11 }} tickFormatter={(value) => Number(value).toLocaleString('ko-KR')} />
                <ChartTooltip cursor={{ fill: 'rgba(225, 29, 72, 0.06)' }} content={({ active, payload }) => <MonthTip active={active} row={payload?.[0]?.payload as CustomerMonth | undefined} customer />} />
                <Bar dataKey="received" name="received" fill="#e11d48" maxBarSize={16} shape={CountBar} isAnimationActive={false} />
                <Bar dataKey="closed" name="closed" fill="#2563eb" maxBarSize={16} shape={CountBar} isAnimationActive={false} />
              </BarChart>
            </ChartContainer>
          ) : (
            <ChartContainer config={{ inspected: { label: process ? '생산량' : certificates ? '출하검사 실적' : '검사', color: '#2563eb' } }} className="aspect-auto h-auto min-h-[280px] w-full flex-1">
              <BarChart data={process ? processChart : months} barCategoryGap="28%" margin={{ top: 36, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 12 }} />
                <YAxis domain={[0, chartScale.top]} ticks={chartScale.ticks} tickLine={false} axisLine={false} width={44} tick={{ fontSize: 11 }} tickFormatter={(value) => Number(value).toLocaleString('ko-KR')} />
                <ChartTooltip cursor={{ fill: 'rgba(37, 99, 235, 0.06)' }} content={({ active, payload }) => <MonthTip active={active} row={payload?.[0]?.payload as PeriodStat | undefined} process={process} />} />
                <Bar dataKey="inspected" name="inspected" fill="#2563eb" maxBarSize={28} shape={VolumeBar} isAnimationActive={false} />
              </BarChart>
            </ChartContainer>
          )}
        </Card>

        <div className="grid gap-4">
          <Card title="분기별 실적">
            <Table heads={customer ? ['구분', '접수', '조치', '회신율', '판정'] : process ? ['구분', '생산량', '불량수량', '불량률', '판정'] : ['구분', '검사', '불량', '불량률', '판정']} align={['left', 'right', 'right', 'right', 'right']}>
              {(customer ? replySummary?.quarters ?? [] : process ? processPeriods(3, (index) => `${index + 1}분기`) : quarters).map((row) => (
                <tr key={row.key} className="border-b last:border-0">
                  <td className="py-2 pr-3 font-medium">{row.label}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{row.inspected ? formatQty(row.inspected) : '—'}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{row.inspected ? formatQty(row.defect) : '—'}</td>
                  <td className={cn('py-2 pr-3 text-right tabular-nums', row.ok === false && 'font-semibold text-rose-600')}>{row.inspected ? pct(row.rate) : '—'}</td>
                  <td className="py-2 text-right"><Verdict ok={row.ok} /></td>
                </tr>
              ))}
            </Table>
          </Card>

          <Card title="반기별 실적">
            <Table heads={customer ? ['구분', '접수', '조치', '회신율', '판정'] : process ? ['구분', '생산량', '불량수량', '불량률', '판정'] : ['구분', '검사', '불량', '불량률', '판정']} align={['left', 'right', 'right', 'right', 'right']}>
              {(customer ? replySummary?.halves ?? [] : process ? processPeriods(6, (index) => index === 0 ? '상반기' : '하반기') : halves).map((row) => (
                <tr key={row.key} className="border-b last:border-0">
                  <td className="py-2 pr-3 font-medium">{row.label}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{row.inspected ? formatQty(row.inspected) : '—'}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{row.inspected ? formatQty(row.defect) : '—'}</td>
                  <td className={cn('py-2 pr-3 text-right tabular-nums', row.ok === false && 'font-semibold text-rose-600')}>{row.inspected ? pct(row.rate) : '—'}</td>
                  <td className="py-2 text-right"><Verdict ok={row.ok} /></td>
                </tr>
              ))}
            </Table>
          </Card>
        </div>
      </section>

      <section>
        <Card title="월별 KPI 집계표">
          <table className="w-full table-fixed text-[13px] leading-snug">
            <colgroup>
              <col className={customer ? 'w-[7rem]' : 'w-[5.5rem]'} />
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
                    <SummaryRow label="출하수량" months={months} cell={(month) => (month.inspected ? <QuantityText bucket={shipped.byMonth.get(month.key)} /> : '—')} total={total.inspected ? <QuantityText bucket={shipped.total} /> : '—'} />
                    <SummaryRow label="검사수량" months={months} cell={(month) => (month.inspected ? String(month.inspected) : '—')} total={String(total.inspected)} />
                    <SummaryRow label="불량수량" months={months} cell={(month) => (month.inspected ? String(month.defect) : '—')} total={String(total.defect)} />
                    <SummaryRow label="불량률" months={months} cell={(month) => (month.inspected ? `${month.rate.toFixed(1)}%` : '—')} total={total.inspected ? pct(total.rate) : '—'} danger />
                    <SummaryRow label="목표대비" months={months} cell={(month) => (month.inspected ? gapText(month.rate, month.target) : '—')} total={total.inspected ? gapText(total.rate, total.target) : '—'} compare totalOk={total.ok} />
                  </>
                ) : (
                  <>
                    <SummaryRow label="목표" months={months} cell={(month) => `${month.target}%`} total={`${total.target}%`} emphasis />
                    <SummaryRow label="검사 LOT" months={months} cell={(month) => (month.inspected ? String(month.inspected) : '—')} total={String(total.inspected)} />
                    <SummaryRow label="불량 LOT" months={months} cell={(month) => (month.inspected ? String(month.defect) : '—')} total={String(total.defect)} />
                    <SummaryRow label="불량률" months={months} cell={(month) => (month.inspected ? `${month.rate.toFixed(1)}%` : '—')} total={total.inspected ? pct(total.rate) : '—'} danger />
                  </>
                )}
                <tr>
                  <td className="py-2 pr-2 font-medium">판정</td>
                  {process ? processMonths.map((month) => (
                    <td key={month.key} className="px-1 py-2 text-right"><Verdict ok={month.ok} compact /></td>
                  )) : customer ? customerChart.map((month) => {
                    const rate = replyOf(month.closed, month.received)
                    return <td key={month.key} className="px-1 py-2 text-right"><Verdict ok={rate == null ? null : rate >= month.target} compact /></td>
                  }) : months.map((month) => (
                    <td key={month.key} className="px-1 py-2 text-right"><Verdict ok={month.ok} compact /></td>
                  ))}
                  <td className="py-2 pl-1 text-right font-semibold">
                    {process
                      ? `${processAchievedMonths.length}/${processJudged.length}`
                      : customer
                      ? `${customerChart.filter((month) => { const rate = replyOf(month.closed, month.received); return rate != null && rate >= month.target }).length}/${customerChart.filter((month) => month.received > 0).length}`
                      : `${achieved}/${judged}`}
                  </td>
                </tr>
              </tbody>
            </table>
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

function LotsTab({ lots, closed, canManage, certificates = false, customer = false, onEdit, onRemove }: { lots: InspectionLot[]; closed: Set<string>; canManage: boolean; certificates?: boolean; customer?: boolean; onEdit: (lot: InspectionLot) => void; onRemove: (lot: InspectionLot) => void }) {
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
      title={customer ? '고객부적합' : certificates ? '출하검사 실적' : '검사 LOT'}
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
          {([['all', '전체'], ['pass', '합격'], ['fail', '불합격']] as const).map(([value, label]) => (
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
            placeholder={customer ? '업체, 부적합 내용 검색' : '업체명, 품목, 불량 내용 검색'}
            className={cn(FIELD, 'w-full pl-9')}
          />
        </label>
      </div>
      {rows.length === 0 ? (
        <Empty text={customer ? '조건에 맞는 고객부적합이 없습니다.' : certificates ? '조건에 맞는 출하검사 실적이 없습니다.' : '조건에 맞는 검사가 없습니다.'} />
      ) : (
        <div>
          <Pager page={current} pageCount={pageCount} total={rows.length} onPage={setPage} edge="top" />
          <div className="overflow-x-auto">
          <Table
            heads={customer ? ['발생일', '업체', '부적합내용', '조치'] : ['검사일', '업체명', '품목', '층', '수량', '판정', '불량 내용', '']}
            align={customer ? ['left', 'left', 'left', 'left'] : ['left', 'left', 'left', 'left', 'right', 'left', 'left', 'right']}
            sort={{ active: sort.key, dir: sort.dir, keys: customer ? ['date', 'vendor', 'defect', null] : LOT_SORT_KEYS, onSort: toggleSort }}
          >
            {shown.map((lot) => {
              const locked = closed.has(lot.date.slice(0, 7))
              return (
                <tr key={lot.id} className="border-b last:border-0">
                  <td className="whitespace-nowrap py-2 pr-3 tabular-nums">{dot(lot.date)}</td>
                  <td className="py-2 pr-3 font-medium">{lot.vendor}</td>
                  {customer ? (
                    <>
                      <td className="max-w-[24rem] truncate py-2 pr-3 text-muted-foreground">{lot.defect || '—'}</td>
                      <td className="py-2 pr-3">{lot.scar === 'closed' ? '완료' : lot.scar === 'action' ? '진행' : '미진행'}</td>
                    </>
                  ) : (
                    <>
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

function ScarTab({ lots, canManage, customer = false, onChange, onRemove }: {
  lots: InspectionLot[]
  canManage: boolean
  customer?: boolean
  onChange: (lot: InspectionLot, patch: Partial<Pick<InspectionLot, 'scar' | 'scarDue'>>) => void
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
  return (
    <div className="space-y-4">
      <section className="grid overflow-hidden rounded-2xl border bg-card shadow-sm sm:grid-cols-4">
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

function VendorTab({ rows, target, certificates = false, customer = false }: { rows: PeriodStat[]; target: number; certificates?: boolean; customer?: boolean }) {
  const max = Math.max(target * 2, ...rows.map((row) => row.rate), 1)
  return (
    <Card title={customer ? '업체별 회신율' : '업체별 불량률'} aside={<span className="text-xs text-muted-foreground">{customer ? `목표 ${target}% 이상` : `목표 ${target}% 이하`}</span>}>
      {rows.length === 0 ? (
        <Empty text={customer ? '접수된 업체가 없습니다.' : certificates ? '출하검사 실적이 있는 업체가 없습니다.' : '검사한 업체가 없습니다.'} />
      ) : (
        <Table heads={customer ? ['업체명', '접수', '조치완료', '회신율', '판정'] : ['업체명', certificates ? '출하검사 실적' : '검사 LOT', certificates ? '불량 건수' : '불량 LOT', '불량률', '판정']} align={['left', 'right', 'right', 'left', 'right']}>
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

function TargetTab({ state, year, canManage, saving, certificates = false, customer = false, onSave }: { state: KpiState; year: number; canManage: boolean; saving: boolean; certificates?: boolean; customer?: boolean; onSave: (target: number, months: Record<string, number>) => void }) {
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
  const summarizeFor = customer ? summarizeReply : summarize
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
      <section className="grid overflow-hidden rounded-xl border bg-card shadow-sm md:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
        <div className="px-4 py-3">
          <p className="text-[13px] font-semibold text-muted-foreground">연간 기본 목표 · LOT 불량률</p>
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
              <span className="text-sm font-semibold text-muted-foreground">% 이하</span>
            </span>
            <button type="button" aria-label="목표 0.1 올리기" disabled={!canManage} onClick={() => step(0.1)} className="flex h-9 w-9 items-center justify-center rounded-lg border text-lg font-bold text-muted-foreground hover:bg-muted disabled:opacity-40">+</button>
          </div>
          {canManage && (
            <div className="mt-2 flex flex-wrap gap-1">
              {['0.5', '1', '1.5', '2', '3', '5'].map((value) => (
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
          <p className="mt-2 text-xs leading-5 text-muted-foreground">따로 정하지 않은 달은 이 값으로 판정합니다. {customer ? '조치완료 ÷ 접수가 목표 이상이면 달성입니다.' : certificates ? '불량 ÷ 출하검사 실적이 목표 이하이면 달성입니다.' : '불량 LOT ÷ 검사 LOT가 목표 이하이면 달성입니다.'}</p>
        </div>
        <div className="grid grid-cols-2 border-t bg-muted/30 md:border-l md:border-t-0">
          <PreviewStat label="목표 달성" before={`${before.achieved} / ${before.judged}`} after={`${after.achieved} / ${after.judged}`} unit="개월" changed={before.achieved !== after.achieved} />
          <PreviewStat label="연간 판정" before={before.total.ok == null ? '—' : before.total.ok ? '달성' : '미달'} after={after.total.ok == null ? '—' : after.total.ok ? '달성' : '미달'} changed={before.total.ok !== after.total.ok} note={after.total.inspected ? `실적 ${after.total.rate.toFixed(2)}%` : (customer ? '접수 없음' : '검사 없음')} />
        </div>
      </section>

      <Card
        title={`${year}년 월별 목표`}
        aside={canManage ? (
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setMonths(MONTH_NUMBERS, '')}>모두 기본으로</Button>
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
                  <span className="block">{customer ? '접수' : certificates ? '출하검사 실적' : '검사한 LOT'}</span>
                  <span className="block font-normal text-muted-foreground/70">{customer ? '그 중 조치완료' : '그 중 불량'}</span>
                </th>
                <th className="py-3 pr-3 text-left font-medium">
                  <span className="block">{customer ? '실적 회신율' : '실적 불량률'}{canManage ? ' · 점을 끌면 목표' : ''}</span>
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
                        <div className="leading-tight" title={customer ? `접수 ${row.inspected}건 중 조치완료 ${row.defect}건` : `${certificates ? '출하검사 실적' : '검사'} ${row.inspected}건 중 불량 ${row.defect}건`}>
                          <div className="text-foreground"><span className="font-semibold">{row.inspected}</span><span className="ml-1 text-[11px] font-medium text-muted-foreground">{customer || certificates ? '건' : 'LOT'}</span></div>
                          <div className="text-[11px] text-muted-foreground">{customer ? '조치' : '불량'} <span className={cn('font-semibold', row.defect > 0 ? 'text-rose-600' : 'text-foreground')}>{row.defect}</span></div>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">{customer ? '접수 없음' : '검사 없음'}</span>
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
                        <span className="w-14 text-right leading-tight" title={row.inspected ? (customer ? `회신율 ${row.rate.toFixed(1)}% (조치 ${row.defect} ÷ 접수 ${row.inspected})` : `실적 불량률 ${row.rate.toFixed(1)}% (불량 ${row.defect} ÷ 검사 ${row.inspected})`) : (customer ? '접수 없음' : '검사 없음')}>
                          <span className="block text-[10px] font-medium text-muted-foreground">실적</span>
                          <span className={cn('text-sm font-bold', row.ok === false ? 'text-rose-600' : row.inspected ? 'text-emerald-600' : 'text-muted-foreground')}>{row.inspected ? `${row.rate.toFixed(1)}%` : '—'}</span>
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
          <span>실적 % = {certificates ? '불량 ÷ 출하검사 실적' : '불량 LOT ÷ 검사 LOT'}</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-2 w-4 rounded-full bg-emerald-500" />실적이 목표 이하 · 달성</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-2 w-4 rounded-full bg-rose-500" />실적이 목표보다 높음 · 미달</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded-full border-2 border-slate-700 bg-white dark:border-white dark:bg-slate-900" />점 = 목표{canManage ? ', 끌어서 조정' : ''}</span>
        </p>
      </Card>

      {canManage && dirty && (
        <div className="sticky bottom-4 z-10 flex items-center gap-4 rounded-2xl border bg-card/95 px-5 py-4 shadow-lg backdrop-blur">
          <span className="text-base font-semibold">
            저장하지 않은 변경 {changes + (base !== state.target ? 1 : 0)}건
          </span>
          <span className="text-sm text-muted-foreground">목표 달성 {before.achieved}/{before.judged} → {after.achieved}/{after.judged}개월</span>
          <Button type="button" variant="ghost" className="ml-auto h-10 px-4" onClick={reset}>되돌리기</Button>
          <Button type="submit" className="h-10 px-5" disabled={saving}>{saving ? '저장 중…' : '목표 저장'}</Button>
        </div>
      )}
    </form>
  )
}

function CloseTab({ title, year, months, closed, sample, certificates = false, customer = false, canManage, saving, onToggle }: {
  title: string
  year: number
  months: PeriodStat[]
  closed: Set<string>
  sample: boolean
  certificates?: boolean
  customer?: boolean
  canManage: boolean
  saving: boolean
  onToggle: (key: string) => void
}) {
  const today = new Date()
  const current = monthKey(today.getFullYear(), today.getMonth() + 1)
  const closedCount = months.filter((month) => closed.has(month.key)).length
  const upcoming = months.filter((month) => month.key > current).length
  const openCount = months.length - closedCount - upcoming
  const achieved = months.filter((month) => month.ok === true).length
  const missed = months.filter((month) => month.ok === false).length
  const quarters = [0, 1, 2, 3].map((quarter) => ({
    label: `${quarter + 1}분기`,
    rows: months.slice(quarter * 3, quarter * 3 + 3),
  }))

  useEffect(() => {
    const onBefore = () => document.body.classList.add('kpi-close-print')
    const onAfter = () => document.body.classList.remove('kpi-close-print')
    window.addEventListener('beforeprint', onBefore)
    window.addEventListener('afterprint', onAfter)
    return () => {
      document.body.classList.remove('kpi-close-print')
      window.removeEventListener('beforeprint', onBefore)
      window.removeEventListener('afterprint', onAfter)
    }
  }, [])

  return (
    <section className="kpi-close-sheet grid gap-4">
      <div className="kpi-close-head flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold text-muted-foreground">WOORI-HIP · {title}</p>
          <h2 className="mt-0.5 text-lg font-bold text-slate-900 dark:text-white">{year}년 월마감</h2>
          <p className="mt-1 max-w-xl text-xs leading-5 text-muted-foreground no-print">{customer ? '마감은 이 화면의 목표 판정을 고정합니다. 부적합 내용과 조치는 부적합관리에서 바뀝니다.' : '마감한 달은 검사 등록, 수정, 삭제가 막힙니다. 고칠 일이 있으면 마감을 해제한 뒤 수정하세요.'}</p>
          <p className="mt-1 hidden text-xs text-muted-foreground print:block">
            출력일 {today.toLocaleDateString('ko-KR')}
            {sample ? ' · 예시 데이터' : ''}
          </p>
        </div>
        <Button type="button" variant="outline" className="no-print" onClick={() => window.print()}>
          <Printer /> 출력
        </Button>
      </div>

      <div className="kpi-close-stats grid grid-cols-2 gap-2 sm:grid-cols-4">
        <CloseStat label="마감" value={String(closedCount)} unit="개월" />
        <CloseStat label="진행" value={String(openCount)} unit="개월" />
        <CloseStat label="달성" value={String(achieved)} unit="개월" tone="green" />
        <CloseStat label="미달" value={String(missed)} unit="개월" tone="rose" />
      </div>

      <div className="kpi-close-quarters grid gap-4 lg:grid-cols-2">
        {quarters.map((quarter) => (
          <article key={quarter.label} className="kpi-close-card rounded-2xl border bg-card p-4 shadow-sm print:shadow-none">
            <h3 className="mb-3 text-sm font-bold text-slate-900 dark:text-white">{quarter.label}</h3>
            <div className="kpi-close-months grid gap-2">
              {quarter.rows.map((month) => {
                const isClosed = closed.has(month.key)
                const future = month.key > current
                const now = month.key === current
                return (
                  <div
                    key={month.key}
                    className={cn(
                      'kpi-close-row flex items-center gap-3 rounded-xl border px-3 py-2.5',
                      isClosed && 'bg-slate-50 dark:bg-white/5',
                      now && 'border-primary/50',
                    )}
                  >
                    <div className="flex w-16 shrink-0 items-center gap-1">
                      <p className="font-bold text-slate-900 dark:text-white">{month.label}</p>
                      {now && <span className="shrink-0 rounded bg-primary/10 px-1 py-px text-[10px] font-semibold text-primary">이번</span>}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className={cn('kpi-close-rate text-base font-bold tabular-nums', month.ok === false ? 'text-rose-600' : month.ok ? 'text-emerald-600' : 'text-muted-foreground')}>
                          {month.inspected ? pct(month.rate) : '—'}
                        </span>
                        <Verdict ok={month.ok} compact />
                      </div>
                      <p className="kpi-close-meta truncate text-[11px] text-muted-foreground">
                        {month.inspected ? (customer ? `접수 ${month.inspected}건 · 조치 ${month.defect} · 목표 ${month.target}%` : `${certificates ? '출하검사 실적' : '검사'} ${month.inspected}${certificates ? '건' : ' LOT'} · 불량 ${month.defect} · 목표 ${month.target}%`) : (customer ? '접수 없음' : certificates ? '출하검사 실적 없음' : '검사 없음')}
                      </p>
                    </div>
                    <span className={cn(
                      'shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-semibold',
                      future && 'bg-muted text-muted-foreground',
                      !future && isClosed && 'bg-slate-900 text-white dark:bg-white dark:text-slate-900',
                      !future && !isClosed && 'bg-sky-50 text-sky-700 dark:bg-sky-400/15 dark:text-sky-300',
                    )}>
                      {future ? '예정' : isClosed ? '마감' : '진행'}
                    </span>
                    {canManage && !future && (
                      <Button type="button" variant={isClosed ? 'outline' : 'secondary'} size="sm" disabled={saving} onClick={() => onToggle(month.key)} className="no-print shrink-0">
                        {isClosed ? <><LockOpen /> 해제</> : <><Lock /> 마감</>}
                      </Button>
                    )}
                  </div>
                )
              })}
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}

function CloseStat({ label, value, unit, tone }: { label: string; value: string; unit: string; tone?: 'rose' | 'green' }) {
  return (
    <div className="rounded-xl border bg-card px-4 py-3 print:py-2">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className={cn('mt-1 text-xl font-bold leading-none tabular-nums text-slate-900 dark:text-white', tone === 'rose' && 'text-rose-600', tone === 'green' && 'text-emerald-600')}>
        {value}
        <span className="ml-1 text-xs font-semibold text-muted-foreground">{unit}</span>
      </p>
    </div>
  )
}

function LotDialog({ open, onOpenChange, lot, companies, productsByCompany, closed, saving, registerLabel, description, quantityLabel, onSubmit }: {
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
  const locked = closed.has(form.date.slice(0, 7))

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const companyProducts = productsByCompany[form.vendor] ?? []
    if (!form.date || !form.vendor.trim()) return toast.error('검사일과 업체명을 선택해 주세요.')
    if (!companies.includes(form.vendor)) return toast.error('등록된 업체 목록에서 선택해 주세요.')
    if (companyProducts.length === 0) return toast.error('이 업체에 저장된 품목이 없습니다.')
    if (!companyProducts.includes(form.product)) return toast.error('이 업체가 생산하는 품목을 선택해 주세요.')
    if (locked) return toast.error('마감된 달입니다. 월마감에서 해제한 뒤 등록해 주세요.')
    if (form.result === 'fail' && !form.defect.trim()) return toast.error('불합격이면 불량 내용을 입력해 주세요.')
    onSubmit({ ...form, vendor: form.vendor.trim(), product: form.product.trim() })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={submit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>{lot ? '검사 수정' : registerLabel}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-3">
            <Field label="검사일" required>
              <Input type="date" value={form.date} onChange={(event) => set('date', event.target.value)} aria-invalid={locked} />
            </Field>
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
          </div>

          {form.result === 'fail' && (
            <div className="grid grid-cols-2 gap-3 rounded-xl border border-rose-100 bg-rose-50/50 p-3 dark:border-rose-500/20 dark:bg-rose-500/5">
              <Field label="불량 내용" required className="col-span-2">
                <Input value={form.defect} onChange={(event) => set('defect', event.target.value)} placeholder="예: 치수 이탈, 외관 흠집" />
              </Field>
              <Field label="SCAR 상태">
                <select value={form.scar} onChange={(event) => set('scar', event.target.value as ScarStatus)} className={cn(FIELD, 'h-8 w-full')}>
                  {(Object.keys(SCAR_LABEL) as ScarStatus[]).map((status) => <option key={status} value={status}>{SCAR_LABEL[status]}</option>)}
                </select>
              </Field>
              <Field label="조치 기한">
                <Input type="date" value={form.scarDue} onChange={(event) => set('scarDue', event.target.value)} />
              </Field>
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
    <article className={cn('rounded-2xl border bg-card p-5 shadow-sm', className)}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-[15px] font-bold text-slate-900 dark:text-white">{title}</h2>
        {aside}
      </div>
      {children}
    </article>
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

function SummaryRow<T extends PeriodStat>({ label, months, cell, total, danger, muted, emphasis, compare, totalOk }: { label: ReactNode; months: T[]; cell: (month: T) => ReactNode; total: ReactNode; danger?: boolean; muted?: boolean; emphasis?: boolean; compare?: boolean; totalOk?: boolean | null }) {
  return (
    <tr className={cn('border-b', muted && 'text-muted-foreground', emphasis && 'bg-sky-50 font-semibold dark:bg-sky-500/10')}>
      <td className={cn('py-2 pr-2 font-medium', emphasis ? 'text-sky-950 dark:text-sky-100' : 'text-foreground')}>{label}</td>
      {months.map((month) => (
        <td key={month.key} className={cn(
          'px-1 py-2 text-right align-top',
          emphasis && 'text-sky-950 dark:text-sky-100',
          danger && month.ok === false && 'font-semibold text-rose-600',
          compare && month.inspected > 0 && (month.ok ? 'font-semibold text-emerald-600' : 'font-semibold text-rose-600'),
        )}>{cell(month)}</td>
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
  const gap = Math.round((rate - target) * 100) / 100
  return `${gap > 0 ? '+' : ''}${gap.toFixed(2)}%p`
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

function Verdict({ ok, compact }: { ok: boolean | null; compact?: boolean }) {
  if (ok == null) return <span className="text-xs text-muted-foreground/60">—</span>
  return (
    <span className={cn(
      'inline-flex items-center gap-1 text-xs font-semibold',
      ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400',
    )}>
      <span className={cn('h-1.5 w-1.5 rounded-full', ok ? 'bg-emerald-500' : 'bg-rose-500')} />
      {compact ? (ok ? '달성' : '미달') : ok ? '달성' : '미달'}
    </span>
  )
}

function ResultBadge({ result }: { result: InspectionLot['result'] }) {
  return (
    <span className={cn(
      'inline-flex rounded-md px-1.5 py-0.5 text-[11px] font-semibold',
      result === 'pass' ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300' : 'bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300',
    )}>
      {result === 'pass' ? '합격' : '불합격'}
    </span>
  )
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

function monthlyScale(max: number) {
  if (max <= 0) return { top: 4, ticks: [0, 1, 2, 3, 4] }
  const padded = Math.ceil(max * 1.12)
  if (padded <= 8) {
    const top = Math.max(4, Math.ceil(padded / 4) * 4)
    const step = top / 4
    return { top, ticks: [0, step, step * 2, step * 3, top] }
  }
  const rough = padded / 4
  const magnitude = 10 ** Math.floor(Math.log10(rough))
  const step = ([1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].find((factor) => factor * magnitude >= rough) ?? 10) * magnitude
  const top = step * 4
  const ticks = [0, step, step * 2, step * 3, top].map((value) => (Number.isInteger(value) ? value : Math.round(value * 10) / 10))
  return { top, ticks }
}

function VolumeBar({ x = 0, y = 0, width = 0, height = 0, payload }: { x?: number; y?: number; width?: number; height?: number; payload?: PeriodStat }) {
  if (!payload?.inspected || width <= 0 || height <= 0) return null
  const ratio = Math.min(1, Math.max(0, payload.defect / payload.inspected))
  const defectH = ratio > 0 ? Math.min(height, Math.max(ratio === 1 ? height : 3, height * ratio)) : 0
  const radius = Math.min(4, width / 2)
  const clipId = `kpi-bar-${payload.key}`
  const defectLabel = payload.defect > 0 ? payload.defect.toLocaleString('ko-KR') : null
  return (
    <g>
      <defs>
        <clipPath id={clipId}>
          <rect x={x} y={y} width={width} height={height} rx={radius} />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clipId})`}>
        <rect x={x} y={y} width={width} height={height} fill="#2563eb" />
        {defectH > 0 && <rect x={x} y={y + height - defectH} width={width} height={defectH} fill="#e11d48" />}
      </g>
      <text x={x + width / 2} y={defectLabel ? y - 18 : y - 6} textAnchor="middle" fontSize={11} fontWeight={600} fill="#64748b">
        {payload.inspected.toLocaleString('ko-KR')}
      </text>
      {defectLabel && (
        <text x={x + width / 2} y={y - 6} textAnchor="middle" fontSize={11} fontWeight={700} fill="#e11d48">
          {defectLabel}
        </text>
      )}
    </g>
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

function CountBar({ x = 0, y = 0, width = 0, height = 0, fill = '#2563eb', value }: { x?: number; y?: number; width?: number; height?: number; fill?: string; value?: number | [number, number] }) {
  const count = Array.isArray(value) ? Number(value[1] ?? 0) : Number(value ?? 0)
  if (!count || width <= 0 || height <= 0) return null
  const radius = Math.min(3, width / 2)
  return (
    <g>
      <rect x={x} y={y} width={width} height={height} rx={radius} fill={fill} />
      <text x={x + width / 2} y={y - 6} textAnchor="middle" fontSize={11} fontWeight={700} fill={fill}>
        {count.toLocaleString('ko-KR')}
      </text>
    </g>
  )
}

function MonthTip({ active, row, customer = false, process = false }: { active?: boolean; row?: PeriodStat & Partial<CustomerMonth>; customer?: boolean; process?: boolean }) {
  if (!active || !row) return null
  if (customer) {
    return (
      <div className="rounded-xl border bg-card px-3 py-2 text-xs shadow-lg">
        <p className="font-semibold">{row.label}</p>
        <p className="mt-1 text-rose-600">접수 {row.received ?? 0}건</p>
        <p className="mt-0.5 font-semibold text-blue-700 dark:text-blue-300">조치완료 {row.closed ?? 0}건</p>
      </div>
    )
  }
  return (
    <div className="rounded-xl border bg-card px-3 py-2 text-xs shadow-lg">
      <p className="font-semibold">{row.label}</p>
      {row.inspected ? (
        <>
          <p className="mt-1 text-muted-foreground">{process ? '생산량' : '전체'} {row.inspected.toLocaleString('ko-KR')} · {process ? '불량수량' : '불량'} {row.defect.toLocaleString('ko-KR')}</p>
          <p className={cn('mt-0.5 font-semibold', row.ok ? 'text-slate-700 dark:text-slate-200' : 'text-rose-600')}>불량률 {pct(row.rate)} (목표 {row.target}%)</p>
        </>
      ) : (
        <p className="mt-1 text-muted-foreground">검사 없음</p>
      )}
    </div>
  )
}

function Empty({ text }: { text: string }) {
  return <p className="py-14 text-center text-sm text-muted-foreground">{text}</p>
}
