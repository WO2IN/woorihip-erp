'use client'

import { useState } from 'react'
import { ArrowLeft, FilePlus2 } from 'lucide-react'
import { ChangeRequestView } from '@/components/development/change-request-view'
import { ChangePointMain } from '@/components/quality/change-point-main'
import { PAGE_SHELL, PageHeader } from '@/components/shared/page-header'
import { Button } from '@/components/ui/button'

export function ChangePointsShell() {
  const [writing, setWriting] = useState(false)
  const [writeKey, setWriteKey] = useState(0)
  const [openId, setOpenId] = useState<string | null>(null)

  const openWrite = (id?: string) => {
    setOpenId(id ?? null)
    setWriteKey((value) => value + 1)
    setWriting(true)
  }

  return (
    <main className={PAGE_SHELL}>
      <PageHeader
        tone="green"
        icon={FilePlus2}
        eyebrow="QUALITY · 품질관리"
        title="변경점관리 (4M)"
        description={writing ? '변경요청서를 작성합니다. 저장과 엑셀 출력은 이 화면에서 합니다.' : '변경 이력을 보고, 행을 누르면 그 건의 요약을 봅니다.'}
        actions={
          writing ? (
            <Button type="button" variant="outline" className="border-white/40 bg-white/10 text-white hover:bg-white/20 hover:text-white" onClick={() => setWriting(false)}>
              <ArrowLeft className="size-4" />
              대장
            </Button>
          ) : null
        }
      />
      {writing ? (
        <ChangeRequestView key={`${writeKey}-${openId ?? 'new'}`} embedded openId={openId} onBack={() => setWriting(false)} />
      ) : (
        <ChangePointMain onRegister={() => openWrite()} onEdit={(id) => openWrite(id)} />
      )}
    </main>
  )
}
