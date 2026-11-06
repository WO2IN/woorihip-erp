'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  ArrowDown,
  ArrowUp,
  Calendar,
  ChevronDown,
  Download,
  Package,
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
import { StockDashboard } from '@/components/shipment/stock-status-board'
import { ProcessCheckRecord, ProcessTemplate } from '@/lib/process-checklist'
import { Button } from '@/components/ui/button'
import { PAGE_SHELL, PageHeader } from '@/components/shared/page-header'
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
import { getAuthHeaders, getJsonAuthHeaders } from '@/lib/auth-client'
import { formatDotDate } from '@/lib/date-utils'
import { formatDefectRate } from '@/lib/format'
import { useDataChanged } from '@/lib/data-events'
import { PdfViewerModal } from '@/components/explorer/pdf-viewer-modal'
import { Floor3WorkLog } from '@/lib/floor3-work-log'
import { DocumentMetadata } from '@/lib/types'
import {
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
import { cn } from '@/lib/utils'

type TabKey = 'flow' | 'stock' | 'in' | 'out' | 'work'

const FLOW_STAGE_LABELS: { key: FlowLot['stage']; label: string }[] = [
  { key: 'waiting', label: '입고 대기' },
  { key: 'working', label: '작업 중' },
  { key: 'ready', label: '출고 대기' },
  { key: 'done', label: '출고 완료' },
]

const STOCK_TAB_ACCENT =
  'bg-[oklch(0.58_0.20_18)] text-white shadow-sm dark:bg-[oklch(0.52_0.18_12)]'
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

function uniqueSorted(values: string[], locale = true) {
  const items = [...new Set(values.filter((item) => item && item !== '-'))]
  return locale ? items.sort((a, b) => a.localeCompare(b, 'ko')) : items.sort()
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
  const [negativeOnly, setNegativeOnly] = useState(false)
  const [unitView, setUnitView] = useState('EA')
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
  const [markedLedgerKey, setMarkedLedgerKey] = useState('')
  const [previewDoc, setPreviewDoc] = useState<DocumentMetadata | null>(null)
  const [selectedLot, setSelectedLot] = useState<StockMovement | null>(null)

  const load = useCallback(async (manual = false) => {
    if (manual) setRefreshing(true)
    else setLoading(true)
    try {
      const headers = getAuthHeaders()
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
    const logs = workLogs.filter((item) =>
      (activeFloor === 'all' || String(item.floor ?? 3) === activeFloor) &&
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
    const start = startDate.replace(/-/g, '')
    const end = endDate.replace(/-/g, '')
    return workLogs.filter((item) => {
      if (activeFloor !== 'all' && String(item.floor ?? 3) !== activeFloor) return false
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
      if (activeFloor !== 'all' && item.floor !== activeFloor) continue
      add(item.company, item.product)
    }
    for (const item of workLogs) add(item.company, item.product)
    return catalog.sort((a, b) => a.company.localeCompare(b.company, 'ko') || a.product.localeCompare(b.product, 'ko'))
  }, [activeCompany, activeFloor, activeProduct, movements, workLogs])

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
  const floor3 = activeFloor === '3'
  const unitOrder = [...units].sort((a, b) => unitRank(a) - unitRank(b) || a.localeCompare(b))
  const monthPrefix = `${new Date().getFullYear()}${String(new Date().getMonth() + 1).padStart(2, '0')}`
  const inMonth = (issueDate: string) => issueDate.replace(/\D/g, '').startsWith(monthPrefix)
  const sumByUnit = (pick: (row: StockGroup) => number) => unitOrder.map((unit) => ({
    unit,
    value: groups.filter((row) => row.unit === unit).reduce((sum, row) => sum + pick(row), 0),
  }))
  const movementByUnit = (kind: '입고' | '출고', monthOnly: boolean) => unitOrder.map((unit) => ({
    unit,
    value: filteredMovements
      .filter((item) => item.kind === kind && (item.unit || 'EA') === unit && (!monthOnly || inMonth(item.issueDate)))
      .reduce((sum, item) => sum + item.quantity, 0),
  }))
  const periodFiltered = Boolean(startDate || endDate)
  const cardIncoming = periodFiltered ? sumByUnit((row) => row.incoming) : movementByUnit('입고', true)
  const cardOutgoing = periodFiltered ? sumByUnit((row) => row.outgoing) : movementByUnit('출고', true)
  const stockLines = sumByUnit((row) => row.stock)
  const openingLines = sumByUnit((row) => row.opening)
  const negativeCount = groups.filter((row) => (floor3 ? row.finalStock : row.stock) < 0).length
  const stockRows = negativeOnly
    ? groups.filter((row) => (floor3 ? row.finalStock : row.stock) < 0)
    : groups
  const activeUnit = unitOrder.includes(unitView) ? unitView : (unitOrder[0] || '')
  const forUnit = (lines: { unit: string; value: number }[]) => {
    const line = lines.find((item) => item.unit === activeUnit)
    return line ? [line] : []
  }
  const openingLine = openingLines.find((line) => line.unit === activeUnit)
  const stockHint = periodFiltered && openingLine
    ? `기초 ${openingLine.value.toLocaleString('ko-KR', { maximumFractionDigits: 2 })} ${openingLine.unit} 포함`
    : '현재 보유 중인 재고 수량'
  const negativeForUnit = groups.filter((row) => row.unit === activeUnit && (floor3 ? row.finalStock : row.stock) < 0).length

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
  const ledgerRangeLabel = startDate || endDate
    ? `${formatDotDate(startDate, '처음')} ~ ${formatDotDate(endDate, '오늘')}`
    : selectedLedger.length
      ? `${displayDate(selectedLedger[0].issueDate)} ~ ${displayDate(selectedLedger[selectedLedger.length - 1].issueDate)}`
      : '전체 기간'

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
        headers: getJsonAuthHeaders(),
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
        headers: getJsonAuthHeaders(),
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
        headers: getJsonAuthHeaders(),
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
          headers: getJsonAuthHeaders(),
          body: JSON.stringify({ id: row.id, quantity, quantityUnit: row.unit || 'EA' }),
        })
      : await fetch('/api/documents', {
          method: 'PATCH',
          headers: getJsonAuthHeaders(),
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
          defectRate: formatDefectRate(row.defect, row.incoming) || '-',
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

  const inProgressLots = lotFlow.lots.length - stageCount('done')

  return (
    <main className={PAGE_SHELL}>
      <PageHeader
        tone="rose"
        icon={Package}
        eyebrow="STOCK · 재고 관리"
        title="재고 관리"
        description="고객 소재의 입고 → 작업 → 출고 흐름을 입고 건별로 추적합니다. 출고는 성적서 등록 시 자동 반영됩니다."
        stat={{
          label: '진행 중',
          value: String(inProgressLots),
          unit: '건',
          sub: `재고 ${groups.length.toLocaleString('ko-KR')}종 · 마이너스 ${negativeCount.toLocaleString('ko-KR')}종`,
        }}
      />

      <section className="rounded-2xl border bg-card p-3 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <nav className="flex min-w-0 flex-1 gap-1 overflow-x-auto rounded-xl bg-muted/40 p-1" aria-label="재고 관리 메뉴">
            {(
              [
                ['flow', '진행현황', inProgressLots],
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
                className={cn(
                  'shrink-0 rounded-lg px-3.5 py-2 text-sm font-semibold transition-colors',
                  tab === key ? STOCK_TAB_ACCENT : 'text-muted-foreground hover:bg-card hover:text-foreground',
                )}
              >
                {label}
                <span className={cn('ml-1.5 tabular-nums text-xs', tab === key ? 'text-white/85' : 'text-muted-foreground')}>{count}</span>
              </button>
            ))}
          </nav>
          <div className="flex shrink-0 flex-wrap items-center gap-2 lg:justify-end">
            <Button variant="outline" className="h-10 bg-background" onClick={() => void load(true)} disabled={refreshing}>
              <RefreshCw className={cn('mr-2 h-4 w-4', refreshing && 'animate-spin')} />
              새로고침
            </Button>
            <Button
              variant="outline"
              className="h-10 bg-background"
              onClick={() => void downloadExcel()}
              disabled={loading || downloading || groups.length === 0}
            >
              <Download className="mr-2 h-4 w-4" />
              <span className="sm:hidden">엑셀</span>
              <span className="hidden sm:inline">엑셀 다운로드</span>
            </Button>
            {editable && (
              <Button
                className={cn('h-10', STOCK_TAB_ACCENT)}
                onClick={() => {
                  setForm(emptyForm())
                  setFormOpen(true)
                }}
              >
                <Plus className="mr-2 h-4 w-4" />
                입고 등록
              </Button>
            )}
          </div>
        </div>
      </section>

      {(user?.role === 'viewer' || (editFloor != null && user?.role !== 'viewer')) && (
        <div className="rounded-xl border border-amber-200/80 bg-amber-50/70 px-4 py-3 text-sm text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/25 dark:text-amber-100">
          {user?.role === 'viewer' && <p>뷰어 계정은 입출고를 조회만 할 수 있습니다.</p>}
          {editFloor != null && user?.role !== 'viewer' && (
            <p>등록·수정은 {editFloor}층만 가능합니다. 다른 층 데이터는 조회만 됩니다.</p>
          )}
          <p className="mt-1 text-xs text-amber-800/90 dark:text-amber-200/80">
            입고 등록이 아직 전면 도입되지 않아 재고·진행 수치는 참고용입니다.
          </p>
        </div>
      )}

      {user?.role !== 'viewer' && editFloor == null && (
        <p className="rounded-xl border border-dashed bg-muted/30 px-4 py-2.5 text-xs text-muted-foreground">
          입고 등록이 아직 전면 도입되지 않아 재고·진행 수치는 참고용입니다. 출고는 성적서 등록 시 자동 반영됩니다.
        </p>
      )}

      <section className="rounded-2xl border bg-card p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex h-10 items-center gap-0.5 rounded-lg border bg-muted/30 p-1" role="tablist" aria-label="층 선택">
            {(['all', '1', '2', '3'] as const).map((floor) => (
              <button
                key={floor}
                type="button"
                role="tab"
                aria-selected={floorFilter === floor}
                onClick={() => setFloorFilter(floor)}
                className={cn(
                  'h-full rounded-md px-3.5 text-sm font-semibold transition-colors',
                  floorFilter === floor ? STOCK_TAB_ACCENT : 'text-muted-foreground hover:bg-card hover:text-foreground',
                )}
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
              className="h-10 w-full rounded-lg border border-input bg-background pl-9 pr-10 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
          {tab !== 'flow' && unitOrder.length > 1 && (
            <div className="flex h-10 items-center gap-1 rounded-lg border bg-muted/30 p-1">
              {unitOrder.map((unit) => (
                <button
                  key={unit}
                  type="button"
                  aria-pressed={activeUnit === unit}
                  onClick={() => setUnitView(unit)}
                  className={cn(
                    'h-8 rounded-md px-2.5 text-xs font-semibold transition-colors',
                    activeUnit === unit ? STOCK_TAB_ACCENT : 'text-muted-foreground hover:bg-card hover:text-foreground',
                  )}
                >
                  {unit}
                </button>
              ))}
            </div>
          )}
          {tab === 'stock' && negativeCount > 0 && (
            <Button
              type="button"
              variant="outline"
              className={cn('h-10', negativeOnly && 'border-rose-300 bg-rose-50 text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200')}
              onClick={() => setNegativeOnly((value) => !value)}
            >
              <TriangleAlert className="mr-2 h-4 w-4" />
              {negativeOnly ? '전체 재고' : '마이너스만'}
            </Button>
          )}
          <Button
            variant="outline"
            className={cn('h-10', filtersOpen || activeFilterCount ? 'border-foreground/30 bg-muted' : 'bg-background')}
            onClick={() => setFiltersOpen((value) => !value)}
            aria-expanded={filtersOpen}
          >
            <SlidersHorizontal className="mr-2 h-4 w-4" />
            필터
            {activeFilterCount > 0 && (
              <span className="ml-1.5 rounded-full bg-foreground px-1.5 text-[11px] font-bold text-background tabular-nums">{activeFilterCount}</span>
            )}
            <ChevronDown className={cn('ml-1.5 h-4 w-4 transition-transform', filtersOpen && 'rotate-180')} />
          </Button>
          {tab === 'stock' && (
            <span className="hidden text-sm text-muted-foreground tabular-nums lg:inline">
              {stockRows.length.toLocaleString('ko-KR')} / {groups.length.toLocaleString('ko-KR')}종
            </span>
          )}
          {tab === 'in' && (
            <span className="hidden text-sm text-muted-foreground tabular-nums lg:inline">{inbound.length.toLocaleString('ko-KR')}건</span>
          )}
          {tab === 'out' && (
            <span className="hidden text-sm text-muted-foreground tabular-nums lg:inline">{outbound.length.toLocaleString('ko-KR')}건</span>
          )}
        </div>

        {filtersOpen && (
          <div className="mt-3 grid gap-3 border-t pt-3 sm:grid-cols-2 lg:grid-cols-4">
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
          <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t pt-3">
            {companyFilter !== 'all' && <FilterChip label={companyFilter} onClear={() => setCompanyFilter('all')} />}
            {productFilter !== 'all' && <FilterChip label={productFilter} onClear={() => setProductFilter('all')} />}
            {(startDate || endDate) && (
              <FilterChip
                label={`${formatDotDate(startDate, '처음')} ~ ${formatDotDate(endDate, '오늘')}`}
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

      {tab === 'flow' && (
        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {FLOW_STAGE_LABELS.map(({ key, label }) => (
            <StockKpi key={key} label={label} lines={[{ unit: '건', value: stageCount(key) }]} hint={key === 'done' ? '최근 완료 포함' : '현재 단계 입고 건'} />
          ))}
        </section>
      )}

      {tab !== 'flow' && (
        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StockKpi label="입고" lines={forUnit(cardIncoming)} hint={periodFiltered ? '선택한 기간 입고 수량' : '이번 달 총 입고 수량'} />
          <StockKpi label="출고" lines={forUnit(cardOutgoing)} hint={periodFiltered ? '선택한 기간 출고 수량' : '이번 달 총 출고 수량'} />
          <StockKpi label="현재 재고" lines={forUnit(stockLines)} hint={stockHint} />
          <StockKpi label="재고 마이너스" lines={[{ unit: '종', value: negativeForUnit }]} hint="입고 미등록·과출고 등" warn />
        </section>
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
          workLogs={workLogs}
          onStage={(lot, stage) => void changeStage(lot, stage)}
          onOpen={setSelectedLot}
          onRegister={registerInbound}
        />
      )}
      {tab === 'stock' && (
        <StockTable
          loading={loading}
          floor3={floor3}
          rows={stockRows}
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
          checks={processChecks}
          templates={processTemplates}
          catalog={workCatalog}
          editable={activeFloor === 'all' ? editable : canEditMovement(activeFloor)}
          company={activeCompany === 'all' ? '' : activeCompany}
          product={activeProduct === 'all' ? '' : activeProduct}
          unit={workUnit}
          floor={activeFloor === '1' || activeFloor === '2' || activeFloor === '3' ? activeFloor : 'all'}
          lockedFloor={editFloor}
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
            setMarkedLedgerKey('')
          }
        }}
      >
        <DialogContent className="!z-[80] !flex !h-[92vh] !max-h-[92vh] !min-h-0 !w-[min(98vw,1480px)] !max-w-[1480px] !flex-col !gap-4 !overflow-hidden !rounded-2xl !bg-muted !p-5 !ring-0 shadow-[0_8px_40px_oklch(0_0_0/0.18)]">
          <DialogHeader className="shrink-0 gap-3 pr-8 sm:flex-row sm:items-start sm:justify-between sm:space-y-0">
            <div className="min-w-0">
              <DialogTitle className="text-xl font-bold tracking-tight">재고 현황</DialogTitle>
              <p className="mt-1 text-sm font-semibold">
                {selectedGroup?.company} · {selectedGroup?.product}
                {selectedGroup?.floor ? ` · ${selectedGroup.floor}층` : ''}
              </p>
              <DialogDescription className="mt-1">
                입고·출고 내역과 재고 추이를 한눈에 확인할 수 있습니다.
              </DialogDescription>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <div className="inline-flex items-center gap-2 rounded-lg border bg-card px-3 py-2 text-sm shadow-sm">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <span className="tabular-nums">{ledgerRangeLabel}</span>
              </div>
            {selectedGroup && canEditMovement(selectedGroup.floor) && (
              <div className="flex items-center gap-2">
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
            </div>
          </DialogHeader>
          {selectedGroup && (
            <StockDashboard
              rows={selectedLedgerView.rows}
              rangeLabel={ledgerRangeLabel}
              floor3={selectedGroup.floor === '3'}
              defect={selectedGroup.defect}
              sample={selectedGroup.sample}
              finalStock={selectedGroup.finalStock}
              onSelect={(key) => {
                setMarkedLedgerKey(key)
                requestAnimationFrame(() => scrollLedgerRow(ledgerScrollRef.current, key))
              }}
              list={
                <div ref={ledgerScrollRef} className={`${ledgerSheetClass} h-full min-h-0 overflow-y-auto`}>
                  <div data-ledger-sticky className="sticky top-0 z-10 flex items-center justify-between bg-card px-4 py-3">
                    <p className="text-sm font-semibold">최근 거래 내역</p>
                    <span className="text-xs text-muted-foreground">{selectedLedger.length}건</span>
                  </div>
                  <div className="divide-y divide-border">
                    {[...selectedLedgerView.rows].reverse().map((row) => {
                      const index = selectedLedgerView.rows.indexOf(row)
                      const earlier = selectedLedgerView.rows.slice(0, index)
                      const firstInboundAfterEarlyOut = row.kind === '입고' && earlier.some((item) => item.beforeInbound) && earlier.every((item) => item.beforeInbound)
                      const marked = ledgerKey(row) === markedLedgerKey
                      const inbound = row.kind === '입고'
                      return (
                        <div
                          key={ledgerKey(row)}
                          id={`ledger-row-${ledgerKey(row)}`}
                          role="button"
                          tabIndex={0}
                          className={`flex w-full cursor-pointer gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/30 ${marked ? 'bg-[oklch(0.52_0.19_258/0.14)] shadow-[inset_4px_0_0_0_oklch(0.52_0.19_258)]' : ''} ${firstInboundAfterEarlyOut ? 'shadow-[inset_0_2px_0_0_oklch(0.62_0.14_55)]' : ''}`}
                          onClick={() => setSelectedLot(row)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter' || event.key === ' ') setSelectedLot(row)
                          }}
                        >
                          <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${inbound ? 'bg-blue-50 text-blue-600' : 'bg-orange-50 text-orange-500'}`}>
                            {inbound ? <ArrowDown className="h-4 w-4" /> : <ArrowUp className="h-4 w-4" />}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center justify-between gap-2 text-sm text-muted-foreground">
                              <span>{displayDate(row.issueDate)}</span>
                              <span>{row.kind}</span>
                            </span>
                            {isEditMode ? (
                              <Input
                                type="number"
                                min="0"
                                step="any"
                                className="mt-1 h-8 w-28 text-right"
                                value={editedQuantities[ledgerKey(row)] ?? row.quantity}
                                onClick={(event) => event.stopPropagation()}
                                onChange={(event) =>
                                  setEditedQuantities((current) => ({
                                    ...current,
                                    [ledgerKey(row)]: Number(event.target.value),
                                  }))
                                }
                              />
                            ) : (
                              <span className={`mt-0.5 block text-base font-bold tabular-nums ${inbound ? 'text-blue-600' : 'text-orange-500'}`}>
                                {inbound ? '+' : '-'} {formatQuantity(row.quantity, row.unit)}
                              </span>
                            )}
                            <span className={`mt-0.5 block text-xs ${row.running < 0 ? 'font-semibold text-destructive' : 'text-muted-foreground'}`}>
                              거래 후 재고 {formatQuantity(row.running, row.unit)}
                              {lotLabel(row.kind, row.lot) ? ` · ${lotLabel(row.kind, row.lot)}` : ''}
                            </span>
                            {row.closedLots.map((lot) => (
                              <span key={lot.id} className="mt-1 block text-[11px] font-medium text-[oklch(0.45_0.17_162)] dark:text-[oklch(0.68_0.17_162)]">
                                {depletionMark(lot)}
                              </span>
                            ))}
                          </span>
                        </div>
                      )
                    })}
                    {selectedLedger.length === 0 && (
                      <p className="px-4 py-10 text-center text-sm text-muted-foreground">기간 내 이동이 없습니다.</p>
                    )}
                  </div>
                </div>
              }
            />
          )}
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

function unitRank(unit: string) {
  const order = ['EA', 'Kg', 'KG', 'R']
  const index = order.indexOf(unit)
  return index === -1 ? order.length : index
}


function scrollLedgerRow(scroller: HTMLDivElement | null, key: string) {
  const target = document.getElementById(`ledger-row-${key}`)
  if (!scroller || !target) return
  const stickyHeader = scroller.querySelector('[data-ledger-sticky], thead')?.getBoundingClientRect().height ?? 0
  const top = target.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop - stickyHeader
  scroller.scrollTo({ top: Math.max(0, top), behavior: 'smooth' })
}


function depletionMark(lot: { issueDate: string; quantity: number }) {
  const quantity = lot.quantity.toLocaleString('ko-KR', { maximumFractionDigits: 2 })
  return `${displayDate(lot.issueDate)} ${quantity}EA 입고분 소진`
}

const ledgerSheetClass = 'rounded-2xl border border-border bg-card shadow-[0_1px_3px_oklch(0_0_0/0.06),0_4px_12px_oklch(0_0_0/0.04)]'


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

function StockKpi({
  label,
  lines,
  hint,
  warn = false,
}: {
  label: string
  lines: { unit: string; value: number }[]
  hint: string
  warn?: boolean
}) {
  return (
    <div className="rounded-2xl border bg-card px-4 py-3.5 shadow-sm">
      <p className="text-xs font-semibold text-muted-foreground">{label}</p>
      {lines.length === 0 ? (
        <p className="mt-1 text-[28px] font-extrabold leading-none tabular-nums tracking-tight">—</p>
      ) : (
        <div className="mt-1 space-y-0.5">
          {lines.map((line) => (
            <p
              key={line.unit}
              className={cn(
                'whitespace-nowrap text-[28px] font-extrabold leading-none tabular-nums tracking-tight',
                warn && line.value > 0 && 'text-rose-600 dark:text-rose-400',
              )}
            >
              {line.value.toLocaleString('ko-KR', { maximumFractionDigits: 2 })}
              <span className="ml-0.5 text-xs font-medium text-muted-foreground">{line.unit}</span>
            </p>
          ))}
        </div>
      )}
      <p className="mt-1.5 truncate text-[11px] text-muted-foreground">{hint}</p>
    </div>
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
  const [dateOrder, setDateOrder] = useState<'desc' | 'asc'>('desc')
  const headers = floor3
    ? ['업체명', '품목', '층', '단위', '작업수량', '입고', '출고', '불량', '검사시료', '현 재고수량', '최종 재고수량', '최근일자']
    : ['업체명', '품목', '층', '단위', '기초', '입고', '출고', '현재고', '최근일자']
  const numericHeaders = floor3
    ? ['작업수량', '입고', '출고', '불량', '검사시료', '현 재고수량', '최종 재고수량']
    : ['기초', '입고', '출고', '현재고']
  const sorted = [...rows].sort((a, b) => dateOrder === 'desc' ? b.lastDate.localeCompare(a.lastDate) : a.lastDate.localeCompare(b.lastDate))
  return (
    <section className="overflow-hidden rounded-2xl border bg-card shadow-[0_1px_3px_oklch(0_0_0/0.06)]">
      <div className="flex items-center gap-2 border-b px-5 py-4">
        <PackageCheck className="h-4 w-4 text-muted-foreground" />
        <div>
          <h2 className="text-sm font-semibold">{floor3 ? '재고관리 3층' : '재고 현황'}</h2>
          <p className="text-xs text-muted-foreground">
            {floor3
              ? '불량과 검사시료는 작업일보에 적습니다. 그 수량은 현 재고에서 빠지고, 작업수량은 재고에 더하지 않습니다.'
              : '날짜 범위를 지정하면 기간 전 수량은 기초재고로 잡힙니다.'}
          </p>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className={`w-full text-sm ${floor3 ? 'min-w-[1080px]' : 'min-w-[860px]'}`}>
          <thead className="text-xs text-muted-foreground">
            <tr className="border-b">
              {headers.map((head) => (
                <th key={head} className={`whitespace-nowrap px-4 py-3 font-medium ${numericHeaders.includes(head) ? 'text-right' : 'text-left'}`}>
                  {head === '최근일자' ? (
                    <button type="button" className="inline-flex items-center gap-1 hover:text-foreground" onClick={() => setDateOrder((value) => value === 'desc' ? 'asc' : 'desc')}>
                      최근일자
                      <span aria-hidden="true">{dateOrder === 'desc' ? '↓' : '↑'}</span>
                    </button>
                  ) : head}
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
              sorted.map((row) => {
                const rate = formatDefectRate(row.defect, row.workQuantity > 0 ? row.workQuantity : row.incoming)
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
                    <td className="px-4 py-3 text-right">
                      {row.stock < 0 ? (
                        <span className="inline-flex min-w-12 justify-center rounded-full bg-rose-50 px-2 py-0.5 font-bold text-rose-600 tabular-nums dark:bg-rose-950/50 dark:text-rose-300">
                          {formatQuantity(row.stock)}
                        </span>
                      ) : (
                        <span className="font-bold tabular-nums">{formatQuantity(row.stock)}</span>
                      )}
                    </td>
                    {floor3 && (
                      <td className={`px-4 py-3 text-right font-bold tabular-nums ${row.finalStock < 0 ? 'text-destructive' : 'text-[oklch(0.45_0.17_162)] dark:text-[oklch(0.68_0.17_162)]'}`}>
                        {formatQuantity(row.finalStock)}
                      </td>
                    )}
                    <td className="whitespace-nowrap px-4 py-3">{displayDate(row.lastDate)}</td>
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
    <section className="overflow-hidden rounded-2xl border bg-card shadow-sm">
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
                        {formatDefectRate(row.defect, row.quantity) && (
                          <div className="text-[11px] leading-4 text-muted-foreground">불량률 {formatDefectRate(row.defect, row.quantity)}</div>
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
