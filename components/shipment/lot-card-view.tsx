'use client'

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { Barcode, FileText, Plus, Printer, Search, Shuffle, Trash2 } from 'lucide-react'
import { useAuth } from '@/components/auth/auth-context'
import { StampApprovalButton } from '@/components/approvals/stamp-approval-button'
import { Button } from '@/components/ui/button'
import { SearchableCombobox } from '@/components/ui/searchable-combobox'
import { ConfirmDeleteDialog } from '@/components/shared/confirm-delete-dialog'
import { BAND_BUTTON, BAND_BUTTON_PRIMARY, PAGE_SHELL, PageHeader } from '@/components/shared/page-header'
import { type ApprovalRequest, type ApprovalStep } from '@/lib/approval'
import { code128Modules } from '@/lib/code128'
import { getJsonAuthHeaders, getSession } from '@/lib/auth-client'
import { cn } from '@/lib/utils'

const STORAGE_KEY = 'woorihip-lot-card-draft'
const LIST_KEY = 'woorihip-lot-cards'
const FLOORS = ['1', '2', '3'] as const

type Floor = (typeof FLOORS)[number]
const NI_BATHS = ['스트라이크', 'Ni #1', 'Ni #2', 'Ni #3', 'Ni #4']
const AU_BATHS = ['스트라이크', 'Au#1', 'Au#2', 'Au#3', 'Au#4']
const SN_BATHS = ['스트라이크', 'Sn#1', 'Sn#2', 'Sn#3', 'Sn#4']

type Judge = '' | 'OK' | 'NG' | '특채'
type Bath = { v: string; a: string }
type Measure = { left: string; right: string }

type Card = {
  id: string
  floor: Floor
  createdAt: string
  updatedAt: string
  partner: string
  product: string
  spec: string
  lotNo: string
  receivedAt: string
  seqNo: string
  rollCount: string
  quantity: string
  platedQuantity: string
  materialVendor: string
  barcode: string
  incoming: Measure[]
  incomingFullWidth: string
  incomingGap: string
  incomingPlateWidth: string
  incomingDate: string
  incomingJudge: Judge
  niSpec: string
  niDate: string
  niBaths: Bath[]
  niFirst: string
  niLast: string
  niJudge: Judge
  maskDate: string
  workDate: string
  maskFullWidth: string
  maskGap: string
  maskPlateWidth: string
  maskJudge: Judge
  auDate: string
  auSpec: string
  auBaths: Bath[]
  auFirst: string
  auLast: string
  auJudge: Judge
  snDate: string
  snSpec: string
  snBaths: Bath[]
  snFirst: string
  snLast: string
  snJudge: Judge
  shipDate: string
  niThickness: string
  auThickness: string
  snThickness: string
  adhesion: string
  solder: string
  salt: string
  shipJudge: Judge
}

function baths(count: number): Bath[] {
  return Array.from({ length: count }, () => ({ v: '', a: '' }))
}

function emptyCard(): Card {
  return {
    id: crypto.randomUUID(),
    floor: '1',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    partner: '', product: '', spec: '',
    lotNo: '', receivedAt: '', seqNo: '', rollCount: '', quantity: '', platedQuantity: '', materialVendor: '',
    barcode: '',
    incoming: [{ left: '', right: '' }, { left: '', right: '' }],
    incomingFullWidth: '', incomingGap: '', incomingPlateWidth: '', incomingDate: '',
    incomingJudge: '',
    niSpec: '', niDate: '', niBaths: baths(5), niFirst: '', niLast: '', niJudge: '',
    maskDate: '', workDate: '', maskFullWidth: '', maskGap: '', maskPlateWidth: '', maskJudge: '',
    auDate: '', auSpec: '', auBaths: baths(5), auFirst: '', auLast: '', auJudge: '',
    snDate: '', snSpec: '', snBaths: baths(5), snFirst: '', snLast: '', snJudge: '',
    shipDate: '', niThickness: '', auThickness: '', snThickness: '', adhesion: '', solder: '', salt: '', shipJudge: '',
  }
}

function normalizeCard(saved: (Partial<Card> & { rollSeq?: string }) | null, fallbackFloor: Floor = '1'): Card {
  const base = emptyCard()
  const legacy = String(saved?.rollSeq ?? '')
  const [legacySeq, ...legacyRoll] = legacy.split(/[\/|]/).map((part) => part.trim())
  const floor = saved?.floor === '2' || saved?.floor === '3' ? saved.floor : fallbackFloor
  return {
    ...base,
    ...saved,
    id: saved?.id || base.id,
    floor,
    createdAt: saved?.createdAt || saved?.updatedAt || base.createdAt,
    updatedAt: saved?.updatedAt || base.updatedAt,
    workDate: saved?.workDate || saved?.maskDate || saved?.niDate || saved?.auDate || saved?.snDate || saved?.shipDate || '',
    incomingDate: saved?.incomingDate || saved?.workDate || '',
    maskDate: saved?.maskDate || saved?.workDate || '',
    niDate: saved?.niDate || saved?.workDate || '',
    auDate: saved?.auDate || saved?.workDate || '',
    snDate: saved?.snDate || saved?.workDate || '',
    shipDate: saved?.shipDate || saved?.workDate || '',
    seqNo: saved?.seqNo ?? legacySeq ?? '',
    rollCount: saved?.rollCount ?? legacyRoll.join('/') ?? '',
    incoming: base.incoming.map((row, index) => ({ ...row, ...saved?.incoming?.[index] })),
    niBaths: base.niBaths.map((row, index) => ({ ...row, ...saved?.niBaths?.[index] })),
    auBaths: base.auBaths.map((row, index) => ({ ...row, ...saved?.auBaths?.[index] })),
    snBaths: base.snBaths.map((row, index) => ({ ...row, ...saved?.snBaths?.[index] })),
  }
}

function readLocalCards(): Card[] {
  try {
    const raw = localStorage.getItem(LIST_KEY)
    const parsed = raw ? JSON.parse(raw) : null
    if (Array.isArray(parsed) && parsed.length > 0) return parsed.map((item) => normalizeCard(item))
  } catch {
    // 저장된 목록이 깨져 있으면 이전 초안을 본다.
  }
  try {
    const old = localStorage.getItem(STORAGE_KEY)
    if (old) return [normalizeCard(JSON.parse(old))]
  } catch {
    // 이전 초안이 없으면 빈 목록이다.
  }
  return []
}

function clearLocalCards() {
  localStorage.removeItem(LIST_KEY)
  localStorage.removeItem(STORAGE_KEY)
}

function JudgeMark({ value, onChange, onlyOk = false }: { value: Judge; onChange: (value: Judge) => void; onlyOk?: boolean }) {
  const options: Judge[] = onlyOk ? ['OK'] : ['OK', 'NG', '특채']
  return (
    <div className="flex overflow-hidden rounded border border-slate-300 bg-white">
      {options.map((option) => {
        const selected = value === option
        return (
          <button
            key={option}
            type="button"
            onClick={() => onChange(selected ? '' : option)}
            className={cn(
              'px-2 py-0.5 text-[12px] font-bold',
              selected ? 'bg-slate-900 text-white' : 'text-slate-400',
            )}
          >
            {option}
          </button>
        )
      })}
    </div>
  )
}

function CodeBars({ value }: { value: string }) {
  const modules = code128Modules(value.trim())
  if (!modules) return null
  const quiet = 10
  const modulesWide = modules.reduce((sum, size) => sum + size, 0) + quiet * 2
  const modulePx = Math.min(4, Math.max(3, Math.floor(640 / modulesWide)))
  const width = modulesWide * modulePx
  const height = 96
  let x = quiet * modulePx
  let draw = true
  const bars: { x: number; w: number }[] = []
  for (const size of modules) {
    const barWidth = size * modulePx
    if (draw) bars.push({ x, w: barWidth })
    x += barWidth
    draw = !draw
  }
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      shapeRendering="crispEdges"
      style={{ width, height, maxWidth: 'none' }}
      className="block shrink-0"
      role="img"
      aria-label={`바코드 ${value}`}
    >
      <rect width={width} height={height} fill="#fff" />
      {bars.map((bar) => (
        <rect key={`${bar.x}-${bar.w}`} x={bar.x} width={bar.w} height={height} fill="#000" />
      ))}
    </svg>
  )
}

const inputClass = 'h-9 min-w-0 flex-1 bg-transparent px-2 text-[14px] text-slate-900 outline-none'

function Slot({
  label,
  value,
  onChange,
  unit,
  compact = false,
  type = 'text',
  labelClass,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  unit?: string
  compact?: boolean
  type?: 'text' | 'date'
  labelClass?: string
}) {
  return (
    <label className="flex min-h-9 items-center">
      <span className={cn('shrink-0 whitespace-nowrap bg-slate-50 text-[12px] font-semibold text-slate-500', labelClass ?? (compact ? 'px-1.5' : 'w-[80px] px-2'))}>{label}</span>
      <input type={type} value={value} autoComplete="off" onChange={(event) => onChange(event.target.value)} className={cn(inputClass, type === 'date' && 'px-1', unit && 'pr-1 text-right')} />
      {unit && <span className="pr-2 text-[12px] font-semibold text-slate-400">{unit}</span>}
    </label>
  )
}

function ListSlot({
  label,
  configName,
  options,
  value,
  onChange,
  onOptionsChange,
  placeholder = '',
  disabled = false,
  creatable = true,
}: {
  label: string
  configName: string
  options: string[]
  value: string
  onChange: (value: string) => void
  onOptionsChange: (options: string[]) => void
  placeholder?: string
  disabled?: boolean
  creatable?: boolean
}) {
  return (
    <div className="flex min-h-9 items-center">
      <span className="w-[80px] shrink-0 bg-slate-50 px-2 text-[12px] font-semibold text-slate-500">{label}</span>
      <SearchableCombobox
        configName={configName}
        options={options}
        listAll
        listClassName="max-h-[min(24rem,70vh)]"
        value={value}
        onChange={onChange}
        onOptionsChange={onOptionsChange}
        placeholder={placeholder}
        disabled={disabled}
        creatable={creatable}
        className="h-9 flex-1 rounded-none border-0 bg-transparent px-2 text-[14px] font-normal text-slate-900 shadow-none hover:bg-transparent"
      />
    </div>
  )
}

function cardDate(value: string) {
  if (!value) return ''
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10)
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

function CardMeta({ label, value, selected }: { label: string; value: string; selected: boolean }) {
  return (
    <span className="inline-flex min-w-0 items-baseline gap-1">
      <span className={cn('shrink-0 text-[11px] font-semibold', selected ? 'text-white/50' : 'text-slate-400')}>{label}</span>
      <span className={cn('truncate', selected ? 'text-white/90' : 'text-slate-700')}>{value}</span>
    </span>
  )
}

function randomBarcode() {
  const bytes = new Uint8Array(6)
  crypto.getRandomValues(bytes)
  const now = new Date()
  const stamp = `${String(now.getFullYear()).slice(2)}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`
  const body = [...bytes].map((value) => String(value % 10)).join('')
  return `WR${stamp}${body}`
}

function signStep(approval: ApprovalRequest | null, slot: '작성' | '검토' | '승인') {
  if (!approval) return undefined
  if (slot === '작성') return approval.steps.find((step) => !step.role) ?? approval.steps[0]
  if (slot === '검토') return approval.steps.find((step) => step.role === 'review')
  return approval.steps.find((step) => step.role === 'approval')
}

function ApprovalBox({ approval }: { approval: ApprovalRequest | null }) {
  const slots = ['작성', '검토', '승인'] as const
  return (
    <table className="h-full w-[78mm] shrink-0 border-collapse self-stretch text-center">
      <tbody>
        <tr>
          <th rowSpan={3} className="w-8 border border-slate-400 bg-slate-100 px-0.5 text-[12px] font-extrabold tracking-[0.25em] text-slate-700 [writing-mode:vertical-rl]">
            결재
          </th>
          {slots.map((label) => (
            <th key={label} className="border border-slate-400 bg-white py-1 text-[13px] font-bold text-slate-800">{label}</th>
          ))}
        </tr>
        <tr>
          {slots.map((label) => {
            const step = signStep(approval, label)
            const signed = step?.status === 'approved' && !!step.userId
            return (
              <td key={label} className="h-16 border border-slate-400 bg-white px-1">
                {signed ? (
                  <img
                    src={`/api/auth/signature?userId=${encodeURIComponent(step.userId)}`}
                    alt={step.name}
                    className="mx-auto h-12 max-w-full object-contain"
                  />
                ) : null}
              </td>
            )
          })}
        </tr>
        <tr>
          {slots.map((label) => {
            const step = signStep(approval, label)
            const signed = step?.status === 'approved' && !!step.userId
            return (
              <td key={`${label}-name`} className="border border-slate-400 bg-white py-1 text-[12px] font-semibold leading-none text-slate-800">
                {signed ? step.name : ''}
              </td>
            )
          })}
        </tr>
      </tbody>
    </table>
  )
}

function Section({
  title,
  note,
  judge,
  extra,
  children,
}: {
  title: string
  note?: string
  judge: ReactNode
  extra?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="overflow-hidden rounded-md border border-slate-300">
      <div className="flex items-center gap-2 border-b border-slate-300 bg-slate-100 px-2.5 py-1.5">
        <h3 className="text-base font-bold text-slate-900">{title}</h3>
        {extra}
        {note && <p className="truncate text-[12px] text-slate-500">{note}</p>}
        <div className="ml-auto shrink-0">{judge}</div>
      </div>
      {children}
    </section>
  )
}

const SPEC_KINDS = ['범위', '이상', '이하', '초과', '미만'] as const

function specNumber(value: string) {
  return value.match(/\d+(?:\.\d+)?/)?.[0] ?? ''
}

function metalChunk(raw: string, metal: 'Ni' | 'Au' | 'Sn', allowPlain: boolean) {
  const text = raw.trim()
  if (!text) return ''
  const alias = metal === 'Ni' ? /^(?:ni|니켈)\s*[:：]/i : metal === 'Au' ? /^(?:au|금)\s*[:：]/i : /^(?:sn|주석)\s*[:：]/i
  const parts = text.split(/\s*[/／]\s*/).map((part) => part.trim()).filter(Boolean)
  const labeled = parts.find((part) => alias.test(part))
  if (labeled) return labeled.replace(alias, '').trim()
  if (/(?:ni|au|sn|니켈|주석|금)\s*[:：]/i.test(text)) return ''
  return allowPlain ? text : ''
}

function parseSpec(value: string) {
  const raw = value.trim()
  if (raw === '~' || raw === '범위') return { kind: '범위', from: '', to: '' }
  if (raw === '이상' || raw === '이하' || raw === '미만' || raw === '초과') return { kind: raw, from: '', to: '' }
  const text = raw.replace(/μm|㎛|um/gi, '').trim()
  const marked = text.match(/^(.*?)(이상|이하|미만|초과)$/)
  if (marked) return { kind: marked[2], from: marked[1].trim(), to: '' }
  if (text.includes('~') || text.includes('～')) {
    const [from, to = ''] = text.split(/[~～]/)
    return { kind: '범위', from: from.trim(), to: to.trim() }
  }
  return { kind: '', from: text, to: '' }
}

function formatSpec(kind: string, from: string, to: string) {
  const left = from.trim()
  const right = to.trim()
  if (kind === '범위') return left || right ? `${left} ~ ${right}μm` : '~'
  if (kind) return left ? `${left}μm ${kind}` : kind
  return left ? `${left}μm` : ''
}

function platingToSpec(raw: string) {
  const parsed = parseSpec(raw)
  const from = specNumber(parsed.from)
  const to = specNumber(parsed.to)
  if (!from && !to) return ''
  const kind = (SPEC_KINDS as readonly string[]).includes(parsed.kind) ? parsed.kind : ''
  return formatSpec(kind, from, to)
}

function SpecField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const parsed = parseSpec(value)
  const apply = (kind: string, from: string, to: string) => onChange(formatSpec(kind, from, to))
  const cycle = () => {
    const index = SPEC_KINDS.indexOf(parsed.kind as (typeof SPEC_KINDS)[number])
    const next = SPEC_KINDS[(index + 1) % SPEC_KINDS.length]
    apply(next, parsed.from, next === '범위' ? parsed.to : '')
  }
  return (
    <div className="flex h-8 min-w-0 items-center border-t border-slate-200">
      <span className="w-[58px] shrink-0 whitespace-nowrap bg-slate-50 px-1 text-[12px] font-semibold text-slate-500">도금 스펙</span>
      <button
        type="button"
        onClick={cycle}
        className={cn('no-print h-6 rounded px-1.5 text-[12px] font-semibold', parsed.kind ? 'bg-slate-900 text-white' : 'text-slate-400 hover:bg-slate-100')}
      >
        {parsed.kind || '범위'}
      </button>
      <div className="no-print ml-auto flex items-center justify-end pr-1">
        <input
          value={parsed.from}
          inputMode="decimal"
          autoComplete="off"
          onChange={(event) => apply(parsed.kind, specNumber(event.target.value), parsed.to)}
          className="h-8 w-10 bg-transparent text-right text-[13px] text-slate-900 outline-none"
        />
        {parsed.kind === '범위' && (
          <>
            <span className="px-2 text-[13px] text-slate-400">~</span>
            <input
              value={parsed.to}
              inputMode="decimal"
              autoComplete="off"
              onChange={(event) => apply('범위', parsed.from, specNumber(event.target.value))}
              className="h-8 w-10 bg-transparent text-right text-[13px] text-slate-900 outline-none"
            />
          </>
        )}
        <span className="pl-1 text-[11px] font-semibold text-slate-400">μm</span>
      </div>
      <span className="ml-auto hidden px-1 text-right text-[13px] text-slate-900 print:block">{/\d/.test(value) ? value : ''}</span>
    </div>
  )
}

function MiniField({
  label,
  value,
  onChange,
  unit,
  labelClass = 'w-11',
}: {
  label: string
  value: string
  onChange: (value: string) => void
  unit?: string
  labelClass?: string
}) {
  return (
    <label className="flex h-8 min-w-0 items-center border-t border-slate-200">
      <span className={cn('shrink-0 whitespace-nowrap bg-slate-50 px-1 text-[12px] font-semibold text-slate-500', labelClass)}>{label}</span>
      <input value={value} autoComplete="off" onChange={(event) => onChange(event.target.value)} className={cn('h-8 min-w-0 flex-1 bg-transparent px-1 text-[14px] text-slate-900 outline-none', unit && 'text-right')} />
      {unit && <span className="pr-1.5 text-[11px] font-semibold text-slate-400">{unit}</span>}
    </label>
  )
}

function BathLines({
  labels,
  rows,
  onChange,
}: {
  labels: string[]
  rows: Bath[]
  onChange: (index: number, key: keyof Bath, value: string) => void
}) {
  return (
    <div className="border-t border-slate-200">
      <div className="grid grid-cols-[76px_minmax(0,1fr)_minmax(0,1fr)] bg-slate-50 text-center text-[11px] font-bold text-slate-400">
        <span />
        <span className="border-l border-slate-200 py-0.5">V</span>
        <span className="border-l border-slate-200 py-0.5">A</span>
      </div>
      {labels.map((label, index) => (
        <div key={label} className="grid grid-cols-[76px_minmax(0,1fr)_minmax(0,1fr)] border-t border-slate-200">
          <span className="whitespace-nowrap bg-slate-50 px-0.5 py-1 text-[12px] font-semibold text-slate-600">{label}</span>
          <input value={rows[index]?.v ?? ''} autoComplete="off" onChange={(event) => onChange(index, 'v', event.target.value)} className="h-7 min-w-0 border-l border-slate-200 bg-transparent text-center text-[14px] outline-none" />
          <input value={rows[index]?.a ?? ''} autoComplete="off" onChange={(event) => onChange(index, 'a', event.target.value)} className="h-7 min-w-0 border-l border-slate-200 bg-transparent text-center text-[14px] outline-none" />
        </div>
      ))}
    </div>
  )
}

function WorkDate({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <label className="flex items-center gap-1 text-slate-500">
      <span className={cn('whitespace-nowrap text-[12px] font-semibold', !value && 'work-date-label')}>작업일자</span>
      <input type="date" value={value} onChange={(event) => onChange(event.target.value)} className={cn('work-date-field h-6 w-[8.5rem] border-0 bg-transparent p-0 text-[13px] text-slate-600 outline-none', !value && 'work-date-empty')} />
      <span className="work-date-print hidden text-[13px] text-slate-900">{value}</span>
    </label>
  )
}

function PlatingColumn({
  title,
  note,
  judge,
  extra,
  children,
}: {
  title: string
  note: string
  judge: ReactNode
  extra?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 bg-slate-100 px-1.5 py-1">
        <h3 className="text-[14px] font-bold text-slate-900">{title}</h3>
        {extra}
        <div className="ml-auto shrink-0">{judge}</div>
      </div>
      <p className="truncate border-t border-slate-200 px-1.5 py-0.5 text-[11px] text-slate-500">{note}</p>
      {children}
    </div>
  )
}

function canWriteLotCards() {
  const role = getSession()?.role
  return role === 'editor' || role === 'admin'
}

function LotCardCatalog({
  cards,
  onOpen,
  onDelete,
  canDelete,
}: {
  cards: Card[]
  onOpen: (card: Card) => void
  onDelete: (card: Card) => void
  canDelete: boolean
}) {
  const [query, setQuery] = useState('')
  const [floorFilter, setFloorFilter] = useState<'all' | Floor>('all')
  const keyword = query.trim().toLowerCase()
  const rows = cards
    .filter((item) => floorFilter === 'all' || item.floor === floorFilter)
    .filter((item) => {
      if (!keyword) return true
      return [item.partner, item.product, item.spec, item.lotNo, item.barcode, item.materialVendor]
        .some((value) => value.toLowerCase().includes(keyword))
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
              className={cn(
                'h-full rounded-md px-3 text-[15px] font-semibold',
                floorFilter === item ? 'bg-slate-900 text-white' : 'text-slate-500 hover:bg-card',
              )}
            >
              {item === 'all' ? '전체' : `${item}층`}
            </button>
          ))}
        </div>
        <label className="relative min-w-56 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="업체, 품명, LOT, 바코드 검색"
            className="h-9 w-full rounded-lg border border-input bg-background pl-9 pr-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </label>
      </div>
      {rows.length === 0 ? (
        <div className="flex h-56 flex-col items-center justify-center gap-3 text-slate-400">
          <FileText className="h-12 w-12 opacity-25" />
          <p className="text-sm">{keyword || floorFilter !== 'all' ? '조건에 맞는 이력카드가 없습니다.' : '만든 이력카드가 없습니다.'}</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <div className="min-w-[760px]">
            <div className="grid grid-cols-[1.2fr_1.3fr_1fr_0.9fr_0.5fr_1.3fr_4.5rem] gap-3 border-b bg-muted px-4 py-2 text-sm font-semibold text-muted-foreground">
              <span>업체</span>
              <span>품명</span>
              <span>LOT</span>
              <span>입고일</span>
              <span>층</span>
              <span>바코드</span>
              <span />
            </div>
            {rows.map((item) => (
              <div key={item.id} className="grid grid-cols-[1.2fr_1.3fr_1fr_0.9fr_0.5fr_1.3fr_4.5rem] items-center gap-3 border-b border-border/60 px-4 py-2.5 text-[15px] last:border-b-0 hover:bg-muted/40">
                <button type="button" onClick={() => onOpen(item)} className="contents text-left">
                  <span className="truncate font-semibold text-foreground">{item.partner || '업체 없음'}</span>
                  <span className="truncate text-foreground">{item.product || item.spec || '-'}</span>
                  <span className="truncate font-mono text-[15px] text-muted-foreground">{item.lotNo || '-'}</span>
                  <span className="text-muted-foreground">{item.receivedAt || '-'}</span>
                  <span className="font-semibold text-foreground">{item.floor}층</span>
                  <span className="truncate font-mono text-[15px] text-muted-foreground">{item.barcode || '-'}</span>
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

export function LotCardView() {
  const { user, loading: authLoading } = useAuth()
  const canWrite = user?.role === 'editor' || user?.role === 'admin'
  const [cards, setCards] = useState<Card[]>([])
  const [activeId, setActiveId] = useState('')
  const [floor, setFloor] = useState<Floor>('1')
  const [screen, setScreen] = useState<'edit' | 'list'>('edit')
  const [ready, setReady] = useState(false)
  const [companies, setCompanies] = useState<string[]>([])
  const [products, setProducts] = useState<string[]>([])
  const [specifications, setSpecifications] = useState<string[]>([])
  const [platingRows, setPlatingRows] = useState<{ company: string; product: string; gold: string; nickel: string }[]>([])
  const [approval, setApproval] = useState<ApprovalRequest | null>(null)
  const [approvalTick, setApprovalTick] = useState(0)
  const [pendingDelete, setPendingDelete] = useState<Card | null>(null)
  const savedSnapshot = useRef<Map<string, string>>(new Map())
  const cardsRef = useRef(cards)
  const saveQueue = useRef(Promise.resolve())
  cardsRef.current = cards

  useEffect(() => {
    let stop = false
    async function loadCards() {
      const response = await fetch('/api/lot-cards', { cache: 'no-store' })
      const body = await response.json().catch(() => null)
      if (stop) return
      if (!response.ok || !Array.isArray(body?.data)) {
        const local = readLocalCards()
        const loaded = local.length > 0 ? local : [normalizeCard(null)]
        setCards(loaded)
        setActiveId(loaded[0]?.id ?? '')
        setFloor(loaded[0]?.floor ?? '1')
        setReady(true)
        toast.error('이력카드를 데이터베이스에서 불러오지 못했습니다.')
        return
      }
      const loaded = (body.data as Partial<Card>[]).map((item) => normalizeCard(item))
      const serverIds = new Set(loaded.map((card) => card.id))
      const localOnly = readLocalCards().filter((card) => !serverIds.has(card.id))
      let merged = loaded
      let migrated = false
      if (canWriteLotCards() && localOnly.length > 0) {
        const uploaded = await Promise.all(localOnly.map((card) => fetch('/api/lot-cards', {
          method: 'PUT',
          headers: getJsonAuthHeaders(),
          body: JSON.stringify(card),
        })))
        migrated = uploaded.every((item) => item.ok)
        if (migrated) merged = [...localOnly, ...loaded]
      }
      if (localOnly.length === 0 || migrated) clearLocalCards()
      if (merged.length === 0) merged = [normalizeCard(null)]
      if (stop) return
      const confirmed = new Set(serverIds)
      if (migrated) for (const card of localOnly) confirmed.add(card.id)
      savedSnapshot.current = new Map(merged.filter((card) => confirmed.has(card.id)).map((card) => [card.id, JSON.stringify(card)]))
      setCards(merged)
      setActiveId(merged[0]?.id ?? '')
      setFloor(merged[0]?.floor ?? '1')
      setReady(true)
    }
    void loadCards()
    return () => { stop = true }
  }, [])

  useEffect(() => {
    let stop = false
    async function loadLists() {
      const [companyRes, productRes, specRes, platingRes] = await Promise.all([
        fetch('/api/config?name=companies', { cache: 'no-store' }).then((response) => response.json()).catch(() => null),
        fetch('/api/config?name=products', { cache: 'no-store' }).then((response) => response.json()).catch(() => null),
        fetch('/api/config?name=specifications', { cache: 'no-store' }).then((response) => response.json()).catch(() => null),
        fetch('/api/plating-info', { cache: 'no-store' }).then((response) => response.json()).catch(() => null),
      ])
      if (stop) return
      setCompanies(Array.isArray(companyRes?.data) ? companyRes.data : [])
      setProducts(Array.isArray(productRes?.data) ? productRes.data : [])
      setSpecifications(Array.isArray(specRes?.data) ? specRes.data : [])
      setPlatingRows(Array.isArray(platingRes?.rows) ? platingRes.rows : [])
    }
    void loadLists()
    return () => { stop = true }
  }, [])

  const loadApproval = useCallback(async (cardId: string) => {
    const response = await fetch('/api/approvals', { cache: 'no-store' })
    const data = await response.json().catch(() => null)
    if (!response.ok || !Array.isArray(data?.data)) return
    const rows = (data.data as ApprovalRequest[])
      .filter((item) => item.target?.kind === 'lot-card' && item.target.cardId === cardId && item.status !== 'cancelled')
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    setApproval(rows[0] ?? null)
  }, [])

  const card = cards.find((item) => item.id === activeId)
  const floorCards = cards
    .filter((item) => item.floor === floor)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))

  useEffect(() => {
    if (!ready || !card?.id) return
    void loadApproval(card.id)
  }, [ready, card?.id, approvalTick, loadApproval])

  const partnerOptions = [...new Set((card?.product
    ? platingRows.filter((row) => row.product === card.product).map((row) => row.company)
    : companies
  ).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ko'))
  const productOptions = [...new Set((card?.partner
    ? platingRows.filter((row) => row.company === card.partner).map((row) => row.product)
    : platingRows.map((row) => row.product)
  ).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ko'))
  const platingMatches = platingRows.filter((row) => row.company === card?.partner && row.product === card?.product)
  const specFor = (metal: 'Ni' | 'Au' | 'Sn') => {
    const values = [...new Set(platingMatches.flatMap((row) => {
      const nickel = metalChunk(row.nickel, metal, metal === 'Ni')
      const gold = metalChunk(row.gold, metal, metal === 'Au')
      return [nickel, gold].map(platingToSpec).filter(Boolean)
    }))]
    return values.length === 1 ? values[0] : ''
  }
  const nickel = specFor('Ni')
  const gold = specFor('Au')
  const tin = specFor('Sn')

  useEffect(() => {
    if (!ready || !card) return
    const next: Partial<Card> = {}
    if (nickel && card.niSpec !== nickel) next.niSpec = nickel
    if (gold && card.auSpec !== gold) next.auSpec = gold
    if (tin && card.snSpec !== tin) next.snSpec = tin
    if (Object.keys(next).length > 0) patch(next)
  }, [ready, card?.id, card?.partner, card?.product, nickel, gold, tin])

  useEffect(() => {
    if (!ready || authLoading || !canWrite) return
    const timer = window.setTimeout(() => {
      saveQueue.current = saveQueue.current.then(async () => {
        const current = cardsRef.current
        const nextIds = new Set(current.map((card) => card.id))
        const removed = [...savedSnapshot.current.keys()].filter((id) => !nextIds.has(id))
        const changed = current.filter((card) => savedSnapshot.current.get(card.id) !== JSON.stringify(card))
        if (removed.length === 0 && changed.length === 0) return
        const results = await Promise.all([
          ...removed.map((id) => fetch('/api/lot-cards', {
            method: 'DELETE',
            headers: getJsonAuthHeaders(),
            body: JSON.stringify({ id }),
          })),
          ...changed.map((card) => fetch('/api/lot-cards', {
            method: 'PUT',
            headers: getJsonAuthHeaders(),
            body: JSON.stringify(card),
          })),
        ])
        if (!results.every((response) => response.ok)) {
          toast.error('이력카드를 데이터베이스에 저장하지 못했습니다.')
          return
        }
        for (const id of removed) savedSnapshot.current.delete(id)
        for (const card of changed) savedSnapshot.current.set(card.id, JSON.stringify(card))
        clearLocalCards()
      }).catch(() => {
        toast.error('이력카드를 데이터베이스에 저장하지 못했습니다.')
      })
    }, 400)
    return () => window.clearTimeout(timer)
  }, [cards, ready, authLoading, canWrite])

  useEffect(() => {
    const onBefore = () => document.body.classList.add('lot-card-print')
    const onAfter = () => document.body.classList.remove('lot-card-print')
    window.addEventListener('beforeprint', onBefore)
    window.addEventListener('afterprint', onAfter)
    return () => {
      window.removeEventListener('beforeprint', onBefore)
      window.removeEventListener('afterprint', onAfter)
      document.body.classList.remove('lot-card-print')
    }
  }, [])

  function updateCard(recipe: (current: Card) => Card) {
    setCards((current) => current.map((item) => item.id === activeId ? recipe(item) : item))
  }

  function patch(partial: Partial<Card>) {
    updateCard((current) => ({ ...current, ...partial, updatedAt: new Date().toISOString() }))
  }

  function patchBath(key: 'niBaths' | 'auBaths' | 'snBaths', index: number, field: keyof Bath, value: string) {
    updateCard((current) => ({
      ...current,
      updatedAt: new Date().toISOString(),
      [key]: current[key].map((row, rowIndex) => rowIndex === index ? { ...row, [field]: value } : row),
    }))
  }

  function createCard() {
    const next = { ...emptyCard(), floor, updatedAt: new Date().toISOString() }
    setCards((current) => [next, ...current])
    setActiveId(next.id)
  }

  function clearCard() {
    const next = { ...emptyCard(), floor, updatedAt: new Date().toISOString() }
    setCards((current) => current.map((item) => item.id === activeId ? next : item))
    setActiveId(next.id)
  }

  function removeCard(id: string) {
    const removed = cards.find((item) => item.id === id)
    const next = cards.filter((item) => item.id !== id)
    setCards(next)
    if (activeId === id) {
      const sibling = next.find((item) => item.floor === removed?.floor) ?? next[0]
      setActiveId(sibling?.id ?? '')
      if (sibling) setFloor(sibling.floor)
    }
    setPendingDelete(null)
  }

  function openListed(item: Card) {
    setFloor(item.floor)
    setActiveId(item.id)
    setScreen('edit')
  }

  function openFloor(nextFloor: Floor) {
    setFloor(nextFloor)
    const onFloor = cards.filter((item) => item.floor === nextFloor).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    setActiveId(onFloor[0]?.id ?? '')
  }

  const barcodeText = card?.barcode.trim() ?? ''
  const barcodeReady = barcodeText.length > 0 && code128Modules(barcodeText) != null

  return (
    <div className={cn(PAGE_SHELL, 'lot-card-screen')}>
      <div className="no-print">
        <PageHeader
          tone="rose"
          icon={Barcode}
          eyebrow="재고 관리"
          title="LOT 이력카드"
          description="목록에서 만든 이력카드를 고르거나, 작성 화면에서 칸을 채워 인쇄합니다."
          actions={screen === 'edit' ? (
            <>
              {canWrite && (
                <Button variant="outline" className={BAND_BUTTON} disabled={!card} onClick={clearCard}>
                  내용 지우기
                </Button>
              )}
              <Button className={BAND_BUTTON_PRIMARY} disabled={!card} onClick={() => window.print()}>
                <Printer className="h-4 w-4" /> 인쇄
              </Button>
            </>
          ) : undefined}
        />
        <div role="tablist" aria-label="이력카드 화면" className="mt-4">
          <div className="flex gap-1">
            {([['edit', '작성'], ['list', '목록']] as const).map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={screen === id}
                onClick={() => setScreen(id)}
                className={cn(
                  'border-b-[3px] px-4 py-2.5 text-[15px] font-medium',
                  screen === id
                    ? 'border-slate-950 text-slate-950 dark:border-white dark:text-white'
                    : 'border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100',
                )}
              >
                {label}
                {id === 'list' && <span className="ml-2 text-xs tabular-nums text-slate-400">{cards.length}</span>}
              </button>
            ))}
          </div>
          <div className="h-[2px] bg-slate-700 dark:bg-white/70" />
        </div>
      </div>

      {screen === 'list' ? <LotCardCatalog cards={cards} onOpen={openListed} onDelete={setPendingDelete} canDelete={canWrite} /> : (
      <div className="flex min-h-[calc(100vh-13rem)] items-stretch gap-4">
        <aside className="no-print flex w-80 shrink-0 flex-col overflow-hidden rounded-xl border bg-card shadow-sm">
          <div className="grid grid-cols-3 gap-1 border-b p-2" role="tablist" aria-label="층">
            {FLOORS.map((item) => (
              <button
                key={item}
                type="button"
                role="tab"
                aria-selected={floor === item}
                onClick={() => openFloor(item)}
                className={cn(
                  'h-8 rounded-md text-[15px] font-semibold',
                  floor === item ? 'bg-slate-900 text-white' : 'text-slate-500 hover:bg-slate-100',
                )}
              >
                {item}층
              </button>
            ))}
          </div>
          {canWrite && (
            <div className="border-b p-2">
              <Button type="button" variant="outline" className="h-8 w-full text-[14px]" onClick={createCard}>
                <Plus className="h-3.5 w-3.5" />
                {floor}층 카드 추가
              </Button>
            </div>
          )}
          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {floorCards.length === 0 ? (
              <p className="px-2 py-6 text-center text-[14px] text-slate-400">{floor}층 이력카드가 없습니다</p>
            ) : floorCards.map((item) => {
              const selected = item.id === card?.id
              return (
                <div key={item.id} className={cn('mb-1 flex items-stretch rounded-lg', selected ? 'bg-slate-900 text-white' : 'hover:bg-slate-100')}>
                  <button type="button" onClick={() => setActiveId(item.id)} className="min-w-0 flex-1 px-2.5 py-2 text-left">
                    <span className="block truncate text-[15px] font-semibold">{item.product || item.lotNo || '새 이력카드'}</span>
                    <span className="mt-1 flex flex-wrap gap-x-2.5 gap-y-0.5 text-[12px]">
                      <CardMeta label="업체" value={item.partner || '-'} selected={selected} />
                      <CardMeta label="작성" value={cardDate(item.createdAt)} selected={selected} />
                      {item.receivedAt && <CardMeta label="입고" value={item.receivedAt} selected={selected} />}
                      {item.lotNo && <CardMeta label="LOT" value={item.lotNo} selected={selected} />}
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
        {card ? (
      <div className="flex min-w-0 flex-1 flex-col overflow-x-auto">
        <article className={cn('lot-card-sheet flex min-h-full w-full flex-1 flex-col gap-2 bg-white px-[6mm] py-[5mm] text-slate-900 shadow-md ring-1 ring-black/10 print:shadow-none print:ring-0', !canWrite && '[&_input]:pointer-events-none [&_select]:pointer-events-none [&_textarea]:pointer-events-none [&_button]:pointer-events-none [&_[role=button]]:pointer-events-none')}>
          <header className="flex items-stretch overflow-hidden rounded-md border border-slate-400">
            <div className="relative flex flex-1 items-center justify-center px-3 py-3">
              <img src="/logo.png" alt="WOORI" className="absolute left-3 top-1/2 h-11 w-auto -translate-y-1/2 object-contain" />
              <h2 className="text-center text-[22px] font-extrabold tracking-[0.16em] text-slate-900">LOT 이력카드</h2>
              {canWrite && <div className="no-print absolute right-3 top-1/2 -translate-y-1/2">
                <StampApprovalButton
                  target={{ kind: 'lot-card', cardId: card.id, label: card.lotNo || card.product || '이력카드' }}
                  title={`LOT 이력카드 ${card.lotNo || card.product || ''}`.trim().slice(0, 80)}
                  body={[
                    card.partner && `협력업체 ${card.partner}`,
                    card.product && `품명 ${card.product}`,
                    card.spec && `규격 ${card.spec}`,
                    card.lotNo && `LOT ${card.lotNo}`,
                    card.receivedAt && `입고일 ${card.receivedAt}`,
                    (card.seqNo || card.rollCount) && `순번 ${card.seqNo || '-'} / 롤수 ${card.rollCount || '-'}`,
                    (card.quantity || card.platedQuantity) && `수량(무게) ${card.quantity || '-'} / 도금 후 수량(무게) ${card.platedQuantity || '-'}`,
                    card.materialVendor && `원자재 ${card.materialVendor}`,
                  ].filter(Boolean).join('\n') || 'LOT 이력카드'}
                  disabled={approval?.status === 'pending' || approval?.status === 'approved'}
                  hint={approval?.status === 'approved' ? '결재가 끝났습니다.' : '이미 결재 중입니다.'}
                  onSent={() => setApprovalTick((value) => value + 1)}
                  className="text-[14px]"
                />
              </div>}
            </div>
            <ApprovalBox approval={approval} />
          </header>

          <div className="overflow-hidden rounded-md border border-slate-300">
            <div className="grid grid-cols-2">
              <div className="divide-y divide-slate-200">
                <ListSlot label="협력 업체" configName="companies" options={partnerOptions} value={card.partner} onChange={(partner) => {
                  const names = [...new Set(platingRows.filter((row) => row.company === partner).map((row) => row.product).filter(Boolean))]
                  const product = names.includes(card.product) ? card.product : names.length === 1 ? names[0] : ''
                  patch({ partner, product })
                }} onOptionsChange={setCompanies} creatable={!card.product} />
                <ListSlot label="품명" configName="products" options={productOptions} value={card.product} onChange={(product) => {
                  const names = [...new Set(platingRows.filter((row) => row.product === product).map((row) => row.company).filter(Boolean))]
                  const partner = names.includes(card.partner) ? card.partner : names.length === 1 ? names[0] : ''
                  patch({ product, partner })
                }} onOptionsChange={setProducts} creatable={false} />
                <ListSlot label="규격" configName="specifications" options={specifications} value={card.spec} onChange={(spec) => patch({ spec })} onOptionsChange={setSpecifications} />
                <Slot label="LOT NO." value={card.lotNo} onChange={(lotNo) => patch({ lotNo })} />
              </div>
              <div className="divide-y divide-slate-200 border-l border-slate-300">
                <Slot label="입고일자" type="date" value={card.receivedAt} onChange={(receivedAt) => patch({ receivedAt })} />
                <div className="grid grid-cols-2 divide-x divide-slate-200">
                  <Slot compact label="순번" value={card.seqNo} onChange={(seqNo) => patch({ seqNo })} />
                  <Slot compact label="롤수" value={card.rollCount} onChange={(rollCount) => patch({ rollCount })} />
                </div>
                <div className="grid grid-cols-2 divide-x divide-slate-200">
                  <Slot compact label="수량(무게)" value={card.quantity} onChange={(quantity) => patch({ quantity })} />
                  <Slot compact label="도금 후 수량(무게)" value={card.platedQuantity} onChange={(platedQuantity) => patch({ platedQuantity })} />
                </div>
                <Slot label="원자재 업체명" value={card.materialVendor} onChange={(materialVendor) => patch({ materialVendor })} labelClass="w-[96px] px-1.5" />
              </div>
            </div>
          </div>
          <Section
            title="수입검사"
            note="n=30cm (1Reel) · Ac=0"
            judge={<JudgeMark onlyOk value={card.incomingJudge} onChange={(incomingJudge) => patch({ incomingJudge })} />}
            extra={<WorkDate value={card.incomingDate} onChange={(incomingDate) => patch({ incomingDate })} />}
          >
            <div className="grid grid-cols-3 divide-x divide-slate-200">
              <Slot label="전폭" unit="mm" value={card.incomingFullWidth} onChange={(incomingFullWidth) => patch({ incomingFullWidth })} />
              <Slot label="간격" unit="mm" value={card.incomingGap} onChange={(incomingGap) => patch({ incomingGap })} />
              <Slot label="도금폭" unit="mm" value={card.incomingPlateWidth} onChange={(incomingPlateWidth) => patch({ incomingPlateWidth })} />
            </div>
          </Section>

          <Section
            title="마스킹"
            note="이음매 n=30cm (1Reel) · Ac=0"
            judge={<JudgeMark value={card.maskJudge} onChange={(maskJudge) => patch({ maskJudge })} />}
            extra={<WorkDate value={card.maskDate} onChange={(maskDate) => patch({ maskDate })} />}
          >
            <div className="grid grid-cols-3 divide-x divide-slate-200">
              <Slot label="전폭" unit="mm" value={card.maskFullWidth} onChange={(maskFullWidth) => patch({ maskFullWidth })} />
              <Slot label="간격" unit="mm" value={card.maskGap} onChange={(maskGap) => patch({ maskGap })} />
              <Slot label="도금폭" unit="mm" value={card.maskPlateWidth} onChange={(maskPlateWidth) => patch({ maskPlateWidth })} />
            </div>
          </Section>

          <div className="grid grid-cols-3 divide-x divide-slate-300 overflow-hidden rounded-md border border-slate-300">
            <PlatingColumn title="Ni 공정" note="초/종물 · 이음매 50cm 제외 · Ac=0" judge={<JudgeMark value={card.niJudge} onChange={(niJudge) => patch({ niJudge })} />} extra={<WorkDate value={card.niDate} onChange={(niDate) => patch({ niDate })} />}>
              <SpecField value={card.niSpec} onChange={(niSpec) => patch({ niSpec })} />
              <MiniField label="초물" unit="μm" value={card.niFirst} onChange={(niFirst) => patch({ niFirst })} />
              <MiniField label="종물" unit="μm" value={card.niLast} onChange={(niLast) => patch({ niLast })} />
              <BathLines labels={NI_BATHS} rows={card.niBaths} onChange={(index, key, value) => patchBath('niBaths', index, key, value)} />
            </PlatingColumn>
            <PlatingColumn title="Au 공정" note="초/종물 · 이음매 50cm 제외 · Ac=0" judge={<JudgeMark value={card.auJudge} onChange={(auJudge) => patch({ auJudge })} />} extra={<WorkDate value={card.auDate} onChange={(auDate) => patch({ auDate })} />}>
              <SpecField value={card.auSpec} onChange={(auSpec) => patch({ auSpec })} />
              <MiniField label="초물" unit="μm" value={card.auFirst} onChange={(auFirst) => patch({ auFirst })} />
              <MiniField label="종물" unit="μm" value={card.auLast} onChange={(auLast) => patch({ auLast })} />
              <BathLines labels={AU_BATHS} rows={card.auBaths} onChange={(index, key, value) => patchBath('auBaths', index, key, value)} />
            </PlatingColumn>
            <PlatingColumn title="Sn 주석" note="초/종물 · 이음매 50cm 제외 · Ac=0" judge={<JudgeMark value={card.snJudge} onChange={(snJudge) => patch({ snJudge })} />} extra={<WorkDate value={card.snDate} onChange={(snDate) => patch({ snDate })} />}>
              <SpecField value={card.snSpec} onChange={(snSpec) => patch({ snSpec })} />
              <MiniField label="초물" unit="μm" value={card.snFirst} onChange={(snFirst) => patch({ snFirst })} />
              <MiniField label="종물" unit="μm" value={card.snLast} onChange={(snLast) => patch({ snLast })} />
              <BathLines labels={SN_BATHS} rows={card.snBaths} onChange={(index, key, value) => patchBath('snBaths', index, key, value)} />
            </PlatingColumn>
          </div>

          <Section
            title="출하검사"
            note="이음매 50cm 제외 · Ac=0"
            judge={<JudgeMark value={card.shipJudge} onChange={(shipJudge) => patch({ shipJudge })} />}
            extra={<WorkDate value={card.shipDate} onChange={(shipDate) => patch({ shipDate })} />}
          >
            <div className="grid grid-cols-6 divide-x divide-slate-200">
              <Slot compact label="Ni두께" unit="μm" value={card.niThickness} onChange={(niThickness) => patch({ niThickness })} />
              <Slot compact label="Au두께" unit="μm" value={card.auThickness} onChange={(auThickness) => patch({ auThickness })} />
              <Slot compact label="Sn두께" unit="μm" value={card.snThickness} onChange={(snThickness) => patch({ snThickness })} />
              <Slot compact label="밀착" value={card.adhesion} onChange={(adhesion) => patch({ adhesion })} />
              <Slot compact label="납땜성" value={card.solder} onChange={(solder) => patch({ solder })} />
              <Slot compact label="염수" value={card.salt} onChange={(salt) => patch({ salt })} />
            </div>
          </Section>

          <div className="overflow-hidden rounded-md border border-slate-300 px-2 py-2">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[12px] font-semibold text-slate-400">바코드</span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="no-print h-7 px-2.5 text-[14px]"
                onClick={() => patch({ barcode: randomBarcode() })}
              >
                <Shuffle className="h-3.5 w-3.5" />
                생성
              </Button>
            </div>
            <div className="overflow-x-auto">
              <div className="flex min-w-max justify-center">
                {barcodeReady ? <CodeBars value={barcodeText} /> : <span className="block h-24 w-40 rounded border border-dashed border-slate-300" />}
              </div>
            </div>
            <input value={card.barcode} autoComplete="off" onChange={(event) => patch({ barcode: event.target.value })} className="mt-1 w-full bg-transparent text-center font-mono text-[15px] tracking-[0.12em] text-slate-900 outline-none" />
            {barcodeText && !barcodeReady && <span className="no-print block text-center text-[11px] text-red-600">영문·숫자만 표시됩니다</span>}
          </div>

          <footer className="flex items-center justify-between px-0.5 text-[12px] text-slate-500">
            <span>QEP-400-01 (Rev.0)</span>
            <span>A4 (210×297)</span>
          </footer>
        </article>
      </div>
        ) : (
          <div className="flex min-h-64 flex-1 items-center justify-center rounded-xl border border-dashed border-slate-300 text-[15px] text-slate-400">
            {floor}층 카드를 추가하면 이력카드가 열립니다
          </div>
        )}
      </div>
      )}
      <ConfirmDeleteDialog
        open={pendingDelete != null}
        onOpenChange={(open) => { if (!open) setPendingDelete(null) }}
        title="이력카드 삭제"
        onConfirm={() => { if (pendingDelete) removeCard(pendingDelete.id) }}
      >
        {pendingDelete ? `${pendingDelete.product || pendingDelete.lotNo || '이 이력카드'}를 목록에서 삭제합니다.` : '이 이력카드를 목록에서 삭제합니다.'}
      </ConfirmDeleteDialog>
    </div>
  )
}
