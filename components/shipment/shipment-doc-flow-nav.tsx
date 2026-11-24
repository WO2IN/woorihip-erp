'use client'

import { ArrowRight, Barcode, ChevronRight, ClipboardCheck, FileCheck, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export type ShipmentDocStep = 'incoming' | 'lot-card' | 'outgoing'

const STEPS = [
  {
    id: 'incoming' as const,
    seq: 1,
    short: '수입검사',
    label: '수입검사 성적서',
    href: '/shipment/incoming-inspection',
    icon: ClipboardCheck,
  },
  {
    id: 'lot-card' as const,
    seq: 2,
    short: '이력카드',
    label: 'LOT 이력카드',
    href: '/shipment/lot-card',
    icon: Barcode,
  },
  {
    id: 'outgoing' as const,
    seq: 3,
    short: '출하',
    label: '출하성적서',
    href: '/shipment/outgoing-report',
    icon: FileCheck,
  },
] as const

const NEXT_LABEL: Record<ShipmentDocStep, string | null> = {
  incoming: 'LOT 이력카드로 이어쓰기',
  'lot-card': '출하성적서로 이어쓰기',
  outgoing: null,
}

export function ShipmentDocFlowNav({
  step,
  canWrite = false,
  onNext,
  nextDisabled,
  nextLoading,
}: {
  step: ShipmentDocStep
  canWrite?: boolean
  onNext?: () => void
  nextDisabled?: boolean
  nextLoading?: boolean
}) {
  const activeIndex = STEPS.findIndex((item) => item.id === step)
  const nextLabel = NEXT_LABEL[step]

  return (
    <nav
      aria-label="입고 품질 서류 흐름"
      className="no-print mt-4 rounded-2xl border border-teal-200/80 bg-gradient-to-br from-teal-50/90 via-card to-orange-50/40 p-3 shadow-sm dark:border-teal-900/40 dark:from-teal-950/25 dark:via-card dark:to-orange-950/15 sm:p-4"
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold tracking-wide text-teal-800/80 dark:text-teal-200/80">입고 · 이력 · 출하 한 묶음</p>
        {canWrite && onNext && nextLabel ? (
          <Button
            type="button"
            size="sm"
            disabled={nextDisabled || nextLoading}
            onClick={onNext}
            className="h-9 gap-1.5 rounded-full bg-teal-600 px-4 text-white shadow-md hover:bg-teal-700 dark:bg-teal-600 dark:hover:bg-teal-500"
          >
            {nextLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
            {nextLoading ? '이동 중…' : nextLabel}
          </Button>
        ) : null}
      </div>

      <ol className="flex flex-col gap-2 md:flex-row md:items-stretch">
        {STEPS.map((item, index) => {
          const active = item.id === step
          const done = index < activeIndex
          const Icon = item.icon
          const isLast = index === STEPS.length - 1

          return (
            <li key={item.id} className="flex min-w-0 flex-1 items-center gap-1 md:gap-0">
              <div className="flex min-w-0 flex-1 items-stretch">
                {active ? (
                  <span
                    className={cn(
                      'flex min-h-12 w-full items-center gap-3 rounded-xl border-2 border-teal-500/80 bg-card px-3 py-2.5 shadow-sm ring-2 ring-teal-400/25',
                      'dark:border-teal-500 dark:ring-teal-500/20',
                    )}
                  >
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-teal-600 text-sm font-bold text-white shadow-sm">
                      {item.seq}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[11px] font-medium text-teal-700 dark:text-teal-300">현재 단계</span>
                      <span className="block truncate text-sm font-bold text-foreground">{item.label}</span>
                    </span>
                    <Icon className="ml-auto hidden h-5 w-5 shrink-0 text-teal-600 sm:block dark:text-teal-400" />
                  </span>
                ) : (
                  <span
                    aria-disabled
                    title="이어쓰기로 단계 이동만 할 수 있습니다"
                    className={cn(
                      'flex min-h-12 w-full cursor-default items-center gap-3 rounded-xl border bg-card/60 px-3 py-2.5 opacity-80',
                      done
                        ? 'border-emerald-200/60 dark:border-emerald-900/40'
                        : 'border-border',
                    )}
                  >
                    <span
                      className={cn(
                        'flex size-9 shrink-0 items-center justify-center rounded-lg text-sm font-bold',
                        done
                          ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                          : 'bg-muted text-muted-foreground',
                      )}
                    >
                      {item.seq}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-muted-foreground">{item.short}</span>
                      <span className="hidden truncate text-[11px] text-muted-foreground/80 sm:block">{item.label}</span>
                    </span>
                  </span>
                )}
              </div>
              {!isLast && (
                <ChevronRight
                  className="mx-0.5 hidden h-5 w-5 shrink-0 text-teal-300 md:block dark:text-teal-700"
                  aria-hidden
                />
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}