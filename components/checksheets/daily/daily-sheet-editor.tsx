'use client'

import { SettingsIcon } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { PhotoSlot, type EquipmentPhoto } from '@/components/equipment/photo-slot'
import { CheckItemManager, type CheckItem } from '@/components/equipment/check-item-manager'

const OVERVIEW_LABEL = '전체 전경'
const PART_LABELS = ['1', '2', '3', '4', '5', '6', '7', '8', '9']

export function DailySheetEditor({
  equipmentId,
  equipmentName,
  photos,
  items,
}: {
  equipmentId: number
  equipmentName: string
  photos: EquipmentPhoto[]
  items: CheckItem[]
}) {
  const photoFor = (label: string) => photos.find((photo) => photo.label === label)

  return (
    <Dialog>
      <DialogTrigger className={buttonVariants({ variant: 'outline', className: 'h-10 gap-1.5 px-4' })}>
        <SettingsIcon className="size-4" aria-hidden="true" />
        편집
      </DialogTrigger>
      <DialogContent
        overlayClassName="z-[80]"
        className="z-[80] max-h-[90dvh] w-[calc(100%-2rem)] overflow-y-auto p-5 sm:max-w-4xl"
      >
        <DialogHeader>
          <DialogTitle className="text-lg">{equipmentName} 편집</DialogTitle>
          <DialogDescription>변경 사항은 바로 저장되어 체크시트에 반영됩니다.</DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="items" className="w-full min-w-0">
          <TabsList className="grid h-11 w-full grid-cols-2">
            <TabsTrigger value="items" className="text-sm">
              점검 항목 ({items.length})
            </TabsTrigger>
            <TabsTrigger value="photos" className="text-sm">
              설비 사진 ({photos.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="items" className="pt-3">
            <CheckItemManager equipmentId={equipmentId} items={items} />
          </TabsContent>

          <TabsContent value="photos" className="flex flex-col gap-5 pt-3">
            <div className="max-w-md">
              <PhotoSlot equipmentId={equipmentId} label={OVERVIEW_LABEL} photo={photoFor(OVERVIEW_LABEL)} size="large" />
            </div>
            <div>
              <p className="mb-2 text-sm font-medium text-muted-foreground">부위별 사진</p>
              <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">
                {PART_LABELS.map((label) => (
                  <PhotoSlot key={label} equipmentId={equipmentId} label={label} photo={photoFor(label)} />
                ))}
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
