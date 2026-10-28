import { WrenchIcon } from 'lucide-react'
import { getEquipmentList, deleteEquipment, createEquipment } from '@/app/actions/equipment'
import { SiteHeader } from '@/components/layout/site-header'
import { BAND_BUTTON_PRIMARY, PageHeader } from '@/components/shared/page-header'
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription, EmptyContent } from '@/components/ui/empty'
import { TargetCreateDialog } from '@/components/shared/target-create-dialog'
import { TargetListRow } from '@/components/shared/target-list-row'
import { TargetFloorSection } from '@/components/shared/target-floor-section'
import { formatFloorLabel, groupByFloor, detectFloor } from '@/lib/floor'
import { getTodayCheckStatuses } from '@/app/actions/today-status'
import { compareTodayStatus, todayStatusLabel } from '@/lib/today-check'
import { canManageChecksheets, canUseFloor, currentActor } from '@/lib/check-access'

export default async function DailyCheckIndexPage({ searchParams }: { searchParams: Promise<{ floor?: string }> }) {
  const { floor: requestedFloor } = await searchParams
  const actor = await currentActor()
  const selectedFloor = requestedFloor || null
  const canManage = canManageChecksheets(actor)
  const lockedFloor = actor?.floor && actor.role !== 'admin' ? String(actor.floor) : undefined
  const [allEquipment, today] = await Promise.all([getEquipmentList(), getTodayCheckStatuses()])
  const equipmentList = selectedFloor
    ? allEquipment.filter((item) => detectFloor(item.floor, item.name) === selectedFloor)
    : allEquipment

  return (
    <div className="min-h-dvh bg-background">
      <SiteHeader />
      <main className="flex w-full flex-col gap-4 px-6 py-6">
        <PageHeader
          tone="violet"
          icon={WrenchIcon}
          eyebrow="DAILY CHECK · 일일 점검"
          title="설비 일상점검 체크시트"
          description="점검할 설비를 선택하세요."
          stat={{ label: selectedFloor ? formatFloorLabel(selectedFloor) : '전체', value: equipmentList.length, unit: '대' }}
          actions={canManage && (
            <TargetCreateDialog
              title="설비 추가"
              triggerText="설비 추가"
              createAction={createEquipment}
              redirectPathPrefix="/checksheets/daily"
              lockedFloor={lockedFloor}
              triggerClassName={BAND_BUTTON_PRIMARY}
            />
          )}
        />

        {equipmentList.length === 0 ? (
          <Empty className="border border-dashed border-border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <WrenchIcon />
              </EmptyMedia>
              <EmptyTitle>등록된 설비가 없습니다</EmptyTitle>
              <EmptyDescription>먼저 새로운 설비를 등록하세요.</EmptyDescription>
            </EmptyHeader>
            {canManage && (
              <EmptyContent>
                <TargetCreateDialog
                  title="설비 추가"
                  triggerText="설비 추가하기"
                  createAction={createEquipment}
                  redirectPathPrefix="/checksheets/daily"
              lockedFloor={lockedFloor}
                />
              </EmptyContent>
            )}
          </Empty>
        ) : (
          <div className="space-y-5">
            {groupByFloor(equipmentList)
              .filter(([floor]) => !selectedFloor || floor === selectedFloor)
              .map(([floor, items]) => (
                <TargetFloorSection key={floor} id={`daily-floor-${floor}`} floor={floor} statuses={items.map((item) => today.daily[item.id] ?? 'off')}>
                    {[...items]
                      .sort((a, b) => compareTodayStatus(today.daily[a.id] ?? 'off', today.daily[b.id] ?? 'off'))
                      .map((item) => {
                        const status = today.daily[item.id] ?? 'off'
                        return (
                          <TargetListRow
                            key={item.id}
                            href={`/checksheets/daily/${item.id}`}
                            name={item.name}
                            floor={item.floor || ''}
                            department={item.department}
                            manager={item.manager}
                            inspectorName={item.inspectorName}
                            deleteTitle="이 설비를 삭제할까요?"
                            deleteDescription={`${item.name} 설비와 연관된 사진, 점검항목, 일상점검 내용이 함께 삭제됩니다. 이 작업은 되돌릴 수 없습니다.`}
                            deleteAction={deleteEquipment}
                            id={item.id}
                            status={status}
                            statusLabel={todayStatusLabel(status, today.weekend)}
                            canDelete={canManage && canUseFloor(actor, item.floor, item.name)}
                            kind="daily"
                          />
                        )
                      })}
                </TargetFloorSection>
              ))}
          </div>
        )}
      </main>
    </div>
  )
}
