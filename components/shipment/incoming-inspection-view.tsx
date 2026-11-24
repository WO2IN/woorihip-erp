'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Check, ClipboardCheck, FileText, Plus, Printer, Search, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { StampApprovalButton } from '@/components/approvals/stamp-approval-button'
import { useAuth } from '@/components/auth/auth-context'
import { type ApprovalRequest } from '@/lib/approval'
import { ConfirmDeleteDialog } from '@/components/shared/confirm-delete-dialog'
import { BAND_BUTTON, BAND_BUTTON_PRIMARY, PAGE_SHELL, PageHeader } from '@/components/shared/page-header'
import { ShipmentDocFlowNav } from '@/components/shipment/shipment-doc-flow-nav'
import { Button } from '@/components/ui/button'
import { getJsonAuthHeaders } from '@/lib/auth-client'
import { isShipmentBundleLocked, withShipmentBundle } from '@/lib/shipment-bundle'
import { removeSheetDocument, saveSheetDocument } from '@/lib/sheet-document'
import { INCOMING_INSPECTION_TYPE } from '@/lib/file-types'
import { useEmbedPreview } from '@/hooks/use-embed-preview'
import { cn } from '@/lib/utils'
import { SearchableCombobox } from '@/components/ui/searchable-combobox'

const APPEARANCE_SPEC = '1)외관 변형 없을것.\n2)스크래치 없을 것.\n3)감김상태(Widing)는\n균일하고 제품의 변형,\nREEL 파손 등이 없을것.'
const APPEARANCE_SPEC_PREVIOUS = [
  '1) 외관 변형 없을것.\n스크래치 없을것.\n2) 끝말림(Widing) 변형 없을것.\nREEL 파손 등이 없을것.',
  '1)외관 변형 없을것.\n스크래치 없을것.\n2)끝말림(Widing)은\n감김으로 제품의 변형,\nREEL 파손 등이 없을것.',
]

type Judgment = '' | '합격' | '불합격'
type Floor = '1' | '2' | '3'
const FLOORS = ['1', '2', '3'] as const

type Sheet = {
  id: string
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
  dimensionResult: string
  drawLength: string
  drawThickness: string
  judgment: Judgment
  writer: string
  approver: string
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
    thicknessResult: '',
    widthResult: '',
    dimensionResult: '',
    drawLength: '',
    drawThickness: '',
    judgment: '',
    writer: '',
    approver: '',
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
    thicknessResult: saved.thicknessResult === 'OK' || saved.thicknessResult === 'NG' ? saved.thicknessResult : '',
    widthResult: saved.widthResult === 'OK' || saved.widthResult === 'NG' ? saved.widthResult : '',
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

function InspectionCatalog({
  sheets,
  onOpen,
  onDelete,
  canDelete,
  openLocked = false,
}: {
  sheets: Sheet[]
  onOpen: (sheet: Sheet) => void
  onDelete: (sheet: Sheet) => void
  canDelete: boolean
  openLocked?: boolean
}) {
  const [query, setQuery] = useState('')
  const [floorFilter, setFloorFilter] = useState<'all' | Floor>('all')
  const keyword = query.trim().toLowerCase()
  const rows = sheets
    .filter((item) => floorFilter === 'all' || item.floor === floorFilter)
    .filter((item) => {
      if (!keyword) return true
      return [item.company, item.spec, item.material, item.inspector, item.judgment, koDate(item.inspectedOn)]
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
            placeholder="업체, 규격, 재질, 검사자 검색"
            className="h-9 w-full rounded-lg border border-input bg-background pl-9 pr-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </label>
      </div>
      {rows.length === 0 ? (
        <div className="flex h-56 flex-col items-center justify-center gap-3 text-slate-400">
          <FileText className="h-12 w-12 opacity-25" />
          <p className="text-sm">{keyword || floorFilter !== 'all' ? '조건에 맞는 수입검사 성적서가 없습니다.' : '완료된 수입검사 성적서가 없습니다.'}</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <div className="min-w-[760px]">
            <div className="grid grid-cols-[1.2fr_1.2fr_1.1fr_1fr_0.8fr_0.5fr_0.6fr_4.5rem] gap-3 border-b bg-muted px-4 py-2 text-sm font-semibold text-muted-foreground">
              <span>업체</span>
              <span>규격</span>
              <span>재질</span>
              <span>검사일</span>
              <span>검사자</span>
              <span>층</span>
              <span>판정</span>
              <span />
            </div>
            {rows.map((item) => (
              <div key={item.id} className={cn('grid grid-cols-[1.2fr_1.2fr_1.1fr_1fr_0.8fr_0.5fr_0.6fr_4.5rem] items-center gap-3 border-b border-border/60 px-4 py-2.5 text-[15px] last:border-b-0', !openLocked && 'hover:bg-muted/40')}>
                <button
                  type="button"
                  disabled={openLocked}
                  onClick={() => { if (!openLocked) onOpen(item) }}
                  className={cn('contents text-left', openLocked && 'cursor-default opacity-60')}
                >
                  <span className="truncate font-semibold text-foreground">{item.company || '수입검사 성적서'}</span>
                  <span className="truncate text-foreground">{item.spec || '-'}</span>
                  <span className="truncate text-muted-foreground">{item.material || '-'}</span>
                  <span className="text-muted-foreground">{koDate(item.inspectedOn) || '-'}</span>
                  <span className="truncate text-foreground">{item.inspector || '-'}</span>
                  <span className="font-semibold text-foreground">{item.floor}층</span>
                  <span className="font-semibold text-foreground">{item.judgment || '-'}</span>
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
            onClick={() => onChange(selected ? '' : option)}
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
  const bundleLock = isShipmentBundleLocked(searchParams)
  const { user, loading: authLoading } = useAuth()
  const canWrite = user?.role === 'editor' || user?.role === 'admin'
  const [sheets, setSheets] = useState<Sheet[]>([])
  const [activeId, setActiveId] = useState('')
  const [screen, setScreen] = useState<'edit' | 'list'>('edit')
  const [floor, setFloor] = useState<Floor>('1')
  const [ready, setReady] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<Sheet | null>(null)
  const [catalog, setCatalog] = useState<CatalogRow[]>([])
  const [approval, setApproval] = useState<ApprovalRequest | null>(null)
  const [approvalTick, setApprovalTick] = useState(0)
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
      setScreen('edit')
      return
    }
    const requested = searchParams.get('floor')
    const nextFloor: Floor = requested === '2' || requested === '3' ? requested : '1'
    if (requested === '1' || requested === '2' || requested === '3') setFloor(nextFloor)
    if (searchParams.get('new') === '1' && canWrite) {
      const next = { ...emptySheet(), floor: nextFloor, inspectedOn: todayKey(), inspector: user?.displayName ?? '' }
      setSheets((current) => [next, ...current])
      setActiveId(next.id)
      setScreen('edit')
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
  }, [sheet?.id, approvalTick])

  /**
   * 완료하면 서식을 PDF로 만들어 문서탐색기(수입검사성적서)에 저장하고 목록으로 넘어간다.
   * 완료를 취소하면 문서탐색기에 저장했던 문서도 지운다.
   */
  async function toggleDone() {
    if (!sheet || finishing) return
    setFinishing(true)
    try {
      if (sheet.done) {
        patch({ done: false })
        const removed = await removeSheetDocument(INCOMING_INSPECTION_TYPE, sheet.id)
        if (!removed.ok) toast.error(removed.error)
        return
      }
      const saved = articleRef.current
        ? await saveSheetDocument({
            node: articleRef.current,
            documentType: INCOMING_INSPECTION_TYPE,
            sourceSheetId: sheet.id,
            company: sheet.company,
            product: sheet.model || sheet.spec,
            material: sheet.material,
            issueDate: sheet.inspectedOn,
            floor: sheet.floor,
          })
        : { ok: false as const, error: '수입검사성적서 화면을 찾지 못해 문서탐색기에 저장하지 못했습니다.' }
      patch({ done: true })
      const sibling = sheets.find((item) => item.id !== sheet.id && item.floor === sheet.floor && !item.done)
      setActiveId(sibling?.id ?? '')
      setScreen('list')
      if (saved.ok) toast.success('문서탐색기에 수입검사성적서로 저장했습니다.')
      else toast.error(`${saved.error} 완료는 처리됐으니 완료 취소 후 다시 완료하면 다시 저장합니다.`)
    } finally {
      setFinishing(false)
    }
  }

  function patch(partial: Partial<Sheet>) {
    setSheets((current) => current.map((item) => item.id === activeId ? { ...item, ...partial, updatedAt: new Date().toISOString() } : item))
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
  const companyOptions = catalogValues(catalog, 'company', { ...link, company: '' }).sort((a, b) => a.localeCompare(b, 'ko'))
  const specOptions = catalogValues(catalog, 'spec', { ...link, spec: '' }).sort((a, b) => {
    const left = parseSpec(a)
    const right = parseSpec(b)
    if (left && right) {
      const thickness = Number(left.thickness) - Number(right.thickness)
      if (thickness) return thickness
      return Number(left.length) - Number(right.length)
    }
    return a.localeCompare(b, 'ko')
  })
  const materialOptions = catalogValues(catalog, 'material', { ...link, material: '' }).sort((a, b) => a.localeCompare(b, 'ko'))
  const drawn = parseSpec(sheet?.spec ?? '')

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

  const floorSheets = sheets.filter((item) => item.floor === floor && !item.done).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  const doneSheets = sheets.filter((item) => item.done)

  function createSheet() {
    const next = { ...emptySheet(), floor, inspectedOn: todayKey(), inspector: user?.displayName ?? '' }
    setSheets((current) => [next, ...current])
    setActiveId(next.id)
  }

  function openListed(item: Sheet) {
    if (bundleLock) return
    setFloor(item.floor)
    setActiveId(item.id)
    setScreen('edit')
  }

  function openFloor(nextFloor: Floor) {
    setFloor(nextFloor)
    if (bundleLock) return
    const onFloor = sheets.filter((item) => item.floor === nextFloor && !item.done).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    setActiveId(onFloor[0]?.id ?? '')
  }

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
      const existing = (body.data as { sourceIncomingId?: string; id?: string; createdAt?: string; done?: boolean; product?: string }[]).find((item) => item.sourceIncomingId === sheet.id)
      const now = new Date().toISOString()
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

  return (
    <div className={cn(PAGE_SHELL, 'incoming-inspection-screen')}>
      <div className="no-print">
        <PageHeader
          tone="teal"
          icon={ClipboardCheck}
          eyebrow="재고 관리"
          title="수입검사 성적서"
          description="작성 중인 수입검사 성적서를 고치고, 완료하면 목록으로 넘어갑니다."
          actions={screen === 'edit' ? (
            <>
              {canWrite && (
                <Button
                  variant="outline"
                  className={BAND_BUTTON}
                  disabled={!sheet || finishing}
                  onClick={() => void toggleDone()}
                >
                  <Check className="h-4 w-4" /> {finishing ? '저장 중…' : sheet?.done ? '완료 취소' : '완료'}
                </Button>
              )}
              <Button className={BAND_BUTTON_PRIMARY} disabled={!sheet} onClick={() => window.print()}>
                <Printer className="h-4 w-4" /> 인쇄
              </Button>
            </>
          ) : undefined}
        />
        <ShipmentDocFlowNav
          step="incoming"
          canWrite={canWrite}
          onNext={screen === 'edit' ? () => { void goToLotCard() } : undefined}
          nextDisabled={!sheet}
          nextLoading={moving}
        />
        <div role="tablist" aria-label="수입검사 성적서 화면" className="mt-4">
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
                {id === 'list' && <span className="ml-2 text-xs tabular-nums text-slate-400">{doneSheets.length}</span>}
              </button>
            ))}
          </div>
          <div className="h-[2px] bg-slate-700 dark:bg-white/70" />
        </div>
      </div>

      {screen === 'list' ? (
        <InspectionCatalog sheets={doneSheets} onOpen={openListed} onDelete={setPendingDelete} canDelete={canWrite} openLocked={bundleLock} />
      ) : (
      <div className="incoming-inspection-work flex min-h-[calc(100vh-13rem)] items-stretch gap-4">
        <aside className="no-print flex h-[297mm] w-80 shrink-0 flex-col self-start overflow-hidden rounded-xl border bg-card shadow-sm">
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
              <Button type="button" variant="outline" className="h-8 w-full text-[14px]" onClick={createSheet}>
                <Plus className="h-3.5 w-3.5" />
                {floor}층 수입검사 성적서 추가
              </Button>
            </div>
          )}
          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {floorSheets.length === 0 ? (
              <p className="px-2 py-6 text-center text-[14px] text-slate-400">{floor}층에 작성 중인 수입검사 성적서가 없습니다</p>
            ) : floorSheets.map((item) => {
              const selected = item.id === sheet?.id
              const label = item.company || '수입검사 성적서'
              return (
                <div key={item.id} className={cn('mb-1 flex items-stretch rounded-lg', selected ? 'bg-slate-900 text-white' : !bundleLock && 'hover:bg-slate-100')}>
                  <button
                    type="button"
                    disabled={bundleLock && !selected}
                    onClick={() => { if (!bundleLock || selected) setActiveId(item.id) }}
                    className={cn('min-w-0 flex-1 px-2.5 py-2 text-left', bundleLock && !selected && 'cursor-not-allowed opacity-50')}
                  >
                    <span className="block truncate text-[15px] font-semibold">{label}</span>
                    <span className={cn('mt-1 block text-[12px]', selected ? 'text-white/70' : 'text-slate-400')}>
                      {[item.spec, koDate(item.inspectedOn) || '검사일 없음'].filter(Boolean).join(' · ')}
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

      {!sheet && (
        <div className="no-print flex min-h-[297mm] flex-1 items-center justify-center rounded-xl border border-dashed border-slate-300 text-sm text-slate-400">
          왼쪽에서 수입검사 성적서를 고르거나 새로 추가합니다
        </div>
      )}

      {sheet && (
        <div className="flex min-w-0 flex-1 justify-center overflow-x-auto">
        <article ref={articleRef} inert={embed} className={cn('incoming-sheet flex h-[297mm] w-[210mm] shrink-0 flex-col bg-white px-[8mm] py-[6mm] text-slate-900 shadow-md ring-1 ring-black/10 print:shadow-none print:ring-0', locked && '[&_input]:pointer-events-none [&_textarea]:pointer-events-none [&_select]:pointer-events-none')}>
          <h2 className="border border-slate-800 py-1.5 text-center text-[22px] font-extrabold tracking-[0.4em]">수입검사 성적서</h2>
          <div className="mt-2 flex items-stretch gap-3">
            <div className="flex flex-1 items-center gap-2">
              <img src="/logo.png" alt="WOORI" className="h-10 w-auto object-contain" />
              <span className="text-[15px] font-semibold">우리 하이 피 (주)</span>
            </div>
            <div className="flex w-[78mm] shrink-0 flex-col">
            <table className="w-full border-collapse text-center text-[12px]">
              <tbody>
                <tr>
                  <th rowSpan={2} className="w-6 border border-slate-800 [writing-mode:vertical-rl]">결재</th>
                  {(['작성', '검토', '승인'] as const).map((label) => (
                    <th key={label} className="border border-slate-800 py-0.5 font-semibold">{label}</th>
                  ))}
                </tr>
                <tr>
                  {(['작성', '검토', '승인'] as const).map((label) => {
                    const step = signStep(approval, label)
                    const signed = step?.status === 'approved' && !!step.userId
                    return (
                      <td key={label} className="h-12 border border-slate-800">
                        {signed ? (
                          <img src={`/api/auth/signature?userId=${encodeURIComponent(step.userId)}`} alt={step.name} className="mx-auto h-10 max-w-full object-contain" />
                        ) : null}
                      </td>
                    )
                  })}
                </tr>
              </tbody>
            </table>
            {canWrite && !(['작성', '검토', '승인'] as const).some((label) => {
              const step = signStep(approval, label)
              return step?.status === 'approved' && !!step.userId
            }) && (
              <div className="no-print flex justify-end pt-0.5">
                  <StampApprovalButton
                    target={{ kind: 'incoming-inspection', sheetId: sheet.id, label: [sheet.company, sheet.spec].filter(Boolean).join(' ') || '수입검사' }}
                    title={`수입검사 성적서 ${[sheet.company, sheet.spec].filter(Boolean).join(' ')}`.trim().slice(0, 80)}
                    body={[
                      sheet.inspectedOn && `검사일 ${koDate(sheet.inspectedOn)}`,
                      sheet.inspector && `검사자 ${sheet.inspector}`,
                      sheet.company && `업체 ${sheet.company}`,
                      sheet.spec && `규격 ${sheet.spec}`,
                      sheet.material && `재질 ${sheet.material}`,
                      (sheet.lotWeight || sheet.lotRoll) && `LOT 중량 ${sheet.lotWeight || '-'} ${sheet.lotWeightUnit === 'EA' ? 'EA' : 'Kg'} / ${sheet.lotRoll || '-'} R`,
                      sheet.judgment && `종합판정 ${sheet.judgment}`,
                    ].filter(Boolean).join('\n') || '수입검사 성적서'}
                    disabled={approval?.status === 'pending' || approval?.status === 'approved'}
                    hint={approval?.status === 'approved' ? '결재가 끝났습니다.' : '이미 결재 중입니다.'}
                    onSent={() => setApprovalTick((value) => value + 1)}
                    className="inline-flex h-7 items-center rounded-md border border-slate-300 bg-white px-2.5 text-[12px] font-semibold text-slate-800 shadow-sm hover:bg-slate-50 hover:text-slate-900 hover:no-underline"
                  />
              </div>
            )}
            </div>
          </div>

          <div className="mt-2 flex items-center gap-6 text-[13px]">
            <label className="flex items-center gap-1">
              검사일 :
              <input type="date" value={sheet.inspectedOn} onChange={(event) => patch({ inspectedOn: event.target.value })} className="bg-transparent outline-none print:hidden" />
              <span className="hidden print:inline">{koDate(sheet.inspectedOn)}</span>
            </label>
            <label className="flex items-center gap-1">
              검사자 :
              <input value={sheet.inspector} onChange={(event) => patch({ inspector: event.target.value })} className="w-28 bg-transparent outline-none" />
            </label>
          </div>

          <table className="mt-2 w-full border-collapse text-[13px]">
            <tbody>
              <tr>
                <th className="w-[22mm] border border-slate-800 bg-slate-50 py-1.5 font-semibold">업체명</th>
                <td className="border border-slate-800">
                  <CatalogField configName="companies" options={companyOptions} value={sheet.company} onChange={(company) => chooseLink('company', company)} disabled={locked} />
                </td>
                <th className="w-[24mm] border border-slate-800 bg-slate-50 font-semibold">LOT 중량</th>
                <td className="w-[42mm] border border-slate-800">
                  <div className="flex items-center justify-center gap-1">
                    <Field value={sheet.lotWeight} onChange={(lotWeight) => patch({ lotWeight })} className="w-16" />
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
                <th className="border border-slate-800 bg-slate-50 py-1.5 font-semibold">규 격</th>
                <td className="border border-slate-800"><CatalogField configName="products" options={specOptions} value={sheet.spec} onChange={(spec) => chooseLink('spec', spec)} disabled={locked} /></td>
                <th className="border border-slate-800 bg-slate-50 font-semibold">재 질</th>
                <td className="border border-slate-800"><CatalogField configName="materials" options={materialOptions} value={sheet.material} onChange={(material) => chooseLink('material', material)} disabled={locked} /></td>
              </tr>
            </tbody>
          </table>

          <table className="mt-2 h-full min-h-0 w-full flex-1 table-fixed border-collapse text-[12px]">
            <thead>
              <tr className="bg-slate-50">
                <th className="w-[18mm] border border-slate-800 py-1.5 font-semibold tracking-[0.12em]">검사항목</th>
                <th className="w-[18mm] border border-slate-800 py-1.5 font-semibold tracking-[0.2em]">검사방법</th>
                <th className="border border-slate-800 py-1.5 font-semibold tracking-[0.35em]">검사규격</th>
                <th className="w-[32mm] border border-slate-800 py-1.5 font-semibold">검사주기</th>
                <th className="w-[28mm] border border-slate-800 py-1.5 font-semibold">측정결과</th>
              </tr>
            </thead>
            <tbody>
              <tr className="h-[36%]">
                <th className="border border-slate-800 align-middle font-semibold tracking-[0.35em]">외관</th>
                <td className="border border-slate-800 text-center align-middle tracking-[0.35em]">육안</td>
                <td className="border border-slate-800 px-2 align-middle">
                  <textarea value={sheet.appearanceSpec} onChange={(event) => patch({ appearanceSpec: event.target.value })} rows={5} className="w-full resize-none bg-transparent text-center text-[13px] leading-relaxed outline-none" />
                </td>
                <td className="border border-slate-800 text-center align-middle">REEL마다/LOT</td>
                <td className="border border-slate-800 align-middle"><ResultMark value={sheet.appearanceResult} onChange={(appearanceResult) => patch({ appearanceResult })} disabled={locked} /></td>
              </tr>
              <tr className="h-[22%]">
                <th className="border border-slate-800 align-middle font-semibold tracking-[0.35em]">치수</th>
                <td className="border border-slate-800 text-center align-middle">V/C</td>
                <td className="relative border border-slate-800 p-0">
                  <table className="absolute inset-0 h-full w-full table-fixed border-collapse text-[13px]">
                    <tbody>
                      <tr className="h-1/2">
                        <td className="w-[34%] border-b border-r border-slate-800 px-1 text-center">①두께(mm)</td>
                        <td className="border-b border-slate-800"><Field value={sheet.thicknessSpec} onChange={(thicknessSpec) => patch({ thicknessSpec })} placeholder="0.15±0.01" /></td>
                      </tr>
                      <tr className="h-1/2">
                        <td className="border-r border-slate-800 px-1 text-center">②전폭(mm)</td>
                        <td><Field value={sheet.lengthSpec} onChange={(lengthSpec) => patch({ lengthSpec })} placeholder="61.0 -0.1" /></td>
                      </tr>
                    </tbody>
                  </table>
                </td>
                <td className="border border-slate-800 text-center align-middle">REEL마다/LOT</td>
                <td className="relative border border-slate-800 p-0">
                  <table className="absolute inset-0 h-full w-full border-collapse">
                    <tbody>
                      <tr className="h-1/2">
                        <td className="border-b border-slate-800 align-middle"><ResultMark value={sheet.thicknessResult} onChange={(thicknessResult) => patch({ thicknessResult })} disabled={locked} /></td>
                      </tr>
                      <tr className="h-1/2">
                        <td className="align-middle"><ResultMark value={sheet.widthResult} onChange={(widthResult) => patch({ widthResult })} disabled={locked} /></td>
                      </tr>
                    </tbody>
                  </table>
                </td>
              </tr>
              <tr className="h-7">
                <th colSpan={4} className="border border-slate-800 py-1 font-semibold">제품도면</th>
                <th className="border border-slate-800 py-1 font-semibold">종합판정</th>
              </tr>
              <tr className="h-[24%]">
                <td colSpan={4} className="border border-slate-800 p-0 align-middle">
                  <Drawing length={drawn?.length ?? ''} thickness={drawn?.thickness ?? ''} />
                </td>
                <td className="border border-slate-800 align-middle">
                  <div className="flex h-full flex-col items-center justify-center gap-2 px-1">
                    <select
                      value={sheet.judgment}
                      onChange={(event) => patch({ judgment: event.target.value as Judgment })}
                      className="no-print bg-transparent text-center text-[13px] outline-none"
                    >
                      <option value="">판정</option>
                      <option value="합격">합격</option>
                      <option value="불합격">불합격</option>
                    </select>
                    {sheet.judgment && <PassStamp judgment={sheet.judgment} date={stampDate(sheet.inspectedOn)} />}
                  </div>
                </td>
              </tr>
            </tbody>
          </table>

          <footer className="mt-2 flex shrink-0 items-center justify-between text-[11px] text-slate-600">
            <span>QEP 840-03(Rev.0)</span>
            <span>우리 하이 피 (주)</span>
            <span>A4(210*297)</span>
          </footer>
        </article>
        </div>
      )}
      </div>
      )}

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
      className="sheet-combo h-8 rounded-none border-0 bg-transparent px-1 text-[13px] font-normal text-slate-900 shadow-none hover:bg-transparent"
    />
  )
}

function Drawing({ length, thickness }: { length: string; thickness: string }) {
  const span = Number(length)
  const thick = Number(thickness)
  const rectH = Number.isFinite(span) && span > 0 ? Math.round(58 + (Math.min(span, 220) / 220) * 112) : 120
  const band = Number.isFinite(thick) && thick > 0 ? Math.round(8 + (Math.min(thick, 2) / 2) * 36) : 16
  const top = Math.round((210 - rectH) / 2)
  const bottom = top + rectH
  const rectX = 176
  const splitX = rectX + band
  return (
    <div className="flex h-full items-center justify-center px-3 py-1">
      <div className="relative h-[32mm] w-[118mm]">
        <svg viewBox="0 0 560 210" preserveAspectRatio="none" className="h-full w-full">
          <line x1="128" y1={top} x2={rectX} y2={top} stroke="#0f172a" strokeWidth="1.3" />
          <line x1="128" y1={bottom} x2={rectX} y2={bottom} stroke="#0f172a" strokeWidth="1.3" />
          <line x1="146" y1={top + 10} x2="146" y2={bottom - 10} stroke="#0f172a" strokeWidth="1.3" />
          <polygon points={`146,${top} 140,${top + 12} 152,${top + 12}`} fill="#0f172a" />
          <polygon points={`146,${bottom} 140,${bottom - 12} 152,${bottom - 12}`} fill="#0f172a" />
          <rect x={rectX} y={top} width="320" height={rectH} fill="#fff" stroke="#0f172a" strokeWidth="1.5" />
          <line x1={splitX} y1={top} x2={splitX} y2={bottom} stroke="#0f172a" strokeWidth="1.3" />
        </svg>
        {length && (
          <span className="absolute left-[2%] w-[18%] -translate-y-1/2 text-center text-[13px]" style={{ top: `${((top + bottom) / 2 / 210) * 100}%` }}>{length}</span>
        )}
        {thickness && (
          <span className="absolute -translate-y-1/2 text-[13px]" style={{ left: `${((splitX + 8) / 560) * 100}%`, top: `${((top + bottom) / 2 / 210) * 100}%` }}>t={thickness}</span>
        )}
      </div>
    </div>
  )
}

function PassStamp({ judgment, date }: { judgment: Judgment; date: string }) {
  const pass = judgment === '합격'
  return (
    <div className={cn('flex h-[28mm] w-[28mm] flex-col items-center justify-center rounded-full border-[3px] text-center leading-tight', pass ? 'border-blue-700 text-blue-700' : 'border-rose-600 text-rose-600')}>
      <span className="text-[15px] font-extrabold">{judgment}</span>
      <span className="text-[10px] font-semibold">{date}</span>
      <span className="text-[9px] font-semibold">우리하이피(주)</span>
      <span className="text-[9px] font-semibold">QC</span>
    </div>
  )
}
