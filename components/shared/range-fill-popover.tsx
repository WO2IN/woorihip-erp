'use client'

import { useMemo, useState } from 'react'
import { CalendarCheck2Icon, DicesIcon } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from '@/components/ui/popover'

const numberInputClassName =
  'h-8 w-16 text-center [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none'

interface RangeFillPopoverProps {
  lastDay: number
  todayDay: number
  isCurrentMonth: boolean
  description: string
  triggerLabel?: string
  onFillRange: (fromDay: number, toDay: number) => void
  onFillUpToToday?: () => void
}

export function RangeFillPopover({
  lastDay,
  todayDay,
  isCurrentMonth,
  description,
  triggerLabel = '자동 채우기',
  onFillRange,
  onFillUpToToday,
}: RangeFillPopoverProps) {
  const [open, setOpen] = useState(false)
  const defaultRangeEnd = isCurrentMonth ? todayDay : lastDay
  const [rangeStart, setRangeStart] = useState('1')
  const [rangeEnd, setRangeEnd] = useState(String(defaultRangeEnd))

  const parsedRange = useMemo(() => {
    const fromDay = Number(rangeStart)
    const toDay = Number(rangeEnd)
    if (!Number.isFinite(fromDay) || !Number.isFinite(toDay)) return null
    return {
      fromDay: Math.max(1, Math.min(fromDay, toDay)),
      toDay: Math.min(lastDay, Math.max(fromDay, toDay)),
    }
  }, [lastDay, rangeEnd, rangeStart])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button type="button" size="sm" variant="outline" className="h-8 gap-1.5 px-2.5" />
        }
      >
        <DicesIcon className="size-3.5" />
        {triggerLabel}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 gap-3 p-3">
        <PopoverHeader>
          <PopoverTitle>자동 채우기</PopoverTitle>
          <PopoverDescription>{description}</PopoverDescription>
        </PopoverHeader>

        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-2">
            <span className="text-xs font-medium">채울 기간</span>
            <label className="flex items-center gap-1 text-xs">
              <Input
                aria-label="시작일"
                type="number"
                min={1}
                max={lastDay}
                step="1"
                value={rangeStart}
                onChange={(e) => setRangeStart(e.target.value)}
                className={numberInputClassName}
              />
              일 ~
              <Input
                aria-label="종료일"
                type="number"
                min={1}
                max={lastDay}
                step="1"
                value={rangeEnd}
                onChange={(e) => setRangeEnd(e.target.value)}
                className={numberInputClassName}
              />
              일
            </label>
          </div>

          <div className="flex flex-col gap-2">
            <Button
              type="button"
              size="sm"
              disabled={!parsedRange}
              onClick={() => {
                if (!parsedRange) return
                onFillRange(parsedRange.fromDay, parsedRange.toDay)
                setOpen(false)
              }}
              className="h-8 w-full gap-1.5"
            >
              <DicesIcon data-icon="inline-start" />
              선택 기간 빈 셀 채우기
            </Button>
            {isCurrentMonth && onFillUpToToday && (
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => {
                  onFillUpToToday()
                  setOpen(false)
                }}
                className="h-8 w-full gap-1.5"
              >
                <CalendarCheck2Icon data-icon="inline-start" />
                오늘({todayDay}일)까지 채우기
              </Button>
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
