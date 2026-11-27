'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Check, ClipboardCheck, FileText, Printer, Save, Search } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/components/auth/auth-context'
import { type ApprovalRequest } from '@/lib/approval'
import { ConfirmDeleteDialog } from '@/components/shared/confirm-delete-dialog'
import { BAND_BUTTON, BAND_BUTTON_PRIMARY, PAGE_SHELL, PageHeader } from '@/components/shared/page-header'
import { InboundLink } from '@/components/shipment/inbound-link'
import { ShipmentDocFlowNav } from '@/components/shipment/shipment-doc-flow-nav'
import { ShipmentTabNav } from '@/components/shipment/shipment-tab-nav'
import { Button } from '@/components/ui/button'
import { getJsonAuthHeaders } from '@/lib/auth-client'
import { cardQuantityText, cleanBarcode, fetchInbounds, findInbound, sheetQuantityFields, type InboundItem } from '@/lib/inbound'
import { withShipmentBundle } from '@/lib/shipment-bundle'
import { saveSheetDocument } from '@/lib/sheet-document'
import { INCOMING_INSPECTION_TYPE } from '@/lib/file-types'
import { useEmbedPreview } from '@/hooks/use-embed-preview'
import { cn } from '@/lib/utils'
import { SearchableCombobox } from '@/components/ui/searchable-combobox'
import { SignatureOrName } from '@/components/shared/signature-or-name'
import { defaultLotNo } from '@/lib/lot'

const APPEARANCE_SPEC = '① 외관 변형이 없을 것\n② 스크래치가 없을 것\n③ 감김(Winding)이 균일할 것\n④ 제품 변형 및 REEL 파손이 없을 것'
// 예전 기본 문구로 저장된 성적서는 열 때 새 문구로 바꾼다 (직접 고친 문구는 그대로 둔다)
const APPEARANCE_SPEC_PREVIOUS = [
  '1)외관 변형 없을것.\n2)스크래치 없을 것.\n3)감김상태(Widing)는\n균일하고 제품의 변형,\nREEL 파손 등이 없을것.',
  '1) 외관 변형 없을것.\n스크래치 없을것.\n2) 끝말림(Widing) 변형 없을것.\nREEL 파손 등이 없을것.',
  '1)외관 변형 없을것.\n스크래치 없을것.\n2)끝말림(Widing)은\n감김으로 제품의 변형,\nREEL 파손 등이 없을것.',
]

type Judgment = '' | '합격' | '불합격'

/** 검사 시료 칸의 '시료 참조' 버튼들. 고른 항목은 remark에 ' · '로 이어 저장한다. */
const SAMPLE_REFS = ['실물 보관'] as const

/** 시료 사진을 긴 변 1200px JPEG로 줄여 성적서에 같이 저장한다. */
async function shrinkPhoto(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, 1200 / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  return canvas.toDataURL('image/jpeg', 0.75)
}
type Floor = '1' | '2' | '3'
const FLOORS = ['1', '2', '3'] as const

type Sheet = {
  id: string
  /** 고른 양식 id (lib/doc-forms.ts). 없으면 기본 양식. */
  formId?: string
  floor: Floor
  done: boolean
  createdAt: string
  updatedAt: string
  inspectedOn: string
  inspector: string
  company: string
  model: string
  lotWeight: string
  lotWeightUnit: 'Kg' | 'EA'
  lotRoll: string
  spec: string
  material: string
  appearanceSpec: string
  appearanceResult: string
  thicknessSpec: string
  lengthSpec: string
  thicknessResult: string
  widthResult: string
  /** 실제로 잰 두께·전폭 값 */
  thicknessValue: string
  widthValue: string
  dimensionResult: string
  drawLength: string
  drawThickness: string
  judgment: Judgment
  writer: string
  approver: string
  /** 입고등록에서 발급한 바코드. 이력카드·출하성적서까지 그대로 이어진다. */
  barcode: string
  /** 연동한 입고등록 id (직접 등록한 바코드는 빈 값) */
  inventoryId: string
  /** 입고등록에 적은 로트번호 */
  lotNo: string
  /** 입고일자 (입고등록 기준) */
  receivedAt: string
  /** 시료 참조 (예: 실물 보관 · 입고 바코드 참조) */
  remark: string
  /** 검사 시료 사진 (줄인 JPEG data URL). 없으면 빈칸 */
  samplePhoto: string
}

function todayKey() {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${month}-${day}`
}

function signStep(approval: ApprovalRequest | null, slot: '작성' | '검토' | '승인') {
  if (!approval) return undefined
  if (slot === '작성') return approval.steps.find((step) => !step.role) ?? approval.steps[0]
  if (slot === '검토') return approval.steps.find((step) => step.role === 'review')
  return approval.steps.find((step) => step.role === 'approval')
}

function emptySheet(): Sheet {
  const now = new Date().toISOString()
  return {
    id: crypto.randomUUID(),
    floor: '1',
    done: false,
    createdAt: now,
    updatedAt: now,
    inspectedOn: '',
    inspector: '',
    company: '',
    model: '',
    lotWeight: '',
    lotWeightUnit: 'Kg',
    lotRoll: '',
    spec: '',
    material: '',
    appearanceSpec: APPEARANCE_SPEC,
    appearanceResult: 'OK',
    thicknessSpec: '',
    lengthSpec: '',
    thicknessResult: 'OK',
    widthResult: 'OK',
    thicknessValue: '',
    widthValue: '',
    dimensionResult: '',
    drawLength: '',
    drawThickness: '',
    judgment: '합격',
    writer: '',
    approver: '',
    barcode: '',
    inventoryId: '',
    lotNo: '',
    receivedAt: '',
    remark: '',
    samplePhoto: '',
  }
}

function normalizeSheet(saved: Partial<Sheet> | null): Sheet {
  const base = emptySheet()
  if (!saved) return base
  return {
    ...base,
    ...saved,
    id: saved.id || base.id,
    floor: saved.floor === '2' || saved.floor === '3' ? saved.floor : '1',
    done: saved.done === true,
    judgment: saved.judgment === '합격' || saved.judgment === '불합격' ? saved.judgment : '',
    appearanceSpec: !saved.appearanceSpec || APPEARANCE_SPEC_PREVIOUS.includes(saved.appearanceSpec) ? APPEARANCE_SPEC : saved.appearanceSpec,
    appearanceResult: saved.appearanceResult === 'NG' ? 'NG' : 'OK',
    // 측정결과는 기본 OK. NG로 고른 것만 NG로 남긴다.
    thicknessResult: saved.thicknessResult === 'NG' ? 'NG' : 'OK',
    widthResult: saved.widthResult === 'NG' ? 'NG' : 'OK',
    dimensionResult: '',
    lotWeightUnit: saved.lotWeightUnit === 'EA' ? 'EA' : 'Kg',
  }
}

type CatalogRow = { company: string; spec: string; material: string }
type LinkField = 'company' | 'spec' | 'material'

function parseSpec(spec: string) {
  const match = spec.trim().match(/^(\d+(?:\.\d+)?)\s*[*x×X]\s*(\d+(?:\.\d+)?)/)
  if (!match) return null
  return { thickness: match[1], length: match[2] }
}

function thicknessText(value: string) {
  return `${value}±0.01`
}

function widthText(value: string) {
  return `${value} -0.1`
}

function catalogValues(rows: CatalogRow[], field: LinkField, picked: Record<LinkField, string>) {
  return [...new Set(rows.filter((row) => (
    (field === 'company' || !picked.company || row.company === picked.company)
    && (field === 'spec' || !picked.spec || row.spec === picked.spec)
    && (field === 'material' || !picked.material || row.material === picked.material)
  )).map((row) => row[field]).filter(Boolean))]
}

function settleLink(rows: CatalogRow[], picked: Record<LinkField, string>, locked: LinkField) {
  const next = { ...picked }
  for (let pass = 0; pass < 3; pass += 1) {
    let changed = false
    for (const field of ['company', 'spec', 'material'] as const) {
      if (field === locked) continue
      const options = catalogValues(rows, field, { ...next, [field]: '' })
      const resolved = next[field] && options.includes(next[field]) ? next[field] : options.length === 1 ? options[0] : ''
      if (resolved !== next[field]) {
        next[field] = resolved
        changed = true
      }
    }
    if (!changed) break
  }
  return next
}

function koDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}/.test(value)) return ''
  const [year, month, day] = value.slice(0, 10).split('-')
  return `${year}년${month}월${day}일`
}

function stampDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}/.test(value)) return ''
  return value.slice(0, 10).replaceAll('-', '.')
}

function ResultMark({ value, onChange, disabled }: { value: string; onChange: (value: string) => void; disabled?: boolean }) {
  return (
    <div className="flex items-center justify-center">
      <div className="flex items-center justify-center gap-1 print:hidden">
      {(['OK', 'NG'] as const).map((option) => {
        const selected = value === option
        return (
          <button
            key={option}
            type="button"
            disabled={disabled}
            onClick={() => onChange(option)}
            className={cn(
              'h-7 min-w-10 rounded border px-2 text-[12px] font-bold',
              selected ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300 bg-white text-slate-400',
              disabled && 'pointer-events-none',
            )}
          >
            {option}
          </button>
        )
      })}
      </div>
      <span className="hidden text-[13px] font-bold print:inline">{value}</span>
    </div>
  )
}

function Field({
  value,
  onChange,
  className,
  type = 'text',
  placeholder,
}: {
  value: string
  onChange: (value: string) => void
  className?: string
  type?: string
  placeholder?: string
}) {
  return (
    <input
      type={type}
      value={value}
      placeholder={placeholder}
      onChange={(event) => onChange(event.target.value)}
      className={cn('w-full bg-transparent px-1 text-center text-[13px] text-slate-900 outline-none placeholder:text-slate-300', className)}
    />
  )
}

export function IncomingInspectionView() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user, loading: authLoading } = useAuth()
  const canWrite = user?.role === 'editor' || user?.role === 'admin'
  const [sheets, setSheets] = useState<Sheet[]>([])
  const [activeId, setActiveId] = useState('')
  const [floor, setFloor] = useState<Floor>('1')
  const [ready, setReady] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<Sheet | null>(null)
  const [catalog, setCatalog] = useState<CatalogRow[]>([])
  const [approval, setApproval] = useState<ApprovalRequest | null>(null)
  const [moving, setMoving] = useState(false)
  const openedQuery = useRef(false)
  const savedSnapshot = useRef<Map<string, string>>(new Map())
  const articleRef = useRef<HTMLElement>(null)
  const [finishing, setFinishing] = useState(false)
  const sheetsRef = useRef(sheets)
  const saveQueue = useRef(Promise.resolve())
  sheetsRef.current = sheets
  const sheet = sheets.find((item) => item.id === activeId) ?? null
  const embed = useEmbedPreview(searchParams, !!sheet)

  useEffect(() => {
    let stop = false
    async function loadCatalog() {
      const response = await fetch('/api/plating-info', { cache: 'no-store' })
      const body = await response.json().catch(() => null)
      if (stop || !response.ok || !Array.isArray(body?.rows)) return
      const rows = (body.rows as { company?: string; product?: string; material?: string }[])
        .map((row) => ({
          company: row.company?.trim() || '',
          spec: row.product?.trim() || '',
          material: row.material?.trim() || '',
        }))
        .filter((row) => row.company && row.spec)
      setCatalog(rows)
    }
    void loadCatalog()
    return () => { stop = true }
  }, [])

  useEffect(() => {
    let stop = false
    async function load() {
      const response = await fetch('/api/incoming-inspections', { cache: 'no-store' })
      const body = await response.json().catch(() => null)
      if (stop) return
      const loaded = response.ok && Array.isArray(body?.data)
        ? (body.data as Partial<Sheet>[]).map((item) => normalizeSheet(item)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        : []
      savedSnapshot.current = new Map(loaded.map((item) => [item.id, JSON.stringify(item)]))
      setSheets(loaded)
      setFloor('1')
      setActiveId('')
      setReady(true)
      if (!response.ok) toast.error('수입검사 성적서를 불러오지 못했습니다.')
    }
    void load()
    return () => { stop = true }
  }, [])

  useEffect(() => {
    if (!ready || authLoading || openedQuery.current) return
    const id = searchParams.get('open')
    if (id) {
      const found = sheets.find((item) => item.id === id)
      if (!found) return
      openedQuery.current = true
      setActiveId(found.id)
      setFloor(found.floor)
      return
    }
    const requested = searchParams.get('floor')
    const nextFloor: Floor = requested === '2' || requested === '3' ? requested : '1'
    if (requested === '1' || requested === '2' || requested === '3') setFloor(nextFloor)
    // 입고 등록 화면에서 바코드를 들고 넘어온 경우: 그 바코드로 쓰던 성적서가 있으면 열고, 없으면 새로 만들어 입고 정보를 채운다.
    const barcodeParam = cleanBarcode(searchParams.get('barcode') ?? '')
    const owner = barcodeParam ? sheets.find((item) => item.barcode.toUpperCase() === barcodeParam) : undefined
    if (owner) {
      setActiveId(owner.id)
      setFloor(owner.floor)
    } else if ((searchParams.get('new') === '1' || barcodeParam) && canWrite) {
      const next = { ...emptySheet(), floor: nextFloor, inspectedOn: todayKey(), inspector: user?.displayName ?? '', remark: '실물 보관' }
      setSheets((current) => [next, ...current])
      setActiveId(next.id)
      if (barcodeParam) void linkByCode(barcodeParam, next.id)
    }
    openedQuery.current = true
  }, [ready, authLoading, sheets, searchParams, canWrite, user?.displayName])

  useEffect(() => {
    // 미리보기(embed)는 보기만 한다. 열면서 자동으로 채워지는 값도 저장하지 않는다.
    if (!ready || authLoading || !canWrite || embed) return
    const timer = window.setTimeout(() => {
      saveQueue.current = saveQueue.current.then(async () => {
        const current = sheetsRef.current
        const nextIds = new Set(current.map((item) => item.id))
        const removed = [...savedSnapshot.current.keys()].filter((id) => !nextIds.has(id))
        const changed = current.filter((item) => savedSnapshot.current.get(item.id) !== JSON.stringify(item))
        if (removed.length === 0 && changed.length === 0) return
        const results = await Promise.all([
          ...removed.map((id) => fetch('/api/incoming-inspections', {
            method: 'DELETE',
            headers: getJsonAuthHeaders(),
            body: JSON.stringify({ id }),
          })),
          ...changed.map((item) => fetch('/api/incoming-inspections', {
            method: 'PUT',
            headers: getJsonAuthHeaders(),
            body: JSON.stringify(item),
          })),
        ])
        if (!results.every((response) => response.ok)) {
          toast.error('수입검사 성적서를 저장하지 못했습니다.')
          return
        }
        for (const id of removed) savedSnapshot.current.delete(id)
        for (const item of changed) savedSnapshot.current.set(item.id, JSON.stringify(item))
      }).catch(() => {
        toast.error('수입검사 성적서를 저장하지 못했습니다.')
      })
    }, 400)
    return () => window.clearTimeout(timer)
  }, [sheets, ready, authLoading, canWrite, embed])

  useEffect(() => {
    const onBefore = () => document.body.classList.add('incoming-inspection-print')
    const onAfter = () => document.body.classList.remove('incoming-inspection-print')
    window.addEventListener('beforeprint', onBefore)
    window.addEventListener('afterprint', onAfter)
    return () => {
      window.removeEventListener('beforeprint', onBefore)
      window.removeEventListener('afterprint', onAfter)
    }
  }, [])

  useEffect(() => {
    if (!ready || authLoading || !user?.displayName) return
    const today = todayKey()
    setSheets((current) => {
      let changed = false
      const next = current.map((item) => {
        if (item.inspectedOn && item.inspector) return item
        changed = true
        return {
          ...item,
          inspectedOn: item.inspectedOn || today,
          inspector: item.inspector || user.displayName,
          updatedAt: new Date().toISOString(),
        }
      })
      return changed ? next : current
    })
  }, [ready, authLoading, user?.displayName])

  useEffect(() => {
    const sheetId = sheet?.id
    if (!sheetId) {
      setApproval(null)
      return
    }
    let stop = false
    async function loadApproval() {
      const response = await fetch('/api/approvals', { cache: 'no-store' })
      const data = await response.json().catch(() => null)
      if (stop || !response.ok || !Array.isArray(data?.data)) return
      const rows = (data.data as ApprovalRequest[])
        .filter((item) => item.target?.kind === 'incoming-inspection' && item.target.sheetId === sheetId && item.status !== 'cancelled')
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      setApproval(rows[0] ?? null)
    }
    void loadApproval()
    return () => { stop = true }
  }, [sheet?.id])

  /** 완료는 상태(작성중 ↔ 완료)만 바꾼다. 문서탐색기 저장은 '저장' 버튼으로 따로 한다. */
  function toggleDone() {
    if (!sheet) return
    patch({ done: !sheet.done })
  }

  /** 지금 서식을 PDF로 만들어 문서탐색기(수입검사성적서)에 저장한다. 다시 저장하면 이전 문서를 새 것으로 바꾼다. */
  async function saveToExplorer() {
    if (!sheet || finishing) return
    if (!articleRef.current) {
      toast.error('수입검사성적서 화면을 찾지 못해 문서탐색기에 저장하지 못했습니다.')
      return
    }
    setFinishing(true)
    try {
      const saved = await saveSheetDocument({
        node: articleRef.current,
        documentType: INCOMING_INSPECTION_TYPE,
        sourceSheetId: sheet.id,
        company: sheet.company,
        product: sheet.model || sheet.spec,
        material: sheet.material,
        issueDate: sheet.inspectedOn,
        floor: sheet.floor,
      })
      if (saved.ok) toast.success('문서탐색기에 수입검사성적서로 저장했습니다.')
      else toast.error(saved.error)
    } finally {
      setFinishing(false)
    }
  }

  function patch(partial: Partial<Sheet>) {
    setSheets((current) => current.map((item) => item.id === activeId ? { ...item, ...partial, updatedAt: new Date().toISOString() } : item))
  }

  /** 입고 바코드를 성적서에 연동하고, 입고등록에 있는 값(업체·규격·수량·로트·입고일)을 채운다. */
  function applyInbound(item: InboundItem, id = activeId) {
    const parsed = parseSpec(item.product)
    setFloor(item.floor)
    setSheets((current) => current.map((row) => {
      if (row.id !== id) return row
      const sameProduct = row.company === item.company && row.spec === item.product
      return {
        ...row,
        floor: item.floor,
        barcode: item.barcode,
        inventoryId: item.inventoryId,
        lotNo: item.lotNo,
        receivedAt: item.receivedAt,
        company: item.company,
        spec: item.product,
        material: sameProduct ? row.material : '',
        model: sameProduct ? row.model : '',
        thicknessSpec: sameProduct && row.thicknessSpec ? row.thicknessSpec : parsed ? thicknessText(parsed.thickness) : '',
        lengthSpec: sameProduct && row.lengthSpec ? row.lengthSpec : parsed ? widthText(parsed.length) : '',
        drawThickness: parsed?.thickness ?? '',
        drawLength: parsed?.length ?? '',
        ...sheetQuantityFields(item),
        updatedAt: new Date().toISOString(),
      }
    }))
    toast.success(`${item.barcode} 입고 정보를 연동했습니다.`)
  }

  function clearInbound() {
    patch({ barcode: '', inventoryId: '', lotNo: '', receivedAt: '' })
  }

  async function linkByCode(code: string, id: string) {
    try {
      const item = findInbound(await fetchInbounds(), code)
      if (!item) {
        toast.error(`${code} — 입고등록에서 발급한 바코드를 찾지 못했습니다.`)
        return
      }
      applyInbound(item, id)
    } catch {
      toast.error('입고 정보를 불러오지 못했습니다.')
    }
  }

  function chooseLink(field: LinkField, value: string) {
    if (!sheet) return
    if (!value) {
      patch({ company: '', spec: '', material: '', model: '', thicknessSpec: '', lengthSpec: '', drawThickness: '', drawLength: '' })
      return
    }
    const picked = settleLink(catalog, {
      company: field === 'company' ? value : sheet.company,
      spec: field === 'spec' ? value : sheet.spec,
      material: field === 'material' ? value : sheet.material,
    }, field)
    const parsed = parseSpec(picked.spec)
    patch({
      ...picked,
      model: '',
      thicknessSpec: parsed ? thicknessText(parsed.thickness) : '',
      lengthSpec: parsed ? widthText(parsed.length) : '',
      drawThickness: parsed?.thickness ?? '',
      drawLength: parsed?.length ?? '',
    })
  }

  const link = { company: sheet?.company ?? '', spec: sheet?.spec ?? '', material: sheet?.material ?? '' }
  // 고른 업체·규격에 등록된 재질이 없으면 전체 재질 목록을 보여 준다.
  // 그렇게 고른 재질은 업체·규격 목록을 좁히는 데 쓰지 않는다.
  const linkedMaterials = catalogValues(catalog, 'material', { ...link, material: '' })
  const materialUnlinked = linkedMaterials.length === 0
  const materialOptions = (materialUnlinked ? catalogValues(catalog, 'material', { company: '', spec: '', material: '' }) : linkedMaterials)
    .sort((a, b) => a.localeCompare(b, 'ko'))
  const linkFilter = materialUnlinked ? { ...link, material: '' } : link
  const companyOptions = catalogValues(catalog, 'company', { ...linkFilter, company: '' }).sort((a, b) => a.localeCompare(b, 'ko'))
  const specOptions = catalogValues(catalog, 'spec', { ...linkFilter, spec: '' }).sort((a, b) => {
    const left = parseSpec(a)
    const right = parseSpec(b)
    if (left && right) {
      const thickness = Number(left.thickness) - Number(right.thickness)
      if (thickness) return thickness
      return Number(left.length) - Number(right.length)
    }
    return a.localeCompare(b, 'ko')
  })
  const takenBarcodes = new Map(sheets.filter((item) => item.barcode && item.id !== sheet?.id).map((item) => [item.barcode.toUpperCase(), item.id]))

  // 바코드를 연동한 성적서는 업체·규격만 있어도 재질이 하나로 정해지면 자동으로 채운다.
  useEffect(() => {
    if (!ready || embed || !canWrite || !sheet?.barcode || sheet.material || catalog.length === 0) return
    const options = catalogValues(catalog, 'material', { company: sheet.company, spec: sheet.spec, material: '' })
    if (options.length === 1) patch({ material: options[0] })
  }, [ready, embed, canWrite, catalog, sheet?.id, sheet?.barcode, sheet?.company, sheet?.spec, sheet?.material])

  useEffect(() => {
    if (!ready || !sheet) return
    const parsed = parseSpec(sheet.spec)
    if (!parsed) return
    const thicknessSpec = thicknessText(parsed.thickness)
    const lengthSpec = widthText(parsed.length)
    const nextThickness = !sheet.thicknessSpec || sheet.thicknessSpec === parsed.thickness ? thicknessSpec : sheet.thicknessSpec
    const nextWidth = !sheet.lengthSpec || sheet.lengthSpec === parsed.length ? lengthSpec : sheet.lengthSpec
    if (nextThickness === sheet.thicknessSpec && nextWidth === sheet.lengthSpec) return
    patch({ thicknessSpec: nextThickness, lengthSpec: nextWidth })
  }, [ready, sheet?.id, sheet?.spec, sheet?.thicknessSpec, sheet?.lengthSpec])


  function removeSheet() {
    if (!pendingDelete) return
    const next = sheets.filter((item) => item.id !== pendingDelete.id)
    setSheets(next)
    if (activeId === pendingDelete.id) {
      const sibling = next.find((item) => item.floor === pendingDelete.floor && !item.done) ?? next.find((item) => !item.done) ?? next[0]
      setActiveId(sibling?.id ?? '')
      if (sibling) setFloor(sibling.floor)
    }
    setPendingDelete(null)
  }

  async function goToLotCard() {
    if (!sheet || moving) return
    if (!sheet.company.trim() || !sheet.spec.trim() || !sheet.material.trim()) {
      toast.error('업체명, 규격, 재질을 먼저 적습니다.')
      return
    }
    setMoving(true)
    try {
      const response = await fetch('/api/lot-cards', { cache: 'no-store' })
      const body = await response.json().catch(() => null)
      if (!response.ok || !Array.isArray(body?.data)) throw new Error('load')
      type CardCarry = { sourceIncomingId?: string; id?: string; createdAt?: string; done?: boolean; product?: string; barcode?: string; lotNo?: string; receivedAt?: string; quantity?: string; rollCount?: string; incomingDate?: string; incomingJudge?: string }
      const existing = (body.data as CardCarry[]).find((item) => item.sourceIncomingId === sheet.id)
      const now = new Date().toISOString()
      // 이력카드에서 이미 고친 값은 그대로 두고, 비어 있는 칸만 수입검사 성적서 값으로 채운다.
      const fill = (current: string | undefined, next: string) => (current?.trim() ? current : next)
      const card = {
        ...(existing ?? {}),
        id: existing?.id || crypto.randomUUID(),
        floor: sheet.floor,
        done: existing?.done === true,
        createdAt: existing?.createdAt || now,
        updatedAt: now,
        sourceIncomingId: sheet.id,
        partner: sheet.company,
        product: existing?.product && existing.product !== sheet.spec ? existing.product : '',
        spec: sheet.spec,
        material: sheet.material,
        barcode: sheet.barcode || existing?.barcode || '',
        // LOT 번호가 아무 데도 없으면 오늘 날짜-01 로 시작한다.
        lotNo: fill(existing?.lotNo, sheet.lotNo.trim() || defaultLotNo()),
        receivedAt: fill(existing?.receivedAt, sheet.receivedAt),
        quantity: fill(existing?.quantity, cardQuantityText(sheet)),
        rollCount: fill(existing?.rollCount, sheet.lotRoll.trim()),
        incomingDate: fill(existing?.incomingDate, sheet.inspectedOn),
        incomingJudge: fill(existing?.incomingJudge, sheet.judgment),
      }
      const saved = await fetch('/api/lot-cards', {
        method: 'PUT',
        headers: getJsonAuthHeaders(),
        body: JSON.stringify(card),
      })
      if (!saved.ok) throw new Error('save')
      router.push(withShipmentBundle(card.id, '/shipment/lot-card'))
    } catch {
      toast.error('이력카드로 넘기지 못했습니다.')
      setMoving(false)
    }
  }

  const locked = !canWrite
  const sampleRefs = (sheet?.remark ?? '').split(' · ').filter(Boolean)

  return (
    <div className={cn(PAGE_SHELL, 'incoming-inspection-screen')}>
      <div className="no-print contents">
        <PageHeader
          tone="teal"
          icon={ClipboardCheck}
          eyebrow="재고 관리"
          title="수입검사 성적서"
          description="성적서를 채우고, 위 흐름 바에서 완료·인쇄하거나 다음 단계 카드를 눌러 이력카드로 이어 씁니다."
          actions={(
            <>
              {canWrite && (
                <Button variant="outline" className={BAND_BUTTON} disabled={!sheet} onClick={toggleDone}>
                  <Check className="h-4 w-4" /> {sheet?.done ? '완료 취소' : '완료'}
                </Button>
              )}
              {canWrite && (
                <Button variant="outline" className={BAND_BUTTON} disabled={!sheet || finishing} onClick={() => void saveToExplorer()}>
                  <Save className="h-4 w-4" /> {finishing ? '저장 중…' : '저장'}
                </Button>
              )}
              <Button className={BAND_BUTTON_PRIMARY} disabled={!sheet} onClick={() => window.print()}>
                <Printer className="h-4 w-4" /> 인쇄
              </Button>
            </>
          )}
        />
        {!embed && <ShipmentTabNav />}
        <ShipmentDocFlowNav
          step="incoming"
          currentId={sheet?.id}
          canWrite={canWrite}
          onNext={() => { void goToLotCard() }}
          nextDisabled={!sheet}
          nextLoading={moving}
        />
      </div>

      <div className="incoming-inspection-work flex min-h-[calc(100vh-13rem)] items-stretch gap-4">

      {!sheet && (
        <div className="no-print flex min-h-[297mm] flex-1 items-center justify-center rounded-xl border border-dashed border-slate-300 text-sm text-slate-400">
          입고등록 목록에서 '수입검사 작성'을 눌러 성적서를 엽니다
        </div>
      )}

      {sheet && (
        <div className="flex min-w-0 flex-1 flex-col items-center gap-3">
        <InboundLink
          className="w-[210mm] max-w-full shrink-0"
          barcode={sheet.barcode}
          canWrite={canWrite}
          taken={takenBarcodes}
          match={{ company: sheet.company, spec: sheet.spec }}
          onLink={(item) => applyInbound(item)}
          onClear={clearInbound}
          printLabel={{ partner: sheet.company, product: sheet.spec, spec: sheet.material, lotNo: sheet.lotNo, date: sheet.receivedAt || sheet.inspectedOn }}
        />
        <article ref={articleRef} inert={embed} className={cn('incoming-sheet flex h-[297mm] w-[210mm] shrink-0 flex-col overflow-hidden bg-white px-[10mm] py-[8mm] text-slate-900 shadow-md ring-1 ring-black/10 print:shadow-none print:ring-0', locked && '[&_input]:pointer-events-none [&_textarea]:pointer-events-none [&_select]:pointer-events-none')}>
          {/* 머리: 제목 */}
          <header className="border-b-2 border-slate-900 pb-2 text-center">
            <h2 className="text-[24px] font-extrabold tracking-[0.35em]">수입검사 성적서</h2>
          </header>

          {/* 회사 · 결재 */}
          <div className="mt-3 flex items-end justify-between gap-4">
            <div className="flex items-center gap-2 pb-1">
              <img src="/logo.png" alt="WOORI" className="h-20 w-auto object-contain" />
              <span className="text-[18px] font-bold">우리하이피 (주)</span>
            </div>
            <div className="flex w-[58mm] shrink-0 flex-col">
            <table className="w-full table-fixed border-collapse text-center text-[12px]">
              <colgroup>
                <col className="w-6" />
                <col />
                <col />
              </colgroup>
              <tbody>
                <tr>
                  <th rowSpan={3} className="w-6 border border-slate-800 [writing-mode:vertical-rl]">결재</th>
                  {(['작성', '승인'] as const).map((label) => (
                    <th key={label} className="border border-slate-800 py-0.5 font-semibold">{label}</th>
                  ))}
                </tr>
                <tr>
                  {/* 작성: 지금 로그인한 사람의 서명을 자동으로 넣는다. 승인: 조승현 부장 서명. */}
                  <td className="h-12 border border-slate-800">
                    <SignatureOrName src="/api/auth/signature" name={user?.displayName || user?.username || ''} />
                  </td>
                  <td className="h-12 border border-slate-800">
                    <SignatureOrName src="/api/auth/signature?approver=1" name="조승현 부장" />
                  </td>
                </tr>
                <tr>
                  <td className="border border-slate-800 py-0.5 text-[11px] font-semibold">{[user?.displayName || user?.username, user?.jobTitle].filter(Boolean).join(' ')}</td>
                  <td className="border border-slate-800 py-0.5 text-[11px] font-semibold">조승현 부장</td>
                </tr>
              </tbody>
            </table>
            </div>
          </div>

          {/* 기본 정보 */}
          <table className="mt-3 w-full table-fixed border-collapse text-[13px]">
            <colgroup>
              <col className="w-[24mm]" />
              <col />
              <col className="w-[24mm]" />
              <col />
            </colgroup>
            <tbody>
              <tr>
                <th className="border border-slate-800 bg-slate-100 py-1.5 text-center font-semibold">업 체 명</th>
                <td className="border border-slate-800 px-1"><CatalogField configName="companies" options={companyOptions} value={sheet.company} onChange={(company) => chooseLink('company', company)} disabled={locked} /></td>
                <th className="border border-slate-800 bg-slate-100 py-1.5 text-center font-semibold">규 격</th>
                <td className="border border-slate-800 px-1"><CatalogField configName="products" options={specOptions} value={sheet.spec} onChange={(spec) => chooseLink('spec', spec)} disabled={locked} /></td>
              </tr>
              <tr>
                <th className="border border-slate-800 bg-slate-100 py-1.5 text-center font-semibold">재 질</th>
                <td className="border border-slate-800 px-1"><CatalogField configName="materials" options={materialOptions} value={sheet.material} onChange={(material) => (materialUnlinked && material ? patch({ material }) : chooseLink('material', material))} disabled={locked} /></td>
                <th className="border border-slate-800 bg-slate-100 py-1.5 text-center font-semibold">LOT 중량</th>
                <td className="border border-slate-800 px-1">
                  <div className="flex items-center gap-1 px-1">
                    <Field value={sheet.lotWeight} onChange={(lotWeight) => patch({ lotWeight })} className="w-14 px-0 text-left" />
                    <select
                      value={sheet.lotWeightUnit === 'EA' ? 'EA' : 'Kg'}
                      disabled={locked}
                      onChange={(event) => patch({ lotWeightUnit: event.target.value === 'EA' ? 'EA' : 'Kg' })}
                      className="bg-transparent text-[13px] outline-none print:hidden"
                    >
                      <option value="Kg">Kg</option>
                      <option value="EA">EA</option>
                    </select>
                    <span className="hidden print:inline">{sheet.lotWeightUnit === 'EA' ? 'EA' : 'Kg'}</span>
                    <span>/</span>
                    <Field value={sheet.lotRoll} onChange={(lotRoll) => patch({ lotRoll })} className="w-10" />
                    <span>R</span>
                  </div>
                </td>
              </tr>
              <tr>
                <th className="border border-slate-800 bg-slate-100 py-1.5 text-center font-semibold">검 사 자</th>
                <td className="border border-slate-800 px-1"><Field value={sheet.inspector} onChange={(inspector) => patch({ inspector })} className="text-left" /></td>
                <th className="border border-slate-800 bg-slate-100 py-1.5 text-center font-semibold">검 사 일</th>
                <td className="border border-slate-800 px-1">
                  <input type="date" value={sheet.inspectedOn} onChange={(event) => patch({ inspectedOn: event.target.value })} className="bg-transparent px-1 text-[13px] outline-none print:hidden" />
                  <span className="hidden px-1 print:inline">{koDate(sheet.inspectedOn)}</span>
                </td>
              </tr>
            </tbody>
          </table>

          {/* 검사 내역 */}
          <p className="mb-1 mt-4 text-[13px] font-bold">■ 검사 내역</p>
          <table className="w-full table-fixed border-collapse text-[12.5px]">
            <colgroup>
              <col className="w-[20mm]" />
              <col className="w-[18mm]" />
              <col />
              <col className="w-[22mm]" />
              <col className="w-[28mm]" />
              <col className="w-[26mm]" />
            </colgroup>
            <thead>
              <tr>
                <th className="border border-slate-800 bg-slate-100 py-1.5 text-center font-semibold">검사항목</th>
                <th className="border border-slate-800 bg-slate-100 py-1.5 text-center font-semibold">검사방법</th>
                <th className="border border-slate-800 bg-slate-100 py-1.5 text-center font-semibold tracking-[0.3em]">검사규격</th>
                <th className="border border-slate-800 bg-slate-100 py-1.5 text-center font-semibold">측정값</th>
                <th className="border border-slate-800 bg-slate-100 py-1.5 text-center font-semibold">검사주기</th>
                <th className="border border-slate-800 bg-slate-100 py-1.5 text-center font-semibold">측정결과</th>
              </tr>
            </thead>
            <tbody>
              <tr className="h-[40mm]">
                <th className="border border-slate-800 font-semibold tracking-[0.3em]">외관</th>
                <td className="border border-slate-800 text-center tracking-[0.3em]">육안</td>
                <td colSpan={2} className="border border-slate-800 px-2">
                  <textarea value={sheet.appearanceSpec} onChange={(event) => patch({ appearanceSpec: event.target.value })} rows={4} className="w-full resize-none overflow-hidden bg-transparent px-2 text-left text-[13px] leading-[1.75] outline-none [field-sizing:content]" />
                </td>
                <td className="border border-slate-800 text-center">REEL마다/LOT</td>
                <td className="border border-slate-800"><ResultMark value={sheet.appearanceResult} onChange={(appearanceResult) => patch({ appearanceResult })} disabled={locked} /></td>
              </tr>
              <tr className="h-[12mm]">
                <th rowSpan={2} className="border border-slate-800 font-semibold tracking-[0.3em]">치수</th>
                <td rowSpan={2} className="border border-slate-800 text-center">V/C</td>
                <td className="border border-slate-800 px-2">
                  <div className="flex items-center gap-2">
                    <span className="w-[22mm] shrink-0 text-[12px]">① 두께(mm)</span>
                    <Field value={sheet.thicknessSpec} onChange={(thicknessSpec) => patch({ thicknessSpec })} placeholder="0.15±0.01" />
                  </div>
                </td>
                <td className="border border-slate-800 px-1">
                  <div className="flex items-center">
                    <Field value={sheet.thicknessValue} onChange={(thicknessValue) => patch({ thicknessValue })} placeholder="0.30" className="font-semibold" />
                    <span className="shrink-0 text-[11px] text-slate-500">mm</span>
                  </div>
                </td>
                <td rowSpan={2} className="border border-slate-800 text-center">REEL마다/LOT</td>
                <td className="border border-slate-800"><ResultMark value={sheet.thicknessResult} onChange={(thicknessResult) => patch({ thicknessResult })} disabled={locked} /></td>
              </tr>
              <tr className="h-[12mm]">
                <td className="border border-slate-800 px-2">
                  <div className="flex items-center gap-2">
                    <span className="w-[22mm] shrink-0 text-[12px]">② 전폭(mm)</span>
                    <Field value={sheet.lengthSpec} onChange={(lengthSpec) => patch({ lengthSpec })} placeholder="61.0 -0.1" />
                  </div>
                </td>
                <td className="border border-slate-800 px-1">
                  <div className="flex items-center">
                    <Field value={sheet.widthValue} onChange={(widthValue) => patch({ widthValue })} placeholder="68.00" className="font-semibold" />
                    <span className="shrink-0 text-[11px] text-slate-500">mm</span>
                  </div>
                </td>
                <td className="border border-slate-800"><ResultMark value={sheet.widthResult} onChange={(widthResult) => patch({ widthResult })} disabled={locked} /></td>
              </tr>
            </tbody>
          </table>

          {/* 검사 시료 (전체 폭). 종합판정 도장은 오른쪽 아래 구석에 찍힌다. */}
          <div className="mt-4 flex min-h-0 flex-1 flex-col border border-slate-800">
              <div className="relative border-b border-slate-800 bg-slate-100 py-1.5 text-center text-[13px] font-semibold tracking-[0.3em]">
                검사 시료
                <div role="group" aria-label="종합판정" className="no-print absolute right-2 top-1/2 flex -translate-y-1/2 gap-1 tracking-normal">
                  {(['합격', '불합격'] as const).map((item) => {
                    const picked = sheet.judgment === item
                    const tone = item === '합격' ? 'border-blue-600 bg-blue-600' : 'border-rose-600 bg-rose-600'
                    return (
                      <button
                        key={item}
                        type="button"
                        aria-pressed={picked}
                        disabled={locked}
                        onClick={() => patch({ judgment: picked ? '' : item })}
                        className={cn(
                          'h-7 rounded-full border px-3 text-[12px] font-bold transition-colors disabled:opacity-50',
                          picked ? cn(tone, 'text-white shadow-sm') : 'border-slate-300 bg-white text-slate-500 hover:border-slate-500 hover:text-slate-800',
                        )}
                      >
                        {item}
                      </button>
                    )
                  })}
                </div>
              </div>
              <div className="relative flex min-h-[70mm] flex-1 items-center justify-center p-2">
                {sheet.samplePhoto ? (
                  <img src={sheet.samplePhoto} alt="검사 시료 사진" className="max-h-full max-w-full object-contain" />
                ) : (
                  <span className="text-[12px] text-slate-300 print:hidden">시료 사진을 넣거나 비워 둡니다</span>
                )}
                {canWrite && (
                  <div className="no-print absolute right-2 top-2 flex gap-1">
                    <label className="cursor-pointer rounded-md border border-slate-300 bg-white px-2 py-0.5 text-[12px] font-semibold text-slate-700 shadow-sm hover:bg-slate-50">
                      사진 교체
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(event) => {
                          const file = event.target.files?.[0]
                          event.target.value = ''
                          if (!file) return
                          void shrinkPhoto(file)
                            .then((samplePhoto) => patch({ samplePhoto }))
                            .catch(() => toast.error('사진을 읽지 못했습니다.'))
                        }}
                      />
                    </label>
                    {sheet.samplePhoto && (
                      <button type="button" onClick={() => patch({ samplePhoto: '' })} className="rounded-md border border-slate-300 bg-white px-2 py-0.5 text-[12px] text-slate-500 shadow-sm hover:bg-slate-50">
                        제거
                      </button>
                    )}
                  </div>
                )}
                {sheet.judgment && (
                  <div className="pointer-events-none absolute bottom-6 right-6">
                    <PassStamp judgment={sheet.judgment} date={stampDate(sheet.inspectedOn)} />
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2 border-t border-slate-800 px-3 py-1.5 text-[13px]">
                <span className="shrink-0 font-semibold">시료 참조 :</span>
                {/* 누르면 켜지고 다시 누르면 꺼진다. 인쇄에는 켠 항목만 글자로 나온다. */}
                <div className="flex flex-wrap items-center gap-1.5">
                  {SAMPLE_REFS.map((label) => {
                    const picked = sampleRefs.includes(label)
                    return (
                      <button
                        key={label}
                        type="button"
                        aria-pressed={picked}
                        disabled={locked}
                        onClick={() => patch({ remark: SAMPLE_REFS.filter((item) => (item === label ? !picked : sampleRefs.includes(item))).join(' · ') })}
                        className={cn(
                          'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[12px] font-semibold transition-colors',
                          picked
                            ? 'border-slate-800 bg-slate-800 text-white print:border-0 print:bg-transparent print:px-0 print:text-[13px] print:text-slate-900'
                            : 'border-slate-300 text-slate-400 hover:border-slate-500 hover:text-slate-700 print:hidden',
                        )}
                      >
                        {/* 체크 자리는 늘 비워 둬서 누를 때 버튼 폭이 바뀌지 않게 한다. */}
                        <Check className={cn('h-3 w-3 print:hidden', !picked && 'invisible')} />
                        {label}
                      </button>
                    )
                  })}
                </div>
              </div>
          </div>

          <footer className="mt-3 flex shrink-0 items-center justify-between border-t border-slate-300 pt-1.5 text-[11px] text-slate-500">
            <span>QEP 840-03 (Rev.1)</span>
            <span>우리 하이 피 (주)</span>
            <span>A4 (210×297)</span>
          </footer>
        </article>
        </div>
      )}
      </div>

      <ConfirmDeleteDialog
        open={pendingDelete != null}
        onOpenChange={(open) => { if (!open) setPendingDelete(null) }}
        title="수입검사 성적서 삭제"
        onConfirm={removeSheet}
      >
        이 수입검사 성적서를 목록에서 삭제합니다.
      </ConfirmDeleteDialog>
    </div>
  )
}

function CatalogField({
  configName,
  options,
  value,
  onChange,
  disabled,
}: {
  configName: string
  options: string[]
  value: string
  onChange: (value: string) => void
  disabled: boolean
}) {
  return (
    <SearchableCombobox
      configName={configName}
      options={options}
      listAll
      listClassName="max-h-[min(24rem,70vh)]"
      value={value}
      onChange={onChange}
      placeholder=""
      creatable={false}
      disabled={disabled}
      className="sheet-combo h-8 justify-start rounded-none border-0 bg-transparent px-1 text-left text-[13px] font-normal text-slate-900 shadow-none hover:bg-transparent"
    />
  )
}

function PassStamp({ judgment, date }: { judgment: Judgment; date: string }) {
  const pass = judgment === '합격'
  const ink = pass ? 'border-blue-700 text-blue-700' : 'border-rose-600 text-rose-600'
  // 도장처럼 살짝 기울이고, 바깥 테두리와 안쪽 테두리를 겹쳐 두 겹으로 보이게 한다.
  return (
    <div className={cn('relative flex h-[30mm] w-[30mm] -rotate-[8deg] items-center justify-center rounded-full border-[3px] opacity-90 mix-blend-multiply', ink)}>
      <div className={cn('absolute inset-[1.5mm] rounded-full border-[1.2px]', ink)} />
      <div className="flex flex-col items-center text-center leading-tight">
        <span className="text-[9px] font-semibold tracking-[0.25em]">우리하이피</span>
        <span className="my-0.5 h-px w-[18mm] bg-current" />
        <span className="text-[19px] font-black tracking-[0.12em]">{judgment}</span>
        <span className="my-0.5 h-px w-[18mm] bg-current" />
        <span className="text-[9px] font-semibold">{date}</span>
        <span className="text-[9px] font-semibold tracking-[0.3em]">QC</span>
      </div>
    </div>
  )
}
