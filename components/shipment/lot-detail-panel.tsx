'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowDownRight, ArrowUpRight, Package, X } from 'lucide-react'
import { Button, buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  attachCertificateHref,
  certificatesFor,
  lotText,
} from '@/lib/lot-link'
import { ProcessAnswer, ProcessCheckRecord, ProcessFieldSpec, ProcessTemplate, isOutOfRange, recordFloor, recordLineId, sectionsOf } from '@/lib/process-checklist'
import { batchForMovement, compactDate, displayDate, inboundBatches, inboundWorkSpan, StockMovement } from '@/lib/stock'
import { Floor3WorkLog } from '@/lib/floor3-work-log'
import { DocumentMetadata } from '@/lib/types'

export function LotDetailPanel({
  anchor,
  movements,
  documents,
  checks,
  templates,
  workLogs = [],
  editable,
  onClose,
  onPreview,
}: {
  anchor: StockMovement
  movements: StockMovement[]
  documents: DocumentMetadata[]
  checks: ProcessCheckRecord[]
  templates: ProcessTemplate[]
  workLogs?: Floor3WorkLog[]
  editable: boolean
  onClose: () => void
  onPreview: (doc: DocumentMetadata) => void
}) {
  const batch = batchForMovement(anchor, movements)
  const inbound = batch.inbound
  const floor = Number(anchor.floor)
  const checksOnDate = (date: string) => {
    if (floor !== 1 && floor !== 2 && floor !== 3) return []
    const key = compactDate(date)
    return checks
      .filter((record) => {
        if (recordFloor(record) !== floor || compactDate(record.writtenDate) !== key) return false
        if (record.product && record.product !== anchor.product) return false
        if (record.company && record.company !== anchor.company) return false
        return true
      })
      .sort((a, b) => a.writtenTime.localeCompare(b.writtenTime))
  }
  const incoming = inbound?.quantity ?? 0
  const outgoing = batch.rows.filter((row) => row.kind === '출고').reduce((sum, row) => sum + row.quantity, 0)
  const remain = incoming - outgoing
  const lot = lotText(inbound?.lot)
  const sameItem = movements.filter(
    (row) => row.company === anchor.company && row.product === anchor.product && row.floor === anchor.floor && row.unit === anchor.unit,
  )
  const batches = inboundBatches(sameItem)
  const workSpan = inboundWorkSpan(batch, batches)
  const batchWork = inbound && anchor.floor === '3' && workSpan
    ? workLogs
      .filter((log) => {
        if (log.company !== anchor.company || log.product !== anchor.product) return false
        if ((log.unit || 'EA') !== anchor.unit) return false
        const date = compactDate(log.workDate)
        if (!date || date < workSpan.start) return false
        if (workSpan.end && date > workSpan.end) return false
        return true
      })
      .sort((a, b) => compactDate(a.workDate).localeCompare(compactDate(b.workDate)))
    : []
  let runningRemain = 0
  const [openChecks, setOpenChecks] = useState<ProcessCheckRecord[]>([])
  const templateName = (record: ProcessCheckRecord) =>
    templates.find((item) => item.id === recordLineId(record))?.name || '공정 점검'
  const workCheckColumn = batchWork.some((log) => checksOnDate(log.workDate).length > 0)

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (openChecks.length > 0) {
        setOpenChecks([])
        return
      }
      onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, openChecks.length])

  const heading = inbound ? '입고분' : batch.key === 'uncovered' ? '입고 수량을 넘는 출고' : '입고 전 출고'
  const subtitle = inbound
    ? [displayDate(inbound.issueDate), anchor.floor ? `${anchor.floor}층` : '', lot ? `로트 ${lot}` : ''].filter(Boolean).join(' · ')
    : batch.key === 'uncovered'
      ? '앞선 입고 수량을 모두 소진한 뒤의 출고입니다.'
      : '이 출고들은 아직 입고 수량에 연결되지 않았습니다.'

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="lot-detail-title"
        className="flex max-h-[88vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-background text-foreground shadow-[0_8px_40px_oklch(0_0_0/0.18)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 px-6 pt-6 pb-2">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">{heading}</p>
            <h2 id="lot-detail-title" className="mt-1 truncate text-2xl font-bold tracking-tight">
              {anchor.company} · {anchor.product}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
          </div>
          <Button type="button" variant="ghost" size="icon-sm" onClick={onClose} aria-label="닫기">
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="grid grid-cols-3 gap-3 px-6 py-4">
          <Summary icon={ArrowDownRight} label="입고" value={incoming} unit={anchor.unit} tone="blue" />
          <Summary icon={ArrowUpRight} label="출고" value={outgoing} unit={anchor.unit} tone="orange" />
          <Summary icon={Package} label="남음" value={remain} unit={anchor.unit} tone={remain < 0 ? 'danger' : 'emerald'} />
        </div>

        <div className="space-y-6 overflow-y-auto px-6 pb-6">
          <section>
            <h3 className="mb-3 text-sm font-semibold tracking-wide uppercase">일자별 내역</h3>
            <div className={sheetClass}>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <Th>일자</Th>
                    <Th>구분</Th>
                    <Th align="right">수량</Th>
                    <Th align="right">남은 수량</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {batch.rows.map((row) => {
                    runningRemain = row.kind === '입고' ? row.quantity : runningRemain - row.quantity
                    const selected = row.source === anchor.source && row.id === anchor.id
                    const certificates = row.kind === '출고'
                      ? certificatesFor(row, movements, documents).filter((doc) => doc.storagePath && doc.storagePath !== 'INVENTORY' && doc.filename !== '수기입력')
                      : []
                    return (
                      <tr key={`${row.source}-${row.id}`} className={selected ? 'bg-[oklch(0.52_0.19_258/0.06)]' : undefined}>
                        <td className="px-5 py-3.5">{displayDate(row.issueDate)}</td>
                        <td className="px-5 py-3.5">
                          <div className="flex flex-wrap items-center gap-2">
                            <KindBadge kind={row.kind} />
                            {certificates.map((doc) => (
                              <Button key={doc.id} type="button" size="sm" variant="ghost" className="h-7 px-2 text-xs text-muted-foreground" onClick={() => onPreview(doc)}>
                                보기
                              </Button>
                            ))}
                            {editable && row.kind === '출고' && certificates.length === 0 && (
                              <Link href={attachCertificateHref(row)} className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'h-7 px-2 text-xs text-muted-foreground')}>
                                붙이기
                              </Link>
                            )}
                          </div>
                        </td>
                        <td className="px-5 py-3.5 text-right"><Qty value={row.quantity} unit={row.unit} /></td>
                        <td className="px-5 py-3.5 text-right font-semibold"><Qty value={runningRemain} unit={row.unit} warn={runningRemain < 0} /></td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </section>

          {batchWork.length > 0 && (
            <section>
              <h3 className="mb-3 text-sm font-semibold tracking-wide uppercase">작업일자</h3>
              <div className={sheetClass}>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <Th>일자</Th>
                      {workCheckColumn && <Th>점검</Th>}
                      <Th align="right">작업수량</Th>
                      <Th align="right">불량수량</Th>
                      <Th align="right">검사시료</Th>
                      <Th align="right">결과</Th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {batchWork.map((log) => {
                      const result = log.workQuantity - log.defectQuantity - log.sampleQuantity
                      const rate = workDefectRate(log.defectQuantity, log.workQuantity)
                      const dayChecks = checksOnDate(log.workDate)
                      return (
                        <tr key={log.id}>
                          <td className="px-5 py-3.5">{displayDate(log.workDate)}</td>
                          {workCheckColumn && (
                            <td className="px-5 py-3.5">
                              {dayChecks.length > 0 && (
                                <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-xs text-muted-foreground" onClick={() => setOpenChecks(dayChecks)}>
                                  보기
                                </Button>
                              )}
                            </td>
                          )}
                          <td className="px-5 py-3.5 text-right"><Qty value={log.workQuantity} unit={log.unit} /></td>
                          <td className="px-5 py-3.5 text-right">
                            <Qty value={log.defectQuantity} />
                            {rate && <span className="ml-1.5 text-xs text-muted-foreground">{rate}</span>}
                          </td>
                          <td className="px-5 py-3.5 text-right"><Qty value={log.sampleQuantity} /></td>
                          <td className={`px-5 py-3.5 text-right font-semibold ${result < 0 ? '' : 'text-[oklch(0.45_0.17_162)] dark:text-[oklch(0.68_0.17_162)]'}`}>
                            <Qty value={result} unit={log.unit} warn={result < 0} />
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </div>
      </div>
      {openChecks.length > 0 && (
        <ProcessCheckSnapshot
          records={openChecks}
          templates={templates}
          titleFor={templateName}
          onClose={() => setOpenChecks([])}
        />
      )}
    </div>
  )
}

const sheetClass = 'overflow-hidden rounded-2xl border border-border bg-card shadow-[0_1px_3px_oklch(0_0_0/0.06),0_4px_12px_oklch(0_0_0/0.04)]'

function workDefectRate(defect: number, work: number) {
  if (work <= 0) return null
  const rate = (defect / work) * 100
  return `${rate.toLocaleString('ko-KR', { maximumFractionDigits: 1 })}%`
}

function Th({ children, align = 'left' }: { children: string; align?: 'left' | 'right' }) {
  return (
    <th className={`px-5 py-3 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase ${align === 'right' ? 'text-right' : 'text-left'}`}>
      {children}
    </th>
  )
}

function Qty({ value, unit, warn = false }: { value: number; unit?: string; warn?: boolean }) {
  const text = Number.isFinite(value) ? value.toLocaleString('ko-KR', { maximumFractionDigits: 2 }) : '-'
  return (
    <span className={`tabular-nums ${warn ? 'font-semibold text-destructive' : ''}`}>
      {text}
      {unit ? <span className="ml-1 text-xs font-normal text-muted-foreground">{unit}</span> : null}
    </span>
  )
}

function KindBadge({ kind }: { kind: '입고' | '출고' }) {
  const inbound = kind === '입고'
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${
        inbound
          ? 'bg-[oklch(0.52_0.19_258/0.12)] text-[oklch(0.42_0.19_258)] dark:text-[oklch(0.78_0.12_258)]'
          : 'bg-[oklch(0.68_0.17_55/0.16)] text-[oklch(0.46_0.14_55)] dark:text-[oklch(0.82_0.12_55)]'
      }`}
    >
      {kind}
    </span>
  )
}

function Summary({
  icon: Icon,
  label,
  value,
  unit,
  tone,
}: {
  icon: typeof Package
  label: string
  value: number
  unit?: string
  tone: 'blue' | 'orange' | 'emerald' | 'danger'
}) {
  const toneClass = {
    blue: 'bg-[oklch(0.52_0.19_258/0.12)] text-[oklch(0.52_0.19_258)]',
    orange: 'bg-[oklch(0.68_0.17_55/0.16)] text-[oklch(0.52_0.17_55)]',
    emerald: 'bg-[oklch(0.55_0.17_162/0.12)] text-[oklch(0.45_0.17_162)]',
    danger: 'bg-destructive/10 text-destructive',
  }[tone]
  const text = Number.isFinite(value) ? value.toLocaleString('ko-KR', { maximumFractionDigits: 2 }) : '-'
  return (
    <div className={`${sheetClass} p-4`}>
      <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${toneClass}`}>
        <Icon className="h-4 w-4" />
      </div>
      <p className="mt-3 text-xs font-semibold text-muted-foreground">{label}</p>
      <p className={`mt-1 text-2xl font-bold leading-none tabular-nums ${tone === 'danger' ? 'text-destructive' : ''}`}>
        {text}
        {unit ? <span className="ml-1 text-sm font-normal text-muted-foreground">{unit}</span> : null}
      </p>
    </div>
  )
}

function ProcessCheckSnapshot({
  records,
  templates,
  titleFor,
  onClose,
}: {
  records: ProcessCheckRecord[]
  templates: ProcessTemplate[]
  titleFor: (record: ProcessCheckRecord) => string
  onClose: () => void
}) {
  const [index, setIndex] = useState(0)
  const record = records[Math.min(index, records.length - 1)]
  const template = templates.find((item) => item.id === recordLineId(record))
  const sections = template ? sectionsOf(template) : []
  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="process-check-snapshot-title"
        className="flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-background text-foreground shadow-[0_8px_40px_oklch(0_0_0/0.18)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 px-6 pt-6 pb-4">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">공정 점검</p>
            <h2 id="process-check-snapshot-title" className="mt-1 truncate text-2xl font-bold tracking-tight">{titleFor(record)}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {displayDate(record.writtenDate)} {record.writtenTime} · {record.author}
            </p>
          </div>
          <Button type="button" variant="ghost" size="icon-sm" onClick={onClose} aria-label="닫기">
            <X className="h-4 w-4" />
          </Button>
        </div>
        {records.length > 1 && (
          <div className="flex gap-2 overflow-x-auto px-6 pb-3">
            {records.map((item, itemIndex) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setIndex(itemIndex)}
                className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${itemIndex === index ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}
              >
                {item.writtenTime}
              </button>
            ))}
          </div>
        )}
        <div className="space-y-4 overflow-y-auto px-6 pb-6">
          {sections.length === 0 ? (
            <p className="text-sm text-muted-foreground">점검 항목 구성을 찾지 못했습니다.</p>
          ) : sections.map((section) => (
            <section key={section.id} className={sheetClass}>
              <h3 className="border-b border-border px-5 py-3 text-sm font-semibold">{section.title}</h3>
              <ul className="divide-y divide-border">
                {section.fields.map((field) => {
                  const value = record.answers[field.id]
                  return (
                    <li key={field.id} className="flex items-start justify-between gap-4 px-5 py-3">
                      <p className="min-w-0 text-sm">{field.label}</p>
                      <p className={`shrink-0 text-sm font-semibold tabular-nums ${answerTone(field, value)}`}>
                        {formatCheckAnswer(field, value)}
                      </p>
                    </li>
                  )
                })}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </div>
  )
}

function formatCheckAnswer(field: ProcessFieldSpec, value: ProcessAnswer | undefined) {
  if (value === '' || value == null) return '-'
  if (value === 'yes') return 'Yes'
  if (value === 'no') return 'No'
  return field.unit ? `${value} ${field.unit}` : String(value)
}

function answerTone(field: ProcessFieldSpec, value: ProcessAnswer | undefined) {
  if (value === 'yes') return 'text-[oklch(0.45_0.17_162)]'
  if (value === 'no' || (value != null && isOutOfRange(field, value))) return 'text-destructive'
  return ''
}

