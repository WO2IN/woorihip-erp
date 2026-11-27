'use client'

import { useState } from 'react'
import { ClipboardList } from 'lucide-react'
import { GROUP_TONE, PAGE_SHELL, PageHeader } from '@/components/shared/page-header'
import { SectionTabs } from '@/components/shared/section-tabs'

const TABS = [
  { key: 'plan', label: '내부심사 계획서' },
  { key: 'checklist', label: '심사 평가(체크)시트' },
  { key: 'corrective', label: '시정조치(부적합)서' },
  { key: 'report', label: '심사결과보고서' },
] as const

type TabKey = (typeof TABS)[number]['key']

export function InternalAuditView() {
  const [tab, setTab] = useState<TabKey>(TABS[0].key)
  const active = TABS.find((item) => item.key === tab) ?? TABS[0]

  return (
    <div className={PAGE_SHELL}>
      <PageHeader
        tone={GROUP_TONE.품질관리}
        icon={ClipboardList}
        eyebrow="품질관리"
        title="내부심사"
        description="시스템 · 공정 · 제품 내부심사 계획과 결과를 관리"
      />

      <SectionTabs items={TABS} value={tab} onChange={setTab} label="내부심사 문서" />

      <section role="tabpanel" className="rounded-2xl border border-dashed bg-card p-8 text-center">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-100 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400">
          <ClipboardList className="h-7 w-7" />
        </span>
        <span className="mt-4 inline-flex rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
          개발 중
        </span>
        <p className="mt-3 text-base font-semibold">{active.label}</p>
        <p className="mt-1 text-sm text-muted-foreground">양식이 전달되면 이 탭에 적용할 예정입니다.</p>
      </section>
    </div>
  )
}
