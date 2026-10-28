'use client'

import { useEffect, useState, useTransition } from 'react'
import { PlusIcon, Trash2Icon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export interface EmergencyGuide {
  id: number
  emergencyType?: string | null
  emergencyAction?: string | null
}

export interface EmergencyHistory {
  id: number
  occurredDate?: string | null
  cause?: string | null
  action?: string | null
  processedDate?: string | null
  note?: string | null
}

interface EmergencyFlowTableProps {
  guides: EmergencyGuide[]
  histories: EmergencyHistory[]
  onAddGuide: () => Promise<void> | void
  onUpdateGuide: (
    id: number,
    fields: Record<string, string>,
  ) => Promise<void> | void
  onDeleteGuide: (id: number) => Promise<void> | void
  onAddHistory: () => Promise<void> | void
  onUpdateHistory: (
    id: number,
    fields: Record<string, string>,
  ) => Promise<void> | void
  onDeleteHistory: (id: number) => Promise<void> | void
  escalationNote: string
  onEscalationChange: (value: string) => void
  onEscalationCommit?: (value: string) => void
  editable?: boolean
}

const cellInputClass =
  'print-compact-input h-9 rounded-none border-0 text-center shadow-none focus-visible:ring-0'

function CellInput({
  value,
  disabled,
  onCommit,
}: {
  value: string
  disabled?: boolean
  onCommit: (value: string) => void
}) {
  const [draft, setDraft] = useState(value)

  useEffect(() => {
    setDraft(value)
  }, [value])

  return (
    <Input
      value={draft}
      disabled={disabled}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={(e) => {
        if (disabled) return
        onCommit(e.target.value)
      }}
      className={cellInputClass}
    />
  )
}

export function EmergencyFlowTable({
  guides,
  histories,
  onAddGuide,
  onUpdateGuide,
  onDeleteGuide,
  onAddHistory,
  onUpdateHistory,
  onDeleteHistory,
  escalationNote,
  onEscalationChange,
  onEscalationCommit,
  editable = true,
}: EmergencyFlowTableProps) {
  const [, startTransition] = useTransition()

  const rowCount = Math.max(
    guides.length,
    histories.length,
    2,
  )

  const renderRows = Array.from({
    length: rowCount,
  }).map((_, index) => ({
    guide: guides[index] ?? null,
    history: histories[index] ?? null,
  }))

  return (
    <div className="print-issue-table no-break flex flex-col gap-2">
      {/* 항목 / 버튼 */}
      <div className="flex items-center justify-between">
        <h2 className="print-compact-label text-sm font-semibold">
          이상발생시 조치사항
        </h2>

        {editable && <div className="no-print flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              startTransition(() => onAddGuide())
            }
          >
            <PlusIcon data-icon="inline-start" />
            이상발생 추가
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              startTransition(() => onAddHistory())
            }
          >
            <PlusIcon data-icon="inline-start" />
            조치이력 추가
          </Button>
        </div>}
      </div>

      {/*이상발생시*/}
      <div className="overflow-x-auto border-2 border-foreground/50">
        <table className="w-full table-fixed border-collapse text-sm">
          <tbody>
            {/* =====================================================이상발생시===================================================== */}
            <tr>
              {/* 이상발생시*/}
              <th
                rowSpan={rowCount + 3}
                className="w-9 border-r border-b border-border bg-muted/60 p-1 text-center font-medium"
              >
                <span className="[writing-mode:vertical-rl] leading-tight">
                이상발생시
                </span>
              </th>

              {/* 응급조치사항 */}
              <th
                rowSpan={rowCount + 3}
                className="w-9 border-r border-b border-border bg-muted/60 p-1 text-center font-medium"
              >
                <span className="[writing-mode:vertical-rl] leading-tight">
                 응급조치사항
                </span>
              </th>

              {/* 이상발생 */}
              <th
                rowSpan={2}
                className="border-r border-b border-border bg-muted p-2 text-center font-medium tracking-widest"
              >
                이상발생
              </th>

              {/* 조치사항 */}
              <th
                rowSpan={2}
                className="border-r border-b border-border bg-muted p-2 text-center font-medium tracking-widest"
              >
                조치사항
              </th>

              {/* FLOW */}
              <th
                rowSpan={2}
                className="w-12 border-r border-b border-border bg-muted p-2 text-center font-medium"
              >
                FLOW
              </th>

              {/* 점검담당자 --> 생산팀장*/}
              <th
                colSpan={5}
                className="border-b border-border bg-muted p-2 text-center font-medium"
              >
                점검담당자 &nbsp;--&gt;&nbsp; 생산팀장
                </th>

              <th className="no-print w-10 border-b border-border bg-muted p-2" />
            </tr>

            {/* =====================================================발생일자===================================================== */}
            <tr>
              {/* 발생 일자 */}
              <th
                className="w-24 border-r border-b border-border bg-muted/70 p-2 text-center font-medium"
              >
                발생 일자
              </th>

              {/* 고장 원인 */}
              <th
                className="border-r border-b border-border bg-muted/70 p-2 text-center font-medium"
              >
                고 장 원 인
              </th>

              {/* 조치 내용 */}
              <th
                className="border-r border-b border-border bg-muted/70 p-2 text-center font-medium"
              >
                조 치 내 용
              </th>

              {/* 처리 일자 */}
              <th
                className="w-24 border-r border-b border-border bg-muted/70 p-2 text-center font-medium"
              >
                처 리 일 자
              </th>

              {/* 비고 */}
              <th
                className="w-14 border-b border-border bg-muted/70 p-2 text-center font-medium"
              >
                비 고
              </th>

              <th className="no-print w-10 border-b border-border bg-muted/70 p-2" />
            </tr>
          
            {/* =====================================================이상 발생시 (작업자 → 과장 → 부장) 즉시 전달===================================================== */}
            {renderRows.map((row, index) => (
              <tr key={index}>
                {/* =================================================
                    이상발생
                   ================================================= */}
                <td className="border-r border-b border-border p-0">
                  <div className="relative h-full group">
                    <CellInput
                      key={`guide-type-${row.guide?.id ?? `empty-${index}`}`}
                      value={row.guide?.emergencyType ?? ''}
                      disabled={!editable || !row.guide}
                      onCommit={(value) => {
                        if (!row.guide) return
                        startTransition(() =>
                          onUpdateGuide(row.guide!.id, { emergencyType: value }),
                        )
                      }}
                    />

                    {/* 이상발생 */}
                    {editable && row.guide && (
                      <div className="no-print absolute left-1 top-1 z-10 opacity-0 transition-opacity group-hover:opacity-100">
                        <Button
                          variant="ghost"
                          className="h-6 w-6 bg-background/80 p-0 text-muted-foreground hover:bg-destructive hover:text-destructive-foreground"
                          onClick={() =>
                            startTransition(() =>
                              onDeleteGuide(
                                row.guide!.id,
                              ),
                            )
                          }
                        >
                          <Trash2Icon className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                  </div>
                </td>

                {/* =================================================
                    조치사항
                   ================================================= */}
                <td className="border-r border-b border-border p-0">
                  <CellInput
                    key={`guide-action-${row.guide?.id ?? `empty-${index}`}`}
                    value={row.guide?.emergencyAction ?? ''}
                    disabled={!editable || !row.guide}
                    onCommit={(value) => {
                      if (!row.guide) return
                      startTransition(() =>
                        onUpdateGuide(row.guide!.id, { emergencyAction: value }),
                      )
                    }}
                  />
                </td>

                {/* =================================================
                    FLOW
                    문제 발생 조치 이력
                   ================================================= */}
                {index === 0 && (
                  <td
                    rowSpan={rowCount}
                    className="w-12 border-r border-b border-border bg-muted/20 p-1 text-center align-middle"
                  >
                    <span className="[writing-mode:vertical-rl] text-xs leading-tight text-muted-foreground">
                      조 치 이 력<br></br>문 제 발 생
                    </span>
                  </td>
                )}

                {/* =================================================
                    발생 일자
                   ================================================= */}
                <td className="border-r border-b border-border p-0">
                  <CellInput
                    key={`history-occurred-${row.history?.id ?? `empty-${index}`}`}
                    value={row.history?.occurredDate ?? ''}
                    disabled={!editable || !row.history}
                    onCommit={(value) => {
                      if (!row.history) return
                      startTransition(() =>
                        onUpdateHistory(row.history!.id, { occurredDate: value }),
                      )
                    }}
                  />
                </td>

                {/* =================================================
                    고장 원인
                   ================================================= */}
                <td className="border-r border-b border-border p-0">
                  <CellInput
                    key={`history-cause-${row.history?.id ?? `empty-${index}`}`}
                    value={row.history?.cause ?? ''}
                    disabled={!editable || !row.history}
                    onCommit={(value) => {
                      if (!row.history) return
                      startTransition(() =>
                        onUpdateHistory(row.history!.id, { cause: value }),
                      )
                    }}
                  />
                </td>

                {/* =================================================
                    조치 내용
                   ================================================= */}
                <td className="border-r border-b border-border p-0">
                  <CellInput
                    key={`history-action-${row.history?.id ?? `empty-${index}`}`}
                    value={row.history?.action ?? ''}
                    disabled={!editable || !row.history}
                    onCommit={(value) => {
                      if (!row.history) return
                      startTransition(() =>
                        onUpdateHistory(row.history!.id, { action: value }),
                      )
                    }}
                  />
                </td>

                {/* =================================================
                    처리 일자
                   ================================================= */}
                <td className="border-r border-b border-border p-0">
                  <CellInput
                    key={`history-processed-${row.history?.id ?? `empty-${index}`}`}
                    value={row.history?.processedDate ?? ''}
                    disabled={!editable || !row.history}
                    onCommit={(value) => {
                      if (!row.history) return
                      startTransition(() =>
                        onUpdateHistory(row.history!.id, { processedDate: value }),
                      )
                    }}
                  />
                </td>

                {/* =================================================
                    비고
                   ================================================= */}
                <td className="border-b border-border p-0">
                  <CellInput
                    key={`history-note-${row.history?.id ?? `empty-${index}`}`}
                    value={row.history?.note ?? ''}
                    disabled={!editable || !row.history}
                    onCommit={(value) => {
                      if (!row.history) return
                      startTransition(() =>
                        onUpdateHistory(row.history!.id, { note: value }),
                      )
                    }}
                  />
                </td>

                {/* =================================================
                    이상발생 추가 버튼
                   ================================================= */}
                <td className="no-print border-b border-border p-1 text-center">
                  {editable && row.history && (
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() =>
                        startTransition(() =>
                          onDeleteHistory(
                            row.history!.id,
                          ),
                        )
                      }
                    >
                      <Trash2Icon />
                    </Button>
                  )}
                </td>
              </tr>
            ))}

            {/* =====================================================
                이상 발생시 문구
               ===================================================== */}
            <tr>
              <td
                colSpan={8}
                className="border-r border-border p-0"
              >
                <Input
                  value={escalationNote}
                  readOnly={!editable}
                  onChange={(e) =>
                    onEscalationChange(e.target.value)
                  }
                  onBlur={(e) =>
                    onEscalationCommit?.(e.target.value)
                  }
                  placeholder="이상 발생시 (작업자 → 과장 → 부장) 즉시 전달"
                  className="print-compact-input h-9 rounded-none border-0 px-3 text-left shadow-none focus-visible:ring-0"
                />
              </td>
              <td className="no-print border-border p-0" />
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}
