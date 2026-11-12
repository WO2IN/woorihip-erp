'use client'

import { Bar, CartesianGrid, Cell, ComposedChart, LabelList, Line, ReferenceLine, XAxis, YAxis } from 'recharts'
import { ChartContainer, ChartTooltip } from '@/components/ui/chart'
import { EMPTY_CELL, MTBF_BAR_FAIL, MTBF_BAR_OK, MTBF_TARGET, MTTR_LINE, MTTR_TARGET, type MonthRow } from './model'

type ChartLabelProps = {
  x?: number | string
  y?: number | string
  width?: number | string
  height?: number | string
  value?: number | string | null
  index?: number
}

export function MtbfTrendChart({ printing, months }: { printing: boolean; months: MonthRow[] }) {
  const chart = (
    <ComposedChart
      data={months}
      width={printing ? 640 : undefined}
      height={printing ? 210 : undefined}
      margin={{ top: printing ? 22 : 40, right: 4, left: 0, bottom: 0 }}
    >
      <CartesianGrid vertical={false} strokeDasharray="3 3" />
      <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: printing ? 9 : 12 }} />
      <YAxis
        yAxisId="mtbf"
        domain={[0, 280]}
        ticks={[0, 100, 200]}
        tickLine={false}
        axisLine={false}
        width={printing ? 28 : 40}
        tick={{ fontSize: printing ? 9 : 12 }}
        tickFormatter={(value) => `${value}h`}
      />
      <YAxis
        yAxisId="mttr"
        orientation="right"
        domain={[0, 2.8]}
        ticks={[0, 1, 2]}
        tickLine={false}
        axisLine={false}
        width={printing ? 26 : 40}
        tick={{ fontSize: printing ? 9 : 12 }}
        tickFormatter={(value) => `${Number(value).toFixed(1)}h`}
      />
      <ReferenceLine yAxisId="mtbf" y={MTBF_TARGET} stroke="#94a3b8" strokeDasharray="5 4" />
      <ReferenceLine yAxisId="mttr" y={MTTR_TARGET} stroke="#94a3b8" strokeDasharray="5 4" />
      {!printing ? (
        <ChartTooltip
          content={({ active, payload }) => {
            const row = payload?.[0]?.payload as MonthRow | undefined
            if (!active || !row) return null
            return (
              <div className="rounded-lg border bg-popover px-3 py-2 text-sm shadow-md">
                <p className="font-semibold">{row.label}</p>
                <p>MTBF {row.pending ? EMPTY_CELL : `${row.mtbf}h`}</p>
                <p>MTTR {row.pending ? EMPTY_CELL : `${row.mttr}h`}</p>
              </div>
            )
          }}
        />
      ) : null}
      <Bar yAxisId="mtbf" dataKey="mtbf" maxBarSize={printing ? 18 : 32} radius={[4, 4, 0, 0]} isAnimationActive={false}>
        {months.map((row) => (
          <Cell key={row.label} fill={row.mtbf == null ? 'transparent' : row.mtbf >= MTBF_TARGET ? MTBF_BAR_OK : MTBF_BAR_FAIL} />
        ))}
        <LabelList
          dataKey="mtbf"
          content={(props) => <MtbfBarValueLabel {...(props as ChartLabelProps)} rows={months} compact={printing} />}
        />
      </Bar>
      <Line
        yAxisId="mttr"
        type="monotone"
        dataKey="mttr"
        stroke={MTTR_LINE}
        strokeWidth={2}
        connectNulls={false}
        isAnimationActive={false}
        dot={(props) => <MttrLineDot {...props} />}
      >
        <LabelList
          dataKey="mttr"
          content={(props) => <MttrValueLabel {...(props as ChartLabelProps)} rows={months} compact={printing} />}
        />
      </Line>
    </ComposedChart>
  )

  if (printing) {
    return <div className="mtbf-mttr-chart flex justify-center overflow-hidden">{chart}</div>
  }

  return (
    <ChartContainer
      config={{
        mtbf: { label: 'MTBF', color: MTBF_BAR_OK },
        mttr: { label: 'MTTR', color: MTTR_LINE },
      }}
      className="mtbf-mttr-chart !aspect-auto h-[340px] w-full"
    >
      {chart}
    </ChartContainer>
  )
}

function MtbfBarValueLabel({ x, y, width, height, value, index, rows, compact }: ChartLabelProps & { rows: MonthRow[]; compact?: boolean }) {
  const row = rows[index ?? -1]
  if (row?.pending || value == null || x == null || y == null || width == null || height == null) return null
  const barH = Number(height)
  if (barH < (compact ? 16 : 22)) return null
  return (
    <text
      x={Number(x) + Number(width) / 2}
      y={Number(y) + barH - (compact ? 5 : 7)}
      textAnchor="middle"
      fontSize={compact ? 8 : 12}
      fontWeight={700}
      fill="#ffffff"
    >
      {value}
    </text>
  )
}

function MttrValueLabel({ x, y, value, index, rows, compact }: ChartLabelProps & { rows: MonthRow[]; compact?: boolean }) {
  const row = rows[index ?? -1]
  if (row?.pending || value == null || x == null || y == null) return null
  const num = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(num)) return null
  const over = num > MTTR_TARGET
  const label = num.toFixed(2)
  const pillW = compact ? 28 : Math.max(40, label.length * 7 + 12)
  const pillH = compact ? 12 : 18
  const lift = compact ? 16 : 30
  const cx = Number(x)
  const cy = Number(y)
  return (
    <g pointerEvents="none">
      <rect
        x={cx - pillW / 2}
        y={cy - lift}
        width={pillW}
        height={pillH}
        rx={3}
        fill="white"
        stroke={over ? '#f43f5e' : '#ea580c'}
        strokeWidth={1}
      />
      <text
        x={cx}
        y={cy - lift + (compact ? 9 : 12)}
        textAnchor="middle"
        fontSize={compact ? 8 : 12}
        fontWeight={700}
        fill={over ? '#e11d48' : '#9a3412'}
      >
        {label}
      </text>
    </g>
  )
}

function MttrLineDot(props: { cx?: number; cy?: number; index?: number; payload?: MonthRow }) {
  const { cx, cy, payload, index } = props
  if (cx == null || cy == null || !payload || payload.pending || payload.mttr == null) return null
  if (payload.mttr > MTTR_TARGET) {
    return <circle key={index} cx={cx} cy={cy} r={5.5} fill="#ffffff" stroke="#e11d48" strokeWidth={2} />
  }
  return <circle key={index} cx={cx} cy={cy} r={4} fill={MTTR_LINE} stroke="#ffffff" strokeWidth={1.5} />
}
