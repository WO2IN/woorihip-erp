'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Check, Factory, Pencil, Plus } from 'lucide-react'
import type { ProcessNcActionKey, ProcessNonconformity, WorkflowStatus } from '@/lib/non-conformity'
import { PROCESS_NC_ACTIONS, emptyProcessNcActions, todayOccurrenceDate } from '@/lib/non-conformity'
import { FLOOR_OPTIONS } from '@/lib/floor'
import { useAuth } from '@/components/auth/auth-context'
import { buildAuthHeaders } from '@/lib/auth-client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { WorkflowStatusPicker } from '@/components/quality/workflow-status-dot'
import { ProcessNcActionChecklist } from '@/components/quality/process-nc-action-chips'
import { NcDate, NcEmpty, NcOverall, NcSection, NcStep, type NcFilter } from '@/components/quality/nc-shell'
import { cn } from '@/lib/utils'
import { ItemDeleteButton } from '@/components/shared/item-delete-button'

const API = '/api/quality/process-nonconformities'

function sortByOccurrence(rows: ProcessNonconformity[]) {
  return [...rows].sort(
    (a, b) =>
      b.occurrenceDate.localeCompare(a.occurrenceDate) || b.createdAt.localeCompare(a.createdAt),
  )
}

type ProcessNcForm = ReturnType<typeof emptyProcessNcForm>

function emptyProcessNcForm() {
  return {
    occurrenceDate: todayOccurrenceDate(),
    occurrenceLine: FLOOR_OPTIONS[0].label as string,
    customerCompany: '',
    description: '',
    assignee: '',
    responsible: '',
    processingResult: 'not_started' as WorkflowStatus,
    actions: emptyProcessNcActions(),
  }
}

function processRowToForm(row: ProcessNonconformity): ProcessNcForm {
  return {
    occurrenceDate: row.occurrenceDate,
    occurrenceLine: row.occurrenceLine,
    customerCompany: row.customerCompany,
    description: row.description,
    assignee: row.assignee ?? '',
    responsible: row.responsible ?? '',
    processingResult: row.processingResult,
    actions: { ...row.actions },
  }
}

function ProcessNcFormFields({
  form,
  setForm,
  onToggleAction,
  processingLabel = '처리결과 (초기값)',
}: {
  form: ProcessNcForm
  setForm: React.Dispatch<React.SetStateAction<ProcessNcForm>>
  onToggleAction: (key: ProcessNcActionKey) => void
  processingLabel?: string
}) {
  return (
    <>
      <div className="space-y-1.5">
        <p className="text-xs font-medium text-muted-foreground">발생일</p>
        <Input
          type="date"
          value={form.occurrenceDate}
          onChange={(e) => setForm((f) => ({ ...f, occurrenceDate: e.target.value }))}
        />
      </div>
      <Select
        value={form.occurrenceLine}
        onValueChange={(v) => setForm((f) => ({ ...f, occurrenceLine: v ?? f.occurrenceLine }))}
      >
        <SelectTrigger>
          <SelectValue placeholder="발생라인" />
        </SelectTrigger>
        <SelectContent>
          {FLOOR_OPTIONS.map((opt) => (
            <SelectItem key={opt.value} value={opt.label}>
              {opt.label}
            </SelectItem>
          ))}
          <SelectItem value="미지정">층 미지정</SelectItem>
        </SelectContent>
      </Select>
      <Input
        placeholder="고객사"
        value={form.customerCompany}
        onChange={(e) => setForm((f) => ({ ...f, customerCompany: e.target.value }))}
      />
      <Input
        placeholder="부적합내용 (품목 · 어떤 부적합인지)"
        value={form.description}
        onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
      />
      <div className="space-y-2 rounded-lg border bg-muted/20 p-3">
        <p className="text-xs font-medium text-muted-foreground">조치사항 (해당 항목 선택)</p>
        <ProcessNcActionChecklist actions={form.actions} onToggle={onToggleAction} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Input
          placeholder="담당자 (선택)"
          value={form.assignee}
          onChange={(e) => setForm((f) => ({ ...f, assignee: e.target.value }))}
        />
        <Input
          placeholder="책임자 (선택)"
          value={form.responsible}
          onChange={(e) => setForm((f) => ({ ...f, responsible: e.target.value }))}
        />
      </div>
      <WorkflowStatusPicker
        label={processingLabel}
        value={form.processingResult}
        onChange={(processingResult) => setForm((f) => ({ ...f, processingResult }))}
      />
    </>
  )
}

export function ProcessNcView({ embedded = false }: { embedded?: boolean }) {
  const { user } = useAuth()
  const editable = Boolean(user && ['editor', 'admin'].includes(user.role))
  const [rows, setRows] = useState<ProcessNonconformity[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState(emptyProcessNcForm)
  const [editOpen, setEditOpen] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<ProcessNcForm>(emptyProcessNcForm)

  const load = useCallback(async () => {
    const res = await fetch(API, { cache: 'no-store' })
    const json = await res.json()
    setRows(sortByOccurrence(json.data ?? []))
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function patchRow(id: string, patch: Partial<ProcessNonconformity>) {
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
    setForm(emptyProcessNcForm())
    setOpen(false)
    toast.success('공정 부적합 항목을 등록했습니다.')
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

  function toggleAction(row: ProcessNonconformity, key: ProcessNcActionKey) {
    const actions = { ...row.actions, [key]: !row.actions[key] }
    patchRow(row.id, { actions })
  }

  function toggleFormAction(key: ProcessNcActionKey) {
    setForm((f) => ({ ...f, actions: { ...f.actions, [key]: !f.actions[key] } }))
  }

  function toggleEditFormAction(key: ProcessNcActionKey) {
    setEditForm((f) => ({ ...f, actions: { ...f.actions, [key]: !f.actions[key] } }))
  }

  function openEdit(row: ProcessNonconformity) {
    setEditId(row.id)
    setEditForm(processRowToForm(row))
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
  const isDone = (row: ProcessNonconformity) => row.processingResult === 'done'
  const openCount = rows.filter((row) => !isDone(row)).length
  const keyword = query.trim().toLowerCase()
  const visible = rows.filter((row) => {
    if (filter === 'open' && isDone(row)) return false
    if (filter === 'done' && !isDone(row)) return false
    if (!keyword) return true
    return [row.customerCompany, row.description, row.occurrenceLine, row.assignee ?? '', row.responsible ?? '']
      .some((v) => v.toLowerCase().includes(keyword))
  })

  return (
    <>
      <NcSection
        icon={Factory}
        title="공정 부적합"
        description="공정에서 발견한 부적합 · 특채/격리/재작업/폐기 조치와 처리결과"
        total={rows.length}
        open={openCount}
        filter={filter}
        onFilter={setFilter}
        query={query}
        onQuery={setQuery}
        placeholder="고객사, 내용, 담당자 검색"
        action={editable && (
          <Dialog
            open={open}
            onOpenChange={(next) => {
              setOpen(next)
              if (!next) setForm(emptyProcessNcForm())
            }}
          >
            <DialogTrigger render={<Button size="sm" />}>
              <Plus className="mr-1 h-4 w-4" />
              부적합 등록
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>공정 부적합 등록</DialogTitle>
              </DialogHeader>
              <div className="max-h-[min(70vh,32rem)] space-y-4 overflow-y-auto pr-1">
                <ProcessNcFormFields form={form} setForm={setForm} onToggleAction={toggleFormAction} />
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
                  <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-bold">{row.occurrenceLine}</span>
                  <span className="text-base font-bold">{row.customerCompany || '고객사 미입력'}</span>
                  <NcOverall done={isDone(row)} started={row.processingResult !== 'not_started'} />
                </div>
                <p className="mt-1 text-sm leading-relaxed">{row.description || '—'}</p>
                <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                  <span className="mr-0.5 text-xs font-semibold text-muted-foreground">조치</span>
                  {PROCESS_NC_ACTIONS.map(({ key, label }) => {
                    const checked = row.actions[key]
                    const chip = cn(
                      'inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-semibold transition-colors',
                      checked
                        ? 'border-[oklch(0.58_0.15_162/0.5)] bg-[oklch(0.58_0.15_162/0.12)] text-[oklch(0.42_0.13_162)] dark:text-[oklch(0.75_0.14_162)]'
                        : 'border-dashed text-muted-foreground/70',
                    )
                    const content = (
                      <>
                        {checked && <Check className="size-3.5 stroke-[3]" />}
                        {label}
                      </>
                    )
                    return editable ? (
                      <button key={key} type="button" role="checkbox" aria-checked={checked} title={`${label} (클릭하여 선택/해제)`} onClick={() => toggleAction(row, key)} className={cn(chip, 'hover:bg-muted/60')}>
                        {content}
                      </button>
                    ) : (
                      <span key={key} className={chip}>{content}</span>
                    )
                  })}
                  <span className="mx-1.5 h-4 w-px bg-border" />
                  <NcStep label="처리결과" status={row.processingResult} editable={editable} onChange={(processingResult) => patchRow(row.id, { processingResult })} />
                </div>
                {(row.assignee || row.responsible) && (
                  <p className="mt-2 flex flex-wrap gap-x-4 text-xs text-muted-foreground">
                    {row.assignee && <span><b className="font-semibold text-foreground/80">담당</b> {row.assignee}</span>}
                    {row.responsible && <span><b className="font-semibold text-foreground/80">책임</b> {row.responsible}</span>}
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
            <DialogTitle>공정 부적합 수정</DialogTitle>
          </DialogHeader>
          <div className="max-h-[min(70vh,32rem)] space-y-4 overflow-y-auto pr-1">
            <ProcessNcFormFields
              form={editForm}
              setForm={setEditForm}
              onToggleAction={toggleEditFormAction}
              processingLabel="처리결과"
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
    </>
  )
}
