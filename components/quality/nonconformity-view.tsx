'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { ShieldAlert } from 'lucide-react'
import { CustomerNcView } from '@/components/quality/customer-nc-view'
import { ProcessNcView } from '@/components/quality/process-nc-view'
import { PAGE_SHELL, PageHeader } from '@/components/shared/page-header'
import { cn } from '@/lib/utils'

const TABS = [
  { key: 'customer', label: '고객부적합' },
  { key: 'process', label: '공정부적합' },
] as const

type TabKey = (typeof TABS)[number]['key']

function isTabKey(value: string | null): value is TabKey {
  return value === 'customer' || value === 'process'
}

export function NonconformityView() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const tabParam = searchParams.get('tab')
  const [tab, setTabState] = useState<TabKey>(isTabKey(tabParam) ? tabParam : 'customer')

  useEffect(() => {
    if (isTabKey(tabParam)) setTabState(tabParam)
  }, [tabParam])

  const setTab = (key: TabKey) => {
    setTabState(key)
    router.replace(`/quality/nonconformity?tab=${key}`, { scroll: false })
  }

  return (
    <main className={PAGE_SHELL}>
      <PageHeader
        tone="green"
        icon={ShieldAlert}
        eyebrow="QUALITY · 품질관리"
        title="부적합관리"
        description="어느 업체·품목에서 어떤 부적합이 있었고, 어떻게 처리했는지 기록합니다."
      />
      <nav className="-mx-1 flex gap-1 overflow-x-auto border-b pb-px" aria-label="부적합 구분">
        {TABS.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={cn(
              'shrink-0 border-b-2 px-3 py-2.5 text-sm font-semibold transition-colors',
              tab === key
                ? 'border-emerald-600 text-emerald-700 dark:border-emerald-400 dark:text-emerald-300'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {label}
          </button>
        ))}
      </nav>
      {tab === 'customer' ? <CustomerNcView embedded /> : <ProcessNcView embedded />}
    </main>
  )
}
