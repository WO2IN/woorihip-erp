import {
  getOrCreateFiveSSheet,
  getFiveSEntries,
  getFiveSCheckItems,
  updateFiveSSheetFields,
  getFiveSTargetById,
  updateFiveSTarget,
  toggleFiveSHoliday,
} from '@/app/actions/five-s'
import { SiteHeader } from '@/components/layout/site-header'
import { NextCheckLink } from '@/components/checksheets/next-check-link'
import { YearMonthPicker } from '@/components/shared/year-month-picker'
import { ApprovalBox } from '@/components/shared/approval-box'
import { RemarksField } from '@/components/shared/remarks-field'
import { PrintButton } from '@/components/shared/print-button'
import { FiveSGrid } from '@/components/checksheets/five-s/five-s-grid'
import { FiveSSheetEditor } from '@/components/checksheets/five-s/five-s-sheet-editor'
import { currentYearMonth } from '@/lib/date-utils'
import { notFound } from 'next/navigation'
import { canManageChecksheets, canUseFloor, currentActor } from '@/lib/check-access'
import { SheetHeaderEditor } from '@/components/shared/sheet-header-editor'

export default async function FiveSPage({
  params,
  searchParams,
}: {
  params: Promise<{ targetId: string }>
  searchParams: Promise<{ year?: string; month?: string }>
}) {
  const { targetId } = await params
  const tId = Number(targetId)
  const target = await getFiveSTargetById(tId)
  if (!target) notFound()
  const actor = await currentActor()
  const canManage = canManageChecksheets(actor) && canUseFloor(actor, target.floor, target.name)

  const sp = await searchParams
  const { year: curYear, month: curMonth } = currentYearMonth()
  const year = sp.year ? Number(sp.year) : curYear
  const month = sp.month ? Number(sp.month) : curMonth

  const sheet = await getOrCreateFiveSSheet(tId, year, month)
  const [entries, items] = await Promise.all([getFiveSEntries(sheet.id), getFiveSCheckItems(tId)])
  const holidays: number[] = (sheet as any).holidays ?? []

  async function saveApproval(fields: { writer?: string; reviewer?: string; approver?: string }) {
    'use server'
    await updateFiveSSheetFields(sheet.id, fields)
  }

  async function saveRemarks(value: string) {
    'use server'
    await updateFiveSSheetFields(sheet.id, { remarks: value })
  }

  async function toggleHoliday(day: number) {
    'use server'
    await toggleFiveSHoliday(sheet.id, day)
  }

  return (
    <div className="min-h-dvh bg-background">
      <SiteHeader />
      <main className="print-page flex w-full flex-col gap-4 px-6 py-6">
        <div className="no-print flex flex-wrap items-center justify-between gap-3">
          <YearMonthPicker year={year} month={month} />
          <div className="flex items-center gap-2">
            {canManage && <FiveSSheetEditor targetId={tId} targetName={target.name} items={items as any} />}
            <PrintButton />
            <NextCheckLink kind="fiveS" id={tId} floor={target.floor} name={target.name} />
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
                {year}년 {month}월 3정 5S Check Sheet
                {canManage && (
                <SheetHeaderEditor
                  id={tId}
                  name={target.name}
                  floor={target.floor || ''}
                  department={target.department || ''}
                  manager={target.manager || ''}
                  standard={target.standard || '표시: ◎(매우잘함) / ○(잘함) / △(보통수준) / V(미흡함) / ×(대단히 미흡함) / N/A(해당사항 없음)'}
                  updateAction={updateFiveSTarget}
                  showStandard={true}
                  standardLabel="표시 기준"
                />
                )}
              </h1>
              <p className="text-sm text-muted-foreground">
                점검부서: {target.department || '-'} · 담당자: {target.manager || '-'} · 항목명: {target.name}
              </p>
              <p className="text-sm text-muted-foreground">
                {target.standard || '표시: ◎(매우잘함) / ○(잘함) / △(보통수준) / V(미흡함) / ×(대단히 미흡함) / N/A(해당사항 없음)'}
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

        <FiveSGrid
          sheetId={sheet.id}
          year={year}
          month={month}
          items={items as any}
          entries={entries}
          holidays={holidays}
          workdays={(sheet as any).workdays ?? []}
          onToggleHoliday={canManage ? toggleHoliday : undefined}
          canManage={canManage}
        />

        <div className="print-compact-box border border-border bg-card p-4">
          <RemarksField defaultValue={sheet.remarks ?? ''} onSave={saveRemarks} readOnly={!canManage} />
        </div>
      </main>
    </div>
  )
}
