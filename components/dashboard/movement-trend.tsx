'use client'

import { useState } from 'react'
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import { BarChart3 } from 'lucide-react'
import { ChartContainer, ChartTooltip } from '@/components/ui/chart'
import type { DashboardStats } from '@/lib/dashboard-stats'

type Point = DashboardStats['process']['views']['trend']['week'][number]
type Range = 'week' | 'month'

const chartConfig = {
  inbound: { label: '입고', theme: { light: '#1d4ed8', dark: '#60a5fa' } },
  outbound: { label: '출고', theme: { light: '#93c5fd', dark: '#2563eb' } },
}

export function MovementTrend({ week, month }: { week: Point[]; month: Point[] }) {
  const [range, setRange] = useState<Range>('week')
  const rows = range === 'week' ? week : month

  return (
    <article id="movement-trend" className="flex h-full flex-col rounded-2xl border bg-card p-5 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-[15px] font-bold text-slate-900 dark:text-white">
          <BarChart3 className="h-4 w-4 text-slate-700 dark:text-slate-200" />
          입출고 추이
        </h2>
        <select
          aria-label="입출고 추이 기간"
          value={range}
          onChange={(event) => setRange(event.target.value as Range)}
          className="h-8 rounded-full border border-border bg-card px-3 text-xs font-semibold text-slate-700 shadow-sm outline-none dark:text-slate-200"
        >
          <option value="week">주간</option>
          <option value="month">월간</option>
        </select>
      </div>
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
