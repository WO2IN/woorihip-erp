import Link from 'next/link'
import { ArrowRightIcon, CheckCircle2Icon } from 'lucide-react'
import { getEquipmentList } from '@/app/actions/equipment'
import { getFiveSTargets } from '@/app/actions/five-s'
import { getTempHumidityTargets } from '@/app/actions/temp-humidity'
import { getTodayCheckStatuses } from '@/app/actions/today-status'
import { detectFloor, formatFloorLabel } from '@/lib/floor'

type Kind = 'daily' | 'fiveS' | 'temp'

const KIND_LABEL: Record<Kind, string> = { daily: '일상점검', fiveS: '3정 5S', temp: '온·습도' }
const KIND_PATH: Record<Kind, string> = { daily: 'daily', fiveS: '5s', temp: 'temp-humidity' }

/** 같은 층에서 오늘 아직 안 채운 다음 점검표로 가는 버튼 */
export async function NextCheckLink({ kind, id, floor, name }: { kind: Kind; id: number; floor?: string | null; name: string }) {
  const floorKey = detectFloor(floor, name)
  const [equipment, fiveS, temp, today] = await Promise.all([
    getEquipmentList(),
    getFiveSTargets(),
    getTempHumidityTargets(),
    getTodayCheckStatuses(),
  ])

  const queue = [
    ...equipment.map((item) => ({ kind: 'daily' as const, id: item.id, name: item.name, floor: item.floor, status: today.daily[item.id] })),
    ...temp.map((item) => ({ kind: 'temp' as const, id: item.id, name: item.name, floor: item.floor, status: today.temp[item.id] })),
    ...fiveS.map((item) => ({ kind: 'fiveS' as const, id: item.id, name: item.name, floor: item.floor, status: today.fiveS[item.id] })),
  ].filter((item) => detectFloor(item.floor, item.name) === floorKey && item.status === 'missing')

  const start = queue.findIndex((item) => item.kind === kind && item.id === id)
  const ordered = start >= 0 ? [...queue.slice(start + 1), ...queue.slice(0, start)] : queue
  const next = ordered[0]
  const remaining = queue.filter((item) => !(item.kind === kind && item.id === id)).length

  if (!next) {
    return (
      <Link
        href={`/checksheets?floor=${encodeURIComponent(floorKey)}`}
        className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 text-sm font-semibold text-emerald-700 hover:bg-emerald-100 dark:border-emerald-500/30 dark:bg-emerald-500/15 dark:text-emerald-300"
      >
        <CheckCircle2Icon className="size-4" />
        {formatFloorLabel(floorKey)} 남은 점검 없음
      </Link>
    )
  }

  return (
    <Link
      href={`/checksheets/${KIND_PATH[next.kind]}/${next.id}`}
      title={`${formatFloorLabel(floorKey)} 남은 미점검 ${remaining}건`}
      className="inline-flex h-9 max-w-[22rem] items-center gap-2 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary/90"
    >
      <span className="shrink-0 rounded bg-white/20 px-1.5 py-0.5 text-[11px]">남은 {remaining}건</span>
      <span className="truncate">다음: {KIND_LABEL[next.kind]} · {next.name}</span>
      <ArrowRightIcon className="size-4 shrink-0" />
    </Link>
  )
}
