'use client'

import { useEffect, useMemo, useOptimistic, useRef, useState, useTransition } from 'react'
import { cn } from '@/lib/utils'
import { getCheckerInitial, getDayRange, isDayOffDate, isWeekend, scheduledDaysForCycle } from '@/lib/date-utils'
import { isDueOnDay } from '@/lib/today-check'
import {
  upsertDailyCheckEntry,
  clearDailyCheckSheetEntries,
  toggleDailyCheckMark,
  fillDailyCheckSheet,
} from '@/app/actions/daily-check'
import { updateDailyCheckItem, updateEquipment } from '@/app/actions/equipment'
import { CHECK_METHODS, ITEM_CYCLES, STAFF_CYCLES } from '@/lib/constants/check-catalog'
import { formatCheckStamp } from '@/lib/check-stamp'
import { Trash2Icon } from 'lucide-react'
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

const SYMBOLS = ['O', 'X', '△'] as const

const SYMBOL_LABELS: Record<string, string> = {
  O: '양호',
  X: '불량',
  '△': '주의',
}

const footerInputClass =
  'print-compact-input h-8 rounded-none border-0 px-1 text-center text-xs shadow-none focus-visible:ring-0'

interface DailyCheckItem {
  id: number
  itemNo: number
  content: string
  method: string | null
  cycle: string | null
}

interface StaffInfo {
  name: string
  desc: string
  cycle: string
}

interface DailyCheckGridProps {
  sheetId: number
  equipmentId: number
  year: number
  month: number
  items: DailyCheckItem[]
  entries: { itemId: number; day: number; value: string | null; checkedBy?: string | null; checkedAt?: string | null }[]
  holidays?: number[]
  workdays?: number[]
  onToggleHoliday?: (day: number) => void
  inspector?: StaffInfo
  manager?: StaffInfo
  inspectorMarks?: number[]
  managerMarks?: number[]
  markLog?: { role: 'inspector' | 'manager'; day: number; name: string; at: string }[]
  canManage?: boolean
}

export function DailyCheckGrid({
  sheetId,
  equipmentId,
  year,
  month,
  items,
  entries,
  holidays = [],
  workdays = [],
  onToggleHoliday,
  inspector,
  manager,
  inspectorMarks = [],
  managerMarks = [],
  markLog = [],
  canManage = false,
}: DailyCheckGridProps) {
  const days = getDayRange(year, month)
  const [, startTransition] = useTransition()
  const [selectedSymbol, setSelectedSymbol] = useState<string>('O')
  const [adminOpen, setAdminOpen] = useState(false)
  const commandBuffer = useRef('')
  const commandTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [inspectorInfo, setInspectorInfo] = useState<StaffInfo>({
    name: inspector?.name ?? '',
    desc: inspector?.desc ?? '',
    cycle: inspector?.cycle || '1회/일',
  })
  const [managerInfo, setManagerInfo] = useState<StaffInfo>({
    name: manager?.name ?? '',
    desc: manager?.desc ?? '',
    cycle: manager?.cycle || '1회/주',
  })

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

  const entryMap = useMemo(
    () => new Map(entries.map((e) => [`${e.itemId}-${e.day}`, e.value ?? ''])),
    [entries],
  )
  const stampMap = new Map(
    entries.map((e) => [`${e.itemId}-${e.day}`, formatCheckStamp(e.checkedBy, e.checkedAt)]),
  )

  const [optimisticEntries, setOptimisticEntry] = useOptimistic(
    entryMap,
    (state, update: { key: string; value: string } | { bulk: { key: string; value: string }[] }) => {
      const next = new Map(state)
      if ('bulk' in update) {
        for (const row of update.bulk) next.set(row.key, row.value)
        return next
      }
      next.set(update.key, update.value)
      return next
    },
  )

  const [optimisticInspectorMarks, setOptimisticInspectorMarks] = useOptimistic(
    inspectorMarks,
    (state, update: { day: number; days?: number[] }) => {
      if (update.days) return update.days
      return state.includes(update.day)
        ? state.filter((d) => d !== update.day)
        : [...state, update.day].sort((a, b) => a - b)
    },
  )
  const [optimisticManagerMarks, setOptimisticManagerMarks] = useOptimistic(
    managerMarks,
    (state, update: { day: number; days?: number[] }) => {
      if (update.days) return update.days
      return state.includes(update.day)
        ? state.filter((d) => d !== update.day)
        : [...state, update.day].sort((a, b) => a - b)
    },
  )

  const today = useMemo(() => new Date(), [])
  const isCurrentMonth = today.getFullYear() === year && today.getMonth() + 1 === month
  const todayDay = today.getDate()
  const inspectorInitial = getCheckerInitial(inspectorInfo.name) || '✓'
  const managerInitial = getCheckerInitial(managerInfo.name) || '✓'

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

  function handleCellClick(itemId: number, day: number) {
    if (!canManage) return
    const key = `${itemId}-${day}`
    const current = optimisticEntries.get(key) ?? ''
    const next = current === selectedSymbol ? '' : selectedSymbol
    startTransition(async () => {
      setOptimisticEntry({ key, value: next })
      await upsertDailyCheckEntry(sheetId, itemId, day, next)
    })
  }

  function handleMarkClick(role: 'inspector' | 'manager', day: number) {
    if (!canManage) return
    startTransition(async () => {
      if (role === 'inspector') setOptimisticInspectorMarks({ day })
      else setOptimisticManagerMarks({ day })
      await toggleDailyCheckMark(sheetId, role, day)
    })
  }

  function handleBulkFill(fromDay: number, toDay: number) {
    if (!canManage) return
    const fillItems = items.map((item) => ({ id: item.id, cycle: item.cycle || '일' }))
    const inspectorDays = scheduledDaysForCycle(
      year,
      month,
      fromDay,
      toDay,
      inspectorInfo.cycle || '1회/일',
      isDayOff,
    )
    const managerDays = scheduledDaysForCycle(year, month, fromDay, toDay, managerInfo.cycle || '1회/주', isDayOff)
    const bulk: { key: string; value: string }[] = []
    for (const item of fillItems) {
      const scheduled = scheduledDaysForCycle(year, month, fromDay, toDay, item.cycle, isDayOff)
      for (const day of scheduled) {
        const key = `${item.id}-${day}`
        if (!optimisticEntries.get(key)) bulk.push({ key, value: selectedSymbol })
      }
    }
    startTransition(async () => {
      setOptimisticEntry({ bulk })
      setOptimisticInspectorMarks({
        day: 0,
        days: Array.from(new Set([...optimisticInspectorMarks, ...inspectorDays])).sort((a, b) => a - b),
      })
      setOptimisticManagerMarks({
        day: 0,
        days: Array.from(new Set([...optimisticManagerMarks, ...managerDays])).sort((a, b) => a - b),
      })
      await fillDailyCheckSheet(
        sheetId,
        year,
        month,
        fromDay,
        toDay,
        selectedSymbol,
        fillItems,
        inspectorInfo.cycle || '1회/일',
        managerInfo.cycle || '1회/주',
      )
    })
  }

  function handleClearAll() {
    startTransition(async () => {
      setOptimisticEntry({
        bulk: items.flatMap((item) => days.map((day) => ({ key: `${item.id}-${day}`, value: '' }))),
      })
      setOptimisticInspectorMarks({ day: 0, days: [] })
      setOptimisticManagerMarks({ day: 0, days: [] })
      await clearDailyCheckSheetEntries(sheetId)
    })
  }

  function handleHolidayToggle(day: number) {
    if (!onToggleHoliday) return
    const weekend = isWeekend(year, month, day)
    if (weekend) {
      const opening = !optimisticWorkdays.includes(day)
      startTransition(async () => {
        toggleOptimisticWorkday(day)
        if (!opening) {
          setOptimisticEntry({
            bulk: items.map((item) => ({ key: `${item.id}-${day}`, value: '' })),
          })
          setOptimisticInspectorMarks({
            day: 0,
            days: optimisticInspectorMarks.filter((d) => d !== day),
          })
          setOptimisticManagerMarks({
            day: 0,
            days: optimisticManagerMarks.filter((d) => d !== day),
          })
        }
        await onToggleHoliday(day)
      })
      return
    }
    const adding = !optimisticHolidays.includes(day)
    startTransition(async () => {
      toggleOptimisticHoliday(day)
      if (adding) {
        setOptimisticEntry({
          bulk: items.map((item) => ({ key: `${item.id}-${day}`, value: '' })),
        })
        setOptimisticInspectorMarks({
          day: 0,
          days: optimisticInspectorMarks.filter((d) => d !== day),
        })
        setOptimisticManagerMarks({
          day: 0,
          days: optimisticManagerMarks.filter((d) => d !== day),
        })
      }
      await onToggleHoliday(day)
    })
  }

  function commitStaffField(
    role: 'inspector' | 'manager',
    field: 'name' | 'desc' | 'cycle',
    value: string,
  ) {
    if (!canManage) return
    const keyMap = {
      inspector: { name: 'inspectorName', desc: 'inspectorDesc', cycle: 'inspectorCycle' },
      manager: { name: 'managerName', desc: 'managerDesc', cycle: 'managerCycle' },
    } as const
    updateEquipment(equipmentId, { [keyMap[role][field]]: value })
  }

  if (items.length === 0) {
    return (
      <div className="border border-border bg-card p-8 text-center text-sm text-muted-foreground">
        점검항목이 없습니다. 설비 관리 페이지에서 점검항목을 먼저 등록하세요.
      </div>
    )
  }

  return (
    <div className="print-sheet-wrapper flex flex-col gap-2">
      <div className="no-print flex flex-wrap items-center gap-2 border border-border bg-card p-2">
        <span className="px-1 text-xs font-medium text-muted-foreground">입력할 표시 선택:</span>
        {SYMBOLS.map((symbol) => (
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
              description={`선택한 표시(${selectedSymbol})를 빈 칸에만 채웁니다. 항목·점검자·관리자 주기에 맞춰 날짜를 넣고, 휴무일·주말은 건너뜁니다.`}
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
          <AlertDialog>
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
                <AlertDialogTitle>이번 달 점검 내용을 모두 지울까요?</AlertDialogTitle>
                <AlertDialogDescription>
                  {year}년 {month}월 일상점검 체크시트에 입력된 모든 표시와 점검자·관리자 서명이 삭제됩니다. 이 작업은 되돌릴 수 없습니다.
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
        위에서 표시를 선택한 뒤 칸을 클릭하면 바로 입력됩니다. 같은 표시를 다시 클릭하면 지워집니다. 아래 점검자·관리자 칸을 클릭하면 서명됩니다.
        {isCurrentMonth ? ' 오늘 채워야 하는데 비어 있는 칸은 노란색으로 표시됩니다.' : ''}
      </p>

      <div className="print-sheet overflow-x-auto border border-border">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr>
              <th
                rowSpan={2}
                className="print-category-cell w-16 whitespace-nowrap border-r border-b border-border bg-muted p-1 text-sm font-medium"
              >
                항목
              </th>
              <th
                rowSpan={2}
                className="print-content-cell min-w-56 border-r border-b border-border bg-muted p-1 text-left text-sm font-medium"
              >
                점검 부위
              </th>
              <th
                rowSpan={2}
                className="print-method-cell w-28 whitespace-nowrap border-r border-b border-border bg-muted p-1 text-sm font-medium"
              >
                점검방법
              </th>
              <th
                rowSpan={2}
                className="print-cycle-cell w-20 whitespace-nowrap border-r border-b border-border bg-muted p-1 text-sm font-medium"
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
                      'print-day-cell h-7 w-8 border-r border-b border-border p-0 text-xs font-medium last:border-r-0',
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
            {items.map((item) => (
              <CheckItemRow
                key={item.id}
                item={item}
                equipmentId={equipmentId}
                year={year}
                month={month}
                todayDay={todayDay}
                isCurrentMonth={isCurrentMonth}
                days={days}
                optimisticEntries={optimisticEntries}
                stampMap={stampMap}
                isDayOff={isDayOff}
                onCellClick={handleCellClick}
                canManage={canManage}
              />
            ))}
          </tbody>
          <tfoot>
            <SignatureRow
              label="점검자"
              info={inspectorInfo}
              onInfoChange={setInspectorInfo}
              onCommit={(field, value) => commitStaffField('inspector', field, value)}
              namePlaceholder="예: 우데스 과장"
              descPlaceholder="예: 1일 점검"
              cycleOptions={STAFF_CYCLES}
              defaultCycle="1회/일"
              year={year}
              month={month}
              todayDay={todayDay}
              isCurrentMonth={isCurrentMonth}
              days={days}
              marks={optimisticInspectorMarks}
              markChar={inspectorInitial}
              markRole="inspector"
              markLog={markLog}
              canManage={canManage}
              isDayOff={isDayOff}
              onToggleDay={(day) => handleMarkClick('inspector', day)}
            />
            <SignatureRow
              label="관리자"
              info={managerInfo}
              onInfoChange={setManagerInfo}
              onCommit={(field, value) => commitStaffField('manager', field, value)}
              namePlaceholder="예: 문명선 차장"
              descPlaceholder="예: 주간 점검 확인"
              cycleOptions={STAFF_CYCLES}
              defaultCycle="1회/주"
              year={year}
              month={month}
              todayDay={todayDay}
              isCurrentMonth={isCurrentMonth}
              days={days}
              marks={optimisticManagerMarks}
              markChar={managerInitial}
              markRole="manager"
              markLog={markLog}
              canManage={canManage}
              isDayOff={isDayOff}
              onToggleDay={(day) => handleMarkClick('manager', day)}
            />
          </tfoot>
        </table>
      </div>
    </div>
  )
}

function CheckItemRow({
  item,
  equipmentId,
  year,
  month,
  todayDay,
  isCurrentMonth,
  days,
  optimisticEntries,
  stampMap,
  isDayOff,
  onCellClick,
  canManage,
}: {
  item: DailyCheckItem
  equipmentId: number
  year: number
  month: number
  todayDay: number
  isCurrentMonth: boolean
  days: number[]
  optimisticEntries: Map<string, string>
  stampMap: Map<string, string>
  isDayOff: (day: number) => boolean
  onCellClick: (itemId: number, day: number) => void
  canManage: boolean
}) {
  const [content, setContent] = useState(item.content)
  const [method, setMethod] = useState(item.method || '육안')
  const [cycle, setCycle] = useState(item.cycle || '일')

  function commit(field: 'content' | 'method' | 'cycle', value: string) {
    if (!canManage) return
    updateDailyCheckItem(item.id, equipmentId, { [field]: value })
  }

  return (
    <tr>
      <td className="print-category-cell whitespace-nowrap border-r border-b border-border p-1 text-center">
        {item.itemNo}
      </td>
      <td className="print-content-cell border-r border-b border-border p-0">
        <Input
          value={content}
          readOnly={!canManage}
          onChange={(e) => setContent(e.target.value)}
          onBlur={(e) => commit('content', e.target.value)}
          className={`${footerInputClass} text-left`}
        />
      </td>
      <td className="print-method-cell whitespace-nowrap border-r border-b border-border p-0">
        <CellSelect
          aria-label={`${item.itemNo}번 점검방법`}
          value={method}
          disabled={!canManage}
          options={CHECK_METHODS}
          onChange={(value) => {
            setMethod(value)
            commit('method', value)
          }}
        />
      </td>
      <td className="print-cycle-cell whitespace-nowrap border-r border-b border-border p-0">
        <CellSelect
          aria-label={`${item.itemNo}번 주기`}
          value={cycle}
          disabled={!canManage}
          options={ITEM_CYCLES}
          onChange={(value) => {
            setCycle(value)
            commit('cycle', value)
          }}
        />
      </td>
      {days.map((day) => {
        const key = `${item.id}-${day}`
        const value = optimisticEntries.get(key) ?? ''
        const dayOff = isDayOff(day)
        const missing =
          isCurrentMonth && day === todayDay && !value && isDueOnDay(year, month, day, cycle, isDayOff)
        return (
          <td
            key={day}
            title={value ? stampMap.get(key) || undefined : undefined}
            onClick={() => onCellClick(item.id, day)}
            className={cn(
              'print-day-cell h-8 w-8 border-r border-b border-border p-0 text-center text-xs font-medium last:border-r-0',
              dayOff && 'weekend-cell bg-muted-foreground/10',
              canManage && 'cursor-pointer hover:bg-accent/30',
              missing && 'missing-today',
            )}
          >
            {value}
          </td>
        )
      })}
    </tr>
  )
}

function SignatureRow({
  label,
  info,
  onInfoChange,
  onCommit,
  namePlaceholder,
  descPlaceholder,
  cycleOptions,
  defaultCycle,
  year,
  month,
  todayDay,
  isCurrentMonth,
  days,
  marks,
  markChar,
  markRole,
  markLog,
  canManage,
  isDayOff,
  onToggleDay,
}: {
  label: string
  info: StaffInfo
  onInfoChange: (value: StaffInfo) => void
  onCommit: (field: 'name' | 'desc' | 'cycle', value: string) => void
  namePlaceholder: string
  descPlaceholder: string
  cycleOptions: readonly string[]
  defaultCycle: string
  year: number
  month: number
  todayDay: number
  isCurrentMonth: boolean
  days: number[]
  marks: number[]
  markChar: string
  markRole: 'inspector' | 'manager'
  markLog: { role: 'inspector' | 'manager'; day: number; name: string; at: string }[]
  canManage: boolean
  isDayOff: (day: number) => boolean
  onToggleDay: (day: number) => void
}) {
  return (
    <tr>
      <td className="print-category-cell whitespace-nowrap border-r border-b border-border bg-muted/40 p-1 text-center font-medium">
        {label}
      </td>
      <td className="print-content-cell border-r border-b border-border p-0">
        <Input
          value={info.name}
          readOnly={!canManage}
          onChange={(e) => onInfoChange({ ...info, name: e.target.value })}
          onBlur={(e) => {
            if (canManage) onCommit('name', e.target.value)
          }}
          placeholder={namePlaceholder}
          className={footerInputClass}
        />
      </td>
      <td className="print-method-cell border-r border-b border-border p-0">
        <Input
          value={info.desc}
          readOnly={!canManage}
          onChange={(e) => onInfoChange({ ...info, desc: e.target.value })}
          onBlur={(e) => {
            if (canManage) onCommit('desc', e.target.value)
          }}
          placeholder={descPlaceholder}
          className={footerInputClass}
        />
      </td>
      <td className="print-cycle-cell whitespace-nowrap border-r border-b border-border p-0">
        <CellSelect
          aria-label={`${label} 주기`}
          value={info.cycle || defaultCycle}
          disabled={!canManage}
          options={cycleOptions}
          onChange={(value) => {
            onInfoChange({ ...info, cycle: value })
            onCommit('cycle', value)
          }}
        />
      </td>
      {days.map((day) => {
        const dayOff = isDayOff(day)
        const marked = marks.includes(day)
        const log = markLog.find((row) => row.role === markRole && row.day === day)
        const shown = marked ? markChar : ''
        const missing =
          isCurrentMonth &&
          day === todayDay &&
          !marked &&
          isDueOnDay(year, month, day, info.cycle || defaultCycle, isDayOff)
        return (
          <td
            key={day}
            title={marked ? formatCheckStamp(info.name, log?.at) : undefined}
            onClick={() => onToggleDay(day)}
            className={cn(
              'print-day-cell h-8 w-8 border-r border-b border-border p-0 text-center text-xs font-medium last:border-r-0',
              dayOff && 'weekend-cell bg-muted-foreground/10',
              canManage && 'cursor-pointer hover:bg-accent/30',
              missing && 'missing-today',
            )}
          >
            {shown}
          </td>
        )
      })}
    </tr>
  )
}