'use client'

import { ShieldAlert } from 'lucide-react'
import { CustomerNcView } from '@/components/quality/customer-nc-view'
import { ProcessNcView } from '@/components/quality/process-nc-view'
import { PageHeader } from '@/components/shared/page-header'

export function NonconformityView() {
  return (
    <main className="mx-auto flex w-full max-w-[1400px] flex-col gap-6 p-6">
      <PageHeader
        tone="green"
        icon={ShieldAlert}
        eyebrow="QUALITY · 품질관리"
        title="부적합관리"
        description="어느 업체·품목에서 어떤 부적합이 있었고, 어떻게 처리했는지 기록합니다."
      />
      <p className="-mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-full bg-blue-600" />완료</span>
        <span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-full bg-amber-400" />진행중</span>
        <span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-full bg-red-500" />미진행</span>
        <span>· 단계 칩을 누르면 완료 → 진행중 → 미진행 순으로 바뀌고, 조치 칩을 누르면 선택/해제됩니다.</span>
      </p>
      <CustomerNcView embedded />
      <ProcessNcView embedded />
    </main>
  )
}
