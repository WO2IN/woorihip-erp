import { notFound } from 'next/navigation'
import {
  getEquipmentById,
  getEquipmentPhotos,
  getDailyCheckItems,
  getEquipmentEmergencyGuides,
  getEquipmentEmergencyHistories,
  updateEquipment,
} from '@/app/actions/equipment'
import {
  getOrCreateDailyCheckSheet,
  getDailyCheckEntries,
  updateDailyCheckSheetFields,
  toggleDailyCheckHoliday,
} from '@/app/actions/daily-check'
import { SiteHeader } from '@/components/layout/site-header'
import { NextCheckLink } from '@/components/checksheets/next-check-link'
import { YearMonthPicker } from '@/components/shared/year-month-picker'
import { ApprovalBox } from '@/components/shared/approval-box'
import { PrintButton } from '@/components/shared/print-button'
import { DailyCheckGrid } from '@/components/checksheets/daily/daily-check-grid'
import { DailySheetEditor } from '@/components/checksheets/daily/daily-sheet-editor'
import { EmergencyActionCard } from '@/components/equipment/emergency-action-card'
import { currentYearMonth } from '@/lib/date-utils'
import { SheetHeaderEditor } from '@/components/shared/sheet-header-editor'
import { canManageChecksheets, canUseFloor, currentActor } from '@/lib/check-access'

export default async function DailyCheckDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ equipmentId: string }>
  searchParams: Promise<{ year?: string; month?: string }>
}) {
  const { equipmentId } = await params
  const sp = await searchParams
  const equipId = Number(equipmentId)
  const equip = await getEquipmentById(equipId)
  if (!equip) notFound()
  const actor = await currentActor()
  const canManage = canManageChecksheets(actor) && canUseFloor(actor, equip.floor, equip.name)

  const { year: curYear, month: curMonth } = currentYearMonth()
  const year = sp.year ? Number(sp.year) : curYear
  const month = sp.month ? Number(sp.month) : curMonth

  const [photos, items, sheet, guides, histories] = await Promise.all([
    getEquipmentPhotos(equipId),
    getDailyCheckItems(equipId),
    getOrCreateDailyCheckSheet(equipId, year, month),
    getEquipmentEmergencyGuides(equipId),
    getEquipmentEmergencyHistories(equipId),
  ])
  const entries = await getDailyCheckEntries(sheet.id)
  const holidays: number[] = (sheet as any).holidays ?? []

  async function saveApproval(fields: { writer?: string; reviewer?: string; approver?: string }) {
    'use server'
    await updateDailyCheckSheetFields(sheet.id, fields)
  }

  async function toggleHoliday(day: number) {
    'use server'
    await toggleDailyCheckHoliday(sheet.id, day)
  }

  return (
    <div className="min-h-dvh bg-background">
      <SiteHeader />
      <main className="print-page flex w-full flex-col gap-4 px-6 py-6">
        <div className="no-print flex flex-wrap items-center justify-between gap-3">
          <YearMonthPicker year={year} month={month} />
          <div className="flex items-center gap-2">
            {canManage && (
              <DailySheetEditor equipmentId={equipId} equipmentName={equip.name} photos={photos} items={items} />
            )}
            <PrintButton />
            <NextCheckLink kind="daily" id={equipId} floor={equip.floor} name={equip.name} />
          </div>
        </div>
        {!canManage && (
          <p className="no-print text-sm text-muted-foreground">
            {actor?.role === 'viewer' ? '뷰어 계정은 점검 기록을 보기만 할 수 있습니다.' : '이 층 점검은 조회만 가능합니다.'}
          </p>
        )}

        <div className="print-compact-box flex flex-wrap items-start justify-between gap-4 border border-border bg-card p-4">
          <div className="flex flex-1 items-start gap-3">
            <img
              src="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/%ED%9A%8C%EC%82%AC%EB%A1%9C%EA%B3%A0_%ED%88%AC%EB%AA%85-kdSjzuFUF1A1rzO914B2j1jjYSWH4Z.png"
              alt="WOORI 로고"
              className="print-logo h-12 w-auto object-contain"
            />
            <div className="flex flex-col gap-1">
              <h1 className="text-balance text-xl font-semibold flex items-center">
                {year}년 {month}월 설비 일상점검 체크시트
                {canManage && (
                  <SheetHeaderEditor
                    id={equipId}
                    name={equip.name}
                    floor={equip.floor || ''}
                    department={equip.department || ''}
                    manager={equip.manager || ''}
                    updateAction={updateEquipment}
                  />
                )}
              </h1>
              <p className="text-sm text-muted-foreground">
                점검부서: {equip.department || '-'} · 담당자: {equip.manager || '-'} · 설비명:{' '}
                {equip.name}
              </p>
            </div>
          </div>
          <ApprovalBox
            writer={sheet.writer}
            reviewer={sheet.reviewer}
            approver={sheet.approver}
            onSave={saveApproval}
            readOnly={!canManage}
          />
        </div>

        {photos.length > 0 && (
          <div className="print-photo-box flex items-start gap-3 border border-border bg-card p-4">
            {photos
              .filter((photo) => photo.label === '전체 전경')
              .map((photo) => (
                <figure key={photo.id} className="print-photo-overview flex w-72 shrink-0 flex-col gap-1">
                  <img
                    src={photo.url || '/placeholder.svg'}
                    alt={photo.label || equip.name}
                    className="aspect-[16/10] w-full rounded-md border border-border object-cover"
                  />
                  <figcaption className="text-center text-xs text-muted-foreground">{photo.label}</figcaption>
                </figure>
              ))}
            {photos.some((photo) => photo.label !== '전체 전경') && (
              <div className="print-photo-parts flex min-w-0 flex-1 items-start gap-2">
                {photos
                  .filter((photo) => photo.label !== '전체 전경')
                  .map((photo) => (
                    <figure key={photo.id} className="flex w-32 max-w-32 min-w-0 shrink flex-col gap-1">
                      <img
                        src={photo.url || '/placeholder.svg'}
                        alt={photo.label || equip.name}
                        className="aspect-square w-full rounded-md border border-border object-cover"
                      />
                      <figcaption className="truncate text-center text-xs text-muted-foreground">
                        {photo.label}
                      </figcaption>
                    </figure>
                  ))}
              </div>
            )}
          </div>
        )}

        <DailyCheckGrid
          sheetId={sheet.id}
          equipmentId={equipId}
          year={year}
          month={month}
          items={items}
          entries={entries}
          holidays={holidays}
          workdays={(sheet as any).workdays ?? []}
          onToggleHoliday={canManage ? toggleHoliday : undefined}
          canManage={canManage}
          markLog={(sheet as any).markLog ?? []}
          inspector={{
            name: equip.inspectorName ?? '',
            desc: equip.inspectorDesc ?? '',
            cycle: equip.inspectorCycle ?? '',
          }}
          manager={{
            name: equip.managerName ?? '',
            desc: equip.managerDesc ?? '',
            cycle: equip.managerCycle ?? '',
          }}
          inspectorMarks={(sheet as any).inspectorMarks ?? []}
          managerMarks={(sheet as any).managerMarks ?? []}
        />

        <EmergencyActionCard equipmentId={equipId} equipment={equip} guides={guides} histories={histories} canManage={canManage} />
      </main>
    </div>
  )
}
