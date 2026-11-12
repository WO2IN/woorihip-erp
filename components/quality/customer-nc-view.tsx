'use client'

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { Check, FileSpreadsheet, Pencil, Plus, Trash2 } from 'lucide-react'
import type { CustomerNcStatusFilter, CustomerNonconformity, WorkflowStatus } from '@/lib/non-conformity'
import {
  CUSTOMER_NC_DEFECT_TYPES,
  CUSTOMER_NC_RESPONSE_DAYS,
  addDaysToIsoDate,
  customerNcDefectType,
  isCustomerNcClosed,
  isCustomerNcOverdue,
  todayOccurrenceDate,
  WORKFLOW_STATUS_LABEL,
} from '@/lib/non-conformity'
import { useAuth } from '@/components/auth/auth-context'
import { getJsonAuthHeaders } from '@/lib/auth-client'
import { formatDotDate } from '@/lib/date-utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { WorkflowStatusPicker } from '@/components/quality/workflow-status-dot'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger } from '@/components/ui/select'
import { SearchableCombobox } from '@/components/ui/searchable-combobox'
import { cn } from '@/lib/utils'

const FILTER_ALL = '__all__'
const dateInputClass = 'h-7 min-w-0 border-0 bg-transparent px-0 text-[13px] shadow-none focus-visible:ring-0 [&::-webkit-calendar-picker-indicator]:ml-0'
const selectTriggerClass = 'h-7 min-h-0 w-full border-0 bg-transparent px-0 py-0 text-[13px] shadow-none focus-visible:ring-0'

const STATUS_FILTERS: { key: CustomerNcStatusFilter; label: string }[] = [
  { key: 'all', label: '전체' },
  { key: 'in_progress', label: '진행중' },
  { key: 'closed', label: '종결' },
  { key: 'overdue', label: '기한 초과' },
]

const STAGES = ['접수', '원인분석', '대책수립', '고객 회신', '유효성 확인', '종결'] as const

const STAGE_BADGE = [
  'bg-slate-100 text-slate-600',
  'bg-sky-50 text-sky-700',
  'bg-amber-50 text-amber-800',
  'bg-violet-50 text-violet-700',
  'bg-blue-50 text-blue-700',
  'bg-emerald-50 text-emerald-700',
]

const DOC_ACTIONS = ['대책서', 'CAR', '고객 회신서', '유효성 확인 기록'] as const

function yearStartIso() {
  return `${new Date().getFullYear()}-01-01`
}

function daysUntil(fromIso: string, toIso: string) {
  const from = Date.parse(`${fromIso}T12:00:00`)
  const to = Date.parse(`${toIso}T12:00:00`)
  if (!Number.isFinite(from) || !Number.isFinite(to)) return 0
  return Math.round((to - from) / 86_400_000)
}

function stageIndex(row: CustomerNonconformity) {
  if (isCustomerNcClosed(row)) return 5
  if (row.effectivenessVerification !== 'not_started') return 4
  if (row.processingResult !== 'not_started') return 3
  if (row.countermeasurePlan === 'done') return 2
  if (row.countermeasurePlan === 'in_progress') return 1
  return 0
}

function stageStatuses(index: number): Pick<CustomerNonconformity, 'countermeasurePlan' | 'processingResult' | 'effectivenessVerification'> {
  const steps: Array<[WorkflowStatus, WorkflowStatus, WorkflowStatus]> = [
    ['not_started', 'not_started', 'not_started'],
    ['in_progress', 'not_started', 'not_started'],
    ['done', 'not_started', 'not_started'],
    ['done', 'in_progress', 'not_started'],
    ['done', 'done', 'in_progress'],
    ['done', 'done', 'done'],
  ]
  const [countermeasurePlan, processingResult, effectivenessVerification] = steps[index] ?? steps[0]
  return { countermeasurePlan, processingResult, effectivenessVerification }
}

function formatQty(value: number | null | undefined) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—'
  return value.toLocaleString('ko-KR')
}

type CustomerNcForm = ReturnType<typeof emptyCustomerNcForm>

const emptyCustomerNcForm = () => ({
  occurrenceDate: todayOccurrenceDate(),
  occurrenceCompany: '',
  partNo: '',
  defectQty: '',
  defectType: '',
  description: '',
  remarks: '',
  countermeasurePlan: 'not_started' as WorkflowStatus,
  processingResult: 'not_started' as WorkflowStatus,
  effectivenessVerification: 'not_started' as WorkflowStatus,
})

function customerRowToForm(row: CustomerNonconformity): CustomerNcForm {
  return {
    occurrenceDate: row.occurrenceDate,
    occurrenceCompany: row.occurrenceCompany,
    partNo: row.partNo ?? '',
    defectQty: typeof row.defectQty === 'number' ? String(row.defectQty) : '',
    defectType: row.defectType ?? customerNcDefectType(row),
    description: row.description,
    remarks: row.remarks ?? '',
    countermeasurePlan: row.countermeasurePlan,
    processingResult: row.processingResult,
    effectivenessVerification: row.effectivenessVerification,
  }
}

function formPayload(form: CustomerNcForm) {
  return {
    ...form,
    defectQty: form.defectQty.trim() === '' ? null : Number(form.defectQty.replace(/,/g, '')),
  }
}

const API = '/api/quality/customer-nonconformities'

function sortByOccurrence(rows: CustomerNonconformity[]) {
  return [...rows].sort(
    (a, b) =>
      b.occurrenceDate.localeCompare(a.occurrenceDate) || b.createdAt.localeCompare(a.createdAt),
  )
}

export function CustomerNcView({ embedded = false }: { embedded?: boolean }) {
  void embedded
  const { user } = useAuth()
  const editable = user?.role === 'admin'
  const [rows, setRows] = useState<CustomerNonconformity[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState(emptyCustomerNcForm)
  const [editOpen, setEditOpen] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<CustomerNcForm>(emptyCustomerNcForm)
  const [pendingDelete, setPendingDelete] = useState<CustomerNonconformity | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const load = useCallback(async () => {
    const res = await fetch(API, { cache: 'no-store' })
    const json = await res.json()
    setRows(sortByOccurrence(json.data ?? []))
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    let cancelled = false
    fetch('/api/quality/kpi?catalog=1&documentsOnly=1', { cache: 'no-store' })
      .then((res) => res.json())
      .then((json) => {
        if (cancelled) return
        const companies = Array.isArray(json.catalog?.companies) ? json.catalog.companies.filter((item: unknown) => typeof item === 'string' && item.trim()) : []
        const products = json.catalog?.productsByCompany
        setCatalogCompanies(companies)
        setProductsByCompany(products && typeof products === 'object' && !Array.isArray(products) ? products : {})
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [open, editOpen])

  async function patchField(id: string, patch: Partial<CustomerNonconformity>) {
    if (!user) return
    const res = await fetch(API, {
      method: 'PATCH',
      headers: getJsonAuthHeaders(user),
      body: JSON.stringify({ id, ...patch }),
    })
    if (!res.ok) {
      toast.error('저장에 실패했습니다.')
      return
    }
    const json = await res.json()
    setRows((prev) => sortByOccurrence(prev.map((row) => (row.id === id ? json.data : row))))
  }

  async function submitNew() {
    if (!user) return
    const res = await fetch(API, {
      method: 'POST',
      headers: getJsonAuthHeaders(user),
      body: JSON.stringify(formPayload(form)),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      toast.error(err.error ?? '등록에 실패했습니다.')
      return
    }
    const json = await res.json()
    setRows((prev) => sortByOccurrence([json.data, ...prev]))
    setForm(emptyCustomerNcForm())
    setOpen(false)
    setSelectedId(json.data.id)
    toast.success('고객 부적합 항목을 등록했습니다.')
  }

  async function remove(id: string) {
    if (!user) return
    const res = await fetch(API, {
      method: 'DELETE',
      headers: getJsonAuthHeaders(user),
      body: JSON.stringify({ id }),
    })
    if (!res.ok) {
      toast.error('삭제에 실패했습니다.')
      return
    }
    setRows((prev) => prev.filter((row) => row.id !== id))
    toast.success('삭제했습니다.')
  }

  function openEdit(row: CustomerNonconformity) {
    setEditId(row.id)
    setEditForm(customerRowToForm(row))
    setEditOpen(true)
  }

  async function submitEdit() {
    if (!user || !editId) return
    const res = await fetch(API, {
      method: 'PATCH',
      headers: getJsonAuthHeaders(user),
      body: JSON.stringify({ id: editId, ...formPayload(editForm) }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      toast.error(err.error ?? '수정에 실패했습니다.')
      return
    }
    const json = await res.json()
    setRows((prev) => sortByOccurrence(prev.map((row) => (row.id === editId ? json.data : row))))
    setEditOpen(false)
    setEditId(null)
    toast.success('수정했습니다.')
  }

  const [periodFrom, setPeriodFrom] = useState(yearStartIso)
  const [periodTo, setPeriodTo] = useState(todayOccurrenceDate)
  const [companyFilter, setCompanyFilter] = useState(FILTER_ALL)
  const [defectTypeFilter, setDefectTypeFilter] = useState(FILTER_ALL)
  const [statusFilter, setStatusFilter] = useState<CustomerNcStatusFilter>('all')
  const [exporting, setExporting] = useState(false)
  const [catalogCompanies, setCatalogCompanies] = useState<string[]>([])
  const [productsByCompany, setProductsByCompany] = useState<Record<string, string[]>>({})
  const today = todayOccurrenceDate()

  const companyOptions = useMemo(
    () => [...new Set(rows.map((row) => row.occurrenceCompany.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ko')),
    [rows],
  )
  const companyChoices = useMemo(() => {
    const withProducts = new Set(
      Object.entries(productsByCompany)
        .filter(([, list]) => list.length > 0)
        .map(([key]) => key.trim()),
    )
    const seen = new Set<string>()
    const list: string[] = []
    for (const name of catalogCompanies) {
      const text = name.trim()
      if (!text || seen.has(text) || !withProducts.has(text)) continue
      seen.add(text)
      list.push(text)
    }
    for (const name of companyOptions) {
      const text = name.trim()
      if (!text || seen.has(text)) continue
      seen.add(text)
      list.push(text)
    }
    return list.sort((a, b) => a.localeCompare(b, 'ko'))
  }, [catalogCompanies, companyOptions, productsByCompany])

  const defectTypeOptions = useMemo(() => {
    const fromRows = new Set(rows.map((row) => customerNcDefectType(row)))
    const list: string[] = CUSTOMER_NC_DEFECT_TYPES.filter((type) => fromRows.has(type))
    for (const type of fromRows) {
      if (!list.includes(type)) list.push(type)
    }
    return list.length ? list : [...CUSTOMER_NC_DEFECT_TYPES]
  }, [rows])

  const codeById = useMemo(() => {
    const groups = new Map<string, CustomerNonconformity[]>()
    for (const row of rows) {
      const year = row.occurrenceDate.slice(0, 4)
      const list = groups.get(year) ?? []
      list.push(row)
      groups.set(year, list)
    }
    const map = new Map<string, string>()
    for (const [year, list] of groups) {
      const ordered = [...list].sort(
        (a, b) => a.occurrenceDate.localeCompare(b.occurrenceDate) || a.createdAt.localeCompare(b.createdAt),
      )
      const yy = year.slice(2)
      ordered.forEach((row, index) => {
        map.set(row.id, `CC-${yy}-${String(index + 1).padStart(3, '0')}`)
      })
    }
    return map
  }, [rows])

  const periodFiltered = useMemo(
    () =>
      rows.filter((row) => {
        if (periodFrom && row.occurrenceDate < periodFrom) return false
        if (periodTo && row.occurrenceDate > periodTo) return false
        if (companyFilter !== FILTER_ALL && row.occurrenceCompany !== companyFilter) return false
        if (defectTypeFilter !== FILTER_ALL && customerNcDefectType(row) !== defectTypeFilter) return false
        return true
      }),
    [rows, periodFrom, periodTo, companyFilter, defectTypeFilter],
  )

  const statusCounts = useMemo(
    () => ({
      all: periodFiltered.length,
      in_progress: periodFiltered.filter((row) => !isCustomerNcClosed(row) && !isCustomerNcOverdue(row)).length,
      closed: periodFiltered.filter((row) => isCustomerNcClosed(row)).length,
      overdue: periodFiltered.filter((row) => isCustomerNcOverdue(row)).length,
    }),
    [periodFiltered],
  )

  const visible = useMemo(
    () =>
      periodFiltered.filter((row) => {
        if (statusFilter === 'closed' && !isCustomerNcClosed(row)) return false
        if (statusFilter === 'overdue' && !isCustomerNcOverdue(row)) return false
        if (statusFilter === 'in_progress' && (isCustomerNcClosed(row) || isCustomerNcOverdue(row))) return false
        return true
      }),
    [periodFiltered, statusFilter],
  )

  useEffect(() => {
    if (selectedId && visible.some((row) => row.id === selectedId)) return
    setSelectedId(visible[0]?.id ?? null)
  }, [visible, selectedId])

  const selected = visible.find((row) => row.id === selectedId) ?? null

  const summary = useMemo(() => {
    const monthKey = today.slice(0, 7)
    const monthCount = periodFiltered.filter((row) => row.occurrenceDate.startsWith(monthKey)).length
    const qty = periodFiltered.reduce((sum, row) => sum + (typeof row.defectQty === 'number' ? row.defectQty : 0), 0)
    const hasQty = periodFiltered.some((row) => typeof row.defectQty === 'number')
    const open = periodFiltered.filter((row) => !isCustomerNcClosed(row)).length
    const closed = statusCounts.closed
    const rate = periodFiltered.length ? Math.round((closed / periodFiltered.length) * 100) : 0
    const companyCounts = new Map<string, number>()
    for (const row of periodFiltered) {
      const name = row.occurrenceCompany.trim() || '미입력'
      companyCounts.set(name, (companyCounts.get(name) ?? 0) + 1)
    }
    let topName = '—'
    let topCount = 0
    for (const [name, count] of companyCounts) {
      if (count > topCount) {
        topName = name
        topCount = count
      }
    }
    return {
      monthLabel: `${Number(monthKey.slice(5))}월 접수 ${monthCount}건`,
      qty,
      hasQty,
      open,
      closed,
      rate,
      topName,
      topCount,
    }
  }, [periodFiltered, statusCounts.closed, today])

  async function exportExcel() {
    if (!visible.length) {
      toast.error('다운로드할 항목이 없습니다.')
      return
    }
    setExporting(true)
    try {
      const { buildCustomerNcWorkbook } = await import('@/lib/customer-nc-excel')
      const sheetRows = visible.map((row) => ({
        code: codeById.get(row.id) ?? '',
        occurrenceDate: formatDotDate(row.occurrenceDate, ''),
        company: row.occurrenceCompany,
        partNo: row.partNo ?? '',
        defectType: customerNcDefectType(row),
        defectQty: (typeof row.defectQty === 'number' ? row.defectQty : '') as number | '',
        description: row.description,
        dueDate: formatDotDate(addDaysToIsoDate(row.occurrenceDate, CUSTOMER_NC_RESPONSE_DAYS), ''),
        stage: STAGES[stageIndex(row)],
        countermeasurePlan: WORKFLOW_STATUS_LABEL[row.countermeasurePlan],
        processingResult: WORKFLOW_STATUS_LABEL[row.processingResult],
        effectivenessVerification: WORKFLOW_STATUS_LABEL[row.effectivenessVerification],
        status: (isCustomerNcClosed(row) ? '종결' : isCustomerNcOverdue(row) ? '기한 초과' : '진행중') as '종결' | '기한 초과' | '진행중',
        remarks: row.remarks ?? '',
      }))
      const periodLabel = `기간 ${formatDotDate(periodFrom, '')} ~ ${formatDotDate(periodTo, '')}`
      const buffer = await buildCustomerNcWorkbook(sheetRows, new Date(), periodLabel)
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `고객부적합_${today.replace(/-/g, '')}.xlsx`
      link.click()
      URL.revokeObjectURL(url)
      toast.success('엑셀 파일을 다운로드했습니다.')
    } catch {
      toast.error('엑셀 파일 생성에 실패했습니다.')
    } finally {
      setExporting(false)
    }
  }

  const registerDialog = (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) setForm(emptyCustomerNcForm())
      }}
    >
      <DialogTrigger render={<Button variant="outline" className="h-9 shrink-0 rounded-lg bg-white px-3 dark:bg-background" />}>
        <Plus className="mr-1 h-4 w-4" />
        고객 부적합 등록
      </DialogTrigger>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>고객 부적합 등록</DialogTitle>
        </DialogHeader>
        <div className="max-h-[min(70vh,36rem)] space-y-4 overflow-y-auto pr-1">
          <CustomerNcFields
            form={form}
            setForm={setForm}
            companies={companyChoices}
            productsByCompany={productsByCompany}
            onCompaniesChange={setCatalogCompanies}
            showCountermeasure={false}
            wide
          />
          <div className="grid gap-3 rounded-lg border bg-muted/20 p-3 md:grid-cols-3">
            <WorkflowStatusPicker
              label="대책서 수립"
              value={form.countermeasurePlan}
              onChange={(countermeasurePlan) => setForm((f) => ({ ...f, countermeasurePlan }))}
            />
            <WorkflowStatusPicker
              label="처리결과"
              value={form.processingResult}
              onChange={(processingResult) => setForm((f) => ({ ...f, processingResult }))}
            />
            <WorkflowStatusPicker
              label="유효성검증"
              value={form.effectivenessVerification}
              onChange={(effectivenessVerification) => setForm((f) => ({ ...f, effectivenessVerification }))}
            />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={submitNew}>등록</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )

  const selectedCode = selected ? codeById.get(selected.id) ?? '' : ''
  const selectedDue = selected ? addDaysToIsoDate(selected.occurrenceDate, CUSTOMER_NC_RESPONSE_DAYS) : ''
  const selectedDays = selected ? daysUntil(today, selectedDue) : 0
  const selectedStage = selected ? stageIndex(selected) : 0

  return (
    <>
      <div className="space-y-3">
        <div className="flex flex-wrap items-end gap-2 rounded-xl border bg-slate-50/80 p-3 dark:bg-muted/25">
          <CustomerNcInsetField label="기준기간 (접수일)" className="w-full sm:w-[16.5rem]">
            <div className="grid w-full grid-cols-[minmax(0,1fr)_0.75rem_minmax(0,1fr)] items-center">
              <Input type="date" aria-label="접수 시작일" value={periodFrom} onChange={(e) => setPeriodFrom(e.target.value)} className={dateInputClass} />
              <span className="text-center text-xs text-slate-400">~</span>
              <Input type="date" aria-label="접수 종료일" value={periodTo} onChange={(e) => setPeriodTo(e.target.value)} className={dateInputClass} />
            </div>
          </CustomerNcInsetField>
          <CustomerNcInsetField label="고객사" className="w-full sm:w-36">
            <Select value={companyFilter} onValueChange={(value) => setCompanyFilter(value ?? FILTER_ALL)}>
              <SelectTrigger aria-label="고객사" className={selectTriggerClass}>
                <span className="truncate">{companyFilter === FILTER_ALL ? '전체' : companyFilter}</span>
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value={FILTER_ALL}>전체</SelectItem>
                  {companyOptions.map((name) => (
                    <SelectItem key={name} value={name}>{name}</SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </CustomerNcInsetField>
          <CustomerNcInsetField label="불량유형" className="w-full sm:w-36">
            <Select value={defectTypeFilter} onValueChange={(value) => setDefectTypeFilter(value ?? FILTER_ALL)}>
              <SelectTrigger aria-label="불량유형" className={selectTriggerClass}>
                <span className="truncate">{defectTypeFilter === FILTER_ALL ? '전체' : defectTypeFilter}</span>
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value={FILTER_ALL}>전체</SelectItem>
                  {defectTypeOptions.map((type) => (
                    <SelectItem key={type} value={type}>{type}</SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </CustomerNcInsetField>
          <div className="flex h-9 items-center gap-0.5 rounded-lg border border-slate-200 bg-white p-0.5 dark:border-border dark:bg-background">
            {STATUS_FILTERS.map(({ key, label }) => (
              <button
                key={key}
                type="button"
                onClick={() => setStatusFilter(key)}
                className={cn(
                  'h-7 rounded-md px-2.5 text-[12px] font-semibold whitespace-nowrap transition-colors',
                  statusFilter === key
                    ? 'bg-emerald-600 text-white'
                    : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:hover:bg-muted',
                )}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="ml-auto flex items-center gap-2">
            {editable ? registerDialog : null}
            <Button type="button" variant="outline" className="h-9 rounded-lg bg-white px-3 dark:bg-background" disabled={exporting || visible.length === 0} onClick={() => void exportExcel()}>
              <FileSpreadsheet className="mr-1.5 h-4 w-4" />
              {exporting ? '엑셀…' : '엑셀'}
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 lg:grid-cols-5">
          <SummaryCard label="고객 부적합 발생" value={String(periodFiltered.length)} unit="건" hint={summary.monthLabel} />
          <SummaryCard label="불량수량" value={summary.hasQty ? summary.qty.toLocaleString('ko-KR') : '—'} unit={summary.hasQty ? 'EA' : ''} hint="고객 불량 수량 합계" />
          <SummaryCard label="처리 중" value={String(summary.open)} unit="건" hint="미종결 · 대책·유효성 확인" tone="amber" />
          <SummaryCard label="회신기한 초과" value={String(statusCounts.overdue)} unit="건" hint={`접수 후 ${CUSTOMER_NC_RESPONSE_DAYS}일 · 미종결`} tone="rose" />
          <SummaryCard
            label="종결"
            value={String(summary.closed)}
            unit="건"
            hint={`종결율 ${summary.rate}% · 최다 ${summary.topName}${summary.topCount ? ` ${summary.topCount}건` : ''}`}
            tone="emerald"
          />
        </div>

        <div className="grid items-stretch gap-3 lg:grid-cols-[minmax(0,1.75fr)_minmax(18rem,0.78fr)]">
          <section className="flex h-full min-w-0 flex-col overflow-hidden rounded-xl border bg-card">
            <header className="flex items-baseline justify-between gap-3 border-b px-4 py-3">
              <div>
                <h3 className="text-[15px] font-bold tracking-tight">고객 부적합 대장</h3>
                <p className="mt-0.5 text-xs text-muted-foreground">{visible.length}건 · 행을 누르면 오른쪽에 상세가 열립니다</p>
              </div>
            </header>
            <div className="min-h-0 flex-1 overflow-x-auto">
              <table className="w-full min-w-[44rem] border-collapse text-center text-[13px]">
                <thead className="bg-slate-50 text-xs font-medium text-slate-500 dark:bg-muted/40">
                  <tr>
                    {['No', '접수일', '고객사', '품번', '불량유형', '불량 수량', '부적합 내용', '회신기한', '진행상태', 'D-day'].map((head) => (
                      <th key={head} className="px-2.5 py-2.5 text-center font-medium whitespace-nowrap">{head}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visible.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="px-4 py-14 text-center text-sm text-muted-foreground">
                        {loading ? '불러오는 중…' : periodFiltered.length > 0 ? '조건에 맞는 항목이 없습니다' : '등록된 항목이 없습니다'}
                      </td>
                    </tr>
                  ) : visible.map((row) => {
                    const due = addDaysToIsoDate(row.occurrenceDate, CUSTOMER_NC_RESPONSE_DAYS)
                    const closed = isCustomerNcClosed(row)
                    const days = closed ? null : daysUntil(today, due)
                    const stage = stageIndex(row)
                    const active = row.id === selectedId
                    return (
                      <tr
                        key={row.id}
                        onClick={() => setSelectedId(row.id)}
                        className={cn(
                          'cursor-pointer border-t transition-colors',
                          active ? 'bg-sky-50 dark:bg-sky-500/10' : 'hover:bg-muted/40',
                        )}
                        aria-selected={active}
                      >
                        <td className="px-2.5 py-2.5 font-semibold whitespace-nowrap text-slate-800 dark:text-foreground">{codeById.get(row.id)}</td>
                        <td className="px-2.5 py-2.5 whitespace-nowrap tabular-nums">{formatDotDate(row.occurrenceDate)}</td>
                        <td className="max-w-[8rem] truncate px-2.5 py-2.5">{row.occurrenceCompany || '—'}</td>
                        <td className="max-w-[8rem] truncate px-2.5 py-2.5 text-muted-foreground">{row.partNo || '—'}</td>
                        <td className="px-2.5 py-2.5 whitespace-nowrap">{customerNcDefectType(row)}</td>
                        <td className="px-2.5 py-2.5 text-center tabular-nums">{formatQty(row.defectQty)}</td>
                        <td className="max-w-[16rem] truncate px-2.5 py-2.5">{row.description || '—'}</td>
                        <td className={cn('px-2.5 py-2.5 whitespace-nowrap tabular-nums', days != null && days < 0 && 'font-semibold text-rose-600')}>{formatDotDate(due)}</td>
                        <td className="px-2.5 py-2.5 text-center">
                          <span className={cn('inline-flex rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap', STAGE_BADGE[stage])}>
                            {STAGES[stage]}
                          </span>
                        </td>
                        <td className={cn('px-2.5 py-2.5 whitespace-nowrap tabular-nums', days != null && days < 0 ? 'font-semibold text-rose-600' : 'text-slate-500')}>
                          {days == null ? '—' : days < 0 ? `초과 ${Math.abs(days)}일` : `${days}일`}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </section>

          <aside className="flex h-full min-w-0 flex-col rounded-xl border bg-card">
            <header className="flex items-center justify-between gap-2 border-b px-4 py-3">
              <h3 className="text-base font-bold tracking-tight">상세보기 : {selectedCode || '—'}</h3>
              {editable && selected ? (
                <div className="flex items-center">
                  <Button type="button" variant="ghost" size="icon" className="h-8 w-8" title="수정" aria-label="항목 수정" onClick={() => openEdit(selected)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-destructive" title="삭제" aria-label="항목 삭제" onClick={() => setPendingDelete(selected)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ) : null}
            </header>
            {selected ? (
              <div className="flex flex-1 flex-col gap-3 p-4">
                <StageTrack
                  current={selectedStage}
                  onSelect={editable ? (index) => { void patchField(selected.id, stageStatuses(index)) } : undefined}
                />
                <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-5 text-[13px] sm:grid-cols-3">
                  <DetailField label="고객사" value={selected.occurrenceCompany || '—'} />
                  <DetailField label="접수일" value={formatDotDate(selected.occurrenceDate)} />
                  <DetailField label="품번" value={selected.partNo || '—'} />
                  <DetailField label="불량유형" value={customerNcDefectType(selected)} />
                  <DetailField label="불량수량" value={typeof selected.defectQty === 'number' ? `${formatQty(selected.defectQty)} EA` : '—'} />
                  <DetailField
                    label="회신기한"
                    value={
                      isCustomerNcClosed(selected)
                        ? formatDotDate(selectedDue)
                        : `${formatDotDate(selectedDue)} · ${selectedDays < 0 ? `초과 ${Math.abs(selectedDays)}일` : `${selectedDays}일`}`
                    }
                  />
                </dl>
                <div className="mt-4 grid grid-cols-2 items-start gap-x-3 gap-y-1">
                  <p className="text-xs leading-4 font-medium text-muted-foreground">부적합 내용</p>
                  <p className="text-xs leading-4 font-medium text-muted-foreground">대책 · 처리내용</p>
                  <div className="h-28 overflow-auto rounded-lg border border-input bg-slate-50 px-3 py-2 text-sm leading-relaxed dark:bg-muted/40">
                    {selected.description || '—'}
                  </div>
                  <div className="h-28 overflow-auto rounded-lg border border-input bg-slate-50 px-3 py-2 text-sm leading-relaxed text-slate-700 dark:bg-muted/40 dark:text-foreground">
                    {selected.remarks?.trim() ? selected.remarks : (
                      <span className="whitespace-pre-line text-muted-foreground">{editable ? '우측 상단 수정에서 대책을\n입력하세요.' : '—'}</span>
                    )}
                  </div>
                </div>
                <div className="mt-auto grid grid-cols-4 gap-1.5">
                  {DOC_ACTIONS.map((label) => (
                    <button
                      key={label}
                      type="button"
                      onClick={() => toast.message(`${label} 양식은 아직 연결되어 있지 않습니다.`)}
                      className="rounded-md border bg-white px-2 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:bg-background"
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <p className="px-4 py-10 text-center text-sm text-muted-foreground">선택된 항목이 없습니다.</p>
            )}
          </aside>
        </div>
      </div>

      <Dialog
        open={editOpen}
        onOpenChange={(next) => {
          setEditOpen(next)
          if (!next) setEditId(null)
        }}
      >
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>고객 부적합 수정</DialogTitle>
          </DialogHeader>
          <div className="max-h-[min(70vh,36rem)] overflow-y-auto pr-1">
            <CustomerNcFields
              form={editForm}
              setForm={setEditForm}
              companies={companyChoices}
              productsByCompany={productsByCompany}
              onCompaniesChange={setCatalogCompanies}
              showCountermeasure
              wide
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>
              취소
            </Button>
            <Button onClick={submitEdit}>저장</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={pendingDelete != null} onOpenChange={(next) => { if (!next) setPendingDelete(null) }}>
        <AlertDialogContent className="sm:max-w-sm">
          <AlertDialogHeader className="w-full place-items-stretch text-left">
            <AlertDialogTitle className="text-left">고객 부적합을 삭제할까요?</AlertDialogTitle>
            {pendingDelete && (
              <dl className="grid grid-cols-[4.25rem_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-sm">
                <dt className="text-muted-foreground">접수일</dt>
                <dd className="min-w-0">{formatDotDate(pendingDelete.occurrenceDate, '')}</dd>
                <dt className="text-muted-foreground">고객사</dt>
                <dd className="min-w-0 truncate">{pendingDelete.occurrenceCompany || '—'}</dd>
                <dt className="text-muted-foreground">내용</dt>
                <dd className="min-w-0 truncate">{pendingDelete.description || '—'}</dd>
              </dl>
            )}
            <AlertDialogDescription className="text-left text-pretty">
              삭제한 뒤에는 되돌릴 수 없습니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => pendingDelete && remove(pendingDelete.id)}>삭제</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

function SummaryCard({
  label,
  value,
  unit,
  hint,
  tone,
}: {
  label: string
  value: string
  unit?: string
  hint: string
  tone?: 'amber' | 'rose' | 'emerald'
}) {
  const valueClass = tone === 'rose' ? 'text-rose-600' : tone === 'amber' ? 'text-amber-600' : tone === 'emerald' ? 'text-emerald-700' : 'text-slate-900 dark:text-foreground'
  return (
    <div className="rounded-xl border bg-card px-3.5 py-3">
      <p className="text-[11px] font-medium text-slate-500">{label}</p>
      <p className={cn('mt-1 text-[1.65rem] font-bold leading-none tracking-tight tabular-nums', valueClass)}>
        {value}
        {unit ? <span className="ml-1 text-sm font-semibold text-slate-400">{unit}</span> : null}
      </p>
      <p className="mt-1.5 truncate text-[11px] text-muted-foreground" title={hint}>{hint}</p>
    </div>
  )
}

function StageTrack({ current, onSelect }: { current: number; onSelect?: (index: number) => void }) {
  return (
    <div className="flex px-1" role="group" aria-label="진행 단계">
      {STAGES.map((label, index) => {
        const done = index < current
        const active = index === current
        const reached = index <= current
        return (
          <button
            key={label}
            type="button"
            disabled={!onSelect}
            aria-pressed={active}
            onClick={() => onSelect?.(index)}
            className={cn('flex min-w-0 flex-1 flex-col items-center border-0 bg-transparent p-0', onSelect ? 'cursor-pointer' : 'disabled:opacity-100')}
          >
            <span className="flex h-7 w-full items-center">
              <span className={cn('h-0.5 flex-1 rounded-full', index === 0 ? 'bg-transparent' : reached ? 'bg-emerald-500' : 'bg-slate-200 dark:bg-muted')} />
              <span
                className={cn(
                  'relative z-10 flex shrink-0 items-center justify-center rounded-full border-2',
                  active ? 'size-6 border-emerald-500 bg-emerald-500' : 'size-4',
                  done && 'border-emerald-500 bg-emerald-500',
                  !done && !active && 'border-slate-300 bg-white dark:border-muted-foreground/40 dark:bg-background',
                )}
                aria-hidden
              >
                {active ? <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-75" /> : null}
                {done ? <Check className="relative size-2.5 text-white" strokeWidth={3} /> : null}
              </span>
              <span className={cn('h-0.5 flex-1 rounded-full', index === STAGES.length - 1 ? 'bg-transparent' : done ? 'bg-emerald-500' : 'bg-slate-200 dark:bg-muted')} />
            </span>
            <span className={cn(
              'mt-1.5 w-full text-center text-xs leading-tight font-semibold',
              active ? 'text-emerald-700 dark:text-emerald-300' : done ? 'text-slate-700 dark:text-foreground' : 'text-slate-400',
              onSelect && !active && 'hover:text-emerald-700',
            )}>
              {label}
            </span>
          </button>
        )
      })}
    </div>
  )
}

function DetailField({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="truncate font-medium">{value}</dd>
    </div>
  )
}

function CustomerNcInsetField({ label, className, children }: { label: string; className?: string; children: ReactNode }) {
  return (
    <div className={cn('flex h-[3.25rem] min-w-0 flex-col justify-center rounded-lg border border-slate-200 bg-white px-3 dark:border-border dark:bg-background', className)}>
      <p className="mb-0.5 text-[10px] font-medium leading-none text-slate-400">{label}</p>
      <div className="flex h-7 items-center">{children}</div>
    </div>
  )
}

function productsForCompany(productsByCompany: Record<string, string[]>, company: string) {
  const name = company.trim().replace(/\s+/g, ' ')
  if (!name) return []
  const key = Object.keys(productsByCompany).find((item) => item.trim().replace(/\s+/g, ' ') === name)
  const list = key ? productsByCompany[key] : []
  return [...new Set(list.map((item) => item.trim()).filter(Boolean))]
}

function CustomerNcFields({
  form,
  setForm,
  companies,
  productsByCompany,
  onCompaniesChange,
  wide = false,
  showCountermeasure = true,
}: {
  form: CustomerNcForm
  setForm: React.Dispatch<React.SetStateAction<CustomerNcForm>>
  companies: string[]
  productsByCompany: Record<string, string[]>
  onCompaniesChange: (next: string[]) => void
  wide?: boolean
  showCountermeasure?: boolean
}) {
  const companyProducts = productsForCompany(productsByCompany, form.occurrenceCompany)
  const fieldLabel = 'text-xs font-medium text-slate-500'
  const noteClass = 'h-28 min-h-28 resize-none overflow-auto leading-relaxed'
  return (
    <div className="space-y-4">
      <div className={cn('grid gap-3', wide ? 'sm:grid-cols-3' : 'grid-cols-1')}>
        <label className="block space-y-1.5">
          <span className={fieldLabel}>접수일</span>
          <Input type="date" value={form.occurrenceDate} onChange={(e) => setForm((f) => ({ ...f, occurrenceDate: e.target.value }))} />
        </label>
        <label className="block space-y-1.5">
          <span className={fieldLabel}>불량수량</span>
          <Input inputMode="decimal" placeholder="EA" value={form.defectQty} onChange={(e) => setForm((f) => ({ ...f, defectQty: e.target.value }))} />
        </label>
        <label className="block space-y-1.5">
          <span className={fieldLabel}>불량유형</span>
          <Select
            value={form.defectType || FILTER_ALL}
            onValueChange={(defectType) => setForm((f) => ({ ...f, defectType: !defectType || defectType === FILTER_ALL ? '' : defectType }))}
          >
            <SelectTrigger className="w-full">
              {form.defectType || '선택'}
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value={FILTER_ALL}>선택</SelectItem>
                {CUSTOMER_NC_DEFECT_TYPES.map((type) => (
                  <SelectItem key={type} value={type}>{type}</SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </label>
      </div>
      <div className={cn('grid gap-3', wide && 'sm:grid-cols-2')}>
        <div className="space-y-1.5">
          <p className={fieldLabel}>고객사</p>
          <SearchableCombobox
            appearance="form"
            configName="companies"
            options={companies}
            recentOptions={companies.slice(0, 5)}
            listAll
            value={form.occurrenceCompany}
            onChange={(occurrenceCompany) => setForm((f) => {
              const parts = productsForCompany(productsByCompany, occurrenceCompany)
              return { ...f, occurrenceCompany, partNo: parts.includes(f.partNo) ? f.partNo : '' }
            })}
            onOptionsChange={onCompaniesChange}
            placeholder="고객사 검색"
          />
        </div>
        <div className="space-y-1.5">
          <p className={fieldLabel}>품번</p>
          <SearchableCombobox
            key={form.occurrenceCompany.trim() || 'part'}
            appearance="form"
            configName="products"
            options={companyProducts}
            listAll
            creatable={false}
            clearable
            disabled={!form.occurrenceCompany.trim()}
            value={form.partNo}
            onChange={(partNo) => setForm((f) => ({ ...f, partNo }))}
            placeholder={form.occurrenceCompany.trim() ? (companyProducts.length ? `${form.occurrenceCompany.trim()} 품번` : '성적서·입고에 품번 없음') : '고객사를 먼저 선택'}
            listCaption={form.occurrenceCompany.trim() ? `${form.occurrenceCompany.trim()} 품번 ${companyProducts.length}개` : undefined}
          />
        </div>
      </div>
      <div className={cn('grid gap-3', wide && showCountermeasure && 'sm:grid-cols-2')}>
        <label className="block space-y-1.5">
          <span className={fieldLabel}>부적합 내용</span>
          <Textarea
            placeholder="어떤 부적합인지"
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            style={{ fieldSizing: 'fixed' }}
            className={noteClass}
          />
        </label>
        {showCountermeasure ? (
          <label className="block space-y-1.5">
            <span className={fieldLabel}>대책 입력</span>
            <Textarea
              placeholder="처리 내용, 반품·회신 등 대책"
              value={form.remarks}
              onChange={(e) => setForm((f) => ({ ...f, remarks: e.target.value }))}
              style={{ fieldSizing: 'fixed' }}
              className={noteClass}
            />
          </label>
        ) : null}
      </div>
    </div>
  )
}
