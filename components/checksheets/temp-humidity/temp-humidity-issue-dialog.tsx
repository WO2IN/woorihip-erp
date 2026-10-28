'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, PlusIcon } from 'lucide-react'
import { toast } from 'sonner'
import { addTempHumidityIssue, deleteTempHumidityIssue, updateTempHumidityIssue } from '@/app/actions/temp-humidity'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button, buttonVariants } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'

export interface TempHumidityIssueRow {
  id: number
  sheetId?: number
  day: number | null
  temperature: string | null
  humidity: string | null
  immediateAction: string | null
  remeasure: string | null
  confirmedAt: string | null
  productImpact: string | null
  lot: string | null
  cause: string | null
  handler: string | null
  approver: string | null
  note: string | null
  createdAt?: string
  createdBy?: string | null
}

interface TempHumidityIssueDialogProps {
  sheetId: number
  placeName: string
  year: number
  month: number
  entries: { day: number; temperature: string | null; humidity: string | null; checkedAt?: string | null }[]
  issues: TempHumidityIssueRow[]
  tempLower: number
  tempUpper: number
  humidityLower: number
  humidityUpper: number
  canManage: boolean
}

const IMMEDIATE_ACTIONS = ['냉방', '난방', '제습', '가습', '출입 차단', '계측기 교체', '기타']
const IMPACTS = ['이상 없음', '재검사 → 적합', '부적합 등록']
const CAUSES = ['설비', '외기·계절', '관리 소홀', '계측기']

const STEPS = [
  {
    title: '즉시 조치',
    due: '1시간 내',
    tone: 'bg-rose-600 text-white',
    body: '재측정으로 계측기 이상 확인 → 냉·난방/제습기 조정, 출입문 차단 → 기준 복귀값 입력',
  },
  {
    title: '제품 영향 확인',
    due: '24시간 내',
    tone: 'bg-orange-500 text-white',
    body: '이탈 시간 동안 보관·시험한 LOT를 확인 → 필요 시 재검사, 이상 시 부적합 등록',
  },
  {
    title: '원인 기록·종결',
    due: '7일 내',
    tone: 'bg-slate-700 text-white',
    body: '원인 선택 후 품질팀장 승인으로 종결 · 같은 달 2회 이상이면 시정조치(CAR) 발행',
  },
]

const emptyForm = {
  occurredDate: '',
  temperature: '',
  humidity: '',
  immediateAction: '',
  immediateDetail: '',
  remeasureTemperature: '',
  remeasureHumidity: '',
  confirmedAt: '',
  productImpact: '',
  lot: '',
  cause: '',
  causeDetail: '',
  handler: '',
  approver: '',
  note: '',
}

function formatRemeasure(temperature: string, humidity: string) {
  const parts = [temperature.trim() ? `${temperature.trim()}℃` : '', humidity.trim() ? `${humidity.trim()}%` : ''].filter(Boolean)
  return parts.join(' / ')
}

function parseRemeasure(value: string | null | undefined) {
  const text = (value ?? '').trim()
  const both = /^(-?\d+(?:\.\d+)?)℃\s*\/\s*(-?\d+(?:\.\d+)?)%$/.exec(text)
  if (both) return { temperature: both[1], humidity: both[2] }
  const temperature = /^(-?\d+(?:\.\d+)?)℃$/.exec(text)
  if (temperature) return { temperature: temperature[1], humidity: '' }
  const humidity = /^(-?\d+(?:\.\d+)?)%$/.exec(text)
  if (humidity) return { temperature: '', humidity: humidity[1] }
  return { temperature: '', humidity: '' }
}

function splitChoice(value: string | null | undefined, options: string[]) {
  const text = (value ?? '').trim()
  if (!text) return { selected: '', detail: '' }
  if (options.includes(text)) return { selected: text, detail: '' }
  if (options.includes('기타')) return { selected: '기타', detail: text }
  return { selected: text, detail: '' }
}

function pad(value: number) {
  return String(value).padStart(2, '0')
}

function toDateValue(year: number, month: number, day: number) {
  return `${year}-${pad(month)}-${pad(day)}`
}

function formatIssueDate(year: number, month: number, day: number | null) {
  if (!day) return '-'
  return toDateValue(year, month, day)
}

function timeFromStamp(value?: string | null) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function outOfRange(
  entry: { temperature: string | null; humidity: string | null },
  limits: { tempLower: number; tempUpper: number; humidityLower: number; humidityUpper: number },
) {
  const temperature = entry.temperature != null && entry.temperature !== '' ? Number(entry.temperature) : null
  const humidity = entry.humidity != null && entry.humidity !== '' ? Number(entry.humidity) : null
  const tempOut = temperature != null && Number.isFinite(temperature) && (temperature < limits.tempLower || temperature > limits.tempUpper)
  const humidityOut = humidity != null && Number.isFinite(humidity) && (humidity < limits.humidityLower || humidity > limits.humidityUpper)
  return tempOut || humidityOut
}

function FieldBlock({
  label,
  children,
  className,
}: {
  label: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <label className={cn('flex min-w-0 flex-col gap-1.5', className)}>
      <span className="text-[13px] font-medium">{label}</span>
      {children}
    </label>
  )
}

function ChoiceRow({
  label,
  options,
  value,
  onChange,
  detail,
  onDetailChange,
}: {
  label: string
  options: string[]
  value: string
  onChange: (value: string) => void
  detail?: string
  onDetailChange?: (value: string) => void
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <span className="text-[13px] font-medium">{label}</span>
      <div className="flex flex-wrap gap-1 rounded-lg bg-muted p-1">
        {options.map((option) => {
          const selected = value === option
          return (
            <button
              key={option}
              type="button"
              onClick={() => onChange(selected ? '' : option)}
              className={cn(
                'h-8 rounded-md px-3 text-sm transition-colors',
                selected ? 'bg-background font-medium shadow-sm ring-1 ring-foreground/10' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {option}
            </button>
          )
        })}
      </div>
      {value === '기타' && onDetailChange && (
        <Input
          value={detail ?? ''}
          onChange={(event) => onDetailChange(event.target.value)}
          placeholder="직접 입력"
          required
        />
      )}
    </div>
  )
}

function detailText(value: string | null | undefined) {
  const text = (value ?? '').trim()
  return text || '-'
}

function issuesForSheet(issues: TempHumidityIssueRow[], sheetId: number) {
  return issues.filter((row) => row.sheetId == null || Number(row.sheetId) === Number(sheetId))
}

function IssueDetail({
  row,
  year,
  month,
  canManage,
  pending,
  onBack,
  onEdit,
  onDelete,
}: {
  row: TempHumidityIssueRow
  year: number
  month: number
  canManage: boolean
  pending: boolean
  onBack: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  const measures = [
    row.temperature ? { label: '온도', value: `${row.temperature}℃` } : null,
    row.humidity ? { label: '습도', value: `${row.humidity}%` } : null,
    row.confirmedAt?.trim() ? { label: '확인', value: row.confirmedAt.trim() } : null,
  ].filter((item): item is { label: string; value: string } => item != null)
  const sections = [
    {
      title: '즉시 조치',
      items: [
        { label: '조치', value: detailText(row.immediateAction) },
        { label: '재측정', value: detailText(row.remeasure) },
      ],
    },
    {
      title: '제품 영향',
      items: [
        { label: '영향', value: detailText(row.productImpact) },
        { label: '대상 LOT', value: detailText(row.lot) },
      ],
    },
    {
      title: '종결',
      columns: 3,
      items: [
        { label: '원인', value: detailText(row.cause) },
        { label: '처리자', value: detailText(row.handler) },
        { label: '승인', value: detailText(row.approver) },
      ],
    },
  ]
  const registrant = detailText(row.createdBy)
  return (
    <div className="flex flex-col gap-3">
      <section className="flex items-start justify-between gap-3 rounded-xl border bg-muted/40 px-4 py-3">
        <div className="min-w-0">
          <h3 className="text-base font-semibold">{formatIssueDate(year, month, row.day)}</h3>
          <p className="mt-1.5 flex flex-wrap gap-1.5">
            {measures.length > 0 ? (
              measures.map((item) => (
                <span key={item.label} className="rounded-md bg-background px-2 py-0.5 text-xs ring-1 ring-foreground/10">
                  <span className="text-muted-foreground">{item.label}</span> <span className="font-medium">{item.value}</span>
                </span>
              ))
            ) : (
              <span className="text-xs text-muted-foreground">측정값 없음</span>
            )}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <div className="flex gap-1.5">
            <Button type="button" variant="outline" size="sm" onClick={onBack}>
              목록
            </Button>
            {canManage && (
              <Button type="button" variant="outline" size="sm" disabled={pending} onClick={onEdit}>
                편집
              </Button>
            )}
            {canManage && (
              <Button type="button" variant="destructive" size="sm" disabled={pending} onClick={onDelete}>
                삭제
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            등록 <span className={cn('font-medium text-foreground', registrant === '-' && 'font-normal text-muted-foreground')}>{registrant}</span>
          </p>
        </div>
      </section>
      {sections.map((section) => (
        <section key={section.title} className="overflow-hidden rounded-xl border">
          <h4 className="border-b bg-muted/50 px-4 py-2 text-xs font-semibold">{section.title}</h4>
          <dl className={cn('grid', section.columns === 3 ? 'grid-cols-3' : 'sm:grid-cols-2')}>
            {section.items.map((item, index) => (
              <div
                key={item.label}
                className={cn(
                  'grid items-baseline gap-2 px-4 py-2.5',
                  section.columns === 3 ? 'grid-cols-[auto_minmax(0,1fr)]' : 'grid-cols-[5.5rem_minmax(0,1fr)]',
                  section.columns === 3 ? index < section.items.length - 1 && 'border-r' : 'sm:odd:border-r',
                )}
              >
                <dt className="text-xs text-muted-foreground">{item.label}</dt>
                <dd className={cn('truncate text-sm font-medium', item.value === '-' && 'font-normal text-muted-foreground')}>{item.value}</dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
      <section className="overflow-hidden rounded-xl border">
        <h4 className="border-b bg-muted/50 px-4 py-2 text-xs font-semibold">비고</h4>
        <p className={cn('whitespace-pre-wrap px-4 py-2.5 text-sm', detailText(row.note) === '-' && 'text-muted-foreground')}>{detailText(row.note)}</p>
      </section>
    </div>
  )
}

export function TempHumidityIssueDialog({
  sheetId,
  placeName,
  year,
  month,
  entries,
  issues,
  tempLower,
  tempUpper,
  humidityLower,
  humidityUpper,
  canManage,
}: TempHumidityIssueDialogProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const values = { ...emptyForm, ...form }
  const [rows, setRows] = useState(() => issuesForSheet(issues, sheetId))
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [deleteId, setDeleteId] = useState<number | null>(null)
  const [pending, startTransition] = useTransition()
  const selected = rows.find((row) => row.id === selectedId) ?? null

  useEffect(() => {
    setRows(issuesForSheet(issues, sheetId))
  }, [issues, sheetId])

  useEffect(() => {
    setSelectedId(null)
    setEditingId(null)
    setDeleteId(null)
    setOpen(false)
  }, [sheetId])

  const limits = { tempLower, tempUpper, humidityLower, humidityUpper }
  const outliers = useMemo(
    () => entries.filter((entry) => outOfRange(entry, limits)).sort((a, b) => a.day - b.day),
    [entries, tempLower, tempUpper, humidityLower, humidityUpper],
  )

  function setField(key: keyof typeof emptyForm, value: string) {
    setForm((current) => ({ ...emptyForm, ...current, [key]: value }))
  }

  const lastDay = new Date(year, month, 0).getDate()
  const minDate = toDateValue(year, month, 1)
  const maxDate = toDateValue(year, month, lastDay)

  function dayFromDate(value: string) {
    const matched = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
    if (!matched) return null
    const pickedYear = Number(matched[1])
    const pickedMonth = Number(matched[2])
    const pickedDay = Number(matched[3])
    if (pickedYear !== year || pickedMonth !== month || pickedDay < 1 || pickedDay > lastDay) return null
    return pickedDay
  }

  function applyMeasuredDay(day: number, occurredDate = toDateValue(year, month, day)) {
    const entry = entries.find((item) => item.day === day)
    setForm((current) => ({
      ...emptyForm,
      ...current,
      occurredDate,
      temperature: entry?.temperature ?? '',
      humidity: entry?.humidity ?? '',
      confirmedAt: timeFromStamp(entry?.checkedAt),
    }))
  }

  function formFromRow(row: TempHumidityIssueRow) {
    const action = splitChoice(row.immediateAction, IMMEDIATE_ACTIONS)
    const cause = splitChoice(row.cause, CAUSES)
    const remeasure = parseRemeasure(row.remeasure)
    return {
      ...emptyForm,
      occurredDate: row.day ? toDateValue(year, month, row.day) : '',
      temperature: row.temperature ?? '',
      humidity: row.humidity ?? '',
      immediateAction: action.selected,
      immediateDetail: action.detail,
      remeasureTemperature: remeasure.temperature,
      remeasureHumidity: remeasure.humidity,
      confirmedAt: row.confirmedAt ?? '',
      productImpact: row.productImpact ?? '',
      lot: row.lot ?? '',
      cause: cause.selected,
      causeDetail: cause.detail,
      handler: row.handler ?? '',
      approver: row.approver ?? '',
      note: row.note ?? '',
    }
  }

  function beginEdit(row: TempHumidityIssueRow) {
    setForm(formFromRow(row))
    setEditingId(row.id)
  }

  function chosenText(selected: string, detail: string) {
    if (selected !== '기타') return selected
    return detail.trim()
  }

  function onSubmit(event: React.FormEvent) {
    event.preventDefault()
    const day = dayFromDate(values.occurredDate)
    if (!day) {
      toast.error('이번 달 날짜를 선택해주세요.')
      return
    }
    const immediateAction = chosenText(values.immediateAction, values.immediateDetail)
    if (!values.immediateAction || !immediateAction) {
      toast.error(values.immediateAction === '기타' ? '기타 조치 내용을 입력해주세요.' : '즉시 조치를 선택해주세요.')
      return
    }
    if (values.cause === '기타' && !values.causeDetail.trim()) {
      toast.error('기타 원인 내용을 입력해주세요.')
      return
    }
    const payload = {
      day,
      temperature: values.temperature,
      humidity: values.humidity,
      immediateAction,
      remeasure: formatRemeasure(values.remeasureTemperature, values.remeasureHumidity),
      confirmedAt: values.confirmedAt,
      productImpact: values.productImpact,
      lot: values.lot,
      cause: chosenText(values.cause, values.causeDetail),
      handler: values.handler,
      approver: values.approver,
      note: values.note,
    }
    startTransition(async () => {
      try {
        if (editingId != null) {
          const updated = await updateTempHumidityIssue(editingId, payload)
          if (!updated) throw new Error('이탈 기록을 찾을 수 없습니다.')
          setRows((current) => current.map((row) => (row.id === updated.id ? (updated as TempHumidityIssueRow) : row)))
          setEditingId(null)
          setForm(emptyForm)
          toast.success('수정되었습니다.')
        } else {
          const created = await addTempHumidityIssue(sheetId, payload)
          setRows((current) => [created as TempHumidityIssueRow, ...current.filter((row) => row.id !== created.id)])
          setForm(emptyForm)
          toast.success('등록되었습니다.')
        }
        router.refresh()
      } catch (error) {
        toast.error(error instanceof Error ? error.message : editingId != null ? '수정하지 못했습니다.' : '등록하지 못했습니다.')
      }
    })
  }

  function onDelete(id: number) {
    startTransition(async () => {
      try {
        await deleteTempHumidityIssue(id)
        setRows((current) => current.filter((row) => row.id !== id))
        setSelectedId((current) => (current === id ? null : current))
        toast.success('삭제되었습니다.')
        router.refresh()
      } catch (error) {
        toast.error(error instanceof Error ? error.message : '삭제하지 못했습니다.')
      }
    })
  }

  return (
    <>
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) {
          setSelectedId(null)
          setEditingId(null)
          setDeleteId(null)
        }
      }}
    >
      <DialogTrigger className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'no-print')}>
        <AlertTriangle data-icon="inline-start" />
        이탈 등록
        {rows.length > 0 && <span className="rounded-full bg-rose-600 px-1.5 text-[10px] text-white">{rows.length}</span>}
      </DialogTrigger>
      <DialogContent
        overlayClassName="z-[80]"
        className="!z-[80] flex max-h-[85vh] w-[min(96vw,920px)] max-w-[920px] flex-col gap-0 overflow-hidden p-0 sm:max-w-[920px]"
      >
        <DialogHeader className="border-b px-5 py-4">
          <DialogTitle>{placeName} 이탈 처리</DialogTitle>
          <DialogDescription>
            {year}년 {month}월 · 이 장소만 표시 · 온도 {tempLower}~{tempUpper}℃ · 습도 {humidityLower}~{humidityUpper}%
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-5 py-4">
          {selected && editingId == null ? (
            <IssueDetail
              row={selected}
              year={year}
              month={month}
              canManage={canManage}
              pending={pending}
              onBack={() => {
                setSelectedId(null)
                setForm(emptyForm)
              }}
              onEdit={() => beginEdit(selected)}
              onDelete={() => setDeleteId(selected.id)}
            />
          ) : (
          <>
          {editingId == null && (
          <>
          <section className="grid overflow-hidden rounded-xl border sm:grid-cols-3">
            {STEPS.map((step, index) => (
              <article key={step.title} className="flex flex-col gap-2 border-b p-3 last:border-b-0 sm:border-r sm:border-b-0 sm:last:border-r-0">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold">
                    {index + 1}. {step.title}
                  </p>
                  <span className={cn('rounded-md px-1.5 py-0.5 text-[11px] font-semibold', step.tone)}>{step.due}</span>
                </div>
                <p className="text-xs leading-relaxed text-muted-foreground">{step.body}</p>
              </article>
            ))}
          </section>

          <section className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold">{placeName} · 등록된 이탈 {rows.length}건</h3>
            {rows.length === 0 ? (
              <p className="rounded-lg border border-dashed px-3 py-4 text-sm text-muted-foreground">{placeName}에 이번 달 등록된 이탈 처리가 없습니다.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {rows.map((row) => (
                  <li key={row.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(row.id)}
                      className="flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left hover:bg-muted"
                    >
                      <span className="min-w-0">
                        <span className="block text-sm font-medium">
                          {formatIssueDate(year, month, row.day)}
                          {row.temperature ? ` · 온도 ${row.temperature}℃` : ''}
                          {row.humidity ? ` · 습도 ${row.humidity}%` : ''}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">
                          즉시 조치 {row.immediateAction || '-'}
                          {row.cause ? ` · 원인 ${row.cause}` : ''}
                        </span>
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground">자세히</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
          </>
          )}

          {canManage ? (
            <form onSubmit={onSubmit} className="overflow-hidden rounded-xl border">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/40 px-4 py-3">
                <h3 className="text-sm font-semibold">{editingId == null ? '이탈 처리 입력' : '이탈 처리 수정'}</h3>
                {outliers.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    {outliers.map((entry) => (
                      <button
                        key={entry.day}
                        type="button"
                        onClick={() => applyMeasuredDay(entry.day)}
                        className="rounded-md bg-rose-50 px-2 py-1 text-xs font-medium text-rose-700"
                      >
                        {toDateValue(year, month, entry.day)} {entry.temperature ?? '-'}℃ / {entry.humidity ?? '-'}%
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex flex-col gap-4 p-4">
                <div className="grid gap-3 sm:grid-cols-4">
                  <FieldBlock label="일자">
                    <Input
                      type="date"
                      min={minDate}
                      max={maxDate}
                      value={values.occurredDate}
                      onChange={(event) => {
                        const value = event.target.value
                        const day = dayFromDate(value)
                        if (!day) {
                          setField('occurredDate', value)
                          return
                        }
                        applyMeasuredDay(day, value)
                      }}
                      required
                    />
                  </FieldBlock>
                  <FieldBlock label="온도(℃)">
                    <Input value={values.temperature} onChange={(event) => setField('temperature', event.target.value)} placeholder="25" />
                  </FieldBlock>
                  <FieldBlock label="습도(%)">
                    <Input value={values.humidity} onChange={(event) => setField('humidity', event.target.value)} placeholder="40" />
                  </FieldBlock>
                  <FieldBlock label="확인 시각">
                    <Input type="time" value={values.confirmedAt} onChange={(event) => setField('confirmedAt', event.target.value)} />
                  </FieldBlock>
                </div>
                <ChoiceRow
                  label="즉시 조치"
                  options={IMMEDIATE_ACTIONS}
                  value={values.immediateAction}
                  detail={values.immediateDetail}
                  onChange={(value) => {
                    setField('immediateAction', value)
                    if (value !== '기타') setField('immediateDetail', '')
                  }}
                  onDetailChange={(value) => setField('immediateDetail', value)}
                />
                <div className="grid gap-3 sm:grid-cols-3">
                  <FieldBlock label="대상 LOT">
                    <Input value={values.lot} onChange={(event) => setField('lot', event.target.value)} placeholder="로트 번호" />
                  </FieldBlock>
                  <FieldBlock label="재측정 온도(℃)">
                    <Input value={values.remeasureTemperature ?? ''} onChange={(event) => setField('remeasureTemperature', event.target.value)} placeholder="25" />
                  </FieldBlock>
                  <FieldBlock label="재측정 습도(%)">
                    <Input value={values.remeasureHumidity ?? ''} onChange={(event) => setField('remeasureHumidity', event.target.value)} placeholder="40" />
                  </FieldBlock>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <ChoiceRow label="제품 영향" options={IMPACTS} value={values.productImpact} onChange={(value) => setField('productImpact', value)} />
                  <ChoiceRow
                    label="원인"
                    options={CAUSES}
                    value={values.cause}
                    detail={values.causeDetail}
                    onChange={(value) => {
                      setField('cause', value)
                      if (value !== '기타') setField('causeDetail', '')
                    }}
                    onDetailChange={(value) => setField('causeDetail', value)}
                  />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <FieldBlock label="처리자">
                    <Input value={values.handler} onChange={(event) => setField('handler', event.target.value)} placeholder="이름" />
                  </FieldBlock>
                  <FieldBlock label="승인 (품질팀장)">
                    <Input value={values.approver} onChange={(event) => setField('approver', event.target.value)} placeholder="이름" />
                  </FieldBlock>
                </div>
                <FieldBlock label="비고">
                  <Textarea value={values.note} onChange={(event) => setField('note', event.target.value)} rows={3} placeholder="추가로 남길 내용" />
                </FieldBlock>
              </div>
              <div className="flex justify-end gap-2 border-t bg-muted/30 px-4 py-3">
                {editingId != null && (
                  <Button type="button" variant="outline" disabled={pending} onClick={() => setEditingId(null)}>
                    취소
                  </Button>
                )}
                <Button type="submit" disabled={pending}>
                  {editingId == null && <PlusIcon data-icon="inline-start" />}
                  {editingId == null ? '등록' : '저장'}
                </Button>
              </div>
            </form>
          ) : (
            <p className="text-xs text-muted-foreground">이탈 등록은 편집 권한이 있는 계정에서 할 수 있습니다.</p>
          )}
          </>
          )}
        </div>
      </DialogContent>
    </Dialog>
    <AlertDialog open={deleteId != null} onOpenChange={(next) => { if (!next) setDeleteId(null) }}>
      <AlertDialogContent className="z-[100]">
        <AlertDialogHeader>
          <AlertDialogTitle>삭제하시겠습니까?</AlertDialogTitle>
          <AlertDialogDescription>이 이탈 처리 기록을 삭제합니다. 삭제한 뒤에는 되돌릴 수 없습니다.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>취소</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-white hover:bg-destructive/90"
            disabled={pending}
            onClick={() => {
              if (deleteId == null) return
              const id = deleteId
              setDeleteId(null)
              onDelete(id)
            }}
          >
            삭제
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  )
}
