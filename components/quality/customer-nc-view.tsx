'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Building2, ChevronRight, Pencil, Plus } from 'lucide-react'
import type { CustomerNonconformity, WorkflowStatus } from '@/lib/non-conformity'
import { todayOccurrenceDate } from '@/lib/non-conformity'
import { ItemDeleteButton } from '@/components/shared/item-delete-button'
import { useAuth } from '@/components/auth/auth-context'
import { buildAuthHeaders } from '@/lib/auth-client'
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
import { WorkflowStatusPicker } from '@/components/quality/workflow-status-dot'
import { NcDate, NcEmpty, NcOverall, NcSection, NcStep, type NcFilter } from '@/components/quality/nc-shell'

type CustomerNcForm = ReturnType<typeof emptyCustomerNcForm>

const emptyCustomerNcForm = () => ({
  occurrenceDate: todayOccurrenceDate(),
  occurrenceCompany: '',
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
    description: row.description,
    remarks: row.remarks ?? '',
    countermeasurePlan: row.countermeasurePlan,
    processingResult: row.processingResult,
    effectivenessVerification: row.effectivenessVerification,
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
  const { user } = useAuth()
  const editable = Boolean(user && ['editor', 'admin'].includes(user.role))
  const [rows, setRows] = useState<CustomerNonconformity[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState(emptyCustomerNcForm)
  const [editOpen, setEditOpen] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<CustomerNcForm>(emptyCustomerNcForm)

  const load = useCallback(async () => {
    const res = await fetch(API, { cache: 'no-store' })
    const json = await res.json()
    setRows(sortByOccurrence(json.data ?? []))
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function patchField(id: string, patch: Partial<CustomerNonconformity>) {
    if (!user) return
    const res = await fetch(API, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...buildAuthHeaders(user) },
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
      headers: { 'Content-Type': 'application/json', ...buildAuthHeaders(user) },
      body: JSON.stringify(form),
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
    toast.success('고객 부적합 항목을 등록했습니다.')
  }

  async function remove(id: string) {
    if (!user) return
    const res = await fetch(API, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', ...buildAuthHeaders(user) },
      body: JSON.stringify({ id }),
    })
    if (!res.ok) {
      toast.error('삭제에 실패했습니다.')
      return
    }
    setRows((prev) => prev.filter((row) => row.id !== id))
    toast.success('삭제했습니다.')
  }

  function patchStatus(id: string, field: keyof Pick<CustomerNonconformity, 'countermeasurePlan' | 'processingResult' | 'effectivenessVerification'>, next: WorkflowStatus) {
    patchField(id, { [field]: next })
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
      headers: { 'Content-Type': 'application/json', ...buildAuthHeaders(user) },
      body: JSON.stringify({ id: editId, ...editForm }),
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

  const [filter, setFilter] = useState<NcFilter>('all')
  const [query, setQuery] = useState('')
  const isDone = (row: CustomerNonconformity) =>
    row.countermeasurePlan === 'done' && row.processingResult === 'done' && row.effectivenessVerification === 'done'
  const isStarted = (row: CustomerNonconformity) =>
    [row.countermeasurePlan, row.processingResult, row.effectivenessVerification].some((s) => s !== 'not_started')
  const openCount = rows.filter((row) => !isDone(row)).length
  const keyword = query.trim().toLowerCase()
  const visible = rows.filter((row) => {
    if (filter === 'open' && isDone(row)) return false
    if (filter === 'done' && !isDone(row)) return false
    if (!keyword) return true
    return [row.occurrenceCompany, row.description, row.remarks ?? ''].some((v) => v.toLowerCase().includes(keyword))
  })

  return (
    <>
      <NcSection
        icon={Building2}
        title="고객 부적합"
        description="고객사에서 받은 부적합 · 대책서 → 처리 → 유효성 검증 순으로 진행"
        total={rows.length}
        open={openCount}
        filter={filter}
        onFilter={setFilter}
        query={query}
        onQuery={setQuery}
        placeholder="업체, 내용 검색"
        action={editable && (
          <Dialog
            open={open}
            onOpenChange={(next) => {
              setOpen(next)
              if (!next) setForm(emptyCustomerNcForm())
            }}
          >
            <DialogTrigger render={<Button size="sm" />}>
              <Plus className="mr-1 h-4 w-4" />
              부적합 등록
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>고객 부적합 등록</DialogTitle>
              </DialogHeader>
              <div className="max-h-[min(70vh,32rem)] space-y-4 overflow-y-auto pr-1">
                <CustomerNcFields form={form} setForm={setForm} />
                <div className="space-y-3 rounded-lg border bg-muted/20 p-3">
                  <p className="text-xs font-medium text-muted-foreground">진행 단계 (초기값)</p>
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
        )}
      >
        {visible.length === 0 ? (
          <NcEmpty loading={loading} filtered={rows.length > 0} />
        ) : (
          visible.map((row) => (
            <article key={row.id} className="group flex gap-4 px-5 py-4 transition-colors hover:bg-muted/30">
              <NcDate value={row.occurrenceDate} no={rows.length - rows.indexOf(row)} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-base font-bold">{row.occurrenceCompany || '업체 미입력'}</span>
                  <NcOverall done={isDone(row)} started={isStarted(row)} />
                </div>
                <p className="mt-1 text-sm leading-relaxed">{row.description || '—'}</p>
                <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                  <NcStep label="대책서" status={row.countermeasurePlan} editable={editable} onChange={(next) => patchStatus(row.id, 'countermeasurePlan', next)} />
                  <ChevronRight className="size-3.5 text-muted-foreground" />
                  <NcStep label="처리" status={row.processingResult} editable={editable} onChange={(next) => patchStatus(row.id, 'processingResult', next)} />
                  <ChevronRight className="size-3.5 text-muted-foreground" />
                  <NcStep label="유효성검증" status={row.effectivenessVerification} editable={editable} onChange={(next) => patchStatus(row.id, 'effectivenessVerification', next)} />
                </div>
                {row.remarks && (
                  <p className="mt-2.5 rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
                    <span className="mr-1.5 font-semibold text-foreground/80">특이사항</span>
                    {row.remarks}
                  </p>
                )}
              </div>
              {editable && (
                <div className="flex shrink-0 items-start gap-0.5 opacity-100 sm:opacity-0 sm:group-hover:opacity-100">
                  <Button type="button" variant="ghost" size="icon" className="h-8 w-8" title="수정" aria-label="항목 수정" onClick={() => openEdit(row)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <ItemDeleteButton compact onConfirm={() => remove(row.id)} />
                </div>
              )}
            </article>
          ))
        )}
      </NcSection>

      <Dialog
        open={editOpen}
        onOpenChange={(next) => {
          setEditOpen(next)
          if (!next) setEditId(null)
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>고객 부적합 수정</DialogTitle>
          </DialogHeader>
          <div className="max-h-[min(70vh,32rem)] space-y-4 overflow-y-auto pr-1">
            <CustomerNcFields form={editForm} setForm={setEditForm} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>
              취소
            </Button>
            <Button onClick={submitEdit}>저장</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

function CustomerNcFields({
  form,
  setForm,
}: {
  form: CustomerNcForm
  setForm: React.Dispatch<React.SetStateAction<CustomerNcForm>>
}) {
  return (
    <>
      <label className="block space-y-1.5">
        <span className="text-xs font-medium text-muted-foreground">발생일</span>
        <Input type="date" value={form.occurrenceDate} onChange={(e) => setForm((f) => ({ ...f, occurrenceDate: e.target.value }))} />
      </label>
      <label className="block space-y-1.5">
        <span className="text-xs font-medium text-muted-foreground">업체</span>
        <Input placeholder="부적합을 받은 업체" value={form.occurrenceCompany} onChange={(e) => setForm((f) => ({ ...f, occurrenceCompany: e.target.value }))} />
      </label>
      <label className="block space-y-1.5">
        <span className="text-xs font-medium text-muted-foreground">부적합 내용</span>
        <Textarea placeholder="품목과 어떤 부적합인지" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
      </label>
      <label className="block space-y-1.5">
        <span className="text-xs font-medium text-muted-foreground">특이사항 · 처리 내용 (선택)</span>
        <Textarea placeholder="어떻게 처리했는지" value={form.remarks} onChange={(e) => setForm((f) => ({ ...f, remarks: e.target.value }))} />
      </label>
    </>
  )
}
