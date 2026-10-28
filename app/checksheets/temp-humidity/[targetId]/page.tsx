import {
  getOrCreateTempHumiditySheet,
  getTempHumidityEntries,
  getTempHumidityIssues,
  updateTempHumiditySheetFields,
  getTempHumidityTargetById,
  updateTempHumidityTarget,
  toggleTempHumidityHoliday,
} from '@/app/actions/temp-humidity'
import { SiteHeader } from '@/components/layout/site-header'
import { NextCheckLink } from '@/components/checksheets/next-check-link'
import { YearMonthPicker } from '@/components/shared/year-month-picker'
import { ApprovalBox } from '@/components/shared/approval-box'
import { RemarksField } from '@/components/shared/remarks-field'
import { PrintButton } from '@/components/shared/print-button'
import { TempHumidityTable } from '@/components/checksheets/temp-humidity/temp-humidity-table'
import { TempHumidityChart } from '@/components/checksheets/temp-humidity/temp-humidity-chart'
import { TempHumidityIssueDialog } from '@/components/checksheets/temp-humidity/temp-humidity-issue-dialog'
import { currentYearMonth } from '@/lib/date-utils'
import { notFound } from 'next/navigation'
import { canManageChecksheets, canUseFloor, currentActor } from '@/lib/check-access'
import { SheetHeaderEditor } from '@/components/shared/sheet-header-editor'

export default async function TempHumidityPage({
  params,
  searchParams,
}: {
  params: Promise<{ targetId: string }>
  searchParams: Promise<{ year?: string; month?: string }>
}) {
  const { targetId } = await params
  const tId = Number(targetId)
  const target = await getTempHumidityTargetById(tId)
  if (!target) notFound()
  const actor = await currentActor()
  const canManage = canManageChecksheets(actor) && canUseFloor(actor, target.floor, target.name)

  const sp = await searchParams
  const { year: curYear, month: curMonth } = currentYearMonth()
  const year = sp.year ? Number(sp.year) : curYear
  const month = sp.month ? Number(sp.month) : curMonth

  const sheet = await getOrCreateTempHumiditySheet(tId, year, month)
  const entries = await getTempHumidityEntries(sheet.id)
  const issues = await getTempHumidityIssues(sheet.id)
  const placeName = target.floor && !String(target.name).includes(`${target.floor}층`) ? `${target.floor}층 ${target.name}` : target.name
  const holidays: number[] = (sheet as any).holidays ?? []

  const tempLower = target.tempLower ?? 10
  const tempUpper = target.tempUpper ?? 30
  const humidityLower = target.humidityLower ?? 0
  const humidityUpper = target.humidityUpper ?? 60
  const limitsLabel = `관리기준: 온도 ${tempLower}~${tempUpper}℃ (LCL ${tempLower} / UCL ${tempUpper}) · 습도 ${humidityLower}~${humidityUpper}% (LCL ${humidityLower} / UCL ${humidityUpper})`

  async function saveApproval(fields: { writer?: string; reviewer?: string; approver?: string }) {
    'use server'
    await updateTempHumiditySheetFields(sheet.id, fields)
  }

  async function saveRemarks(value: string) {
    'use server'
    await updateTempHumiditySheetFields(sheet.id, { remarks: value })
  }

  async function toggleHoliday(day: number) {
    'use server'
    await toggleTempHumidityHoliday(sheet.id, day)
  }

  return (
    <div className="temp-humidity-page min-h-dvh bg-background print:min-h-0">
      <style>{`
        @media print {
          #temp-humidity-print-sheet { height: auto !important; min-height: 0 !important; max-height: none !important; gap: 4px !important; padding: 0 !important; }
          #temp-humidity-print-sheet .screen-only-chart { display: none !important; height: 0 !important; max-height: 0 !important; overflow: hidden !important; }
          #temp-humidity-print-sheet .print-only-chart { display: block !important; width: 100% !important; height: 520px !important; max-height: 520px !important; overflow: hidden !important; }
          #temp-humidity-print-sheet .print-only-chart .recharts-wrapper,
          #temp-humidity-print-sheet .print-only-chart svg { width: 100% !important; height: 520px !important; max-height: 520px !important; }
          #temp-humidity-print-sheet .temp-humidity-chart { height: auto !important; min-height: 0 !important; max-height: none !important; flex: none !important; padding: 2px 6px 2px !important; gap: 0 !important; }
          #temp-humidity-print-sheet .temp-humidity-chart h2 { font-size: 11px !important; margin: 0 !important; }
          #temp-humidity-print-sheet .temp-humidity-body { flex: none !important; height: auto !important; min-height: 0 !important; gap: 0 !important; }
          #temp-humidity-print-sheet .print-banner,
          #temp-humidity-print-sheet .print-compact-box.print-banner { padding: 3px 8px !important; gap: 6px !important; }
          #temp-humidity-print-sheet .print-banner h1 { font-size: 13px !important; line-height: 1.15 !important; }
          #temp-humidity-print-sheet .print-banner p { font-size: 8px !important; line-height: 1.2 !important; margin: 0 !important; }
          #temp-humidity-print-sheet .print-banner .print-logo { width: 58px !important; max-width: 58px !important; height: auto !important; max-height: 26px !important; }
          #temp-humidity-print-sheet .print-banner input { height: 16px !important; min-height: 0 !important; width: 52px !important; font-size: 8px !important; }
          #temp-humidity-print-sheet .print-banner .print-compact-label { font-size: 8px !important; padding: 0 3px !important; }
          #temp-humidity-print-sheet .temp-humidity-table-wrap { margin-top: 0 !important; }
          #temp-humidity-print-sheet .temp-humidity-table-wrap .print-sheet,
          #temp-humidity-print-sheet .temp-humidity-table-wrap .print-sheet table { height: auto !important; min-height: 0 !important; flex: none !important; }
        }
      `}</style>
      <SiteHeader />
      <main
        id="temp-humidity-print-sheet"
        className="print-page flex w-full flex-col gap-4 px-6 py-6 print:h-auto print:min-h-0 print:gap-1 print:px-0 print:py-0"
      >
        <div className="no-print flex flex-wrap items-center justify-between gap-3">
          <YearMonthPicker year={year} month={month} />
          <div className="flex items-center gap-2">
            <PrintButton />
            <NextCheckLink kind="temp" id={tId} floor={target.floor} name={target.name} />
          </div>
        </div>
        {!canManage && (
          <p className="no-print text-sm text-muted-foreground">
            {actor?.role === 'viewer' ? '뷰어 계정은 점검 기록을 보기만 할 수 있습니다.' : '이 층 점검은 조회만 가능합니다.'}
          </p>
        )}

        <div className="print-banner print-compact-box flex flex-wrap items-start justify-between gap-4 border border-border bg-card p-4 print:gap-3 print:p-3">
          <div className="flex flex-1 items-start gap-3 print:gap-2">
            <img
              src="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/%ED%9A%8C%EC%82%AC%EB%A1%9C%EA%B3%A0_%ED%88%AC%EB%AA%85-kdSjzuFUF1A1rzO914B2j1jjYSWH4Z.png"
              alt="WOORI 로고"
              className="print-logo h-12 w-auto object-contain"
            />
            <div className="flex flex-col gap-1 print:gap-0.5">
              <h1 className="text-balance text-xl font-semibold flex items-center">
                {year}년 {month}월 온/습도 체크시트
                {canManage && (
                <SheetHeaderEditor
                  id={tId}
                  name={target.name}
                  floor={target.floor || ''}
                  department={target.department || ''}
                  manager={target.manager || ''}
                  standard={target.standard || '관리기준: 온도 20±10℃ · 습도 60% 이하'}
                  updateAction={updateTempHumidityTarget}
                  showStandard={true}
                  numberFields={[
                    { key: 'tempLower', label: '온도 하한선(LCL, ℃)', defaultValue: target.tempLower ?? 10 },
                    { key: 'tempUpper', label: '온도 상한선(UCL, ℃)', defaultValue: target.tempUpper ?? 30 },
                    { key: 'humidityLower', label: '습도 하한선(LCL, %)', defaultValue: target.humidityLower ?? 0 },
                    { key: 'humidityUpper', label: '습도 상한선(UCL, %)', defaultValue: target.humidityUpper ?? 60 },
                  ]}
                />
                )}
              </h1>
              <p className="text-sm text-muted-foreground print:text-[11px] print:leading-snug">
                점검부서: {target.department || '-'} · 담당자: {target.manager || '-'} · 항목명: {target.name}
              </p>
              <p className="text-sm text-muted-foreground print:text-[11px] print:leading-snug">{target.standard || limitsLabel}</p>
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

        <div className="temp-humidity-body flex min-h-0 flex-1 flex-col gap-4 print:flex-none print:min-h-0 print:gap-0">
          <TempHumidityChart
            year={year}
            month={month}
            entries={entries}
            tempLower={tempLower}
            tempUpper={tempUpper}
            humidityLower={humidityLower}
            humidityUpper={humidityUpper}
            action={
              <TempHumidityIssueDialog
                key={sheet.id}
                sheetId={sheet.id}
                placeName={placeName}
                year={year}
                month={month}
                entries={entries}
                issues={issues}
                tempLower={tempLower}
                tempUpper={tempUpper}
                humidityLower={humidityLower}
                humidityUpper={humidityUpper}
                canManage={canManage}
              />
            }
          />
          <TempHumidityTable
            sheetId={sheet.id}
            year={year}
            month={month}
            entries={entries}
            manager={target.manager || ''}
            holidays={holidays}
            workdays={(sheet as any).workdays ?? []}
            onToggleHoliday={canManage ? toggleHoliday : undefined}
            canManage={canManage}
          />
        </div>

        <div className="print-compact-box border border-border bg-card p-4">
          <RemarksField defaultValue={sheet.remarks ?? ''} onSave={saveRemarks} readOnly={!canManage} />
        </div>
      </main>
    </div>
  )
}
