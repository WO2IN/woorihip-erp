'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Area, Bar, CartesianGrid, Cell, ComposedChart, LabelList, Line, ReferenceLine, Tooltip, XAxis, YAxis } from 'recharts'
import {
  ArrowLeftRight,
  ChevronDown,
  Download,
  PackageCheck,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Trash2,
  TriangleAlert,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import { canOperateFloor, homeFloor } from '@/lib/access'
import { buildShipmentWorkbook } from '@/lib/shipment-excel'
import { Floor3WorkLogPanel } from '@/components/shipment/floor3-work-log-panel'
import { LotDetailPanel } from '@/components/shipment/lot-detail-panel'
import { ProcessCheckRecord, ProcessTemplate } from '@/lib/process-checklist'
import { Button } from '@/components/ui/button'
import { BAND_BUTTON, BAND_BUTTON_PRIMARY, PageHeader } from '@/components/shared/page-header'
import { ChartContainer, type ChartConfig } from '@/components/ui/chart'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { SearchableCombobox } from '@/components/ui/searchable-combobox'
import { FilterChip, FilterSelect } from '@/components/shared/list-filters'
import { Skeleton } from '@/components/ui/skeleton'
import { useAuth } from '@/components/auth/auth-context'
import { buildAuthHeaders, getSession } from '@/lib/auth-client'
import { useDataChanged } from '@/lib/data-events'
import { PdfViewerModal } from '@/components/explorer/pdf-viewer-modal'
import { Floor3WorkLog } from '@/lib/floor3-work-log'
import { DocumentMetadata } from '@/lib/types'
import {
  LedgerEntry,
  StockGroup,
  StockMovement,
  applyFloor3WorkLogs,
  buildLedger,
  buildLotFlow,
  buildStockGroups,
  collectMovements,
  compactDate,
  displayDate,
  formatQuantity,
  uniqueUnits,
  type FlowLot,
  type UnregisteredOutbound,
  type WorkStage,
} from '@/lib/stock'
import { LotFlowBoard } from '@/components/shipment/lot-flow-board'

type TabKey = 'flow' | 'stock' | 'in' | 'out' | 'work'
const isTabKey = (v: string | null): v is TabKey => v === 'flow' || v === 'stock' || v === 'in' || v === 'out' || v === 'work'
type InventoryForm = {
  id?: string
  issueDate: string
  company: string
  product: string
  floor: string
  quantity: string
  quantityUnit: string
  lotStart: string
  defectQuantity: string
  sampleQuantity: string
}

const emptyForm = (): InventoryForm => ({
  issueDate: new Date().toISOString().slice(0, 10),
  company: '',
  product: '',
  floor: '1',
  quantity: '',
  quantityUnit: 'EA',
  lotStart: '',
  defectQuantity: '',
  sampleQuantity: '',
})

function defectRateText(defect: number, incoming: number) {
  if (incoming <= 0) return null
  const rate = (defect / incoming) * 100
  return `${rate.toLocaleString('ko-KR', { maximumFractionDigits: 1 })}%`
}

function uniqueSorted(values: string[], locale = true) {
  const items = [...new Set(values.filter((item) => item && item !== '-'))]
  return locale ? items.sort((a, b) => a.localeCompare(b, 'ko')) : items.sort()
}

function authHeaders() {
  const session = getSession()
  return {
    'Content-Type': 'application/json',
    ...(session ? buildAuthHeaders(session) : {}),
  }
}

export function ShipmentView() {
  const { user } = useAuth()
  const router = useRouter()
  const searchParams = useSearchParams()
  const editable = Boolean(user && user.role !== 'viewer')
  const editFloor = homeFloor(user)
  const canEditMovement = (floor: string) => canOperateFloor(user, floor)
  const [documents, setDocuments] = useState<DocumentMetadata[]>([])
  const [inventory, setInventory] = useState<DocumentMetadata[]>([])
  const [workLogs, setWorkLogs] = useState<Floor3WorkLog[]>([])
  const [processChecks, setProcessChecks] = useState<ProcessCheckRecord[]>([])
  const [processTemplates, setProcessTemplates] = useState<ProcessTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const tabParam = searchParams.get('tab')
  const [tab, setTabState] = useState<TabKey>(isTabKey(tabParam) ? tabParam : 'flow')
  useEffect(() => {
    if (isTabKey(tabParam)) setTabState(tabParam)
  }, [tabParam])
  const setTab = (key: TabKey) => {
    setTabState(key)
    router.replace(`/shipment?tab=${key}`, { scroll: false })
  }
  const [query, setQuery] = useState('')
  const [companyFilter, setCompanyFilter] = useState('all')
  const [productFilter, setProductFilter] = useState('all')
  const [floorFilter, setFloorFilter] = useState(editFloor ? String(editFloor) : 'all')
  const pinnedFloor = useRef(false)
  useEffect(() => {
    if (pinnedFloor.current || editFloor == null) return
    pinnedFloor.current = true
    setFloorFilter(String(editFloor))
  }, [editFloor])
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [filtersOpen, setFiltersOpen] = useState(false)
  const activeFilterCount =
    Number(companyFilter !== 'all') + Number(productFilter !== 'all') + Number(Boolean(startDate || endDate))
  const [formOpen, setFormOpen] = useState(false)
  const [form, setForm] = useState<InventoryForm>(emptyForm)
  const [saving, setSaving] = useState(false)
  const [selectedGroup, setSelectedGroup] = useState<StockGroup | null>(null)
  const [isEditMode, setIsEditMode] = useState(false)
  const [editedQuantities, setEditedQuantities] = useState<Record<string, number>>({})
  const [isSavingEdits, setIsSavingEdits] = useState(false)
  const [isOutgoingWarningOpen, setIsOutgoingWarningOpen] = useState(false)
  const [quantityEdit, setQuantityEdit] = useState<StockMovement | null>(null)
  const [quantityEditValue, setQuantityEditValue] = useState('')
  const ledgerScrollRef = useRef<HTMLDivElement>(null)
  const [previewDoc, setPreviewDoc] = useState<DocumentMetadata | null>(null)
  const [selectedLot, setSelectedLot] = useState<StockMovement | null>(null)

  const load = useCallback(async (manual = false) => {
    if (manual) setRefreshing(true)
    else setLoading(true)
    try {
      const session = getSession()
      const headers = session ? buildAuthHeaders(session) : {}
      const [docRes, invRes, checkRes, templateRes, workRes] = await Promise.all([
        fetch('/api/documents', { cache: 'no-store', headers }),
        fetch('/api/inventory', { cache: 'no-store', headers }),
        fetch('/api/process-checks', { cache: 'no-store', headers }),
        fetch('/api/process-templates', { cache: 'no-store', headers }),
        fetch('/api/floor3-work-logs', { cache: 'no-store', headers }),
      ])
      if (!docRes.ok) throw new Error('문서 목록을 불러오지 못했습니다.')
      if (!invRes.ok) throw new Error('입고 목록을 불러오지 못했습니다.')
      const docResult = await docRes.json()
      const invResult = await invRes.json()
      const checkResult = checkRes.ok ? await checkRes.json() : { data: [] }
      const templateResult = templateRes.ok ? await templateRes.json() : { data: [] }
      const workResult = workRes.ok ? await workRes.json() : { data: [] }
      setDocuments(docResult.data || [])
      setInventory(invResult.data || [])
      setWorkLogs(workResult.data || [])
      setProcessChecks(checkResult.data || [])
      setProcessTemplates(templateResult.data || [])
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '목록을 불러오지 못했습니다.')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])
  useDataChanged(() => void load(true), [load])

  const movements = useMemo(
    () => collectMovements(documents, inventory),
    [documents, inventory],
  )

  const availableCompanies = useMemo(
    () =>
      uniqueSorted(
        movements
          .filter(
            (item) =>
              (productFilter === 'all' || item.product === productFilter) &&
              (floorFilter === 'all' || item.floor === floorFilter),
          )
          .map((item) => item.company),
      ),
    [floorFilter, movements, productFilter],
  )
  const activeCompany =
    companyFilter === 'all' && availableCompanies.length === 1
      ? availableCompanies[0]
      : companyFilter

  const availableProducts = useMemo(
    () =>
      uniqueSorted(
        movements
          .filter(
            (item) =>
              (activeCompany === 'all' || item.company === activeCompany) &&
              (floorFilter === 'all' || item.floor === floorFilter),
          )
          .map((item) => item.product),
      ),
    [activeCompany, floorFilter, movements],
  )
  const activeProduct =
    productFilter === 'all' && availableProducts.length === 1
      ? availableProducts[0]
      : productFilter

  const availableFloors = useMemo(
    () =>
      uniqueSorted(
        movements
          .filter(
            (item) =>
              (activeCompany === 'all' || item.company === activeCompany) &&
              (productFilter === 'all' || item.product === productFilter),
          )
          .map((item) => item.floor),
        false,
      ),
    [activeCompany, movements, productFilter],
  )
  const activeFloor =
    floorFilter === 'all' && availableFloors.length === 1
      ? availableFloors[0]
      : floorFilter

  const [companyCounts, productCounts] = useMemo(() => {
    const companies = new Map<string, number>()
    const products = new Map<string, number>()
    for (const item of movements) {
      if (activeFloor !== 'all' && item.floor !== activeFloor) continue
      if (activeProduct === 'all' || item.product === activeProduct) companies.set(item.company, (companies.get(item.company) ?? 0) + 1)
      if (activeCompany === 'all' || item.company === activeCompany) products.set(item.product, (products.get(item.product) ?? 0) + 1)
    }
    return [companies, products]
  }, [activeCompany, activeFloor, activeProduct, movements])

  const formCompanies = useMemo(
    () =>
      uniqueSorted(
        movements
          .filter((item) => !form.product || item.product === form.product)
          .map((item) => item.company),
      ),
    [form.product, movements],
  )
  const formProducts = useMemo(
    () =>
      uniqueSorted(
        movements
          .filter((item) => !form.company || item.company === form.company)
          .map((item) => item.product),
      ),
    [form.company, movements],
  )

  useEffect(() => {
    if (companyFilter !== 'all' && !availableCompanies.includes(companyFilter)) {
      setCompanyFilter('all')
    }
  }, [availableCompanies, companyFilter])
  useEffect(() => {
    if (productFilter !== 'all' && !availableProducts.includes(productFilter)) {
      setProductFilter('all')
    }
  }, [availableProducts, productFilter])
  const filteredMovements = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('ko-KR')
    return movements.filter((item) => {
      const matchesFilter =
        (activeCompany === 'all' || item.company === activeCompany) &&
        (activeProduct === 'all' || item.product === activeProduct) &&
        (activeFloor === 'all' || item.floor === activeFloor)
      if (!matchesFilter) return false
      if (!q) return true
      return [item.company, item.product, item.lot, item.floor, item.unit]
        .join(' ')
        .toLocaleLowerCase('ko-KR')
        .includes(q)
    })
  }, [activeCompany, activeFloor, activeProduct, movements, query])

  const lotFlow = useMemo(
    () =>
      buildLotFlow(
        movements.filter(
          (item) =>
            (activeCompany === 'all' || item.company === activeCompany) &&
            (activeProduct === 'all' || item.product === activeProduct) &&
            (activeFloor === 'all' || item.floor === activeFloor),
        ),
      ),
    [activeCompany, activeFloor, activeProduct, movements],
  )
  const stageCount = (stage: FlowLot['stage']) => lotFlow.lots.filter((lot) => lot.stage === stage).length

  const groups = useMemo(() => {
    const built = buildStockGroups(filteredMovements, startDate, endDate)
    if (activeFloor === '1' || activeFloor === '2') return built
    const logs = workLogs.filter((item) =>
      (activeCompany === 'all' || item.company === activeCompany) &&
      (activeProduct === 'all' || item.product === activeProduct),
    )
    return applyFloor3WorkLogs(built, logs, startDate, endDate)
  }, [activeCompany, activeFloor, activeProduct, endDate, filteredMovements, startDate, workLogs])

  const inbound = useMemo(
    () =>
      filteredMovements
        .filter((item) => item.kind === '입고')
        .filter((item) => inDateRange(item.issueDate, startDate, endDate))
        .sort((a, b) => b.issueDate.localeCompare(a.issueDate)),
    [endDate, filteredMovements, startDate],
  )

  const workRows = useMemo(() => {
    if (activeFloor === '1' || activeFloor === '2') return []
    const start = startDate.replace(/-/g, '')
    const end = endDate.replace(/-/g, '')
    return workLogs.filter((item) => {
      if (activeCompany !== 'all' && item.company !== activeCompany) return false
      if (activeProduct !== 'all' && item.product !== activeProduct) return false
      const date = item.workDate.replace(/-/g, '')
      if (start && date < start) return false
      if (end && date > end) return false
      return true
    })
  }, [activeCompany, activeFloor, activeProduct, endDate, startDate, workLogs])
  const workCatalog = useMemo(() => {
    const seen = new Set<string>()
    const catalog: { company: string; product: string }[] = []
    const add = (company: string, product: string) => {
      if (!company || !product) return
      if (activeCompany !== 'all' && company !== activeCompany) return
      if (activeProduct !== 'all' && product !== activeProduct) return
      const key = `${company}\0${product}`
      if (seen.has(key)) return
      seen.add(key)
      catalog.push({ company, product })
    }
    for (const item of movements) {
      if (item.floor === '3') add(item.company, item.product)
    }
    for (const item of workLogs) add(item.company, item.product)
    return catalog.sort((a, b) => a.company.localeCompare(b.company, 'ko') || a.product.localeCompare(b.product, 'ko'))
  }, [activeCompany, activeProduct, movements, workLogs])

  const outbound = useMemo(
    () =>
      filteredMovements
        .filter((item) => item.kind === '출고')
        .filter((item) => inDateRange(item.issueDate, startDate, endDate))
        .sort((a, b) => b.issueDate.localeCompare(a.issueDate)),
    [endDate, filteredMovements, startDate],
  )

  const units = uniqueUnits(groups)
  const workUnit = units.length === 1 ? units[0] : 'EA'
  const canSum = units.length <= 1
  const unitLabel = units[0] || ''
  const floor3 = activeFloor === '3'
  const incomingSum = groups.reduce((sum, row) => sum + row.incoming, 0)
  const outgoingSum = groups.reduce((sum, row) => sum + row.outgoing, 0)
  const openingSum = groups.reduce((sum, row) => sum + row.opening, 0)
  const stockSum = groups.reduce((sum, row) => sum + row.stock, 0)
  const defectSum = groups.reduce((sum, row) => sum + row.defect, 0)
  const sampleSum = groups.reduce((sum, row) => sum + row.sample, 0)
  const finalSum = groups.reduce((sum, row) => sum + row.finalStock, 0)
  const negativeCount = groups.filter((row) => (floor3 ? row.finalStock : row.stock) < 0).length

  const selectedLedgerView = useMemo(() => {
    if (!selectedGroup) return { rows: [], openLots: [], segments: [] }
    return buildLedger(
      filteredMovements.filter(
        (item) =>
          item.company === selectedGroup.company &&
          item.product === selectedGroup.product &&
          item.floor === selectedGroup.floor &&
          item.unit === selectedGroup.unit,
      ),
      startDate,
      endDate,
    )
  }, [endDate, filteredMovements, selectedGroup, startDate])
  const selectedLedger = selectedLedgerView.rows

  const saveInventory = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!form.company || !form.product || !form.quantity) {
      toast.error('업체명, 품목, 수량은 필수입니다.')
      return
    }
    setSaving(true)
    try {
      const payload = {
        id: form.id,
        issueDate: form.issueDate,
        company: form.company,
        product: form.product,
        floor: editFloor ?? Number(form.floor),
        quantity: Number(form.quantity),
        quantityUnit: form.quantityUnit,
        lotStart: form.lotStart,
      }
      const response = await fetch('/api/inventory', {
        method: form.id ? 'PATCH' : 'POST',
        headers: authHeaders(),
        body: JSON.stringify(payload),
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(result.error || '입고 저장에 실패했습니다.')
      toast.success(form.id ? '입고 내역을 수정했습니다.' : '입고 내역을 등록했습니다.')
      setFormOpen(false)
      setForm(emptyForm())
      await load(true)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '입고 저장에 실패했습니다.')
    } finally {
      setSaving(false)
    }
  }

  const deleteInventory = async (id: string) => {
    if (!window.confirm('이 입고 내역을 삭제하시겠습니까?')) return
    try {
      const response = await fetch('/api/inventory', {
        method: 'DELETE',
        headers: authHeaders(),
        body: JSON.stringify({ id }),
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(result.error || '입고 삭제에 실패했습니다.')
      toast.success('입고 내역을 삭제했습니다.')
      await load(true)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '입고 삭제에 실패했습니다.')
    }
  }

  const focusMovement = searchParams.get('movement')
  useEffect(() => {
    if (!focusMovement) return
    const row = movements.find((item) => item.id === focusMovement)
    if (row) setSelectedLot(row)
  }, [focusMovement, movements])

  const closeLot = () => {
    setSelectedLot(null)
    if (searchParams.get('movement')) router.replace('/shipment')
  }

  const openEdit = (row: StockMovement) => {
    if (row.source !== 'inventory') {
      setQuantityEdit(row)
      setQuantityEditValue(String(row.quantity))
      return
    }
    setForm({
      id: row.id,
      issueDate: row.issueDate.length === 8
        ? `${row.issueDate.slice(0, 4)}-${row.issueDate.slice(4, 6)}-${row.issueDate.slice(6, 8)}`
        : new Date().toISOString().slice(0, 10),
      company: row.company,
      product: row.product,
      floor: row.floor || '1',
      quantity: String(row.quantity),
      quantityUnit: row.unit || 'EA',
      lotStart: row.lot === '-' ? '' : row.lot,
      defectQuantity: row.defect ? String(row.defect) : '',
      sampleQuantity: row.sample ? String(row.sample) : '',
    })
    setFormOpen(true)
  }

  const changeStage = async (lot: FlowLot, stage: WorkStage | null) => {
    try {
      const response = await fetch('/api/inventory', {
        method: 'PATCH',
        headers: authHeaders(),
        body: JSON.stringify({ id: lot.inbound.id, workStage: stage }),
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(result.error || '작업 단계 변경에 실패했습니다.')
      setInventory((current) =>
        current.map((item) => (item.id === lot.inbound.id ? { ...item, workStage: stage ?? undefined } : item)),
      )
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '작업 단계 변경에 실패했습니다.')
    }
  }

  const registerInbound = (item: UnregisteredOutbound) => {
    const first = item.firstDate
    setForm({
      ...emptyForm(),
      ...(first.length === 8 ? { issueDate: `${first.slice(0, 4)}-${first.slice(4, 6)}-${first.slice(6, 8)}` } : {}),
      company: item.company,
      product: item.product,
      floor: item.floor || '1',
      quantity: String(item.quantity),
      quantityUnit: item.unit || 'EA',
    })
    setFormOpen(true)
  }

  const ledgerKey = (row: Pick<StockMovement, 'source' | 'id'>) => `${row.source}-${row.id}`

  const patchMovementQuantity = async (row: StockMovement, quantity: number) => {
    if (!Number.isFinite(quantity) || quantity < 0) {
      throw new Error('수량은 0 이상이어야 합니다.')
    }
    const response = row.source === 'inventory'
      ? await fetch('/api/inventory', {
          method: 'PATCH',
          headers: authHeaders(),
          body: JSON.stringify({ id: row.id, quantity, quantityUnit: row.unit || 'EA' }),
        })
      : await fetch('/api/documents', {
          method: 'PATCH',
          headers: authHeaders(),
          body: JSON.stringify({ id: row.id, quantity }),
        })
    const result = await response.json().catch(() => ({}))
    if (!response.ok) {
      throw new Error(result.error || (row.kind === '출고' ? '출고 수량 수정에 실패했습니다.' : '입고 수량 수정에 실패했습니다.'))
    }
  }

  const changedLedgerRows = () =>
    selectedLedger.filter((row) => {
      const next = editedQuantities[ledgerKey(row)]
      return next != null && next !== row.quantity
    })

  const saveEditedRows = async (confirmed = false) => {
    const changed = changedLedgerRows()
    if (!changed.length) {
      toast.success('변경된 내용이 없습니다.')
      setIsEditMode(false)
      return
    }
    const outgoingChanged = changed.some((row) => row.kind === '출고')
    if (outgoingChanged && !confirmed) {
      setIsOutgoingWarningOpen(true)
      return
    }
    setIsSavingEdits(true)
    try {
      for (const row of changed) {
        await patchMovementQuantity(row, editedQuantities[ledgerKey(row)])
      }
      toast.success('수정사항을 저장했습니다.')
      setIsEditMode(false)
      setEditedQuantities({})
      setIsOutgoingWarningOpen(false)
      await load(true)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '수정사항 저장에 실패했습니다.')
    } finally {
      setIsSavingEdits(false)
    }
  }

  const saveQuantityEdit = async (confirmed = false) => {
    if (!quantityEdit) return
    const quantity = Number(quantityEditValue)
    if (!Number.isFinite(quantity) || quantity < 0) {
      toast.error('수량은 0 이상이어야 합니다.')
      return
    }
    if (quantityEdit.kind === '출고' && !confirmed) {
      setIsOutgoingWarningOpen(true)
      return
    }
    setIsSavingEdits(true)
    try {
      await patchMovementQuantity(quantityEdit, quantity)
      toast.success('수량을 수정했습니다.')
      setQuantityEdit(null)
      setIsOutgoingWarningOpen(false)
      await load(true)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '수량 수정에 실패했습니다.')
    } finally {
      setIsSavingEdits(false)
    }
  }

  const downloadExcel = async () => {
    setDownloading(true)
    try {
      const buffer = await buildShipmentWorkbook({
        floor3,
        stock: groups.map((row) => ({
          company: row.company,
          product: row.product,
          floor: row.floor ? `${row.floor}층` : '-',
          unit: row.unit,
          opening: row.opening,
          incoming: row.incoming,
          outgoing: row.outgoing,
          stock: row.stock,
          defect: row.defect,
          sample: row.sample,
          workQuantity: row.workQuantity,
          finalStock: row.finalStock,
          defectRate: defectRateText(row.defect, row.incoming) || '-',
          lastDate: displayDate(row.lastDate),
        })),
        ledger: [...inbound, ...outbound]
          .sort((a, b) => a.issueDate.localeCompare(b.issueDate))
          .map((row) => ({
            issueDate: displayDate(row.issueDate),
            kind: row.kind,
            company: row.company,
            product: row.product,
            floor: row.floor ? `${row.floor}층` : '-',
            lot: row.lot || '-',
            quantity: row.quantity,
            unit: row.unit,
          })),
      })
      const blob = new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `입출고관리_${new Date().toISOString().slice(0, 10).replace(/-/g, '')}.xlsx`
      link.click()
      URL.revokeObjectURL(url)
      toast.success('엑셀 파일을 다운로드했습니다.')
    } catch {
      toast.error('엑셀 파일 생성에 실패했습니다.')
    } finally {
      setDownloading(false)
    }
  }

  return (
    <main className="p-6 md:p-8">
      <PageHeader
        className="mb-6"
        tone="amber"
        icon={ArrowLeftRight}
        eyebrow="PROCESS · 공정관리"
        title={
          <span className="flex items-center gap-2.5">
            입/출고 관리
            <span
              title="입고가 아직 관리되지 않아 재고와 진행현황이 실제와 다릅니다. 화면 확인용입니다."
              className="cursor-help rounded-md bg-white/90 px-2 py-0.5 text-xs font-bold tracking-normal text-sky-700"
            >
              테스트 중
            </span>
          </span>
        }
        description="고객 소재가 입고 → 작업 → 출고로 어디까지 왔는지 입고 건별로 봅니다. 출고는 성적서 등록 시 자동으로 잡힙니다."
        actions={
          <>
            <Button variant="outline" className={BAND_BUTTON} onClick={() => void load(true)} disabled={refreshing}>
              <RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
              새로고침
            </Button>
            <Button variant="outline" className={BAND_BUTTON} onClick={() => void downloadExcel()} disabled={loading || downloading || groups.length === 0}>
              <Download className="mr-2 h-4 w-4" /> 엑셀 다운로드
            </Button>
            {editable && (
              <Button
                className={BAND_BUTTON_PRIMARY}
                onClick={() => {
                  setForm(emptyForm())
                  setFormOpen(true)
                }}
              >
                <Plus className="mr-2 h-4 w-4" /> 입고 등록
              </Button>
            )}
          </>
        }
      />

      <div className="mb-3 flex gap-1 rounded-2xl border border-border bg-card p-1 shadow-[0_1px_3px_oklch(0_0_0/0.06),0_4px_12px_oklch(0_0_0/0.04)]">
        {(
          [
            ['flow', '진행현황', lotFlow.lots.length - stageCount('done')],
            ['stock', '재고현황', groups.length],
            ['in', '입고내역', inbound.length],
            ['out', '출고내역', outbound.length],
            ['work', '작업일보', workRows.length],
          ] as const
        ).map(([key, label, count]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`flex-1 rounded-xl px-3 py-2 text-sm font-medium transition-colors ${
              tab === key ? 'bg-foreground text-background shadow-sm' : 'text-muted-foreground hover:bg-muted hover:text-foreground'
            }`}
          >
            {label}
            <span className={`ml-1 text-xs tabular-nums ${tab === key ? 'text-background/70' : 'text-muted-foreground'}`}>{count}</span>
          </button>
        ))}
      </div>

      <section className="mb-4">
        {user?.role === 'viewer' && (
          <p className="mb-2 text-sm text-muted-foreground">뷰어 계정은 입출고를 보기만 할 수 있습니다.</p>
        )}
        {editFloor != null && user?.role !== 'viewer' && (
          <p className="mb-2 text-sm text-muted-foreground">등록과 수정은 {editFloor}층만 가능합니다. 다른 층은 조회만 됩니다.</p>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex h-10 items-center gap-0.5 rounded-lg border bg-card p-1" role="tablist" aria-label="층 선택">
            {(['all', '1', '2', '3'] as const).map((floor) => (
              <button
                key={floor}
                type="button"
                role="tab"
                aria-selected={floorFilter === floor}
                onClick={() => setFloorFilter(floor)}
                className={`h-full rounded-md px-3.5 text-sm font-semibold transition-colors ${
                  floorFilter === floor ? 'bg-amber-500 text-white shadow-sm' : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
              >
                {floor === 'all' ? '전체' : `${floor}층`}
              </button>
            ))}
          </div>
          <label className="relative min-w-56 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="업체명, 품목, 로트번호 검색..."
              className="h-10 w-full rounded-lg border border-input bg-card pl-9 pr-10 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground hover:bg-muted"
                aria-label="검색어 지우기"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </label>
          <Button
            variant="outline"
            className={`h-10 ${filtersOpen || activeFilterCount ? 'border-foreground/30 bg-muted' : 'bg-card'}`}
            onClick={() => setFiltersOpen((value) => !value)}
            aria-expanded={filtersOpen}
          >
            <SlidersHorizontal className="mr-2 h-4 w-4" />
            필터
            {activeFilterCount > 0 && (
              <span className="ml-1.5 rounded-full bg-foreground px-1.5 text-[11px] font-bold text-background tabular-nums">{activeFilterCount}</span>
            )}
            <ChevronDown className={`ml-1.5 h-4 w-4 transition-transform ${filtersOpen ? 'rotate-180' : ''}`} />
          </Button>
          <span className="hidden text-sm text-muted-foreground tabular-nums lg:inline">
            재고 {groups.length}종 · 입고 {inbound.length}건 · 출고 {outbound.length}건
          </span>
        </div>

        {filtersOpen && (
          <div className="mt-2 grid gap-3 rounded-xl border bg-card p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-4">
            <FilterSelect label="업체명" value={activeCompany} onChange={setCompanyFilter} allLabel="전체 업체" options={availableCompanies} counts={companyCounts} />
            <FilterSelect label="품목" value={activeProduct} onChange={setProductFilter} allLabel="전체 품목" options={availableProducts} counts={productCounts} />
            <label className="space-y-1.5 text-sm font-medium lg:col-span-2">
              <span>날짜 범위</span>
              <div className="flex items-center gap-2">
                <input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} className="h-10 min-w-0 flex-1 rounded-lg border border-input bg-background px-2 text-sm" />
                <span className="text-muted-foreground">~</span>
                <input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} className="h-10 min-w-0 flex-1 rounded-lg border border-input bg-background px-2 text-sm" />
              </div>
            </label>
          </div>
        )}

        {activeFilterCount > 0 && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {companyFilter !== 'all' && <FilterChip label={companyFilter} onClear={() => setCompanyFilter('all')} />}
            {productFilter !== 'all' && <FilterChip label={productFilter} onClear={() => setProductFilter('all')} />}
            {(startDate || endDate) && (
              <FilterChip
                label={`${startDate ? startDate.replace(/-/g, '.') : '처음'} ~ ${endDate ? endDate.replace(/-/g, '.') : '오늘'}`}
                onClear={() => {
                  setStartDate('')
                  setEndDate('')
                }}
              />
            )}
            <button
              type="button"
              onClick={() => {
                setCompanyFilter('all')
                setProductFilter('all')
                setStartDate('')
                setEndDate('')
              }}
              className="px-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              모두 지우기
            </button>
          </div>
        )}
      </section>

      {tab !== 'flow' && (
      <section className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <SummaryCard label="입고" value={canSum ? incomingSum : null} unit={unitLabel} tone="blue" />
        <SummaryCard label="출고" value={canSum ? outgoingSum : null} unit={unitLabel} tone="orange" />
        <SummaryCard
          label={floor3 ? '현 재고수량' : startDate ? '기초 + 기간 = 현재고' : '현재 재고'}
          value={canSum ? stockSum : null}
          unit={unitLabel}
          tone="yellow"
          hint={startDate && canSum ? `기초 ${openingSum.toLocaleString('ko-KR')}` : undefined}
        />
        {floor3 ? (
          <SummaryCard
            label="최종 재고수량"
            value={canSum ? finalSum : null}
            unit={unitLabel}
            tone={canSum && finalSum < 0 ? 'rose' : 'yellow'}
            hint={canSum ? `불량 ${defectSum.toLocaleString('ko-KR')} · 검사시료 ${sampleSum.toLocaleString('ko-KR')}` : undefined}
          />
        ) : (
          <SummaryCard label="재고 마이너스" value={negativeCount} unit="종" tone="rose" hint="대부분 입고 미등록" />
        )}
      </section>
      )}

      {tab !== 'flow' && !canSum && groups.length > 0 && (
        <p className="mb-4 flex items-center gap-2 text-sm text-amber-700 dark:text-amber-400">
          <TriangleAlert className="h-4 w-4" /> 단위가 섞여 있어 합계는 표시하지 않습니다. 품목별로 확인하세요.
        </p>
      )}

      {tab === 'flow' && (
          <LotFlowBoard
          loading={loading}
          flow={lotFlow}
          query={query}
          startDate={startDate}
          endDate={endDate}
          editable={editable}
          editFloor={editFloor}
          onStage={(lot, stage) => void changeStage(lot, stage)}
          onOpen={setSelectedLot}
          onRegister={registerInbound}
        />
      )}
      {tab === 'stock' && (
        <StockTable
          loading={loading}
          floor3={floor3}
          rows={groups}
          onOpen={(row) => {
            setSelectedGroup(row)
            setIsEditMode(false)
            setEditedQuantities({})
          }}
        />
      )}
      {tab === 'in' && (
        <MovementTable
          loading={loading}
          rows={inbound}
          empty="등록된 입고 내역이 없습니다."
          canManage={editable}
          editFloor={editFloor}
          onEdit={openEdit}
          onDelete={deleteInventory}
          onOpenLot={setSelectedLot}
        />
      )}
      {tab === 'out' && (
        <MovementTable
          loading={loading}
          rows={outbound}
          empty="출고로 잡힌 성적서가 없습니다."
          note="출고 수량을 수정하면 연결된 성적서 수량도 함께 바뀝니다."
          canManage={editable}
          editFloor={editFloor}
          onEdit={openEdit}
          onOpenLot={setSelectedLot}
        />
      )}
      {tab === 'work' && (
        <Floor3WorkLogPanel
          logs={workRows}
          history={workLogs}
          checks={processChecks}
          templates={processTemplates}
          catalog={workCatalog}
          editable={canEditMovement('3') && activeFloor !== '1' && activeFloor !== '2'}
          company={activeCompany === 'all' ? '' : activeCompany}
          product={activeProduct === 'all' ? '' : activeProduct}
          unit={workUnit}
          otherFloor={activeFloor === '1' || activeFloor === '2'}
          onSaved={() => load(true)}
        />
      )}

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle>{form.id ? '입고 내역 수정' : '입고 내역 등록'}</DialogTitle>
            <DialogDescription>거래명세표 기준으로 입고 한 건을 저장합니다.</DialogDescription>
          </DialogHeader>
          <form onSubmit={saveInventory} className="space-y-3 py-2">
            <Field label="입고일자">
              <Input type="date" value={form.issueDate} onChange={(event) => setForm({ ...form, issueDate: event.target.value })} required />
            </Field>
            <Field label="업체명">
              <SearchableCombobox
                configName="companies"
                options={formCompanies}
                recentOptions={formCompanies.slice(0, 8)}
                value={form.company}
                onChange={(value) => {
                  const productsForCompany = uniqueSorted(
                    movements.filter((item) => item.company === value).map((item) => item.product),
                  )
                  setForm({
                    ...form,
                    company: value,
                    product: form.product && productsForCompany.includes(form.product)
                      ? form.product
                      : productsForCompany.length === 1 ? productsForCompany[0] : form.product,
                  })
                }}
                placeholder="업체 검색 또는 입력..."
                className="h-10"
              />
            </Field>
            <Field label="품명">
              <SearchableCombobox
                configName="products"
                options={formProducts}
                recentOptions={formProducts.slice(0, 8)}
                value={form.product}
                onChange={(value) => {
                  const companiesForProduct = uniqueSorted(
                    movements.filter((item) => item.product === value).map((item) => item.company),
                  )
                  setForm({
                    ...form,
                    product: value,
                    company: form.company && companiesForProduct.includes(form.company)
                      ? form.company
                      : companiesForProduct.length === 1 ? companiesForProduct[0] : form.company,
                  })
                }}
                placeholder="품명 검색 또는 입력..."
                className="h-10"
              />
            </Field>
            <Field label="층">
              <select
                value={editFloor != null ? String(editFloor) : form.floor}
                onChange={(event) => setForm({ ...form, floor: event.target.value })}
                disabled={editFloor != null}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm disabled:opacity-70"
              >
                <option value="1">1층</option>
                <option value="2">2층</option>
                <option value="3">3층</option>
              </select>
            </Field>
            <Field label="로트번호">
              <Input value={form.lotStart} onChange={(event) => setForm({ ...form, lotStart: event.target.value })} placeholder="(선택)" />
            </Field>
            <Field label="수량">
              <div className="flex gap-2">
                <Input type="number" min="0" step="any" value={form.quantity} onChange={(event) => setForm({ ...form, quantity: event.target.value })} required />
                <select
                  value={form.quantityUnit}
                  onChange={(event) => setForm({ ...form, quantityUnit: event.target.value })}
                  className="w-24 rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="EA">EA</option>
                  <option value="Kg">Kg</option>
                  <option value="R">R</option>
                </select>
              </div>
            </Field>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setFormOpen(false)}>취소</Button>
              <Button type="submit" disabled={saving}>{saving ? '저장 중...' : '저장'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(selectedGroup)}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedGroup(null)
            setIsEditMode(false)
            setEditedQuantities({})
            setIsOutgoingWarningOpen(false)
          }
        }}
      >
        <DialogContent className="!z-[80] !flex !max-h-[88vh] !min-h-0 !w-[min(96vw,980px)] !max-w-[980px] !flex-col !gap-4 !overflow-y-auto !rounded-2xl !bg-background !p-6 !ring-0 shadow-[0_8px_40px_oklch(0_0_0/0.18)]">
          <DialogHeader className="shrink-0 gap-3 pr-8 sm:flex-row sm:items-start sm:justify-between sm:space-y-0">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">재고</p>
              <DialogTitle className="mt-1 text-2xl font-bold tracking-tight">
                {selectedGroup?.company} · {selectedGroup?.product}
                {selectedGroup?.floor ? ` · ${selectedGroup.floor}층` : ''}
              </DialogTitle>
              <DialogDescription className="mt-1">
                날짜순 입출고와 누계재고입니다. 입고 전 출고는 마이너스로 남고, 첫 입고부터 다시 계산합니다.
              </DialogDescription>
            </div>
            {selectedGroup && canEditMovement(selectedGroup.floor) && (
              <div className="flex shrink-0 items-center gap-2">
                {isEditMode ? (
                  <>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={isSavingEdits}
                      onClick={() => {
                        setIsEditMode(false)
                        setEditedQuantities({})
                      }}
                    >
                      취소
                    </Button>
                    <Button type="button" disabled={isSavingEdits} onClick={() => void saveEditedRows()}>
                      {isSavingEdits ? '저장 중...' : '저장'}
                    </Button>
                  </>
                ) : (
                  <Button type="button" variant="outline" onClick={() => setIsEditMode(true)}>
                    편집
                  </Button>
                )}
              </div>
            )}
          </DialogHeader>
          {selectedGroup && (
            <div className={`grid shrink-0 gap-3 ${selectedGroup.floor === '3' ? 'grid-cols-3 sm:grid-cols-6' : 'grid-cols-3'}`}>
              <LedgerStat label="입고" value={selectedGroup.incoming} />
              <LedgerStat label="출고" value={selectedGroup.outgoing} />
              {selectedGroup.floor === '3' && (
                <>
                  <LedgerStat label="불량" value={selectedGroup.defect} />
                  <LedgerStat label="검사시료" value={selectedGroup.sample} />
                </>
              )}
              <LedgerStat label="현 재고" value={selectedGroup.stock} unit={selectedGroup.unit} warn={selectedGroup.stock < 0} />
              {selectedGroup.floor === '3' && (
                <LedgerStat label="최종 재고" value={selectedGroup.finalStock} unit={selectedGroup.unit} warn={selectedGroup.finalStock < 0} />
              )}
            </div>
          )}
          <div className="shrink-0">
            <LedgerFlow
              rows={selectedLedgerView.rows}
              onSelect={(key) => {
                requestAnimationFrame(() => scrollLedgerRow(ledgerScrollRef.current, key))
              }}
            />
          </div>
          <div ref={ledgerScrollRef} className={`${ledgerSheetClass} h-[42vh] shrink-0 overflow-y-auto`}>
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 bg-card">
                <tr className="border-b">
                  {['일자', '구분', '로트', '수량', '누계재고'].map((head) => (
                    <th key={head} className={`bg-card px-5 py-3 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase ${head === '수량' || head === '누계재고' ? 'text-right' : 'text-left'}`}>
                      {head}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {selectedLedgerView.rows.map((row, index) => {
                      const earlier = selectedLedgerView.rows.slice(0, index)
                      const firstInboundAfterEarlyOut = row.kind === '입고' && earlier.some((item) => item.beforeInbound) && earlier.every((item) => item.beforeInbound)
                      const boundary = firstInboundAfterEarlyOut ? 'shadow-[inset_0_2px_0_0_oklch(0.62_0.14_55)]' : ''
                      return (
                      <tr
                        key={ledgerKey(row)}
                        id={`ledger-row-${ledgerKey(row)}`}
                        className="cursor-pointer transition-colors hover:bg-muted/20"
                        onClick={() => setSelectedLot(row)}
                      >
                        <td className={`px-5 py-3.5 ${boundary}`}>
                          <div>{displayDate(row.issueDate)}</div>
                          {row.closedLots.map((lot) => (
                            <div key={lot.id} className="mt-1 text-[11px] font-medium text-[oklch(0.45_0.17_162)] dark:text-[oklch(0.68_0.17_162)]">
                              {depletionMark(lot)}
                            </div>
                          ))}
                        </td>
                        <td className={`px-5 py-3.5 ${boundary}`}>
                          <KindBadge kind={row.kind} />
                        </td>
                        <td className={`px-5 py-3.5 text-muted-foreground ${boundary}`}>{lotLabel(row.kind, row.lot)}</td>
                        <td className={`px-5 py-3.5 text-right ${boundary}`} onClick={(event) => event.stopPropagation()}>
                          {isEditMode ? (
                            <Input
                              type="number"
                              min="0"
                              step="any"
                              className="ml-auto h-8 w-28 text-right"
                              value={editedQuantities[ledgerKey(row)] ?? row.quantity}
                              onChange={(event) =>
                                setEditedQuantities((current) => ({
                                  ...current,
                                  [ledgerKey(row)]: Number(event.target.value),
                                }))
                              }
                            />
                          ) : (
                            <QtyText value={row.quantity} unit={row.unit} className={quantityTone(row.kind)} />
                          )}
                        </td>
                        <td className={`px-5 py-3.5 text-right ${boundary}`}>
                          <QtyText value={row.running} unit={row.unit} warn={row.running < 0} className="font-semibold" />
                        </td>
                      </tr>
                      )
                })}
                {selectedLedger.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">기간 내 이동이 없습니다.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(quantityEdit)} onOpenChange={(open) => !open && setQuantityEdit(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{quantityEdit?.kind || '출고'} 수량 수정</DialogTitle>
            <DialogDescription>
              {quantityEdit?.company} · {quantityEdit?.product} · {displayDate(quantityEdit?.issueDate)}
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-2 py-2">
            <Input
              type="number"
              min="0"
              step="any"
              value={quantityEditValue}
              onChange={(event) => setQuantityEditValue(event.target.value)}
            />
            <span className="text-sm text-muted-foreground">{quantityEdit?.unit}</span>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setQuantityEdit(null)}>취소</Button>
            <Button type="button" disabled={isSavingEdits} onClick={() => void saveQuantityEdit()}>
              {isSavingEdits ? '저장 중...' : '저장'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isOutgoingWarningOpen} onOpenChange={setIsOutgoingWarningOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <TriangleAlert className="h-5 w-5 text-amber-500" aria-hidden="true" />
              출고 수량을 수정하시겠습니까?
            </DialogTitle>
            <DialogDescription className="pt-2 leading-6">
              출고값은 성적서와 연동된 값입니다. 수정하면 연결된 성적서 개수도 함께 변경됩니다.
              그래도 저장하시겠습니까?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsOutgoingWarningOpen(false)}
              disabled={isSavingEdits}
            >
              취소
            </Button>
            <Button
              type="button"
              disabled={isSavingEdits}
              onClick={() => {
                if (quantityEdit) void saveQuantityEdit(true)
                else void saveEditedRows(true)
              }}
            >
              확인하고 저장
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {selectedLot ? (
        <LotDetailPanel
          anchor={selectedLot}
          movements={movements}
          documents={documents}
          checks={processChecks}
          templates={processTemplates}
          workLogs={workLogs}
          editable={canEditMovement(selectedLot.floor)}
          onClose={closeLot}
          onPreview={setPreviewDoc}
        />
      ) : null}

      {previewDoc ? (
        <PdfViewerModal
          open
          onClose={() => setPreviewDoc(null)}
          fileUrl={`/api/file?path=${encodeURIComponent(previewDoc.storagePath)}`}
          filename={previewDoc.originalName || previewDoc.filename || '성적서'}
          downloadName={previewDoc.originalName || previewDoc.filename}
          subtitle={`${previewDoc.company} · ${previewDoc.product || ''}`}
        />
      ) : null}
    </main>
  )
}

function inDateRange(issueDate: string, startDate: string, endDate: string) {
  const start = startDate ? compactDate(startDate) : ''
  const end = endDate ? compactDate(endDate) : ''
  if (start && issueDate < start) return false
  if (end && issueDate > end) return false
  return true
}

function SummaryCard({
  label,
  value,
  unit,
  tone,
  hint,
}: {
  label: string
  value: number | null
  unit: string
  tone: 'blue' | 'orange' | 'yellow' | 'rose'
  hint?: string
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-[0_1px_3px_oklch(0_0_0/0.06),0_4px_12px_oklch(0_0_0/0.04)]">
      <span className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">{label}</span>
      <p className={`mt-2 text-2xl font-bold leading-none tabular-nums ${tone === 'rose' ? 'text-destructive' : ''}`}>
        {value == null ? '—' : value.toLocaleString('ko-KR', { maximumFractionDigits: 2 })}
        <span className="ml-1 text-sm font-normal text-muted-foreground">{value == null ? '단위 혼재' : unit}</span>
      </p>
      {hint && <p className="mt-2 text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}

const ledgerChartConfig = {
  running: { label: '누계재고', color: '#0f766e' },
  signed: { label: '입출고', color: '#2563eb' },
} satisfies ChartConfig

interface LedgerPoint {
  key: string
  rowKey: string
  label: string
  fullDate: string
  kind: '입고' | '출고'
  quantity: number
  signed: number
  running: number
  unit: string
}

function scrollLedgerRow(scroller: HTMLDivElement | null, key: string) {
  const target = document.getElementById(`ledger-row-${key}`)
  if (!scroller || !target) return
  const stickyHeader = scroller.querySelector('thead')?.getBoundingClientRect().height ?? 0
  const top = target.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop - stickyHeader
  scroller.scrollTo({ top: Math.max(0, top), behavior: 'smooth' })
}

function LedgerFlow({
  rows,
  onSelect,
}: {
  rows: LedgerEntry[]
  onSelect: (key: string) => void
}) {
  const points: LedgerPoint[] = rows.map((row, index) => {
    const date = displayDate(row.issueDate)
    return {
      key: String(index),
      rowKey: `${row.source}-${row.id}`,
      label: date.length >= 10 ? date.slice(5) : date,
      fullDate: date,
      kind: row.kind,
      quantity: row.quantity,
      signed: row.kind === '입고' ? row.quantity : -row.quantity,
      running: row.running,
      unit: row.unit,
    }
  })

  if (points.length === 0) return null

  return (
    <div className={`space-y-2 px-4 py-4 ${ledgerSheetClass}`}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
        <span className="text-sm font-semibold tracking-wide uppercase">재고 추이</span>
        <span className="inline-flex items-center gap-1.5 text-muted-foreground">
          <span className="inline-block h-2.5 w-2.5 rounded-sm bg-blue-600" />
          입고
        </span>
        <span className="inline-flex items-center gap-1.5 text-muted-foreground">
          <span className="inline-block h-2.5 w-2.5 rounded-sm bg-orange-600" />
          출고
        </span>
        <span className="inline-flex items-center gap-1.5 text-muted-foreground">
          <span className="inline-block h-2.5 w-4 rounded-sm bg-teal-700/25 ring-1 ring-teal-700" />
          누계재고
        </span>
        <span className="text-muted-foreground">점이나 막대를 누르면 해당 내역으로 이동합니다.</span>
      </div>
      <ChartContainer config={ledgerChartConfig} className="aspect-auto h-[280px] w-full">
        <ComposedChart data={points} margin={{ left: 4, right: 16, top: 18, bottom: 8 }}>
          <CartesianGrid vertical={false} strokeDasharray="3 3" />
          <XAxis
            dataKey="key"
            tickLine={false}
            axisLine={false}
            interval={points.length > 18 ? Math.ceil(points.length / 12) : 0}
            height={32}
            tick={(props) => <LedgerAxisTick {...props} points={points} />}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            width={58}
            tick={{ fontSize: 12 }}
            tickFormatter={(value) => Number(value).toLocaleString('ko-KR')}
          />
          <ReferenceLine y={0} stroke="#64748b" strokeDasharray="4 4" />
          <Tooltip content={<LedgerChartTooltip />} cursor={{ stroke: '#94a3b8', strokeDasharray: '3 3' }} />
          <Area dataKey="running" type="monotone" baseValue={0} stroke="none" fill="#0f766e" fillOpacity={0.16} legendType="none" tooltipType="none" activeDot={false} />
          <Bar dataKey="signed" radius={[3, 3, 0, 0]} maxBarSize={22}>
            {points.map((point) => (
              <Cell
                key={point.key}
                fill={point.kind === '입고' ? '#2563eb' : '#ea580c'}
                cursor="pointer"
                onClick={() => onSelect(point.rowKey)}
              />
            ))}
          </Bar>
          <Line dataKey="running" type="monotone" stroke="var(--card)" strokeWidth={8} dot={false} activeDot={false} legendType="none" tooltipType="none" />
          <Line
            dataKey="running"
            type="monotone"
            stroke="#0f766e"
            strokeWidth={3}
            dot={(props) => <LedgerDot {...props} onSelect={onSelect} />}
            activeDot={{ r: 8, fill: '#0f766e', stroke: '#ffffff', strokeWidth: 3 }}
          >
            {points.length <= 20 && (
              <LabelList dataKey="running" content={(props) => <RunningValueLabel {...props} />} />
            )}
          </Line>
        </ComposedChart>
      </ChartContainer>
    </div>
  )
}

function LedgerAxisTick({
  x = 0,
  y = 0,
  payload,
  points,
}: {
  x?: number | string
  y?: number | string
  payload?: { value?: string | number }
  points: LedgerPoint[]
}) {
  const point = points[Number(payload?.value)]
  if (!point) return <g />
  return (
    <g transform={`translate(${x},${y})`}>
      <text textAnchor="middle" y={16} fontSize={12} className="fill-muted-foreground">
        {point.label}
      </text>
    </g>
  )
}

function LedgerDot({
  cx,
  cy,
  payload,
  onSelect,
}: {
  cx?: number
  cy?: number
  payload?: LedgerPoint
  onSelect: (key: string) => void
}) {
  if (cx == null || cy == null || !payload) return <g />
  return (
    <g style={{ cursor: 'pointer' }} onClick={() => onSelect(payload.rowKey)}>
      <circle cx={cx} cy={cy} r={8} fill="var(--card)" />
      <circle cx={cx} cy={cy} r={5.5} fill="#0f766e" stroke="#ffffff" strokeWidth={2} />
    </g>
  )
}

function RunningValueLabel({
  x,
  y,
  value,
}: {
  x?: number | string
  y?: number | string
  value?: string | number | boolean | null
}) {
  if (typeof value !== 'number' && typeof value !== 'string') return null
  const amount = Number(value)
  if (!Number.isFinite(amount) || x == null || y == null) return null
  const originX = Number(x)
  const originY = Number(y)
  const text = amount.toLocaleString('ko-KR')
  const below = amount < 0
  const labelY = below ? originY + 20 : originY - 12
  const width = Math.max(28, text.length * 7 + 10)
  return (
    <g>
      <rect
        x={originX - width / 2}
        y={labelY - 11}
        width={width}
        height={15}
        rx={4}
        fill="var(--card)"
        stroke="#0f766e"
        strokeWidth={1}
      />
      <text x={originX} y={labelY} textAnchor="middle" fontSize={10} fontWeight={700} className="fill-teal-800 dark:fill-teal-200">
        {text}
      </text>
    </g>
  )
}

function LedgerChartTooltip({
  active,
  payload,
}: {
  active?: boolean
  payload?: Array<{ payload?: LedgerPoint }>
}) {
  const point = payload?.[0]?.payload
  if (!active || !point) return null
  return (
    <div className="rounded-md border bg-popover px-3 py-2 text-sm shadow-md">
      <p className="font-semibold">{point.fullDate}</p>
      <p className={`mt-1 font-semibold ${point.kind === '입고' ? 'text-blue-700 dark:text-blue-300' : 'text-orange-700 dark:text-orange-300'}`}>
        {point.kind} {formatQuantity(point.quantity, point.unit)}
      </p>
      <p className={`mt-0.5 ${point.running < 0 ? 'font-semibold text-destructive' : 'text-teal-800 dark:text-teal-200'}`}>
        누계 {formatQuantity(point.running, point.unit)}
      </p>
    </div>
  )
}

function depletionMark(lot: { issueDate: string; quantity: number }) {
  const quantity = lot.quantity.toLocaleString('ko-KR', { maximumFractionDigits: 2 })
  return `${displayDate(lot.issueDate)} ${quantity}EA 입고분 소진`
}

const ledgerSheetClass = 'rounded-2xl border border-border bg-card shadow-[0_1px_3px_oklch(0_0_0/0.06),0_4px_12px_oklch(0_0_0/0.04)]'

function LedgerStat({ label, value, unit, warn = false }: { label: string; value: number; unit?: string; warn?: boolean }) {
  const text = Number.isFinite(value) ? value.toLocaleString('ko-KR', { maximumFractionDigits: 2 }) : '-'
  return (
    <div className={`${ledgerSheetClass} px-3 py-3`}>
      <p className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">{label}</p>
      <p className={`mt-1 text-lg font-bold leading-none tabular-nums ${warn ? 'text-destructive' : ''}`}>
        {text}
        {unit ? <span className="ml-1 text-xs font-normal text-muted-foreground">{unit}</span> : null}
      </p>
    </div>
  )
}

function QtyText({ value, unit, warn = false, className = '' }: { value: number; unit?: string; warn?: boolean; className?: string }) {
  const text = Number.isFinite(value) ? value.toLocaleString('ko-KR', { maximumFractionDigits: 2 }) : '-'
  return (
    <span className={`tabular-nums ${warn ? 'font-semibold text-destructive' : ''} ${className}`}>
      {text}
      {unit ? <span className="ml-1 text-xs font-normal text-muted-foreground">{unit}</span> : null}
    </span>
  )
}

function lotLabel(kind: '입고' | '출고', lot: string) {
  const text = lot === '-' ? '' : lot.trim()
  if (text) return text
  return kind === '입고' ? '' : '로트 없음'
}

function quantityTone(kind: '입고' | '출고') {
  return kind === '입고'
    ? 'font-semibold text-[oklch(0.42_0.19_258)] dark:text-[oklch(0.78_0.12_258)]'
    : 'font-semibold text-[oklch(0.46_0.14_55)] dark:text-[oklch(0.82_0.12_55)]'
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

function StockTable({
  loading,
  floor3,
  rows,
  onOpen,
}: {
  loading: boolean
  floor3: boolean
  rows: StockGroup[]
  onOpen: (row: StockGroup) => void
}) {
  const headers = floor3
    ? ['업체명', '품목', '층', '단위', '작업수량', '입고', '출고', '불량', '검사시료', '현 재고수량', '최종 재고수량', '최근일자']
    : ['업체명', '품목', '층', '단위', '기초', '입고', '출고', '현재고', '최근일자']
  const numericHeaders = floor3
    ? ['작업수량', '입고', '출고', '불량', '검사시료', '현 재고수량', '최종 재고수량']
    : ['기초', '입고', '출고', '현재고']
  return (
    <section className="overflow-hidden rounded-xl border bg-card shadow-sm">
      <div className="flex items-center gap-2 border-b px-5 py-4">
        <PackageCheck className="h-4 w-4 text-muted-foreground" />
        <div>
          <h2 className="text-sm font-semibold tracking-wide uppercase">{floor3 ? '재고관리 3층' : '재고 현황'}</h2>
          <p className="text-xs text-muted-foreground">
            {floor3
              ? '불량과 검사시료는 작업일보에 적습니다. 그 수량은 현 재고에서 빠지고, 작업수량은 재고에 더하지 않습니다.'
              : '날짜 범위를 지정하면 기간 전 수량은 기초재고로 잡힙니다.'}
          </p>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className={`w-full text-sm ${floor3 ? 'min-w-[1080px]' : 'min-w-[860px]'}`}>
          <thead className="bg-muted/50 text-xs text-muted-foreground">
            <tr>
              {headers.map((head) => (
                <th key={head} className={`px-4 py-3 ${numericHeaders.includes(head) ? 'text-right' : 'text-left'}`}>
                  {head}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y">
            {loading ? (
              Array.from({ length: 4 }).map((_, index) => (
                <tr key={index}>
                  {headers.map((head) => (
                    <td key={head} className="px-4 py-3"><Skeleton className="h-4 w-20" /></td>
                  ))}
                </tr>
              ))
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={headers.length} className="px-4 py-16 text-center text-muted-foreground">표시할 재고가 없습니다.</td>
              </tr>
            ) : (
              rows.map((row) => {
                const rate = defectRateText(row.defect, row.workQuantity > 0 ? row.workQuantity : row.incoming)
                return (
                  <tr
                    key={row.key}
                    className="cursor-pointer hover:bg-muted/40"
                    onClick={() => onOpen(row)}
                  >
                    <td className="px-4 py-3 font-medium">{row.company}</td>
                    <td className="px-4 py-3">{row.product}</td>
                    <td className="px-4 py-3">{row.floor ? `${row.floor}층` : '-'}</td>
                    <td className="px-4 py-3">{row.unit}</td>
                    {floor3 && <td className="px-4 py-3 text-right tabular-nums">{formatQuantity(row.workQuantity)}</td>}
                    {!floor3 && <td className="px-4 py-3 text-right tabular-nums">{formatQuantity(row.opening)}</td>}
                    <td className="px-4 py-3 text-right font-semibold tabular-nums text-blue-700 dark:text-blue-300">{formatQuantity(row.incoming)}</td>
                    <td className="px-4 py-3 text-right font-semibold tabular-nums text-orange-700 dark:text-orange-300">{formatQuantity(row.outgoing)}</td>
                    {floor3 && (
                      <>
                        <td className="px-4 py-3 text-right">
                          <div className="font-semibold tabular-nums">{formatQuantity(row.defect)}</div>
                          {rate && <div className="text-[11px] leading-4 text-muted-foreground">불량률 {rate}</div>}
                        </td>
                        <td className="px-4 py-3 text-right font-semibold tabular-nums">{formatQuantity(row.sample)}</td>
                      </>
                    )}
                    <td className={`px-4 py-3 text-right font-bold tabular-nums ${row.stock < 0 ? 'text-destructive' : ''}`}>
                      {formatQuantity(row.stock)}
                    </td>
                    {floor3 && (
                      <td className={`px-4 py-3 text-right font-bold tabular-nums ${row.finalStock < 0 ? 'text-destructive' : 'text-[oklch(0.45_0.17_162)] dark:text-[oklch(0.68_0.17_162)]'}`}>
                        {formatQuantity(row.finalStock)}
                      </td>
                    )}
                    <td className="px-4 py-3">{displayDate(row.lastDate)}</td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function MovementTable({
  loading,
  rows,
  empty,
  note,
  showQuality,
  canManage,
  editFloor,
  onEdit,
  onDelete,
  onOpenLot,
}: {
  loading: boolean
  rows: StockMovement[]
  empty: string
  note?: string
  showQuality?: boolean
  canManage?: boolean
  editFloor?: 1 | 2 | 3 | null
  onEdit?: (row: StockMovement) => void
  onDelete?: (id: string) => void
  onOpenLot?: (row: StockMovement) => void
}) {
  const canEditRow = (row: StockMovement) => Boolean(canManage) && (editFloor == null || String(editFloor) === row.floor)
  return (
    <section className="overflow-hidden rounded-xl border bg-card shadow-sm">
      {note && <p className="border-b px-5 py-3 text-xs text-muted-foreground">{note}</p>}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[800px] text-sm">
          <thead className="bg-muted/50 text-xs text-muted-foreground">
            <tr>
              {['일자', '구분', '업체명', '품목', '층', '로트', '수량', ...(showQuality ? ['불량', '검사시료'] : []), ...(canManage ? ['관리'] : [])].map((head) => (
                <th key={head} className={`px-4 py-3 ${['수량', '불량', '검사시료'].includes(head) ? 'text-right' : 'text-left'}`}>{head}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y">
            {loading ? (
              Array.from({ length: 5 }).map((_, index) => (
                <tr key={index}>
                  {Array.from({ length: (canManage ? 8 : 7) + (showQuality ? 2 : 0) }).map((__, cell) => (
                    <td key={cell} className="px-4 py-3"><Skeleton className="h-4 w-20" /></td>
                  ))}
                </tr>
              ))
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={(canManage ? 8 : 7) + (showQuality ? 2 : 0)} className="px-4 py-16 text-center text-muted-foreground">{empty}</td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr
                  key={`${row.source}-${row.id}`}
                  className={onOpenLot ? 'cursor-pointer transition-colors hover:bg-muted/70' : undefined}
                  onClick={onOpenLot ? () => onOpenLot(row) : undefined}
                >
                  <td className="px-4 py-3">{displayDate(row.issueDate)}</td>
                  <td className="px-4 py-3">
                    <KindBadge kind={row.kind} />
                  </td>
                  <td className="px-4 py-3 font-medium">{row.company}</td>
                  <td className="px-4 py-3">{row.product}</td>
                  <td className="px-4 py-3">{row.floor ? `${row.floor}층` : '-'}</td>
                  <td className="px-4 py-3">{lotLabel(row.kind, row.lot)}</td>
                  <td className={`px-4 py-3 text-right tabular-nums ${quantityTone(row.kind)}`}>{formatQuantity(row.quantity, row.unit)}</td>
                  {showQuality && (
                    <>
                      <td className="px-4 py-3 text-right">
                        <div className="font-semibold tabular-nums">{formatQuantity(row.defect)}</div>
                        {defectRateText(row.defect, row.quantity) && (
                          <div className="text-[11px] leading-4 text-muted-foreground">불량률 {defectRateText(row.defect, row.quantity)}</div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold tabular-nums">{formatQuantity(row.sample)}</td>
                    </>
                  )}
                  {canManage && (
                    <td className="px-4 py-3" onClick={(event) => event.stopPropagation()}>
                      {canEditRow(row) && (
                        <div className="flex gap-2">
                        <Button type="button" size="sm" variant="outline" onClick={() => onEdit?.(row)}>
                          <Pencil className="mr-1 h-3.5 w-3.5" /> 수정
                        </Button>
                        {row.source === 'inventory' && onDelete ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="border-destructive/40 text-destructive hover:bg-destructive/10"
                            onClick={() => onDelete(row.id)}
                          >
                            <Trash2 className="mr-1 h-3.5 w-3.5" /> 삭제
                          </Button>
                        ) : null}
                        </div>
                      )}
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-4 items-center gap-3">
      <span className="text-right text-sm font-medium">{label}</span>
      <div className="col-span-3">{children}</div>
    </div>
  )
}
