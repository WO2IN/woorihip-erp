import { ClipboardCheckIcon, WrenchIcon } from 'lucide-react'
import { getFiveSTargets, createFiveSTarget, deleteFiveSTarget } from '@/app/actions/five-s'
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

export default async function FiveSIndexPage({ searchParams }: { searchParams: Promise<{ floor?: string }> }) {
  const { floor: requestedFloor } = await searchParams
  const actor = await currentActor()
  const selectedFloor = requestedFloor || null
  const canManage = canManageChecksheets(actor)
  const lockedFloor = actor?.floor && actor.role !== 'admin' ? String(actor.floor) : undefined
  const [allTargets, today] = await Promise.all([getFiveSTargets(), getTodayCheckStatuses()])
  const targetList = selectedFloor ? allTargets.filter((item) => detectFloor(item.floor, item.name) === selectedFloor) : allTargets

  return (
    <div className="min-h-dvh bg-background">
      <SiteHeader />
      <main className="flex w-full flex-col gap-4 px-6 py-6">
        <PageHeader
          tone="violet"
          icon={ClipboardCheckIcon}
          eyebrow="DAILY CHECK · 일일 점검"
          title="3정 5S Check Sheet"
          description="점검할 항목을 선택하세요."
          stat={{ label: selectedFloor ? formatFloorLabel(selectedFloor) : '전체', value: targetList.length, unit: '개' }}
          actions={canManage && (
            <TargetCreateDialog
              title="3정 5S 대상 추가"
              triggerText="3정 5S 추가"
              createAction={createFiveSTarget}
              redirectPathPrefix="/checksheets/5s"
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
                  title="3정 5S 대상 추가"
                  triggerText="3정 5S 추가"
                  createAction={createFiveSTarget}
                  redirectPathPrefix="/checksheets/5s"
              lockedFloor={lockedFloor}
                />
              </EmptyContent>
            )}
          </Empty>
        ) : (
          <div className="space-y-5">
            {groupByFloor(targetList).filter(([floor]) => !selectedFloor || floor === selectedFloor).map(([floor, items]) => (
              <TargetFloorSection key={floor} id={`five-s-floor-${floor}`} floor={floor} statuses={items.map((item) => today.fiveS[item.id] ?? 'off')}>
                  {[...items]
                    .sort((a, b) => compareTodayStatus(today.fiveS[a.id] ?? 'off', today.fiveS[b.id] ?? 'off'))
                    .map((item) => {
                      const status = today.fiveS[item.id] ?? 'off'
                      return (
                        <TargetListRow
                          key={item.id}
                          href={`/checksheets/5s/${item.id}`}
                          name={item.name}
                          floor={item.floor || ''}
                          department={item.department}
                          manager={item.manager}
                          inspectorName={item.manager}
                          deleteTitle="이 항목을 삭제할까요?"
                          deleteDescription={`${item.name} 항목과 입력된 3정 5S 점검 내용이 함께 삭제됩니다. 이 작업은 되돌릴 수 없습니다.`}
                          deleteAction={deleteFiveSTarget}
                          id={item.id}
                          status={status}
                          statusLabel={todayStatusLabel(status, today.weekend)}
                          canDelete={canManage && canUseFloor(actor, item.floor, item.name)}
                          kind="fiveS"
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
