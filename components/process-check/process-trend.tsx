'use client'

import { CartesianGrid, Line, LineChart, ReferenceArea, XAxis, YAxis } from 'recharts'
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart'
import { cn } from '@/lib/utils'
import {
  isOutOfRange,
  numericAnswer,
  ProcessAnswer,
  ProcessCheckRecord,
  ProcessFieldSpec,
} from '@/lib/process-checklist'

const chartConfig = {
  value: { label: '측정값', color: 'oklch(0.55 0.2 293)' },
} satisfies ChartConfig

export function ProcessTrend({
  title,
  field,
  records,
  limit = 20,
}: {
  title: string
  field: ProcessFieldSpec
  records: ProcessCheckRecord[]
  limit?: number
}) {
  const data = [...records]
    .sort((a, b) => `${a.writtenDate} ${a.writtenTime}`.localeCompare(`${b.writtenDate} ${b.writtenTime}`))
    .slice(-limit)
    .map((record) => {
      const value = numericAnswer(record.answers[field.id] as ProcessAnswer)
      return {
        label: record.writtenDate.slice(5),
        time: `${record.writtenDate} ${record.writtenTime}`,
        value,
        out: value != null && isOutOfRange(field, value),
      }
    })
  const values = data.filter((point) => point.value != null)
  const latest = values.at(-1)
  const outCount = values.filter((point) => point.out).length
  const hasRange = field.min != null && field.max != null
  const unit = field.unit || ''

  return (
    <section className="flex flex-col rounded-xl border bg-card p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold">{title}</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {hasRange ? `기준 ${field.min} ~ ${field.max}${unit ? ` ${unit}` : ''}` : '기준 범위 없음'} · 최근 {values.length}회
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className={cn('text-2xl font-bold leading-none tabular-nums', latest?.out && 'text-rose-600 dark:text-rose-400')}>
            {latest?.value ?? '-'}
            {unit && <span className="ml-1 text-xs font-medium text-muted-foreground">{unit}</span>}
          </p>
          <p className={cn('mt-1 text-[11px]', outCount ? 'font-semibold text-rose-600 dark:text-rose-400' : 'text-muted-foreground')}>
            {outCount ? `이탈 ${outCount}회` : '최근값'}
          </p>
        </div>
      </div>
      {values.length === 0 ? (
        <p className="flex h-40 items-center justify-center rounded-lg bg-muted/40 text-sm text-muted-foreground">아직 기록된 수치가 없습니다.</p>
      ) : (
        <ChartContainer config={chartConfig} className="aspect-auto h-44 w-full">
          <LineChart data={data} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
            <CartesianGrid vertical={false} />
            {hasRange && (
              <ReferenceArea y1={field.min} y2={field.max} ifOverflow="extendDomain" fill="oklch(0.7 0.15 150)" fillOpacity={0.12} strokeOpacity={0} />
            )}
            <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} minTickGap={16} />
            <YAxis tickLine={false} axisLine={false} width={40} domain={['auto', 'auto']} />
            <ChartTooltip content={<ChartTooltipContent labelFormatter={(_, payload) => payload?.[0]?.payload?.time} />} />
            <Line
              dataKey="value"
              type="monotone"
              stroke="var(--color-value)"
              strokeWidth={2}
              connectNulls
              dot={(props: { cx?: number; cy?: number; index?: number; payload?: { out: boolean } }) => {
                const { cx, cy, index, payload } = props
                if (cx == null || cy == null) return <g key={index} />
                return payload?.out
                  ? <circle key={index} cx={cx} cy={cy} r={4.5} fill="oklch(0.6 0.22 20)" stroke="white" strokeWidth={1.5} />
                  : <circle key={index} cx={cx} cy={cy} r={3} fill="var(--color-value)" />
              }}
            />
          </LineChart>
        </ChartContainer>
      )}
    </section>
  )
}
