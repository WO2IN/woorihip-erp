'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ArrowRightIcon,
  Building2Icon,
  ClipboardCheckIcon,
  FactoryIcon,
  ThermometerIcon,
  WrenchIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { PageHeader } from '@/components/shared/page-header'
import type { TodayStatus } from '@/lib/today-check'
import { TodayStatusBadge } from '@/components/shared/today-status-badge'

type SummaryItem = {
  id: number | string
  name: string
  meta?: string
  inspector?: string
  href: string
  status: TodayStatus
  statusLabel: string
}

type SummaryCard = {
  title: string
  description: string
  count: number
  href: string
  tone: 'sky' | 'amber' | 'violet' | 'emerald'
  icon: 'clipboard' | 'wrench' | 'thermometer' | 'factory'
  items: SummaryItem[]
}

type FloorStat = {
  floor: string
  label: string
  total: number
  fiveS: number
  daily: number
  tempHumidity: number
  process: number
  missing: number
}

const ICONS = {
  clipboard: ClipboardCheckIcon,
  wrench: WrenchIcon,
  thermometer: ThermometerIcon,
  factory: FactoryIcon,
} as const

const TONE_ACCENT = {
  sky: 'bg-sky-500/15 text-sky-700 dark:text-sky-300',
  amber: 'bg-amber-500/15 text-amber-800 dark:text-amber-300',
  violet: 'bg-violet-500/15 text-violet-700 dark:text-violet-300',
  emerald: 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-300',
} as const

export function FloorHome({
  selectedFloor,
  floorStats,
  cards,
  year,
  month,
  todayLabel,
}: {
  selectedFloor: string
  floorStats: FloorStat[]
  cards: readonly SummaryCard[]
  year: number
  month: number
  todayLabel: string
}) {
  const router = useRouter()
  const active = floorStats.find((stat) => stat.floor === selectedFloor)
  const totalCount = cards.reduce((sum, card) => sum + card.count, 0)

  if (!selectedFloor) {
    return (
      <main className="mx-auto flex min-h-[calc(100dvh-3.5rem)] max-w-[1100px] flex-col justify-center gap-8 px-4 py-8 sm:px-6">
        <div className="text-center">
          <p className="text-sm font-medium text-muted-foreground">
            {year}년 {month}월 일상점검
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">층을 선택하세요</h1>
          <p className="mt-3 text-base text-muted-foreground">선택한 층의 체크시트만 표시됩니다.</p>
        </div>

        <div
          className={cn(
            'grid grid-cols-1 gap-4',
            floorStats.length > 3 ? 'sm:grid-cols-2 lg:grid-cols-4' : 'sm:grid-cols-3',
          )}
        >
          {floorStats.map((stat, index) => (
            <button
              key={stat.floor}
              type="button"
              onClick={() => router.push(`/checksheets?floor=${encodeURIComponent(stat.floor)}`)}
              className="group relative flex min-h-44 flex-col overflow-hidden rounded-3xl border border-border bg-card p-6 text-left shadow-sm transition-all duration-200 hover:-translate-y-1 hover:border-primary/50 hover:shadow-lg active:scale-[0.98] sm:min-h-56"
            >
              <span
                className="absolute -right-10 -top-10 size-36 rounded-full bg-primary/5 transition-transform duration-300 group-hover:scale-125"
                aria-hidden="true"
              />
              <span className="relative flex items-start justify-between">
                <span className="flex size-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-md shadow-primary/20">
                  <Building2Icon className="size-7" aria-hidden="true" />
                </span>
                <span className="rounded-full border border-border bg-background/80 px-2.5 py-1 text-xs font-semibold text-muted-foreground">
                  0{index + 1}
                </span>
              </span>
              <span className="relative mt-auto pt-8">
                <span className="block text-3xl font-bold tracking-tight">{stat.label}</span>
                <span className="mt-2 block text-sm text-muted-foreground">점검표 {stat.total}개</span>
                <span className={cn('mt-1 block text-sm font-medium', stat.missing > 0 ? 'text-amber-700' : 'text-emerald-700')}>
                  {stat.missing > 0 ? `오늘 미점검 ${stat.missing}건` : '오늘 점검 완료'}
                </span>
                <span className="mt-4 flex items-center gap-1 text-sm font-medium text-primary">
                  들어가기
                  <ArrowRightIcon className="size-4 transition-transform group-hover:translate-x-1" aria-hidden="true" />
                </span>
              </span>
            </button>
          ))}
        </div>
      </main>
    )
  }

  return (
    <main className="flex w-full flex-col gap-6 px-6 py-6">
      <PageHeader
        tone="violet"
        icon={WrenchIcon}
        eyebrow="DAILY CHECK · 일일 점검"
        title={`${active?.label ?? `${selectedFloor}층`} 점검`}
        description={`${year}년 ${month}월 · 3정 5S, 설비 일상점검, 온/습도, 공정 점검`}
        stat={{
          label: '오늘 미점검',
          value: active?.missing ?? 0,
          unit: '건',
          sub: `점검표 ${totalCount}개`,
        }}
      />

      {floorStats.length > 1 && (
      <div
        role="tablist"
        aria-label="층 선택"
        className={cn(
          'grid gap-2 rounded-2xl border border-border bg-muted/50 p-2',
          floorStats.length > 3 ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-3',
        )}
      >
        {floorStats.map((stat) => {
          const isActive = selectedFloor === stat.floor
          return (
            <button
              key={stat.floor}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => router.push(`/checksheets?floor=${encodeURIComponent(stat.floor)}`)}
              className={cn(
                'flex min-h-14 flex-col items-center justify-center rounded-xl px-3 py-2 text-center transition-all active:scale-[0.98]',
                isActive
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'bg-transparent text-muted-foreground hover:bg-card hover:text-foreground',
              )}
            >
              <span className="text-base font-semibold sm:text-lg">{stat.label}</span>
              <span className={cn('text-xs', isActive ? 'text-primary-foreground/80' : 'text-muted-foreground')}>
                {stat && stat.missing > 0 ? `미점검 ${stat.missing}` : `${stat?.total ?? 0}개`}
              </span>
            </button>
          )
        })}
      </div>
      )}

      <section aria-labelledby="floor-checksheets-heading" className="flex flex-col gap-4">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h2 id="floor-checksheets-heading" className="text-lg font-semibold">
              {active?.label ?? `${selectedFloor}층`} 체크시트
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">{todayLabel} 기준으로 오늘 채워야 하는 시트만 미점검으로 표시합니다.</p>
          </div>
          <span className="rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground">
            총 {totalCount}개
          </span>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
          {cards.map((card) => {
            const Icon = ICONS[card.icon]
            const missingCount = card.items.filter((item) => item.status === 'missing').length
            return (
              <section
                key={card.title}
                className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm"
              >
                <div className="border-b border-border px-5 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <span className={cn('flex size-11 items-center justify-center rounded-xl', TONE_ACCENT[card.tone])}>
                        <Icon className="size-5" aria-hidden="true" />
                      </span>
                      <div>
                        <h3 className="text-base font-semibold">{card.title}</h3>
                        <p className="mt-0.5 text-xs text-muted-foreground">{card.description}</p>
                      </div>
                    </div>
                    <span className={cn('rounded-full px-2.5 py-1 text-xs font-semibold tabular-nums', missingCount > 0 ? 'bg-amber-100 text-amber-800' : 'bg-muted')}>
                      {missingCount > 0 ? `미점검 ${missingCount}` : card.count}
                    </span>
                  </div>
                </div>

                <div className="flex flex-1 flex-col">
                  {card.items.length > 0 ? (
                    [...card.items]
                      .sort((a, b) => Number(b.status === 'missing') - Number(a.status === 'missing'))
                      .map((item) => (
                      <Link
                        key={item.id}
                        href={item.href}
                        className="flex min-h-14 items-center justify-between gap-3 border-b border-border px-5 py-3.5 last:border-b-0 transition-colors hover:bg-muted/40 active:bg-muted/60"
                      >
                        <span className="min-w-0">
                          <span className="block truncate font-medium">{item.name}</span>
                          {(item.meta || item.inspector) && (
                            <span className="mt-0.5 flex min-w-0 items-center gap-1.5 truncate text-xs text-muted-foreground">
                              {item.meta ? <span className="truncate">{item.meta}</span> : null}
                              {item.meta && item.inspector ? <span aria-hidden="true">·</span> : null}
                              {item.inspector ? (
                                <span className="truncate font-semibold text-primary">점검자 {item.inspector}</span>
                              ) : null}
                            </span>
                          )}
                        </span>
                        <span className="flex shrink-0 items-center gap-2">
                          <TodayStatusBadge status={item.status} label={item.statusLabel} />
                          <ArrowRightIcon className="size-4 text-muted-foreground" aria-hidden="true" />
                        </span>
                      </Link>
                    ))
                  ) : (
                    <p className="px-5 py-8 text-center text-sm text-muted-foreground">이 층에 등록된 항목이 없습니다.</p>
                  )}
                </div>

                {card.items.length > 0 ? (
                  <Link
                    href={card.href}
                    className="flex min-h-12 items-center justify-center gap-1 border-t border-border bg-muted/30 px-4 text-sm font-medium text-primary transition-colors hover:bg-muted/50"
                  >
                    목록으로 보기
                    <ArrowRightIcon className="size-4" aria-hidden="true" />
                  </Link>
                ) : null}
              </section>
            )
          })}
        </div>
      </section>
    </main>
  )
}
