'use client'

import { useEffect, useMemo, useState } from 'react'
import { ClipboardList, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { SearchableCombobox } from '@/components/ui/searchable-combobox'
import { getJsonAuthHeaders } from '@/lib/auth-client'
import { formatDefectRate } from '@/lib/format'
import { Floor3WorkLog } from '@/lib/floor3-work-log'
import {
  ProcessAnswer,
  ProcessCheckRecord,
  ProcessFieldSpec,
  ProcessTemplate,
  isOutOfRange,
  recordFloor,
  sectionsOf,
} from '@/lib/process-checklist'
import { displayDate, formatQuantity } from '@/lib/stock'
import { cn } from '@/lib/utils'

const emptyForm = (company: string, product: string, unit: string, floor: 1 | 2 | 3) => ({
  id: '',
  workDate: new Date().toISOString().slice(0, 10),
  company,
  product,
  unit: unit || 'EA',
  floor,
  workQuantity: '',
  defectQuantity: '',
  sampleQuantity: '',
})

function compactDate(value: string) {
  return value.replace(/\D/g, '').slice(0, 8)
}

function selectedProduct(record: ProcessCheckRecord, template?: ProcessTemplate) {
  if (!template) return ''
  const field = sectionsOf(template)
    .flatMap((section) => section.fields)
    .find((item) => item.type === 'choice' && item.label === '생산품목')
  const value = field ? record.answers[field.id] : ''
  return typeof value === 'string' ? value.trim() : ''
}

function checksForWork(row: Floor3WorkLog, checks: ProcessCheckRecord[], templates: ProcessTemplate[]) {
  const date = compactDate(row.workDate)
  return checks
    .filter((record) => {
      if (recordFloor(record) !== (row.floor ?? 3) || compactDate(record.writtenDate) !== date) return false
      const template = templates.find((item) => item.id === record.lineId)
      const picked = selectedProduct(record, template)
      if (picked) return picked === row.product
      return (template?.name || record.product || '').trim() === row.product
    })
    .sort((a, b) => a.writtenTime.localeCompare(b.writtenTime))
}

export function Floor3WorkLogPanel({
  logs,
  checks,
  templates,
  catalog,
  editable,
  company,
  product,
  unit,
  floor,
  lockedFloor = null,
  onSaved,
}: {
  logs: Floor3WorkLog[]
  checks: ProcessCheckRecord[]
  templates: ProcessTemplate[]
  catalog: { company: string; product: string }[]
  editable: boolean
  company: string
  product: string
  unit: string
  floor: '1' | '2' | '3' | 'all'
  lockedFloor?: 1 | 2 | 3 | null
  onSaved: () => Promise<void> | void
}) {
  const writingFloor: 1 | 2 | 3 = floor === 'all' ? (lockedFloor ?? 3) : Number(floor) as 1 | 2 | 3
  const [settingCompanies, setSettingCompanies] = useState<string[]>([])
  const [settingProducts, setSettingProducts] = useState<string[]>([])
  const [platingPairs, setPlatingPairs] = useState<{ company: string; product: string }[]>([])
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState(() => emptyForm(company, product, unit, writingFloor))
  const [saving, setSaving] = useState(false)
  const [checkView, setCheckView] = useState<{ row: Floor3WorkLog; records: ProcessCheckRecord[] } | null>(null)

  useEffect(() => {
    let cancelled = false
    Promise.all([
      fetch('/api/config?name=companies', { cache: 'no-store' }).then((response) => response.json()),
      fetch('/api/config?name=products', { cache: 'no-store' }).then((response) => response.json()),
      fetch('/api/plating-info', { cache: 'no-store' }).then((response) => response.json()),
    ]).then(([companies, products, plating]) => {
      if (cancelled) return
      setSettingCompanies(Array.isArray(companies.data) ? companies.data : [])
      setSettingProducts(Array.isArray(products.data) ? products.data : [])
      const rows = Array.isArray(plating.rows) ? plating.rows : []
      setPlatingPairs(rows.flatMap((row: { company?: string; product?: string }) => {
        const companyName = String(row.company ?? '').trim()
        const productName = String(row.product ?? '').trim()
        return companyName && productName ? [{ company: companyName, product: productName }] : []
      }))
    }).catch(() => {})
    return () => { cancelled = true }
  }, [])

  const rows = useMemo(
    () => [...logs].sort((a, b) => b.workDate.localeCompare(a.workDate) || a.company.localeCompare(b.company, 'ko')),
    [logs],
  )

  const totals = rows.reduce(
    (sum, row) => ({
      work: sum.work + (row.workQuantity || 0),
      defect: sum.defect + (row.defectQuantity || 0),
      sample: sum.sample + (row.sampleQuantity || 0),
    }),
    { work: 0, defect: 0, sample: 0 },
  )
  const companyOptions = useMemo(() => {
    const values = new Set([...settingCompanies, ...catalog.map((item) => item.company)].filter(Boolean))
    return [...values].sort((a, b) => a.localeCompare(b, 'ko'))
  }, [catalog, settingCompanies])
  const selectedCompany = company || form.company
  const productOptions = useMemo(() => {
    if (!selectedCompany) return []
    const values = new Set([
      ...platingPairs.filter((item) => item.company === selectedCompany).map((item) => item.product),
      ...catalog.filter((item) => item.company === selectedCompany).map((item) => item.product),
      ...(form.product ? [form.product] : []),
    ].filter(Boolean))
    return [...values].sort((a, b) => a.localeCompare(b, 'ko'))
  }, [catalog, form.product, platingPairs, selectedCompany])

  const openCreate = () => {
    setForm(emptyForm(company, product, unit, writingFloor))
    setOpen(true)
  }

  const save = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!form.company || !form.product) {
      toast.error('업체와 품목을 선택해주세요.')
      return
    }
    setSaving(true)
    try {
      const response = await fetch('/api/floor3-work-logs', {
        method: 'POST',
        headers: getJsonAuthHeaders(),
        body: JSON.stringify({
          id: form.id || undefined,
          company: form.company,
          product: form.product,
          unit: form.unit,
          floor: form.floor,
          workDate: form.workDate,
          workQuantity: Number(form.workQuantity || 0),
          defectQuantity: Number(form.defectQuantity || 0),
          sampleQuantity: Number(form.sampleQuantity || 0),
        }),
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(result.error || '저장에 실패했습니다.')
      toast.success(result.updated ? '수정되었습니다.' : '등록되었습니다.')
      setOpen(false)
      await onSaved()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '저장에 실패했습니다.')
    } finally {
      setSaving(false)
    }
  }

  const editRow = (row: Floor3WorkLog) => {
    setForm({
      id: row.id,
      workDate: row.workDate,
      company: row.company,
      product: row.product,
      unit: row.unit || 'EA',
      floor: row.floor ?? 3,
      workQuantity: String(row.workQuantity || ''),
      defectQuantity: String(row.defectQuantity || ''),
      sampleQuantity: String(row.sampleQuantity || ''),
    })
    setOpen(true)
  }

  const remove = async (row: Floor3WorkLog) => {
    if (!window.confirm(`${displayDate(row.workDate)} ${row.product} 작업일보를 삭제하시겠습니까?`)) return
    try {
      const response = await fetch('/api/floor3-work-logs', {
        method: 'DELETE',
        headers: getJsonAuthHeaders(),
        body: JSON.stringify({ id: row.id }),
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(result.error || '삭제에 실패했습니다.')
      toast.success('삭제되었습니다.')
      await onSaved()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '삭제에 실패했습니다.')
    }
  }

  return (
    <section className="overflow-hidden rounded-xl border bg-card shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b px-5 py-4">
        <div className="flex items-center gap-2">
          <ClipboardList className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold tracking-wide uppercase">{floor === 'all' ? '작업일보' : `작업일보 · ${floor}층`}</h2>
        </div>
        {editable && (
          <Button type="button" onClick={openCreate} className="shrink-0">
            <Plus className="mr-2 h-4 w-4" /> 작업일보 추가
          </Button>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[860px] text-sm">
          <thead className="bg-muted/50 text-xs text-muted-foreground">
            <tr>
              {['날짜', ...(floor === 'all' ? ['층'] : []), '업체', '품목', '작업수량', '불량수', '검사시료', '총 작업수량', ...(editable ? [''] : [])].map((head) => (
                <th key={head || 'actions'} className={`px-4 py-3 ${['작업수량', '불량수', '검사시료', '총 작업수량'].includes(head) ? 'text-right' : 'text-left'}`}>{head}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={editable ? (floor === 'all' ? 9 : 8) : (floor === 'all' ? 8 : 7)} className="px-4 py-16 text-center text-muted-foreground">
                  등록된 작업일보가 없습니다.
                </td>
              </tr>
            ) : rows.map((row) => (
              <tr key={row.id}>
                <td className="px-4 py-3">
                  <div>{displayDate(row.workDate)}</div>
                  {checksForWork(row, checks, templates).length > 0 && (
                    <button
                      type="button"
                      className="mt-1 text-xs font-medium text-primary hover:underline"
                      onClick={() => setCheckView({ row, records: checksForWork(row, checks, templates) })}
                    >
                      공정검사
                    </button>
                  )}
                </td>
                {floor === 'all' && <td className="px-4 py-3">{row.floor ?? 3}층</td>}
                <td className="px-4 py-3 font-medium">{row.company}</td>
                <td className="px-4 py-3">{row.product}</td>
                <td className="px-4 py-3 text-right font-semibold tabular-nums">{formatQuantity(row.workQuantity, row.unit)}</td>
                <td className="px-4 py-3 text-right">
                  <div className="font-semibold tabular-nums">{formatQuantity(row.defectQuantity)}</div>
                  {formatDefectRate(row.defectQuantity, row.workQuantity) && (
                    <div className="text-[11px] leading-4 text-muted-foreground">불량률 {formatDefectRate(row.defectQuantity, row.workQuantity)}</div>
                  )}
                </td>
                <td className="px-4 py-3 text-right font-semibold tabular-nums">{formatQuantity(row.sampleQuantity)}</td>
                <td className="px-4 py-3 text-right font-semibold tabular-nums">{formatQuantity(row.workQuantity, row.unit)}</td>
                {editable && (
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <Button type="button" size="sm" variant="outline" onClick={() => editRow(row)}>수정</Button>
                      <Button type="button" size="sm" variant="outline" className="text-destructive" onClick={() => void remove(row)}>삭제</Button>
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
          {rows.length > 0 && (
            <tfoot className="border-t-2 border-slate-200 bg-slate-100/90 text-sm dark:border-border dark:bg-muted/60">
              <tr>
                <td
                  className="px-4 py-3.5 text-left text-sm font-bold text-slate-800 dark:text-slate-100"
                  colSpan={floor === 'all' ? 4 : 3}
                >
                  합계{' '}
                  <span className="text-base font-extrabold tabular-nums text-slate-900 dark:text-white">{rows.length}</span>
                  건
                </td>
                <td className="px-4 py-3.5 text-right text-base font-extrabold tabular-nums text-slate-900 dark:text-slate-50">
                  {formatQuantity(totals.work)}
                </td>
                <td className="px-4 py-3.5 text-right text-base font-extrabold tabular-nums text-slate-900 dark:text-slate-50">
                  {formatQuantity(totals.defect)}
                </td>
                <td className="px-4 py-3.5 text-right text-base font-extrabold tabular-nums text-slate-900 dark:text-slate-50">
                  {formatQuantity(totals.sample)}
                </td>
                <td className="px-4 py-3.5 text-right text-base font-extrabold tabular-nums text-slate-900 dark:text-slate-50">
                  {formatQuantity(totals.work)}
                </td>
                {editable && <td />}
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle>{form.id ? '작업일보 수정' : '작업일보 추가'}</DialogTitle>
            <DialogDescription>
              {form.company && form.product ? `${form.company} · ${form.product}` : '설정에 등록된 업체·품목에서 고릅니다.'}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={save} className="grid gap-3 sm:grid-cols-2">
            {!company && (
              <label className="space-y-1.5 text-sm font-medium sm:col-span-2">
                <span>업체</span>
                <SearchableCombobox
                  configName="companies"
                  listAll
                  options={companyOptions}
                  value={form.company}
                  onChange={(value) => {
                    const products = new Set([
                      ...platingPairs.filter((item) => item.company === value).map((item) => item.product),
                      ...catalog.filter((item) => item.company === value).map((item) => item.product),
                    ])
                    setForm({ ...form, company: value, product: products.has(form.product) ? form.product : '' })
                  }}
                  onOptionsChange={setSettingCompanies}
                  placeholder="업체 검색 또는 입력..."
                  className="h-10"
                />
              </label>
            )}
            {!product && (
              <label className="space-y-1.5 text-sm font-medium sm:col-span-2">
                <span>품목</span>
                <SearchableCombobox
                  configName="products"
                  listAll
                  options={productOptions}
                  value={form.product}
                  onOptionsChange={setSettingProducts}
                  onChange={(value) => {
                    const matched = catalog.find((item) => item.product === value && (!form.company || item.company === form.company))
                    setForm({ ...form, product: value, company: form.company || matched?.company || '' })
                  }}
                  placeholder={selectedCompany ? '품목 검색 또는 입력...' : '업체를 먼저 선택하세요'}
                  className="h-10"
                />
              </label>
            )}
            {floor === 'all' && lockedFloor == null && (
              <label className="space-y-1.5 text-sm font-medium">
                <span>층</span>
                <select
                  value={form.floor}
                  onChange={(event) => setForm({ ...form, floor: Number(event.target.value) as 1 | 2 | 3 })}
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value={1}>1층</option>
                  <option value={2}>2층</option>
                  <option value={3}>3층</option>
                </select>
              </label>
            )}
            <label className="space-y-1.5 text-sm font-medium">
              <span>날짜</span>
              <Input type="date" value={form.workDate} onChange={(event) => setForm({ ...form, workDate: event.target.value })} required />
            </label>
            <label className="space-y-1.5 text-sm font-medium">
              <span>단위</span>
              <select
                value={form.unit}
                onChange={(event) => setForm({ ...form, unit: event.target.value })}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="EA">EA</option>
                <option value="Kg">Kg</option>
                <option value="R">R</option>
              </select>
            </label>
            <label className="space-y-1.5 text-sm font-medium">
              <span>작업수량</span>
              <Input type="number" min="0" step="any" value={form.workQuantity} onChange={(event) => setForm({ ...form, workQuantity: event.target.value })} placeholder="0" />
            </label>
            <label className="space-y-1.5 text-sm font-medium">
              <span>불량수</span>
              <Input type="number" min="0" step="any" value={form.defectQuantity} onChange={(event) => setForm({ ...form, defectQuantity: event.target.value })} placeholder="0" />
            </label>
            <label className="space-y-1.5 text-sm font-medium">
              <span>검사시료</span>
              <Input type="number" min="0" step="any" value={form.sampleQuantity} onChange={(event) => setForm({ ...form, sampleQuantity: event.target.value })} placeholder="0" />
            </label>
            <DialogFooter className="sm:col-span-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>취소</Button>
              <Button type="submit" disabled={saving}>{saving ? '저장 중...' : form.id ? '수정' : '등록'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ProcessCheckDialog
        view={checkView}
        templates={templates}
        onClose={() => setCheckView(null)}
      />
    </section>
  )
}

function answerText(field: ProcessFieldSpec, value: ProcessAnswer | undefined) {
  if (value === '' || value == null) return '-'
  if (value === 'yes') return 'Yes'
  if (value === 'no') return 'No'
  return field.unit ? `${value} ${field.unit}` : String(value)
}

function ProcessCheckDialog({
  view,
  templates,
  onClose,
}: {
  view: { row: Floor3WorkLog; records: ProcessCheckRecord[] } | null
  templates: ProcessTemplate[]
  onClose: () => void
}) {
  const [recordId, setRecordId] = useState('')
  useEffect(() => {
    setRecordId(view?.records[0]?.id || '')
  }, [view])
  const record = view?.records.find((item) => item.id === recordId) || view?.records[0]
  const template = templates.find((item) => item.id === record?.lineId)
  const sections = template ? sectionsOf(template) : []

  return (
    <Dialog open={Boolean(view)} onOpenChange={(next) => { if (!next) onClose() }}>
      <DialogContent className="flex max-h-[85vh] w-[min(96vw,720px)] flex-col overflow-hidden sm:max-w-[720px]">
        <DialogHeader>
          <DialogTitle>공정검사</DialogTitle>
          <DialogDescription>
            {view ? `${displayDate(view.row.workDate)} · ${view.row.company} · ${view.row.product}` : ''}
          </DialogDescription>
        </DialogHeader>
        {view && view.records.length > 1 && (
          <div className="flex gap-2 overflow-x-auto">
            {view.records.map((item) => {
              const name = templates.find((templateItem) => templateItem.id === item.lineId)?.name || item.product || '공정검사'
              const active = item.id === record?.id
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setRecordId(item.id)}
                  className={cn('shrink-0 rounded-full border px-3 py-1.5 text-sm', active ? 'border-primary bg-primary text-primary-foreground' : 'bg-background')}
                >
                  {name} {item.writtenTime}
                </button>
              )
            })}
          </div>
        )}
        {record && (
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain pr-1">
            <p className="text-sm text-muted-foreground">
              {template?.name || record.product || '공정검사'} · {record.writtenTime} · {record.author}
            </p>
            {sections.map((section) => (
              <section key={section.id}>
                <h3 className="mb-2 text-sm font-semibold">{section.title}</h3>
                <ul className="divide-y overflow-hidden rounded-lg border">
                  {section.fields.map((field) => {
                    const value = record.answers[field.id]
                    return (
                      <li key={field.id} className="flex items-start justify-between gap-3 px-3 py-2 text-sm">
                        <span className="min-w-0">{field.label}</span>
                        <span className={cn(
                          'shrink-0 font-semibold tabular-nums',
                          value === 'no' && 'text-rose-700 dark:text-rose-300',
                          isOutOfRange(field, value ?? '') && 'text-rose-700 dark:text-rose-300',
                        )}>
                          {answerText(field, value)}
                        </span>
                      </li>
                    )
                  })}
                </ul>
              </section>
            ))}
            {sections.length === 0 && (
              <p className="text-sm text-muted-foreground">점검표 항목을 찾지 못했습니다.</p>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
