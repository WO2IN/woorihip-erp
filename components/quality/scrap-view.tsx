'use client'

import { useEffect, useMemo, useState } from 'react'
import { Check, ChevronDown, Download, FileText, Pencil, Plus, Recycle, RotateCcw, Search, Table2, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useAuth } from '@/components/auth/auth-context'
import { PAGE_SHELL, PageHeader } from '@/components/shared/page-header'
import { SectionTabs } from '@/components/shared/section-tabs'
import { SearchableCombobox } from '@/components/ui/searchable-combobox'
import { getJsonAuthHeaders } from '@/lib/auth-client'
import { cn } from '@/lib/utils'

const CATEGORIES = ['전체', '원자재', '반제품', '완제품', '부자재', '기타'] as const
const KINDS = ['원자재', '반제품', '완제품', '부자재', '기타'] as const
const STATUSES = ['등록', '검토중', '승인대기', '폐기승인'] as const
const TITLES = ['회장', '부회장', '대표이사', '대표', '사장', '부사장', '전무이사', '전무', '상무이사', '상무', '이사', '실장', '본부장', '공장장', '팀장', '부장', '차장', '과장', '계장', '대리', '주임', '사원', '반장', '조장']

type Category = (typeof CATEGORIES)[number]
type Kind = (typeof KINDS)[number]
type Status = (typeof STATUSES)[number]

type ScrapItem = {
  id: string
  no: string
  registeredOn: string
  kind: Kind
  company: string
  department: string
  name: string
  lotNo: string
  qty: string
  reason: string
  location: string
  owner: string
  status: Status
}

type CatalogLink = { company: string; product: string }
type OrgSeat = { name: string; department: string; rank: number; order: number }

const STATUS_TONE: Record<Status, string> = {
  등록: 'bg-slate-100 text-slate-700',
  검토중: 'bg-sky-50 text-sky-700',
  승인대기: 'bg-orange-50 text-orange-700',
  폐기승인: 'bg-emerald-50 text-emerald-700',
}

const KIND_TONE: Record<Kind, { dot: string; chip: string; tile: string; ring: string }> = {
  원자재: { dot: 'bg-sky-500', chip: 'bg-sky-50 text-sky-700', tile: 'bg-sky-50 text-sky-800', ring: 'ring-sky-400' },
  반제품: { dot: 'bg-amber-500', chip: 'bg-amber-50 text-amber-800', tile: 'bg-amber-50 text-amber-900', ring: 'ring-amber-400' },
  완제품: { dot: 'bg-emerald-500', chip: 'bg-emerald-50 text-emerald-800', tile: 'bg-emerald-50 text-emerald-800', ring: 'ring-emerald-500' },
  부자재: { dot: 'bg-violet-500', chip: 'bg-violet-50 text-violet-800', tile: 'bg-violet-50 text-violet-800', ring: 'ring-violet-400' },
  기타: { dot: 'bg-slate-400', chip: 'bg-slate-100 text-slate-700', tile: 'bg-slate-100 text-slate-800', ring: 'ring-slate-400' },
}

const SUMMARY = [
  { status: '등록' as const, label: '폐기대상 등록', hint: '현재 관리대장 등록 건수', tone: 'text-slate-900' },
  { status: '검토중' as const, label: '검토 중', hint: '판정 및 조치 검토', tone: 'text-sky-600' },
  { status: '승인대기' as const, label: '승인대기', hint: '내부 승인 검토 필요', tone: 'text-orange-500' },
  { status: '폐기승인' as const, label: '폐기승인', hint: '관리상태상 승인된 대상', tone: 'text-emerald-600' },
]

const fieldClass = 'h-9 rounded-lg border-slate-200 bg-white text-sm'

function todayIso() {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${month}-${day}`
}

function emptyForm(kind: Kind): Omit<ScrapItem, 'id' | 'no'> {
  return {
    registeredOn: todayIso(),
    kind,
    company: '',
    department: '',
    name: '',
    lotNo: '',
    qty: '',
    reason: '',
    location: '',
    owner: '',
    status: '등록',
  }
}

function uniqueSorted(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ko'))
}

function personName(label: string) {
  const parts = label.trim().split(/\s+/)
  if (parts.length > 1 && TITLES.includes(parts[0])) return parts.slice(1).join(' ')
  return label.trim()
}

function titleRank(label: string) {
  const title = label.trim().split(/\s+/)[0] ?? ''
  const index = TITLES.indexOf(title)
  return index < 0 ? TITLES.length : index
}

function seatsFromOrg(data: unknown): OrgSeat[] {
  if (!data || typeof data !== 'object') return []
  const record = data as { executive?: { people?: unknown }; departments?: unknown }
  const seats: OrgSeat[] = []
  let order = 0
  const add = (label: string, department: string) => {
    seats.push({ name: personName(label), department, rank: titleRank(label), order })
    order += 1
  }
  const executives = Array.isArray(record.executive?.people) ? record.executive.people : []
  for (const person of executives) {
    if (!person || typeof person !== 'object') continue
    const label = typeof (person as { label?: unknown }).label === 'string' ? (person as { label: string }).label.trim() : ''
    if ((person as { kind?: unknown }).kind !== 'person' || !label) continue
    add(label, '임원')
  }
  const departments = Array.isArray(record.departments) ? record.departments : []
  for (const department of departments) {
    if (!department || typeof department !== 'object') continue
    const dept = typeof (department as { name?: unknown }).name === 'string' ? (department as { name: string }).name.trim() : ''
    const people = (department as { people?: unknown }).people
    if (!dept || !Array.isArray(people)) continue
    for (const person of people) {
      if (!person || typeof person !== 'object') continue
      const label = typeof (person as { label?: unknown }).label === 'string' ? (person as { label: string }).label.trim() : ''
      if ((person as { kind?: unknown }).kind !== 'person' || !label) continue
      add(label, dept)
    }
  }
  return seats
}

function nextNo(rows: ScrapItem[], date: string) {
  const stamp = date.replaceAll('-', '')
  const prefix = `WP-${stamp}-`
  const seq = rows.filter((row) => row.no.startsWith(prefix)).length + 1
  return `${prefix}${String(seq).padStart(3, '0')}`
}

export function ScrapView() {
  const { user } = useAuth()
  const [rows, setRows] = useState<ScrapItem[]>([])
  const [ready, setReady] = useState(false)
  const [category, setCategory] = useState<Category>('전체')
  const [status, setStatus] = useState<Status | '전체'>('전체')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [department, setDepartment] = useState('전체')
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [pendingDelete, setPendingDelete] = useState<ScrapItem | null>(null)
  const [form, setForm] = useState(() => emptyForm('원자재'))
  const [links, setLinks] = useState<CatalogLink[]>([])
  const [seats, setSeats] = useState<OrgSeat[]>([])

  useEffect(() => {
    let stop = false
    fetch('/api/quality/scrap', { cache: 'no-store' })
      .then((response) => response.json())
      .then((result) => {
        if (stop) return
        setRows(Array.isArray(result.data) ? result.data : [])
      })
      .catch(() => {
        if (!stop) toast.error('폐기품 대장을 불러오지 못했습니다.')
      })
      .finally(() => {
        if (!stop) setReady(true)
      })
    return () => { stop = true }
  }, [])

  useEffect(() => {
    let stop = false
    Promise.all([
      fetch('/api/plating-info', { cache: 'no-store' }).then((response) => response.json()).catch(() => null),
      fetch('/api/organization', { cache: 'no-store' }).then((response) => response.json()).catch(() => null),
    ]).then(([plating, organization]) => {
      if (stop) return
      const rows = Array.isArray(plating?.rows) ? plating.rows as Partial<CatalogLink>[] : []
      setLinks(rows.flatMap((row) => {
        const company = row.company?.trim() || ''
        const product = row.product?.trim() || ''
        return company && product ? [{ company, product }] : []
      }))
      setSeats(seatsFromOrg(organization?.data))
    })
    return () => { stop = true }
  }, [])

  const companies = useMemo(() => {
    const names = form.name
      ? links.filter((row) => row.product === form.name).map((row) => row.company)
      : links.map((row) => row.company)
    return uniqueSorted(names)
  }, [links, form.name])
  const products = useMemo(() => {
    const names = form.company
      ? links.filter((row) => row.company === form.company).map((row) => row.product)
      : links.map((row) => row.product)
    return uniqueSorted(names)
  }, [links, form.company])
  const departments = useMemo(() => {
    const names: string[] = []
    for (const seat of seats) {
      if (seat.department !== '임원' && !names.includes(seat.department)) names.push(seat.department)
    }
    const rest = names.filter((name) => name !== '품질관리부')
    const ordered = names.includes('품질관리부') ? ['품질관리부', ...rest] : rest
    if (seats.some((seat) => seat.department === '임원')) ordered.push('임원')
    return ordered
  }, [seats])
  const owners = useMemo(() => {
    const list = (form.department ? seats.filter((seat) => seat.department === form.department) : seats)
      .slice()
      .sort((a, b) => a.rank - b.rank || a.order - b.order)
    const names: string[] = []
    for (const seat of list) {
      if (!names.includes(seat.name)) names.push(seat.name)
    }
    return names
  }, [seats, form.department])

  const scoped = useMemo(() => {
    const keyword = query.trim().toLowerCase()
    return rows.filter((row) => {
      if (category !== '전체' && row.kind !== category) return false
      if (department !== '전체' && row.department !== department) return false
      if (from && row.registeredOn < from) return false
      if (to && row.registeredOn > to) return false
      if (!keyword) return true
      return [row.no, row.company, row.name, row.lotNo, row.owner, row.reason, row.location].some((value) => value.toLowerCase().includes(keyword))
    })
  }, [rows, category, department, from, to, query])

  const visible = status === '전체' ? scoped : scoped.filter((row) => row.status === status)
  const counts = Object.fromEntries(STATUSES.map((item) => [item, scoped.filter((row) => row.status === item).length])) as Record<Status, number>

  function resetFilters() {
    setFrom('')
    setTo('')
    setDepartment('전체')
    setStatus('전체')
    setQuery('')
  }

  function openRegister() {
    setEditingId(null)
    setForm(emptyForm(category === '전체' ? '원자재' : category))
    setOpen(true)
  }

  function openEdit(row: ScrapItem) {
    setEditingId(row.id)
    setForm({
      registeredOn: row.registeredOn,
      kind: row.kind,
      company: row.company,
      department: row.department,
      name: row.name,
      lotNo: row.lotNo,
      qty: row.qty,
      reason: row.reason,
      location: row.location,
      owner: row.owner,
      status: row.status,
    })
    setOpen(true)
  }

  async function persist(next: ScrapItem[], success?: string) {
    if (!user) {
      toast.error('로그인이 필요합니다.')
      return false
    }
    try {
      const response = await fetch('/api/quality/scrap', {
        method: 'PUT',
        headers: getJsonAuthHeaders(user),
        body: JSON.stringify({ rows: next }),
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(typeof result.error === 'string' ? result.error : '저장하지 못했습니다.')
      setRows(Array.isArray(result.data) ? result.data : next)
      if (success) toast.success(success)
      return true
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '저장하지 못했습니다.')
      return false
    }
  }

  async function save() {
    if (!form.company.trim() || !form.name.trim() || !form.reason.trim()) {
      toast.error('업체명, 품명, 폐기사유를 입력합니다.')
      return
    }
    const trimmed = { ...form, company: form.company.trim(), name: form.name.trim(), reason: form.reason.trim() }
    const next = editingId
      ? rows.map((row) => row.id === editingId ? { ...row, ...trimmed } : row)
      : [{ ...trimmed, id: crypto.randomUUID(), no: nextNo(rows, form.registeredOn) }, ...rows]
    const saved = await persist(next, editingId ? '폐기 대상을 수정했습니다.' : '폐기 대상을 등록했습니다.')
    if (saved) setOpen(false)
  }

  async function remove(id: string) {
    const saved = await persist(rows.filter((row) => row.id !== id), '폐기 대상을 삭제했습니다.')
    if (saved) setPendingDelete(null)
  }

  function exportCsv() {
    if (visible.length === 0) {
      toast.error('내보낼 폐기 대상이 없습니다.')
      return
    }
    const header = ['No', '관리번호', '등록일', '등록구분', '업체명', '발생부서', '품명/모델명', 'LOT번호', '수량', '폐기사유', '보관위치', '담당자', '관리상태']
    const body = visible.map((row, index) => [
      index + 1, row.no, row.registeredOn, row.kind, row.company, row.department, row.name, row.lotNo, row.qty, row.reason, row.location, row.owner, row.status,
    ])
    const csv = [header, ...body].map((line) => line.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(',')).join('\n')
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = `폐기품_${todayIso().replaceAll('-', '')}.csv`
    link.click()
    URL.revokeObjectURL(link.href)
  }

  function printLedger() {
    if (visible.length === 0) {
      toast.error('인쇄할 폐기 대상이 없습니다.')
      return
    }
    window.print()
  }

  return (
    <main className={PAGE_SHELL}>
      <PageHeader
        tone="green"
        icon={Recycle}
        eyebrow="QUALITY · 품질관리"
        title="폐기품 관리"
        description="폐기 대상의 등록, 검토, 승인 상태를 관리대장으로 기록합니다."
      />
      <SectionTabs
        className="no-print"
        label="폐기품 구분"
        items={CATEGORIES.map((item) => ({ key: item, label: item }))}
        value={category}
        onChange={setCategory}
        actions={
          <>
          <Button type="button" variant="outline" className="h-9 bg-white" onClick={exportCsv}>
            <Download className="size-4" /> CSV 내보내기
          </Button>
          <Button type="button" variant="outline" className="h-9 bg-white" onClick={printLedger}>
            <FileText className="size-4" /> 대장 인쇄
          </Button>
          <Button type="button" className="h-9 bg-emerald-700 text-white hover:bg-emerald-800" onClick={openRegister}>
            <Plus className="size-4" /> 폐기품 등록
          </Button>
          </>
        }
      />

      <div className="no-print flex flex-wrap gap-2">
        <StatusChip label="전체" count={scoped.length} active={status === '전체'} onClick={() => setStatus('전체')} />
        {STATUSES.map((item) => (
          <StatusChip key={item} label={item} count={counts[item]} active={status === item} onClick={() => setStatus(item)} />
        ))}
      </div>

      <section className="no-print rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
        <div className="grid gap-3 lg:grid-cols-[1fr_1fr_0.8fr_0.8fr_1.4fr_auto] lg:items-end">
          <label className="flex flex-col gap-1.5 text-xs font-medium text-slate-500">
            등록기간 (시작일)
            <Input type="date" value={from} onChange={(event) => setFrom(event.target.value)} className={fieldClass} />
          </label>
          <label className="flex flex-col gap-1.5 text-xs font-medium text-slate-500">
            등록기간 (종료일)
            <Input type="date" value={to} onChange={(event) => setTo(event.target.value)} className={fieldClass} />
          </label>
          <label className="flex flex-col gap-1.5 text-xs font-medium text-slate-500">
            발생부서
            <PrettySelect value={department} options={['전체', ...departments]} onChange={setDepartment} />
          </label>
          <label className="flex flex-col gap-1.5 text-xs font-medium text-slate-500">
            관리상태
            <PrettySelect value={status} options={['전체', ...STATUSES]} onChange={(value) => setStatus(value as Status | '전체')} />
          </label>
          <label className="flex flex-col gap-1.5 text-xs font-medium text-slate-500">
            통합 검색
            <span className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-slate-400" />
              <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="관리번호 · 품명 · 모델명 · LOT · 담당자" className={cn(fieldClass, 'pl-8')} />
            </span>
          </label>
          <Button type="button" variant="outline" className="h-9" onClick={resetFilters}>
            <RotateCcw className="size-4" /> 초기화
          </Button>
        </div>
      </section>

      <section className="no-print grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {SUMMARY.map((item) => (
          <article key={item.status} className="rounded-2xl border border-slate-200/80 bg-white px-5 py-4 shadow-sm">
            <p className="text-sm font-medium text-slate-500">{item.label}</p>
            <p className={cn('mt-2 text-3xl font-bold tabular-nums', item.tone)}>
              {counts[item.status]} <span className="text-base font-semibold">건</span>
            </p>
            <p className="mt-1 text-xs text-slate-400">{item.hint}</p>
          </article>
        ))}
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
        <div className="flex items-start justify-between gap-3 border-b px-5 py-4">
          <div>
            <h2 className="text-base font-bold text-slate-900">폐기품 관리대장</h2>
            <p className="mt-1 text-xs text-slate-400">폐기품 등록으로 신규 대장을 작성합니다.</p>
          </div>
          <p className="text-sm font-semibold text-emerald-700">조회 {visible.length}건</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b bg-slate-50 text-xs font-semibold text-slate-500">
                {['No', '관리번호', '등록일', '등록구분', '품명 / 모델명', 'LOT번호', '수량', '폐기사유', '보관위치', '관리상태'].map((head) => (
                  <th key={head} className="px-3 py-2.5 whitespace-nowrap">{head}</th>
                ))}
                <th className="no-print px-3 py-2.5 whitespace-nowrap">관리</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((row, index) => (
                <tr key={row.id} className="border-b last:border-b-0">
                  <td className="px-3 py-3 text-slate-400">{index + 1}</td>
                  <td className="px-3 py-3 font-medium text-slate-800">{row.no}</td>
                  <td className="px-3 py-3 whitespace-nowrap">{row.registeredOn}</td>
                  <td className="px-3 py-3">
                    <KindBadge kind={row.kind} />
                  </td>
                  <td className="px-3 py-3">
                    <span className="block font-medium">{row.name}</span>
                    {row.company ? <span className="block text-xs text-slate-400">{row.company}</span> : null}
                  </td>
                  <td className="px-3 py-3">{row.lotNo || '—'}</td>
                  <td className="px-3 py-3">{row.qty || '—'}</td>
                  <td className="max-w-48 truncate px-3 py-3">{row.reason}</td>
                  <td className="px-3 py-3">{row.location || '—'}</td>
                  <td className="px-3 py-3">
                    <PrettySelect
                      value={row.status}
                      options={STATUSES}
                      onChange={(value) => { void persist(rows.map((item) => item.id === row.id ? { ...item, status: value as Status } : item)) }}
                      className={cn('h-7 w-auto rounded-full border-0 px-2.5 text-xs font-semibold', STATUS_TONE[row.status])}
                    />
                  </td>
                  <td className="no-print px-2 py-2 whitespace-nowrap">
                    <div className="flex items-center">
                      <Button type="button" variant="ghost" size="icon" className="size-8 text-slate-800 hover:bg-slate-100" title="수정" aria-label="수정" onClick={() => openEdit(row)}>
                        <Pencil className="size-4" />
                      </Button>
                      <Button type="button" variant="ghost" size="icon" className="size-8 text-red-500 hover:bg-red-50 hover:text-red-600" title="삭제" aria-label="삭제" onClick={() => setPendingDelete(row)}>
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {ready && visible.length === 0 && (
          <div className="flex flex-col items-center px-6 py-16 text-center">
            <span className="flex size-16 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
              <Table2 className="size-7" />
            </span>
            <h3 className="mt-4 text-lg font-bold text-slate-800">{rows.length === 0 ? '등록된 폐기 대상이 없습니다.' : '조건에 맞는 폐기 대상이 없습니다.'}</h3>
            <p className="mt-2 max-w-md text-sm leading-6 text-slate-400">
              이 화면은 최초 데이터가 없이 시작한다.
              <br />
              신규 등록하면 관리대장과 요약 수치에 즉시 반영된다.
            </p>
            <Button type="button" className="mt-5 h-10 bg-emerald-700 px-4 text-white hover:bg-emerald-800" onClick={openRegister}>
              <Plus className="size-4" /> 첫 폐기 대상 등록
            </Button>
          </div>
        )}
      </section>

      <Dialog open={open} onOpenChange={(next) => { setOpen(next); if (!next) setEditingId(null) }}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{editingId ? '폐기품 수정' : '폐기품 등록'}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5 text-sm font-medium sm:col-span-2">
              구분
              <div className="grid grid-cols-5 gap-2">
                {KINDS.map((kind) => {
                  const selected = form.kind === kind
                  const tone = KIND_TONE[kind]
                  return (
                    <button
                      key={kind}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => setForm((current) => ({ ...current, kind }))}
                      className={cn(
                        'flex flex-col items-center gap-2 rounded-2xl border px-1 py-3 text-base font-semibold transition-colors',
                        selected
                          ? cn('border-transparent shadow-sm ring-2', tone.tile, tone.ring)
                          : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:text-slate-800',
                      )}
                    >
                      <span className={cn('size-2 rounded-full', tone.dot)} />
                      {kind}
                    </button>
                  )
                })}
              </div>
            </div>
            <label className="flex w-full flex-col gap-1.5 text-sm font-medium sm:col-span-2 sm:w-[calc(50%-6px)]">
              등록일
              <Input type="date" value={form.registeredOn} onChange={(event) => setForm({ ...form, registeredOn: event.target.value })} className="h-9" />
            </label>
            <div className="flex flex-col gap-1.5 text-sm font-medium">
              업체명
              <SearchableCombobox
                appearance="form"
                configName="companies"
                options={companies}
                listAll
                creatable={false}
                clearable
                value={form.company}
                onChange={(company) => {
                  const owned = uniqueSorted(links.filter((row) => row.company === company).map((row) => row.product))
                  setForm((current) => ({
                    ...current,
                    company,
                    name: !company || owned.includes(current.name) ? current.name : owned.length === 1 ? owned[0] : '',
                  }))
                }}
                placeholder={companies.length ? '업체 선택' : '등록된 업체가 없습니다'}
                listCaption={`업체 ${companies.length}개`}
              />
            </div>
            <div className="flex flex-col gap-1.5 text-sm font-medium">
              품명 / 모델명
              <SearchableCombobox
                appearance="form"
                configName="products"
                options={products}
                listAll
                creatable={false}
                clearable
                value={form.name}
                onChange={(name) => {
                  const makers = uniqueSorted(links.filter((row) => row.product === name).map((row) => row.company))
                  setForm((current) => ({
                    ...current,
                    name,
                    company: !name || makers.includes(current.company) ? current.company : makers.length === 1 ? makers[0] : '',
                  }))
                }}
                placeholder={products.length ? '품목 선택' : '등록된 품목이 없습니다'}
                listCaption={`품목 ${products.length}개`}
              />
            </div>
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              LOT번호
              <Input value={form.lotNo} onChange={(event) => setForm({ ...form, lotNo: event.target.value })} className="h-9" />
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              수량
              <Input value={form.qty} onChange={(event) => setForm({ ...form, qty: event.target.value })} className="h-9" />
            </label>
            <div className="flex flex-col gap-1.5 text-sm font-medium">
              발생부서
              <SearchableCombobox
                appearance="form"
                configName="departments"
                options={departments}
                listAll
                creatable={false}
                clearable
                value={form.department}
                onChange={(department) => {
                  const names = uniqueSorted(seats.filter((seat) => seat.department === department).map((seat) => seat.name))
                  setForm((current) => ({
                    ...current,
                    department,
                    owner: !department || names.includes(current.owner) ? current.owner : '',
                  }))
                }}
                placeholder={departments.length ? '부서 선택' : '조직도에 부서가 없습니다'}
                listCaption={`부서 ${departments.length}개`}
              />
            </div>
            <div className="flex flex-col gap-1.5 text-sm font-medium">
              담당자
              <SearchableCombobox
                appearance="form"
                configName="owners"
                options={owners}
                listAll
                creatable={false}
                clearable
                value={form.owner}
                onChange={(owner) => {
                  const homes = uniqueSorted(seats.filter((seat) => seat.name === owner).map((seat) => seat.department))
                  setForm((current) => ({
                    ...current,
                    owner,
                    department: !owner || homes.includes(current.department) ? current.department : homes.length === 1 ? homes[0] : current.department,
                  }))
                }}
                placeholder={owners.length ? '담당자 선택' : '조직도에 담당자가 없습니다'}
                listCaption={`담당자 ${owners.length}개`}
              />
            </div>
            <label className="flex flex-col gap-1.5 text-sm font-medium sm:col-span-2">
              폐기사유
              <Input value={form.reason} onChange={(event) => setForm({ ...form, reason: event.target.value })} className="h-9" />
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              보관위치
              <Input value={form.location} onChange={(event) => setForm({ ...form, location: event.target.value })} className="h-9" />
            </label>
            <div className="flex flex-col gap-1.5 text-sm font-medium">
              관리상태
              <PrettySelect value={form.status} options={STATUSES} onChange={(value) => setForm((current) => ({ ...current, status: value as Status }))} />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>취소</Button>
            <Button type="button" className="bg-emerald-700 text-white hover:bg-emerald-800" onClick={save}>{editingId ? '저장' : '등록'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={pendingDelete != null} onOpenChange={(next) => { if (!next) setPendingDelete(null) }}>
        <AlertDialogContent className="sm:max-w-sm">
          <AlertDialogHeader className="w-full place-items-stretch text-left">
            <AlertDialogTitle className="text-left">폐기 대상을 삭제할까요?</AlertDialogTitle>
            {pendingDelete ? (
              <dl className="grid grid-cols-[4.25rem_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-sm">
                <dt className="text-muted-foreground">관리번호</dt>
                <dd className="min-w-0">{pendingDelete.no}</dd>
                <dt className="text-muted-foreground">구분</dt>
                <dd className="min-w-0">
                  <KindBadge kind={pendingDelete.kind} />
                </dd>
                <dt className="text-muted-foreground">품명</dt>
                <dd className="min-w-0 truncate">{pendingDelete.name}</dd>
              </dl>
            ) : null}
            <AlertDialogDescription className="text-left text-pretty">삭제한 뒤에는 되돌릴 수 없습니다.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => pendingDelete && remove(pendingDelete.id)}>삭제</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  )
}

function KindBadge({ kind }: { kind: Kind }) {
  return (
    <span className={cn('inline-flex items-center rounded-full px-3 py-1 text-sm font-semibold whitespace-nowrap', KIND_TONE[kind].chip)}>
      {kind}
    </span>
  )
}

function PrettySelect({ value, options, onChange, className }: { value: string; options: readonly string[]; onChange: (value: string) => void; className?: string }) {
  const [open, setOpen] = useState(false)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        className={cn(
          'flex h-9 w-full items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 text-left text-sm text-slate-800 outline-none hover:border-slate-300',
          open && 'border-emerald-600 ring-2 ring-emerald-600/15',
          className,
        )}
      >
        <span className="truncate">{value}</span>
        <ChevronDown className={cn('size-4 shrink-0 text-slate-400 transition-transform', open && 'rotate-180')} />
      </PopoverTrigger>
      <PopoverContent align="start" sideOffset={6} className="w-[var(--anchor-width)] min-w-[9.5rem] gap-0 overflow-hidden rounded-xl border border-slate-200 p-1 shadow-lg">
        <div className="max-h-64 overflow-y-auto">
          {options.map((option) => {
            const selected = option === value
            return (
              <button
                key={option}
                type="button"
                onClick={() => {
                  onChange(option)
                  setOpen(false)
                }}
                className={cn(
                  'flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-sm',
                  selected ? 'bg-emerald-50 font-semibold text-emerald-800' : 'text-slate-700 hover:bg-slate-50',
                )}
              >
                <span className="truncate">{option}</span>
                {selected ? <Check className="size-3.5 shrink-0 text-emerald-700" /> : <span className="size-3.5 shrink-0" />}
              </button>
            )
          })}
        </div>
      </PopoverContent>
    </Popover>
  )
}

function StatusChip({ label, count, active, onClick }: { label: string; count: number; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-full border px-3 py-1.5 text-sm font-semibold',
        active ? 'border-emerald-700 bg-emerald-700 text-white' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50',
      )}
    >
      {label} <span className={cn('ml-1 tabular-nums', active ? 'text-white' : 'text-slate-400')}>{count}</span>
    </button>
  )
}
