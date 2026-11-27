'use client'

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import { Barcode, Check, Copy, FileText, Printer, Save, Search } from 'lucide-react'
import { useAuth } from '@/components/auth/auth-context'
import { SignatureOrName } from '@/components/shared/signature-or-name'
import { Button } from '@/components/ui/button'
import { SearchableCombobox } from '@/components/ui/searchable-combobox'
import { ConfirmDeleteDialog } from '@/components/shared/confirm-delete-dialog'
import { BAND_BUTTON, BAND_BUTTON_PRIMARY, PAGE_SHELL, PageHeader } from '@/components/shared/page-header'
import { ShipmentDocFlowNav } from '@/components/shipment/shipment-doc-flow-nav'
import { ShipmentTabNav } from '@/components/shipment/shipment-tab-nav'
import { DocSiblingList } from '@/components/shipment/doc-sibling-list'
import { type ApprovalRequest, type ApprovalStep } from '@/lib/approval'
import { getJsonAuthHeaders, getSession } from '@/lib/auth-client'
import { withShipmentBundle } from '@/lib/shipment-bundle'
import { saveSheetDocument } from '@/lib/sheet-document'
import { LOT_CARD_TYPE } from '@/lib/file-types'
import { useEmbedPreview } from '@/hooks/use-embed-preview'
import { cn } from '@/lib/utils'
import { defaultLotNo } from '@/lib/lot'

const STORAGE_KEY = 'woorihip-lot-card-draft'
const LIST_KEY = 'woorihip-lot-cards'
const FLOORS = ['1', '2', '3'] as const

type Floor = (typeof FLOORS)[number]

type Judge = '' | '합격' | '불합격' | '특채'

/** 예전 기록의 OK/NG 판정을 합격/불합격으로 읽는다. */
function judgeOf(value: unknown): Judge {
  if (value === 'OK' || value === '합격') return '합격'
  if (value === 'NG' || value === '불합격') return '불합격'
  return value === '특채' ? '특채' : ''
}
type Bath = { v: string; a: string }
type Measure = { left: string; right: string }

type PlatedItem = { name: string; value: string }

type Card = {
  id: string
  /** 고른 양식 id (lib/doc-forms.ts). 없으면 기본 양식. */
  formId?: string
  /** 같은 입고 카드 목록에서의 순서. 없으면 만든 순서 뒤에 붙는다. */
  sortOrder?: number
  floor: Floor
  done: boolean
  createdAt: string
  updatedAt: string
  partner: string
  product: string
  spec: string
  material: string
  sourceIncomingId: string
  lotNo: string
  receivedAt: string
  seqNo: string
  rollCount: string
  /** 전체 수량(무게). 수입검사 성적서의 LOT 중량에서 가져온다. */
  quantity: string
  /** 이 이력카드(롤)가 맡은 무게. 복사한 카드마다 따로 적는다. */
  rollWeight: string
  /** 고객(협력업체) 쪽 LOT 번호 */
  customerLot: string
  platedQuantity: string
  materialVendor: string
  /** 분리 NO (원래 종이 양식 항목) */
  splitNo?: string
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
  /** 도금 후 전폭·간격·도금폭 */
  platedFullWidth: string
  platedGap: string
  platedPlateWidth: string
  /** 도금 부위가 여러 개인 품목의 두 번째·세 번째 간격과 두 번째 도금폭 */
  platedGap2?: string
  platedPlateWidth2?: string
  platedGap3?: string
  /** 도금 후 칸 목록 (이름·값). 없으면 도금 정보 설정의 간격·도금폭 개수로 만든다. 손으로 더하고 뺄 수 있다. */
  platedItems?: PlatedItem[]
  /** 마스킹 칸 목록 (도금 후와 같은 방식) */
  maskItems?: PlatedItem[]
  /** 도금 후 칸의 작업일자와 판정 */
  platedDate: string
  platedJudge: Judge
  maskJudge: Judge
  /** 마스킹 작업 조건과 확인 (원래 종이 양식 항목) */
  maskHeat?: string
  maskSpeed?: string
  maskPressure?: string
  maskTape?: string
  maskWear?: string
  /** 도금 공정별 TAPE 잔여물 확인·밀착검사 OK/NG */
  niTape?: string
  niStrip?: string
  auTape?: string
  auStrip?: string
  snTape?: string
  snStrip?: string
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
    done: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    partner: '', product: '', spec: '', material: '', sourceIncomingId: '',
    lotNo: '', receivedAt: '', seqNo: '', rollCount: '', quantity: '', rollWeight: '', customerLot: '', platedQuantity: '', materialVendor: '',
    barcode: '',
    incoming: [{ left: '', right: '' }, { left: '', right: '' }],
    incomingFullWidth: '', incomingGap: '', incomingPlateWidth: '', incomingDate: '',
    incomingJudge: '',
    niSpec: '', niDate: '', niBaths: baths(5), niFirst: '', niLast: '', niJudge: '',
    maskDate: '', workDate: '', maskFullWidth: '', maskGap: '', maskPlateWidth: '', platedFullWidth: '', platedGap: '', platedPlateWidth: '', platedDate: '', platedJudge: '', maskJudge: '',
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
    done: saved?.done === true,
    createdAt: saved?.createdAt || saved?.updatedAt || base.createdAt,
    updatedAt: saved?.updatedAt || base.updatedAt,
    workDate: saved?.workDate || saved?.maskDate || saved?.niDate || saved?.auDate || saved?.snDate || saved?.shipDate || '',
    incomingDate: saved?.incomingDate || saved?.workDate || '',
    maskDate: saved?.maskDate || saved?.workDate || '',
    niDate: saved?.niDate || saved?.workDate || '',
    auDate: saved?.auDate || saved?.workDate || '',
    snDate: saved?.snDate || saved?.workDate || '',
    shipDate: saved?.shipDate || saved?.workDate || '',
    material: typeof saved?.material === 'string' ? saved.material : '',
    sourceIncomingId: typeof saved?.sourceIncomingId === 'string' ? saved.sourceIncomingId : '',
    incomingJudge: judgeOf(saved?.incomingJudge),
    niJudge: judgeOf(saved?.niJudge),
    maskJudge: judgeOf(saved?.maskJudge),
    auJudge: judgeOf(saved?.auJudge),
    snJudge: judgeOf(saved?.snJudge),
    platedJudge: judgeOf(saved?.platedJudge),
    shipJudge: judgeOf(saved?.shipJudge),
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
  const options: Judge[] = onlyOk ? ['합격'] : ['합격', '불합격', '특채']
  return (
    <div className={cn('flex overflow-hidden border border-black bg-white print:overflow-visible print:bg-transparent', value ? 'print:border-0' : 'print:hidden')}>
      {options.map((option) => {
        const selected = value === option
        return (
          <button
            key={option}
            type="button"
            onClick={() => onChange(selected ? '' : option)}
            className={cn(
              'px-2 py-0.5 text-[12px] font-bold',
              selected
                ? cn(
                    'bg-slate-900 text-white print:rounded-full print:border-2 print:bg-transparent print:px-3 print:py-0 print:text-[13px] print:leading-5 print:font-extrabold',
                    option === '합격' && 'print:border-black print:text-black',
                    option === '불합격' && 'print:border-rose-600 print:text-rose-600',
                    option === '특채' && 'print:border-amber-600 print:text-amber-600',
                  )
                : 'text-slate-400 print:hidden',
            )}
          >
            {option}
          </button>
        )
      })}
    </div>
  )
}

const inputClass = 'h-9 min-w-0 flex-1 bg-transparent px-2 text-[14px] text-black outline-none'

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
      <span className={cn('shrink-0 whitespace-nowrap bg-white text-[12px] font-semibold text-black', labelClass ?? (compact ? 'px-1.5' : 'w-[80px] px-2'))}>{label}</span>
      <input type={type} value={value ?? ''} autoComplete="off" onChange={(event) => onChange(event.target.value)} className={cn(inputClass, type === 'date' && 'px-1', unit && 'pr-1 text-right')} />
      {unit && <span className="pr-2 text-[12px] font-semibold text-black">{unit}</span>}
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
      <span className="w-[80px] shrink-0 bg-white px-2 text-[12px] font-semibold text-black">{label}</span>
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
        className="h-9 flex-1 rounded-none border-0 bg-transparent px-2 text-[14px] font-normal text-black shadow-none hover:bg-transparent print:[&_[role=button]]:hidden print:[&_svg]:hidden"
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
      <span className={cn('shrink-0 text-[11px] font-semibold', selected ? 'text-white/50' : 'text-black')}>{label}</span>
      <span className={cn('truncate', selected ? 'text-white/90' : 'text-black')}>{value}</span>
    </span>
  )
}

function signStep(approval: ApprovalRequest | null, slot: '작성' | '검토' | '승인') {
  if (!approval) return undefined
  if (slot === '작성') return approval.steps.find((step) => !step.role) ?? approval.steps[0]
  if (slot === '검토') return approval.steps.find((step) => step.role === 'review')
  return approval.steps.find((step) => step.role === 'approval')
}

function ApprovalBox({ name, jobTitle }: { name: string; jobTitle?: string }) {
  // 작성: 지금 로그인한 사람의 서명을 자동으로 넣는다. 승인: 조승현 부장 서명.
  const writer = [name, jobTitle].filter(Boolean).join(' ')
  return (
    <div className="flex h-full w-[84mm] shrink-0 flex-col self-stretch">
      <table className="h-full w-full table-fixed border-collapse text-center [&_tr:first-child>*]:border-t-0 [&_tr:last-child>*]:border-b-0 [&_tr>*:last-child]:border-r-0">
        <colgroup>
          <col className="w-8" />
          <col />
          <col />
        </colgroup>
        <tbody>
          <tr>
            <th rowSpan={3} className="w-8 border border-b-0 border-black bg-slate-300 px-0.5 text-[12px] font-extrabold tracking-[0.25em] text-black [writing-mode:vertical-rl]">
              결재
            </th>
            {(['작성', '승인'] as const).map((label) => (
              <th key={label} className="border border-black bg-white py-1 text-[13px] font-bold text-black">{label}</th>
            ))}
          </tr>
          <tr>
            <td className="h-16 border border-black bg-white px-1">
              <SignatureOrName src="/api/auth/signature" name={writer} className="mx-auto h-12 w-auto max-w-[90%] object-contain" />
            </td>
            <td className="h-16 border border-black bg-white px-1">
              <SignatureOrName src="/api/auth/signature?approver=1" name="조승현 부장" className="mx-auto h-12 w-auto max-w-[90%] object-contain" />
            </td>
          </tr>
          <tr>
            <td className="border border-black bg-white px-2 py-1.5 text-[12px] font-semibold leading-none whitespace-nowrap text-black">{writer}</td>
            <td className="border border-black bg-white px-2 py-1.5 text-[12px] font-semibold leading-none whitespace-nowrap text-black">조승현 부장</td>
          </tr>
        </tbody>
      </table>
    </div>
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
    <div className="flex h-8 min-w-0 items-center border-t border-black">
      <span className="w-[58px] shrink-0 whitespace-nowrap bg-white px-1 text-[12px] font-semibold text-black">도금 스펙</span>
      <button
        type="button"
        onClick={cycle}
        className={cn('no-print h-6  px-1.5 text-[12px] font-semibold', parsed.kind ? 'bg-slate-900 text-white' : 'text-slate-400 hover:bg-slate-100')}
      >
        {parsed.kind || '범위'}
      </button>
      <div className="no-print ml-auto flex items-center justify-end pr-1">
        <input
          value={parsed.from}
          inputMode="decimal"
          autoComplete="off"
          onChange={(event) => apply(parsed.kind, specNumber(event.target.value), parsed.to)}
          className="h-8 w-10 bg-transparent text-right text-[13px] text-black outline-none"
        />
        {parsed.kind === '범위' && (
          <>
            <span className="px-2 text-[13px] text-black">~</span>
            <input
              value={parsed.to}
              inputMode="decimal"
              autoComplete="off"
              onChange={(event) => apply('범위', parsed.from, specNumber(event.target.value))}
              className="h-8 w-10 bg-transparent text-right text-[13px] text-black outline-none"
            />
          </>
        )}
        <span className="pl-1 text-[11px] font-semibold text-black">μm</span>
      </div>
      <span className="ml-auto hidden px-1 text-right text-[13px] text-black print:block">{/\d/.test(value) ? value : ''}</span>
    </div>
  )
}

/** OK/NG 두 버튼 중 하나를 고른다. 다시 누르면 선택이 풀린다. 인쇄에는 고른 값만 나온다. */
function OkNgSlot({ label, value, onChange, labelClass = 'w-[80px]' }: { label: string; value: string; onChange: (value: string) => void; labelClass?: string }) {
  // 이름 칸 폭을 일정하게 둬서 위아래 줄의 OK·NG 가 같은 자리에 오게 한다.
  return (
    <div className="flex min-h-9 items-center">
      <span className={cn('shrink-0 whitespace-nowrap bg-white px-2 text-[12px] font-semibold text-black', labelClass)}>{label}</span>
      <div className="flex flex-1 items-center gap-1 px-1 print:hidden">
        {(['OK', 'NG'] as const).map((option) => {
          const selected = value === option
          return (
            <button
              key={option}
              type="button"
              aria-pressed={selected}
              onClick={() => onChange(selected ? '' : option)}
              className={cn(
                ' px-2.5 py-0.5 text-[12px] font-bold',
                selected ? 'bg-slate-900 text-white' : 'border border-black text-slate-400',
              )}
            >
              {option}
            </button>
          )
        })}
      </div>
      {/* 인쇄: 고르지 않았어도 □ OK □ NG 두 칸을 모두 찍고, 고른 쪽만 ☑ 로 표시한다. */}
      <div className="hidden flex-1 items-center gap-3 px-1 text-[13px] font-bold text-black print:flex">
        {(['OK', 'NG'] as const).map((option) => (
          <span key={option} className="inline-flex items-center gap-1">
            <span className="text-[15px] leading-none">{value === option ? '☑' : '☐'}</span>
            {option}
          </span>
        ))}
      </div>
    </div>
  )
}

type JudgeKey = 'maskJudge' | 'platedJudge' | 'niJudge' | 'auJudge' | 'snJudge' | 'shipJudge'

/** 공정 판정을 자동으로 정할 때 보는 칸들 */
const JUDGED_FIELDS: Record<JudgeKey, (keyof Card)[]> = {
  maskJudge: ['maskItems', 'maskHeat', 'maskSpeed', 'maskPressure', 'maskTape', 'maskWear'],
  platedJudge: ['platedItems'],
  niJudge: ['niFirst', 'niLast', 'niTape', 'niStrip'],
  auJudge: ['auFirst', 'auLast', 'auTape', 'auStrip'],
  snJudge: ['snFirst', 'snLast', 'snTape', 'snStrip'],
  shipJudge: ['niThickness', 'auThickness', 'snThickness', 'adhesion', 'solder', 'salt'],
}

const PLATED_CELLS = 6
const PLATED_CIRCLED = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧']

/** 간격·도금폭이 두 개 이상이면 간격 ①, 간격 ② 처럼 번호를 붙이고, 하나만 남으면 번호를 뗀다. */
function renumberPlated(items: PlatedItem[]): PlatedItem[] {
  let next = items
  for (const base of ['간격', '도금폭']) {
    const same = (name: string) => new RegExp(`^${base}(?: [①-⑧])?$`).test(name)
    const count = next.filter((item) => same(item.name)).length
    let no = 0
    next = next.map((item) => (same(item.name) ? { ...item, name: count > 1 ? `${base} ${PLATED_CIRCLED[(no += 1) - 1]}` : base } : item))
  }
  return next
}

/**
 * 도금 후 기본 칸: 전폭 + 도금 정보 설정의 간격·도금폭 개수만큼 (간격 → 도금폭 → 간격 … 순서).
 * 설정이 없으면 전폭·간격·도금폭. 예전에 칸마다 따로 적어 둔 값은 같은 자리에 넣는다.
 */
function dimensionDefaults(old: { full: string; gaps: string[]; plates: string[] }, setting?: { gap?: string; plateWidth?: string }): PlatedItem[] {
  const split = (value?: string) => (value ?? '').split(/[\/,]/).map((part) => part.trim()).filter(Boolean)
  const gapCount = Math.max(split(setting?.gap).length, 1)
  const plateCount = Math.max(split(setting?.plateWidth).length, 1)
  const oldGaps = old.gaps
  const oldPlates = old.plates
  const items: PlatedItem[] = [{ name: '전폭', value: old.full }]
  for (let index = 0; index < Math.max(gapCount, plateCount); index += 1) {
    if (index < gapCount) items.push({ name: '간격', value: oldGaps[index] ?? '' })
    if (index < plateCount) items.push({ name: '도금폭', value: oldPlates[index] ?? '' })
  }
  return renumberPlated(items).slice(0, PLATED_CELLS)
}

/**
 * 도금 후 6칸 (3칸 × 2줄). 칸 이름도 값처럼 바로 지우고 고쳐 쓸 수 있다.
 * 이름이 빈 칸은 화면에서 흐린 안내 글씨만 보이고, 인쇄에는 빈칸으로 나온다.
 */
function PlatedCells({ items, onChange }: { items: PlatedItem[]; onChange: (items: PlatedItem[]) => void }) {
  const cells = Array.from({ length: PLATED_CELLS }, (_, index) => items[index] ?? { name: '', value: '' })
  const edit = (index: number, partial: Partial<PlatedItem>) => onChange(cells.map((cell, i) => (i === index ? { ...cell, ...partial } : cell)))
  return (
    <>
      {[0, 1].map((row) => (
        <div key={row} className={cn('grid grid-cols-3 divide-x divide-black', row > 0 && 'border-t border-black')}>
          {[0, 1, 2].map((column) => {
            const index = row * 3 + column
            const cell = cells[index]
            return (
              <label key={column} className="flex min-h-9 min-w-0 items-center">
                <input
                  value={cell.name}
                  autoComplete="off"
                  placeholder="항목"
                  onChange={(event) => edit(index, { name: event.target.value })}
                  className="h-9 w-[80px] shrink-0 bg-transparent px-2 text-[12px] font-semibold text-black outline-none placeholder:font-normal placeholder:text-slate-300 print:placeholder:text-transparent"
                />
                <input value={cell.value} autoComplete="off" onChange={(event) => edit(index, { value: event.target.value })} className="h-9 min-w-0 flex-1 bg-transparent px-2 pr-1 text-right text-[14px] text-black outline-none" />
                <span className="pr-2 text-[12px] font-semibold text-black">mm</span>
              </label>
            )
          })}
        </div>
      ))}
    </>
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
    <section className="overflow-hidden  border border-black">
      <div className="flex items-center gap-2 border-b border-black bg-slate-300 px-2.5 py-1.5">
        <h3 className="text-base font-bold text-black">{title}</h3>
        {extra}
        {note && <p className="truncate text-[12px] text-black">{note}</p>}
        <div className="ml-auto shrink-0">{judge}</div>
      </div>
      {children}
    </section>
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
    <label className="flex h-8 min-w-0 items-center border-t border-black">
      <span className={cn('shrink-0 whitespace-nowrap bg-white px-1 text-[12px] font-semibold text-black', labelClass)}>{label}</span>
      <input value={value} autoComplete="off" onChange={(event) => onChange(event.target.value)} className={cn('h-8 min-w-0 flex-1 bg-transparent px-1 text-[14px] text-black outline-none', unit && 'text-right')} />
      {unit && <span className="pr-1.5 text-[11px] font-semibold text-black">{unit}</span>}
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
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 bg-slate-300 px-1.5 py-1.5 print:h-9 print:flex-nowrap print:py-0">
        <h3 className="text-[14px] font-bold text-black">{title}</h3>
        {extra}
        <div className="ml-auto shrink-0">{judge}</div>
      </div>
      <p className="truncate border-t border-black px-1.5 py-0.5 text-[11px] text-black">{note}</p>
      {children}
    </div>
  )
}

function WorkDate({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <label className="flex items-center gap-1 text-black">
      <span className={cn('whitespace-nowrap text-[12px] font-semibold', !value && 'work-date-label')}>작업일자</span>
      <input type="date" value={value} onChange={(event) => onChange(event.target.value)} className={cn('work-date-field h-6 w-[7.5rem] border-0 bg-transparent p-0 text-[13px] text-black outline-none', !value && 'work-date-empty')} />
      <span className="work-date-print hidden text-[13px] text-black">{value}</span>
    </label>
  )
}

function canWriteLotCards() {
  const role = getSession()?.role
  return role === 'editor' || role === 'admin'
}

/**
 * 복사한 카드의 LOT 번호. 같은 묶음에서 가장 큰 꼬리 번호 + 1.
 * 예) 20261126-01 → 20261126-02. 꼬리 번호가 없으면 원본을 01 로 보고 -02 를 붙인다.
 * 지운 번호는 다시 쓰지 않는다. LOT 가 비어 있으면 비워 둔다.
 */
/** 복사한 카드의 순번: 같은 입고 카드들의 순번 중 가장 큰 수 + 1 (자릿수 유지). 숫자가 아니면 그대로 둔다. */
function nextSeqNo(seq: string, siblingSeqs: string[]) {
  const trimmed = (seq ?? '').trim()
  if (!/^\d+$/.test(trimmed)) return seq
  const max = Math.max(Number(trimmed), ...siblingSeqs.map((value) => (value ?? '').trim()).filter((value) => /^\d+$/.test(value)).map(Number))
  return String(max + 1).padStart(trimmed.length, '0')
}

function nextLotNo(lot: string, siblingLots: string[]) {
  const trimmed = lot.trim()
  if (!trimmed) return ''
  const match = trimmed.match(/^(.*)-(\d+)$/)
  const base = match ? match[1] : trimmed
  const width = match ? match[2].length : 2
  let max = 1
  for (const other of siblingLots) {
    const value = other.trim()
    if (value.startsWith(`${base}-`) && /^\d+$/.test(value.slice(base.length + 1))) {
      max = Math.max(max, Number(value.slice(base.length + 1)))
    }
  }
  return `${base}-${String(max + 1).padStart(width, '0')}`
}

/** 목록에 보일 카드 이름. 우리 LOT 번호 뒤 괄호에 고객 LOT 번호. 예) 20261126-01 (ABCDEFG1264) */
function cardName(card: Card, index: number) {
  const lot = card.lotNo.trim()
  const customer = card.customerLot.trim()
  if (lot) return customer ? `${lot} (${customer})` : lot
  return customer ? `(${customer})` : `${index + 1}번 카드 · LOT 미입력`
}

export function LotCardView() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user, loading: authLoading } = useAuth()
  const canWrite = user?.role === 'editor' || user?.role === 'admin'
  const [cards, setCards] = useState<Card[]>([])
  const [activeId, setActiveId] = useState('')
  const [floor, setFloor] = useState<Floor>('1')
  const [ready, setReady] = useState(false)
  const [companies, setCompanies] = useState<string[]>([])
  const [platingRows, setPlatingRows] = useState<{ company: string; product: string; gold: string; nickel: string; gap?: string; plateWidth?: string }[]>([])
  const [approval, setApproval] = useState<ApprovalRequest | null>(null)
  const [approvalTick, setApprovalTick] = useState(0)
  const [pendingDelete, setPendingDelete] = useState<Card | null>(null)
  const [moving, setMoving] = useState(false)
  const openedQuery = useRef(false)
  const savedSnapshot = useRef<Map<string, string>>(new Map())
  const articleRef = useRef<HTMLElement>(null)
  const [finishing, setFinishing] = useState(false)
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
        setCards(local)
        setActiveId('')
        setFloor('1')
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
      if (stop) return
      const confirmed = new Set(serverIds)
      if (migrated) for (const card of localOnly) confirmed.add(card.id)
      savedSnapshot.current = new Map(merged.filter((card) => confirmed.has(card.id)).map((card) => [card.id, JSON.stringify(card)]))
      setCards(merged)
      setActiveId('')
      setFloor('1')
      setReady(true)
    }
    void loadCards()
    return () => { stop = true }
  }, [])

  useEffect(() => {
    if (!ready || openedQuery.current) return
    const id = searchParams.get('open')
    if (!id) {
      openedQuery.current = true
      return
    }
    const found = cards.find((item) => item.id === id)
    if (!found) return
    openedQuery.current = true
    setActiveId(found.id)
    setFloor(found.floor)
  }, [ready, cards, searchParams])

  useEffect(() => {
    let stop = false
    async function loadLists() {
      const [companyRes, platingRes] = await Promise.all([
        fetch('/api/config?name=companies', { cache: 'no-store' }).then((response) => response.json()).catch(() => null),
        fetch('/api/plating-info', { cache: 'no-store' }).then((response) => response.json()).catch(() => null),
      ])
      if (stop) return
      setCompanies(Array.isArray(companyRes?.data) ? companyRes.data : [])
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
  // 같은 입고 바코드(없으면 같은 수입검사)로 만든 이력카드들. 롤마다 한 장씩 여러 장일 수 있다.
  const siblings = card
    ? cards
      .filter((item) => item.id === card.id
        || (card.barcode && item.barcode.toUpperCase() === card.barcode.toUpperCase())
        || (!card.barcode && card.sourceIncomingId && item.sourceIncomingId === card.sourceIncomingId))
      .sort((a, b) => (a.sortOrder ?? Infinity) - (b.sortOrder ?? Infinity) || a.createdAt.localeCompare(b.createdAt))
    : []

  const embed = useEmbedPreview(searchParams, !!card)

  // LOT 번호가 비어 있는 카드를 열면 오늘 날짜-01 을 기본으로 넣는다. (완료한 카드·보기 전용은 건드리지 않는다)
  useEffect(() => {
    if (!ready || !canWrite || !card || card.done || card.lotNo.trim()) return
    patch({ lotNo: defaultLotNo() })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, canWrite, card?.id])

  useEffect(() => {
    if (!ready || !card?.id) return
    void loadApproval(card.id)
  }, [ready, card?.id, approvalTick, loadApproval])

  const partnerOptions = [...new Set((card?.spec
    ? platingRows.filter((row) => row.product === card.spec).map((row) => row.company)
    : companies
  ).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ko'))
  const productOptions = [...new Set((card?.partner
    ? platingRows.filter((row) => row.company === card.partner).map((row) => row.product)
    : platingRows.map((row) => row.product)
  ).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ko'))
  const platingMatches = platingRows.filter((row) => row.company === card?.partner && row.product === card?.spec)
  const platedItems = card
    ? card.platedItems ?? dimensionDefaults({ full: card.platedFullWidth, gaps: [card.platedGap, card.platedGap2 ?? '', card.platedGap3 ?? ''], plates: [card.platedPlateWidth, card.platedPlateWidth2 ?? ''] }, platingMatches[0])
    : []
  const maskItems = card
    ? card.maskItems ?? dimensionDefaults({ full: card.maskFullWidth, gaps: [card.maskGap], plates: [card.maskPlateWidth] }, platingMatches[0])
    : []
  /**
   * 그 공정 칸에 값을 넣으면 판정이 비어 있을 때 '합격'을 자동으로 넣고, 칸 값이 모두 비면 자동으로 넣은 '합격'을 다시 뺀다.
   * (NG를 고른 칸, 칸 이름, 작업일자·도금 스펙은 값으로 치지 않는다. 불합격·특채로 고른 판정은 건드리지 않는다.)
   */
  const judged = (key: JudgeKey) => (partial: Partial<Card>) => {
    if (!card) return
    // 아직 저장 안 된 기본 치수 칸(설정·예전 값에서 만든 것)도 값으로 본다.
    const next: Card = { ...card, maskItems: card.maskItems ?? maskItems, platedItems: card.platedItems ?? platedItems, ...partial }
    const filled = JUDGED_FIELDS[key].some((field) => {
      const value = next[field]
      return typeof value === 'string'
        ? value.trim() !== '' && value !== 'NG'
        : Array.isArray(value) && value.some((item) => 'value' in item && typeof item.value === 'string' && item.value.trim() !== '')
    })
    const judge = card[key]
    patch(filled && !judge ? { ...partial, [key]: '합격' } : !filled && judge === '합격' ? { ...partial, [key]: '' } : partial)
  }
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
  }, [ready, card?.id, card?.partner, card?.spec, nickel, gold, tin])

  useEffect(() => {
    // 미리보기(embed)는 보기만 한다. 열면서 자동으로 채워지는 값도 저장하지 않는다.
    if (!ready || authLoading || !canWrite || embed) return
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
  }, [cards, ready, authLoading, canWrite, embed])

  useEffect(() => {
    // 인쇄 직전에 내용 높이를 재서 A4 한 장(287mm, 여백 5mm 제외)을 넘으면 그 비율만큼 줄여 한 장에 넣는다.
    const onBefore = () => {
      document.body.classList.add('lot-card-print')
      const sheet = articleRef.current
      if (!sheet) return
      const mm = 96 / 25.4
      const content = sheet.scrollHeight - 10 * mm
      const zoom = Math.min(1, (285 * mm) / Math.max(content, 1))
      sheet.style.setProperty('--print-zoom', String(zoom))
    }
    const onAfter = () => {
      document.body.classList.remove('lot-card-print')
      articleRef.current?.style.removeProperty('--print-zoom')
    }
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

  /** 완료는 상태(작성중 ↔ 완료)만 바꾼다. 문서탐색기 저장은 '저장' 버튼으로 따로 한다. */
  function toggleDone() {
    if (!card) return
    patch({ done: !card.done })
  }

  /** 지금 서식을 PDF로 만들어 문서탐색기(이력카드)에 저장한다. 다시 저장하면 이전 문서를 새 것으로 바꾼다. */
  async function saveToExplorer() {
    if (!card || finishing) return
    if (!articleRef.current) {
      toast.error('이력카드 화면을 찾지 못해 문서탐색기에 저장하지 못했습니다.')
      return
    }
    setFinishing(true)
    try {
      const saved = await saveSheetDocument({
        node: articleRef.current,
        documentType: LOT_CARD_TYPE,
        sourceSheetId: card.id,
        company: card.partner,
        product: card.product || card.spec,
        lotStart: card.lotNo,
        material: card.material,
        issueDate: card.receivedAt || card.workDate || card.createdAt.slice(0, 10),
        floor: card.floor,
      })
      if (saved.ok) toast.success('문서탐색기에 이력카드로 저장했습니다.')
      else toast.error(saved.error)
    } finally {
      setFinishing(false)
    }
  }

  function patch(partial: Partial<Card>) {
    updateCard((current) => ({ ...current, ...partial, updatedAt: new Date().toISOString() }))
  }

  function copyCard() {
    if (!card) return
    const now = new Date().toISOString()
    const next: Card = {
      ...card,
      id: crypto.randomUUID(),
      lotNo: nextLotNo(card.lotNo, siblings.map((item) => item.lotNo)),
      seqNo: nextSeqNo(card.seqNo, siblings.map((item) => item.seqNo)),
      done: false,
      sortOrder: undefined,
      createdAt: now,
      updatedAt: now,
      incoming: card.incoming.map((row) => ({ ...row })),
      niBaths: card.niBaths.map((row) => ({ ...row })),
      auBaths: card.auBaths.map((row) => ({ ...row })),
      snBaths: card.snBaths.map((row) => ({ ...row })),
      maskItems: card.maskItems?.map((row) => ({ ...row })),
      platedItems: card.platedItems?.map((row) => ({ ...row })),
    }
    // 현장 작업 기록(작업 시작·완료)은 롤마다 따로라 복사하지 않는다.
    const work = next as Card & Record<string, unknown>
    for (const key of ['workStatus', 'workStartedAt', 'workStartedBy', 'workDoneAt', 'workDoneBy', 'workLine']) delete work[key]
    setCards((current) => [next, ...current])
    setFloor(next.floor)
    setActiveId(next.id)
  }

  function removeCard(id: string) {
    const removed = cards.find((item) => item.id === id)
    const next = cards.filter((item) => item.id !== id)
    setCards(next)
    if (activeId === id) {
      const sibling = siblings.find((item) => item.id !== id) ?? next.find((item) => item.floor === removed?.floor && !item.done) ?? next.find((item) => !item.done) ?? next[0]
      setActiveId(sibling?.id ?? '')
      if (sibling) setFloor(sibling.floor)
    }
    setPendingDelete(null)
  }

  async function goToOutgoing() {
    if (!card || moving) return
    const productName = card.product.trim() || card.spec.trim()
    if (!card.partner.trim() || !productName) {
      toast.error('업체와 규격을 먼저 확인합니다.')
      return
    }
    setMoving(true)
    try {
      const [reportRes, platingRes] = await Promise.all([
        fetch('/api/outgoing-reports', { cache: 'no-store' }),
        fetch('/api/plating-info', { cache: 'no-store' }),
      ])
      const reportBody = await reportRes.json().catch(() => null)
      const platingBody = await platingRes.json().catch(() => null)
      if (!reportRes.ok || !Array.isArray(reportBody?.data)) throw new Error('load')
      const rows = Array.isArray(platingBody?.rows) ? platingBody.rows as { company?: string; product?: string; material?: string; gold?: string; nickel?: string; specification?: string }[] : []
      const matches = rows.filter((row) => row.company === card.partner && row.product === productName && (!card.material || row.material === card.material))
      const platingSpec = [...new Set(matches.map((row) => (row.specification?.trim() || [row.gold, row.nickel].filter(Boolean).join(' / '))).filter(Boolean))][0] ?? ''
      // 같은 입고에서 나온 이력카드들은 출하성적서 한 장을 같이 쓴다.
      const reports = reportBody.data as { sourceLotCardId?: string; id?: string; createdAt?: string; material?: string; platingSpec?: string; done?: boolean; barcode?: string; lotNo?: string; lotSize?: string; issuedOn?: string }[]
      const siblingIds = new Set(siblings.map((item) => item.id))
      const existing = reports.find((item) => item.sourceLotCardId === card.id)
        ?? reports.find((item) => item.sourceLotCardId && siblingIds.has(item.sourceLotCardId))
        ?? (card.barcode ? reports.find((item) => item.barcode?.toUpperCase() === card.barcode.toUpperCase()) : undefined)
      const now = new Date().toISOString()
      // 출하성적서에서 이미 고친 값은 그대로 두고, 비어 있는 칸만 이력카드 값으로 채운다.
      const fill = (current: string | undefined, next: string) => (current?.trim() ? current : next)
      const report = {
        ...(existing ?? {}),
        id: existing?.id || crypto.randomUUID(),
        floor: card.floor,
        done: existing?.done === true,
        createdAt: existing?.createdAt || now,
        updatedAt: now,
        sourceLotCardId: existing?.sourceLotCardId || card.id,
        customer: card.partner,
        product: productName,
        spec: productName,
        material: card.material || existing?.material || '',
        platingSpec: platingSpec || existing?.platingSpec || '',
        barcode: card.barcode || existing?.barcode || '',
        lotNo: fill(existing?.lotNo, card.lotNo.trim()),
        lotSize: fill(existing?.lotSize, (card.platedQuantity || card.quantity).trim()),
        issuedOn: fill(existing?.issuedOn, card.shipDate || card.workDate),
      }
      const saved = await fetch('/api/outgoing-reports', {
        method: 'PUT',
        headers: getJsonAuthHeaders(),
        body: JSON.stringify(report),
      })
      if (!saved.ok) throw new Error('save')
      router.push(withShipmentBundle(report.id, '/shipment/outgoing-report'))
    } catch {
      toast.error('출하성적서로 넘기지 못했습니다.')
      setMoving(false)
    }
  }


  return (
    <div className={cn(PAGE_SHELL, 'lot-card-screen')}>
      <div className="no-print contents">
        <PageHeader
          tone="teal"
          icon={Barcode}
          eyebrow="재고 관리"
          title="LOT 이력카드"
          description="이력카드를 채우고, 위 흐름 바에서 완료·인쇄하거나 다음 단계 카드를 눌러 출하성적서로 이어 씁니다."
          actions={(
            <>
              {canWrite && (
                <Button variant="outline" className={BAND_BUTTON} disabled={!card} onClick={toggleDone}>
                  <Check className="h-4 w-4" /> {card?.done ? '완료 취소' : '완료'}
                </Button>
              )}
              {canWrite && (
                <Button variant="outline" className={BAND_BUTTON} disabled={!card || finishing} onClick={() => void saveToExplorer()}>
                  <Save className="h-4 w-4" /> {finishing ? '저장 중…' : '저장'}
                </Button>
              )}
              {canWrite && (
                <Button variant="outline" className={BAND_BUTTON} disabled={!card} onClick={copyCard}>
                  <Copy className="h-4 w-4" /> 복사
                </Button>
              )}
              <Button className={BAND_BUTTON_PRIMARY} disabled={!card} onClick={() => window.print()}>
                <Printer className="h-4 w-4" /> 인쇄
              </Button>
            </>
          )}
        />
        {!embed && <ShipmentTabNav />}
        <ShipmentDocFlowNav
          step="lot-card"
          currentId={card?.id}
          canWrite={canWrite}
          onNext={() => { void goToOutgoing() }}
          nextDisabled={!card}
          nextLoading={moving}
        />
      </div>

      <div className="flex min-h-[calc(100vh-13rem)] items-stretch gap-4">
        {card && (
          <aside className="no-print w-72 shrink-0">
            <DocSiblingList
              noun="이력카드"
              barcode={card.barcode}
              items={siblings.map((item) => ({
                id: item.id,
                done: item.done,
                title: item.lotNo,
                chips: [['고객 LOT', item.customerLot], ['롤 무게', item.rollWeight]],
              }))}
              activeId={card.id}
              canWrite={canWrite}
              onSelect={setActiveId}
              onDelete={(id) => setPendingDelete(siblings.find((item) => item.id === id) ?? null)}
              onReorder={(order) => setCards((current) => current.map((item) => {
                const index = order.indexOf(item.id)
                return index < 0 || item.sortOrder === index ? item : { ...item, sortOrder: index }
              }))}
            />
          </aside>
        )}
        {card ? (
      <div className="flex min-w-0 flex-1 flex-col items-center overflow-x-auto">
        <article ref={articleRef} inert={embed} className={cn('lot-card-sheet flex h-[297mm] w-[210mm] max-w-full shrink-0 flex-col gap-2 bg-white px-[5mm] py-[5mm] text-black shadow-md ring-1 ring-black/10 print:shadow-none print:ring-0', !canWrite && '[&_input]:pointer-events-none [&_select]:pointer-events-none [&_textarea]:pointer-events-none [&_button]:pointer-events-none [&_[role=button]]:pointer-events-none')}>
          <header className="flex items-stretch overflow-hidden  border border-black">
            <div className="relative flex flex-1 items-center justify-center px-3 py-3">
              <img src="/logo.png" alt="WOORI" className="absolute left-3 top-1/2 h-11 w-auto -translate-y-1/2 object-contain" />
              <h2 className="text-center text-[22px] font-extrabold tracking-[0.16em] text-black">LOT 이력카드</h2>
            </div>
            <ApprovalBox name={user?.displayName || user?.username || ''} jobTitle={user?.jobTitle} />
          </header>

          {/* 기본 정보: 고객 → 품명(규격) → LOT No. / 고객 LOT No. → 원자재(업체·순번·롤·무게) */}
          <div className="overflow-hidden  border border-black">
            <div className="grid grid-cols-5 [&>*]:border-b [&>*]:border-r [&>*]:border-black">
              <div className="col-span-3 min-w-0">
                <ListSlot label="고객" configName="companies" options={partnerOptions} value={card.partner} onChange={(partner) => {
                  const names = [...new Set(platingRows.filter((row) => row.company === partner).map((row) => row.product).filter(Boolean))]
                  const spec = names.includes(card.spec) ? card.spec : names.length === 1 ? names[0] : ''
                  patch({ partner, spec, product: spec || card.product })
                }} onOptionsChange={setCompanies} creatable={!card.spec} />
              </div>
              <div className="col-span-2 min-w-0 !border-r-0">
                <Slot label="입고일자" type="date" value={card.receivedAt} onChange={(receivedAt) => patch({ receivedAt })} />
              </div>
              <div className="col-span-5 min-w-0 !border-r-0">
                <ListSlot label="품명(규격)" configName="products" options={productOptions} value={card.spec} onChange={(spec) => {
                  const names = [...new Set(platingRows.filter((row) => row.product === spec).map((row) => row.company).filter(Boolean))]
                  const partner = names.includes(card.partner) ? card.partner : names.length === 1 ? names[0] : ''
                  patch({ spec, product: spec, partner })
                }} onOptionsChange={() => undefined} creatable={false} />
              </div>
              <div className="col-span-3 min-w-0">
                <Slot label="LOT No." value={card.lotNo} onChange={(lotNo) => patch({ lotNo })} />
              </div>
              <div className="col-span-2 min-w-0 !border-r-0">
                <Slot label="고객 LOT No." value={card.customerLot} onChange={(customerLot) => patch({ customerLot })} />
              </div>
            </div>
            <div className="flex">
              <div className="flex w-[18mm] shrink-0 items-center justify-center border-r border-black bg-white text-[12px] font-bold text-black">원자재</div>
              <div className="grid min-w-0 flex-1 grid-cols-4 [&>*]:border-b [&>*]:border-r [&>*]:border-black">
                <div className="col-span-2 min-w-0"><Slot label="원자재 업체명" value={card.materialVendor} onChange={(materialVendor) => patch({ materialVendor })} labelClass="w-[96px] px-1.5" /></div>
                <div className="min-w-0"><Slot compact label="순번" value={card.seqNo} onChange={(seqNo) => patch({ seqNo })} /></div>
                <div className="min-w-0 !border-r-0"><Slot compact label="롤수" value={card.rollCount} onChange={(rollCount) => {
                  // 같은 수입검사에서 나온 다른 이력카드도 롤수를 같이 바꾼다 (성적서는 서버가 바꾼다).
                  const source = card.sourceIncomingId
                  setCards((current) => current.map((item) => (item.id === card.id || (source && item.sourceIncomingId === source) ? { ...item, rollCount, updatedAt: new Date().toISOString() } : item)))
                }} /></div>
                <div className="min-w-0 !border-b-0"><Slot compact label="분리 NO" value={card.splitNo ?? ''} onChange={(splitNo) => patch({ splitNo })} /></div>
                <div className="min-w-0 !border-b-0"><Slot compact label="전체 무게" value={card.quantity} onChange={(quantity) => patch({ quantity })} /></div>
                <div className="min-w-0 !border-b-0"><Slot compact label="해당 롤 무게" value={card.rollWeight} onChange={(rollWeight) => patch({ rollWeight })} /></div>
                <div className="min-w-0 !border-b-0 !border-r-0"><Slot compact label="도금 후" value={card.platedQuantity} onChange={(platedQuantity) => patch({ platedQuantity })} /></div>
              </div>
            </div>
          </div>
          <Section
            title="마스킹"
            note="이음매 n=30cm (1Reel) · Ac=0"
            judge={<JudgeMark value={card.maskJudge} onChange={(maskJudge) => patch({ maskJudge })} />}
            extra={<WorkDate value={card.maskDate} onChange={(maskDate) => patch({ maskDate })} />}
          >
            <PlatedCells items={maskItems} onChange={(next) => judged('maskJudge')({ maskItems: next })} />
            <div className="grid grid-cols-3 divide-x divide-black border-t border-black">
              <Slot label="히팅온도" unit="℃" value={card.maskHeat ?? ''} onChange={(maskHeat) => judged('maskJudge')({ maskHeat })} />
              <Slot label="작업속도" value={card.maskSpeed ?? ''} onChange={(maskSpeed) => judged('maskJudge')({ maskSpeed })} />
              <Slot label="압착압력" value={card.maskPressure ?? ''} onChange={(maskPressure) => judged('maskJudge')({ maskPressure })} labelClass="w-[80px] px-2" />
            </div>
            <div className="grid grid-cols-2 divide-x divide-black border-t border-black">
              <OkNgSlot label="TAPE 절단부 잔여물 확인" labelClass="w-auto" value={card.maskTape ?? ''} onChange={(maskTape) => judged('maskJudge')({ maskTape })} />
              <OkNgSlot label="칼날 마모 상태" labelClass="w-auto" value={card.maskWear ?? ''} onChange={(maskWear) => judged('maskJudge')({ maskWear })} />
            </div>
          </Section>

          <Section
            title="도금 후"
            note="이음매 n=30cm (1Reel) · Ac=0"
            judge={<JudgeMark value={card.platedJudge} onChange={(platedJudge) => patch({ platedJudge })} />}
            extra={<WorkDate value={card.platedDate} onChange={(platedDate) => patch({ platedDate })} />}
          >
            <PlatedCells items={platedItems} onChange={(next) => judged('platedJudge')({ platedItems: next })} />
          </Section>

          <div className="grid grid-cols-3 divide-x divide-black overflow-hidden  border border-black">
            <PlatingColumn title="Ni 공정" note="초/종물 · 이음매 50cm 제외 · Ac=0" judge={<JudgeMark value={card.niJudge} onChange={(niJudge) => patch({ niJudge })} />} extra={<WorkDate value={card.niDate} onChange={(niDate) => patch({ niDate })} />}>
              <SpecField value={card.niSpec} onChange={(niSpec) => patch({ niSpec })} />
              <MiniField label="초물" unit="μm" value={card.niFirst} onChange={(niFirst) => judged('niJudge')({ niFirst })} />
              <MiniField label="종물" unit="μm" value={card.niLast} onChange={(niLast) => judged('niJudge')({ niLast })} />
              <div className="border-t border-black"><OkNgSlot label="TAPE 잔여물" value={card.niTape ?? ''} onChange={(niTape) => judged('niJudge')({ niTape })} /></div>
              <div className="border-t border-black"><OkNgSlot label="밀착검사" value={card.niStrip ?? ''} onChange={(niStrip) => judged('niJudge')({ niStrip })} /></div>
            </PlatingColumn>
            <PlatingColumn title="Au 공정" note="초/종물 · 이음매 50cm 제외 · Ac=0" judge={<JudgeMark value={card.auJudge} onChange={(auJudge) => patch({ auJudge })} />} extra={<WorkDate value={card.auDate} onChange={(auDate) => patch({ auDate })} />}>
              <SpecField value={card.auSpec} onChange={(auSpec) => patch({ auSpec })} />
              <MiniField label="초물" unit="μm" value={card.auFirst} onChange={(auFirst) => judged('auJudge')({ auFirst })} />
              <MiniField label="종물" unit="μm" value={card.auLast} onChange={(auLast) => judged('auJudge')({ auLast })} />
              <div className="border-t border-black"><OkNgSlot label="TAPE 잔여물" value={card.auTape ?? ''} onChange={(auTape) => judged('auJudge')({ auTape })} /></div>
              <div className="border-t border-black"><OkNgSlot label="밀착검사" value={card.auStrip ?? ''} onChange={(auStrip) => judged('auJudge')({ auStrip })} /></div>
            </PlatingColumn>
            <PlatingColumn title="Sn 공정" note="초/종물 · 이음매 50cm 제외 · Ac=0" judge={<JudgeMark value={card.snJudge} onChange={(snJudge) => patch({ snJudge })} />} extra={<WorkDate value={card.snDate} onChange={(snDate) => patch({ snDate })} />}>
              <SpecField value={card.snSpec} onChange={(snSpec) => patch({ snSpec })} />
              <MiniField label="초물" unit="μm" value={card.snFirst} onChange={(snFirst) => judged('snJudge')({ snFirst })} />
              <MiniField label="종물" unit="μm" value={card.snLast} onChange={(snLast) => judged('snJudge')({ snLast })} />
              <div className="border-t border-black"><OkNgSlot label="TAPE 잔여물" value={card.snTape ?? ''} onChange={(snTape) => judged('snJudge')({ snTape })} /></div>
              <div className="border-t border-black"><OkNgSlot label="밀착검사" value={card.snStrip ?? ''} onChange={(snStrip) => judged('snJudge')({ snStrip })} /></div>
            </PlatingColumn>
          </div>

          <Section
            title="출하검사"
            note="이음매 50cm 제외 · Ac=0"
            judge={<JudgeMark value={card.shipJudge} onChange={(shipJudge) => patch({ shipJudge })} />}
            extra={<WorkDate value={card.shipDate} onChange={(shipDate) => patch({ shipDate })} />}
          >
            <div className="grid grid-cols-3 divide-x divide-black border-b border-black">
              <Slot label="Ni두께" unit="μm" value={card.niThickness} onChange={(niThickness) => judged('shipJudge')({ niThickness })} />
              <Slot label="Au두께" unit="μm" value={card.auThickness} onChange={(auThickness) => judged('shipJudge')({ auThickness })} />
              <Slot label="Sn두께" unit="μm" value={card.snThickness} onChange={(snThickness) => judged('shipJudge')({ snThickness })} />
            </div>
            <div className="grid grid-cols-3 divide-x divide-black">
              <OkNgSlot label="밀착" value={card.adhesion} onChange={(adhesion) => judged('shipJudge')({ adhesion })} />
              <OkNgSlot label="납땜성" value={card.solder} onChange={(solder) => judged('shipJudge')({ solder })} />
              <OkNgSlot label="염수" value={card.salt} onChange={(salt) => judged('shipJudge')({ salt })} />
            </div>
          </Section>

          <footer className="mt-auto flex items-center justify-between px-0.5 text-[12px] text-black">
            <span>QEP-400-01 (Rev.0)</span>
            <span>A4 (210×297)</span>
          </footer>
        </article>
      </div>
        ) : (
          <div className="flex min-h-64 flex-1 items-center justify-center rounded-xl border border-dashed border-black text-[15px] text-slate-400">
            수입검사 성적서에서 'LOT 이력카드로 이어쓰기'를 눌러 이력카드를 엽니다
          </div>
        )}
      </div>
      <ConfirmDeleteDialog
        open={pendingDelete != null}
        onOpenChange={(open) => { if (!open) setPendingDelete(null) }}
        title="이력카드 삭제"
        onConfirm={() => { if (pendingDelete) removeCard(pendingDelete.id) }}
      >
        {pendingDelete ? `${cardName(pendingDelete, siblings.findIndex((item) => item.id === pendingDelete.id))} 이력카드를 삭제합니다. 되돌릴 수 없습니다.` : '이 이력카드를 삭제합니다.'}
      </ConfirmDeleteDialog>
    </div>
  )
}
