'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { ShieldAlert } from 'lucide-react'
import { CustomerNcView } from '@/components/quality/customer-nc-view'
import { ProcessNcView } from '@/components/quality/process-nc-view'
import { PAGE_SHELL, PageHeader } from '@/components/shared/page-header'
import { SectionTabs } from '@/components/shared/section-tabs'

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
      <SectionTabs items={TABS} value={tab} onChange={setTab} label="부적합 구분" />
      {tab === 'customer' ? <CustomerNcView embedded /> : <ProcessNcView embedded />}
    </main>
  )
}
