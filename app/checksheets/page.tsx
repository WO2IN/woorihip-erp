import { getEquipmentList } from '@/app/actions/equipment'
import { getFiveSTargets } from '@/app/actions/five-s'
import { getTempHumidityTargets } from '@/app/actions/temp-humidity'
import { getTodayCheckStatuses } from '@/app/actions/today-status'
import { SiteHeader } from '@/components/layout/site-header'
import { FloorHome } from '@/components/checksheets/floor-home'
import { FLOOR_OPTIONS, detectFloor } from '@/lib/floor'
import { currentActor } from '@/lib/check-access'
import { currentYearMonth } from '@/lib/date-utils'
import { recordFloor, recordLineId, type ProcessCheckRecord, type ProcessTemplate } from '@/lib/process-checklist'
import { readHiddenProcessLines, readProcessChecks, readProcessTemplates } from '@/lib/storage'
import { todayStatusLabel, type TodayStatus } from '@/lib/today-check'

export default async function HomePage({ searchParams }: { searchParams: Promise<{ floor?: string }> }) {
  const { floor: rawFloor } = await searchParams
  const actor = await currentActor()
  const home = actor?.floor && actor.role !== 'admin' ? String(actor.floor) : null
  const requestedFloor =
    rawFloor === '미지정' || FLOOR_OPTIONS.some((option) => option.value === rawFloor)
      ? rawFloor
      : null
  const selectedFloor = requestedFloor ?? home ?? FLOOR_OPTIONS[0].value
  const { year, month } = currentYearMonth()
  const todayDate = `${year}-${String(month).padStart(2, '0')}-${String(new Date().getDate()).padStart(2, '0')}`
  const [list, fiveSTargets, tempHumidityTargets, today, processTemplates, processChecks, hiddenLines] = await Promise.all([
    getEquipmentList(),
    getFiveSTargets(),
    getTempHumidityTargets(),
    getTodayCheckStatuses(),
    readProcessTemplates(),
    readProcessChecks(),
    readHiddenProcessLines(),
  ])
  const hidden = new Set(hiddenLines)
  const processLines = processTemplates.filter((template) => !hidden.has(template.id))
  const processStatusOf = (template: ProcessTemplate): TodayStatus => {
    const recorded = processChecks.some(
      (record: ProcessCheckRecord) =>
        record.writtenDate === todayDate &&
        recordLineId(record) === template.id &&
        recordFloor(record) === template.floor,
    )
    if (recorded) return 'done'
    return today.weekend ? 'off' : 'missing'
  }
  const statusOf = (status: TodayStatus | undefined) => {
    const value = status ?? 'off'
    return { status: value, statusLabel: todayStatusLabel(value, today.weekend) }
  }

  const matchesFloor = (item: { floor?: string | null; name: string }, floor: string) =>
    detectFloor(item.floor, item.name) === floor

  const hasUnassigned =
    selectedFloor === '미지정' ||
    [...list, ...fiveSTargets, ...tempHumidityTargets].some((item) => detectFloor(item.floor, item.name) === '미지정')
  const floorChoices = [
    ...FLOOR_OPTIONS.map((option) => ({ floor: option.value, label: option.label })),
    ...(hasUnassigned ? [{ floor: '미지정', label: '층 미지정' }] : []),
  ]

  const visibleChoices = floorChoices

  const floorStats = visibleChoices.map((option) => {
    const fiveSItems = fiveSTargets.filter((item) => matchesFloor(item, option.floor))
    const dailyItems = list.filter((item) => matchesFloor(item, option.floor))
    const tempItems = tempHumidityTargets.filter((item) => matchesFloor(item, option.floor))
    const processItems = processLines.filter((item) => String(item.floor) === option.floor)
    const missing =
      fiveSItems.filter((item) => today.fiveS[item.id] === 'missing').length +
      dailyItems.filter((item) => today.daily[item.id] === 'missing').length +
      tempItems.filter((item) => today.temp[item.id] === 'missing').length +
      processItems.filter((item) => processStatusOf(item) === 'missing').length
    return {
      floor: option.floor,
      label: option.label,
      fiveS: fiveSItems.length,
      daily: dailyItems.length,
      tempHumidity: tempItems.length,
      process: processItems.length,
      total: fiveSItems.length + dailyItems.length + tempItems.length + processItems.length,
      missing,
    }
  })

  const filteredList = selectedFloor ? list.filter((item) => matchesFloor(item, selectedFloor)) : []
  const filteredFiveSTargets = selectedFloor
    ? fiveSTargets.filter((item) => matchesFloor(item, selectedFloor))
    : []
  const filteredTempHumidityTargets = selectedFloor
    ? tempHumidityTargets.filter((item) => matchesFloor(item, selectedFloor))
    : []
  const filteredProcessLines = selectedFloor
    ? processLines.filter((item) => String(item.floor) === selectedFloor)
    : []

  const summaryCards = [
    {
      href: `/checksheets/5s?floor=${encodeURIComponent(selectedFloor ?? '')}`,
      title: '3정 5S',
      description: '정리·정돈·청소·표준화 점검',
      count: filteredFiveSTargets.length,
      icon: 'clipboard' as const,
      tone: 'sky' as const,
      items: filteredFiveSTargets.map((target) => ({
        id: target.id,
        name: target.name,
        meta: `${target.department || ''}`.trim() || undefined,
        inspector: target.manager || undefined,
        href: `/checksheets/5s/${target.id}`,
        ...statusOf(today.fiveS[target.id]),
      })),
    },
    {
      href: `/checksheets/daily?floor=${encodeURIComponent(selectedFloor ?? '')}`,
      title: '설비 일상점검',
      description: '설비별 일상 점검 항목과 기록',
      count: filteredList.length,
      icon: 'wrench' as const,
      tone: 'amber' as const,
      items: filteredList.map((equipment) => ({
        id: equipment.id,
        name: equipment.name,
        meta: equipment.department || undefined,
        inspector: equipment.inspectorName || undefined,
        href: `/checksheets/daily/${equipment.id}`,
        ...statusOf(today.daily[equipment.id]),
      })),
    },
    {
      href: `/checksheets/temp-humidity?floor=${encodeURIComponent(selectedFloor ?? '')}`,
      title: '온/습도',
      description: '온도·습도 측정 기록과 추이',
      count: filteredTempHumidityTargets.length,
      icon: 'thermometer' as const,
      tone: 'violet' as const,
      items: filteredTempHumidityTargets.map((target) => ({
        id: target.id,
        name: target.name,
        meta: target.department || undefined,
        inspector: target.manager || undefined,
        href: `/checksheets/temp-humidity/${target.id}`,
        ...statusOf(today.temp[target.id]),
      })),
    },
    {
      href: `/process-check?floor=${encodeURIComponent(selectedFloor ?? '')}`,
      title: '공정 점검',
      description: '라인별 공정 조건 점검 기록',
      count: filteredProcessLines.length,
      icon: 'factory' as const,
      tone: 'emerald' as const,
      items: filteredProcessLines.map((template) => ({
        id: template.id,
        name: template.name,
        href: `/process-check?floor=${template.floor}&line=${encodeURIComponent(template.id)}`,
        ...statusOf(processStatusOf(template)),
      })),
    },
  ]

  return (
    <div className="min-h-dvh bg-background">
      <SiteHeader />
      <FloorHome
        selectedFloor={selectedFloor}
        floorStats={floorStats}
        cards={summaryCards}
        year={year}
        month={month}
        todayLabel={`${today.month}월 ${today.day}일`}
      />
    </div>
  )
}
