'use client'

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Barcode, CheckCircle2, ChevronRight, ClipboardCheck, FileCheck, PackagePlus, Plus, RefreshCw, Search, type LucideIcon } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/components/auth/auth-context'
import { BarcodePrintButton } from '@/components/shared/barcode-print-button'
import { BAND_BUTTON_PRIMARY, PAGE_SHELL, PageHeader } from '@/components/shared/page-header'
import { ShipmentDocFlowNav, type ShipmentDocState } from '@/components/shipment/shipment-doc-flow-nav'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { SearchableCombobox } from '@/components/ui/searchable-combobox'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger } from '@/components/ui/select'
import { ConfirmDeleteDialog } from '@/components/shared/confirm-delete-dialog'
import { homeFloor } from '@/lib/access'
import { getAuthHeaders, getJsonAuthHeaders } from '@/lib/auth-client'
import { barcodeSvg } from '@/lib/barcode-label'
import { lineName, linesOf } from '@/lib/production-lines'
import { SHIPMENT_BUNDLE_QUERY, withShipmentBundle } from '@/lib/shipment-bundle'
import { cn } from '@/lib/utils'
import { confirmModal } from '@/components/shared/confirm-modal'

const SELECTED_INBOUND_KEY = 'inbound-register:selected'

type Doc = {
  id: string
  done?: boolean
  barcode?: string
  sourceIncomingId?: string
  sourceLotCardId?: string
  [key: string]: unknown
}

/** 입고등록(inventory) 한 건. 바코드가 없는 예전 입고도 올 수 있다. */
type Inbound = {
  id: string
  barcode?: string
  company: string
  product: string
  floor: number
  line?: number
  quantity: number
  quantityUnit: string
  issueDate: string
  lotStart?: string
  createdAt: string
  flow?: boolean
}

type StepState = 'none' | 'wip' | 'done'
type Row = { inbound: Inbound; sheets: Doc[]; cards: Doc[]; reports: Doc[] }

type Form = { issueDate: string; company: string; product: string; floor: string; line: string; lotStart: string; quantity: string; quantityUnit: string }

const FLOORS = ['all', '1', '2', '3'] as const
const today = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' })
const dot = (value: string) => value.replace(/-/g, '.')
const key = (value: unknown) => (typeof value === 'string' ? value.trim().toUpperCase() : '')

const UNITS = ['EA', 'Kg', 'R']
/** 1층은 Kg, 2·3층은 EA 가 기본 단위다. */
const defaultUnit = (floor: string) => (floor === '1' ? 'Kg' : 'EA')

function emptyForm(floor: string): Form {
  return { issueDate: today(), company: '', product: '', floor, line: '', lotStart: '', quantity: '', quantityUnit: defaultUnit(floor) }
}

function stateOf(docs: Doc[]): StepState {
  if (docs.length === 0) return 'none'
  return docs.every((doc) => doc.done) ? 'done' : 'wip'
}

async function loadList(path: string): Promise<Doc[]> {
  const response = await fetch(path, { cache: 'no-store', headers: getAuthHeaders() })
  const body = await response.json().catch(() => null)
  if (!response.ok || !Array.isArray(body?.data)) throw new Error(path)
  return body.data as Doc[]
}

async function loadOptions(name: 'companies' | 'products') {
  try {
    const response = await fetch(`/api/config?name=${name}`, { cache: 'no-store' })
    const body = await response.json().catch(() => null)
    return Array.isArray(body?.data) ? (body.data as unknown[]).filter((item): item is string => typeof item === 'string') : []
  } catch {
    return []
  }
}

/** 업체별 품명 목록. 도금정보·등록 문서·입고 기록에서 업체와 품명 쌍을 모은 것이다. */
async function loadProductsByCompany(): Promise<Record<string, string[]>> {
  try {
    const response = await fetch('/api/quality/kpi?catalog=1', { cache: 'no-store' })
    const body = await response.json().catch(() => null)
    const map = body?.catalog?.productsByCompany
    return map && typeof map === 'object' && !Array.isArray(map) ? (map as Record<string, string[]>) : {}
  } catch {
    return {}
  }
}

const normName = (value: string) => value.trim().replace(/\s+/g, ' ')

function productsOf(map: Record<string, string[]>, company: string): string[] {
  const name = normName(company)
  if (!name) return []
  const found = Object.keys(map).find((item) => normName(item) === name)
  return found ? map[found] : []
}

/** 바코드 하나에 묶인 수입검사·이력카드·출하성적서를 찾는다. 출하성적서는 이력카드를 거쳐서도 연결된다. */
function buildRows(inbounds: Inbound[], sheets: Doc[], cards: Doc[], reports: Doc[]): Row[] {
  return inbounds.map((inbound) => {
    const code = key(inbound.barcode)
    const mySheets = code ? sheets.filter((doc) => key(doc.barcode) === code) : []
    const myCards = code ? cards.filter((doc) => key(doc.barcode) === code || mySheets.some((sheet) => sheet.id === doc.sourceIncomingId)) : []
    const cardIds = new Set(myCards.map((doc) => doc.id))
    const myReports = code ? reports.filter((doc) => key(doc.barcode) === code || cardIds.has(String(doc.sourceLotCardId ?? ''))) : []
    return { inbound, sheets: mySheets, cards: myCards, reports: myReports }
  })
}

function Field({ label, required, children }: { label: string; required?: boolean; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <span className="block text-xs font-semibold text-muted-foreground">{label}
        {required && <span className="ml-0.5 text-destructive">*</span>}
      </span>
      {children}
    </div>
  )
}

function StepPill({ label, icon: Icon, docs, href }: { label: string; icon: LucideIcon; docs: Doc[]; href: string }) {
  const state = stateOf(docs)
  const body = (
    <span
      className={cn(
        'flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors',
        state === 'done' && 'border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300',
        state === 'wip' && 'border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300',
        state === 'none' && 'border-dashed border-border text-muted-foreground/60',
      )}
    >
      {state === 'done' ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Icon className="h-3.5 w-3.5" />}
      {label}
      {docs.length > 1 && <span className="tabular-nums">{docs.length}</span>}
      <span className="font-normal opacity-80">{state === 'done' ? '완료' : state === 'wip' ? '작성중' : '대기'}</span>
    </span>
  )
  return docs[0] ? <Link href={`${href}?open=${encodeURIComponent(docs[0].id)}`}>{body}</Link> : body
}

/**
 * embedded: 재고 관리 '진행현황' 탭 안에 넣을 때. 페이지 머리말 없이 목록만 보인다.
 * openFormSignal: 값이 올라갈 때마다 입고 등록 창을 연다 (재고 관리 위쪽 '입고 등록' 버튼).
 * onChanged: 입고를 등록·수정·삭제한 뒤 부르는 콜백 (재고 관리 쪽 수치를 다시 불러온다).
 */
export function InboundRegisterView({ embedded = false, openFormSignal = 0, onChanged }: { embedded?: boolean; openFormSignal?: number; onChanged?: () => void } = {}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user, loading: authLoading } = useAuth()
  const canWrite = user?.role === 'editor' || user?.role === 'admin'
  const lockedFloor = homeFloor(user)
  const defaultFloor = lockedFloor != null ? String(lockedFloor) : ['1', '2', '3'].includes(searchParams.get('floor') ?? '') ? (searchParams.get('floor') as string) : '1'

  const [rows, setRows] = useState<Row[]>([])
  const [ready, setReady] = useState(false)
  const [error, setError] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [tab, setTab] = useState<'active' | 'done'>('active')
  const [floor, setFloor] = useState<(typeof FLOORS)[number]>(lockedFloor != null ? (String(lockedFloor) as '1' | '2' | '3') : 'all')
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState('')

  // 수입검사·이력카드·출하성적서를 오갔다가 돌아와도 고른 입고가 그대로 선택되어 있도록 세션에 남긴다.
  useEffect(() => {
    const saved = sessionStorage.getItem(SELECTED_INBOUND_KEY)
    if (saved) setSelectedId(saved)
  }, [])
  useEffect(() => {
    if (selectedId) sessionStorage.setItem(SELECTED_INBOUND_KEY, selectedId)
  }, [selectedId])

  const [formOpen, setFormOpen] = useState(false)
  const [form, setForm] = useState<Form>(() => emptyForm('1'))
  const [saving, setSaving] = useState(false)
  const [created, setCreated] = useState<Inbound | null>(null)
  // 목록의 검정 바코드를 눌러 연 바코드 창의 입고 id
  const [barcodeViewId, setBarcodeViewId] = useState('')
  // 수정 중인 입고 id (비어 있으면 새 입고 등록)
  const [editingId, setEditingId] = useState('')
  // 삭제를 기다리는 입고 한 건과 연결된 서류
  const [pendingDelete, setPendingDelete] = useState<Row | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [companies, setCompanies] = useState<string[]>([])
  const [products, setProducts] = useState<string[]>([])
  const [productsByCompany, setProductsByCompany] = useState<Record<string, string[]>>({})
  const [issuing, setIssuing] = useState('')
  const openedQuery = useRef(false)

  const load = useCallback(async (manual = false) => {
    if (manual) setRefreshing(true)
    try {
      const [inventory, sheets, cards, reports] = await Promise.all([
        loadList('/api/inventory') as unknown as Promise<Inbound[]>,
        loadList('/api/incoming-inspections'),
        loadList('/api/lot-cards'),
        loadList('/api/outgoing-reports'),
      ])
      setRows(buildRows(inventory, sheets, cards, reports))
      setError(false)
    } catch {
      setError(true)
    } finally {
      setReady(true)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  function openForm() {
    setForm(emptyForm(defaultFloor))
    setEditingId('')
    setCreated(null)
    setFormOpen(true)
    if (companies.length === 0) void loadOptions('companies').then(setCompanies)
    if (products.length === 0) void loadOptions('products').then(setProducts)
    void loadProductsByCompany().then(setProductsByCompany)
  }

  // 업체를 고르면 그 업체의 품명만 보인다. 그 업체 품명이 아직 없으면 전체 품명을 보여 준다.
  const companyProducts = useMemo(() => productsOf(productsByCompany, form.company), [productsByCompany, form.company])
  const productOptions = companyProducts.length > 0 ? companyProducts : products

  function changeCompany(company: string) {
    const list = productsOf(productsByCompany, company)
    setForm((current) => ({
      ...current,
      company,
      product: list.length > 0 && current.product && !list.includes(current.product) ? '' : current.product,
    }))
  }

  // 흐름 화면의 '새 입고 추가'로 들어오면 등록 창을 바로 연다.
  useEffect(() => {
    if (openedQuery.current || authLoading || !user) return
    openedQuery.current = true
    if (searchParams.get('new') === '1' && canWrite) openForm()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, user, canWrite, searchParams])
  useEffect(() => {
    if (openFormSignal > 0 && !authLoading && canWrite) openForm()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openFormSignal, authLoading, canWrite])

  function openEdit(inbound: Inbound) {
    setForm({
      issueDate: inbound.issueDate,
      company: inbound.company,
      product: inbound.product,
      floor: String(inbound.floor),
      line: inbound.line ? String(inbound.line) : '',
      lotStart: inbound.lotStart ?? '',
      quantity: String(inbound.quantity),
      quantityUnit: inbound.quantityUnit,
    })
    setEditingId(inbound.id)
    setCreated(null)
    setFormOpen(true)
  }

  async function saveEdit() {
    setSaving(true)
    try {
      const response = await fetch('/api/inventory', {
        method: 'PATCH',
        headers: getJsonAuthHeaders(user),
        body: JSON.stringify({
          id: editingId,
          issueDate: form.issueDate,
          company: form.company,
          product: form.product,
          floor: Number(form.floor),
          line: Number(form.line),
          quantity: Number(form.quantity),
          quantityUnit: form.quantityUnit,
          lotStart: form.lotStart,
        }),
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(result.error || '입고 수정에 실패했습니다.')
      const updated = result.data as Inbound
      setRows((current) => current.map((row) => (row.inbound.id === updated.id ? { ...row, inbound: { ...row.inbound, ...updated } } : row)))
      setFormOpen(false)
      setEditingId('')
      toast.success('입고 내용을 고쳤습니다.')
      onChanged?.()
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : '입고 수정에 실패했습니다.')
    } finally {
      setSaving(false)
    }
  }

  /** 확인 창을 띄운다. 완료된 서류가 있으면 창에 따로 알린다. */
  function requestDelete(row: Row) {
    setPendingDelete(row)
  }

  /** 입고와 연결된 수입검사·이력카드·출하성적서를 모두 지운 뒤 입고를 지운다. */
  async function removeInbound() {
    if (!pendingDelete) return
    const target = pendingDelete
    setDeleting(true)
    try {
      const plan: [string, Doc[]][] = [
        ['/api/outgoing-reports', target.reports],
        ['/api/lot-cards', target.cards],
        ['/api/incoming-inspections', target.sheets],
        ['/api/inventory', [{ id: target.inbound.id }]],
      ]
      for (const [path, docs] of plan) {
        for (const doc of docs) {
          const response = await fetch(path, { method: 'DELETE', headers: getJsonAuthHeaders(user), body: JSON.stringify({ id: doc.id }) })
          if (!response.ok) {
            const result = await response.json().catch(() => ({}))
            throw new Error(result.error || '삭제하지 못했습니다.')
          }
        }
      }
      setRows((current) => current.filter((row) => row.inbound.id !== target.inbound.id))
      setPendingDelete(null)
      toast.success('입고와 연결된 서류를 삭제했습니다.')
      onChanged?.()
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : '삭제하지 못했습니다.')
    } finally {
      setDeleting(false)
    }
  }

  async function save(event: FormEvent) {
    event.preventDefault()
    if (!form.company.trim() || !form.product.trim()) {
      toast.error('업체명과 품명을 입력해 주세요.')
      return
    }
    if (!(Number(form.quantity) > 0)) {
      toast.error('수량을 입력해 주세요.')
      return
    }
    if (editingId) {
      await saveEdit()
      return
    }
    setSaving(true)
    try {
      const response = await fetch('/api/inventory', {
        method: 'POST',
        headers: getJsonAuthHeaders(user),
        body: JSON.stringify({
          issueDate: form.issueDate,
          company: form.company,
          product: form.product,
          floor: Number(form.floor),
          line: Number(form.line),
          quantity: Number(form.quantity),
          quantityUnit: form.quantityUnit,
          lotStart: form.lotStart,
          flow: true,
        }),
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(result.error || '입고 등록에 실패했습니다.')
      const record = result.data as Inbound
      setRows((current) => [{ inbound: record, sheets: [], cards: [], reports: [] }, ...current])
      setCreated(record)
      toast.success(record.barcode ? `입고를 등록하고 바코드 ${record.barcode}를 발급했습니다.` : '입고를 등록했습니다.')
      onChanged?.()
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : '입고 등록에 실패했습니다.')
    } finally {
      setSaving(false)
    }
  }

  /** 바코드가 없는 예전 입고에 바코드를 발급한다. */
  /** 입고는 두고 바코드만 뺀다. 바코드로 쓴 서류가 있으면 막는다. 바코드가 빠지면 진행현황 목록에서도 빠진다. */
  async function removeBarcode(row: Row): Promise<boolean> {
    const { inbound } = row
    if (row.sheets.length + row.cards.length + row.reports.length > 0) {
      toast.error('이 바코드로 작성한 서류가 있어 제거할 수 없습니다. 서류를 먼저 지우세요.')
      return false
    }
    if (!(await confirmModal({ title: `바코드 ${inbound.barcode}를 제거할까요?`, description: '입고 기록은 그대로 남고, 진행현황 목록에서는 빠집니다.', confirmLabel: '제거', destructive: true }))) return false
    setIssuing(inbound.id)
    try {
      const response = await fetch('/api/trace-barcodes', {
        method: 'DELETE',
        headers: getJsonAuthHeaders(user),
        body: JSON.stringify({ inventoryId: inbound.id }),
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(result.error || '바코드를 제거하지 못했습니다.')
      setRows((current) => current.map((item) => (item.inbound.id === inbound.id ? { ...item, inbound: { ...item.inbound, barcode: '', flow: false } } : item)))
      if (selectedId === inbound.id) setSelectedId('')
      toast.success(`바코드 ${inbound.barcode}를 제거했습니다.`)
      onChanged?.()
      return true
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : '바코드를 제거하지 못했습니다.')
      return false
    } finally {
      setIssuing('')
    }
  }

  async function issue(inbound: Inbound) {
    setIssuing(inbound.id)
    try {
      const response = await fetch('/api/trace-barcodes', {
        method: 'POST',
        headers: getJsonAuthHeaders(user),
        body: JSON.stringify({ inventoryId: inbound.id }),
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok || !result.data?.barcode) throw new Error(result.error || '바코드를 발급하지 못했습니다.')
      const barcode = result.data.barcode as string
      setRows((current) => current.map((row) => (row.inbound.id === inbound.id ? { ...row, inbound: { ...row.inbound, barcode } } : row)))
      toast.success(`바코드 ${barcode}를 발급했습니다.`)
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : '바코드를 발급하지 못했습니다.')
    } finally {
      setIssuing('')
    }
  }

  /** 이 입고의 바코드로 수입검사 성적서를 연다. 쓰던 성적서가 있으면 그것을, 없으면 입고 정보가 채워진 새 성적서를 만든다. */
  function startIncoming(inbound: Inbound, sheet?: Doc) {
    if (!inbound.barcode) return
    router.push(
      sheet
        ? withShipmentBundle(sheet.id, '/shipment/incoming-inspection')
        : `/shipment/incoming-inspection?barcode=${encodeURIComponent(inbound.barcode)}&floor=${inbound.floor}&${SHIPMENT_BUNDLE_QUERY}=1`,
    )
  }

  // 목록에서 고른 건의 수입검사·이력카드·출하성적서 id. 위 흐름 바에서 단계를 바로 이동할 때 쓴다.
  const flowIds = useMemo(() => {
    const picked = rows.find((row) => row.inbound.id === selectedId)
    if (!picked) return undefined
    return { incoming: picked.sheets[0]?.id, 'lot-card': picked.cards[0]?.id, outgoing: picked.reports[0]?.id }
  }, [rows, selectedId])

  const pickedRow = rows.find((row) => row.inbound.id === selectedId)
  const flowStates = useMemo<Partial<Record<'incoming' | 'lot-card' | 'outgoing', ShipmentDocState>> | undefined>(
    () => (pickedRow ? { incoming: stateOf(pickedRow.sheets), 'lot-card': stateOf(pickedRow.cards), outgoing: stateOf(pickedRow.reports) } : undefined),
    [pickedRow],
  )

  const flowRows = useMemo(
    () => rows.filter((row) => !!row.inbound.barcode && (row.inbound.flow || row.sheets.length + row.cards.length + row.reports.length > 0)),
    [rows],
  )
  const finished = (row: Row) => row.reports.length > 0 && stateOf(row.reports) === 'done'
  const scoped = flowRows.filter((row) => floor === 'all' || String(row.inbound.floor) === floor)
  const pool = scoped.filter((row) => finished(row) === (tab === 'done'))
  const needle = query.trim().toUpperCase()
  const shown = pool
    .filter((row) => !needle || [row.inbound.barcode ?? '', row.inbound.company, row.inbound.product, row.inbound.lotStart ?? ''].some((text) => text.toUpperCase().includes(needle)))
    .sort((a, b) => (b.inbound.createdAt || '').localeCompare(a.inbound.createdAt || ''))
  const activeCount = scoped.filter((row) => !finished(row)).length
  const doneCount = scoped.filter(finished).length
  const waitingSheet = scoped.filter((row) => row.inbound.barcode && row.sheets.length === 0 && !finished(row)).length

  const barcodeRow = rows.find((row) => row.inbound.id === barcodeViewId && row.inbound.barcode)

  /** 등록 완료 창과 바코드 창이 같이 쓰는 라벨 미리보기 */
  function labelPreview(inbound: Inbound) {
    const svg = inbound.barcode ? barcodeSvg(inbound.barcode) : null
    return (
      <div className="rounded-xl border bg-white p-4 text-center text-black">
        <p className="truncate text-xs font-bold">{[inbound.company, inbound.product].filter(Boolean).join(' · ')}</p>
        {svg && <div className="mx-auto my-2 h-16 w-full max-w-[18rem] [&_svg]:h-full [&_svg]:w-full" dangerouslySetInnerHTML={{ __html: svg }} />}
        <p className="font-mono text-base font-bold tracking-[0.12em]">{inbound.barcode}</p>
        <dl className="mt-3 grid grid-cols-4 divide-x divide-slate-200 overflow-hidden rounded-lg border border-slate-200 text-left">
          {[
            ['입고일', dot(inbound.issueDate) || '-'],
            ['수량', `${inbound.quantity.toLocaleString('ko-KR', { maximumFractionDigits: 2 })} ${inbound.quantityUnit}`],
            ['LOT', inbound.lotStart || '-'],
            ['층', `${inbound.floor}층`],
          ].map(([label, value]) => (
            <div key={label} className="min-w-0 px-2 py-1.5">
              <dt className="text-[10px] font-semibold text-slate-500">{label}</dt>
              <dd className="truncate text-[12px] font-bold text-slate-900" title={value}>{value}</dd>
            </div>
          ))}
        </dl>
      </div>
    )
  }

  return (
    <div className={embedded ? 'flex flex-col gap-5' : PAGE_SHELL}>
      <div className="no-print contents">
        {embedded ? null : <PageHeader
          tone="teal"
          icon={PackagePlus}
          eyebrow="재고 관리"
          title="입고 등록"
          description="입고를 등록하면 바코드가 만들어지고, 수입검사 성적서 → 이력카드 → 출하성적서로 이어집니다."
          actions={canWrite ? (
            <Button className={BAND_BUTTON_PRIMARY} onClick={openForm}>
              <Plus className="h-4 w-4" /> 입고 등록
            </Button>
          ) : undefined}
        />}
        <ShipmentDocFlowNav
          step="inbound"
          ids={flowIds}
          states={flowStates}
          canWrite={canWrite && !!pickedRow?.inbound.barcode}
          onNext={pickedRow ? () => startIncoming(pickedRow.inbound, pickedRow.sheets[0]) : undefined}
        />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {[
          ['수입검사 대기', waitingSheet, 'text-amber-700'],
          ['진행 중', activeCount, 'text-slate-800'],
          ['출하 완료', doneCount, 'text-emerald-700'],
        ].map(([label, value, tone]) => (
          <div key={String(label)} className="rounded-xl border border-border bg-card px-4 py-3 shadow-sm">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className={cn('mt-1 text-2xl font-bold tabular-nums', String(tone))}>{value}</p>
          </div>
        ))}
      </div>

      <section className="rounded-2xl border border-white/70 bg-card/95 shadow-sm backdrop-blur">
        <div className="flex flex-wrap items-center gap-3 px-4 py-3">
          <div className="flex items-center gap-1 rounded-xl bg-slate-100 p-1 dark:bg-white/5" role="tablist" aria-label="층 선택">
            {FLOORS.filter((item) => lockedFloor == null || item === 'all' || item === String(lockedFloor)).map((item) => (
              <button
                key={item}
                type="button"
                role="tab"
                aria-selected={floor === item}
                onClick={() => setFloor(item)}
                className={cn(
                  'flex h-9 items-center rounded-lg px-4 text-sm font-semibold transition-all',
                  floor === item ? 'bg-white text-slate-700 shadow-sm ring-1 ring-slate-200 dark:bg-white/10 dark:text-slate-300 dark:ring-0' : 'text-slate-500 hover:text-slate-900 dark:hover:text-white',
                )}
              >
                {item === 'all' ? '전체' : `${item}층`}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1 rounded-xl bg-slate-100 p-1 dark:bg-white/5" role="tablist" aria-label="진행 상태">
            {([['active', '진행 중', activeCount], ['done', '완료', doneCount]] as const).map(([id, label, count]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={tab === id}
                onClick={() => setTab(id)}
                className={cn(
                  'flex h-9 items-center gap-1.5 rounded-lg px-4 text-sm font-semibold transition-all',
                  tab === id ? (id === 'active' ? 'bg-amber-500 text-white shadow-sm' : 'bg-emerald-600 text-white shadow-sm') : 'text-slate-500 hover:text-slate-900 dark:hover:text-white',
                )}
              >
                {label}
                <span className={cn('min-w-5 rounded-full px-1.5 text-[11px] tabular-nums', tab === id ? 'bg-white/25 text-white' : 'bg-white/70 text-slate-400 dark:bg-white/5')}>{count}</span>
              </button>
            ))}
          </div>

          <div className="relative min-w-40 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="바코드 · 업체 · 품명 · LOT 검색" className="h-9 rounded-lg bg-white pl-9 dark:bg-background" />
          </div>

          <Button type="button" variant="outline" size="sm" className="h-9" onClick={() => void load(true)} disabled={refreshing}>
            <RefreshCw className={cn('h-4 w-4', refreshing && 'animate-spin')} />
            새로고침
          </Button>
        </div>
      </section>

      {!ready ? (
        <p className="py-16 text-center text-sm text-muted-foreground">불러오는 중…</p>
      ) : error ? (
        <p className="py-16 text-center text-sm text-destructive">입고 목록을 불러오지 못했습니다.</p>
      ) : shown.length === 0 ? (
        <div className="flex flex-col items-center rounded-2xl border border-dashed border-slate-300 bg-white/60 px-6 py-14 text-center dark:border-white/10 dark:bg-white/[0.02]">
          <span className="flex size-14 items-center justify-center rounded-full bg-slate-100 text-slate-600 dark:bg-slate-400/10">
            <PackagePlus className="size-6" />
          </span>
          <p className="mt-3 text-base font-semibold text-slate-800 dark:text-white">{tab === 'active' ? '진행 중인 입고가 없습니다' : '조건에 맞는 완료 건이 없습니다'}</p>
          <p className="mt-1 text-sm text-muted-foreground">입고를 등록하면 바코드가 발급되고 수입검사 성적서로 이어집니다.</p>
          {canWrite && tab === 'active' && (
            <Button className="mt-4" onClick={openForm}><Plus className="h-4 w-4" />입고 등록</Button>
          )}
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {shown.map((row) => {
            const { inbound } = row
            const meta = [
              ['입고', inbound.issueDate ? dot(inbound.issueDate) : ''],
              ['수량', `${inbound.quantity.toLocaleString('ko-KR', { maximumFractionDigits: 2 })} ${inbound.quantityUnit}`],
              ['LOT', inbound.lotStart ?? ''],
              ['층', `${inbound.floor}층`],
            ].filter(([, value]) => value)
            return (
              <li
                key={inbound.id}
                onClick={() => setSelectedId(inbound.id)}
                className={cn(
                  'flex cursor-pointer flex-col gap-3 rounded-xl border bg-card px-4 py-3 shadow-sm transition-colors lg:flex-row lg:items-center lg:gap-4',
                  selectedId === inbound.id
                    ? 'border-emerald-400 bg-emerald-50 ring-2 ring-emerald-300/60 dark:border-emerald-700 dark:bg-emerald-950/30 dark:ring-emerald-800/50'
                    : 'border-border hover:bg-accent/40',
                )}
              >
                <div className="min-w-0 lg:w-[30%]">
                  <p className="truncate text-sm font-bold text-foreground">{inbound.company}</p>
                  <p className="truncate text-xs text-muted-foreground">{inbound.product}</p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {meta.map(([label, value]) => (
                      <span key={label} className="inline-flex max-w-full items-center gap-1 rounded border border-border bg-muted/40 px-1.5 py-0.5 text-[11px] leading-4">
                        <span className="text-muted-foreground">{label}</span>
                        <span className="truncate font-semibold text-foreground">{value}</span>
                      </span>
                    ))}
                  </div>
                </div>
                <div className="lg:w-44">
                  {inbound.barcode ? (
                    <button
                      type="button"
                      title="바코드 보기 · 수정 · 제거"
                      onClick={(event) => { event.stopPropagation(); setSelectedId(inbound.id); setBarcodeViewId(inbound.id) }}
                      className="inline-flex items-center gap-1.5 rounded-md bg-slate-900 px-2.5 py-1 font-mono text-[13px] font-bold tracking-[0.08em] text-white transition-colors hover:bg-slate-700 dark:bg-white dark:text-slate-900"
                    >
                      <Barcode className="h-3.5 w-3.5" />{inbound.barcode}
                    </button>
                  ) : (
                    <span className="text-xs text-muted-foreground">바코드 없음</span>
                  )}
                </div>
                <div className="flex flex-1 flex-wrap items-center gap-1">
                  <StepPill label="수입검사" icon={ClipboardCheck} docs={row.sheets} href="/shipment/incoming-inspection" />
                  <ChevronRight className="h-4 w-4 text-muted-foreground/50" />
                  <StepPill label="이력카드" icon={Barcode} docs={row.cards} href="/shipment/lot-card" />
                  <ChevronRight className="h-4 w-4 text-muted-foreground/50" />
                  <StepPill label="출하성적서" icon={FileCheck} docs={row.reports} href="/shipment/outgoing-report" />
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-1.5 lg:justify-end">
                  {canWrite && (
                    <>
                      <Button type="button" variant="outline" size="sm" className="h-8 px-2.5 text-[13px]" onClick={(event) => { event.stopPropagation(); openEdit(inbound) }}>
                        수정
                      </Button>
                      <Button type="button" variant="outline" size="sm" className="h-8 px-2.5 text-[13px] text-destructive hover:text-destructive" onClick={(event) => { event.stopPropagation(); requestDelete(row) }}>
                        삭제
                      </Button>
                    </>
                  )}
                  {inbound.barcode ? (
                    <BarcodePrintButton
                      className="h-8 px-2.5 text-[13px]"
                      label={{ barcode: inbound.barcode, partner: inbound.company, product: inbound.product, lotNo: inbound.lotStart, date: inbound.issueDate }}
                    />
                  ) : canWrite ? (
                    <Button type="button" variant="outline" size="sm" className="h-8 px-2.5 text-[13px]" disabled={issuing === inbound.id} onClick={() => void issue(inbound)}>
                      <Barcode className="h-3.5 w-3.5" />{issuing === inbound.id ? '발급 중…' : '바코드 발급'}
                    </Button>
                  ) : null}
                </div>
              </li>
            )
          })}
        </ul>
      )}

      <Dialog open={!!barcodeRow} onOpenChange={(next) => { if (!next) setBarcodeViewId('') }}>
        <DialogContent className="sm:max-w-[460px]">
          {barcodeRow ? (
            <>
              <DialogHeader>
                <DialogTitle>바코드</DialogTitle>
                <DialogDescription>라벨을 다시 출력하거나, 입고 내용을 고치거나, 바코드를 제거합니다.</DialogDescription>
              </DialogHeader>
              <div className="space-y-3">{labelPreview(barcodeRow.inbound)}</div>
              <DialogFooter className="gap-2 sm:flex-wrap">
                <BarcodePrintButton
                  label={{ barcode: barcodeRow.inbound.barcode ?? '', partner: barcodeRow.inbound.company, product: barcodeRow.inbound.product, lotNo: barcodeRow.inbound.lotStart, date: barcodeRow.inbound.issueDate }}
                  className="h-8 text-sm"
                />
                {canWrite && (
                  <>
                    <Button type="button" variant="outline" onClick={() => { const target = barcodeRow.inbound; setBarcodeViewId(''); openEdit(target) }}>
                      바코드 수정
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="text-destructive hover:text-destructive"
                      disabled={issuing === barcodeRow.inbound.id}
                      onClick={() => { const target = barcodeRow; void removeBarcode(target).then((done) => { if (done) setBarcodeViewId('') }) }}
                    >
                      {issuing === barcodeRow.inbound.id ? '제거 중…' : '바코드 제거'}
                    </Button>
                  </>
                )}
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={formOpen} onOpenChange={(next) => { if (!saving) setFormOpen(next) }}>
        <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-[460px]">
          {created ? (
            <>
              <DialogHeader>
                <DialogTitle>입고 등록 완료</DialogTitle>
                <DialogDescription>바코드가 발급되었습니다. 라벨을 출력해 제품에 붙이고, 이어서 수입검사 성적서를 작성하세요.</DialogDescription>
              </DialogHeader>
              <div className="space-y-3">{labelPreview(created)}</div>
              <DialogFooter className="gap-2 sm:flex-wrap">
                {created.barcode && (
                  <BarcodePrintButton
                    label={{ barcode: created.barcode, partner: created.company, product: created.product, lotNo: created.lotStart, date: created.issueDate }}
                    className="h-8 text-sm"
                  />
                )}
                <Button type="button" onClick={() => { setFormOpen(false); startIncoming(created) }}>
                  수입검사 성적서 작성
                </Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>{editingId ? '입고 수정' : '입고 등록'}</DialogTitle>
                <DialogDescription>{editingId ? '입고 내용을 고칩니다. 바코드는 바뀌지 않습니다.' : '거래명세표 기준으로 입고 한 건을 등록하면 바코드가 바로 만들어집니다.'}</DialogDescription>
              </DialogHeader>
              <form onSubmit={save} className="space-y-3 py-2">
                <Field label="입고일자">
                  <Input type="date" value={form.issueDate} onChange={(event) => setForm({ ...form, issueDate: event.target.value })} required />
                </Field>
                <Field label="업체명" required>
                  <SearchableCombobox
                    configName="companies"
                    options={companies}
                    listAll
                    value={form.company}
                    onChange={changeCompany}
                    placeholder="업체 검색 또는 입력..."
                    className="h-10"
                  />
                </Field>
                <Field label="품명 (규격)" required>
                  <SearchableCombobox
                    configName="products"
                    options={productOptions}
                    listAll={companyProducts.length > 0}
                    recentOptions={products.slice(0, 8)}
                    value={form.product}
                    onChange={(value) => setForm({ ...form, product: value })}
                    onOptionsChange={setProducts}
                    placeholder={companyProducts.length > 0 ? `${normName(form.company)} 품명 검색...` : '품명 검색 또는 입력...'}
                    listCaption={companyProducts.length > 0 ? `${normName(form.company)} 품명 ${companyProducts.length}개` : undefined}
                    className="h-10"
                  />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="층">
                    <Select
                      value={form.floor}
                      onValueChange={(value) => {
                        const floor = String(value ?? form.floor)
                        if (floor === form.floor) return
                        setForm({ ...form, floor, line: '', ...(editingId ? {} : { quantityUnit: defaultUnit(floor) }) })
                      }}
                      disabled={lockedFloor != null}
                    >
                      <SelectTrigger aria-label="층" className="h-10 w-full bg-background px-3 disabled:opacity-70">
                        <span>{form.floor}층</span>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          {['1', '2', '3'].map((item) => (
                            <SelectItem key={item} value={item} className="py-2">
                              <span className="font-medium">{item}층</span>
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="라인 (선택)">
                    <Select value={form.line || 'none'} onValueChange={(value) => setForm({ ...form, line: !value || value === 'none' ? '' : String(value) })}>
                      <SelectTrigger aria-label="라인" className="h-10 w-full bg-background px-3">
                        <span className={cn(!form.line && 'text-muted-foreground')}>
                          {form.line ? lineName(Number(form.floor), Number(form.line)) : '라인 선택'}
                        </span>
                      </SelectTrigger>
                      <SelectContent className="max-h-72">
                        <SelectGroup>
                          <SelectItem value="none" className="py-2 text-muted-foreground">선택 안 함</SelectItem>
                          {linesOf(Number(form.floor)).map((item) => (
                            <SelectItem key={item.no} value={String(item.no)} className="py-2">
                              <span className="font-medium">{lineName(Number(form.floor), item.no)}</span>
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </Field>
                </div>
                <Field label="로트번호 (선택)">
                  <Input value={form.lotStart} onChange={(event) => setForm({ ...form, lotStart: event.target.value })} placeholder="(선택)" className="h-10 px-3 text-sm" />
                </Field>
                <Field label="수량" required>
                  <div className="flex gap-2">
                    <Input type="number" min="0" step="any" value={form.quantity} onChange={(event) => setForm({ ...form, quantity: event.target.value })} required />
                    <Select value={form.quantityUnit} onValueChange={(value) => setForm({ ...form, quantityUnit: String(value ?? form.quantityUnit) })}>
                      <SelectTrigger aria-label="단위" className="h-10 w-24 shrink-0 bg-background px-3">
                        <span>{form.quantityUnit}</span>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          {UNITS.map((unit) => (
                            <SelectItem key={unit} value={unit} className="py-2">
                              <span className="font-medium">{unit}</span>
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </div>
                </Field>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setFormOpen(false)} disabled={saving}>취소</Button>
                  <Button type="submit" disabled={saving}>{editingId ? (saving ? '저장 중…' : '저장') : (saving ? '등록 중…' : '등록하고 바코드 발급')}</Button>
                </DialogFooter>
              </form>
            </>
          )}
        </DialogContent>
      </Dialog>
      <ConfirmDeleteDialog
        open={pendingDelete != null}
        onOpenChange={(open) => { if (!open && !deleting) setPendingDelete(null) }}
        title="입고 삭제"
        onConfirm={() => void removeInbound()}
        pending={deleting}
      >
        {pendingDelete ? (
          <>
            <span className="block">{pendingDelete.inbound.company} · {pendingDelete.inbound.product} 입고를 지웁니다.</span>
            <span className="mt-2 block">함께 지워지는 서류: 수입검사 {pendingDelete.sheets.length}건 · 이력카드 {pendingDelete.cards.length}건 · 출하성적서 {pendingDelete.reports.length}건</span>
            {(() => {
              const done = [
                ['수입검사', pendingDelete.sheets],
                ['이력카드', pendingDelete.cards],
                ['출하성적서', pendingDelete.reports],
              ].map(([name, docs]) => [name, (docs as Doc[]).filter((doc) => doc.done).length] as const).filter(([, count]) => count > 0)
              return done.length > 0 ? (
                <span className="mt-2 block font-semibold text-rose-600">
                  완료된 서류가 있습니다 ({done.map(([name, count]) => `${name} ${count}건`).join(' · ')}). 정말 삭제할까요?
                </span>
              ) : null
            })()}
          </>
        ) : null}
      </ConfirmDeleteDialog>
    </div>
  )
}
