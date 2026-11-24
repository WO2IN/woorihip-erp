'use client'

import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react'
import { useSearchParams } from 'next/navigation'
import { Check, ChevronDown, FileCheck, FileText, Info, Plus, Printer, Save, Search, Table2, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/components/auth/auth-context'
import { type ApprovalRequest } from '@/lib/approval'
import { ConfirmDeleteDialog } from '@/components/shared/confirm-delete-dialog'
import { BAND_BUTTON, BAND_BUTTON_PRIMARY, PAGE_SHELL, PageHeader } from '@/components/shared/page-header'
import { ShipmentDocFlowNav } from '@/components/shipment/shipment-doc-flow-nav'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { SearchableCombobox } from '@/components/ui/searchable-combobox'
import { getJsonAuthHeaders } from '@/lib/auth-client'
import { isShipmentBundleLocked } from '@/lib/shipment-bundle'
import { removeSheetDocument, saveSheetDocument } from '@/lib/sheet-document'
import { CERTIFICATE_TYPE } from '@/lib/file-types'
import { useEmbedPreview } from '@/hooks/use-embed-preview'
import { cn } from '@/lib/utils'

type Floor = '1' | '2' | '3'
type Mark = '' | 'OK' | 'NG'
type Judgment = '' | '합격' | '불합격'
const FLOORS = ['1', '2', '3'] as const

const VISUAL_ITEMS = [
  ['1', 'DISCOLORATION(변색)'],
  ['2', 'STAIN(얼룩)'],
  ['3', 'RUST(부식)'],
  ['4', 'CONTAMINATION(오염)'],
  ['5', 'BENT(변형)'],
  ['6', 'NO PLATING(미도금)'],
  ['7', 'LUMP(도금뭉침)'],
  ['8', 'CAMBER(휨)'],
  ['9', 'PLATING BURR(도금버)'],
  ['10', 'SCRATCH(스크래치)'],
] as const

const ADHESION_SPEC = '1.제품은 스카치 Tape에 완전\n밀착후 45도 각도로 순간적으로\n떼어낸다.(돌림 및 벗겨짐)\n2.테이프 시험이 안되는 제품은\n니퍼로 90도로 상,하측으로 도금면을\n깎아 벗겨짐이 없을것.'

type DimRow = {
  name: string
  spec: string
  lower: string
  upper: string
  cycle: string
  our1: string
  our2: string
  qty: string
  cust1: string
  cust2: string
  judge: Mark
}

type Report = {
  id: string
  floor: Floor
  done: boolean
  createdAt: string
  updatedAt: string
  customer: string
  product: string
  lotNo: string
  lotRange: string
  issuedOn: string
  spec: string
  material: string
  platingSpec: string
  sourceLotCardId: string
  lotSize: string
  visual: Mark[]
  dimensions: DimRow[]
  platingResult: Mark
  adhesionSpec: string
  adhesionResult: Mark
  ourWriter: string
  ourApprover: string
  customerWriter: string
  customerApprover: string
  judgment: Judgment
}

function todayKey() {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${month}-${day}`
}

function koDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}/.test(value)) return ''
  const [year, month, day] = value.slice(0, 10).split('-')
  return `${year}년${month}월${day}일`
}

function JudgmentStamp({ judgment, date }: { judgment: string; date: string }) {
  const fail = judgment === '불합격'
  const color = fail ? '#e11d48' : '#1d4ed8'
  return (
    <svg viewBox="0 0 120 120" className="h-[24mm] w-[24mm]" aria-label={`${fail ? '불합격' : '합격'} 도장`}>
      <circle cx="60" cy="60" r="56" fill="none" stroke={color} strokeWidth="4" />
      <circle cx="60" cy="60" r="49" fill="none" stroke={color} strokeWidth="1.1" />
      <text x="60" y="44" textAnchor="middle" fontSize={fail ? 15 : 20} fontWeight="800" fill={color} letterSpacing={fail ? 1 : 2}>{fail ? '불합격' : '합격'}</text>
      <text x="60" y="64" textAnchor="middle" fontSize="11" fontWeight="700" fill={color}>{date}</text>
      <text x="60" y="80" textAnchor="middle" fontSize="10" fontWeight="700" fill={color}>우리하이피(주)</text>
      <text x="60" y="96" textAnchor="middle" fontSize="11" fontWeight="800" fill={color} letterSpacing="1">Q.C</text>
    </svg>
  )
}

function emptyDim(): DimRow[] {
  const names = ['전폭', '간격', '도금폭']
  return Array.from({ length: 15 }, (_, index) => ({
    name: names[index] ?? '',
    spec: '',
    lower: '',
    upper: '',
    cycle: names[index] ? 'Reel/Lot' : '',
    our1: '',
    our2: '',
    qty: '',
    cust1: '',
    cust2: '',
    judge: '',
  }))
}

function dimJudge(spec: string, current: Mark): Mark {
  if (!spec.trim()) return ''
  return current === 'NG' ? 'NG' : 'OK'
}

function normalizeDim(value: unknown): DimRow[] {
  const rows = Array.isArray(value) ? value : []
  return emptyDim().map((base, index) => {
    const row = rows[index]
    if (!row || typeof row !== 'object') return base
    const item = row as Partial<DimRow>
    return {
      ...base,
      name: typeof item.name === 'string' ? item.name : base.name,
      spec: typeof item.spec === 'string' ? item.spec : '',
      lower: typeof item.lower === 'string' ? item.lower : '',
      upper: typeof item.upper === 'string' ? item.upper : '',
      cycle: typeof item.cycle === 'string' ? item.cycle : base.cycle,
      our1: typeof item.our1 === 'string' ? item.our1 : '',
      our2: typeof item.our2 === 'string' ? item.our2 : '',
      qty: typeof item.qty === 'string' ? item.qty : '',
      cust1: typeof item.cust1 === 'string' ? item.cust1 : '',
      cust2: typeof item.cust2 === 'string' ? item.cust2 : '',
      judge: dimJudge(typeof item.spec === 'string' ? item.spec : '', item.judge === 'NG' ? 'NG' : item.judge === 'OK' ? 'OK' : ''),
    }
  })
}

function emptyReport(): Report {
  const now = new Date().toISOString()
  return {
    id: crypto.randomUUID(),
    floor: '1',
    done: false,
    createdAt: now,
    updatedAt: now,
    customer: '',
    product: '',
    lotNo: '',
    lotRange: '',
    issuedOn: '',
    spec: '',
    material: '',
    platingSpec: '',
    sourceLotCardId: '',
    lotSize: '',
    visual: Array.from({ length: 10 }, () => 'OK'),
    dimensions: emptyDim(),
    platingResult: 'OK',
    adhesionSpec: ADHESION_SPEC,
    adhesionResult: 'OK',
    ourWriter: '',
    ourApprover: '',
    customerWriter: '',
    customerApprover: '',
    judgment: '',
  }
}

function normalizeReport(saved: Partial<Report> | null): Report {
  const base = emptyReport()
  if (!saved) return base
  const visual = Array.isArray(saved.visual) ? saved.visual : []
  return {
    ...base,
    ...saved,
    id: saved.id || base.id,
    floor: saved.floor === '2' || saved.floor === '3' ? saved.floor : '1',
    done: saved.done === true,
    judgment: saved.judgment === '합격' || saved.judgment === '불합격' ? saved.judgment : '',
    visual: Array.from({ length: 10 }, (_, index) => (visual[index] === 'NG' ? 'NG' : 'OK')),
    dimensions: normalizeDim(saved.dimensions),
    platingResult: saved.platingResult === 'NG' ? 'NG' : 'OK',
    adhesionResult: saved.adhesionResult === 'NG' ? 'NG' : 'OK',
    adhesionSpec: saved.adhesionSpec || ADHESION_SPEC,
    sourceLotCardId: typeof saved.sourceLotCardId === 'string' ? saved.sourceLotCardId : '',
  }
}

function signStep(approval: ApprovalRequest | null, slot: '작성' | '승인') {
  if (!approval) return undefined
  if (slot === '작성') return approval.steps.find((step) => !step.role) ?? approval.steps[0]
  return approval.steps.find((step) => step.role === 'approval')
}

function splitLotRange(lotRange: string) {
  const trimmed = lotRange.trim()
  const pair = trimmed.match(/^-?(\d+)\s*[~～\-]\s*(\d+)$/)
  if (pair) return { start: pair[1], end: pair[2] }
  const single = trimmed.match(/^-?(\d+)$/)
  if (single) return { start: single[1], end: '' }
  return { start: trimmed, end: '' }
}

function joinLotRange(start: string, end: string) {
  const from = start.trim()
  const to = end.trim()
  if (from && to) return `${from}~${to}`
  return from || to
}

function formatLot(lotNo: string, lotRange: string) {
  const date = lotNo.trim()
  const { start, end } = splitLotRange(lotRange)
  if (!start) return date
  const head = date ? `${date}-${start}` : start
  return end ? `${head} ~ ${end}` : head
}

function uniqueNames(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ko'))
}

function sortDimensions(values: string[]) {
  return [...values].sort((a, b) => {
    const left = a.match(/^(\d+(?:\.\d+)?)\s*[*x×X]\s*(\d+(?:\.\d+)?)/)
    const right = b.match(/^(\d+(?:\.\d+)?)\s*[*x×X]\s*(\d+(?:\.\d+)?)/)
    if (left && right) {
      const thickness = Number(left[1]) - Number(right[1])
      if (thickness) return thickness
      return Number(left[2]) - Number(right[2])
    }
    return a.localeCompare(b, 'ko')
  })
}

type PlatingLink = { company: string; product: string; material: string; specification: string; fullWidth: string; gap: string; plateWidth: string }

function matchedPlating(links: PlatingLink[], report: Pick<Report, 'customer' | 'product' | 'spec' | 'material' | 'platingSpec'>) {
  const product = report.product || report.spec
  const rows = links.filter((row) => (!report.customer || row.company === report.customer) && (!product || row.product === product) && (!report.material || row.material === report.material))
  return rows.find((row) => !report.platingSpec || row.specification === report.platingSpec) ?? rows[0] ?? null
}

function positiveMeasure(value: string) {
  const match = value.replace(/,/g, '').match(/\d+(?:\.\d+)?/)
  const number = match ? Number(match[0]) : 0
  return Number.isFinite(number) && number > 0 ? number : 0
}

function parseSizeSpec(spec: string) {
  const match = spec.trim().match(/^(\d+(?:\.\d+)?)\s*[*x×X]\s*(\d+(?:\.\d+)?)/)
  if (!match) return { thickness: '', fullWidth: '' }
  return { thickness: match[1], fullWidth: match[2] }
}

function configNames(body: { data?: unknown } | null) {
  if (!Array.isArray(body?.data)) return []
  return body.data.filter((item): item is string => typeof item === 'string' && item.trim() !== '')
}

function CatalogField({
  label,
  configName,
  options,
  value,
  onChange,
  disabled,
}: {
  label: string
  configName: string
  options: string[]
  value: string
  onChange: (value: string) => void
  disabled: boolean
}) {
  return (
    <label className="flex flex-col gap-1.5 text-sm font-medium">
      {label}
      <SearchableCombobox
        configName={configName}
        options={options}
        listAll
        value={value}
        onChange={onChange}
        placeholder="선택"
        creatable={false}
        disabled={disabled}
        appearance="form"
        className="h-10"
      />
    </label>
  )
}

function CellText({ value, className }: { value: string; className?: string }) {
  return <span className={cn('block px-0.5 text-center leading-tight', className)}>{value}</span>
}

const DIM_TEXT_FIELDS = [
  ['spec', '규격'],
  ['lower', '하한'],
  ['upper', '상한'],
  ['our1', '우리 1차'],
  ['our2', '우리 2차'],
  ['qty', '수량'],
  ['cust1', '고객 1차'],
  ['cust2', '고객 2차'],
] as const

const DIM_HEAD_CLASS = '!rounded-lg !border-0 !bg-slate-200 !px-1 !py-2 !text-[13px] !font-semibold !normal-case !tracking-normal !text-slate-900'
const DIM_NAMES = ['전폭', '간격', '도금폭']
const DIM_CYCLES = ['Reel/Lot']
const DIM_FIELD_CLASS = 'h-9 w-full rounded-lg border border-slate-300 bg-white px-2 text-center text-sm font-medium text-slate-950 outline-none transition placeholder:text-slate-500 focus:border-blue-500 focus:ring-2 focus:ring-blue-100'

function withCurrent(options: string[], value: string) {
  if (!value || options.includes(value)) return options
  return [value, ...options]
}

function focusDimCell(row: number, col: number) {
  const next = document.querySelector<HTMLElement>(`[data-dim-cell="${row}-${col}"]`)
  next?.focus()
  if (next instanceof HTMLInputElement) next.select()
}

function SoftSelect({
  value,
  options,
  placeholder,
  cell,
  onChange,
}: {
  value: string
  options: string[]
  placeholder: string
  cell: string
  onChange: (value: string) => void
}) {
  return (
    <div className="relative">
      <select
        data-dim-cell={cell}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={cn(DIM_FIELD_CLASS, 'appearance-none bg-white pr-6 text-slate-950', !value && 'font-normal text-slate-600')}
      >
        <option value="" className="bg-white text-slate-700">{placeholder}</option>
        {withCurrent(options, value).map((option) => (
          <option key={option} value={option} className="bg-white font-medium text-slate-950">{option}</option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute top-1/2 right-2 size-3.5 -translate-y-1/2 text-slate-600" />
    </div>
  )
}

function DimensionDialog({
  rows,
  onClose,
  onSave,
}: {
  rows: DimRow[]
  onClose: () => void
  onSave: (rows: DimRow[]) => void
}) {
  const [draft, setDraft] = useState(rows)

  function update(index: number, key: keyof DimRow, value: string) {
    setDraft((current) => current.map((row, rowIndex) => {
      if (rowIndex !== index) return row
      const next = { ...row, [key]: value }
      if (key === 'name' && value && !next.cycle) next.cycle = 'Reel/Lot'
      if (key === 'spec') next.judge = value.trim() ? (row.judge || 'OK') : ''
      return next
    }))
  }

  function onTextKeyDown(event: ReactKeyboardEvent<HTMLInputElement>, row: number, col: number) {
    if (event.key !== 'Enter' || event.nativeEvent.isComposing) return
    event.preventDefault()
    focusDimCell(event.shiftKey ? row - 1 : row + 1, col)
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent overlayClassName="z-[80]" className="z-[80] flex max-h-[90dvh] w-[min(96vw,76rem)] max-w-none flex-col gap-0 overflow-hidden p-0 sm:max-w-none">
        <DialogHeader className="flex-row items-center gap-2.5 border-b border-slate-100 px-5 py-4">
          <span className="flex size-8 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
            <Table2 className="size-4" />
          </span>
          <DialogTitle className="text-base font-bold text-slate-900">치수검사</DialogTitle>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-auto px-5 py-4">
          <table className="w-full min-w-[920px] border-separate border-spacing-x-1.5 border-spacing-y-1.5 text-center">
            <thead className="sticky top-0 z-10">
              <tr>
                <th className={cn('w-10', DIM_HEAD_CLASS)}>NO</th>
                <th className={cn('w-[7.5rem]', DIM_HEAD_CLASS)}>항목</th>
                {DIM_TEXT_FIELDS.slice(0, 3).map(([, label]) => (
                  <th key={label} className={DIM_HEAD_CLASS}>{label}</th>
                ))}
                <th className={cn('w-[7.5rem]', DIM_HEAD_CLASS)}>주기</th>
                {DIM_TEXT_FIELDS.slice(3).map(([, label]) => (
                  <th key={label} className={DIM_HEAD_CLASS}>{label}</th>
                ))}
                <th className={cn('w-[4.5rem]', DIM_HEAD_CLASS)}>판정</th>
              </tr>
            </thead>
            <tbody>
              {draft.map((row, index) => (
                <tr key={index}>
                  <td className="text-sm font-semibold text-slate-600">{index + 1}</td>
                  <td>
                    <SoftSelect
                      cell={`${index}-0`}
                      value={row.name}
                      options={DIM_NAMES}
                      placeholder="선택"
                      onChange={(name) => update(index, 'name', name)}
                    />
                  </td>
                  {DIM_TEXT_FIELDS.slice(0, 3).map(([key], fieldIndex) => (
                    <td key={key}>
                      <input
                        data-dim-cell={`${index}-${fieldIndex + 1}`}
                        value={row[key]}
                        onChange={(event) => update(index, key, event.target.value)}
                        onFocus={(event) => event.currentTarget.select()}
                        onKeyDown={(event) => onTextKeyDown(event, index, fieldIndex + 1)}
                        className={DIM_FIELD_CLASS}
                      />
                    </td>
                  ))}
                  <td>
                    <SoftSelect
                      cell={`${index}-4`}
                      value={row.cycle}
                      options={DIM_CYCLES}
                      placeholder="선택"
                      onChange={(cycle) => update(index, 'cycle', cycle)}
                    />
                  </td>
                  {DIM_TEXT_FIELDS.slice(3).map(([key], fieldIndex) => (
                    <td key={key}>
                      <input
                        data-dim-cell={`${index}-${fieldIndex + 5}`}
                        value={row[key]}
                        onChange={(event) => update(index, key, event.target.value)}
                        onFocus={(event) => event.currentTarget.select()}
                        onKeyDown={(event) => onTextKeyDown(event, index, fieldIndex + 5)}
                        className={DIM_FIELD_CLASS}
                      />
                    </td>
                  ))}
                  <td>
                    <SoftSelect
                      cell={`${index}-10`}
                      value={row.judge}
                      options={['OK', 'NG']}
                      placeholder="-"
                      onChange={(judge) => update(index, 'judge', judge)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-5 py-3">
          <p className="flex items-center gap-1.5 text-xs text-slate-400">
            <Info className="size-3.5 shrink-0" />
            항목을 고르고 측정값을 입력합니다. Enter는 다음 행, Shift+Enter는 이전 행입니다.
          </p>
          <div className="flex gap-2">
            <Button type="button" variant="outline" className="h-9 rounded-lg px-4" onClick={onClose}>취소</Button>
            <Button type="button" className="h-9 rounded-lg bg-blue-600 px-4 text-white hover:bg-blue-700" onClick={() => onSave(draft)}>
              <Save className="size-4" />
              저장
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function MarkText({ value }: { value: Mark }) {
  return <span className="text-[8px] font-bold print:text-[10px]">{value}</span>
}

function ReportCatalog({
  reports,
  onOpen,
  onDelete,
  canDelete,
  openLocked = false,
}: {
  reports: Report[]
  onOpen: (report: Report) => void
  onDelete: (report: Report) => void
  canDelete: boolean
  openLocked?: boolean
}) {
  const [query, setQuery] = useState('')
  const [floorFilter, setFloorFilter] = useState<'all' | Floor>('all')
  const keyword = query.trim().toLowerCase()
  const rows = reports
    .filter((item) => floorFilter === 'all' || item.floor === floorFilter)
    .filter((item) => {
      if (!keyword) return true
      return [item.customer, item.product, item.spec, item.lotNo, koDate(item.issuedOn)].some((value) => value.toLowerCase().includes(keyword))
    })
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
        <div className="flex h-9 items-center gap-0.5 rounded-lg border bg-muted/30 p-1" role="tablist" aria-label="목록 층">
          {(['all', ...FLOORS] as const).map((item) => (
            <button
              key={item}
              type="button"
              role="tab"
              aria-selected={floorFilter === item}
              onClick={() => setFloorFilter(item)}
              className={cn('h-full rounded-md px-3 text-[15px] font-semibold', floorFilter === item ? 'bg-slate-900 text-white' : 'text-slate-500 hover:bg-card')}
            >
              {item === 'all' ? '전체' : `${item}층`}
            </button>
          ))}
        </div>
        <label className="relative min-w-56 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="고객, 품명, 규격, LOT 검색"
            className="h-9 w-full rounded-lg border border-input bg-background pr-3 pl-9 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </label>
      </div>
      {rows.length === 0 ? (
        <div className="flex h-56 flex-col items-center justify-center gap-3 text-slate-400">
          <FileText className="h-12 w-12 opacity-25" />
          <p className="text-sm">{keyword || floorFilter !== 'all' ? '조건에 맞는 출하성적서가 없습니다.' : '완료된 출하성적서가 없습니다.'}</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <div className="min-w-[760px]">
            <div className="grid grid-cols-[1.2fr_1.2fr_1fr_1fr_0.8fr_0.5fr_4.5rem] gap-3 border-b bg-muted px-4 py-2 text-sm font-semibold text-muted-foreground">
              <span>고객</span>
              <span>품명</span>
              <span>규격</span>
              <span>LOT</span>
              <span>발행일</span>
              <span>층</span>
              <span />
            </div>
            {rows.map((item) => (
              <div key={item.id} className={cn('grid grid-cols-[1.2fr_1.2fr_1fr_1fr_0.8fr_0.5fr_4.5rem] items-center gap-3 border-b border-border/60 px-4 py-2.5 text-[15px] last:border-b-0', !openLocked && 'hover:bg-muted/40')}>
                <button
                  type="button"
                  disabled={openLocked}
                  onClick={() => { if (!openLocked) onOpen(item) }}
                  className={cn('contents text-left', openLocked && 'cursor-default opacity-60')}
                >
                  <span className="truncate font-semibold text-foreground">{item.customer || '출하성적서'}</span>
                  <span className="truncate text-foreground">{item.product || '-'}</span>
                  <span className="truncate text-muted-foreground">{item.spec || '-'}</span>
                  <span className="truncate text-muted-foreground">{formatLot(item.lotNo, item.lotRange) || '-'}</span>
                  <span className="text-muted-foreground">{koDate(item.issuedOn) || '-'}</span>
                  <span className="font-semibold text-foreground">{item.floor}층</span>
                </button>
                {canDelete ? (
                  <Button type="button" variant="outline" size="sm" className="h-7 px-2 text-[14px]" onClick={() => onDelete(item)}>
                    <Trash2 className="h-3.5 w-3.5" />
                    삭제
                  </Button>
                ) : <span />}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function ProductDrawing({ spec, platingSpec, fullWidth, gap, plateWidth, className }: { spec: string; platingSpec: string; fullWidth: string; gap: string; plateWidth: string; className?: string }) {
  const match = spec.trim().match(/^(\d+(?:\.\d+)?)\s*[*x×X]\s*(\d+(?:\.\d+)?)/)
  const thickness = match?.[1] ?? ''
  const width = fullWidth || match?.[2] || ''
  if (/Au|금/.test(platingSpec) || gap || plateWidth) {
    return <GoldDrawing spec={spec} fullWidth={width} gap={gap} plateWidth={plateWidth} className={className} />
  }
  return <StripDrawing spec={spec} thickness={thickness} width={width} className={className} />
}

function StripDrawing({ spec, thickness, width, className }: { spec: string; thickness: string; width: string; className?: string }) {
  const x = 52
  const y = 26
  const face = 58
  const height = 52
  const dx = 6
  const dy = -4
  const right = x + face
  const bottom = y + height
  const edgeX = right + dx
  const edgeTop = y + dy
  const edgeBottom = bottom + dy
  const thickY = y + dy / 2
  const dimX = edgeX + 5
  const topFace = `${x},${y} ${x + dx},${edgeTop} ${edgeX},${edgeTop} ${right},${y}`
  const side = `${right},${y} ${edgeX},${edgeTop} ${edgeX},${edgeBottom} ${right},${bottom}`
  return (
    <svg viewBox="0 0 168 96" preserveAspectRatio="xMidYMid meet" className={cn('mx-auto block h-[98%] w-full min-h-[30mm]', className)} fontFamily="ui-sans-serif, system-ui, sans-serif">
      {spec && <text x={x + (face + dx) / 2} y="12" textAnchor="middle" fontSize="8" fill="#1e40af">{spec}</text>}
      <polygon points={topFace} fill="#dbeafe" stroke="#1e3a8a" strokeWidth="1.1" strokeLinejoin="miter" />
      <polygon points={side} fill="#bfdbfe" stroke="#1e3a8a" strokeWidth="1.1" strokeLinejoin="miter" />
      <rect x={x} y={y} width={face} height={height} fill="#ffffff" stroke="#1e3a8a" strokeWidth="1.1" />
      {thickness && (
        <text x={x - 3} y={thickY} textAnchor="end" dominantBaseline="middle" fontSize="8" fill="#1e3a8a">{thickness}</text>
      )}
      {width && (
        <g stroke="#c2410c" fill="#c2410c">
          <line x1={edgeX} y1={edgeTop} x2={dimX} y2={edgeTop} strokeWidth="0.45" />
          <line x1={edgeX} y1={edgeBottom} x2={dimX} y2={edgeBottom} strokeWidth="0.45" />
          <line x1={dimX} y1={edgeTop} x2={dimX} y2={edgeBottom} strokeWidth="0.55" />
          <text x={dimX + 2.5} y={(edgeTop + edgeBottom) / 2} fontSize="8" stroke="none" dominantBaseline="middle">{width}</text>
        </g>
      )}
    </svg>
  )
}

function GoldDrawing({ spec, fullWidth, gap, plateWidth, className }: { spec: string; fullWidth: string; gap: string; plateWidth: string; className?: string }) {
  const total = positiveMeasure(fullWidth)
  const band = positiveMeasure(plateWidth)
  const space = positiveMeasure(gap)
  const top = 10
  const height = 72
  const left = 20
  const boxWidth = 64
  const bottom = top + height
  const basis = total || band + space
  let bandHeight = 12
  let gapHeight = 16
  if (basis > 0 && (band > 0 || space > 0)) {
    bandHeight = band > 0 ? (band / basis) * height : 12
    gapHeight = space > 0 ? (space / basis) * height : 16
    const limit = height - 12
    if (bandHeight + gapHeight > limit) {
      const scale = limit / (bandHeight + gapHeight)
      bandHeight *= scale
      gapHeight *= scale
    }
    bandHeight = Math.max(band > 0 ? 10 : 0, bandHeight)
  }
  const bandBottom = bottom - gapHeight
  const bandTop = bandBottom - bandHeight
  const bodyHeight = Math.max(8, bandTop - top)
  const labelY = top + bodyHeight / 2 + 2
  const boxRight = left + boxWidth
  return (
    <svg viewBox="0 0 168 94" preserveAspectRatio="xMidYMid meet" className={cn('mx-auto block h-[98%] w-full min-h-[30mm]', className)} fontFamily="ui-sans-serif, system-ui, sans-serif">
      <defs>
        <linearGradient id="gold-band-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#fef3c7" />
          <stop offset="100%" stopColor="#facc15" />
        </linearGradient>
      </defs>
      <rect x={left} y={top} width={boxWidth} height={height} fill="#ffffff" stroke="#1e40af" strokeWidth="1" />
      <rect x={left + 1} y={top + 1} width={boxWidth - 2} height={bodyHeight - 1} fill="#f8fafc" />
      {bandHeight > 0 && (
        <rect x={left + 1} y={bandTop} width={boxWidth - 2} height={bandHeight} fill="url(#gold-band-fill)" stroke="#d97706" strokeWidth="0.5" />
      )}
      {gapHeight > 0.5 && (
        <rect x={left + 1} y={bandBottom} width={boxWidth - 2} height={gapHeight - 1} fill="#f1f5f9" />
      )}
      {spec && <text x={left + boxWidth / 2} y={labelY} textAnchor="middle" fontSize="8" fill="#1e3a8a">{spec}</text>}
      {plateWidth && bandHeight > 0 && <DimensionSpan boxRight={boxRight} x={boxRight + 5} y1={bandTop} y2={bandBottom} label={plateWidth} />}
      {gap && gapHeight > 0.5 && <DimensionSpan boxRight={boxRight} x={boxRight + 13} y1={bandBottom} y2={bottom} label={gap} />}
      {fullWidth && <DimensionSpan boxRight={boxRight} x={boxRight + 21} y1={top} y2={bottom} label={fullWidth} />}
    </svg>
  )
}

function DimensionSpan({ boxRight, x, y1, y2, label }: { boxRight: number; x: number; y1: number; y2: number; label: string }) {
  if (!label || y2 - y1 < 0.5) return null
  const mid = (y1 + y2) / 2
  const span = y2 - y1
  const fontSize = span < 11 ? 7 : 7.6
  const textY = span < 11 ? y1 - 1.5 : mid
  return (
    <g stroke="#c2410c" fill="none">
      <line x1={boxRight} y1={y1} x2={x} y2={y1} strokeWidth="0.45" />
      <line x1={boxRight} y1={y2} x2={x} y2={y2} strokeWidth="0.45" />
      <line x1={x} y1={y1} x2={x} y2={y2} strokeWidth="0.55" />
      <text x={x + 2.5} y={textY} fontSize={fontSize} fill="#c2410c" stroke="none" dominantBaseline={span < 11 ? 'auto' : 'middle'}>{label}</text>
    </g>
  )
}

export function OutgoingReportView() {
  const searchParams = useSearchParams()
  const bundleLock = isShipmentBundleLocked(searchParams)
  const { user, loading: authLoading } = useAuth()
  const canWrite = user?.role === 'editor' || user?.role === 'admin'
  const [reports, setReports] = useState<Report[]>([])
  const [activeId, setActiveId] = useState('')
  const [screen, setScreen] = useState<'edit' | 'list'>('edit')
  const [floor, setFloor] = useState<Floor>('1')
  const [ready, setReady] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<Report | null>(null)
  const [approval, setApproval] = useState<ApprovalRequest | null>(null)
  const [approvalTick, setApprovalTick] = useState(0)
  const [companies, setCompanies] = useState<string[]>([])
  const [links, setLinks] = useState<PlatingLink[]>([])
  const [previewZoom, setPreviewZoom] = useState(100)
  const [dimensionOpen, setDimensionOpen] = useState(false)
  const previewDrag = useRef<{ x: number; y: number; left: number; top: number; pointerId: number } | null>(null)
  const savedSnapshot = useRef<Map<string, string>>(new Map())
  const articleRef = useRef<HTMLElement>(null)
  const [finishing, setFinishing] = useState(false)
  const reportsRef = useRef(reports)
  const saveQueue = useRef(Promise.resolve())
  reportsRef.current = reports
  const report = reports.find((item) => item.id === activeId) ?? null
  const embed = useEmbedPreview(searchParams, !!report)

  useEffect(() => {
    let stop = false
    async function load() {
      const response = await fetch('/api/outgoing-reports', { cache: 'no-store' })
      const body = await response.json().catch(() => null)
      if (stop) return
      const loaded = response.ok && Array.isArray(body?.data)
        ? (body.data as Partial<Report>[]).map((item) => normalizeReport(item)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        : []
      savedSnapshot.current = new Map(loaded.map((item) => [item.id, JSON.stringify(item)]))
      setReports(loaded)
      setFloor('1')
      setActiveId('')
      setReady(true)
      if (!response.ok) toast.error('출하성적서를 불러오지 못했습니다.')
    }
    void load()
    return () => { stop = true }
  }, [])

  const openedQuery = useRef(false)
  useEffect(() => {
    if (!ready || openedQuery.current) return
    const id = searchParams.get('open')
    if (!id) {
      openedQuery.current = true
      return
    }
    const found = reports.find((item) => item.id === id)
    if (!found) return
    openedQuery.current = true
    setActiveId(found.id)
    setFloor(found.floor)
    setScreen('edit')
  }, [ready, reports, searchParams])

  useEffect(() => {
    let stop = false
    async function loadLists() {
      const [companyRes, platingInfoRes] = await Promise.all([
        fetch('/api/config?name=companies', { cache: 'no-store' }).then((response) => response.json()).catch(() => null),
        fetch('/api/plating-info', { cache: 'no-store' }).then((response) => response.json()).catch(() => null),
      ])
      if (stop) return
      setCompanies(configNames(companyRes))
      const rows = Array.isArray(platingInfoRes?.rows) ? platingInfoRes.rows as Partial<PlatingLink & { gold?: string; nickel?: string }>[] : []
      setLinks(rows.flatMap((row) => {
        const company = row.company?.trim() || ''
        const product = row.product?.trim() || ''
        if (!company || !product) return []
        const specification = row.specification?.trim() || [row.gold, row.nickel].filter(Boolean).join(' / ')
        return [{
          company,
          product,
          material: row.material?.trim() || '',
          specification,
          fullWidth: row.fullWidth?.trim() || '',
          gap: row.gap?.trim() || '',
          plateWidth: row.plateWidth?.trim() || '',
        }]
      }))
    }
    void loadLists()
    return () => { stop = true }
  }, [])

  useEffect(() => {
    // 미리보기(embed)는 보기만 한다. 열면서 자동으로 채워지는 값도 저장하지 않는다.
    if (!ready || authLoading || !canWrite || embed) return
    const timer = window.setTimeout(() => {
      saveQueue.current = saveQueue.current.then(async () => {
        const current = reportsRef.current
        const nextIds = new Set(current.map((item) => item.id))
        const removed = [...savedSnapshot.current.keys()].filter((id) => !nextIds.has(id))
        const changed = current.filter((item) => savedSnapshot.current.get(item.id) !== JSON.stringify(item))
        if (removed.length === 0 && changed.length === 0) return
        const results = await Promise.all([
          ...removed.map((id) => fetch('/api/outgoing-reports', {
            method: 'DELETE',
            headers: getJsonAuthHeaders(),
            body: JSON.stringify({ id }),
          })),
          ...changed.map((item) => fetch('/api/outgoing-reports', {
            method: 'PUT',
            headers: getJsonAuthHeaders(),
            body: JSON.stringify(item),
          })),
        ])
        if (!results.every((response) => response.ok)) {
          toast.error('출하성적서를 저장하지 못했습니다.')
          return
        }
        for (const id of removed) savedSnapshot.current.delete(id)
        for (const item of changed) savedSnapshot.current.set(item.id, JSON.stringify(item))
      }).catch(() => {
        toast.error('출하성적서를 저장하지 못했습니다.')
      })
    }, 400)
    return () => window.clearTimeout(timer)
  }, [reports, ready, authLoading, canWrite, embed])

  useEffect(() => {
    const onBefore = () => document.body.classList.add('outgoing-report-print')
    const onAfter = () => document.body.classList.remove('outgoing-report-print')
    window.addEventListener('beforeprint', onBefore)
    window.addEventListener('afterprint', onAfter)
    return () => {
      window.removeEventListener('beforeprint', onBefore)
      window.removeEventListener('afterprint', onAfter)
    }
  }, [])

  useEffect(() => {
    if (!ready) return
    const today = todayKey()
    setReports((current) => {
      let changed = false
      const next = current.map((item) => {
        if (item.issuedOn) return item
        changed = true
        return { ...item, issuedOn: today, updatedAt: new Date().toISOString() }
      })
      return changed ? next : current
    })
  }, [ready])

  useEffect(() => {
    if (!ready || !report?.id) {
      setApproval(null)
      return
    }
    const sheetId = report.id
    let stop = false
    async function loadApproval() {
      const response = await fetch('/api/approvals', { cache: 'no-store' })
      const data = await response.json().catch(() => null)
      if (stop || !response.ok || !Array.isArray(data?.data)) return
      const rows = (data.data as ApprovalRequest[])
        .filter((item) => item.target?.kind === 'outgoing-report' && item.target.sheetId === sheetId && item.status !== 'cancelled')
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      setApproval(rows[0] ?? null)
    }
    void loadApproval()
    return () => { stop = true }
  }, [ready, report?.id, approvalTick])

  useEffect(() => {
    if (!ready || !activeId) return
    const current = reportsRef.current.find((item) => item.id === activeId)
    if (!current) return
    const link = matchedPlating(links, current)
    const parsed = parseSizeSpec(current.product || current.spec)
    const specs = link
      ? [link.fullWidth || parsed.fullWidth, link.gap, link.plateWidth]
      : [parsed.fullWidth, '', '']
    const nextDimensions = current.dimensions.map((row, index) => {
      const spec = index < 3 ? specs[index] ?? '' : row.spec
      return { ...row, spec, judge: dimJudge(spec, row.judge) }
    })
    const unchanged = nextDimensions.every((row, index) => row.spec === current.dimensions[index]?.spec && row.judge === current.dimensions[index]?.judge)
    if (unchanged) return
    patch({ dimensions: nextDimensions })
  }, [ready, activeId, links, report?.customer, report?.product, report?.spec, report?.material, report?.platingSpec])

  /**
   * 완료하면 서식을 PDF로 만들어 문서탐색기(출하성적서)에 저장하고 목록으로 넘어간다.
   * 완료를 취소하면 문서탐색기에 저장했던 문서도 지운다.
   */
  async function toggleDone() {
    if (!report || finishing) return
    setFinishing(true)
    try {
      if (report.done) {
        patch({ done: false })
        const removed = await removeSheetDocument(CERTIFICATE_TYPE, report.id)
        if (!removed.ok) toast.error(removed.error)
        return
      }
      const saved = articleRef.current
        ? await saveSheetDocument({
            node: articleRef.current,
            documentType: CERTIFICATE_TYPE,
            sourceSheetId: report.id,
            company: report.customer,
            product: report.product || report.spec,
            lotStart: report.lotNo,
            material: report.material,
            specification: report.platingSpec,
            issueDate: report.issuedOn,
            floor: report.floor,
          })
        : { ok: false as const, error: '출하성적서 화면을 찾지 못해 문서탐색기에 저장하지 못했습니다.' }
      patch({ done: true })
      const sibling = reports.find((item) => item.id !== report.id && item.floor === report.floor && !item.done)
      setActiveId(sibling?.id ?? '')
      setScreen('list')
      if (saved.ok) toast.success('문서탐색기에 출하성적서로 저장했습니다.')
      else toast.error(`${saved.error} 완료는 처리됐으니 완료 취소 후 다시 완료하면 다시 저장합니다.`)
    } finally {
      setFinishing(false)
    }
  }

  function patch(partial: Partial<Report>) {
    setReports((current) => current.map((item) => item.id === activeId ? { ...item, ...partial, updatedAt: new Date().toISOString() } : item))
  }

  function kept(options: string[], current: string) {
    if (current && options.includes(current)) return current
    return options.length === 1 ? options[0] : ''
  }

  function chooseCustomer(customer: string) {
    const rows = customer ? links.filter((row) => row.company === customer) : []
    const products = sortDimensions(uniqueNames(rows.map((row) => row.product)))
    const product = kept(products, report?.product || report?.spec || '')
    const materials = uniqueNames(rows.map((row) => row.material))
    const plating = uniqueNames(rows.map((row) => row.specification))
    patch({
      customer,
      product,
      spec: product,
      material: kept(materials, report?.material ?? ''),
      platingSpec: kept(plating, report?.platingSpec ?? ''),
    })
  }

  function chooseProduct(product: string) {
    if (!report) return
    const rows = links.filter((row) => (!report.customer || row.company === report.customer) && (!product || row.product === product))
    const materials = uniqueNames(rows.map((row) => row.material))
    const plating = uniqueNames(rows.map((row) => row.specification))
    patch({
      product,
      spec: product,
      material: kept(materials, report.material),
      platingSpec: kept(plating, report.platingSpec),
    })
  }

  function chooseMaterial(material: string) {
    if (!report) return
    const product = report.product || report.spec
    const rows = links.filter((row) => (!report.customer || row.company === report.customer) && (!product || row.product === product) && (!material || row.material === material))
    const plating = uniqueNames(rows.map((row) => row.specification))
    patch({ material, platingSpec: kept(plating, report.platingSpec) })
  }

  const scoped = report?.customer ? links.filter((row) => row.company === report.customer) : links
  const pickedProduct = report?.product || report?.spec || ''
  const itemRows = scoped.filter((row) => !pickedProduct || row.product === pickedProduct)
  const productOptions = sortDimensions(uniqueNames(scoped.map((row) => row.product)))
  const materialOptions = uniqueNames(itemRows.map((row) => row.material))
  const platingOptions = uniqueNames(itemRows.filter((row) => !report?.material || row.material === report.material).map((row) => row.specification))

  const floorReports = reports.filter((item) => item.floor === floor && !item.done).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  const doneReports = reports.filter((item) => item.done)
  function startPreviewDrag(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return
    const target = event.target as HTMLElement
    if (target.closest('input, textarea, select, button, a, [role="button"]')) return
    event.preventDefault()
    const scroller = event.currentTarget
    previewDrag.current = { x: event.clientX, y: event.clientY, left: scroller.scrollLeft, top: scroller.scrollTop, pointerId: event.pointerId }
    scroller.setPointerCapture(event.pointerId)
  }

  function movePreviewDrag(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = previewDrag.current
    if (!drag || drag.pointerId !== event.pointerId) return
    const scroller = event.currentTarget
    scroller.scrollLeft = drag.left - (event.clientX - drag.x)
    scroller.scrollTop = drag.top - (event.clientY - drag.y)
  }

  function endPreviewDrag(event: ReactPointerEvent<HTMLDivElement>) {
    if (previewDrag.current?.pointerId !== event.pointerId) return
    previewDrag.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  }

  const locked = !canWrite

  function createReport() {
    const next = { ...emptyReport(), floor, issuedOn: todayKey() }
    setReports((current) => [next, ...current])
    setActiveId(next.id)
  }

  function openListed(item: Report) {
    if (bundleLock) return
    setFloor(item.floor)
    setActiveId(item.id)
    setScreen('edit')
  }

  function openFloor(nextFloor: Floor) {
    setFloor(nextFloor)
    if (bundleLock) return
    const onFloor = reports.filter((item) => item.floor === nextFloor && !item.done).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    setActiveId(onFloor[0]?.id ?? '')
  }

  function removeReport() {
    if (!pendingDelete) return
    const next = reports.filter((item) => item.id !== pendingDelete.id)
    setReports(next)
    if (activeId === pendingDelete.id) {
      const sibling = next.find((item) => item.floor === pendingDelete.floor && !item.done) ?? next.find((item) => !item.done) ?? next[0]
      setActiveId(sibling?.id ?? '')
      if (sibling) setFloor(sibling.floor)
    }
    setPendingDelete(null)
  }

  const leftVisual = VISUAL_ITEMS.slice(0, 5)
  const rightVisual = VISUAL_ITEMS.slice(5)

  return (
    <div className={cn(PAGE_SHELL, 'outgoing-report-screen')}>
      <div className="no-print">
        <PageHeader
          tone="teal"
          icon={FileCheck}
          eyebrow="재고 관리"
          title="출하성적서"
          description="고객명, 품명, 로트번호를 적으면 오른쪽 미리보기에 들어갑니다. 완료하면 목록으로 넘어갑니다."
          actions={screen === 'edit' ? (
            <>
              {canWrite && (
                <Button
                  variant="outline"
                  className={BAND_BUTTON}
                  disabled={!report || finishing}
                  onClick={() => void toggleDone()}
                >
                  <Check className="h-4 w-4" /> {finishing ? '저장 중…' : report?.done ? '완료 취소' : '완료'}
                </Button>
              )}
              <Button className={BAND_BUTTON_PRIMARY} disabled={!report} onClick={() => window.print()}>
                <Printer className="h-4 w-4" /> 인쇄
              </Button>
            </>
          ) : undefined}
        />
        <ShipmentDocFlowNav step="outgoing" />
        <div role="tablist" aria-label="출하성적서 화면" className="mt-4">
          <div className="flex gap-1">
            {([['edit', '작성'], ['list', '목록']] as const).map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={screen === id}
                disabled={bundleLock && id === 'list'}
                title={bundleLock && id === 'list' ? '이어쓰기 중에는 완료 목록을 열 수 없습니다' : undefined}
                onClick={() => { if (bundleLock && id === 'list') return; setScreen(id) }}
                className={cn(
                  bundleLock && id === 'list' && 'cursor-not-allowed opacity-40',
                  'border-b-[3px] px-4 py-2.5 text-[15px] font-medium',
                  screen === id
                    ? 'border-slate-950 text-slate-950 dark:border-white dark:text-white'
                    : 'border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100',
                )}
              >
                {label}
                {id === 'list' && <span className="ml-2 text-xs tabular-nums text-slate-400">{doneReports.length}</span>}
              </button>
            ))}
          </div>
          <div className="h-[2px] bg-slate-700 dark:bg-white/70" />
        </div>
      </div>

      {screen === 'list' ? (
        <ReportCatalog reports={doneReports} onOpen={openListed} onDelete={setPendingDelete} canDelete={canWrite} openLocked={bundleLock} />
      ) : (
        <div className="outgoing-report-work flex min-h-[calc(100vh-13rem)] items-stretch gap-4">
          <aside className="no-print flex min-h-0 w-80 shrink-0 flex-col overflow-hidden rounded-xl border bg-card shadow-sm">
            <div className="grid grid-cols-3 gap-1 border-b p-2" role="tablist" aria-label="층">
              {FLOORS.map((item) => (
                <button
                  key={item}
                  type="button"
                  role="tab"
                  aria-selected={floor === item}
                  onClick={() => openFloor(item)}
                  className={cn('h-8 rounded-md text-[15px] font-semibold', floor === item ? 'bg-slate-900 text-white' : 'text-slate-500 hover:bg-slate-100')}
                >
                  {item}층
                </button>
              ))}
            </div>
            {canWrite && (
              <div className="border-b p-2">
                <Button type="button" variant="outline" className="h-8 w-full text-[14px]" onClick={createReport}>
                  <Plus className="h-3.5 w-3.5" />
                  {floor}층 출하성적서 추가
                </Button>
              </div>
            )}
            <div className="min-h-0 flex-1 overflow-y-auto p-2">
              {floorReports.length === 0 ? (
                <p className="px-2 py-6 text-center text-[14px] text-slate-400">{floor}층에 작성 중인 출하성적서가 없습니다</p>
              ) : floorReports.map((item) => {
                const selected = item.id === report?.id
                return (
                  <div key={item.id} className={cn('mb-1 flex items-stretch rounded-lg', selected ? 'bg-slate-900 text-white' : !bundleLock && 'hover:bg-slate-100')}>
                    <button
                      type="button"
                      disabled={bundleLock && !selected}
                      onClick={() => { if (!bundleLock || selected) setActiveId(item.id) }}
                      className={cn('min-w-0 flex-1 px-2.5 py-2 text-left', bundleLock && !selected && 'cursor-not-allowed opacity-50')}
                    >
                      <span className="block truncate text-[15px] font-semibold">{item.customer || item.product || '출하성적서'}</span>
                      <span className={cn('mt-1 block text-[12px]', selected ? 'text-white/70' : 'text-slate-400')}>
                        {[item.spec, koDate(item.issuedOn) || '발행일 없음'].filter(Boolean).join(' · ')}
                      </span>
                    </button>
                    {canWrite && (
                      <button type="button" aria-label="삭제" onClick={() => setPendingDelete(item)} className={cn('px-2', selected ? 'text-white/80 hover:text-white' : 'text-slate-400 hover:text-red-600')}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          </aside>

          {!report && (
            <div className="no-print flex min-h-0 flex-1 items-center justify-center rounded-xl border border-dashed border-slate-300 text-sm text-slate-400">
              왼쪽에서 출하성적서를 고르거나 새로 추가합니다
            </div>
          )}

          {report && (
            <div className="outgoing-report-preview flex min-h-0 min-w-0 flex-1 items-start gap-4">
              <section className="no-print w-72 shrink-0 self-start rounded-xl border bg-card p-4 shadow-sm">
                <h2 className="text-sm font-bold text-slate-900">성적서 정보</h2>
                <p className="mt-1 text-xs text-slate-500">고객명을 고르면 그 업체의 품명, 재질, 도금스펙만 나옵니다.</p>
                <div className="mt-4 flex flex-col gap-3">
                  <CatalogField label="고객명" configName="companies" options={companies} value={report.customer} onChange={chooseCustomer} disabled={locked} />
                  <CatalogField label="품명" configName="products" options={productOptions} value={report.product || report.spec} onChange={chooseProduct} disabled={locked} />
                  <label className="flex flex-col gap-1.5 text-sm font-medium">
                    로트번호
                    <div className="flex items-center gap-1">
                      <Input value={report.lotNo} disabled={locked} onChange={(event) => patch({ lotNo: event.target.value })} placeholder="20261119" className="h-10 min-w-0 flex-1" />
                      <span className="text-slate-400">-</span>
                      <Input value={splitLotRange(report.lotRange).start} disabled={locked} inputMode="numeric" onChange={(event) => patch({ lotRange: joinLotRange(event.target.value, splitLotRange(report.lotRange).end) })} placeholder="1" className="h-10 w-12 px-1 text-center" />
                      <span className="text-slate-400">~</span>
                      <Input value={splitLotRange(report.lotRange).end} disabled={locked} inputMode="numeric" onChange={(event) => patch({ lotRange: joinLotRange(splitLotRange(report.lotRange).start, event.target.value) })} placeholder="9" className="h-10 w-12 px-1 text-center" />
                    </div>
                  </label>
                  <label className="flex flex-col gap-1.5 text-sm font-medium">
                    발행일자
                    <Input type="date" value={report.issuedOn} disabled={locked} onChange={(event) => patch({ issuedOn: event.target.value })} className="h-10" />
                  </label>
                  <CatalogField label="재질" configName="materials" options={materialOptions} value={report.material} onChange={chooseMaterial} disabled={locked} />
                  <CatalogField label="도금스펙" configName="specifications" options={platingOptions} value={report.platingSpec} onChange={(platingSpec) => patch({ platingSpec })} disabled={locked} />
                  <label className="flex flex-col gap-1.5 text-sm font-medium">
                    수량
                    <Input value={report.lotSize} disabled={locked} onChange={(event) => patch({ lotSize: event.target.value })} className="h-10" />
                  </label>
                  <Button type="button" variant="outline" className="h-10" disabled={locked} onClick={() => setDimensionOpen(true)}>
                    치수검사 수정
                  </Button>
                </div>
              </section>
              <div className="flex min-h-0 min-w-0 flex-1 flex-col self-stretch">
                <div className="no-print mb-2 flex shrink-0 items-center justify-between">
                  <p className="text-sm font-bold text-slate-900">미리보기</p>
                  <div className="flex items-center gap-1">
                    <button type="button" aria-label="미리보기 축소" className="h-7 w-7 rounded border border-slate-300 text-sm font-semibold text-slate-700 hover:bg-slate-100" onClick={() => setPreviewZoom((value) => Math.max(60, value - 10))}>−</button>
                    <span className="w-11 text-center text-xs tabular-nums text-slate-600">{previewZoom}%</span>
                    <button type="button" aria-label="미리보기 확대" className="h-7 w-7 rounded border border-slate-300 text-sm font-semibold text-slate-700 hover:bg-slate-100" onClick={() => setPreviewZoom((value) => Math.min(160, value + 10))}>+</button>
                  </div>
                </div>
                <div
                  className="outgoing-sheet-scroll min-h-0 flex-1 cursor-grab overflow-auto active:cursor-grabbing"
                  onPointerDown={startPreviewDrag}
                  onPointerMove={movePreviewDrag}
                  onPointerUp={endPreviewDrag}
                  onPointerCancel={endPreviewDrag}
                >
              <article ref={articleRef} inert={embed} style={{ zoom: previewZoom / 100 }} className="outgoing-sheet mx-auto flex w-[210mm] shrink-0 flex-col bg-white px-[4mm] py-[3mm] text-[8px] text-slate-900 shadow-md ring-1 ring-black/10 print:h-[297mm] print:shadow-none print:ring-0">
                <div className="flex items-center border border-blue-800">
                  <img src="/logo.png" alt="WOORI" className="h-8 w-auto px-2 print:h-12" />
                  <h2 className="flex-1 text-center text-[16px] font-extrabold tracking-wide text-blue-900 print:text-[22px]">Quality Assurance Report</h2>
                </div>
                <table className="w-full border-collapse text-center">
                  <tbody>
                    <tr>
                      <th className="border border-blue-800 bg-blue-50 py-0.5">CUSTOMER(고객명)</th>
                      <th className="border border-blue-800 bg-blue-50">DESCRIPTION(품명)</th>
                      <th className="border border-blue-800 bg-blue-50">LOT NO(로트번호)</th>
                      <th className="border border-blue-800 bg-blue-50">ISSUED DATE(발행일자)</th>
                    </tr>
                    <tr className="h-5">
                      <td className="border border-blue-800"><CellText value={report.customer} /></td>
                      <td className="border border-blue-800"><CellText value={report.product} /></td>
                      <td className="border border-blue-800"><CellText value={formatLot(report.lotNo, report.lotRange)} /></td>
                      <td className="border border-blue-800"><CellText value={report.issuedOn} /></td>
                    </tr>
                    <tr>
                      <th colSpan={2} className="border border-blue-800 bg-blue-50 py-0.5">재질</th>
                      <th className="border border-blue-800 bg-blue-50 py-0.5">도금스펙</th>
                      <th className="border border-blue-800 bg-blue-50">LOT SIZE(수량)</th>
                    </tr>
                    <tr className="h-5">
                      <td colSpan={2} className="border border-blue-800"><CellText value={report.material} /></td>
                      <td className="border border-blue-800"><CellText value={report.platingSpec} /></td>
                      <td className="border border-blue-800"><CellText value={report.lotSize} /></td>
                    </tr>
                  </tbody>
                </table>

                <table className="mt-1 w-full border-collapse text-center">
                  <thead>
                    <tr className="bg-blue-50">
                      <th className="w-5 border border-blue-800">NO</th>
                      <th className="border border-blue-800">INSPECTION ITEMS</th>
                      <th className="w-8 border border-blue-800">Ac/Re</th>
                      <th className="w-12 border border-blue-800">RESULT</th>
                      <th className="w-5 border border-blue-800">NO</th>
                      <th className="border border-blue-800">INSPECTION ITEMS</th>
                      <th className="w-8 border border-blue-800">Ac/Re</th>
                      <th className="w-12 border border-blue-800">RESULT</th>
                    </tr>
                  </thead>
                  <tbody>
                    {leftVisual.map((left, index) => {
                      const right = rightVisual[index]
                      return (
                        <tr key={left[0]} className="h-4">
                          <td className="border border-blue-800">{left[0]}</td>
                          <td className="border border-blue-800 px-1 text-left">{left[1]}</td>
                          <td className="border border-blue-800">0/1</td>
                          <td className="border border-blue-800"><MarkText value={report.visual[index]} /></td>
                          <td className="border border-blue-800">{right[0]}</td>
                          <td className="border border-blue-800 px-1 text-left">{right[1]}</td>
                          <td className="border border-blue-800">0/1</td>
                          <td className="border border-blue-800"><MarkText value={report.visual[index + 5]} /></td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>

                <div className="mt-1 border border-blue-800 bg-blue-50 px-1 py-0.5 text-center font-bold text-blue-900">
                  II. DIMENSION INSPECTION (Sampling Plan : n=100mm/Reel, 5Reel/Shipping or n=50ea/Shipping, c=0)
                </div>
                <table className="w-full shrink-0 table-fixed border-collapse text-center">
                  <thead>
                    <tr className="bg-blue-50">
                      <th rowSpan={2} className="w-5 border border-blue-800">NO</th>
                      <th rowSpan={2} className="w-[16mm] border border-blue-800">항목/구분</th>
                      <th colSpan={3} className="border border-blue-800">SPEC</th>
                      <th rowSpan={2} className="w-[16mm] border border-blue-800">검사주기</th>
                      <th colSpan={2} className="border border-blue-800">우리하이피</th>
                      <th rowSpan={2} className="w-[12mm] border border-blue-800">수량</th>
                      <th colSpan={2} className="border border-blue-800">고객</th>
                      <th rowSpan={2} className="w-[12mm] border border-blue-800">판정</th>
                    </tr>
                    <tr className="bg-blue-50">
                      <th className="border border-blue-800">규격</th>
                      <th className="w-[10mm] border border-blue-800">하한(-)</th>
                      <th className="w-[10mm] border border-blue-800">상한(+)</th>
                      <th className="w-[12mm] border border-blue-800">1차</th>
                      <th className="w-[12mm] border border-blue-800">2차</th>
                      <th className="w-[10mm] border border-blue-800">1차</th>
                      <th className="w-[10mm] border border-blue-800">2차</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.dimensions.map((row, index) => (
                      <tr key={index}>
                        <td className="border border-blue-800">{index + 1}</td>
                        <td className="border border-blue-800"><CellText value={row.name} /></td>
                        <td className="border border-blue-800"><CellText value={row.spec} /></td>
                        <td className="border border-blue-800"><CellText value={row.lower} /></td>
                        <td className="border border-blue-800"><CellText value={row.upper} /></td>
                        <td className="border border-blue-800"><CellText value={row.cycle} /></td>
                        <td className="border border-blue-800"><CellText value={row.our1} /></td>
                        <td className="border border-blue-800"><CellText value={row.our2} /></td>
                        <td className="border border-blue-800"><CellText value={row.qty} /></td>
                        <td className="border border-blue-800"><CellText value={row.cust1} /></td>
                        <td className="border border-blue-800"><CellText value={row.cust2} /></td>
                        <td className="border border-blue-800"><MarkText value={row.judge} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <div className="mt-1 border border-blue-800 bg-blue-50 px-1 py-0.5 text-center font-bold text-blue-900">
                  III. PLATING THICKNESS(도금두께) (Sampling Plan : y)
                </div>
                <table className="w-full border-collapse text-center">
                  <thead>
                    <tr className="bg-blue-50">
                      <th className="w-6 border border-blue-800">NO</th>
                      <th colSpan={2} className="border border-blue-800">SPECIFICATION</th>
                      <th className="w-[52mm] border border-blue-800">Measurement Data</th>
                      <th className="w-12 border border-blue-800">RESULT</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td rowSpan={2} className="border border-blue-800">1</td>
                      <td rowSpan={2} className="w-[24mm] border border-blue-800" style={{ borderRightStyle: 'dotted' }}>X-Ray 측정</td>
                      <td className="h-6 border border-blue-800 px-1" style={{ borderBottomStyle: 'dotted' }}>{report.platingSpec.split(' / ')[0] ?? ''}</td>
                      <td className="h-6 border border-blue-800 px-1" style={{ borderBottomStyle: 'dotted' }}>첨부 : 도금성적서</td>
                      <td rowSpan={2} className="border border-blue-800"><MarkText value={report.platingResult} /></td>
                    </tr>
                    <tr>
                      <td className="h-6 border border-blue-800 px-1">{report.platingSpec.split(' / ')[1] ?? ''}</td>
                      <td className="h-6 border border-blue-800 px-1">첨부 : 도금성적서</td>
                    </tr>
                  </tbody>
                </table>

                <div className="mt-1 border border-blue-800 bg-blue-50 px-1 py-0.5 text-center font-bold text-blue-900">
                  IV. FUNCTIONAL TEST (Sampling Plan : n=100mm/EA, 2EA/Shipping, c=0)
                </div>
                <table className="w-full shrink-0 table-fixed border-collapse text-center">
                  <thead>
                    <tr className="bg-blue-50">
                      <th className="w-6 border border-blue-800">NO</th>
                      <th className="w-[34mm] border border-blue-800">INSPECTION ITEMS</th>
                      <th className="w-[36mm] border border-blue-800">SPECIFICATION</th>
                      <th className="w-[60mm] border border-blue-800">TEST SAMPLE</th>
                      <th className="w-12 border border-blue-800">RESULT</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="h-20 print:h-[28mm]">
                      <td className="border border-blue-800">1</td>
                      <td className="border border-blue-800 font-semibold">ADHESION TEST<br />(밀착성 시험)</td>
                      <td className="border border-blue-800 p-0">
                        <div className="flex h-20 items-center justify-center px-1 print:h-[28mm]">
                          <p className="w-full whitespace-pre-line text-center text-[8px] leading-tight print:text-[9px] print:leading-tight">{report.adhesionSpec}</p>
                        </div>
                      </td>
                      <td className="border border-blue-800" />
                      <td className="border border-blue-800"><MarkText value={report.adhesionResult} /></td>
                    </tr>
                  </tbody>
                </table>

                <div className="mt-1 grid shrink-0 grid-cols-[1.3fr_1fr_0.7fr] border border-blue-800">
                  <div className="flex h-[36mm] flex-col border-r border-blue-800 print:h-[42mm]">
                    <div className="shrink-0 border-b border-blue-800 py-0.5 text-center text-[8px] font-semibold leading-none text-blue-900 print:text-[9px]">제품도면</div>
                    <div className="flex min-h-0 flex-1 items-center justify-center px-0.5 py-0.5">
                      <ProductDrawing spec={report.product || report.spec} platingSpec={report.platingSpec} fullWidth={report.dimensions[0]?.spec ?? ''} gap={report.dimensions[1]?.spec ?? ''} plateWidth={report.dimensions[2]?.spec ?? ''} />
                    </div>
                  </div>
                  <table className="h-full border-collapse text-center">
                    <tbody>
                      <tr>
                        <th rowSpan={2} className="w-5 border border-blue-800 [writing-mode:vertical-rl]">우리하이피</th>
                        <th className="border border-blue-800">작성</th>
                        <th className="border border-blue-800">승인</th>
                      </tr>
                      <tr className="h-10">
                        {(['작성', '승인'] as const).map((label) => {
                          const step = signStep(approval, label)
                          const signed = step?.status === 'approved' && !!step.userId
                          const name = label === '작성' ? (user?.displayName || user?.username || report.ourWriter) : '조승현'
                          return (
                            <td key={label} className="border border-blue-800">
                              {signed ? <img src={`/api/auth/signature?userId=${encodeURIComponent(step.userId)}`} alt={step.name} className="mx-auto h-8 object-contain" /> : (
                                <CellText value={name} className="text-[13px] font-extrabold print:text-[15px]" />
                              )}
                            </td>
                          )
                        })}
                      </tr>
                      <tr>
                        <th rowSpan={2} className="border border-blue-800 [writing-mode:vertical-rl]">고객</th>
                        <th className="border border-blue-800">작성</th>
                        <th className="border border-blue-800">승인</th>
                      </tr>
                      <tr className="h-8">
                        <td className="border border-blue-800"><CellText value={report.customerWriter} /></td>
                        <td className="border border-blue-800"><CellText value={report.customerApprover} /></td>
                      </tr>
                    </tbody>
                  </table>
                  <div className="flex items-stretch border-l border-blue-800">
                    <span className="flex w-5 items-center justify-center border-r border-blue-800 font-semibold [writing-mode:vertical-rl]">종합판정</span>
                    <div className="flex flex-1 items-center justify-center py-1">
                      <JudgmentStamp judgment={report.judgment} date={report.issuedOn} />
                    </div>
                  </div>
                </div>
                <footer className="mt-1 flex shrink-0 items-center justify-between text-[8px] text-slate-600 print:mt-2 print:text-[11px]">
                  <span>QEP-840-08</span>
                  <span>우리하이피 주식회사</span>
                  <span>A4(210*279)</span>
                </footer>
              </article>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {dimensionOpen && report && (
        <DimensionDialog
          rows={report.dimensions.map((row) => ({ ...row }))}
          onClose={() => setDimensionOpen(false)}
          onSave={(dimensions) => {
            patch({ dimensions })
            setDimensionOpen(false)
          }}
        />
      )}

      <ConfirmDeleteDialog
        open={pendingDelete != null}
        onOpenChange={(open) => { if (!open) setPendingDelete(null) }}
        title="출하성적서 삭제"
        onConfirm={removeReport}
      >
        이 출하성적서를 목록에서 삭제합니다.
      </ConfirmDeleteDialog>
    </div>
  )
}
