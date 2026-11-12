'use client'

import { useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

interface YearMonthPickerProps {
  year: number
  month: number
}

export function YearMonthPicker({ year, month }: YearMonthPickerProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [open, setOpen] = useState(false)
  const now = new Date()
  const thisYear = now.getFullYear()
  const thisMonth = now.getMonth() + 1
  const years = Array.from({ length: 7 }, (_, index) => thisYear - 3 + index)
  const months = Array.from({ length: 12 }, (_, index) => index + 1)

  function update(nextYear: number, nextMonth: number) {
    const params = new URLSearchParams(searchParams.toString())
    params.set('year', String(nextYear))
    params.set('month', String(nextMonth))
    router.push(`${pathname}?${params.toString()}`)
  }

  function shiftMonth(delta: number) {
    const date = new Date(year, month - 1 + delta, 1)
    update(date.getFullYear(), date.getMonth() + 1)
  }

  return (
    <div className="no-print inline-flex items-center gap-1 rounded-2xl border border-slate-200 bg-card p-1 shadow-sm dark:border-white/10">
      <button
        type="button"
        aria-label="이전 달"
        onClick={() => shiftMonth(-1)}
        className="flex size-8 items-center justify-center rounded-xl text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-white/10 dark:hover:text-white"
      >
        <ChevronLeft className="size-4" />
      </button>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          className="inline-flex h-8 items-center gap-2 rounded-xl px-2.5 text-sm font-semibold text-slate-800 transition-colors hover:bg-slate-100 dark:text-slate-100 dark:hover:bg-white/10"
        >
          <CalendarDays className="size-4 text-emerald-600" />
          <span className="tabular-nums">{year}년 {month}월</span>
          <ChevronDown className={cn('size-3.5 text-slate-400 transition-transform', open && 'rotate-180')} />
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[17.5rem] gap-3 p-3">
          <div>
            <p className="mb-2 text-[11px] font-semibold tracking-wide text-muted-foreground">연도</p>
            <div className="grid grid-cols-4 gap-1">
              {years.map((item) => {
                const selected = item === year
                return (
                  <button
                    key={item}
                    type="button"
                    onClick={() => update(item, month)}
                    className={cn(
                      'rounded-lg px-1 py-1.5 text-sm tabular-nums transition-colors',
                      selected
                        ? 'bg-emerald-600 font-semibold text-white'
                        : 'text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-white/10',
                      item === thisYear && !selected && 'font-semibold text-emerald-700 dark:text-emerald-300',
                    )}
                  >
                    {item}
                  </button>
                )
              })}
            </div>
          </div>
          <div>
            <p className="mb-2 text-[11px] font-semibold tracking-wide text-muted-foreground">월</p>
            <div className="grid grid-cols-4 gap-1">
              {months.map((item) => {
                const selected = item === month
                const current = year === thisYear && item === thisMonth
                return (
                  <button
                    key={item}
                    type="button"
                    onClick={() => {
                      update(year, item)
                      setOpen(false)
                    }}
                    className={cn(
                      'relative rounded-lg py-1.5 text-sm tabular-nums transition-colors',
                      selected
                        ? 'bg-slate-900 font-semibold text-white dark:bg-white dark:text-slate-900'
                        : 'text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-white/10',
                    )}
                  >
                    {item}월
                    {current && !selected ? <span className="absolute top-1 right-1 size-1 rounded-full bg-emerald-500" /> : null}
                  </button>
                )
              })}
            </div>
          </div>
        </PopoverContent>
      </Popover>
      <button
        type="button"
        aria-label="다음 달"
        onClick={() => shiftMonth(1)}
        className="flex size-8 items-center justify-center rounded-xl text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-white/10 dark:hover:text-white"
      >
        <ChevronRight className="size-4" />
      </button>
    </div>
  )
}
