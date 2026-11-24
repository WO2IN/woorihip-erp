'use client'

import Link from 'next/link'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowRightIcon,
  Building2Icon,
  ClipboardCheckIcon,
  FactoryIcon,
  PlusIcon,
  ThermometerIcon,
  Trash2Icon,
  WrenchIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { PAGE_SHELL, PageHeader } from '@/components/shared/page-header'
import { Button, buttonVariants } from '@/components/ui/button'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { toast } from 'sonner'
import { TargetCreateDialog } from '@/components/shared/target-create-dialog'
import { useAuth } from '@/components/auth/auth-context'
import { canOperateFloor } from '@/lib/access'
import { getJsonAuthHeaders } from '@/lib/auth-client'
import { createEquipment, deleteEquipment } from '@/app/actions/equipment'
import { createFiveSTarget, deleteFiveSTarget } from '@/app/actions/five-s'
import { createTempHumidityTarget, deleteTempHumidityTarget } from '@/app/actions/temp-humidity'
import type { TodayStatus } from '@/lib/today-check'
import { TargetRow, type TargetKind } from '@/components/shared/target-list-row'

type SummaryItem = {
  id: number | string
  name: string
  meta?: string
  inspector?: string
  gap?: string
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
  missingCount?: number
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

const KIND_OF: Record<SummaryCard['icon'], TargetKind> = {
  clipboard: 'fiveS',
  wrench: 'daily',
  thermometer: 'temp',
  factory: 'process',
}

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
  initialTabTitle,
}: {
  selectedFloor: string
  floorStats: FloorStat[]
  cards: readonly SummaryCard[]
  year: number
  month: number
  todayLabel: string
  initialTabTitle?: string
}) {
  const router = useRouter()
  const active = floorStats.find((stat) => stat.floor === selectedFloor)
  const totalCount = cards.reduce((sum, card) => sum + card.count, 0)

  if (!selectedFloor) {
    return (
      <main className={cn(PAGE_SHELL, 'min-h-[calc(100dvh-3.5rem)] justify-center gap-8')}>
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
                <span className={cn('mt-1 block text-sm font-medium', stat.missing > 0 ? 'text-rose-700 dark:text-rose-400' : 'text-emerald-700')}>
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
    <main className={PAGE_SHELL}>
      <PageHeader
        tone="amber"
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
                {stat && stat.missing > 0 ? (
                  <span className="text-rose-700 dark:text-rose-400">미점검 {stat.missing}</span>
                ) : (
                  `${stat?.total ?? 0}개`
                )}
              </span>
            </button>
          )
        })}
      </div>
      )}

      <FloorSheets
        key={`${selectedFloor}-${initialTabTitle ?? ''}`}
        cards={cards}
        todayLabel={todayLabel}
        floorLabel={active?.label ?? `${selectedFloor}층`}
        totalCount={totalCount}
        selectedFloor={selectedFloor}
        initialTabTitle={initialTabTitle}
      />
    </main>
  )
}

const DELETE_COPY: Record<SummaryCard['icon'], { title: string; detail: string }> = {
  clipboard: { title: '이 항목을 삭제할까요?', detail: '항목과 입력된 3정 5S 점검 내용이 함께 삭제됩니다.' },
  wrench: { title: '이 설비를 삭제할까요?', detail: '설비와 연관된 사진, 점검항목, 일상점검 내용이 함께 삭제됩니다.' },
  thermometer: { title: '이 항목을 삭제할까요?', detail: '항목과 입력된 온/습도 점검 내용이 함께 삭제됩니다.' },
  factory: { title: '이 점검표를 삭제할까요?', detail: '점검표와 이미 저장된 기록이 목록에서 빠집니다.' },
}

function RowDelete({ icon, id, name }: { icon: SummaryCard['icon']; id: number | string; name: string }) {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const copy = DELETE_COPY[icon]

  async function handleDelete() {
    setPending(true)
    try {
      if (icon === 'factory') {
        const response = await fetch('/api/process-templates', {
          method: 'DELETE',
          headers: getJsonAuthHeaders(),
          body: JSON.stringify({ id }),
        })
        const result = await response.json().catch(() => ({}))
        if (!response.ok) throw new Error(result.error || '삭제에 실패했습니다.')
      } else if (icon === 'wrench') {
        await deleteEquipment(Number(id))
      } else if (icon === 'clipboard') {
        await deleteFiveSTarget(Number(id))
      } else {
        await deleteTempHumidityTarget(Number(id))
      }
      toast.success('삭제되었습니다.')
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '삭제에 실패했습니다.')
    } finally {
      setPending(false)
    }
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="mr-3 shrink-0 text-muted-foreground hover:text-destructive"
            aria-label={`${name} 삭제`}
          />
        }
      >
        <Trash2Icon />
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{copy.title}</AlertDialogTitle>
          <AlertDialogDescription>
            {name} {copy.detail} 이 작업은 되돌릴 수 없습니다.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>취소</AlertDialogCancel>
          <AlertDialogAction className="bg-destructive text-white hover:bg-destructive/90" onClick={handleDelete} disabled={pending}>
            삭제
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

function AddTarget({
  icon,
  selectedFloor,
  defaultFloor,
  lockedFloor,
}: {
  icon: SummaryCard['icon']
  selectedFloor: string
  defaultFloor?: string
  lockedFloor?: string
}) {
  if (icon === 'factory') {
    const floor = /^[123]$/.test(selectedFloor) ? selectedFloor : '1'
    return (
      <Link
        href={`/process-check?floor=${floor}&create=1`}
        className={cn(buttonVariants({ size: 'sm' }), 'h-8')}
      >
        <PlusIcon data-icon="inline-start" />
        점검표 추가
      </Link>
    )
  }
  const add = ADD_BY_ICON[icon]
  return (
    <TargetCreateDialog
      key={`${icon}-${defaultFloor ?? 'none'}`}
      title={add.title}
      triggerText={add.trigger}
      createAction={add.action}
      redirectPathPrefix={add.prefix}
      lockedFloor={lockedFloor}
      defaultFloor={defaultFloor}
      triggerClassName="h-8 px-3"
    />
  )
}

const ADD_BY_ICON = {
  clipboard: { title: '3정 5S 대상 추가', trigger: '3정 5S 추가', action: createFiveSTarget, prefix: '/checksheets/5s' },
  wrench: { title: '설비 추가', trigger: '설비 추가', action: createEquipment, prefix: '/checksheets/daily' },
  thermometer: { title: '온습도 측정 대상 추가', trigger: '온습도 추가', action: createTempHumidityTarget, prefix: '/checksheets/temp-humidity' },
} as const

function FloorSheets({
  cards,
  todayLabel,
  floorLabel,
  totalCount,
  selectedFloor,
  initialTabTitle,
}: {
  cards: readonly SummaryCard[]
  todayLabel: string
  floorLabel: string
  totalCount: number
  selectedFloor: string
  initialTabTitle?: string
}) {
  const { user } = useAuth()
  const canAdd = canOperateFloor(user, selectedFloor)
  const lockedFloor = user && user.role !== 'admin' && user.floor ? String(user.floor) : undefined
  const defaultFloor = /^[123]$/.test(selectedFloor) ? selectedFloor : undefined
  const missingOf = (card: SummaryCard) => card.missingCount ?? card.items.filter((item) => item.status === 'missing').length
  const tabPick = initialTabTitle ? cards.find((item) => item.title === initialTabTitle) : undefined
  const firstOpen = tabPick ?? cards.find((card) => missingOf(card) > 0) ?? cards.find((card) => card.items.length > 0) ?? cards[0]
  const [activeTitle, setActiveTitle] = useState(firstOpen?.title)
  const card = cards.find((item) => item.title === activeTitle) ?? cards[0]
  if (!card) return null
  const Icon = ICONS[card.icon]
  const items = [...card.items].sort((a, b) => Number(b.status === 'missing') - Number(a.status === 'missing'))

  return (
    <section aria-labelledby="floor-checksheets-heading" className="flex flex-col gap-3">
      <div className="flex items-end justify-between gap-3 px-1">
        <div>
          <h2 id="floor-checksheets-heading" className="text-lg font-semibold">{floorLabel} 체크시트</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">{todayLabel} 기준 · 총 {totalCount}개</p>
        </div>
      </div>

      <div role="tablist" aria-label="점검 종류" className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        {cards.map((item) => {
          const TabIcon = ICONS[item.icon]
          const missing = missingOf(item)
          const isActive = item.title === card.title
          return (
            <button
              key={item.title}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setActiveTitle(item.title)}
              className={cn(
                'flex items-center gap-3 rounded-xl border px-3.5 py-3 text-left transition-all active:scale-[0.99]',
                isActive
                  ? 'border-primary/40 bg-card shadow-sm ring-2 ring-primary/15'
                  : 'border-border bg-card/60 hover:bg-card',
              )}
            >
              <span className={cn('flex size-9 shrink-0 items-center justify-center rounded-lg', TONE_ACCENT[item.tone])}>
                <TabIcon className="size-[1.1rem]" aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">
                <span className={cn('block truncate text-sm font-semibold', !isActive && 'text-muted-foreground')}>{item.title}</span>
                <span
                  className={cn(
                    'block text-xs',
                    missing > 0
                      ? 'font-medium text-rose-700 dark:text-rose-400'
                      : item.count > 0
                        ? 'font-medium text-emerald-700 dark:text-emerald-400'
                        : 'text-muted-foreground',
                  )}
                >
                  {missing > 0 ? `미점검 ${missing}건` : item.count > 0 ? `${item.count}개 · 점검 완료` : '등록된 항목 없음'}
                </span>
              </span>
            </button>
          )
        })}
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <div className="flex items-center justify-between gap-3 border-b border-border/70 bg-muted/30 px-4 py-2.5">
          <p className="flex min-w-0 items-center gap-2 text-sm text-muted-foreground">
            <span className={cn('flex size-6 shrink-0 items-center justify-center rounded-md', TONE_ACCENT[card.tone])}>
              <Icon className="size-3.5" aria-hidden="true" />
            </span>
            <span className="truncate">{card.description}</span>
          </p>
          {canAdd ? (
            <AddTarget
              icon={card.icon}
              selectedFloor={selectedFloor}
              defaultFloor={defaultFloor}
              lockedFloor={lockedFloor}
            />
          ) : null}
        </div>

        {items.length > 0 ? (
          items.map((item) => (
            <TargetRow
              key={item.id}
              href={item.href}
              name={item.name}
              department={item.meta}
              person={item.inspector}
              status={item.status}
              statusLabel={item.statusLabel}
              gap={item.gap}
              todayLabel={todayLabel}
              kind={KIND_OF[card.icon]}
              trailing={canAdd ? <RowDelete icon={card.icon} id={item.id} name={item.name} /> : null}
            />
          ))
        ) : (
          <div className="flex flex-col items-center gap-3 px-5 py-10 text-center">
            <p className="text-sm text-muted-foreground">이 층에 등록된 항목이 없습니다.</p>
            {canAdd ? (
              <AddTarget
                icon={card.icon}
                selectedFloor={selectedFloor}
                defaultFloor={defaultFloor}
                lockedFloor={lockedFloor}
              />
            ) : null}
          </div>
        )}
      </div>
    </section>
  )
}
