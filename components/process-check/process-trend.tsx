'use client'

import { useId, type KeyboardEvent } from 'react'
import { Maximize2 } from 'lucide-react'
import { Area, AreaChart, CartesianGrid, ReferenceArea, ReferenceLine, XAxis, YAxis } from 'recharts'
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart'
import { cn } from '@/lib/utils'
import {
  answersForDisplay,
  isOutOfRange,
  numericAnswer,
  processValuesRevealed,
  ProcessAnswer,
  ProcessCheckRecord,
  ProcessFieldSpec,
} from '@/lib/process-checklist'

const chartConfig = {
  value: { label: '측정값', color: 'oklch(0.55 0.2 293)' },
} satisfies ChartConfig

const OUT_COLOR = 'oklch(0.6 0.22 20)'
const BAND_COLOR = 'oklch(0.7 0.15 150)'

function round(value: number) {
  return Math.round(value * 100) / 100
}

export function ProcessTrend({
  title,
  field,
  records,
  limit = 20,
  reveal = false,
  expanded = false,
  onExpand,
}: {
  title: string
  field: ProcessFieldSpec
  records: ProcessCheckRecord[]
  limit?: number
  reveal?: boolean
  expanded?: boolean
  onExpand?: () => void
}) {
  const gradientId = `trend-${useId().replace(/:/g, '')}`
  const sorted = [...records].sort((a, b) => `${a.writtenDate} ${a.writtenTime}`.localeCompare(`${b.writtenDate} ${b.writtenTime}`))
  const scoped = Number.isFinite(limit) ? sorted.slice(-limit) : sorted
  const data = scoped
    .map((record) => {
      const displayed = answersForDisplay(record, [field], reveal)[field.id]
      const value = numericAnswer(displayed as ProcessAnswer)
      const raw = numericAnswer(record.answers[field.id] as ProcessAnswer)
      return {
        // 전체 기간 보기에서는 연도가 필요하다 (예: 26.03.12)
        label: expanded
          ? record.writtenDate.slice(2).replace(/-/g, '.')
          : record.writtenDate.slice(5).replace('-', '.'),
        time: `${record.writtenDate} ${record.writtenTime}`,
        value,
        out: processValuesRevealed(record, reveal) && raw != null && isOutOfRange(field, raw, true),
      }
    })
  const values = data.filter((point): point is typeof point & { value: number } => point.value != null)
  const latest = values.at(-1)
  const outCount = values.filter((point) => point.out).length
  const hasRange = field.min != null && field.max != null
  const unit = field.unit || ''
  const numbers = values.map((point) => point.value)
  const stats = numbers.length
    ? {
        avg: round(numbers.reduce((sum, value) => sum + value, 0) / numbers.length),
        min: round(Math.min(...numbers)),
        max: round(Math.max(...numbers)),
      }
    : null

  const interactive = Boolean(onExpand) && !expanded
  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      onExpand?.()
    }
  }

  return (
    <section
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      aria-label={interactive ? `${title} 전체 기간 보기` : undefined}
      onClick={interactive ? onExpand : undefined}
      onKeyDown={interactive ? handleKeyDown : undefined}
      className={cn(
        'flex h-full min-w-0 flex-col overflow-hidden rounded-xl border bg-card transition-shadow hover:shadow-md',
        latest?.out && 'border-rose-200 dark:border-rose-900/60',
        interactive && 'cursor-zoom-in outline-none hover:border-violet-300 focus-visible:ring-2 focus-visible:ring-violet-400 dark:hover:border-violet-800',
      )}
    >
      <div className="flex items-start justify-between gap-3 px-4 pt-4">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold">{title}</h3>
          <div className="mt-1.5 flex items-center gap-1.5 whitespace-nowrap text-[11px]">
            {hasRange ? (
              <span className="rounded-md bg-emerald-50 px-1.5 py-0.5 font-semibold text-emerald-700 ring-1 ring-emerald-200 tabular-nums dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-900">
                기준 {field.min} ~ {field.max}{unit ? ` ${unit}` : ''}
              </span>
            ) : (
              <span className="rounded-md bg-muted px-1.5 py-0.5 font-medium text-muted-foreground">기준 범위 없음</span>
            )}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <p className={cn('text-[26px] font-extrabold leading-none tracking-tight tabular-nums', latest?.out && 'text-rose-600 dark:text-rose-400')}>
            {latest?.value ?? '-'}
            {unit && latest && <span className="ml-1 text-xs font-semibold text-muted-foreground">{unit}</span>}
          </p>
          {latest && (
            <span
              className={cn(
                'mt-1.5 inline-flex items-center gap-1 rounded-full px-1.5 py-px text-[10px] font-bold',
                latest.out
                  ? 'bg-rose-500/12 text-rose-600 dark:text-rose-400'
                  : 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-400',
              )}
            >
              <span className={cn('size-1.5 rounded-full', latest.out ? 'bg-rose-500' : 'bg-emerald-500')} />
              {latest.out ? '최근값 이탈' : hasRange ? '최근값 정상' : '최근값'}
            </span>
          )}
          <p className="mt-1 text-[11px] text-muted-foreground tabular-nums">
            {expanded ? '전체' : '최근'} {values.length}회
          </p>
        </div>
      </div>

      {values.length === 0 ? (
        <p className="m-4 flex h-40 items-center justify-center rounded-lg bg-muted/40 text-sm text-muted-foreground">아직 기록된 수치가 없습니다.</p>
      ) : (
        <div className="group relative">
          <ChartContainer config={chartConfig} className={cn('aspect-auto w-full px-2', expanded ? 'h-80 pt-4' : 'h-48 pt-3')}>
            <AreaChart data={data} margin={{ left: 0, right: 12, top: 8, bottom: 0 }}>
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--color-value)" stopOpacity={0.28} />
                  <stop offset="100%" stopColor="var(--color-value)" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} strokeDasharray="3 3" strokeOpacity={0.6} />
              {hasRange && (
                <ReferenceArea y1={field.min} y2={field.max} ifOverflow="extendDomain" fill={BAND_COLOR} fillOpacity={0.1} strokeOpacity={0} />
              )}
              {hasRange && (
                <ReferenceLine y={field.max} stroke={BAND_COLOR} strokeDasharray="4 4" strokeOpacity={0.7} ifOverflow="extendDomain" />
              )}
              {hasRange && (
                <ReferenceLine y={field.min} stroke={BAND_COLOR} strokeDasharray="4 4" strokeOpacity={0.7} ifOverflow="extendDomain" />
              )}
              {field.target != null && (
                <ReferenceLine y={field.target} stroke="var(--muted-foreground)" strokeOpacity={0.45} strokeDasharray="2 3" />
              )}
              <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} minTickGap={20} fontSize={11} />
              <YAxis tickLine={false} axisLine={false} width={40} domain={['auto', 'auto']} fontSize={11} />
              <ChartTooltip
                cursor={{ stroke: 'var(--color-value)', strokeOpacity: 0.3 }}
                content={<ChartTooltipContent labelFormatter={(_, payload) => payload?.[0]?.payload?.time} />}
              />
              <Area
                dataKey="value"
                type="monotone"
                stroke="var(--color-value)"
                strokeWidth={2.25}
                fill={`url(#${gradientId})`}
                connectNulls
                activeDot={{ r: 5, strokeWidth: 2, stroke: 'white' }}
                dot={(props: { cx?: number; cy?: number; index?: number; payload?: { out: boolean } }) => {
                  const { cx, cy, index, payload } = props
                  if (cx == null || cy == null) return <g key={index} />
                  return payload?.out
                    ? <circle key={index} cx={cx} cy={cy} r={5} fill={OUT_COLOR} stroke="white" strokeWidth={2} />
                    : <circle key={index} cx={cx} cy={cy} r={2.75} fill="white" stroke="var(--color-value)" strokeWidth={1.75} />
                }}
              />
            </AreaChart>
          </ChartContainer>
        {interactive && (
          <span className="pointer-events-none absolute right-2 top-2 rounded-md bg-background/85 p-1 text-violet-600 opacity-60 shadow-sm transition-opacity group-hover:opacity-100 dark:text-violet-400">
            <Maximize2 className="size-3.5" />
          </span>
        )}
        </div>
      )}

      {stats && (
        <dl className="mt-1 grid grid-cols-4 divide-x border-t bg-muted/25 text-center">
          {[
            ['평균', stats.avg],
            ['최소', stats.min],
            ['최대', stats.max],
          ].map(([label, value]) => (
            <div key={label} className="px-2 py-2">
              <dt className="text-[10px] font-medium text-muted-foreground">{label}</dt>
              <dd className="text-sm font-bold tabular-nums">{value}</dd>
            </div>
          ))}
          <div className="px-2 py-2">
            <dt className="text-[10px] font-medium text-muted-foreground">이탈</dt>
            <dd className={cn('text-sm font-bold tabular-nums', outCount ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400')}>
              {outCount}회
            </dd>
          </div>
        </dl>
      )}
    </section>
  )
}
