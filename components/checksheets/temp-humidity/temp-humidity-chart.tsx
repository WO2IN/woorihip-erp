'use client'

import type { ReactNode } from 'react'
import { useEffect } from 'react'
import { CartesianGrid, Line, LineChart, ReferenceLine, XAxis, YAxis } from 'recharts'
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart'
import { getDayRange } from '@/lib/date-utils'

interface TempHumidityChartProps {
  year: number
  month: number
  entries: { day: number; temperature: string | null; humidity: string | null }[]
  tempLower?: number
  tempUpper?: number
  humidityLower?: number
  humidityUpper?: number
  action?: ReactNode
}

const LIMIT_COLORS = {
  tempUpper: '#ea580c',
  tempLower: '#15803d',
  humidityUpper: '#e11d48',
  humidityLower: '#7c3aed',
}

function LimitTag({
  viewBox,
  value,
  fill,
}: {
  viewBox?: { x?: number; y?: number; width?: number }
  value?: string
  fill?: string
}) {
  const text = value ?? ''
  const color = fill ?? '#111'
  const x = (viewBox?.x ?? 0) + (viewBox?.width ?? 0) - 4
  const y = (viewBox?.y ?? 0) - 2
  const width = text.length * 7.4 + 14
  return (
    <g>
      <rect x={x - width} y={y - 14} width={width} height={16} rx={3} fill={color} />
      <text x={x - 7} y={y - 2} textAnchor="end" fill="#fff" fontSize={11} fontWeight={700}>
        {text}
      </text>
    </g>
  )
}

const chartConfig = {
  temperature: { label: '온도(℃)', color: 'var(--chart-1)' },
  humidity: { label: '습도(%)', color: 'var(--chart-2)' },
} satisfies ChartConfig

export function TempHumidityChart({
  year,
  month,
  entries,
  tempLower = 10,
  tempUpper = 30,
  humidityLower = 0,
  humidityUpper = 60,
  action,
}: TempHumidityChartProps) {
  const days = getDayRange(year, month)
  const entryMap = new Map(entries.map((e) => [e.day, e]))

  const data = days.map((day) => {
    const entry = entryMap.get(day)
    return {
      day: String(day),
      temperature: entry?.temperature != null ? Number(entry.temperature) : null,
      humidity: entry?.humidity != null ? Number(entry.humidity) : null,
    }
  })

  const yMax = Math.max(70, tempUpper + 10, humidityUpper + 10)
  const tickStep = 10
  const ticks = Array.from({ length: Math.ceil(yMax / tickStep) + 1 }, (_, i) => i * tickStep)

  useEffect(() => {
    const onBeforePrint = () => window.dispatchEvent(new Event('resize'))
    window.addEventListener('beforeprint', onBeforePrint)
    return () => window.removeEventListener('beforeprint', onBeforePrint)
  }, [])

  const chartBody = (size?: { width: number; height: number }, withTooltip = false) => (
    <LineChart data={data} margin={{ left: 4, right: 72, top: 16, bottom: 0 }} width={size?.width} height={size?.height}>
      <CartesianGrid vertical={false} />
      <XAxis dataKey="day" tickLine={false} axisLine={false} tickMargin={6} />
      <YAxis
        tickLine={false}
        axisLine={false}
        tickMargin={6}
        width={28}
        domain={[0, yMax]}
        ticks={ticks}
      />
      {withTooltip ? <ChartTooltip content={<ChartTooltipContent />} /> : null}
      <ReferenceLine
        y={tempUpper}
        stroke={LIMIT_COLORS.tempUpper}
        strokeWidth={2}
        strokeDasharray="8 4"
        ifOverflow="extendDomain"
        label={<LimitTag value={`온도 상한 ${tempUpper}`} fill={LIMIT_COLORS.tempUpper} />}
      />
      <ReferenceLine
        y={tempLower}
        stroke={LIMIT_COLORS.tempLower}
        strokeWidth={2}
        strokeDasharray="8 4"
        ifOverflow="extendDomain"
        label={<LimitTag value={`온도 하한 ${tempLower}`} fill={LIMIT_COLORS.tempLower} />}
      />
      <ReferenceLine
        y={humidityUpper}
        stroke={LIMIT_COLORS.humidityUpper}
        strokeWidth={2}
        strokeDasharray="8 4"
        ifOverflow="extendDomain"
        label={<LimitTag value={`습도 상한 ${humidityUpper}`} fill={LIMIT_COLORS.humidityUpper} />}
      />
      {humidityLower > 0 && (
        <ReferenceLine
          y={humidityLower}
          stroke={LIMIT_COLORS.humidityLower}
          strokeWidth={2}
          strokeDasharray="8 4"
          ifOverflow="extendDomain"
          label={<LimitTag value={`습도 하한 ${humidityLower}`} fill={LIMIT_COLORS.humidityLower} />}
        />
      )}
      <Line
        dataKey="temperature"
        type="monotone"
        stroke="var(--color-temperature)"
        strokeWidth={2}
        dot={{ r: 2.5 }}
        connectNulls
      />
      <Line
        dataKey="humidity"
        type="monotone"
        stroke="var(--color-humidity)"
        strokeWidth={2}
        dot={{ r: 2.5 }}
        connectNulls
      />
    </LineChart>
  )

  return (
    <div className="temp-humidity-chart no-break flex flex-col gap-2 border border-border bg-card p-4 print:gap-1 print:p-2 print:pb-1">
      <div className="flex flex-wrap items-center justify-between gap-2 print:gap-0">
        <h2 className="text-sm font-semibold print:mb-0 print:text-[12px]">온/습도 추이</h2>
        {action ? <div className="no-print">{action}</div> : null}
      </div>
      <ChartContainer
        config={chartConfig}
        className="screen-only-chart aspect-auto h-[520px] min-h-0 w-full lg:h-[600px]"
      >
        {chartBody(undefined, true)}
      </ChartContainer>
      <div
        className="print-only-chart hidden"
        style={{ ['--color-temperature' as string]: 'var(--chart-1)', ['--color-humidity' as string]: 'var(--chart-2)' }}
      >
        {chartBody({ width: 1040, height: 520 })}
      </div>
    </div>
  )
}
