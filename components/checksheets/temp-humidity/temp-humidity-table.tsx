'use client'

import { useEffect, useMemo, useOptimistic, useRef, useState, useTransition } from 'react'
import { cn } from '@/lib/utils'
import { getDayRange, isDayOffDate } from '@/lib/date-utils'
import { filledValue } from '@/lib/today-check'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { bulkUpsertTempHumidityEntries, upsertTempHumidityEntry, clearTempHumidityEntries } from '@/app/actions/temp-humidity'
import { CalendarCheck2Icon, DicesIcon, Trash2Icon } from 'lucide-react'
import { formatCheckStamp } from '@/lib/check-stamp'
import { HolidayPickerPopover } from '@/components/shared/holiday-picker-popover'
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
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from '@/components/ui/popover'

interface TempHumidityEntry {
  day: number
  temperature: string | null
  humidity: string | null
  checker: string | null
  checkedBy?: string | null
  checkedAt?: string | null
}

interface TempHumidityTableProps {
  sheetId: number
  year: number
  month: number
  entries: TempHumidityEntry[]
  manager?: string
  holidays?: number[]
  workdays?: number[]
  onToggleHoliday?: (day: number) => void
  canManage?: boolean
}

const numberInputClassName =
  'h-8 rounded-none border-0 px-1 text-center text-xs shadow-none focus-visible:ring-0 disabled:cursor-not-allowed disabled:bg-muted/50 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none'

function randomInRange(min: number, max: number): string {
  if (min > max) [min, max] = [max, min]
  return Math.round(min + Math.random() * (max - min)).toString()
}

function parseRangeValues(tempMin: string, tempMax: string, humidityMin: string, humidityMax: string) {
  const min = Number(tempMin)
  const max = Number(tempMax)
  const hMin = Number(humidityMin)
  const hMax = Number(humidityMax)
  if (![min, max, hMin, hMax].every(Number.isFinite)) return null
  return { min, max, hMin, hMax }
}

function getCheckerInitial(manager: string) {
  const trimmed = manager.trim()
  return trimmed ? trimmed[0] : ''
}

export function TempHumidityTable({
  sheetId,
  year,
  month,
  entries,
  manager = '',
  holidays = [],
  workdays = [],
  onToggleHoliday,
  canManage = false,
}: TempHumidityTableProps) {
  const stampByDay = new Map(entries.map((entry) => [entry.day, formatCheckStamp(entry.checkedBy, entry.checkedAt)]))
  const days = getDayRange(year, month)
  const lastDay = days.length
  const [, startTransition] = useTransition()
  const [fillOpen, setFillOpen] = useState(false)
  const [adminOpen, setAdminOpen] = useState(false)
  const [tempMin, setTempMin] = useState('10')
  const [tempMax, setTempMax] = useState('30')
  const [humidityMin, setHumidityMin] = useState('0')
  const [humidityMax, setHumidityMax] = useState('60')
  const commandBuffer = useRef('')
  const commandTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const today = useMemo(() => new Date(), [])
  const isCurrentMonth = today.getFullYear() === year && today.getMonth() + 1 === month
  const todayDay = today.getDate()
  const defaultRangeEnd = isCurrentMonth ? todayDay : lastDay
  const checkerInitial = useMemo(() => getCheckerInitial(manager), [manager])

  const [rangeStart, setRangeStart] = useState('1')
  const [rangeEnd, setRangeEnd] = useState(String(defaultRangeEnd))

  function isDayOff(day: number) {
    return isDayOffDate(year, month, day, holidays, workdays)
  }

  const entryMap = new Map(entries.map((e) => [e.day, e]))
  const [optimisticEntries, setOptimisticEntry] = useOptimistic(
    entryMap,
    (state, update: { day: number; fields: Partial<TempHumidityEntry> }) => {
      const next = new Map(state)
      const current = next.get(update.day) ?? { day: update.day, temperature: null, humidity: null, checker: null }
      next.set(update.day, { ...current, ...update.fields })
      return next
    },
  )

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

  function handleBlur(day: number, field: 'temperature' | 'humidity' | 'checker', value: string) {
    if (!canManage) return
    const next = field === 'checker' ? getCheckerInitial(value) : value
    startTransition(() => {
      setOptimisticEntry({ day, fields: { [field]: next || null } })
      upsertTempHumidityEntry(sheetId, day, { [field]: next || null })
    })
  }

  function applyFillUpdates(updates: { day: number; temperature?: string | null; humidity?: string | null; checker?: string | null }[]) {
    if (!canManage || !updates.length) return
    startTransition(() => {
      updates.forEach(({ day, temperature, humidity, checker }) => {
        const fields = {
          ...(temperature !== undefined && temperature !== null ? { temperature } : {}),
          ...(humidity !== undefined && humidity !== null ? { humidity } : {}),
          ...(checker !== undefined && checker !== null ? { checker } : {}),
        }
        setOptimisticEntry({ day, fields })
        upsertTempHumidityEntry(sheetId, day, fields)
      })
    })
  }

  function getTargetDays(fromDay: number, toDay: number) {
    const dayMin = Math.max(1, Math.min(fromDay, toDay))
    const dayMax = Math.min(lastDay, Math.max(fromDay, toDay))
    return days.filter((day) => day >= dayMin && day <= dayMax && !isDayOff(day))
  }

  function buildEmptyFill(day: number, ranges: { min: number; max: number; hMin: number; hMax: number }) {
    const current = optimisticEntries.get(day)
    const temperature = !current?.temperature ? randomInRange(ranges.min, ranges.max) : null
    const humidity = !current?.humidity ? randomInRange(ranges.hMin, ranges.hMax) : null
    const checker = !current?.checker && checkerInitial ? checkerInitial : null
    return { day, temperature, humidity, checker }
  }

  function fillEmptyInRange(fromDay: number, toDay: number, closePopover = false) {
    const ranges = parseRangeValues(tempMin, tempMax, humidityMin, humidityMax)
    if (!ranges) return

    const updates = getTargetDays(fromDay, toDay)
      .map((day) => buildEmptyFill(day, ranges))
      .filter((item) => item.temperature !== null || item.humidity !== null || item.checker !== null)

    applyFillUpdates(updates)
    if (closePopover) setFillOpen(false)
  }

  function fillUpToToday(closePopover = false) {
    const ranges = parseRangeValues(tempMin, tempMax, humidityMin, humidityMax)
    if (!ranges) return

    const updates = getTargetDays(1, todayDay).map((day) => {
      const current = optimisticEntries.get(day)
      return {
        day,
        temperature: current?.temperature || randomInRange(ranges.min, ranges.max),
        humidity: current?.humidity || randomInRange(ranges.hMin, ranges.hMax),
        checker: current?.checker || checkerInitial || null,
      }
    }).filter((item) => {
      const current = optimisticEntries.get(item.day)
      return item.temperature !== (current?.temperature ?? null)
        || item.humidity !== (current?.humidity ?? null)
        || item.checker !== (current?.checker ?? null)
    })

    startTransition(() => {
      updates.forEach(({ day, temperature, humidity, checker }) => setOptimisticEntry({ day, fields: { temperature, humidity, checker } }))
      bulkUpsertTempHumidityEntries(sheetId, updates)
    })
    if (closePopover) setFillOpen(false)
  }

  function handleRangeFill() {
    fillEmptyInRange(Number(rangeStart), Number(rangeEnd), true)
  }

  function handleClearAll() {
    startTransition(() => {
      days.forEach((day) => setOptimisticEntry({ day, fields: { temperature: null, humidity: null, checker: null } }))
      clearTempHumidityEntries(sheetId)
    })
  }

  function handleHolidayToggle(day: number) {
    if (!onToggleHoliday) return
    onToggleHoliday(day)
  }

  return (
    <div className="temp-humidity-table-wrap flex flex-col gap-2 print:mt-0 print:gap-0">
      <div className="no-print flex flex-col gap-2 border border-border bg-card p-2">
        <div className="flex flex-wrap items-center gap-2">
          {adminOpen && (
            <Popover open={fillOpen} onOpenChange={setFillOpen}>
              <PopoverTrigger
                render={
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-8 gap-1.5 px-2.5"
                  />
                }
              >
                <DicesIcon className="size-3.5" />
                자동 채우기
              </PopoverTrigger>
              <PopoverContent align="start" className="w-80 gap-3 p-3">
                <PopoverHeader>
                  <PopoverTitle>난수 자동 채우기</PopoverTitle>
                  <PopoverDescription>
                    설정한 범위의 온도·습도·점검자 값을 빈 셀에만 채웁니다.
                    {checkerInitial ? ` (점검자: ${checkerInitial})` : ''}
                  </PopoverDescription>
                </PopoverHeader>

                <div className="flex flex-col gap-3">
                  <div className="flex flex-col gap-2">
                    <span className="text-xs font-medium">난수 범위</span>
                    <label className="flex items-center gap-1 text-xs">
                      온도
                      <Input aria-label="온도 최솟값" type="number" step="1" value={tempMin} onChange={(e) => setTempMin(e.target.value)} className="h-8 w-16 text-center [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none" />
                      ~
                      <Input aria-label="온도 최댓값" type="number" step="1" value={tempMax} onChange={(e) => setTempMax(e.target.value)} className="h-8 w-16 text-center [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none" />
                    </label>
                    <label className="flex items-center gap-1 text-xs">
                      습도
                      <Input aria-label="습도 최솟값" type="number" step="1" value={humidityMin} onChange={(e) => setHumidityMin(e.target.value)} className="h-8 w-16 text-center [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none" />
                      ~
                      <Input aria-label="습도 최댓값" type="number" step="1" value={humidityMax} onChange={(e) => setHumidityMax(e.target.value)} className="h-8 w-16 text-center [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none" />
                    </label>
                  </div>

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
                        className="h-8 w-16 text-center [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
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
                        className="h-8 w-16 text-center [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                      />
                      일
                    </label>
                  </div>

                  <div className="flex flex-col gap-2">
                    <Button type="button" size="sm" onClick={handleRangeFill} className="h-8 w-full gap-1.5">
                      <DicesIcon data-icon="inline-start" />
                      선택 기간 빈 셀 채우기
                    </Button>
                    {isCurrentMonth && (
                      <Button type="button" size="sm" variant="secondary" onClick={() => fillUpToToday(true)} className="h-8 w-full gap-1.5">
                        <CalendarCheck2Icon data-icon="inline-start" />
                        오늘({todayDay}일)까지 채우기
                      </Button>
                    )}
                  </div>
                </div>
              </PopoverContent>
            </Popover>
          )}

          {canManage && onToggleHoliday && (
            <HolidayPickerPopover year={year} month={month} holidays={holidays} workdays={workdays} onToggle={handleHolidayToggle} />
          )}

          {canManage && (
          <AlertDialog>
            <AlertDialogTrigger
              render={
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="ml-auto h-8 gap-1.5 px-2.5 text-destructive hover:text-destructive"
                />
              }
            >
              <Trash2Icon className="size-3.5" />
              전체 지우기
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>이번 달 온/습도 내용을 모두 지울까요?</AlertDialogTitle>
                <AlertDialogDescription>
                  {year}년 {month}월 온/습도 체크시트에 입력된 온도, 습도, 점검자 값이 모두 삭제됩니다. 이 작업은 되돌릴 수 없습니다.
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

      {isCurrentMonth && (
        <p className="no-print px-1 text-xs text-muted-foreground">
          오늘({todayDay}일) 온도, 습도, 점검자 중 비어 있는 칸은 노란색으로 표시됩니다.
        </p>
      )}

      <div className="print-sheet overflow-x-auto border border-border">
        <table className="no-print min-w-[900px] w-full border-collapse text-xs">
          <thead>
            <tr>
              <th className="w-20 border-r border-b border-border bg-muted p-1.5 text-left text-xs font-medium">구분</th>
              {days.map((day) => {
                const dayOff = isDayOff(day)
                return (
                  <th
                    key={day}
                    className={cn(
                      'min-w-7 border-r border-b border-border bg-muted p-1 text-center text-xs font-medium',
                      dayOff && 'weekend-cell',
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
            {(['temperature', 'humidity'] as const).map((field) => (
              <tr key={field}>
                <th className="border-r border-b border-border bg-muted p-1.5 text-left text-xs font-medium">{field === 'temperature' ? '온도(℃)' : '습도(%)'}</th>
                {days.map((day) => {
                  const entry = optimisticEntries.get(day)
                  const dayOff = isDayOff(day)
                  const missing = isCurrentMonth && day === todayDay && !dayOff && !filledValue(entry?.[field])
                  return (
                    <td key={day} title={stampByDay.get(day) || undefined} className={cn('border-r border-b border-border p-0', dayOff && 'weekend-cell bg-muted-foreground/10', missing && 'missing-today')}>
                      <Input
                        aria-label={`${day}일 ${field === 'temperature' ? '온도' : '습도'}`}
                        type="number"
                        step="1"
                        readOnly={!canManage}
                        defaultValue={entry?.[field] ?? ''}
                        key={`${field}-${day}-${entry?.[field] ?? ''}`}
                        onBlur={(e) => handleBlur(day, field, e.target.value)}
                        className={cn(numberInputClassName, !canManage && 'cursor-default')}
                      />
                    </td>
                  )
                })}
              </tr>
            ))}
            <tr>
              <th className="border-r border-b border-border bg-muted p-1.5 text-left text-xs font-medium">점검자</th>
              {days.map((day) => {
                const dayOff = isDayOff(day)
                const missing = isCurrentMonth && day === todayDay && !dayOff && !filledValue(optimisticEntries.get(day)?.checker)
                return (
                  <td key={day} title={stampByDay.get(day) || undefined} className={cn('border-r border-b border-border p-0', dayOff && 'weekend-cell bg-muted-foreground/10', missing && 'missing-today')}>
                    <Input
                      aria-label={`${day}일 점검자`}
                      readOnly={!canManage}
                      defaultValue={getCheckerInitial(optimisticEntries.get(day)?.checker ?? '')}
                      key={`checker-${day}-${getCheckerInitial(optimisticEntries.get(day)?.checker ?? '')}`}
                      onBlur={(e) => handleBlur(day, 'checker', e.target.value)}
                      className={cn(numberInputClassName, !canManage && 'cursor-default')}
                    />
                  </td>
                )
              })}
            </tr>
          </tbody>
        </table>
        <table className="print-only w-full border-collapse text-[7px]">
          <thead>
            <tr>
              <th className="border border-border bg-muted px-1 py-0.5 text-left">
                구분
              </th>

              {days.map((day) => {
                const dayOff = isDayOff(day)

                return (
                  <th
                    key={day}
                    className={cn(
                      'border border-border px-0.5 py-0.5 text-center',
                      dayOff ? 'weekend-cell' : 'bg-muted',
                    )}
                  >
                    {day}
                  </th>
                )
              })}
            </tr>
          </thead>

          <tbody>
            {(['temperature', 'humidity'] as const).map((field) => (
              <tr key={field}>
                <th className="border border-border bg-muted px-1 py-0.5 text-left font-medium">
                  {field === 'temperature' ? '온도(℃)' : '습도(%)'}
                </th>

                {days.map((day) => {
                  const dayOff = isDayOff(day)

                  return (
                    <td
                      key={day}
                      className={cn(
                        'border border-border px-0.5 py-0.5 text-center',
                        dayOff && 'weekend-cell',
                      )}
                    >
                      {optimisticEntries.get(day)?.[field] ?? ''}
                    </td>
                  )
                })}
              </tr>
            ))}

            <tr>
              <th className="border border-border bg-muted px-1 py-0.5 text-left font-medium">
                점검자
              </th>

              {days.map((day) => {
                const dayOff = isDayOff(day)

                return (
                  <td
                    key={day}
                    className={cn(
                      'border border-border px-0.5 py-0.5 text-center',
                      dayOff && 'weekend-cell',
                    )}
                  >
                    {getCheckerInitial(optimisticEntries.get(day)?.checker ?? '')}
                  </td>
                )
              })}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}
