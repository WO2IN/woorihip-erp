'use client'

import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react'
import { useSearchParams } from 'next/navigation'
import { Check, ChevronDown, Copy, FileCheck, FileText, Info, Plus, Printer, Save, Search, Table2, X } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/components/auth/auth-context'
import { type ApprovalRequest } from '@/lib/approval'
import { ConfirmDeleteDialog } from '@/components/shared/confirm-delete-dialog'
import { BAND_BUTTON, BAND_BUTTON_PRIMARY, PAGE_SHELL, PageHeader } from '@/components/shared/page-header'
import { DocFormSelect } from '@/components/shipment/doc-form-select'
import { ShipmentDocFlowNav } from '@/components/shipment/shipment-doc-flow-nav'
import { ShipmentTabNav } from '@/components/shipment/shipment-tab-nav'
import { DocSiblingList } from '@/components/shipment/doc-sibling-list'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { SearchableCombobox } from '@/components/ui/searchable-combobox'
import { getJsonAuthHeaders } from '@/lib/auth-client'
import { saveSheetDocument } from '@/lib/sheet-document'
import { CERTIFICATE_TYPE } from '@/lib/file-types'
import { useEmbedPreview } from '@/hooks/use-embed-preview'
import { cn } from '@/lib/utils'
import {
  splitLotRange,
  type DimRow,
  type Floor,
  type Form2Item,
  type Form2Row,
  type Mark,
  type PlatingLink,
  type Report,
} from '@/components/shipment/outgoing-forms/sheet-parts'
import { OutgoingFormBasic } from '@/components/shipment/outgoing-forms/basic-form'
import { form2ItemsOf, form2RowsOf, OutgoingForm2, platingParts } from '@/components/shipment/outgoing-forms/form-2'

const FLOORS = ['1', '2', '3'] as const

const ADHESION_SPEC = '1.제품은 스카치 Tape에 완전\n밀착후 45도 각도로 순간적으로\n떼어낸다.(돌림 및 벗겨짐)\n2.테이프 시험이 안되는 제품은\n니퍼로 90도로 상,하측으로 도금면을\n깎아 벗겨짐이 없을것.'

function todayKey() {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${month}-${day}`
}

function emptyDim(): DimRow[] {
  // 보통 전폭만 측정한다. 간격·도금폭은 필요할 때 치수검사 창에서 고른다.
  const names = ['전폭']
  return Array.from({ length: 15 }, (_, index) => ({
    name: names[index] ?? '',
    spec: '',
    lower: '',
    upper: '',
    cycle: names[index] ? 'Reel/Lot' : '',
    lotNo: '',
    qty: '',
    our: '',
    ourJudge: '',
    cust: '',
    custJudge: '',
  }))
}

/** DATA 를 적으면 판정은 OK 로 시작한다(NG 로 바꿀 수 있다). DATA 가 비면 판정도 비운다. */
function dimJudge(data: string, current: Mark): Mark {
  if (!data.trim()) return ''
  return current === 'NG' ? 'NG' : 'OK'
}

function normalizeDim(value: unknown): DimRow[] {
  const rows = Array.isArray(value) ? value : []
  return emptyDim().map((base, index) => {
    const row = rows[index]
    if (!row || typeof row !== 'object') return base
    // 예전 양식(우리 1·2차, 고객 1·2차, 판정 하나)은 1차 값과 판정을 새 칸으로 옮긴다.
    const item = row as Partial<DimRow> & { our1?: string; our2?: string; cust1?: string; cust2?: string; judge?: Mark }
    const text = (value: unknown) => (typeof value === 'string' ? value : '')
    const mark = (value: unknown): Mark => (value === 'NG' ? 'NG' : value === 'OK' ? 'OK' : '')
    // 예전에 자동으로 넣던 간격·도금폭 줄은, 직접 적은 값이 없으면 비운다. (이제 전폭만 기본으로 넣는다)
    const autoFilled = index > 0 && (item.name === '간격' || item.name === '도금폭')
      && ![item.lower, item.upper, item.lotNo, item.qty, item.our ?? item.our1, item.our2, item.cust ?? item.cust1, item.cust2].some((v) => text(v).trim())
    if (autoFilled) return base
    return {
      ...base,
      name: typeof item.name === 'string' ? item.name : base.name,
      spec: typeof item.spec === 'string' ? item.spec : '',
      lower: typeof item.lower === 'string' ? item.lower : '',
      upper: typeof item.upper === 'string' ? item.upper : '',
      cycle: typeof item.cycle === 'string' ? item.cycle : base.cycle,
      lotNo: text(item.lotNo),
      qty: text(item.qty),
      our: text(item.our ?? item.our1),
      ourJudge: dimJudge(text(item.our ?? item.our1), mark(item.ourJudge ?? item.judge)),
      cust: text(item.cust ?? item.cust1),
      custJudge: dimJudge(text(item.cust ?? item.cust1), mark(item.custJudge)),
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
    barcode: '',
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
    barcode: typeof saved.barcode === 'string' ? saved.barcode : '',
  }
}

function joinLotRange(start: string, end: string) {
  const from = start.trim()
  const to = end.trim()
  if (from && to) return `${from}~${to}`
  return from || to
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

const DIM_SPEC_FIELDS = [
  ['spec', '규격'],
  ['lower', '하한'],
  ['upper', '상한'],
] as const
const DIM_LOT_FIELDS = [
  ['lotNo', 'LOT No.'],
  ['qty', '수량'],
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

const FIXED_FORM2_ITEMS = ['전폭', '두께']
const CIRCLED_NO = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧']

/** 양식 2 치수 항목 편집: 기본은 전폭·두께, 간격·도금폭·직접 입력 항목을 더하고 뺄 수 있다. */
function Form2ItemsEditor({
  items,
  disabled,
  onChange,
  platingSpec,
}: {
  items: Form2Item[]
  disabled: boolean
  /** removed: 지운 항목 자리 (그 열의 측정값도 함께 지운다) */
  onChange: (items: Form2Item[], removed?: number) => void
  /** 도금 정보의 n번째 간격·도금폭 값 */
  platingSpec: (kind: 'gap' | 'plateWidth', index: number) => string
}) {
  const edit = (index: number, partial: Partial<Form2Item>) => onChange(items.map((item, i) => (i === index ? { ...item, ...partial } : item)))
  // 간격·도금폭이 두 개 이상이면 간격 ①, 간격 ② 처럼 번호를 붙이고, 하나만 남으면 번호를 뗀다.
  const renumber = (list: Form2Item[]) => {
    let next = list
    for (const base of ['간격', '도금폭']) {
      const same = (name: string) => new RegExp(`^${base}(?: [①-⑧])?$`).test(name)
      const count = next.filter((item) => same(item.name)).length
      let no = 0
      next = next.map((item) => (same(item.name) ? { ...item, name: count > 1 ? `${base} ${CIRCLED_NO[(no += 1) - 1]}` : base } : item))
    }
    return next
  }
  const add = (name: string, kind?: 'gap' | 'plateWidth') => {
    const nth = items.filter((item) => new RegExp(`^${name}(?: [①-⑧])?$`).test(item.name)).length
    onChange(renumber([...items, { name, spec: kind ? platingSpec(kind, nth) : '' }]))
  }
  return (
    <div className="flex flex-col gap-1.5 text-sm font-medium">
      치수 항목
      {items.map((item, index) => {
        // 전폭·두께는 기본 항목이라 이름을 바꾸거나 지울 수 없다 (규격만 고친다).
        const fixed = FIXED_FORM2_ITEMS.includes(item.name)
        return (
        <div key={index} className="flex items-center gap-1">
          <Input value={item.name} disabled={disabled || fixed} onChange={(event) => edit(index, { name: event.target.value })} placeholder="항목" className="h-9 w-[4.5rem] px-2" />
          <Input value={item.spec} disabled={disabled} onChange={(event) => edit(index, { spec: event.target.value })} placeholder="규격" className="h-9 min-w-0 flex-1 px-2" />
          <Input value={item.tol ?? ''} disabled={disabled} onChange={(event) => edit(index, { tol: event.target.value })} placeholder="범위" className="h-9 w-16 px-2" />
          <button
            type="button"
            disabled={disabled || fixed}
            onClick={() => onChange(renumber(items.filter((_, i) => i !== index)), index)}
            aria-label={`${item.name || '항목'} 삭제`}
            className={cn('shrink-0 rounded-md p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 disabled:pointer-events-none disabled:opacity-30', fixed && 'invisible')}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        )
      })}
      <div className="flex gap-1">
        {([['간격', 'gap'], ['도금폭', 'plateWidth'], ['직접 입력', undefined]] as const).map(([label, kind]) => (
          <Button key={label} type="button" variant="outline" size="sm" className="h-8 flex-1 px-1 text-xs" disabled={disabled || items.length >= 8} onClick={() => add(kind ? label : '', kind)}>
            <Plus className="h-3.5 w-3.5" />{label}
          </Button>
        ))}
      </div>
    </div>
  )
}

/** 판정 자동: 측정값이 하나라도 있으면 OK (NG로 고른 것은 그대로), 모두 비면 비운다. */
function groupJudge(values: string[], current: Mark): Mark {
  return dimJudge(values.join(''), current)
}

/** 양식 2 치수 표 입력 창: NO · (LOT No.) · 우리하이피 항목들 · 수량 · 판정. 고객 칸은 고객이 적으므로 여기서 받지 않는다. */
function Form2DataDialog({
  items,
  rows,
  showLot,
  onClose,
  onSave,
}: {
  items: Form2Item[]
  rows: Form2Row[]
  showLot: boolean
  onClose: () => void
  onSave: (rows: Form2Row[]) => void
}) {
  const [draft, setDraft] = useState(rows)

  function update(index: number, change: (row: Form2Row) => Form2Row) {
    setDraft((current) => current.map((row, rowIndex) => (rowIndex === index ? change(row) : row)))
  }

  // 측정값이 하나라도 들어가면 판정을 OK로 채운다 (NG로 고른 것은 그대로).
  function setValue(index: number, item: number, value: string) {
    update(index, (row) => {
      const our = Array.from({ length: items.length }, (_, i) => row.our[i] ?? '')
      our[item] = value
      return { ...row, our, ourJudge: groupJudge(our, row.ourJudge) }
    })
  }

  // 칸 번호: 0 LOT, 1.. 우리 항목, 수량, 판정
  const ourCol = (item: number) => 1 + item
  const qtyCol = 1 + items.length
  const judgeCol = qtyCol + 1

  function textInput(index: number, col: number, value: string, onChange: (value: string) => void) {
    return (
      <input
        data-dim-cell={`${index}-${col}`}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onFocus={(event) => event.currentTarget.select()}
        onKeyDown={(event) => {
          if (event.key !== 'Enter' || event.nativeEvent.isComposing) return
          event.preventDefault()
          focusDimCell(event.shiftKey ? index - 1 : index + 1, col)
        }}
        className={DIM_FIELD_CLASS}
      />
    )
  }

  const itemHead = (item: Form2Item) => (
    <span className="block leading-tight">
      {item.name}
      {(item.spec.trim() || item.tol?.trim()) && (
        <span className="mt-0.5 block text-[11px] font-medium text-slate-600">
          {[item.spec.trim(), item.tol?.trim() && `(${item.tol.trim()})`].filter(Boolean).join(' ')}
        </span>
      )}
    </span>
  )

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent overlayClassName="z-[80]" className="z-[80] flex max-h-[90dvh] w-[min(96vw,84rem)] max-w-none flex-col gap-0 overflow-hidden p-0 sm:max-w-none">
        <DialogHeader className="flex-row items-center gap-2.5 border-b border-slate-100 px-5 py-4">
          <span className="flex size-8 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
            <Table2 className="size-4" />
          </span>
          <DialogTitle className="text-base font-bold text-slate-900">치수검사</DialogTitle>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-auto px-5 py-4">
          <table className="w-full border-separate border-spacing-x-1.5 border-spacing-y-1.5 text-center" style={{ minWidth: `${(showLot ? 220 : 100) + items.length * 92 + 180}px` }}>
            <thead className="sticky top-0 z-10 bg-white">
              <tr>
                <th rowSpan={2} className={cn('w-10', DIM_HEAD_CLASS)}>NO</th>
                {showLot && <th rowSpan={2} className={cn('w-[8.5rem]', DIM_HEAD_CLASS)}>LOT No.</th>}
                <th colSpan={items.length} className={DIM_HEAD_CLASS}>우리하이피</th>
                <th rowSpan={2} className={cn('w-20', DIM_HEAD_CLASS)}>수량</th>
                <th rowSpan={2} className={cn('w-[4.5rem]', DIM_HEAD_CLASS)}>판정</th>
              </tr>
              <tr>
                {items.map((item, index) => (
                  <th key={index} className={cn('min-w-[5rem]', DIM_HEAD_CLASS)}>{itemHead(item)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {draft.map((row, index) => (
                <tr key={index}>
                  <td className="text-sm font-semibold text-slate-600">{index + 1}</td>
                  {showLot && <td>{textInput(index, 0, row.lotNo, (lotNo) => update(index, (current) => ({ ...current, lotNo })))}</td>}
                  {items.map((_, item) => (
                    <td key={item}>{textInput(index, ourCol(item), row.our[item] ?? '', (value) => setValue(index, item, value))}</td>
                  ))}
                  <td>{textInput(index, qtyCol, row.qty, (qty) => update(index, (current) => ({ ...current, qty })))}</td>
                  <td>
                    <SoftSelect
                      cell={`${index}-${judgeCol}`}
                      value={row.ourJudge}
                      options={['OK', 'NG']}
                      placeholder="-"
                      onChange={(value) => update(index, (current) => ({ ...current, ourJudge: value as Mark }))}
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
            LOT마다 우리하이피 측정값을 입력합니다. 측정값을 하나라도 넣으면 판정이 OK로 채워집니다. Enter는 다음 행, Shift+Enter는 이전 행입니다.
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
      if (key === 'our') next.ourJudge = dimJudge(value, row.ourJudge)
      if (key === 'cust') next.custJudge = dimJudge(value, row.custJudge)
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
                {DIM_SPEC_FIELDS.map(([, label]) => (
                  <th key={label} className={DIM_HEAD_CLASS}>{label}</th>
                ))}
                <th className={cn('w-[7.5rem]', DIM_HEAD_CLASS)}>주기</th>
                {DIM_LOT_FIELDS.map(([, label]) => (
                  <th key={label} className={DIM_HEAD_CLASS}>{label}</th>
                ))}
                <th className={DIM_HEAD_CLASS}>우리하이피 DATA</th>
                <th className={cn('w-[4.5rem]', DIM_HEAD_CLASS)}>판정</th>
                <th className={DIM_HEAD_CLASS}>고객 DATA</th>
                <th className={cn('w-[4.5rem]', DIM_HEAD_CLASS)}>판정</th>
              </tr>
            </thead>
            <tbody>
              {draft.map((row, index) => {
                const textCell = (key: 'spec' | 'lower' | 'upper' | 'lotNo' | 'qty' | 'our' | 'cust', col: number) => (
                  <td key={key}>
                    <input
                      data-dim-cell={`${index}-${col}`}
                      value={row[key]}
                      onChange={(event) => update(index, key, event.target.value)}
                      onFocus={(event) => event.currentTarget.select()}
                      onKeyDown={(event) => onTextKeyDown(event, index, col)}
                      className={DIM_FIELD_CLASS}
                    />
                  </td>
                )
                const judgeCell = (key: 'ourJudge' | 'custJudge', col: number) => (
                  <td>
                    <SoftSelect
                      cell={`${index}-${col}`}
                      value={row[key]}
                      options={['OK', 'NG']}
                      placeholder="-"
                      onChange={(value) => update(index, key, value)}
                    />
                  </td>
                )
                return (
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
                    {DIM_SPEC_FIELDS.map(([key], fieldIndex) => textCell(key, fieldIndex + 1))}
                    <td>
                      <SoftSelect
                        cell={`${index}-4`}
                        value={row.cycle}
                        options={DIM_CYCLES}
                        placeholder="선택"
                        onChange={(cycle) => update(index, 'cycle', cycle)}
                      />
                    </td>
                    {DIM_LOT_FIELDS.map(([key], fieldIndex) => textCell(key, fieldIndex + 5))}
                    {textCell('our', 7)}
                    {judgeCell('ourJudge', 8)}
                    {textCell('cust', 9)}
                    {judgeCell('custJudge', 10)}
                  </tr>
                )
              })}
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

/**
 * 이력카드 LOT 번호들을 출하성적서 로트번호·범위로 묶는다.
 * 20261127-01 ~ 04 처럼 앞부분이 같으면 { lotNo: '20261127', lotRange: '01~04' }, 한 장뿐이면 그 번호 그대로.
 * 앞부분이 서로 다르면 묶지 않는다.
 */
function lotSpanOf(lots: string[]): { lotNo: string; lotRange: string } | null {
  const values = [...new Set(lots.map((lot) => lot.trim()).filter(Boolean))]
  if (values.length === 0) return null
  if (values.length === 1) return { lotNo: values[0], lotRange: '' }
  const parts = values.map((lot) => lot.match(/^(.*)-(\d+)$/))
  if (parts.some((part) => !part)) return null
  const base = parts[0]![1]
  if (parts.some((part) => part![1] !== base)) return null
  const numbers = parts.map((part) => part![2]).sort((a, b) => Number(a) - Number(b))
  return { lotNo: base, lotRange: `${numbers[0]}~${numbers[numbers.length - 1]}` }
}

/** 배율 표시는 실제 배율보다 이만큼 낮춰 보여 준다 (실제 110% = 표시 100%). */
const ZOOM_LABEL_OFFSET = 10

export function OutgoingReportView() {
  const searchParams = useSearchParams()
  const { user, loading: authLoading } = useAuth()
  const canWrite = user?.role === 'editor' || user?.role === 'admin'
  const [reports, setReports] = useState<Report[]>([])
  const [activeId, setActiveId] = useState('')
  const [floor, setFloor] = useState<Floor>('1')
  const [ready, setReady] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<Report | null>(null)
  const [approval, setApproval] = useState<ApprovalRequest | null>(null)
  const [approvalTick, setApprovalTick] = useState(0)
  const [companies, setCompanies] = useState<string[]>([])
  const [links, setLinks] = useState<PlatingLink[]>([])
  // 실제 배율 110%를 기본으로 하되 화면 표시는 100%로 보이게 한다.
  const [previewZoom, setPreviewZoom] = useState(110)
  const [dimensionOpen, setDimensionOpen] = useState(false)
  const previewDrag = useRef<{ x: number; y: number; left: number; top: number; pointerId: number } | null>(null)
  const savedSnapshot = useRef<Map<string, string>>(new Map())
  const articleRef = useRef<HTMLElement>(null)
  const [finishing, setFinishing] = useState(false)
  const reportsRef = useRef(reports)
  const saveQueue = useRef(Promise.resolve())
  reportsRef.current = reports
  const report = reports.find((item) => item.id === activeId) ?? null
  // 같은 입고 바코드(없으면 같은 이력카드)로 만든 출하성적서들. 나눠 출하하면 여러 장일 수 있다.
  const siblings = report
    ? reports
      .filter((item) => item.id === report.id
        || (report.barcode && item.barcode.toUpperCase() === report.barcode.toUpperCase())
        || (!report.barcode && report.sourceLotCardId && item.sourceLotCardId === report.sourceLotCardId))
      .sort((a, b) => (a.sortOrder ?? Infinity) - (b.sortOrder ?? Infinity) || a.createdAt.localeCompare(b.createdAt))
    : []
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

  // 로트 범위가 비어 있으면 같은 입고의 이력카드 LOT 번호들로 채운다.
  // 예) 이력카드 20261127-01 ~ 04 → 로트번호 20261127, 범위 01~04 → 머리칸 '20261127-01 ~ 04'
  useEffect(() => {
    if (!ready || !canWrite || !activeId) return
    const current = reportsRef.current.find((item) => item.id === activeId)
    if (!current || current.done || current.lotRange.trim()) return
    let stop = false
    void fetch('/api/lot-cards', { cache: 'no-store' })
      .then((response) => response.json())
      .then((body) => {
        if (stop || !Array.isArray(body?.data)) return
        const cards = body.data as { id?: string; barcode?: string; sourceIncomingId?: string; lotNo?: string }[]
        const code = current.barcode.trim().toUpperCase()
        const source = cards.find((card) => card.id === current.sourceLotCardId)
        const group = cards.filter((card) => (code && card.barcode?.trim().toUpperCase() === code)
          || card.id === current.sourceLotCardId
          || (!!source?.sourceIncomingId && card.sourceIncomingId === source.sourceIncomingId))
        const next = lotSpanOf(group.map((card) => card.lotNo ?? ''))
        if (!next) return
        const latest = reportsRef.current.find((item) => item.id === activeId)
        if (!latest || latest.lotRange.trim() || (latest.lotNo === next.lotNo && !next.lotRange)) return
        patch(next)
      })
      .catch(() => undefined)
    return () => { stop = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, canWrite, activeId])

  useEffect(() => {
    if (!ready || !activeId) return
    const current = reportsRef.current.find((item) => item.id === activeId)
    if (!current) return
    // 치수검사 1번 줄(전폭) 규격은 품목 규격(0.3*68 → 68)에서 가져온다.
    const fullWidth = parseSizeSpec(current.product || current.spec).fullWidth
    const nextDimensions = current.dimensions.map((row, index) => (index === 0 ? { ...row, spec: fullWidth } : row))
    const unchanged = nextDimensions[0]?.spec === current.dimensions[0]?.spec
    if (unchanged) return
    patch({ dimensions: nextDimensions })
  }, [ready, activeId, links, report?.customer, report?.product, report?.spec, report?.material, report?.platingSpec])

  /** 완료는 상태(작성중 ↔ 완료)만 바꾼다. 문서탐색기 저장은 '저장' 버튼으로 따로 한다. */
  function toggleDone() {
    if (!report) return
    patch({ done: !report.done })
  }

  /** 지금 서식을 PDF로 만들어 문서탐색기(출하성적서)에 저장한다. 다시 저장하면 이전 문서를 새 것으로 바꾼다. */
  async function saveToExplorer() {
    if (!report || finishing) return
    if (!articleRef.current) {
      toast.error('출하성적서 화면을 찾지 못해 문서탐색기에 저장하지 못했습니다.')
      return
    }
    setFinishing(true)
    try {
      const saved = await saveSheetDocument({
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
      if (saved.ok) toast.success('문서탐색기에 출하성적서로 저장했습니다.')
      else toast.error(saved.error)
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

  /** 같은 입고로 출하성적서를 한 장 더 만든다. 수량(LOT Size)과 로트 범위는 비워 둔다. */
  function copyReport() {
    if (!report) return
    const now = new Date().toISOString()
    const next: Report = {
      ...report,
      id: crypto.randomUUID(),
      done: false,
      sortOrder: undefined,
      createdAt: now,
      updatedAt: now,
      lotSize: '',
      lotRange: '',
      visual: [...report.visual],
      dimensions: report.dimensions.map((row) => ({ ...row })),
    }
    setReports((current) => [next, ...current])
    setActiveId(next.id)
  }

  function removeReport() {
    if (!pendingDelete) return
    const next = reports.filter((item) => item.id !== pendingDelete.id)
    setReports(next)
    if (activeId === pendingDelete.id) {
      const sibling = siblings.find((item) => item.id !== pendingDelete.id) ?? next.find((item) => item.floor === pendingDelete.floor && !item.done) ?? next.find((item) => !item.done) ?? next[0]
      setActiveId(sibling?.id ?? '')
      if (sibling) setFloor(sibling.floor)
    }
    setPendingDelete(null)
  }


  return (
    <div className={cn(PAGE_SHELL, 'outgoing-report-screen')}>
      <div className="no-print contents">
        <PageHeader
          tone="teal"
          icon={FileCheck}
          eyebrow="재고 관리"
          title="출하성적서"
          description="고객명, 품명, 로트번호를 적으면 오른쪽 미리보기에 들어갑니다. 완료·인쇄는 위 흐름 바에서 합니다."
          actions={(
            <>
              <DocFormSelect kind="outgoing" value={report?.formId} onChange={(formId) => patch({ formId })} disabled={!canWrite || !report} />
              {canWrite && (
                <Button variant="outline" className={BAND_BUTTON} disabled={!report} onClick={toggleDone}>
                  <Check className="h-4 w-4" /> {report?.done ? '완료 취소' : '완료'}
                </Button>
              )}
              {canWrite && (
                <Button variant="outline" className={BAND_BUTTON} disabled={!report || finishing} onClick={() => void saveToExplorer()}>
                  <Save className="h-4 w-4" /> {finishing ? '저장 중…' : '저장'}
                </Button>
              )}
              {canWrite && (
                <Button variant="outline" className={BAND_BUTTON} disabled={!report} onClick={copyReport}>
                  <Copy className="h-4 w-4" /> 복사
                </Button>
              )}
              <Button className={BAND_BUTTON_PRIMARY} disabled={!report} onClick={() => window.print()}>
                <Printer className="h-4 w-4" /> 인쇄
              </Button>
            </>
          )}
        />
        {!embed && <ShipmentTabNav />}
        <ShipmentDocFlowNav
          step="outgoing"
          currentId={report?.id}
        />
      </div>

        <div className="outgoing-report-work flex min-h-[calc(100vh-13rem)] items-stretch gap-4">

          {!report && (
            <div className="no-print flex min-h-0 flex-1 items-center justify-center rounded-xl border border-dashed border-slate-300 text-sm text-slate-400">
              이력카드에서 '출하성적서로 이어쓰기'를 눌러 성적서를 엽니다
            </div>
          )}

          {report && (
            <div className="outgoing-report-preview flex min-h-0 min-w-0 flex-1 items-start gap-4">
              {/* 목록과 입력 칸은 따로 둔다. 둘 다 스크롤을 내리면 위 흐름 바 아래에 붙어 화면을 따라 움직인다.
                  목록 카드·입력 칸·서식 종이의 윗선을 맞춘다: 서식 위 배율 줄(36px) = 목록 제목 줄(24px) + pt-3, 입력 칸은 pt-9. */}
              <aside className="no-print sticky top-20 w-64 shrink-0 self-start pt-3">
                <DocSiblingList
                  noun="출하성적서"
                  barcode={report.barcode}
                  items={siblings.map((item) => ({
                    id: item.id,
                    done: item.done,
                    title: item.lotNo,
                    chips: [['로트', item.lotRange], ['LOT Size', item.lotSize], ['발행일', item.issuedOn]],
                  }))}
                  activeId={report.id}
                  canWrite={canWrite}
                  onSelect={setActiveId}
                  onDelete={(id) => setPendingDelete(siblings.find((item) => item.id === id) ?? null)}
                  onReorder={(order) => setReports((current) => current.map((item) => {
                    const index = order.indexOf(item.id)
                    return index < 0 || item.sortOrder === index ? item : { ...item, sortOrder: index }
                  }))}
                />
              </aside>
              <div className="no-print sticky top-20 w-72 shrink-0 self-start pt-9">
                <section className="rounded-xl border bg-card p-4 shadow-sm">
                  <h2 className="text-sm font-bold text-slate-900">성적서 정보</h2>
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
                    {report.formId === 'form-2' && (
                      <label className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium">
                        고객 LOT No.
                        <input type="checkbox" checked={report.form2ShowLot === true} disabled={locked} onChange={(event) => patch({ form2ShowLot: event.target.checked })} className="h-4 w-4 accent-teal-600" />
                      </label>
                    )}
                    {report.formId === 'form-2' && (
                      <Form2ItemsEditor
                        items={form2ItemsOf(report, links)}
                        disabled={locked}
                        onChange={(form2Items, removed) => patch(removed === undefined ? { form2Items } : {
                          form2Items,
                          form2Rows: form2RowsOf(report).map((row) => ({ ...row, our: row.our.filter((_, i) => i !== removed), cust: row.cust.filter((_, i) => i !== removed) })),
                        })}
                        platingSpec={(kind, index) => platingParts(links, report, kind)[index] ?? ''}
                      />
                    )}
                    <Button type="button" variant="outline" className="h-10" disabled={locked} onClick={() => setDimensionOpen(true)}>
                      치수검사 수정
                    </Button>
                  </div>
                </section>
              </div>
              <div className="flex min-h-0 min-w-0 flex-1 flex-col self-stretch">
                <div className="no-print mb-2 flex h-7 shrink-0 items-center justify-end">
                  <div className="flex items-center gap-1">
                    <button type="button" aria-label="미리보기 축소" className="h-7 w-7 rounded border border-slate-300 text-sm font-semibold text-slate-700 hover:bg-slate-100" onClick={() => setPreviewZoom((value) => Math.max(60, value - 10))}>−</button>
                    <span className="w-11 text-center text-xs tabular-nums text-slate-600">{previewZoom - ZOOM_LABEL_OFFSET}%</span>
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
                {report.formId === 'form-2' ? (
                  <OutgoingForm2 report={report} approval={approval} writerName={user?.displayName || user?.username || ''} links={links} />
                ) : (
                  <OutgoingFormBasic report={report} approval={approval} writerName={user?.displayName || user?.username || ''} links={links} />
                )}
              </article>
                </div>
              </div>
            </div>
          )}
        </div>

      {dimensionOpen && report && report.formId === 'form-2' && (
        <Form2DataDialog
          items={form2ItemsOf(report, links)}
          rows={form2RowsOf(report)}
          showLot={report.form2ShowLot === true}
          onClose={() => setDimensionOpen(false)}
          onSave={(form2Rows) => {
            patch({ form2Rows })
            setDimensionOpen(false)
          }}
        />
      )}
      {dimensionOpen && report && report.formId !== 'form-2' && (
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
        {pendingDelete?.lotNo.trim() ? `${pendingDelete.lotNo.trim()} 출하성적서를 삭제합니다. 되돌릴 수 없습니다.` : '이 출하성적서를 삭제합니다. 되돌릴 수 없습니다.'}
      </ConfirmDeleteDialog>
    </div>
  )
}
