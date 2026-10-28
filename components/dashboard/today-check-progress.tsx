'use client'

import { useState } from 'react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import type { DashboardStats } from '@/lib/dashboard-stats'

const TONE = {
  blue: { text: 'text-[oklch(0.52_0.19_258)] dark:text-[oklch(0.72_0.16_258)]', bg: 'bg-[oklch(0.52_0.19_258)]' },
  green: { text: 'text-[oklch(0.45_0.15_162)] dark:text-[oklch(0.70_0.15_162)]', bg: 'bg-[oklch(0.58_0.15_162)]' },
  amber: { text: 'text-[oklch(0.55_0.16_55)] dark:text-[oklch(0.78_0.15_60)]', bg: 'bg-[oklch(0.70_0.16_58)]' },
  violet: { text: 'text-[oklch(0.48_0.18_288)] dark:text-[oklch(0.74_0.15_288)]', bg: 'bg-[oklch(0.55_0.18_288)]' },
} as const

const CHECK_TONE: Record<string, keyof typeof TONE> = {
  '설비 일상점검': 'blue',
  '3정 5S': 'green',
  '온 · 습도': 'amber',
  '공정 점검': 'violet',
}

const CHECK_HREF: Record<string, string> = {
  '설비 일상점검': '/checksheets/daily',
  '3정 5S': '/checksheets/5s',
  '온 · 습도': '/checksheets/temp-humidity',
  '공정 점검': '/process-check',
}

const TABS = [
  { id: 'all', label: '전체' },
  { id: '1', label: '1층' },
  { id: '2', label: '2층' },
  { id: '3', label: '3층' },
] as const

type Progress = DashboardStats['today']['progress']

export function TodayCheckProgress({ data }: { data: DashboardStats }) {
  const [floor, setFloor] = useState<(typeof TABS)[number]['id']>('all')
  const rows: Progress = floor === 'all' ? data.today.progress : data.today.floorProgress[floor]
  const hrefOf = (kind: string) => {
    const base = CHECK_HREF[kind] ?? '/checksheets'
    return floor === 'all' ? base : `${base}?floor=${floor}`
  }

  return (
    <div className="rounded-xl border p-3.5">
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <p className="text-sm font-bold">오늘 점검 진행률</p>
        <div className="flex items-center gap-2">
          <div className="flex rounded-md border bg-muted/40 p-0.5">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setFloor(tab.id)}
                className={cn(
                  'rounded px-1.5 py-0.5 text-[11px] font-semibold',
                  floor === tab.id
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <Link href={floor === 'all' ? '/checksheets' : `/checksheets?floor=${floor}`} className="text-xs font-medium text-muted-foreground hover:text-foreground">
            점검 현황 ›
          </Link>
        </div>
      </div>
      {data.today.weekend && rows.every((item) => item.due === 0) ? (
        <p className="text-sm text-muted-foreground">오늘은 휴무일 — 점검 대상 없음</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((item) => {
            const pct = item.due ? Math.round((item.done / item.due) * 100) : 100
            const tone = CHECK_TONE[item.kind] ?? 'amber'
            return (
              <li key={item.kind}>
                <Link href={hrefOf(item.kind)} className="flex items-center gap-3 text-sm hover:text-primary">
                  <span className="w-24 shrink-0 font-medium">{item.kind}</span>
                  <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-muted">
                    <div className={cn('h-full rounded-full', TONE[tone].bg)} style={{ width: `${pct}%` }} />
                  </div>
                  <span className="w-24 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                    <b className={cn('text-sm', pct === 100 ? TONE.green.text : 'text-foreground')}>{item.done}</b> / {item.due} 완료
                  </span>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
