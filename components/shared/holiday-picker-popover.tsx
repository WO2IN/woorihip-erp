'use client'

import { CalendarDaysIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getDayRange, isWeekend } from '@/lib/date-utils'
import { Button } from '@/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from '@/components/ui/popover'

interface HolidayPickerPopoverProps {
  year: number
  month: number
  holidays: number[]
  workdays?: number[]
  onToggle: (day: number) => void
}

export function HolidayPickerPopover({ year, month, holidays, workdays = [], onToggle }: HolidayPickerPopoverProps) {
  const days = getDayRange(year, month)

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            type="button"
            size="sm"
            variant={holidays.length > 0 || workdays.length > 0 ? 'secondary' : 'outline'}
            className="h-8 gap-1.5 px-2.5"
          />
        }
      >
        <CalendarDaysIcon className="size-3.5" />
        휴무일
        {holidays.length > 0 && <span className="text-xs text-muted-foreground">({holidays.length})</span>}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 gap-3 p-3">
        <PopoverHeader>
          <PopoverTitle>휴무일 지정</PopoverTitle>
          <PopoverDescription>
            평일을 누르면 휴무일로 지정합니다. 주말은 휴무로 체크되어 있고, 다시 누르면 근무일로 풀 수 있습니다.
          </PopoverDescription>
        </PopoverHeader>
        <div className="grid grid-cols-7 gap-1">
          {days.map((day) => {
            const weekend = isWeekend(year, month, day)
            const opened = workdays.includes(day)
            const off = holidays.includes(day) || (weekend && !opened)
            return (
              <button
                key={day}
                type="button"
                onClick={() => onToggle(day)}
                className={cn(
                  'h-8 rounded-md border text-xs font-medium transition-colors',
                  off
                    ? 'border-primary bg-primary/15 text-primary hover:bg-primary/25'
                    : 'border-border bg-background hover:bg-accent/40',
                )}
                aria-pressed={off}
                aria-label={`${day}일${off ? ' 휴무' : weekend ? ' 근무로 변경된 주말' : ''}`}
              >
                {day}
              </button>
            )
          })}
        </div>
        {holidays.length > 0 && (
          <p className="text-xs text-muted-foreground">지정된 휴무일: {holidays.join(', ')}일</p>
        )}
        {workdays.length > 0 && (
          <p className="text-xs text-muted-foreground">근무로 푼 주말: {workdays.join(', ')}일</p>
        )}
      </PopoverContent>
    </Popover>
  )
}
