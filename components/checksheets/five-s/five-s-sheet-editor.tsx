'use client'

import { SettingsIcon } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { FiveSItemManager } from '@/components/checksheets/five-s/five-s-item-manager'
import type { FiveSCheckItem } from '@/components/checksheets/five-s/five-s-grid'

export function FiveSSheetEditor({
  targetId,
  targetName,
  items,
}: {
  targetId: number
  targetName: string
  items: FiveSCheckItem[]
}) {
  return (
    <Dialog>
      <DialogTrigger className={buttonVariants({ variant: 'outline', className: 'h-10 gap-1.5 px-4' })}>
        <SettingsIcon className="size-4" aria-hidden="true" />
        항목 편집
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto p-5 sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="text-lg">{targetName} 점검 항목 편집</DialogTitle>
          <DialogDescription>
            변경 사항은 바로 저장됩니다. 항목을 삭제하면 그 항목에 입력된 점검 기록도 함께 삭제됩니다.
          </DialogDescription>
        </DialogHeader>
        <FiveSItemManager targetId={targetId} items={items} />
      </DialogContent>
    </Dialog>
  )
}
