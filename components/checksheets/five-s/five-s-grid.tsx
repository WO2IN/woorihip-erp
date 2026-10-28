'use client'

import { useEffect, useMemo, useOptimistic, useRef, useState, useTransition } from 'react'
import { cn } from '@/lib/utils'
import { getDayRange, isDayOffDate, isWeekend, scheduledDaysForCycle } from '@/lib/date-utils'
import { isDueOnDay } from '@/lib/today-check'
import { FIVE_S_CATEGORIES, FIVE_S_SYMBOLS } from '@/lib/constants/five-s-catalog'
import {
  upsertFiveSEntry,
  bulkFillFiveSEntries,
  clearFiveSSheetEntries,
  updateFiveSCheckItem,
} from '@/app/actions/five-s'
import { Trash2Icon } from 'lucide-react'
import { formatCheckStamp } from '@/lib/check-stamp'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { CellSelect } from '@/components/shared/cell-select'
import { HolidayPickerPopover } from '@/components/shared/holiday-picker-popover'
import { RangeFillPopover } from '@/components/shared/range-fill-popover'
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

export interface FiveSCheckItem {
  id: number
  targetId: number
  code: string
  category: string
  no: number
  content: string
  cycle: string
}

interface FiveSGridProps {
  sheetId: number
  year: number
  month: number
  items: FiveSCheckItem[]
  entries: { itemCode: string; day: number; value: string | null; checkedBy?: string | null; checkedAt?: string | null }[]
  holidays?: number[]
  workdays?: number[]
  onToggleHoliday?: (day: number) => void
  canManage?: boolean
}

const SYMBOL_LABELS: Record<string, string> = {
  '◎': '매우잘함',
  '○': '잘함',
  '△': '보통수준',
  V: '미흡함',
  '×': '대단히 미흡함',
  'N/A': '해당없음',
}

export function FiveSGrid({ sheetId, year, month, items, entries, holidays = [], workdays = [], onToggleHoliday, canManage = false }: FiveSGridProps) {
  const days = getDayRange(year, month)
  const [, startTransition] = useTransition()
  const [selectedSymbol, setSelectedSymbol] = useState<string>('○')
  const [clearDialogOpen, setClearDialogOpen] = useState(false)
  const [adminOpen, setAdminOpen] = useState(false)
  const [optimisticHolidays, toggleOptimisticHoliday] = useOptimistic(
    holidays,
    (state, day: number) =>
      state.includes(day) ? state.filter((d) => d !== day) : [...state, day].sort((a, b) => a - b),
  )
  const [optimisticWorkdays, toggleOptimisticWorkday] = useOptimistic(
    workdays,
    (state, day: number) =>
      state.includes(day) ? state.filter((d) => d !== day) : [...state, day].sort((a, b) => a - b),
  )

  function isDayOff(day: number) {
    return isDayOffDate(year, month, day, optimisticHolidays, optimisticWorkdays)
  }
  const commandBuffer = useRef('')
  const commandTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const entryMap = new Map(entries.map((e) => [`${e.itemCode}-${e.day}`, e.value ?? '']))
  const stampMap = new Map(entries.map((e) => [`${e.itemCode}-${e.day}`, formatCheckStamp(e.checkedBy, e.checkedAt)]))

  const [optimisticEntries, setOptimisticEntry] = useOptimistic(
    entryMap,
    (state, update: { key: string; value: string }) => {
      const next = new Map(state)
      next.set(update.key, update.value)
      return next
    },
  )

  const today = useMemo(() => new Date(), [])
  const isCurrentMonth = today.getFullYear() === year && today.getMonth() + 1 === month
  const todayDay = today.getDate()

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return
      const target = event.target as HTMLElement | null
      if (target?.matches('input, textarea, select, [contenteditable="true"]')) return
      commandBuffer.current = `${commandBuffer.current}${event.key.toLowerCase()}`.slice(-8)
      if (commandBuffer.current === 'woorihip') {
        setAdminOpen((open) => !open)
        commandBuffer.current = ''
      }
      if (commandTimer.current) clearTimeout(commandTimer.current)
      commandTimer.current = setTimeout(() => { commandBuffer.current = '' }, 1500)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      if (commandTimer.current) clearTimeout(commandTimer.current)
    }
  }, [])

  function handleItemFieldBlur(item: FiveSCheckItem, field: 'content' | 'cycle', value: string) {
    if (!canManage || value === item[field]) return
    startTransition(() => {
      updateFiveSCheckItem(item.id, item.targetId, { [field]: value })
    })
  }

  function handleCellClick(item: FiveSCheckItem, day: number) {
    if (!canManage) return
    const key = `${item.code}-${day}`
    const current = optimisticEntries.get(key) ?? ''
  
    const hasNA = days.some(
      (d) => optimisticEntries.get(`${item.code}-${d}`) === 'N/A'
    )
  
    // N/A가 이미 있으면 N/A가 들어있는 칸만 다시 클릭 가능
    if (hasNA && current !== 'N/A') return
  
    const next = current === selectedSymbol ? '' : selectedSymbol
  
    startTransition(() => {
      setOptimisticEntry({ key, value: next })
      upsertFiveSEntry(sheetId, item.code, day, next)
    })
  }

  function isScheduledDay(item: FiveSCheckItem, day: number) {
    if (isDayOff(day)) return false
  
    const scheduledDays = scheduledDaysForCycle(
      year,
      month,
      1,
      days.length,
      item.cycle || '일',
      isDayOff,
    )
  
    return scheduledDays.includes(day)
  }

  function handleBulkFill(fromDay: number, toDay: number) {
    if (!canManage) return
    startTransition(() => {
      for (const item of items) {
        const hasNA = days.some((day) => optimisticEntries.get(`${item.code}-${day}`) === 'N/A')
        if (hasNA) continue

        for (let day = fromDay; day <= toDay; day++) {
          if (!isScheduledDay(item, day)) continue
          const key = `${item.code}-${day}`
          if (!optimisticEntries.get(key)) setOptimisticEntry({ key, value: selectedSymbol })
        }
      }
      bulkFillFiveSEntries(sheetId, year, month, toDay, selectedSymbol, items, fromDay)
    })
  }

  function handleClearAll() {
    setClearDialogOpen(false)
    startTransition(() => {
      for (const item of items) {
        for (const day of days) {
          setOptimisticEntry({ key: `${item.code}-${day}`, value: '' })
        }
      }
      clearFiveSSheetEntries(sheetId)
    })
  }

  function handleHolidayToggle(day: number) {
    if (!onToggleHoliday) return
    const weekend = isWeekend(year, month, day)
    if (weekend) {
      const opening = !optimisticWorkdays.includes(day)
      startTransition(() => {
        toggleOptimisticWorkday(day)
        if (!opening) {
          for (const item of items) {
            setOptimisticEntry({ key: `${item.code}-${day}`, value: '' })
          }
        }
        onToggleHoliday(day)
      })
      return
    }
    const adding = !optimisticHolidays.includes(day)
    startTransition(() => {
      toggleOptimisticHoliday(day)
      if (adding) {
        for (const item of items) {
          setOptimisticEntry({ key: `${item.code}-${day}`, value: '' })
        }
      }
      onToggleHoliday(day)
    })
  }

  return (
    <div className="print-grid flex min-h-0 flex-col gap-2">
      <div className="no-print flex flex-wrap items-center gap-2 border border-border bg-card p-2">
        <span className="px-1 text-xs font-medium text-muted-foreground">입력할 표시 선택:</span>
        {FIVE_S_SYMBOLS.filter((s) => s !== '').map((symbol) => (
          <Button
            key={symbol}
            type="button"
            size="sm"
            variant={selectedSymbol === symbol ? 'default' : 'outline'}
            onClick={() => setSelectedSymbol(symbol)}
            className="h-8 gap-1.5 px-2.5"
          >
            <span className="text-sm font-semibold">{symbol}</span>
            <span className="text-xs">{SYMBOL_LABELS[symbol]}</span>
          </Button>
        ))}

        <div className="ml-auto flex items-center gap-2">
          {adminOpen && (
            <RangeFillPopover
              lastDay={days.length}
              todayDay={todayDay}
              isCurrentMonth={isCurrentMonth}
              description={`선택한 표시(${selectedSymbol})를 빈 칸에만 채웁니다. 휴무일·주말과 주기 외 날짜는 건너뜁니다.`}
              onFillRange={handleBulkFill}
              onFillUpToToday={isCurrentMonth ? () => handleBulkFill(1, todayDay) : undefined}
            />
          )}
          {canManage && onToggleHoliday && (
            <HolidayPickerPopover
              year={year}
              month={month}
              holidays={optimisticHolidays}
              workdays={optimisticWorkdays}
              onToggle={handleHolidayToggle}
            />
          )}

        {canManage && (
        <AlertDialog open={clearDialogOpen} onOpenChange={setClearDialogOpen}>
          <AlertDialogTrigger
            render={
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8 gap-1.5 px-2.5 text-destructive hover:text-destructive"
              />
            }
          >
            <Trash2Icon className="size-3.5" />
            전체 지우기
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>이번 달 체크 내용을 모두 지울까요?</AlertDialogTitle>
              <AlertDialogDescription>
                {year}년 {month}월 3정 5S Check Sheet에 입력된 모든 표시가 삭제됩니다. 이 작업은 되돌릴 수 없습니다.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>취소</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-white hover:bg-destructive/90"
                onClick={handleClearAll}
              >
                전체 지우기
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
          </AlertDialog>
        )}
        </div>
      </div>
      <p className="no-print px-1 text-xs text-muted-foreground">
        위에서 표시를 선택한 뒤 칸을 클릭하면 바로 입력됩니다. 같은 표시를 다시 클릭하면 지워집니다.
        {isCurrentMonth ? ' 오늘 채워야 하는데 비어 있는 칸은 노란색으로 표시됩니다.' : ''}
      </p>

      <div className="print-sheet overflow-x-auto border border-border">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr>
              <th
                rowSpan={2}
                className="print-category-cell w-12 print:w-14 border-r border-b border-border bg-muted p-1 text-sm font-medium"
              >
                구분
              </th>
              <th
                rowSpan={2}
                className="print-content-cell min-w-48 print:min-w-56 border-r border-b border-border bg-muted p-1 text-left text-sm font-medium"
              >
                점검 내용
              </th>
              <th
                rowSpan={2}
                className="print-cycle-cell w-10 print:w-14 border-r border-b border-border bg-muted p-1 text-sm font-medium"
              >
                주기
              </th>
              <th colSpan={days.length} className="border-b border-border bg-muted p-1 text-sm font-medium">
                점검현황
              </th>
            </tr>
            <tr>
              {days.map((day) => {
                const dayOff = isDayOff(day)
                return (
                  <th
                    key={day}
                    className={cn(
                      'print-day-cell h-7 print:h-5 w-8 border-r border-b border-border p-0 text-xs print:text-[10px] font-medium last:border-r-0',
                      dayOff && 'weekend-cell bg-muted-foreground/10',
                      isCurrentMonth && day === todayDay && 'today-col',
                    )}
                  >
                    {day}
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {FIVE_S_CATEGORIES.map((category) => {
              const rows = items.filter((item) => item.category === category)
              return rows.map((item, rowIdx) => (
                <tr key={item.code}>
                  {rowIdx === 0 && (
                    <td
                      rowSpan={rows.length}
                      className="print-category-cell whitespace-nowrap border-r border-b border-border bg-muted/60 p-1 text-center align-middle text-sm font-medium"
                    >
                      {category}
                    </td>
                  )}
                  <td className="print-content-cell whitespace-nowrap border-r border-b border-border p-1.5 print:p-0 text-left">
                    <Input
                      defaultValue={item.content}
                      readOnly={!canManage}
                      aria-label={`${category} ${item.no}번 점검 내용`}
                      onBlur={(event) => handleItemFieldBlur(item, 'content', event.currentTarget.value)}
                      className="h-8 print:h-5 rounded-none border-0 bg-transparent px-1 text-xs print:text-[10px] shadow-none focus-visible:ring-1"
                    />
                  </td>
                  <td className="print-cycle-cell w-10 print:w-14 border-r border-b border-border p-0 text-center">
                    <CellSelect
                      aria-label={`${category} ${item.no}번 주기`}
                      value={item.cycle || '일'}
                      disabled={!canManage}
                      options={['일', '주', '월']}
                      onChange={(value) => {
                        handleItemFieldBlur(item, 'cycle', value)
                      }}
                    />
                  </td>
                  {days.map((day) => {
                    const key = `${item.code}-${day}`
                    const value = optimisticEntries.get(key) ?? ''
                    const dayOff = isDayOff(day)

                    const hasNA = days.some(
                      (d) => optimisticEntries.get(`${item.code}-${d}`) === 'N/A'
                    )

                    const isNACell = value === 'N/A'
                    const monthlyHighlight = item.cycle === '월'
                    const missing =
                      isCurrentMonth &&
                      day === todayDay &&
                      !value &&
                      !hasNA &&
                      isDueOnDay(year, month, day, item.cycle || '일', isDayOff)

                    return (
                      <td
                        key={day}
                        title={value ? stampMap.get(key) || undefined : undefined}
                        onClick={() => {
                          if (hasNA && !isNACell) return
                          handleCellClick(item, day)
                        }}
                        className={cn(
                          'print-day-cell relative h-8 print:h-5 w-8 border-r border-b border-border p-0 text-center text-xs print:text-[10px] font-medium last:border-r-0',
                        
                          dayOff && 'weekend-cell bg-muted-foreground/10',
                        
                          hasNA &&
                            !isNACell &&
                            'cursor-not-allowed bg-red-50',
                        
                          canManage && !(hasNA && !isNACell) && 'cursor-pointer hover:bg-accent/30',
                        
                          monthlyHighlight &&
                            !hasNA &&
                            'monthly-cell bg-accent/70',

                          missing && 'missing-today',
                        
                          hasNA &&
                            'after:pointer-events-none after:absolute after:left-0 after:right-0 after:top-1/2 after:h-[2px] after:bg-red-500',
                        )}
                      >
                        {value}
                      </td>
                    )
                  })}
                </tr>
              ))
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
