'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { MissingCheck } from '@/lib/dashboard-stats'
import { cn } from '@/lib/utils'

const FLOORS = ['1', '2', '3'] as const
const TONE: Record<MissingCheck['kind'], string> = {
  설비: 'bg-blue-50 text-blue-700 ring-blue-200 dark:bg-blue-500/15 dark:text-blue-300 dark:ring-blue-500/30',
  '5S': 'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-500/30',
  온습도: 'bg-sky-50 text-sky-700 ring-sky-200 dark:bg-sky-500/15 dark:text-sky-300 dark:ring-sky-500/30',
  공정: 'bg-orange-50 text-orange-700 ring-orange-200 dark:bg-orange-500/15 dark:text-orange-300 dark:ring-orange-500/30',
}

export function MissingChecks({ items, weekend, homeFloor }: { items: MissingCheck[]; weekend: boolean; homeFloor?: string | null }) {
  const start = homeFloor && FLOORS.includes(homeFloor as typeof FLOORS[number]) ? homeFloor : 'all'
  const [floor, setFloor] = useState(start)
  const visible = floor === 'all' ? items : items.filter((item) => item.floor === floor)
  const shown = visible.slice(0, floor === 'all' ? 6 : 8)

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-1.5">
        <FloorButton active={floor === 'all'} label="전체" count={items.length} onClick={() => setFloor('all')} />
        {FLOORS.map((value) => (
          <FloorButton
            key={value}
            active={floor === value}
            label={`${value}층`}
            count={items.filter((item) => item.floor === value).length}
            onClick={() => setFloor(value)}
          />
        ))}
      </div>
      {weekend ? (
        <p className="py-8 text-center text-sm text-muted-foreground">오늘은 휴무일입니다.</p>
      ) : visible.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          {floor === 'all' ? '오늘 점검을 모두 마쳤습니다.' : `${floor}층은 오늘 점검을 모두 마쳤습니다.`}
        </p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[420px] text-[13px]">
              <thead>
                <tr className="bg-slate-50 text-xs text-muted-foreground dark:bg-white/5">
                  {['구분', '점검 대상', ...(floor === 'all' ? ['층'] : []), ''].map((head, index) => (
                    <th key={`${head}-${index}`} className="px-3 py-2 text-left font-medium first:rounded-l-lg last:rounded-r-lg">{head}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {shown.map((item) => (
                  <tr key={`${item.kind}-${item.floor}-${item.name}`} className="border-b last:border-0">
                    <td className="px-3 py-2.5">
                      <span className={cn('inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1', TONE[item.kind])}>{item.kind}</span>
                    </td>
                    <td className="max-w-[14rem] truncate px-3 py-2.5 font-medium">{item.name}</td>
                    {floor === 'all' && <td className="whitespace-nowrap px-3 py-2.5 text-muted-foreground">{item.floor ? `${item.floor}층` : '-'}</td>}
                    <td className="px-3 py-2.5 text-right">
                      <Link href={item.href} className="text-xs font-semibold text-blue-600 hover:underline">점검하기</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {visible.length > shown.length && (
            <p className="mt-2 text-right text-xs text-muted-foreground">
              외 {visible.length - shown.length}건 ·{' '}
              <Link href={floor === 'all' ? '/checksheets' : `/checksheets?floor=${floor}`} className="font-semibold text-blue-600 hover:underline">점검실에서 보기</Link>
            </p>
          )}
        </>
      )}
    </div>
  )
}

function FloorButton({ active, label, count, onClick }: { active: boolean; label: string; count: number; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold',
        active ? 'bg-blue-600 text-white' : 'border bg-card text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-white/5',
      )}
    >
      {label}
      <span className={cn('tabular-nums', active ? 'text-white/80' : 'text-muted-foreground')}>{count}</span>
    </button>
  )
}
