'use client'

import { useState } from 'react'
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import { BarChart3 } from 'lucide-react'
import { ChartContainer, ChartTooltip } from '@/components/ui/chart'
import type { DashboardStats } from '@/lib/dashboard-stats'
import { cn } from '@/lib/utils'
import { CARD_HEADER } from '@/components/dashboard/card-band'

type Point = DashboardStats['process']['views']['trend']['week'][number]
type Range = 'week' | 'month'

const RANGE_OPTIONS: { value: Range; label: string }[] = [
  { value: 'week', label: '주간' },
  { value: 'month', label: '월간' },
]

const chartConfig = {
  inbound: { label: '입고', theme: { light: '#1d4ed8', dark: '#60a5fa' } },
  outbound: { label: '출고', theme: { light: '#93c5fd', dark: '#2563eb' } },
}

export function MovementTrend({ week, month }: { week: Point[]; month: Point[] }) {
  const [range, setRange] = useState<Range>('week')
  const rows = range === 'week' ? week : month

  return (
    <article id="movement-trend" className="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border bg-card shadow-sm">
      <div className={cn('flex items-center justify-between gap-3 px-4 py-3', CARD_HEADER)}>
        <h2 className="flex items-center gap-2.5 text-[15px] font-bold text-white">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-white text-slate-600 shadow-sm ring-1 ring-slate-200 dark:bg-slate-700 dark:text-slate-200 dark:ring-slate-600">
            <BarChart3 className="h-4 w-4" />
          </span>
          입출고 추이
        </h2>
        <div role="group" aria-label="입출고 추이 기간" className="inline-flex shrink-0 rounded-full bg-white/15 p-0.5 ring-1 ring-white/25">
          {RANGE_OPTIONS.map((option) => {
            const active = range === option.value
            return (
              <button
                key={option.value}
                type="button"
                aria-pressed={active}
                onClick={() => setRange(option.value)}
                className={cn(
                  'rounded-full px-3 py-1 text-xs font-semibold transition-all',
                  active ? 'bg-white text-slate-900 shadow-sm' : 'text-white/80 hover:bg-white/15 hover:text-white',
                )}
              >
                {option.label}
              </button>
            )
          })}
        </div>
      </div>
      <div className="flex flex-1 flex-col p-4">
      <ChartContainer config={chartConfig} className="aspect-auto h-[220px] w-full">
        <BarChart data={rows} barCategoryGap="32%" margin={{ top: 8, right: 4, left: -12, bottom: 0 }}>
          <CartesianGrid vertical={false} strokeDasharray="3 3" />
          <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 12 }} />
          <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={36} tick={{ fontSize: 11 }} />
          <ChartTooltip cursor={{ fill: 'rgba(37, 99, 235, 0.06)' }} content={({ active, payload }) => <TrendTip active={active} payload={payload} />} />
          <Bar dataKey="inbound" stackId="move" fill="var(--color-inbound)" maxBarSize={42} isAnimationActive={false} />
          <Bar dataKey="outbound" stackId="move" fill="var(--color-outbound)" radius={[6, 6, 0, 0]} maxBarSize={42} isAnimationActive={false} />
        </BarChart>
      </ChartContainer>
      <div className="mt-2 flex items-center gap-4 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-blue-700 dark:bg-blue-400" />입고</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-blue-300 dark:bg-blue-600" />출고</span>
        <span className="ml-auto">{range === 'week' ? '최근 7일' : '최근 6개월'} · 건</span>
      </div>
      </div>
    </article>
  )
}

function TrendTip({ active, payload }: { active?: boolean; payload?: ReadonlyArray<{ payload?: Point }> }) {
  const row = payload?.[0]?.payload
  if (!active || !row) return null
  return (
    <div className="min-w-36 rounded-xl border bg-card px-3 py-2.5 text-xs shadow-lg">
      <p className="mb-1.5 font-semibold text-slate-800 dark:text-slate-100">{row.full}</p>
      <p className="flex items-center gap-2">
        <span className="h-2.5 w-2.5 rounded-sm bg-blue-700 dark:bg-blue-400" />
        <span className="text-muted-foreground">입고</span>
        <span className="ml-auto font-semibold tabular-nums">{row.inbound.toLocaleString('ko-KR')}건</span>
      </p>
      <p className="mt-1 flex items-center gap-2">
        <span className="h-2.5 w-2.5 rounded-sm bg-blue-300 dark:bg-blue-600" />
        <span className="text-muted-foreground">출고</span>
        <span className="ml-auto font-semibold tabular-nums">{row.outbound.toLocaleString('ko-KR')}건</span>
      </p>
    </div>
  )
}
