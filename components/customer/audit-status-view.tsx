'use client'

import { useEffect, useMemo, useState } from 'react'
import { ChevronDown, CircleHelp, ClipboardList, Pencil, Plus, Printer, Search, SlidersHorizontal, Trash2, X } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/components/auth/auth-context'
import { FilterChip, FilterSelect } from '@/components/shared/list-filters'
import { BAND_BUTTON, PageHeader } from '@/components/shared/page-header'
import { Button, buttonVariants } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { SearchableCombobox } from '@/components/ui/searchable-combobox'
import { buildAuthHeaders, getSession } from '@/lib/auth-client'
import { asKind, openOf, rateOf, SAMPLE_AUDIT_ROWS, statusOf, type AuditKind as Kind, type AuditRow } from '@/lib/customer-audit'
import { chosungSearch } from '@/lib/korean'
import { cn } from '@/lib/utils'

const SAMPLE_ROWS = SAMPLE_AUDIT_ROWS

const EMPTY_ROW: Omit<AuditRow, 'id'> = {
  kind: 'QSA', company: '', scope: '', auditDate: '', count: 0, done: 0, dueDate: '', closeDate: '', doneDate: '', dept: '', owner: '',
}

function display(date: string) {
  if (!date) return '—'
  return date.replace(/-/g, '.')
}

function totalOf(row: AuditRow) {
  return row.count
}

function blankCounts(row: AuditRow) {
  return totalOf(row) === 0 && row.done === 0
}

function countText(row: AuditRow, value: number) {
  return blankCounts(row) ? '—' : String(value)
}

function rateTone(rate: number) {
  if (rate >= 90) return { bar: 'bg-emerald-500', text: 'text-emerald-700 dark:text-emerald-300' }
  if (rate >= 60) return { bar: 'bg-amber-500', text: 'text-amber-700 dark:text-amber-300' }
  return { bar: 'bg-rose-500', text: 'text-rose-700 dark:text-rose-300' }
}

const STATUS_TONE: Record<string, string> = {
  종결: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-300',
  완료: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-300',
  진행: 'bg-amber-50 text-amber-700 dark:bg-amber-400/15 dark:text-amber-300',
  지연: 'bg-rose-50 text-rose-700 dark:bg-rose-400/15 dark:text-rose-300',
  예정: 'bg-[oklch(0.78_0.14_95/0.35)] text-[oklch(0.42_0.12_75)] dark:bg-[oklch(0.74_0.14_90/0.2)] dark:text-[oklch(0.86_0.12_90)]',
  미진행: 'bg-muted text-muted-foreground',
}

const STATUS_ORDER = ['진행', '지연', '종결', '예정', '미진행']

function countBy(rows: AuditRow[], pick: (row: AuditRow) => string) {
  const counts = new Map<string, number>()
  rows.forEach((row) => {
    const key = pick(row)
    if (key) counts.set(key, (counts.get(key) ?? 0) + 1)
  })
  return counts
}

function byAuditDate(a: AuditRow, b: AuditRow) {
  return (a.auditDate || '9999').localeCompare(b.auditDate || '9999') || a.company.localeCompare(b.company, 'ko')
}

export function AuditStatusView() {
  const { user } = useAuth()
  const canManage = user?.role === 'editor' || user?.role === 'admin'
  const [rows, setRows] = useState<AuditRow[]>([])
  const [sample, setSample] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [editing, setEditing] = useState<AuditRow | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [formKey, setFormKey] = useState(0)

  useEffect(() => {
    fetch('/api/customer/audits', { cache: 'no-store' })
      .then((response) => response.json())
      .then((result) => {
        if (Array.isArray(result.data)) {
          setRows(result.data.map((row: AuditRow) => ({ ...row, kind: asKind(row.kind), dept: row.dept ?? '', doneDate: row.doneDate ?? '' })))
        }
        else {
          setRows(SAMPLE_ROWS)
          setSample(true)
        }
      })
      .catch(() => toast.error('고객심사 데이터를 불러오지 못했습니다.'))
      .finally(() => setLoading(false))
  }, [])

  const [kindFilter, setKindFilter] = useState<'all' | Kind>('all')
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [companyFilter, setCompanyFilter] = useState('all')
  const [deptFilter, setDeptFilter] = useState('all')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [filtersOpen, setFiltersOpen] = useState(false)
  const activeFilterCount =
    Number(statusFilter !== 'all') + Number(companyFilter !== 'all') + Number(deptFilter !== 'all') + Number(Boolean(startDate || endDate))
  const clearFilters = () => {
    setStatusFilter('all')
    setCompanyFilter('all')
    setDeptFilter('all')
    setStartDate('')
    setEndDate('')
  }

  const statusCounts = useMemo(() => countBy(rows, statusOf), [rows])
  const companyCounts = useMemo(() => countBy(rows, (row) => row.company), [rows])
  const deptCounts = useMemo(() => countBy(rows, (row) => row.dept), [rows])
  const statusOptions = STATUS_ORDER.filter((status) => statusCounts.has(status))
  const companyOptions = [...companyCounts.keys()].sort((a, b) => a.localeCompare(b, 'ko'))
  const deptOptions = [...deptCounts.keys()].sort((a, b) => a.localeCompare(b, 'ko'))

  const filtered = useMemo(() => {
    const q = query.trim()
    return rows.filter((row) =>
      (kindFilter === 'all' || row.kind === kindFilter)
      && (statusFilter === 'all' || statusOf(row) === statusFilter)
      && (companyFilter === 'all' || row.company === companyFilter)
      && (deptFilter === 'all' || row.dept === deptFilter)
      && (!startDate || (row.auditDate && row.auditDate >= startDate))
      && (!endDate || (row.auditDate && row.auditDate <= endDate))
      && (!q || [row.company, row.scope, row.dept, row.owner].some((text) => chosungSearch(text, q))))
  }, [companyFilter, deptFilter, endDate, kindFilter, query, rows, startDate, statusFilter])
  const filterSummary = [
    kindFilter !== 'all' && kindFilter,
    statusFilter !== 'all' && statusFilter,
    companyFilter !== 'all' && companyFilter,
    deptFilter !== 'all' && deptFilter,
    (startDate || endDate) && `심사일 ${startDate ? display(startDate) : '처음'} ~ ${endDate ? display(endDate) : '끝'}`,
    query.trim() && `검색 “${query.trim()}”`,
  ].filter(Boolean).join(' · ')

  const sqa = useMemo(() => filtered.filter((row) => row.kind === 'QSA').sort(byAuditDate), [filtered])
  const spa = useMemo(() => filtered.filter((row) => row.kind === 'QPA').sort(byAuditDate), [filtered])
  const groups = [
    { kind: 'QSA' as const, caption: '품질심사', rows: sqa },
    { kind: 'QPA' as const, caption: '공정심사', rows: spa },
  ].filter((group) => group.rows.length > 0)
  const findings = filtered.reduce((sum, row) => sum + totalOf(row), 0)
  const done = filtered.reduce((sum, row) => sum + row.done, 0)
  const open = filtered.reduce((sum, row) => sum + openOf(row), 0)
  const delay = filtered.filter((row) => statusOf(row) === '지연').length
  const rate = findings ? Math.round((done / findings) * 1000) / 10 : 0
  const year = new Date().getFullYear()
  const kpis = [
    { label: '심사횟수', value: String(filtered.length), unit: '회', sub: `QSA ${sqa.length} · QPA ${spa.length}` },
    { label: '지적건수', value: String(findings), unit: '건', sub: `완료 ${done} · 미결 ${open}` },
    { label: '완료율', value: String(rate), unit: '%', sub: `완료 ${done} / ${findings}` },
    { label: '완료', value: String(done), unit: '건', sub: `미결 ${open}건` },
    { label: '지연', value: String(delay), unit: '건', sub: '조치기한 초과' },
    { label: '미결', value: String(open), unit: '건', sub: '시정조치 진행' },
  ]

  useEffect(() => {
    const fit = () => {
      const lines = filtered.length + groups.length
      const height = 230 + lines * 27
      document.documentElement.style.setProperty('--audit-print-zoom', String(Math.min(1, 740 / height)))
    }
    window.addEventListener('beforeprint', fit)
    return () => window.removeEventListener('beforeprint', fit)
  }, [filtered.length, groups.length])

  const persist = async (next: AuditRow[], detail: string) => {
    if (!user) return false
    setSaving(true)
    try {
      const response = await fetch('/api/customer/audits', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...buildAuthHeaders(user) },
        body: JSON.stringify({ rows: next, detail }),
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(result.error || '저장하지 못했습니다.')
      setRows(result.data)
      setSample(false)
      return true
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '저장하지 못했습니다.')
      return false
    } finally {
      setSaving(false)
    }
  }

  const openCreate = () => {
    setEditing(null)
    setFormKey((key) => key + 1)
    setFormOpen(true)
  }

  const openEdit = (row: AuditRow) => {
    setEditing(row)
    setFormKey((key) => key + 1)
    setFormOpen(true)
  }

  const submit = async (value: Omit<AuditRow, 'id'>) => {
    if (sample && editing) {
      setRows(rows.map((row) => (row.id === editing.id ? { ...value, id: editing.id } : row)))
      setFormOpen(false)
      return
    }
    const base = sample ? [] : rows
    const next = editing
      ? base.map((row) => (row.id === editing.id ? { ...value, id: editing.id } : row))
      : [...base, { ...value, id: crypto.randomUUID() }]
    const ok = await persist(next, `고객심사 ${editing ? '수정' : '등록'} · ${value.kind} ${value.company}`)
    if (ok) {
      toast.success(editing ? '수정했습니다.' : '등록했습니다.')
      setFormOpen(false)
    }
  }

  const remove = async (row: AuditRow) => {
    if (!window.confirm(`‘${row.company} ${row.kind}’ 심사를 삭제할까요?`)) return
    const ok = await persist(rows.filter((item) => item.id !== row.id), `고객심사 삭제 · ${row.kind} ${row.company}`)
    if (ok) toast.success('삭제했습니다.')
  }

  const editable = canManage && !sample
  const columns = canManage ? 14 : 13

  return (
    <main className="audit-print mx-auto flex w-full max-w-[1500px] flex-col gap-5 p-4 sm:p-6 print:min-h-[calc(200mm/var(--audit-print-zoom,1))] print:max-w-none print:gap-2 print:p-0 print:[zoom:var(--audit-print-zoom,1)]">
      <PageHeader
        tone="blue"
        icon={ClipboardList}
        eyebrow="CUSTOMER · 고객관리"
        title="고객심사현황"
        description="고객심사(QSA · QPA) 지적사항 관리 대시보드 · Customer Audit Status Board"
        stat={{ label: '기간', value: String(year), unit: '년', sub: `${year}.01.01 ~ ${year}.12.31` }}
        className="print:rounded-lg print:px-4 print:py-2 print:shadow-none print:[&_h1]:mt-0 print:[&_h1]:text-[17px] print:[&_p]:text-[10px] print:[&_.text-\[36px\]]:text-[22px]"
        actions={
          <div className="no-print">
            <Button variant="outline" className={BAND_BUTTON} onClick={() => window.print()}>
              <Printer className="h-4 w-4" /> 인쇄
            </Button>
          </div>
        }
      />

      {sample && !loading && (
        <p className="no-print rounded-lg border border-dashed border-[oklch(0.52_0.19_258/0.4)] bg-[oklch(0.52_0.19_258/0.06)] px-4 py-2.5 text-sm text-[oklch(0.45_0.17_258)] dark:text-[oklch(0.75_0.14_258)]">
          지금은 화면 예시입니다. 첫 심사를 <b>등록</b>하면 예시는 사라지고 실제 데이터만 남습니다.
        </p>
      )}

      <section className="audit-print-kpis grid gap-3 sm:grid-cols-2 xl:grid-cols-6 print:grid-cols-6 print:gap-2">
        {kpis.map((item) => (
          <div key={item.label} className="rounded-2xl border bg-card px-4 py-3.5 shadow-sm print:rounded-lg print:px-3 print:py-1.5 print:shadow-none">
            <p className="text-xs font-semibold text-muted-foreground print:text-[10px]">{item.label}</p>
            <p className="mt-1 text-[28px] font-extrabold leading-none tabular-nums tracking-tight print:mt-0.5 print:text-lg">
              {item.value}
              <span className="ml-0.5 text-xs font-medium text-muted-foreground print:text-[10px]">{item.unit}</span>
            </p>
            <p className="mt-1.5 truncate text-[11px] text-muted-foreground print:mt-0.5 print:text-[9px]">{item.sub}</p>
          </div>
        ))}
      </section>

      <section className="no-print">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex h-10 items-center gap-0.5 rounded-lg border bg-card p-1" role="tablist" aria-label="구분 선택">
            {(['all', 'QSA', 'QPA'] as const).map((kind) => (
              <button
                key={kind}
                type="button"
                role="tab"
                aria-selected={kindFilter === kind}
                onClick={() => setKindFilter(kind)}
                className={cn(
                  'h-full rounded-md px-3.5 text-sm font-semibold transition-colors',
                  kindFilter === kind ? 'bg-[oklch(0.52_0.19_258)] text-white shadow-sm' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
              >
                {kind === 'all' ? '전체' : kind}
                <span className={cn('ml-1 text-xs tabular-nums', kindFilter === kind ? 'text-white/75' : 'text-muted-foreground')}>
                  {kind === 'all' ? rows.length : rows.filter((row) => row.kind === kind).length}
                </span>
              </button>
            ))}
          </div>
          <label className="relative min-w-56 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="고객사, 심사명, 담당자 검색 (초성 가능)"
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
            className={cn('h-10', filtersOpen || activeFilterCount ? 'border-foreground/30 bg-muted' : 'bg-card')}
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
          <span className="hidden text-sm text-muted-foreground tabular-nums lg:inline">
            {filtered.length} / {rows.length}건 표시
          </span>
        </div>

        {filtersOpen && (
          <div className="mt-2 grid gap-3 rounded-xl border bg-card p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-5">
            <FilterSelect label="상태" value={statusFilter} onChange={setStatusFilter} allLabel="전체 상태" options={statusOptions} counts={statusCounts} />
            <FilterSelect label="고객사" value={companyFilter} onChange={setCompanyFilter} allLabel="전체 고객사" options={companyOptions} counts={companyCounts} />
            <FilterSelect label="담당부서" value={deptFilter} onChange={setDeptFilter} allLabel="전체 부서" options={deptOptions} counts={deptCounts} />
            <label className="space-y-1.5 text-sm font-medium lg:col-span-2">
              <span>심사일 범위</span>
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
            {statusFilter !== 'all' && <FilterChip label={statusFilter} onClear={() => setStatusFilter('all')} />}
            {companyFilter !== 'all' && <FilterChip label={companyFilter} onClear={() => setCompanyFilter('all')} />}
            {deptFilter !== 'all' && <FilterChip label={deptFilter} onClear={() => setDeptFilter('all')} />}
            {(startDate || endDate) && (
              <FilterChip
                label={`${startDate ? display(startDate) : '처음'} ~ ${endDate ? display(endDate) : '끝'}`}
                onClear={() => {
                  setStartDate('')
                  setEndDate('')
                }}
              />
            )}
            <button type="button" onClick={clearFilters} className="px-1.5 text-xs font-medium text-muted-foreground hover:text-foreground">
              모두 지우기
            </button>
          </div>
        )}
      </section>

      {filterSummary && (
        <p className="hidden text-[10px] text-muted-foreground print:block">조회 조건: {filterSummary}</p>
      )}

      <section className="grid gap-4 print:flex print:flex-1 print:flex-col print:gap-2">
        <AuditGroupCard
          title="고객심사 지적사항 현황"
          canManage={canManage}
          grow={(groups[0]?.rows.length ?? 0) + 2}
          action={canManage && (
            <Button size="sm" onClick={openCreate} disabled={loading || saving}>
              <Plus className="h-4 w-4" /> 등록
            </Button>
          )}
        >
          {loading ? (
            <tr><td colSpan={columns} className="px-3 py-10 text-center text-muted-foreground">불러오는 중…</td></tr>
          ) : rows.length === 0 ? (
            <tr><td colSpan={columns} className="px-3 py-10 text-center text-muted-foreground">등록된 심사가 없습니다.{canManage && ' 표 오른쪽 ‘등록’으로 추가하세요.'}</td></tr>
          ) : groups.length === 0 ? (
            <tr><td colSpan={columns} className="px-3 py-10 text-center text-muted-foreground">조건에 맞는 심사가 없습니다.</td></tr>
          ) : (
            <GroupRows {...groups[0]} editable={editable} canManage={canManage} busy={saving} onEdit={openEdit} onDelete={remove} />
          )}
        </AuditGroupCard>
        {!loading && groups.slice(1).map((group) => (
          <AuditGroupCard key={group.kind} canManage={canManage} grow={group.rows.length + 2}>
            <GroupRows {...group} editable={editable} canManage={canManage} busy={saving} onEdit={openEdit} onDelete={remove} />
          </AuditGroupCard>
        ))}
      </section>

      <AuditFormDialog
        key={formKey}
        open={formOpen}
        onOpenChange={setFormOpen}
        initial={editing}
        saving={saving}
        onSubmit={submit}
      />
    </main>
  )
}

function AuditFormDialog({ open, onOpenChange, initial, saving, onSubmit }: {
  open: boolean
  onOpenChange: (open: boolean) => void
  initial: AuditRow | null
  saving: boolean
  onSubmit: (value: Omit<AuditRow, 'id'>) => void
}) {
  const [form, setForm] = useState<Omit<AuditRow, 'id'>>(() => {
    if (!initial) return EMPTY_ROW
    const { id: _id, ...rest } = initial
    return rest
  })
  const [companies, setCompanies] = useState<string[]>([])
  const [departments, setDepartments] = useState<{ name: string; people: string[] }[]>([])
  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => setForm((current) => ({ ...current, [key]: value }))
  const count = (value: string) => Math.max(0, Math.floor(Number(value) || 0))

  useEffect(() => {
    if (!open) return
    const session = getSession()
    const headers = session ? buildAuthHeaders(session) : {}
    fetch('/api/config?name=companies', { headers, cache: 'no-store' })
      .then((response) => response.json())
      .then((result) => setCompanies(Array.isArray(result.data) ? result.data : []))
      .catch(() => setCompanies([]))
    fetch('/api/organization', { cache: 'no-store' })
      .then((response) => response.json())
      .then((result) => {
        const list = Array.isArray(result.data?.departments) ? result.data.departments : []
        setDepartments(list.map((department: { name?: string; people?: { label?: string; kind?: string }[] }) => ({
          name: department.name ?? '',
          people: (department.people ?? []).filter((person) => person.kind === 'person' && person.label).map((person) => person.label as string),
        })).filter((department: { name: string }) => department.name))
      })
      .catch(() => setDepartments([]))
  }, [open])

  const deptNames = departments.map((department) => department.name)
  const deptOptions = form.dept && !deptNames.includes(form.dept) ? [form.dept, ...deptNames] : deptNames
  const people = form.dept ? departments.find((department) => department.name === form.dept)?.people ?? [] : []
  const ownerOptions = form.owner && !people.includes(form.owner) ? [form.owner, ...people] : people

  const changeDept = (dept: string) => {
    const nextPeople = departments.find((department) => department.name === dept)?.people ?? []
    setForm((current) => ({ ...current, dept, owner: nextPeople.includes(current.owner) ? current.owner : '' }))
  }
  const open_ = Math.max(0, form.count - form.done)
  const rate = form.count ? Math.round((form.done / form.count) * 1000) / 10 : 0
  const status = statusOf({ ...form, id: 'preview' })

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    if (!form.company.trim()) {
      toast.error('고객사를 입력하세요.')
      return
    }
    if (form.done > form.count) {
      toast.error('완료 건수는 지적건수를 넘을 수 없습니다.')
      return
    }
    onSubmit({ ...form, company: form.company.trim() })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="z-[80] max-h-[92dvh] w-[min(96vw,60rem)] overflow-y-auto sm:max-w-[min(96vw,60rem)]" overlayClassName="z-[80]">
        <DialogHeader>
          <DialogTitle>{initial ? '고객심사 수정' : '고객심사 등록'}</DialogTitle>
          <DialogDescription>미결 · 완료율 · 상태는 입력값으로 자동 계산됩니다.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="grid gap-4">
          <FormSection title="심사 정보">
            <div className="grid gap-3 sm:grid-cols-[9rem_minmax(0,1fr)_minmax(0,1fr)_10rem]">
              <FormField label="구분">
                <select value={form.kind} onChange={(event) => set('kind', event.target.value as Kind)} className="h-9 w-full rounded-lg border border-input bg-background px-2.5 text-sm">
                  <option value="QSA">QSA · 품질심사</option>
                  <option value="QPA">QPA · 공정심사</option>
                </select>
              </FormField>
              <FormField label="고객사 *">
                <SearchableCombobox
                  configName="companies"
                  options={companies}
                  recentOptions={companies.slice(0, 8)}
                  value={form.company}
                  onChange={(value) => set('company', value)}
                  onOptionsChange={setCompanies}
                  placeholder="업체 검색 또는 선택"
                />
              </FormField>
              <FormField label="심사명 / 범위">
                <Input value={form.scope} onChange={(event) => set('scope', event.target.value)} placeholder="예: 품질시스템 정기심사" className="h-9" />
              </FormField>
              <FormField label="심사일">
                <Input type="date" value={form.auditDate} onChange={(event) => set('auditDate', event.target.value)} className="h-9" />
              </FormField>
            </div>
          </FormSection>

          <FormSection
            title="진행사항"
            aside={(
              <div className="flex items-center gap-3 whitespace-nowrap text-xs text-muted-foreground">
                <span>미결 <b className="text-sm text-foreground tabular-nums">{open_}</b></span>
                <span>완료율 <b className={cn('text-sm tabular-nums', rateTone(rate).text)}>{rate.toFixed(1)}%</b></span>
                <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-bold', STATUS_TONE[status])}>{status}</span>
              </div>
            )}
          >
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-[5.5rem_5.5rem_repeat(3,minmax(0,1fr))]">
              <FormField label="지적건수">
                <Input type="number" min={0} inputMode="numeric" value={form.count} onChange={(event) => set('count', count(event.target.value))} className="h-9 text-center tabular-nums" />
              </FormField>
              <FormField label="완료">
                <Input type="number" min={0} inputMode="numeric" value={form.done} onChange={(event) => set('done', count(event.target.value))} className="h-9 text-center tabular-nums" />
              </FormField>
              <FormField label="조치기한">
                <Input type="date" value={form.dueDate} onChange={(event) => set('dueDate', event.target.value)} className="h-9" />
              </FormField>
              <FormField label="종결일">
                <Input type="date" value={form.closeDate} onChange={(event) => set('closeDate', event.target.value)} className="h-9" />
              </FormField>
              <FormField label="완료일">
                <Input type="date" value={form.doneDate} onChange={(event) => set('doneDate', event.target.value)} className="h-9" />
              </FormField>
            </div>
          </FormSection>

          <FormSection title="담당">
            <div className="grid gap-3 sm:grid-cols-2">
              <FormField label="담당부서">
                <select value={form.dept} onChange={(event) => changeDept(event.target.value)} className="h-9 w-full rounded-lg border border-input bg-background px-2.5 text-sm">
                  <option value="">부서 선택</option>
                  {deptOptions.map((name) => <option key={name} value={name}>{name}</option>)}
                </select>
              </FormField>
              <FormField label="담당자">
                <select value={form.owner} onChange={(event) => set('owner', event.target.value)} disabled={!form.dept} className="h-9 w-full rounded-lg border border-input bg-background px-2.5 text-sm disabled:cursor-not-allowed disabled:opacity-60">
                  <option value="">{form.dept ? '담당자 선택' : '부서를 먼저 선택'}</option>
                  {ownerOptions.map((name) => <option key={name} value={name}>{name}</option>)}
                </select>
              </FormField>
            </div>
          </FormSection>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>취소</Button>
            <Button type="submit" disabled={saving}>{saving ? '저장 중…' : initial ? '수정' : '등록'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function FormSection({ title, aside, children }: { title: string; aside?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="grid gap-3 rounded-xl border p-3.5">
      <div className="flex min-h-6 items-center justify-between gap-3">
        <h3 className="text-xs font-bold text-muted-foreground">{title}</h3>
        {aside}
      </div>
      {children}
    </section>
  )
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  )
}

const DATA_ITEMS = [
  { item: '지적건수', formula: '직접 입력', input: '수기' },
  { item: '완료건수', formula: '직접 입력', input: '수기' },
  { item: '미결건수', formula: '지적건수 − 완료건수', input: '자동' },
  { item: '완료율(%)', formula: '완료건수 ÷ 지적건수 × 100 (소수 1자리)', input: '자동' },
  { item: '조치기한', formula: '직접 입력', input: '수기' },
  { item: '종결일', formula: '직접 입력', input: '수기' },
  { item: '완료일', formula: '직접 입력', input: '수기' },
] as const

const STATUS_RULES = [
  { status: '예정', rule: '심사일 > 기준일' },
  { status: '종결', rule: '미결 = 0 AND 종결일 입력' },
  { status: '지연', rule: '미결 > 0 AND 조치기한 < 기준일' },
  { status: '진행', rule: '미결 > 0 AND 조치기한 ≥ 기준일' },
] as const

function CriteriaHelp() {
  return (
    <Dialog>
      <DialogTrigger className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'gap-1.5')}>
        <CircleHelp className="h-3.5 w-3.5" />
        관리 기준
      </DialogTrigger>
      <DialogContent className="z-[80] max-h-[92dvh] w-[min(96vw,64rem)] overflow-y-auto py-6 sm:max-w-[min(96vw,64rem)]" overlayClassName="z-[80]">
        <DialogHeader>
          <DialogTitle className="text-lg">관리 기준</DialogTitle>
          <DialogDescription className="text-sm">고객심사(QSA · QPA) 지적사항 집계 · 상태 판정 기준입니다.</DialogDescription>
        </DialogHeader>
        <div className="grid items-stretch gap-3 md:grid-cols-2">
          <section className="min-w-0 overflow-hidden rounded-xl border">
            <h3 className="border-b bg-muted/50 px-3 py-2.5 text-[15px] font-bold">① 데이터 항목 정의 · 계산식</h3>
            <table className="w-full table-fixed text-sm">
              <colgroup>
                <col className="w-[30%]" />
                <col />
                <col className="w-16" />
              </colgroup>
              <thead className="bg-muted/30 text-xs text-muted-foreground">
                <tr>
                  <th className="px-2.5 py-2 text-left font-semibold">항목</th>
                  <th className="px-2.5 py-2 text-left font-semibold">정의 / 산식</th>
                  <th className="px-1.5 py-2 text-center font-semibold">입력</th>
                </tr>
              </thead>
              <tbody>
                {DATA_ITEMS.map((row) => (
                  <tr key={row.item} className="border-t">
                    <td className="px-2.5 py-2.5 font-semibold break-keep">{row.item}</td>
                    <td className="px-2.5 py-2.5 break-keep text-muted-foreground">{row.formula}</td>
                    <td className="px-1.5 py-2.5 text-center">
                      <span className={cn('inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-bold', row.input === '자동' ? 'bg-[oklch(0.52_0.19_258/0.12)] text-[oklch(0.45_0.17_258)]' : 'bg-muted text-muted-foreground')}>{row.input}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className="flex min-w-0 flex-col overflow-hidden rounded-xl border">
            <h3 className="border-b bg-muted/50 px-3 py-2.5 text-[15px] font-bold">② 상태 판정 (우선순위)</h3>
            <table className="w-full text-sm">
              <thead className="bg-muted/30 text-xs text-muted-foreground">
                <tr>
                  <th className="px-2.5 py-2 text-left font-semibold">상태</th>
                  <th className="px-2.5 py-2 text-left font-semibold">판정조건</th>
                </tr>
              </thead>
              <tbody>
                {STATUS_RULES.map((row) => (
                  <tr key={row.status} className="border-t">
                    <td className="px-2.5 py-2.5">
                      <span className={cn('rounded-full px-2 py-0.5 text-xs font-bold', STATUS_TONE[row.status] ?? STATUS_TONE['미진행'])}>{row.status}</span>
                    </td>
                    <td className="px-2.5 py-2.5 break-keep text-muted-foreground">{row.rule}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <ul className="mt-auto space-y-2 border-t px-3 py-3 text-sm break-keep text-muted-foreground">
              <li>완료율 단계 · <b className="text-emerald-700 dark:text-emerald-300">≥90% 녹색</b> · <b className="text-amber-700 dark:text-amber-300">60~90% 주황</b> · <b className="text-rose-700 dark:text-rose-300">&lt;60% 적색</b></li>
              <li>조치기한 <b className="text-foreground">D-7</b> 이내 미결건 → 담당자 알림</li>
            </ul>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  )
}

const AUDIT_TABLE_CLASS = 'w-full min-w-[1000px] text-center text-sm print:h-full print:min-w-0 print:[&_td]:!px-2 print:[&_td]:!py-1 print:[&_td]:!text-[12.5px] print:[&_td]:leading-tight print:[&_td]:whitespace-nowrap print:[&_th]:!px-2 print:[&_th]:!py-1.5 print:[&_th]:!text-[12px] print:[&_th]:whitespace-nowrap print:[&_span]:!text-[11.5px] print:[&_tr]:break-inside-avoid'

function AuditTableHead({ canManage }: { canManage: boolean }) {
  return (
    <thead className="border-b bg-muted/60 text-[11px] font-semibold text-muted-foreground">
      <tr>
        <th className="whitespace-nowrap px-3 py-3">구분</th>
        <th className="whitespace-nowrap px-3 py-3">고객사</th>
        <th className="whitespace-nowrap px-3 py-3">심사명 / 범위</th>
        <th className="whitespace-nowrap px-3 py-3">심사일</th>
        <th className="whitespace-nowrap px-3 py-3">지적건수</th>
        <th className="whitespace-nowrap px-2 py-3">완료</th>
        <th className="whitespace-nowrap px-2 py-3">미결</th>
        <th className="whitespace-nowrap px-2 py-3">완료율</th>
        <th className="whitespace-nowrap px-2 py-3">조치기한</th>
        <th className="whitespace-nowrap px-2 py-3">종결일</th>
        <th className="whitespace-nowrap px-2 py-3">완료일</th>
        <th className="whitespace-nowrap px-3 py-3">상태</th>
        <th className="whitespace-nowrap px-3 py-3">담당</th>
        {canManage && <th className="no-print px-3 py-3">수정</th>}
      </tr>
    </thead>
  )
}

function AuditGroupCard({ title, action, canManage, grow = 1, children }: {
  title?: string
  action?: React.ReactNode
  canManage: boolean
  /** 인쇄할 때 남는 높이를 행 수 비율로 나눠 갖는다. */
  grow?: number
  children: React.ReactNode
}) {
  return (
    <div
      className="overflow-hidden rounded-2xl border bg-card shadow-sm print:flex print:basis-0 print:flex-col print:break-inside-avoid print:rounded-lg print:shadow-none"
      style={{ flexGrow: grow }}
    >
      {title && (
        <header className="flex flex-wrap items-center justify-between gap-2 border-b px-5 py-3 print:px-3 print:py-1.5">
          <h2 className="text-sm font-bold print:text-xs">{title}</h2>
          <div className="no-print flex flex-wrap items-center gap-2">
            {action}
            <CriteriaHelp />
          </div>
        </header>
      )}
      {children && (
        <div className="overflow-x-auto print:flex-1 print:overflow-visible">
          <table className={AUDIT_TABLE_CLASS}>
            <AuditTableHead canManage={canManage} />
            <tbody>{children}</tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function GroupRows({ kind, caption, rows, editable, canManage, busy, onEdit, onDelete }: {
  kind: Kind
  caption: string
  rows: AuditRow[]
  editable: boolean
  canManage: boolean
  busy: boolean
  onEdit: (row: AuditRow) => void
  onDelete: (row: AuditRow) => void
}) {
  if (rows.length === 0) return null
  const findings = rows.reduce((sum, row) => sum + row.count, 0)
  const done = rows.reduce((sum, row) => sum + row.done, 0)
  const open = rows.reduce((sum, row) => sum + openOf(row), 0)
  const rate = findings ? Math.round((done / findings) * 1000) / 10 : 0
  const tone = kind === 'QSA'
    ? { label: 'bg-[oklch(0.48_0.16_258)] text-white', row: 'bg-[oklch(0.52_0.19_258/0.045)]', sub: 'bg-[oklch(0.52_0.19_258/0.14)]' }
    : { label: 'bg-[oklch(0.62_0.15_55)] text-white', row: 'bg-[oklch(0.74_0.14_70/0.08)]', sub: 'bg-[oklch(0.74_0.14_70/0.18)]' }
  return (
    <>
      {rows.map((row, index) => {
        const status = statusOf(row)
        const blank = blankCounts(row)
        const rateColor = rateTone(rateOf(row))
        return (
          <tr key={row.id} className={cn('border-t', tone.row)}>
            {index === 0 && (
              <td rowSpan={rows.length} className={cn('border-r px-2 text-center align-middle', tone.label)}>
                <p className="text-sm font-extrabold tracking-wide">{kind}</p>
                <p className="text-[11px] text-white/80">{caption}</p>
              </td>
            )}
            <td className="px-3 py-2.5 font-semibold">{row.company}</td>
            <td className="px-3 py-2.5 text-muted-foreground">{row.scope || '—'}</td>
            <td className="px-3 py-2.5 tabular-nums">{display(row.auditDate)}</td>
            <td className="px-2 py-2.5 font-medium tabular-nums">{countText(row, row.count)}</td>
            <td className="px-2 py-2.5 tabular-nums">{countText(row, row.done)}</td>
            <td className="px-2 py-2.5 tabular-nums">{countText(row, openOf(row))}</td>
            <td className="px-2 py-2.5">
              {blank ? <span className="text-muted-foreground">—</span> : (
                <div className="flex items-center justify-center gap-2">
                  <div className="h-1.5 w-12 overflow-hidden rounded-full bg-muted print:w-8">
                    <div className={cn('h-full rounded-full', rateColor.bar)} style={{ width: `${rateOf(row)}%` }} />
                  </div>
                  <span className={cn('font-semibold tabular-nums', rateColor.text)}>{rateOf(row).toFixed(1)}%</span>
                </div>
              )}
            </td>
            <td className={cn('px-2 py-2.5 tabular-nums', status === '지연' && 'font-semibold text-rose-600')}>{display(row.dueDate)}</td>
            <td className="px-2 py-2.5 tabular-nums">{display(row.closeDate)}</td>
            <td className="px-2 py-2.5 tabular-nums">{display(row.doneDate)}</td>
            <td className="px-3 py-2.5">
              <span className={cn('whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-bold', STATUS_TONE[status])}>{status}</span>
            </td>
            <td className="whitespace-nowrap px-3 py-2.5">{[row.dept, row.owner].filter(Boolean).join(' · ') || '—'}</td>
            {canManage && (
              <td className="no-print px-2 py-2">
                <div className="flex items-center justify-center gap-1">
                  <button type="button" onClick={() => onEdit(row)} disabled={busy} className="inline-flex items-center gap-1 rounded-md border bg-background px-2 py-1 text-[11px] font-semibold hover:bg-muted disabled:opacity-50">
                    <Pencil className="h-3.5 w-3.5" />
                    수정
                  </button>
                  {editable && (
                    <button type="button" aria-label={`${row.company} 삭제`} onClick={() => onDelete(row)} disabled={busy} className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-50">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </td>
            )}
          </tr>
        )
      })}
      <tr className={cn('border-t font-semibold', tone.sub)}>
        <td className="px-3 py-2" colSpan={4}>{kind} 소계</td>
        <td className="px-2 py-2 tabular-nums">{findings}</td>
        <td className="px-2 py-2 tabular-nums">{done}</td>
        <td className="px-2 py-2 tabular-nums">{open}</td>
        <td className="px-2 py-2">
          {findings === 0 ? <span className="text-muted-foreground">—</span> : (
            <div className="flex items-center justify-center gap-2">
              <div className="h-1.5 w-12 overflow-hidden rounded-full bg-muted print:w-8">
                <div className={cn('h-full rounded-full', rateTone(rate).bar)} style={{ width: `${rate}%` }} />
              </div>
              <span className={cn('font-semibold tabular-nums', rateTone(rate).text)}>{rate.toFixed(1)}%</span>
            </div>
          )}
        </td>
        <td colSpan={5} />
        {canManage && <td className="no-print" />}
      </tr>
    </>
  )
}
