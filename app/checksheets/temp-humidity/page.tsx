import { WrenchIcon, ThermometerIcon } from 'lucide-react'
import { getTempHumidityTargets, createTempHumidityTarget, deleteTempHumidityTarget } from '@/app/actions/temp-humidity'
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

export default async function TempHumidityIndexPage({ searchParams }: { searchParams: Promise<{ floor?: string }> }) {
  const { floor: requestedFloor } = await searchParams
  const actor = await currentActor()
  const selectedFloor = requestedFloor || null
  const canManage = canManageChecksheets(actor)
  const lockedFloor = actor?.floor && actor.role !== 'admin' ? String(actor.floor) : undefined
  const [allTargets, today] = await Promise.all([getTempHumidityTargets(), getTodayCheckStatuses()])
  const targetList = selectedFloor ? allTargets.filter((item) => detectFloor(item.floor, item.name) === selectedFloor) : allTargets

  return (
    <div className="min-h-dvh bg-background">
      <SiteHeader />
      <main className="flex w-full flex-col gap-4 px-6 py-6">
        <PageHeader
          tone="violet"
          icon={ThermometerIcon}
          eyebrow="DAILY CHECK · 일일 점검"
          title="온/습도 체크시트"
          description="점검할 항목을 선택하세요."
          stat={{ label: selectedFloor ? formatFloorLabel(selectedFloor) : '전체', value: targetList.length, unit: '개' }}
          actions={canManage && (
            <TargetCreateDialog
              title="온습도 측정 대상 추가"
              triggerText="온습도 추가"
              createAction={createTempHumidityTarget}
              redirectPathPrefix="/checksheets/temp-humidity"
              lockedFloor={lockedFloor}
              triggerClassName={BAND_BUTTON_PRIMARY}
            />
          )}
        />

        {targetList.length === 0 ? (
          <Empty className="border border-dashed border-border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <WrenchIcon />
              </EmptyMedia>
              <EmptyTitle>등록된 항목이 없습니다</EmptyTitle>
              <EmptyDescription>먼저 새로운 항목을 등록하세요.</EmptyDescription>
            </EmptyHeader>
            {canManage && (
              <EmptyContent>
                <TargetCreateDialog 
                  title="온습도 측정 대상 추가"
                  triggerText="온습도 추가"
                  createAction={createTempHumidityTarget}
                  redirectPathPrefix="/checksheets/temp-humidity"
              lockedFloor={lockedFloor}
                />
              </EmptyContent>
            )}
          </Empty>
        ) : (
          <div className="space-y-5">
            {groupByFloor(targetList).filter(([floor]) => !selectedFloor || floor === selectedFloor).map(([floor, items]) => (
              <TargetFloorSection key={floor} id={`temp-floor-${floor}`} floor={floor} statuses={items.map((item) => today.temp[item.id] ?? 'off')}>
                  {[...items]
                    .sort((a, b) => compareTodayStatus(today.temp[a.id] ?? 'off', today.temp[b.id] ?? 'off'))
                    .map((item) => {
                      const status = today.temp[item.id] ?? 'off'
                      return (
                        <TargetListRow
                          key={item.id}
                          href={`/checksheets/temp-humidity/${item.id}`}
                          name={item.name}
                          floor={item.floor || ''}
                          department={item.department}
                          manager={item.manager}
                          inspectorName={item.manager}
                          deleteTitle="이 항목을 삭제할까요?"
                          deleteDescription={`${item.name} 항목과 입력된 온/습도 점검 내용이 함께 삭제됩니다. 이 작업은 되돌릴 수 없습니다.`}
                          deleteAction={deleteTempHumidityTarget}
                          id={item.id}
                          status={status}
                          statusLabel={todayStatusLabel(status, today.weekend)}
                          canDelete={canManage && canUseFloor(actor, item.floor, item.name)}
                          kind="temp"
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
