'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useAuth } from '@/components/auth/auth-context'
import { homeFloor } from '@/lib/access'
import { getAuthHeaders } from '@/lib/auth-client'
import { type Floor3WorkLog } from '@/lib/floor3-work-log'
import { applyFloor3WorkLogs, buildLotFlow, buildStockGroups, collectMovements } from '@/lib/stock'
import { type DocumentMetadata } from '@/lib/types'
import { cn } from '@/lib/utils'

/** 재고 관리 화면(/shipment)의 탭 줄과 같은 모양·숫자. 서류 화면(수입검사·이력카드·출하성적서)에서 재고 관리 탭으로 돌아갈 때 쓴다. */
const TABS = [
  ['flow', '진행현황'],
  ['stock', '재고현황'],
  ['in', '입고내역'],
  ['out', '출고내역'],
  ['work', '작업일보'],
] as const
type TabKey = (typeof TABS)[number][0]

const ACTIVE =
  'bg-slate-800 text-white shadow-sm hover:bg-slate-700 hover:text-white dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white dark:hover:text-slate-900'

/**
 * 탭 숫자: 재고 관리 화면에서 필터를 걸지 않았을 때와 같은 계산.
 * (담당 층이 정해진 계정은 그 층만 센다 — 재고 관리 화면도 처음에 그 층으로 걸러져 열린다.)
 */
function useTabCounts(): Partial<Record<TabKey, number>> {
  const { user } = useAuth()
  const floor = homeFloor(user)
  const [counts, setCounts] = useState<Partial<Record<TabKey, number>>>({})

  useEffect(() => {
    let stop = false
    const headers = getAuthHeaders()
    const get = async <T,>(path: string): Promise<T[]> => {
      const response = await fetch(path, { cache: 'no-store', headers })
      const body = response.ok ? await response.json().catch(() => null) : null
      return Array.isArray(body?.data) ? body.data : []
    }
    Promise.all([get<DocumentMetadata>('/api/documents'), get<Parameters<typeof collectMovements>[1][number]>('/api/inventory'), get<Floor3WorkLog>('/api/floor3-work-logs')])
      .then(([documents, inventory, workLogs]) => {
        if (stop) return
        const onFloor = (value: unknown) => floor == null || String(value) === String(floor)
        const movements = collectMovements(documents, inventory).filter((item) => onFloor(item.floor))
        const returned = collectMovements([], inventory, { includeReturned: true }).filter((item) => item.returned && onFloor(item.floor))
        const logs = workLogs.filter((item) => onFloor(item.floor ?? 3))
        const flow = buildLotFlow(movements)
        setCounts({
          flow: flow.lots.filter((lot) => lot.stage !== 'done').length,
          stock: applyFloor3WorkLogs(buildStockGroups(movements, '', ''), logs, '', '').length,
          in: movements.filter((item) => item.kind === '입고').length + returned.length,
          out: movements.filter((item) => item.kind === '출고').length,
          work: logs.length,
        })
      })
      .catch(() => undefined)
    return () => { stop = true }
  }, [floor])

  return counts
}

/** 서류 화면은 진행현황의 한 단계라 진행현황을 선택된 탭으로 보여 준다. */
export function ShipmentTabNav({ active = 'flow' }: { active?: TabKey }) {
  const counts = useTabCounts()
  return (
    <section className="no-print rounded-2xl border bg-card p-3 shadow-sm">
      <nav className="flex min-w-0 gap-1 overflow-x-auto rounded-xl bg-muted/40 p-1" aria-label="재고 관리 메뉴">
        {TABS.map(([key, label]) => (
          <Link
            key={key}
            href={`/shipment?tab=${key}`}
            className={cn(
              'shrink-0 rounded-lg px-3.5 py-2 text-sm font-semibold transition-colors',
              active === key ? ACTIVE : 'text-muted-foreground hover:bg-card hover:text-foreground',
            )}
          >
            {label}
            <span className={cn('ml-1.5 tabular-nums text-xs', active === key ? 'opacity-80' : 'text-muted-foreground')}>{counts[key] ?? ''}</span>
          </Link>
        ))}
      </nav>
    </section>
  )
}
