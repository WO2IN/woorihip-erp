'use client'

import { useId, type ReactNode } from 'react'
import { ArrowDown, ArrowUp, Package } from 'lucide-react'
import { Area, Bar, CartesianGrid, ComposedChart, ReferenceDot, Tooltip, XAxis, YAxis } from 'recharts'
import { ChartContainer, type ChartConfig } from '@/components/ui/chart'
import { LedgerEntry, displayDate, formatQuantity } from '@/lib/stock'

const cardClass = 'rounded-2xl border border-border bg-card shadow-[0_1px_3px_oklch(0_0_0/0.06),0_4px_12px_oklch(0_0_0/0.04)]'

const chartConfig = {
  running: { label: '재고 잔량', color: '#2563eb' },
  inbound: { label: '입고 수량', color: '#3b82f6' },
  outbound: { label: '출고 수량', color: '#fb923c' },
} satisfies ChartConfig

interface StockDay {
  ts: number
  fullDate: string
  inbound: number
  outbound: number
  running: number
  rowKey: string
  unit: string
}

const DAY_MS = 86_400_000

function dayStamp(issueDate: string) {
  const key = issueDate.replace(/\D/g, '')
  if (key.length < 8) return Number.NaN
  return Date.UTC(Number(key.slice(0, 4)), Number(key.slice(4, 6)) - 1, Number(key.slice(6, 8)))
}

function stockDays(rows: LedgerEntry[]): StockDay[] {
  const days: StockDay[] = []
  for (const row of rows) {
    const ts = dayStamp(row.issueDate)
    if (!Number.isFinite(ts)) continue
    let day = days[days.length - 1]
    if (!day || day.ts !== ts) {
      day = {
        ts,
        fullDate: displayDate(row.issueDate),
        inbound: 0,
        outbound: 0,
        running: row.running,
        rowKey: `${row.source}-${row.id}`,
        unit: row.unit,
      }
      days.push(day)
    }
    if (row.kind === '입고') day.inbound += row.quantity
    else day.outbound += row.quantity
    day.running = row.running
  }
  return days
}

function fillCalendar(days: StockDay[]): StockDay[] {
  if (days.length === 0) return []
  const byTs = new Map(days.map((day) => [day.ts, day]))
  const filled: StockDay[] = []
  let running = days[0].running
  for (let ts = days[0].ts; ts <= days[days.length - 1].ts; ts += DAY_MS) {
    const found = byTs.get(ts)
    if (found) {
      filled.push(found)
      running = found.running
      continue
    }
    const date = new Date(ts)
    const month = String(date.getUTCMonth() + 1).padStart(2, '0')
    const day = String(date.getUTCDate()).padStart(2, '0')
    filled.push({
      ts,
      fullDate: `${date.getUTCFullYear()}.${month}.${day}`,
      inbound: 0,
      outbound: 0,
      running,
      rowKey: '',
      unit: days[0].unit,
    })
  }
  return filled
}

function niceAxis(minValue: number, maxValue: number) {
  const top = Math.max(maxValue, 1)
  const floorRaw = Math.min(minValue, 0)
  const rough = Math.max(top - floorRaw, 1) / 4
  const pow = 10 ** Math.floor(Math.log10(rough))
  const fraction = rough / pow
  const nice = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10
  const step = nice * pow
  const max = Math.max(step, Math.ceil(top / step) * step)
  const min = floorRaw < 0 ? -Math.ceil(Math.abs(floorRaw) / step) * step : 0
  const ticks: number[] = []
  for (let value = min; value <= max + step * 0.001; value += step) ticks.push(Math.round(value))
  return { min, max, ticks }
}

function axisNumber(value: number) {
  return Math.round(value).toLocaleString('ko-KR')
}

function axisDate(value: string, lastDate: string) {
  const parts = value.split('.')
  if (parts.length !== 3) return ''
  const day = Number(parts[2])
  if (value !== lastDate && day !== 1 && day !== 15) return ''
  return `${Number(parts[1])}월 ${day}일`
}

function ChartCallout({
  x,
  y,
  text = '',
  align = 'center',
  viewBox,
}: {
  x?: number
  y?: number
  text?: string
  align?: 'center' | 'end'
  viewBox?: { x?: number; y?: number }
}) {
  const leftX = x ?? viewBox?.x ?? 0
  const topY = y ?? viewBox?.y ?? 0
  const width = Math.max(88, text.length * 11 + 18)
  const left = Math.max(4, align === 'end' ? leftX - width + 10 : leftX - width / 2)
  const top = topY - 32
  return (
    <g>
      <rect x={left} y={top} width={width} height={24} rx={8} fill="#2563eb" />
      <text x={left + width / 2} y={top + 16} textAnchor="middle" fill="#ffffff" fontSize={12} fontWeight={700}>
        {text}
      </text>
    </g>
  )
}

function StockTooltip({
  active,
  payload,
}: {
  active?: boolean
  payload?: Array<{ payload?: StockDay }>
}) {
  const day = payload?.[0]?.payload
  if (!active || !day) return null
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-sm shadow-md">
      <p className="font-semibold">{day.fullDate}</p>
      <p className="mt-1 font-semibold text-blue-600">재고 {formatQuantity(day.running, day.unit)}</p>
      {day.inbound > 0 && <p className="text-blue-600">입고 {formatQuantity(day.inbound, day.unit)}</p>}
      {day.outbound > 0 && <p className="text-orange-500">출고 {formatQuantity(day.outbound, day.unit)}</p>}
    </div>
  )
}

function KpiCard({
  icon,
  iconClass,
  label,
  value,
  unit,
  hint,
  warn = false,
}: {
  icon: ReactNode
  iconClass: string
  label: string
  value: number
  unit: string
  hint: string
  warn?: boolean
}) {
  return (
    <div className={`${cardClass} flex gap-3 px-4 py-3.5`}>
      <span className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${iconClass}`}>{icon}</span>
      <div className="min-w-0">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className={`mt-1 text-2xl font-bold leading-none tabular-nums ${warn ? 'text-destructive' : ''}`}>
          {value.toLocaleString('ko-KR', { maximumFractionDigits: 2 })}
          <span className="ml-1 text-sm font-medium text-muted-foreground">{unit || ''}</span>
        </p>
        <p className="mt-1.5 truncate text-xs text-muted-foreground">{hint}</p>
      </div>
    </div>
  )
}

function MixDonut({ inbound, outbound, unit }: { inbound: number; outbound: number; unit: string }) {
  const total = inbound + outbound
  const ratio = total > 0 ? inbound / total : 0
  const r = 52
  const c = 2 * Math.PI * r
  const inboundPct = total > 0 ? (inbound / total) * 100 : 0
  const outboundPct = total > 0 ? 100 - inboundPct : 0
  return (
    <div className={`${cardClass} flex min-h-[180px] flex-col p-4`}>
      <p className="text-sm font-semibold">거래 유형별 수량 비율</p>
      <div className="mt-2 flex min-h-0 flex-1 items-center gap-4">
        <svg viewBox="0 0 140 140" className="h-32 w-32 shrink-0">
          <circle cx="70" cy="70" r={r} fill="none" stroke="#fb923c" strokeWidth="16" />
          {total > 0 && (
            <circle
              cx="70"
              cy="70"
              r={r}
              fill="none"
              stroke="#3b82f6"
              strokeWidth="16"
              strokeDasharray={`${c * ratio} ${c * (1 - ratio)}`}
              transform="rotate(-90 70 70)"
            />
          )}
          <text x="70" y="64" textAnchor="middle" className="fill-muted-foreground" fontSize="11">
            총 거래 수량
          </text>
          <text x="70" y="84" textAnchor="middle" className="fill-foreground" fontSize="16" fontWeight="700">
            {Math.round(total).toLocaleString('ko-KR')}
          </text>
          <text x="70" y="100" textAnchor="middle" className="fill-muted-foreground" fontSize="11">
            {unit}
          </text>
        </svg>
        <div className="space-y-2 text-sm">
          <p className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-blue-500" />
            <span>입고</span>
            <span className="font-semibold tabular-nums">{formatQuantity(inbound, unit)}</span>
            <span className="text-muted-foreground tabular-nums">{inboundPct.toFixed(1)}%</span>
          </p>
          <p className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-orange-400" />
            <span>출고</span>
            <span className="font-semibold tabular-nums">{formatQuantity(outbound, unit)}</span>
            <span className="text-muted-foreground tabular-nums">{outboundPct.toFixed(1)}%</span>
          </p>
        </div>
      </div>
    </div>
  )
}

function MonthlyBars({ days, unit }: { days: StockDay[]; unit: string }) {
  const months: Array<{ key: string; label: string; inbound: number; outbound: number }> = []
  for (const day of days) {
    const date = new Date(day.ts)
    const key = `${date.getUTCFullYear()}-${date.getUTCMonth()}`
    const last = months[months.length - 1]
    if (!last || last.key !== key) months.push({ key, label: `${date.getUTCMonth() + 1}월`, inbound: day.inbound, outbound: day.outbound })
    else {
      last.inbound += day.inbound
      last.outbound += day.outbound
    }
  }
  const max = Math.max(1, ...months.flatMap((month) => [month.inbound, month.outbound]))
  const slot = 320 / Math.max(months.length, 1)
  return (
    <div className={`${cardClass} flex min-h-[180px] flex-col p-4`}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold">월별 입출고 현황</p>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-blue-500" />입고</span>
          <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-orange-400" />출고</span>
        </div>
      </div>
      <svg viewBox="0 0 320 130" className="mt-2 h-full min-h-[120px] w-full">
        {[0, 0.5, 1].map((mark) => {
          const y = 12 + (1 - mark) * 88
          return <line key={mark} x1="8" x2="312" y1={y} y2={y} stroke="currentColor" strokeOpacity={mark === 0 ? 0.25 : 0.1} />
        })}
        {months.map((month, index) => {
          const cx = slot * index + slot / 2
          const inH = (month.inbound / max) * 88
          const outH = (month.outbound / max) * 88
          return (
            <g key={month.key}>
              <rect x={cx - 14} y={100 - inH} width="12" height={inH} rx="2" fill="#3b82f6" />
              <rect x={cx + 2} y={100 - outH} width="12" height={outH} rx="2" fill="#fb923c" />
              <text x={cx} y="118" textAnchor="middle" className="fill-muted-foreground" fontSize="11">
                {month.label}
              </text>
            </g>
          )
        })}
        <text x="312" y="10" textAnchor="end" className="fill-muted-foreground" fontSize="10">
          {unit}
        </text>
      </svg>
    </div>
  )
}

export function StockDashboard({
  rows,
  rangeLabel,
  floor3 = false,
  defect = 0,
  sample = 0,
  finalStock = 0,
  onSelect,
  list,
}: {
  rows: LedgerEntry[]
  rangeLabel: string
  floor3?: boolean
  defect?: number
  sample?: number
  finalStock?: number
  onSelect: (key: string) => void
  list: ReactNode
}) {
  const gradientId = useId().replace(/:/g, '')
  const days = stockDays(rows)
  const inbound = rows.reduce((sum, row) => sum + (row.kind === '입고' ? row.quantity : 0), 0)
  const outbound = rows.reduce((sum, row) => sum + (row.kind === '출고' ? row.quantity : 0), 0)
  const last = days[days.length - 1]
  const peak = days.reduce((best, day) => (day.running > best.running ? day : best), days[0])
  const unit = last?.unit || rows[0]?.unit || 'EA'
  const chartDays = fillCalendar(days)
  const low = Math.min(0, ...chartDays.map((day) => day.running))
  const high = Math.max(0, ...chartDays.map((day) => Math.max(day.running, day.inbound, day.outbound)))
  const scale = niceAxis(low, high || 1)
  const handleClick = (state: { activeTooltipIndex?: number | string | null }) => {
    const key = chartDays[Number(state.activeTooltipIndex)]?.rowKey
    if (key) onSelect(key)
  }

  return (
    <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-y-auto lg:grid-cols-[minmax(0,1.7fr)_minmax(280px,0.82fr)] lg:grid-rows-[auto_minmax(0,1fr)_minmax(190px,0.62fr)] lg:overflow-hidden">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 lg:col-span-2">
        <KpiCard
          icon={<Package className="h-4 w-4" />}
          iconClass="bg-blue-50 text-blue-600"
          label="현재 재고"
          value={last?.running ?? 0}
          unit={unit}
          hint={last ? `최종 기준일 : ${last.fullDate}` : '이동 없음'}
          warn={(last?.running ?? 0) < 0}
        />
        <KpiCard
          icon={<ArrowUp className="h-4 w-4" />}
          iconClass="bg-blue-50 text-blue-600"
          label="최고 재고"
          value={peak?.running ?? 0}
          unit={unit}
          hint={peak?.fullDate || '-'}
        />
        <KpiCard
          icon={<ArrowDown className="h-4 w-4" />}
          iconClass="bg-emerald-50 text-emerald-600"
          label="총 입고 수량"
          value={inbound}
          unit={unit}
          hint={rangeLabel}
        />
        <KpiCard
          icon={<ArrowUp className="h-4 w-4" />}
          iconClass="bg-orange-50 text-orange-500"
          label="총 출고 수량"
          value={outbound}
          unit={unit}
          hint={rangeLabel}
        />
      </div>
      <div className={`${cardClass} flex min-h-[300px] flex-col p-4 lg:min-h-0`}>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-sm font-semibold">재고 추이 및 입출고 내역</p>
            <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1.5"><span className="h-0.5 w-4 bg-blue-600" />재고 잔량</span>
              <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-blue-500" />입고 수량</span>
              <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-orange-400" />출고 수량</span>
            </div>
          </div>
          <span className="text-xs text-muted-foreground">거래 수량({unit})</span>
        </div>
        {floor3 && (
          <p className="mb-2 text-xs text-muted-foreground">
            최종 재고 {formatQuantity(finalStock, unit)} · 불량 {formatQuantity(defect, unit)} · 검사시료 {formatQuantity(sample, unit)}
          </p>
        )}
        <div className="min-h-0 flex-1 select-none" onMouseDown={(event) => event.preventDefault()}>
          {days.length === 0 ? (
            <p className="flex h-full items-center justify-center text-sm text-muted-foreground">기간 내 이동이 없습니다.</p>
          ) : (
            <ChartContainer config={chartConfig} className="aspect-auto h-full w-full [&_.recharts-surface]:outline-none [&_svg]:outline-none">
              <ComposedChart data={chartDays} margin={{ top: 36, right: 8, left: 0, bottom: 0 }} barGap={1} barCategoryGap="28%" accessibilityLayer={false} onClick={handleClick}>
                <defs>
                  <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.28} />
                    <stop offset="100%" stopColor="#3b82f6" stopOpacity={0.03} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                <XAxis dataKey="fullDate" tickLine={false} axisLine={false} interval={0} minTickGap={0} tick={{ fontSize: 11 }} tickFormatter={(value) => axisDate(String(value), last?.fullDate || '')} />
                <YAxis yAxisId="stock" domain={[scale.min, scale.max]} ticks={scale.ticks} tickLine={false} axisLine={false} width={52} tick={{ fontSize: 11 }} tickFormatter={axisNumber} />
                <YAxis yAxisId="qty" orientation="right" domain={[scale.min, scale.max]} ticks={scale.ticks} tickLine={false} axisLine={false} width={52} tick={{ fontSize: 11 }} tickFormatter={axisNumber} />
                <Tooltip content={<StockTooltip />} cursor={{ stroke: '#cbd5e1' }} />
                <Bar yAxisId="qty" dataKey="inbound" fill="#3b82f6" radius={[2, 2, 0, 0]} maxBarSize={10} isAnimationActive={false} />
                <Bar yAxisId="qty" dataKey="outbound" fill="#fb923c" radius={[2, 2, 0, 0]} maxBarSize={10} isAnimationActive={false} />
                <Area yAxisId="stock" dataKey="running" type="monotone" stroke="#2563eb" strokeWidth={2.5} fill={`url(#${gradientId})`} dot={false} activeDot={{ r: 5, fill: '#2563eb', stroke: '#ffffff', strokeWidth: 2 }} isAnimationActive={false} />
                {peak && (
                  <ReferenceDot yAxisId="stock" x={peak.fullDate} y={peak.running} r={5} fill="#2563eb" stroke="#ffffff" strokeWidth={2} ifOverflow="visible" label={<ChartCallout text={`최고 재고 ${formatQuantity(peak.running, unit)}`} />} />
                )}
                {last && peak && last.fullDate !== peak.fullDate && (
                  <ReferenceDot yAxisId="stock" x={last.fullDate} y={last.running} r={5} fill="#2563eb" stroke="#ffffff" strokeWidth={2} ifOverflow="visible" label={<ChartCallout text={`현재 재고 ${formatQuantity(last.running, unit)}`} align="end" />} />
                )}
              </ComposedChart>
            </ChartContainer>
          )}
        </div>
      </div>
      <div className="min-h-[280px] lg:col-start-2 lg:row-span-2 lg:row-start-2 lg:min-h-0">{list}</div>
      <div className="grid gap-3 sm:grid-cols-2 lg:min-h-0">
        <MixDonut inbound={inbound} outbound={outbound} unit={unit} />
        <MonthlyBars days={days} unit={unit} />
      </div>
    </div>
  )
}
