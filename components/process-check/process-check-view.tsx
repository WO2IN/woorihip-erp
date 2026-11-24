'use client'

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  CalendarCheck,
  Check,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  History,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Trash2,
  TrendingUp,
  TriangleAlert,
  X,
  type LucideIcon,
} from 'lucide-react'
import { toast } from 'sonner'
import { canOperateFloor, homeFloor } from '@/lib/access'
import { Button } from '@/components/ui/button'
import { BAND_BUTTON, BAND_BUTTON_PRIMARY, PAGE_SHELL, PageHeader } from '@/components/shared/page-header'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { useAuth } from '@/components/auth/auth-context'
import { useSecretToggle } from '@/hooks/use-secret-toggle'
import { getAuthHeaders, getJsonAuthHeaders } from '@/lib/auth-client'
import { useDataChanged } from '@/lib/data-events'
import { cn } from '@/lib/utils'
import { ProcessTrend } from '@/components/process-check/process-trend'
import {
  PROCESS_CHECK_FIELDS,
  PROCESS_CHECK_SECTIONS,
  PROCESS_LINES,
  ProcessAnswer,
  ProcessCheckRecord,
  ProcessFieldSpec,
  ProcessFloor,
  ProcessLineId,
  ProcessTemplate,
  countFilled,
  emptyAnswers,
  answersForDisplay,
  isOutOfRange,
  processValuesRevealed,
  mergeAnswers,
  recordFloor,
  recordLineId,
  choiceAllowsMultiple,
  displayProcessAnswer,
  joinChoiceAnswer,
  sectionsOf,
  splitChoiceAnswer,
} from '@/lib/process-checklist'

type Screen = 'board' | 'form' | 'template'

const hubHref = (floor?: ProcessFloor | null) => (floor ? `/checksheets?floor=${floor}&tab=process` : '/checksheets?tab=process')

type LineModel = {
  id: string
  name: string
  company: string
  summary: string
  custom: boolean
  /** DB에 저장된 점검표인지 (기본 제공 라인은 부서·점검자를 저장할 수 없다). */
  saved: boolean
  department: string
  inspector: string
  sections: { id: string; title: string; fields: ProcessFieldSpec[] }[]
  fields: ProcessFieldSpec[]
  chartFields: { id: string; label: string; unit: string }[]
}

function lineModel(id: string, templates: ProcessTemplate[]): LineModel | null {
  const template = templates.find((item) => item.id === id)
  const builtin = template ? undefined : PROCESS_LINES.find((item) => item.id === id)
  if (builtin) {
    return {
      id: builtin.id,
      name: builtin.product,
      company: builtin.company,
      summary: builtin.summary,
      custom: true,
      saved: false,
      department: '',
      inspector: '',
      sections: PROCESS_CHECK_SECTIONS,
      fields: PROCESS_CHECK_FIELDS,
      chartFields: PROCESS_CHECK_SECTIONS.flatMap((section) =>
        section.fields
          .filter((item) => item.type === 'number')
          .map((item) => ({ id: item.id, label: `${section.title} ${item.label}`, unit: item.unit || '' })),
      ),
    }
  }
  if (!template) return null
  const sections = sectionsOf(template)
  const fields = sections.flatMap((section) => section.fields)
  const chartFields = sections.flatMap((section) =>
    section.fields
      .filter((item) => item.type === 'number')
      .map((item) => ({ id: item.id, label: `${section.title} ${item.label}`, unit: item.unit || '' })),
  )
  return {
    id: template.id,
    name: template.name,
    company: '',
    summary: `직접 만든 점검 · 큰 항목 ${sections.length}개 · 항목 ${fields.length}개`,
    custom: true,
    saved: true,
    department: template.department?.trim() ?? '',
    inspector: template.inspector?.trim() ?? '',
    sections,
    fields,
    chartFields,
  }
}

function seoulClock(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now)
  const pick = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? ''
  const hour = pick('hour') === '24' ? '00' : pick('hour')
  return { date: `${pick('year')}-${pick('month')}-${pick('day')}`, time: `${hour}:${pick('minute')}` }
}

function nowDate() {
  return seoulClock().date
}

function nowTime() {
  return seoulClock().time
}

export function ProcessCheckView() {
  const router = useRouter()
  const { user } = useAuth()
  const [secretReveal] = useSecretToggle()
  const home = homeFloor(user)
  const [floor, setFloor] = useState<ProcessFloor>(home ?? 1)
  const editable = canOperateFloor(user, floor)
  const [lineId, setLineId] = useState<ProcessLineId | null>(null)
  const [screen, setScreen] = useState<Screen>('board')
  const [records, setRecords] = useState<ProcessCheckRecord[]>([])
  const [templates, setTemplates] = useState<ProcessTemplate[]>([])
  const [hiddenLines, setHiddenLines] = useState<string[]>([])
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [viewing, setViewing] = useState<ProcessCheckRecord | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const openedFromQuery = useRef(false)

  useEffect(() => {
    if (openedFromQuery.current || loading) return
    const params = new URLSearchParams(window.location.search)
    const requestedLine = params.get('line')
    const requestedFloor = Number(params.get('floor'))
    const hasFloor = requestedFloor === 1 || requestedFloor === 2 || requestedFloor === 3
    const wantsCreate = params.get('create') === '1'
    if (wantsCreate && !user) return
    openedFromQuery.current = true
    const queryFloor = hasFloor ? requestedFloor as ProcessFloor : null
    if (queryFloor) setFloor(queryFloor)
    if (wantsCreate && queryFloor && canOperateFloor(user, queryFloor)) {
      setEditingTemplateId(null)
      setScreen('template')
      return
    }
    const model = requestedLine ? lineModel(requestedLine, templates) : null
    if (!requestedLine || !model) {
      router.replace(hubHref(queryFloor))
      return
    }
    const template = templates.find((item) => item.id === requestedLine)
    setFloor(queryFloor ?? template?.floor ?? home ?? 1)
    setLineId(requestedLine)
    setScreen('board')
  }, [loading, templates, user, router, home])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/process-checks', {
        cache: 'no-store',
        headers: getAuthHeaders(),
      })
      if (!response.ok) throw new Error('기록을 불러오지 못했습니다.')
      const result = await response.json()
      setRecords(result.data || [])
      const templatesResponse = await fetch('/api/process-templates', {
        cache: 'no-store',
        headers: getAuthHeaders(),
      })
      if (templatesResponse.ok) {
        const templatesResult = await templatesResponse.json()
        setTemplates(templatesResult.data || [])
        setHiddenLines(Array.isArray(templatesResult.hidden) ? templatesResult.hidden : [])
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '기록을 불러오지 못했습니다.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])
  useDataChanged(() => void load(), [load])

  const line = lineId ? lineModel(lineId, templates) : null
  const lineRecords = line
    ? records.filter((record) => recordFloor(record) === floor && recordLineId(record) === line.id)
    : []
  const goHub = () => router.push(hubHref(floor))

  const removeTemplate = async (id: string) => {
    if (!window.confirm('이 점검표를 삭제하시겠습니까? 이미 저장된 기록은 목록에서 빠집니다.')) return
    try {
      const response = await fetch('/api/process-templates', {
        method: 'DELETE',
        headers: getJsonAuthHeaders(),
        body: JSON.stringify({ id }),
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(result.error || '삭제에 실패했습니다.')
      toast.success('점검표를 삭제했습니다.')
      if (lineId === id) {
        goHub()
        return
      }
      await load()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '삭제에 실패했습니다.')
    }
  }

  const remove = async (id: string) => {
    if (!window.confirm('이 공정 점검 기록을 삭제하시겠습니까?')) return
    try {
      const response = await fetch('/api/process-checks', {
        method: 'DELETE',
        headers: getJsonAuthHeaders(),
        body: JSON.stringify({ id }),
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(result.error || '삭제에 실패했습니다.')
      toast.success('기록을 삭제했습니다.')
      if (viewing?.id === id) setViewing(null)
      await load()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '삭제에 실패했습니다.')
    }
  }

  const goBack = () => {
    setViewing(null)
    setEditingId(null)
    if (screen === 'form') {
      setScreen('board')
      return
    }
    if (screen === 'template' && editingTemplateId) {
      setEditingTemplateId(null)
      setScreen('board')
      return
    }
    goHub()
  }
  const startRecord = () => {
    setEditingId(null)
    setViewing(null)
    setScreen('form')
  }
  const readonlyNote = user?.role === 'viewer'
    ? '뷰어 계정은 점검 기록을 보기만 할 수 있습니다.'
    : home != null && !editable
      ? `${floor}층은 조회만 가능합니다. 기록과 점검표 수정은 ${home}층에서만 할 수 있습니다.`
      : ''

  return (
    <main className={PAGE_SHELL}>
      <PageHeader
        tone="amber"
        icon={ClipboardCheck}
        eyebrow="PROCESS CHECK · 공정 점검"
        title={screen === 'template' && !editingTemplateId ? '새 점검표' : line?.name ?? '공정 점검'}
        description={
          <>
            {screen === 'board' && line && `${floor}층 · ${line.company ? `${line.company} · ` : ''}${line.department || '부서 미지정'} · ${line.inspector || '점검자 미지정'} · 항목 ${line.fields.length}개${editable ? '' : ' · 조회만 가능'}`}
            {screen === 'form' && (editingId ? '점검 기록을 수정합니다.' : '새 점검 기록을 작성합니다.')}
            {screen === 'template' && (editingTemplateId ? '점검 항목을 수정합니다.' : `${floor}층에 새 점검표와 항목을 만듭니다.`)}
          </>
        }
        leading={
          <Button variant="outline" size="icon" className={BAND_BUTTON} aria-label="뒤로" onClick={goBack}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
        }
        actions={screen === 'board' && line ? (
          <>
            <Button variant="outline" size="icon" className={BAND_BUTTON} aria-label="새로고침" title="새로고침" onClick={() => void load()}>
              <RefreshCw className="h-4 w-4" />
            </Button>
            {editable && line.custom && (
              <Button
                variant="outline"
                className={BAND_BUTTON}
                onClick={() => {
                  setEditingTemplateId(line.id)
                  setScreen('template')
                }}
              >
                <Pencil className="h-4 w-4 sm:mr-1.5" /> <span className="hidden sm:inline">항목 수정</span>
              </Button>
            )}
            {editable && (
              <Button variant="outline" className={BAND_BUTTON} aria-label="점검표 삭제" onClick={() => void removeTemplate(line.id)}>
                <Trash2 className="h-4 w-4 sm:mr-1.5" /> <span className="hidden sm:inline">점검표 삭제</span>
              </Button>
            )}
            {editable && (
              <Button className={cn(BAND_BUTTON_PRIMARY, 'hidden md:inline-flex')} onClick={startRecord}>
                <Plus className="mr-1.5 h-4 w-4" /> 기록하기
              </Button>
            )}
          </>
        ) : undefined}
      />

      {readonlyNote && screen === 'board' && (
        <p className="rounded-xl border border-dashed bg-muted/30 px-4 py-2.5 text-sm text-muted-foreground">{readonlyNote}</p>
      )}

      {screen === 'template' && (
        <TemplateEditor
          floor={floor}
          template={templates.find((item) => item.id === editingTemplateId) ?? null}
          onDone={(id) => {
            setEditingTemplateId(null)
            if (!id) {
              goHub()
              return
            }
            setLineId(id)
            setScreen('board')
            router.replace(`/process-check?floor=${floor}&line=${encodeURIComponent(id)}`)
            void load()
          }}
        />
      )}

      {screen !== 'template' && !line && (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-24 rounded-2xl" />)}
          </div>
          <Skeleton className="h-28 rounded-2xl" />
          <Skeleton className="h-72 rounded-2xl" />
        </div>
      )}

      {screen === 'form' && line && (
        <RecordForm
          floor={floor}
          line={line}
          editable={editable}
          secretReveal={secretReveal}
          editing={lineRecords.find((record) => record.id === editingId) ?? null}
          onCancel={() => {
            setEditingId(null)
            setScreen('board')
          }}
          onDone={() => {
            setEditingId(null)
            setScreen('board')
            void load()
          }}
        />
      )}

      {screen === 'board' && line && (
        <LineBoard
          loading={loading}
          line={line}
          records={lineRecords}
          editable={editable}
          secretReveal={secretReveal}
          viewing={viewing}
          onCreate={startRecord}
          onView={setViewing}
          onEdit={(record) => {
            setEditingId(record.id)
            setViewing(null)
            setScreen('form')
          }}
          onDelete={remove}
        />
      )}
    </main>
  )
}

function sortDesc(records: ProcessCheckRecord[]) {
  return [...records].sort((a, b) => `${b.writtenDate} ${b.writtenTime}`.localeCompare(`${a.writtenDate} ${a.writtenTime}`))
}

function recordIssues(record: ProcessCheckRecord, fields: ProcessFieldSpec[], secretReveal = false) {
  const answers = answersForDisplay(record, fields, secretReveal)
  const revealed = processValuesRevealed(record, secretReveal)
  let out = 0
  let no = 0
  for (const field of fields) {
    const value = answers[field.id]
    if (revealed && isOutOfRange(field, record.answers[field.id], true)) out += 1
    if (field.type === 'yesno' && value === 'no') no += 1
  }
  return { out, no }
}

function recordIssuesFromAnswers(answers: Record<string, ProcessAnswer>, fields: ProcessFieldSpec[], checkDeviation = true) {
  let out = 0
  let no = 0
  for (const field of fields) {
    const value = answers[field.id]
    if (checkDeviation && isOutOfRange(field, value, true)) out += 1
    if (field.type === 'yesno' && value === 'no') no += 1
  }
  return { out, no }
}

function ResultChips({ out, no }: { out: number; no: number }) {
  if (!out && !no) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-900">
        <Check className="size-3" /> 정상
      </span>
    )
  }
  return (
    <span className="flex flex-wrap justify-end gap-1">
      {out > 0 && (
        <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 text-xs font-semibold text-rose-700 ring-1 ring-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:ring-rose-900">
          <TriangleAlert className="size-3" /> 이탈 {out}
        </span>
      )}
      {no > 0 && (
        <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700 ring-1 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-900">
          No {no}
        </span>
      )}
    </span>
  )
}

const KPI_TONE = {
  emerald: { tile: 'bg-emerald-500/12 text-emerald-600 dark:text-emerald-400', value: 'text-emerald-600 dark:text-emerald-400', bar: 'bg-emerald-500' },
  amber: { tile: 'bg-amber-500/15 text-amber-600 dark:text-amber-400', value: 'text-amber-600 dark:text-amber-400', bar: 'bg-amber-500' },
  rose: { tile: 'bg-rose-500/12 text-rose-600 dark:text-rose-400', value: 'text-rose-600 dark:text-rose-400', bar: 'bg-rose-500' },
  violet: { tile: 'bg-violet-500/12 text-violet-600 dark:text-violet-400', value: 'text-foreground', bar: 'bg-violet-500' },
  slate: { tile: 'bg-muted text-muted-foreground', value: 'text-foreground', bar: 'bg-foreground/40' },
} as const

/** 규격 준수율 색: 100% 초록 → 노랑 → 주황 → 70% 이하 빨강으로 연속 변화 */
const PASS_RATE_RED_AT = 70

function passRateColor(rate: number) {
  const ratio = Math.min(1, Math.max(0, (rate - PASS_RATE_RED_AT) / (100 - PASS_RATE_RED_AT)))
  const hue = Math.round(ratio * 140)
  return { main: `hsl(${hue} 78% 40%)`, soft: `hsl(${hue} 78% 45% / 0.14)` }
}

function BoardKpi({
  icon: Icon,
  label,
  value,
  unit,
  sub,
  tone,
  progress,
  color,
}: {
  icon: LucideIcon
  label: string
  value: string
  unit?: string
  sub: string
  tone: keyof typeof KPI_TONE
  progress?: number
  /** 지정하면 tone 색 대신 이 색을 쓴다. */
  color?: { main: string; soft: string }
}) {
  const style = KPI_TONE[tone]
  return (
    <div className="flex flex-col gap-3 rounded-2xl border bg-card p-4 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold text-muted-foreground">{label}</p>
        <span
          className={cn('grid size-8 shrink-0 place-items-center rounded-lg', !color && style.tile)}
          style={color ? { backgroundColor: color.soft, color: color.main } : undefined}
        >
          <Icon className="size-4" />
        </span>
      </div>
      <div className="min-w-0">
        <p
          className={cn('truncate text-2xl font-extrabold leading-none tracking-tight tabular-nums', !color && style.value)}
          style={color ? { color: color.main } : undefined}
        >
          {value}
          {unit && <span className="ml-0.5 text-sm font-semibold text-muted-foreground">{unit}</span>}
        </p>
        <p className="mt-1.5 truncate text-[11px] text-muted-foreground">{sub}</p>
      </div>
      {progress != null && (
        <div className="h-1.5 overflow-hidden rounded-full bg-muted">
          <div
            className={cn('h-full rounded-full transition-all', !color && style.bar)}
            style={{ width: `${Math.min(100, Math.max(0, progress))}%`, ...(color ? { backgroundColor: color.main } : {}) }}
          />
        </div>
      )}
    </div>
  )
}

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']
const ACTIVITY_DAYS = 30

function shiftDate(date: string, days: number) {
  const value = new Date(`${date}T00:00:00Z`)
  value.setUTCDate(value.getUTCDate() + days)
  return value.toISOString().slice(0, 10)
}

function weekdayOf(date: string) {
  return new Date(`${date}T00:00:00Z`).getUTCDay()
}

type ActivityDay = { date: string; count: number; out: number; no: number; weekend: boolean }

function ActivityStrip({
  days,
  today,
  coverage,
  selected,
  onPick,
}: {
  days: ActivityDay[]
  today: string
  coverage: number
  selected: string
  onPick: (date: string) => void
}) {
  return (
    <section className="rounded-2xl border bg-card p-4 shadow-sm">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <span className="grid size-6 place-items-center rounded-md bg-amber-500/15 text-amber-600 dark:text-amber-400">
            <CalendarCheck className="size-3.5" />
          </span>
          최근 30일 점검 현황
          <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground tabular-nums">평일 기록률 {coverage}%</span>
        </h2>
        <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1"><span className="size-2.5 rounded-sm bg-emerald-500" /> 정상</span>
          <span className="flex items-center gap-1"><span className="size-2.5 rounded-sm bg-amber-400" /> No 포함</span>
          <span className="flex items-center gap-1"><span className="size-2.5 rounded-sm bg-rose-500" /> 이탈 포함</span>
          <span className="flex items-center gap-1"><span className="size-2.5 rounded-sm bg-muted ring-1 ring-inset ring-border" /> 미기록</span>
        </div>
      </div>
      <div className="flex gap-[3px] sm:gap-1">
        {days.map((day) => {
          const color = day.count === 0
            ? day.weekend ? 'bg-muted/40' : 'bg-muted ring-1 ring-inset ring-border'
            : day.out > 0 ? 'bg-rose-500' : day.no > 0 ? 'bg-amber-400' : 'bg-emerald-500'
          return (
            <button
              key={day.date}
              type="button"
              disabled={day.count === 0}
              title={`${day.date} (${WEEKDAYS[weekdayOf(day.date)]}) · ${day.count ? `기록 ${day.count}건` : day.weekend ? '주말' : '기록 없음'}`}
              onClick={() => onPick(selected === day.date ? '' : day.date)}
              className="group flex min-w-0 flex-1 flex-col items-center gap-1 disabled:cursor-default"
            >
              <span
                className={cn(
                  'h-8 w-full rounded-[5px] transition-transform group-enabled:group-hover:scale-y-110 sm:h-10',
                  color,
                  day.date === today && 'outline-2 outline-offset-2 outline-amber-500',
                  selected === day.date && 'ring-2 ring-foreground/70 ring-offset-1 ring-offset-card',
                )}
              />
              <span
                className={cn(
                  'hidden text-[10px] leading-none tabular-nums sm:block',
                  day.date === today ? 'font-bold text-amber-600 dark:text-amber-400' : day.weekend ? 'text-muted-foreground/50' : 'text-muted-foreground',
                )}
              >
                {Number(day.date.slice(8))}
              </span>
            </button>
          )
        })}
      </div>
      <div className="mt-1.5 flex justify-between text-[10px] text-muted-foreground tabular-nums sm:hidden">
        <span>{days[0]?.date.slice(5).replace('-', '.')}</span>
        <span className="font-semibold text-amber-600 dark:text-amber-400">오늘</span>
      </div>
    </section>
  )
}

const RECORDS_PER_PAGE = 10

function RecordListPagination({
  page,
  totalPages,
  total,
  onPage,
}: {
  page: number
  totalPages: number
  total: number
  onPage: (page: number) => void
}) {
  if (totalPages <= 1) return null
  const from = (page - 1) * RECORDS_PER_PAGE + 1
  const to = Math.min(page * RECORDS_PER_PAGE, total)
  const pages = useMemo(() => {
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, index) => index + 1)
    const set = new Set<number>([1, totalPages, page, page - 1, page + 1])
    const ordered = [...set].filter((value) => value >= 1 && value <= totalPages).sort((a, b) => a - b)
    const out: (number | 'gap')[] = []
    for (let index = 0; index < ordered.length; index += 1) {
      if (index > 0 && ordered[index] - ordered[index - 1] > 1) out.push('gap')
      out.push(ordered[index])
    }
    return out
  }, [page, totalPages])

  return (
    <div className="flex flex-col gap-2 border-t px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-center text-xs text-muted-foreground tabular-nums sm:text-left">
        {from}–{to}번째 · 전체 {total}건
      </p>
      <nav className="flex items-center justify-center gap-1" aria-label="점검 기록 페이지">
        <Button type="button" variant="outline" size="icon-sm" disabled={page <= 1} aria-label="이전 페이지" onClick={() => onPage(page - 1)}>
          <ChevronLeft className="size-4" />
        </Button>
        {pages.map((item, index) =>
          item === 'gap' ? (
            <span key={`gap-${index}`} className="px-1 text-muted-foreground" aria-hidden>
              …
            </span>
          ) : (
            <Button
              key={item}
              type="button"
              variant={item === page ? 'default' : 'outline'}
              size="sm"
              className="min-w-9 px-2 tabular-nums"
              aria-current={item === page ? 'page' : undefined}
              onClick={() => onPage(item)}
            >
              {item}
            </Button>
          ),
        )}
        <Button type="button" variant="outline" size="icon-sm" disabled={page >= totalPages} aria-label="다음 페이지" onClick={() => onPage(page + 1)}>
          <ChevronRight className="size-4" />
        </Button>
      </nav>
    </div>
  )
}

function LineBoard({
  loading,
  line,
  records,
  editable,
  secretReveal,
  viewing,
  onCreate,
  onView,
  onEdit,
  onDelete,
}: {
  loading: boolean
  line: LineModel
  records: ProcessCheckRecord[]
  editable: boolean
  secretReveal: boolean
  viewing: ProcessCheckRecord | null
  onCreate: () => void
  onView: (record: ProcessCheckRecord | null) => void
  onEdit: (record: ProcessCheckRecord) => void
  onDelete: (id: string) => void
}) {
  const chartSections = useMemo(
    () => line.sections.filter((section) => section.fields.some((field) => field.type === 'number')),
    [line.sections],
  )
  const [sectionId, setSectionId] = useState(() => chartSections[0]?.id ?? '')
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)
  const [dateOrder, setDateOrder] = useState<'desc' | 'asc'>('desc')
  useEffect(() => {
    setSectionId((current) => {
      if (chartSections.length === 0) return ''
      if (chartSections.some((section) => section.id === current)) return current
      return chartSections[0].id
    })
  }, [line.id, chartSections])
  const selectedSection = chartSections.find((section) => section.id === sectionId) ?? chartSections[0]
  const selectedNumbers = selectedSection?.fields.filter((field) => field.type === 'number') ?? []

  const sorted = useMemo(
    () => sortDesc(records).map((record) => ({ record, issues: recordIssues(record, line.fields, secretReveal) })),
    [records, line.fields, secretReveal],
  )
  const today = nowDate()
  const todayRecords = sorted.filter(({ record }) => record.writtenDate === today)
  const issueCount = sorted.filter(({ issues }) => issues.out > 0).length
  // 규격 준수율은 기록 단위가 아니라 "점검한 수치 항목" 단위로 센다. (항목 46개 중 1개 이탈 → 97.8%)
  const { judgedItems, outItems } = useMemo(() => {
    let judged = 0
    for (const { record } of sorted) {
      for (const field of line.fields) {
        const value = record.answers[field.id]
        if (field.type === 'number' && typeof value === 'number' && !Number.isNaN(value)) judged += 1
      }
    }
    return { judgedItems: judged, outItems: sorted.reduce((sum, { issues }) => sum + issues.out, 0) }
  }, [sorted, line.fields])
  const passRate = judgedItems ? Math.round(((judgedItems - outItems) / judgedItems) * 1000) / 10 : 100
  const latest = sorted[0]?.record
  const oldest = sorted.at(-1)?.record
  const latestOutSections = useMemo(
    () => new Set(latest ? line.sections.filter((section) => recordIssues(latest, section.fields, secretReveal).out > 0).map((section) => section.id) : []),
    [latest, line.sections, secretReveal],
  )

  const days = useMemo<ActivityDay[]>(() => {
    const byDate = new Map<string, { count: number; out: number; no: number }>()
    for (const { record, issues } of sorted) {
      const entry = byDate.get(record.writtenDate) ?? { count: 0, out: 0, no: 0 }
      entry.count += 1
      if (issues.out) entry.out += 1
      if (issues.no) entry.no += 1
      byDate.set(record.writtenDate, entry)
    }
    return Array.from({ length: ACTIVITY_DAYS }, (_, index) => {
      const date = shiftDate(today, index - ACTIVITY_DAYS + 1)
      const weekday = weekdayOf(date)
      return { date, weekend: weekday === 0 || weekday === 6, ...(byDate.get(date) ?? { count: 0, out: 0, no: 0 }) }
    })
  }, [sorted, today])
  const workdays = days.filter((day) => !day.weekend)
  const coverage = workdays.length ? Math.round((workdays.filter((day) => day.count > 0).length / workdays.length) * 100) : 0

  const keyword = query.trim().toLowerCase()
  const filtered = sorted.filter(({ record }) => {
    if (!keyword) return true
    return `${record.writtenDate} ${record.writtenTime} ${record.author}`.toLowerCase().includes(keyword)
  })
  const listed = dateOrder === 'desc' ? filtered : [...filtered].reverse()
  const totalPages = Math.max(1, Math.ceil(listed.length / RECORDS_PER_PAGE))
  const pageItems = listed.slice((page - 1) * RECORDS_PER_PAGE, page * RECORDS_PER_PAGE)
  useEffect(() => {
    setPage((current) => Math.min(current, totalPages))
  }, [totalPages])
  const resetQuery = (value: string) => {
    setQuery(value)
    setPage(1)
  }
  const goPage = (next: number) => setPage(Math.min(totalPages, Math.max(1, next)))

  return (
    <div className="flex flex-col gap-4 pb-20 md:pb-0">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <BoardKpi
          icon={CalendarCheck}
          label="오늘 점검"
          value={todayRecords.length ? '완료' : '미점검'}
          sub={todayRecords[0] ? `${todayRecords[0].record.writtenTime} · ${todayRecords[0].record.author}${todayRecords.length > 1 ? ` 외 ${todayRecords.length - 1}건` : ''}` : '오늘 아직 기록이 없습니다'}
          tone={todayRecords.length ? 'emerald' : 'amber'}
        />
        <BoardKpi
          icon={TrendingUp}
          label="평일 기록률 (30일)"
          value={String(coverage)}
          unit="%"
          sub={`평일 ${workdays.length}일 중 ${workdays.filter((day) => day.count > 0).length}일 기록`}
          tone="violet"
          progress={coverage}
        />
        <BoardKpi
          icon={ShieldCheck}
          label="규격 준수율"
          value={judgedItems ? passRate.toFixed(1) : '-'}
          unit={judgedItems ? '%' : undefined}
          sub={outItems ? `이탈 ${outItems}개 / 점검 항목 ${judgedItems}개 · 이탈 기록 ${issueCount}건` : '수치 이탈 없음'}
          tone="slate"
          color={judgedItems ? passRateColor(passRate) : undefined}
          progress={judgedItems ? passRate : undefined}
        />
        <BoardKpi
          icon={History}
          label="누적 기록"
          value={String(sorted.length)}
          unit="건"
          sub={oldest ? `${oldest.writtenDate.replaceAll('-', '.')}부터` : '기록 없음'}
          tone="slate"
        />
      </div>

      <ActivityStrip days={days} today={today} coverage={coverage} selected={query.trim()} onPick={resetQuery} />

      {chartSections.length > 0 && selectedSection && (
        <section className="overflow-hidden rounded-2xl border bg-card shadow-sm">
          <div className="flex flex-col gap-3 border-b bg-linear-to-b from-muted/50 to-transparent px-4 py-3.5">
            <div>
              <h2 className="flex items-center gap-2 text-sm font-semibold">
                <span className="grid size-6 place-items-center rounded-md bg-violet-500/12 text-violet-600 dark:text-violet-400">
                  <TrendingUp className="size-3.5" />
                </span>
                수치 추이
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">최근 20회 기록 · 초록 띠는 기준 범위, 빨간 점은 범위를 벗어난 값입니다.</p>
            </div>
            <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5">
              {chartSections.map((section) => {
                const index = line.sections.findIndex((item) => item.id === section.id)
                const active = section.id === selectedSection.id
                const warn = latestOutSections.has(section.id)
                return (
                  <button
                    key={section.id}
                    type="button"
                    onClick={() => setSectionId(section.id)}
                    className={cn(
                      'flex shrink-0 items-center gap-1.5 rounded-full border py-1 pl-1 pr-3 text-sm font-medium transition-all',
                      active
                        ? 'border-violet-600 bg-violet-600 text-white shadow-sm shadow-violet-600/25 dark:border-violet-500 dark:bg-violet-500'
                        : 'bg-card text-muted-foreground hover:border-violet-300 hover:text-foreground dark:hover:border-violet-700',
                    )}
                  >
                    <span
                      className={cn(
                        'grid size-5 place-items-center rounded-full text-[11px] font-bold tabular-nums',
                        active ? 'bg-white/20 text-white' : 'bg-muted text-muted-foreground',
                      )}
                    >
                      {index + 1}
                    </span>
                    {section.title}
                    {warn && <span className={cn('size-1.5 rounded-full', active ? 'bg-white' : 'bg-rose-500')} aria-label="최근 기록 이탈" />}
                  </button>
                )
              })}
            </div>
          </div>
          <div className="flex gap-3 overflow-x-auto p-4 [-ms-overflow-style:none] [scrollbar-width:thin]">
            {selectedNumbers.map((field) => (
              <div key={field.id} className="min-w-[min(100%,14.5rem)] flex-1 shrink-0 sm:min-w-[16rem]">
                <ProcessTrend title={field.label} field={field} records={records} reveal={secretReveal} />
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="overflow-hidden rounded-2xl border bg-card shadow-sm">
        <div className="flex flex-col gap-3 border-b px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <span className="grid size-6 place-items-center rounded-md bg-sky-500/12 text-sky-600 dark:text-sky-400">
              <History className="size-3.5" />
            </span>
            점검 기록
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground tabular-nums">
              {filtered.length === sorted.length ? `${sorted.length}건` : `${filtered.length} / ${sorted.length}건`}
            </span>
          </h2>
          <div className="flex items-center gap-2">
            <div className="relative flex-1 sm:w-60 sm:flex-none">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => resetQuery(event.target.value)}
                placeholder="날짜·작성자 검색"
                className="h-9 pl-8 pr-8"
              />
              {query && (
                <button
                  type="button"
                  aria-label="검색어 지우기"
                  onClick={() => resetQuery('')}
                  className="absolute right-1.5 top-1/2 grid size-6 -translate-y-1/2 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <X className="size-3.5" />
                </button>
              )}
            </div>
            <Button
              variant="outline"
              size="sm"
              className="h-9 md:hidden"
              onClick={() => { setDateOrder((value) => (value === 'desc' ? 'asc' : 'desc')); setPage(1) }}
            >
              {dateOrder === 'desc' ? <ArrowDown className="size-3.5" /> : <ArrowUp className="size-3.5" />}
              {dateOrder === 'desc' ? '최신순' : '오래된순'}
            </Button>
          </div>
        </div>

        {loading && sorted.length === 0 ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 3 }).map((_, index) => <Skeleton key={index} className="h-14 w-full rounded-xl" />)}
          </div>
        ) : sorted.length === 0 ? (
          <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
            <span className="grid size-12 place-items-center rounded-2xl bg-amber-500/15 text-amber-600 dark:text-amber-400">
              <ClipboardCheck className="size-6" />
            </span>
            <div>
              <p className="font-semibold">아직 기록이 없습니다.</p>
              <p className="mt-1 text-sm text-muted-foreground">현장에서 휴대폰으로 ‘기록하기’를 눌러 첫 점검을 남겨보세요.</p>
            </div>
            {editable && (
              <Button className="hidden md:inline-flex" onClick={onCreate}>
                <Plus className="mr-1.5 h-4 w-4" /> 첫 기록 남기기
              </Button>
            )}
          </div>
        ) : filtered.length === 0 ? (
          <p className="px-6 py-12 text-center text-sm text-muted-foreground">조건에 맞는 기록이 없습니다.</p>
        ) : (
          <>
            <div className="hidden grid-cols-[minmax(0,15rem)_minmax(0,11rem)_minmax(0,1fr)_8rem] gap-4 border-b bg-muted/40 py-2 pl-6 pr-4 text-xs font-semibold text-muted-foreground md:grid">
              <button
                type="button"
                onClick={() => { setDateOrder((value) => (value === 'desc' ? 'asc' : 'desc')); setPage(1) }}
                className="inline-flex items-center gap-1 whitespace-nowrap text-left text-foreground hover:text-violet-700 dark:hover:text-violet-300"
                aria-label={dateOrder === 'desc' ? '점검 일시 내림차순. 오름차순으로 바꾸기' : '점검 일시 오름차순. 내림차순으로 바꾸기'}
              >
                점검 일시
                {dateOrder === 'desc' ? <ArrowDown className="size-3.5" /> : <ArrowUp className="size-3.5" />}
              </button>
              <span>작성자</span>
              <span>입력 항목</span>
              <span className="text-right">결과</span>
            </div>
            <ul className="divide-y">
              {pageItems.map(({ record, issues }) => {
                const filled = countFilled(record.answers, line.fields)
                const percent = line.fields.length ? (filled / line.fields.length) * 100 : 0
                const isToday = record.writtenDate === today
                return (
                  <li key={record.id}>
                    <button
                      type="button"
                      onClick={() => onView(record)}
                      className="group relative flex w-full items-center gap-3 py-3 pl-6 pr-4 text-left transition-colors hover:bg-muted/40 md:grid md:grid-cols-[minmax(0,15rem)_minmax(0,11rem)_minmax(0,1fr)_8rem] md:gap-4"
                    >
                      <span
                        className={cn(
                          'absolute inset-y-2.5 left-2 w-1 rounded-full',
                          issues.out ? 'bg-rose-500' : issues.no ? 'bg-amber-400' : 'bg-emerald-500',
                        )}
                        aria-hidden
                      />
                      <span className="flex min-w-0 flex-1 items-center gap-3">
                        <span
                          className={cn(
                            'flex size-11 shrink-0 flex-col items-center justify-center rounded-xl border leading-none',
                            isToday ? 'border-amber-300 bg-amber-50 dark:border-amber-500/40 dark:bg-amber-500/10' : 'bg-background',
                          )}
                        >
                          <span className="text-[10px] font-medium text-muted-foreground">{Number(record.writtenDate.slice(5, 7))}월</span>
                          <span className="mt-0.5 text-base font-bold tabular-nums">{Number(record.writtenDate.slice(8))}</span>
                        </span>
                        <span className="min-w-0">
                          <span className="flex items-center gap-1.5 text-sm font-semibold">
                            {WEEKDAYS[weekdayOf(record.writtenDate)]}요일
                            <span className="font-normal text-muted-foreground tabular-nums">{record.writtenTime}</span>
                            {isToday && <span className="rounded-full bg-amber-500/15 px-1.5 py-px text-[10px] font-bold text-amber-700 dark:text-amber-300">오늘</span>}
                          </span>
                          <span className="block truncate text-xs text-muted-foreground md:hidden">
                            {record.author} · 입력 {filled}/{line.fields.length}
                          </span>
                          <span className="hidden text-xs text-muted-foreground tabular-nums md:block">{record.writtenDate.replaceAll('-', '.')}</span>
                        </span>
                      </span>
                      <span className="hidden min-w-0 items-center gap-2 md:flex">
                        <span className="grid size-7 shrink-0 place-items-center rounded-full bg-violet-500/12 text-xs font-bold text-violet-700 dark:text-violet-300">
                          {record.author.trim().slice(0, 1) || '?'}
                        </span>
                        <span className="truncate text-sm">{record.author}</span>
                      </span>
                      <span className="hidden items-center gap-2 md:flex">
                        <span className="h-1.5 w-28 overflow-hidden rounded-full bg-muted">
                          <span
                            className={cn('block h-full rounded-full', percent >= 100 ? 'bg-emerald-500' : 'bg-violet-500')}
                            style={{ width: `${percent}%` }}
                          />
                        </span>
                        <span className="text-xs text-muted-foreground tabular-nums">{filled}/{line.fields.length}</span>
                      </span>
                      <span className="shrink-0 md:flex md:justify-end">
                        <ResultChips {...issues} />
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
            <RecordListPagination page={page} totalPages={totalPages} total={listed.length} onPage={goPage} />
          </>
        )}
      </section>

      <RecordDialog
        record={viewing}
        line={line}
        list={listed.map(({ record }) => record)}
        editable={editable}
        secretReveal={secretReveal}
        onView={onView}
        onEdit={onEdit}
        onDelete={onDelete}
      />

      {editable && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur md:hidden">
          <Button className="h-12 w-full rounded-xl text-base shadow-sm" onClick={onCreate}>
            <Plus className="mr-2 h-5 w-5" /> {todayRecords.length ? '추가 기록하기' : '오늘 점검 기록하기'}
          </Button>
        </div>
      )}
    </div>
  )
}

function RecordDialog({
  record,
  line,
  list,
  editable,
  secretReveal,
  onView,
  onEdit,
  onDelete,
}: {
  record: ProcessCheckRecord | null
  line: LineModel
  list: ProcessCheckRecord[]
  editable: boolean
  secretReveal: boolean
  onView: (record: ProcessCheckRecord | null) => void
  onEdit: (record: ProcessCheckRecord) => void
  onDelete: (id: string) => void
}) {
  const index = record ? list.findIndex((item) => item.id === record.id) : -1
  const stamp = (item: ProcessCheckRecord) => `${item.writtenDate} ${item.writtenTime}`
  const newer = record
    ? list.filter((item) => stamp(item) > stamp(record)).sort((a, b) => stamp(a).localeCompare(stamp(b)))[0] ?? null
    : null
  const older = record
    ? list.filter((item) => stamp(item) < stamp(record)).sort((a, b) => stamp(b).localeCompare(stamp(a)))[0] ?? null
    : null
  const issues = record ? recordIssues(record, line.fields, secretReveal) : null
  const filled = record ? countFilled(record.answers, line.fields) : 0

  return (
    <Dialog open={Boolean(record)} onOpenChange={(open) => { if (!open) onView(null) }}>
      <DialogContent className="flex max-h-[90dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-4xl">
        {record && (
          <>
            <DialogHeader className="border-b px-5 py-4 pr-12">
              <DialogTitle className="flex flex-wrap items-center gap-2 text-base">
                <span className="tabular-nums">{record.writtenDate} {record.writtenTime}</span>
                {issues && <ResultChips {...issues} />}
              </DialogTitle>
              <DialogDescription>
                {line.name} · 작성자 {record.author} · 입력 {filled}/{line.fields.length}
              </DialogDescription>
            </DialogHeader>
            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              <RecordDetail record={record} line={line} secretReveal={secretReveal} />
            </div>
            <div className="flex flex-wrap items-center gap-2 border-t bg-muted/30 px-4 py-3">
              <Button variant="outline" size="sm" disabled={!older} onClick={() => older && onView(older)}>
                <ChevronLeft className="mr-1 h-4 w-4" /> 이전 기록
              </Button>
              <Button variant="outline" size="sm" disabled={!newer} onClick={() => newer && onView(newer)}>
                다음 기록 <ChevronRight className="ml-1 h-4 w-4" />
              </Button>
              <span className="text-xs text-muted-foreground tabular-nums">{index + 1} / {list.length}</span>
              {editable && (
                <div className="ml-auto flex gap-2">
                  <Button variant="outline" size="sm" className="text-destructive" onClick={() => onDelete(record.id)}>
                    <Trash2 className="mr-1 h-3.5 w-3.5" /> 삭제
                  </Button>
                  <Button size="sm" onClick={() => onEdit(record)}>
                    <Pencil className="mr-1 h-3.5 w-3.5" /> 수정
                  </Button>
                </div>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

function RecordDetail({
  record,
  line,
  secretReveal = false,
}: {
  record: ProcessCheckRecord
  line: LineModel
  secretReveal?: boolean
}) {
  const answers = useMemo(() => answersForDisplay(record, line.fields, secretReveal), [record, line.fields, secretReveal])
  const stored = useMemo(() => mergeAnswers(record.answers, line.fields), [record, line.fields])

  return (
      <div className="overflow-hidden rounded-xl border bg-card">
        <table className="w-full border-collapse text-sm">
          <thead className="bg-muted/60 text-xs font-semibold text-muted-foreground">
            <tr className="border-b">
              <th className="hidden w-40 border-r px-3 py-2 text-left md:table-cell">공정</th>
              <th className="w-12 px-3 py-2 text-left">No</th>
              <th className="px-3 py-2 text-left">점검 항목</th>
              <th className="hidden w-44 px-3 py-2 text-left md:table-cell">기준</th>
              <th className="w-28 px-3 py-2 text-right">결과</th>
            </tr>
          </thead>
          <tbody>
            {line.sections.map((section, sectionIndex) => (
              <Fragment key={section.id}>
                <tr className="border-b bg-violet-50/70 md:hidden dark:bg-violet-950/20">
                  <td colSpan={3} className="px-3 py-1.5 text-xs font-bold text-violet-800 dark:text-violet-300">
                    {sectionIndex + 1}. {section.title}
                  </td>
                </tr>
                {section.fields.map((field, fieldIndex) => {
                  const value = answers[field.id]
                  const out = processValuesRevealed(record, secretReveal) && isOutOfRange(field, stored[field.id], true)
                  const spec = specText(field)
                  return (
                    <tr
                      key={field.id}
                      className={cn(
                        'border-b last:border-b-0 hover:bg-violet-50/60 dark:hover:bg-violet-950/20',
                        fieldIndex % 2 === 1 && 'bg-muted/25',
                        fieldIndex === 0 && sectionIndex > 0 && 'md:border-t-2 md:border-t-muted-foreground/20',
                        out && 'bg-rose-50/70 dark:bg-rose-950/20',
                      )}
                    >
                      {fieldIndex === 0 && (
                        <td
                          rowSpan={section.fields.length}
                          className="hidden border-r bg-muted/30 px-3 py-2 align-top md:table-cell"
                        >
                          <span className="flex items-center gap-2 font-bold">
                            <span className="flex size-5 shrink-0 items-center justify-center rounded bg-violet-600 text-[11px] text-white dark:bg-violet-500">
                              {sectionIndex + 1}
                            </span>
                            {section.title}
                          </span>
                        </td>
                      )}
                      <td className="px-3 py-2 text-xs font-semibold text-muted-foreground tabular-nums">{field.no}</td>
                      <td className="px-3 py-2">
                        <span className="font-medium">{field.label}</span>
                        {spec && <span className="block text-[11px] text-muted-foreground md:hidden">기준 {spec}</span>}
                      </td>
                      <td className="hidden px-3 py-2 text-xs text-muted-foreground tabular-nums md:table-cell">{spec || '-'}</td>
                      <td className="px-3 py-1.5 text-right">
                        <span
                          className={cn(
                            'inline-flex min-w-12 justify-center rounded-md px-2 py-0.5 font-bold tabular-nums',
                            value === 'yes' && 'text-emerald-700 dark:text-emerald-400',
                            value === 'no' && 'bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300',
                            out && 'bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300',
                          )}
                        >
                          {formatAnswer(field, value)}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
  )
}

function RecordForm({
  floor,
  line,
  editable,
  secretReveal,
  editing,
  onCancel,
  onDone,
}: {
  floor: ProcessFloor
  line: LineModel
  editable: boolean
  secretReveal: boolean
  editing: ProcessCheckRecord | null
  onCancel: () => void
  onDone: () => void
}) {
  const { user } = useAuth()
  const [writtenDate, setWrittenDate] = useState(editing?.writtenDate ?? nowDate())
  const [writtenTime, setWrittenTime] = useState(editing?.writtenTime ?? nowTime())
  const [author, setAuthor] = useState(editing?.author ?? user?.displayName ?? '')
  const [answers, setAnswers] = useState<Record<string, ProcessAnswer>>(editing ? mergeAnswers(editing.answers, line.fields) : emptyAnswers(line.fields))
  const [sectionId, setSectionId] = useState(line.sections[0]?.id ?? '')
  const [saving, setSaving] = useState(false)
  const topRef = useRef<HTMLElement>(null)
  const sectionIndex = Math.max(0, line.sections.findIndex((item) => item.id === sectionId))
  const section = line.sections[sectionIndex]
  const filled = countFilled(answers, line.fields)
  const total = line.fields.length
  const persisted = useMemo(
    () => (editing ? mergeAnswers(editing.answers, line.fields) : emptyAnswers(line.fields)),
    [editing, line.fields],
  )
  const showDeviation = Boolean(editing && secretReveal)
  const issues = recordIssuesFromAnswers(answers, line.fields, showDeviation)
  const isLast = sectionIndex >= line.sections.length - 1

  const goSection = (index: number) => {
    const next = line.sections[index]
    if (!next) return
    setSectionId(next.id)
    topRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' })
  }

  const save = async () => {
    if (!writtenDate || !writtenTime || !author.trim()) {
      toast.error('작성일자, 시간, 작성자를 입력해주세요.')
      return
    }
    setSaving(true)
    try {
      const response = await fetch('/api/process-checks', {
        method: editing ? 'PATCH' : 'POST',
        headers: getJsonAuthHeaders(),
        body: JSON.stringify({
          id: editing?.id,
          floor,
          lineId: line.id,
          writtenDate,
          writtenTime,
          author: author.trim(),
          answers,
        }),
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(result.error || '저장에 실패했습니다.')
      toast.success(editing ? '공정 점검 기록을 수정했습니다.' : '공정 점검 기록을 저장했습니다.')
      onDone()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '저장에 실패했습니다.')
    } finally {
      setSaving(false)
    }
  }

  if (!section) return <p className="text-sm text-muted-foreground">등록된 항목이 없습니다. 항목을 먼저 추가해주세요.</p>

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <section className="rounded-2xl border bg-card p-4 shadow-sm">
        <div className="mb-4 flex items-center gap-3">
          <ProgressRing value={total ? filled / total : 0} />
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground">
              <span className="rounded bg-amber-500/15 px-1.5 py-px text-amber-700 dark:text-amber-300">{floor}층</span>
              {editing ? '기록 수정' : '새 기록'}
            </p>
            <h2 className="mt-0.5 truncate text-base font-bold">{line.name}</h2>
            <p className="text-xs text-muted-foreground tabular-nums">입력 {filled} / {total}개</p>
          </div>
          <ResultChips {...issues} />
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <label className="space-y-1.5 text-xs font-medium text-muted-foreground">작성일자
            <Input type="date" className="h-11 text-base text-foreground sm:h-10 sm:text-sm" value={writtenDate} onChange={(event) => setWrittenDate(event.target.value)} />
          </label>
          <label className="space-y-1.5 text-xs font-medium text-muted-foreground">시간
            <Input type="time" className="h-11 text-base text-foreground sm:h-10 sm:text-sm" value={writtenTime} onChange={(event) => setWrittenTime(event.target.value)} />
          </label>
          <label className="col-span-2 space-y-1.5 text-xs font-medium text-muted-foreground sm:col-span-1">작성자
            <Input className="h-11 text-base text-foreground sm:h-10 sm:text-sm" value={author} onChange={(event) => setAuthor(event.target.value)} placeholder="이름을 입력해주세요." />
          </label>
        </div>
      </section>

      <section ref={topRef} className="scroll-mt-2 overflow-clip rounded-2xl border bg-card shadow-sm">
        <div className="sticky top-0 z-10 flex gap-1.5 overflow-x-auto border-b bg-card/95 p-2 backdrop-blur">
          {line.sections.map((item, index) => {
            const sectionFilled = countFilled(answers, item.fields)
            const sectionIssues = recordIssuesFromAnswers(answers, item.fields, showDeviation)
            const done = sectionFilled === item.fields.length
            const active = item.id === section.id
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => goSection(index)}
                className={cn(
                  'flex min-h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors',
                  active
                    ? 'border-violet-600 bg-violet-600 text-white shadow-sm shadow-violet-600/25 dark:border-violet-500 dark:bg-violet-500'
                    : done
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300'
                      : 'bg-background text-muted-foreground hover:text-foreground',
                )}
              >
                {sectionIssues.out > 0 ? (
                  <span className={cn('size-2 rounded-full', active ? 'bg-white' : 'bg-rose-500')} />
                ) : done ? (
                  <Check className={cn('size-3.5', active ? 'text-white' : 'text-emerald-600')} />
                ) : null}
                {index + 1}. {item.title}
                <span className={cn('text-[11px] tabular-nums', active ? 'text-white/80' : 'text-muted-foreground')}>
                  {sectionFilled}/{item.fields.length}
                </span>
              </button>
            )
          })}
        </div>
        <div className="border-b bg-linear-to-r from-violet-50 to-transparent px-4 py-3 dark:from-violet-950/30">
          <div className="flex items-center justify-between gap-3">
            <p className="flex min-w-0 items-center gap-2 text-[15px] font-bold">
              <span className="grid size-6 shrink-0 place-items-center rounded-md bg-violet-600 text-xs text-white tabular-nums dark:bg-violet-500">
                {sectionIndex + 1}
              </span>
              <span className="truncate">{section.title}</span>
            </p>
            <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
              {sectionIndex + 1} / {line.sections.length} 단계 · {countFilled(answers, section.fields)}/{section.fields.length}
            </span>
          </div>
          <div className="mt-2.5 flex gap-1">
            {line.sections.map((item, index) => (
              <span
                key={item.id}
                className={cn(
                  'h-1 flex-1 rounded-full',
                  index === sectionIndex
                    ? 'bg-violet-600 dark:bg-violet-500'
                    : countFilled(answers, item.fields) === item.fields.length
                      ? 'bg-emerald-400'
                      : 'bg-muted-foreground/15',
                )}
              />
            ))}
          </div>
        </div>
        <div className="divide-y">
          {section.fields.map((field) => (
            <FieldRow
              key={field.id}
              field={field}
              value={answers[field.id]}
              disabled={!editable}
              showDeviation={showDeviation}
              originalValue={persisted[field.id]}
              onChange={(value) => setAnswers((current) => ({ ...current, [field.id]: value }))}
            />
          ))}
        </div>
      </section>

      <div className="sticky bottom-0 z-20 -mx-4 border-t bg-background/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur md:mx-0 md:rounded-2xl md:border md:pb-3 md:shadow-sm">
        <div className="flex items-center gap-2">
          <Button variant="outline" className="h-11" disabled={sectionIndex === 0} onClick={() => goSection(sectionIndex - 1)}>
            <ChevronLeft className="h-4 w-4" />
            <span className="hidden sm:inline">이전</span>
          </Button>
          {!isLast && (
            <Button variant="outline" className="h-11 flex-1" onClick={() => goSection(sectionIndex + 1)}>
              다음: {line.sections[sectionIndex + 1]?.title} <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          )}
          <Button variant="ghost" className="hidden h-11 md:inline-flex" onClick={onCancel}>취소</Button>
          {editable && (
            <Button className={cn('h-11', isLast ? 'flex-1' : 'sm:min-w-36')} disabled={saving} onClick={() => void save()}>
              {saving ? '저장 중...' : editing ? '수정 저장' : '저장'}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

function ProgressRing({ value }: { value: number }) {
  const radius = 20
  const circumference = 2 * Math.PI * radius
  const done = value >= 1
  return (
    <span className="relative grid size-14 shrink-0 place-items-center">
      <svg viewBox="0 0 48 48" className="absolute inset-0 -rotate-90">
        <circle cx="24" cy="24" r={radius} fill="none" strokeWidth="5" className="stroke-muted" />
        <circle
          cx="24"
          cy="24"
          r={radius}
          fill="none"
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - Math.min(1, value))}
          className={cn('transition-[stroke-dashoffset] duration-500', done ? 'stroke-emerald-500' : 'stroke-violet-500')}
        />
      </svg>
      <span className={cn('text-xs font-bold tabular-nums', done && 'text-emerald-600 dark:text-emerald-400')}>
        {done ? <Check className="size-5" /> : `${Math.round(value * 100)}%`}
      </span>
    </span>
  )
}

function FieldRow({
  field,
  value,
  onChange,
  disabled,
  originalValue,
  showDeviation = false,
}: {
  field: ProcessFieldSpec
  value: ProcessAnswer
  onChange: (value: ProcessAnswer) => void
  disabled?: boolean
  originalValue?: ProcessAnswer
  showDeviation?: boolean
}) {
  const rangeHint = numberRangeHint(field)
  const out = showDeviation && isOutOfRange(field, value, true)
  const answered = countFilled({ [field.id]: value }, [field]) > 0
  const showOriginal =
    showDeviation
    && field.type === 'number'
    && typeof originalValue === 'number'
    && !Number.isNaN(originalValue)
    && (originalValue !== value || isOutOfRange(field, originalValue, true))

  return (
    <div className={cn('px-4 py-4', out && 'bg-rose-50/60 dark:bg-rose-950/20')}>
      <div className="mb-3 flex items-start gap-2">
        <span
          className={cn(
            'mt-0.5 flex h-5 min-w-7 shrink-0 items-center justify-center gap-0.5 rounded-md px-1 text-[11px] font-bold tabular-nums',
            answered ? 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-400' : 'bg-muted text-muted-foreground',
          )}
        >
          {answered && <Check className="size-3" />}
          {field.no}
        </span>
        <div className="min-w-0">
          <p className="text-[15px] font-semibold leading-snug">{field.label}</p>
          {rangeHint && <p className="mt-0.5 text-xs text-muted-foreground">{rangeHint}</p>}
          {field.hint && <p className="mt-0.5 text-xs text-muted-foreground">{field.hint}</p>}
        </div>
      </div>

      {field.type === 'choice' ? (
        <>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {(field.options ?? []).map((choice) => {
            const multiple = choiceAllowsMultiple(field)
            const picked = multiple ? splitChoiceAnswer(value).includes(choice) : value === choice
            return (
            <button
              key={choice}
              type="button"
              disabled={disabled}
              onClick={() => {
                if (!multiple) {
                  onChange(choice)
                  return
                }
                const current = splitChoiceAnswer(value)
                const next = current.includes(choice) ? current.filter((item) => item !== choice) : [...current, choice]
                const ordered = (field.options ?? []).filter((option) => next.includes(option))
                onChange(joinChoiceAnswer(ordered))
              }}
              className={cn(
                'h-12 truncate rounded-xl border px-3 text-sm font-semibold transition-colors',
                picked
                  ? 'border-violet-600 bg-violet-600 text-white shadow-sm dark:border-violet-500 dark:bg-violet-500'
                  : 'bg-background hover:bg-muted/50',
              )}
            >
              {choice}
            </button>
            )
          })}
        </div>
        {choiceAllowsMultiple(field) ? (
          <p className="mt-2 text-xs text-muted-foreground">여러 품목을 고를 수 있습니다. 다시 누르면 해제됩니다.</p>
        ) : null}
        </>
      ) : field.type === 'yesno' ? (
        <div className="grid grid-cols-2 gap-2 sm:max-w-sm">
          {(['yes', 'no'] as const).map((choice) => (
            <button
              key={choice}
              type="button"
              disabled={disabled}
              onClick={() => onChange(choice)}
              className={cn(
                'flex h-12 items-center justify-center gap-1.5 rounded-xl border text-sm font-bold transition-colors',
                value === choice
                  ? choice === 'yes'
                    ? 'border-emerald-600 bg-emerald-600 text-white shadow-sm'
                    : 'border-rose-600 bg-rose-600 text-white shadow-sm'
                  : 'bg-background text-muted-foreground hover:bg-muted/50',
              )}
            >
              {choice === 'yes' ? <><Check className="size-4" /> Yes</> : <><X className="size-4" /> No</>}
            </button>
          ))}
        </div>
      ) : (
        <div className="flex items-center gap-2 sm:max-w-sm">
          <Input
            type="number"
            step="any"
            inputMode="decimal"
            disabled={disabled}
            aria-invalid={out || undefined}
            className={cn('h-12 text-lg font-semibold tabular-nums', out && 'border-rose-400 focus-visible:ring-rose-300')}
            value={value === '' ? '' : typeof value === 'number' ? value : ''}
            onChange={(event) => onChange(event.target.value === '' ? '' : Number(event.target.value))}
            placeholder={field.target != null ? String(field.target) : '값 입력'}
          />
          {field.unit && <span className="w-10 shrink-0 text-sm font-semibold text-muted-foreground">{field.unit}</span>}
        </div>
      )}
      {showOriginal && (
        <p className="mt-2 text-xs text-muted-foreground tabular-nums">
          원본 {originalValue}{field.unit ? ` ${field.unit}` : ''}
        </p>
      )}
      {out && (
        <p className="mt-2 flex items-center gap-1 text-xs font-semibold text-rose-600 dark:text-rose-400">
          <TriangleAlert className="size-3.5" /> 기준 범위를 벗어났습니다. 값을 다시 확인해주세요.
        </p>
      )}
    </div>
  )
}

function formatSpecNumber(value: number) {
  return String(Math.round(value * 1000) / 1000)
}

function numberRangeHint(field: ProcessFieldSpec) {
  if (field.type !== 'number' || field.min == null || field.max == null) return ''
  const unitSuffix = field.unit ? ` ${field.unit}` : ''
  const min = formatSpecNumber(field.min)
  const max = formatSpecNumber(field.max)
  if (field.label.includes('±') || field.label.includes('~')) {
    return `입력 가능: ${min} ~ ${max}${unitSuffix}`
  }
  const center = field.target ?? (field.min + field.max) / 2
  const minus = center - field.min
  const plus = field.max - center
  if (Math.abs(minus - plus) < 0.0005) {
    return `입력 가능: ${min} ~ ${max}${unitSuffix} (기준 ${formatSpecNumber(center)} ± ${formatSpecNumber(plus)})`
  }
  return `입력 가능: ${min} ~ ${max}${unitSuffix} (기준 ${formatSpecNumber(center)}, 허용 −${formatSpecNumber(minus)} · +${formatSpecNumber(plus)})`
}

function specText(field: ProcessFieldSpec) {
  if (field.type !== 'number' || field.min == null || field.max == null) return ''
  return `${formatSpecNumber(field.min)} ~ ${formatSpecNumber(field.max)}${field.unit ? ` ${field.unit}` : ''}`
}

type DraftItem = ProcessFieldSpec & { center: string; minus: string; plus: string; choiceOptions: string[] }

function defaultChoiceOptions(item?: ProcessFieldSpec): string[] {
  const saved = item?.options?.filter(Boolean) ?? []
  if (saved.length >= 2) return [...saved]
  if (saved.length === 1) return [...saved, '']
  return ['', '']
}

function normalizeChoiceOptionList(values: string[]): string[] {
  const seen = new Set<string>()
  const options: string[] = []
  for (const value of values) {
    const label = value.trim()
    if (!label || seen.has(label)) continue
    seen.add(label)
    options.push(label)
  }
  return options
}

function toDraft(item: ProcessFieldSpec): DraftItem {
  const hasRange = item.min != null && item.max != null
  const center = item.target ?? (hasRange ? (item.min! + item.max!) / 2 : undefined)
  return {
    ...item,
    center: center == null ? '' : formatSpecNumber(center),
    minus: hasRange && center != null ? formatSpecNumber(center - item.min!) : '',
    plus: hasRange && center != null ? formatSpecNumber(item.max! - center) : '',
    choiceOptions: defaultChoiceOptions(item),
  }
}

type DraftSection = { id: string; title: string; items: DraftItem[] }

function emptyDraftItem(): DraftItem {
  return {
    id: crypto.randomUUID(),
    no: 0,
    label: '',
    type: 'yesno',
    center: '',
    minus: '',
    plus: '',
    choiceOptions: ['', ''],
  }
}

function ChoiceOptionsEditor({
  options,
  onChange,
}: {
  options: string[]
  onChange: (next: string[]) => void
}) {
  return (
    <div className="mt-2 space-y-2 sm:pl-8">
      <p className="text-xs font-medium text-muted-foreground">선택지 목록 (2개 이상)</p>
      <ul className="space-y-2 rounded-lg border bg-muted/20 p-2">
        {options.map((opt, index) => (
          <li key={index} className="flex items-center gap-2">
            <span className="w-6 shrink-0 text-center text-xs font-semibold text-muted-foreground">{index + 1}</span>
            <Input
              value={opt}
              placeholder={`선택지 ${index + 1}`}
              onChange={(event) => {
                const next = [...options]
                next[index] = event.target.value
                onChange(next)
              }}
            />
            <Button
              type="button"
              variant="outline"
              className="shrink-0"
              disabled={options.length <= 2}
              onClick={() => onChange(options.filter((_, rowIndex) => rowIndex !== index))}
            >
              삭제
            </Button>
          </li>
        ))}
      </ul>
      <Button type="button" variant="outline" size="sm" onClick={() => onChange([...options, ''])}>
        <Plus className="mr-1 h-4 w-4" />
        선택지 추가
      </Button>
    </div>
  )
}

function draftSections(template: ProcessTemplate | null): DraftSection[] {
  if (!template) return [{ id: crypto.randomUUID(), title: '', items: [emptyDraftItem()] }]
  if (template.sections && template.sections.length > 0) {
    return template.sections.map((section) => ({
      id: section.id,
      title: section.title,
      items: section.fields.map(toDraft),
    }))
  }
  return [{ id: crypto.randomUUID(), title: '', items: template.items.map(toDraft) }]
}

const ORG_EMPTY = '__org_empty__'

/** 조직도 라벨("팀장 홍길동")을 직급 배지 + 이름으로 보여준다. */
function OrgPersonLabel({ label }: { label: string }) {
  const space = label.indexOf(' ')
  if (space <= 0) return <span className="font-medium">{label}</span>
  return (
    <span className="flex min-w-0 items-center gap-2">
      <span className="shrink-0 rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-semibold text-muted-foreground">{label.slice(0, space)}</span>
      <span className="truncate font-medium text-foreground">{label.slice(space + 1)}</span>
    </span>
  )
}

function TemplateEditor({
  floor,
  template,
  onDone,
}: {
  floor: ProcessFloor
  template: ProcessTemplate | null
  onDone: (id?: string) => void
}) {
  const [name, setName] = useState(template?.name ?? '')
  const [department, setDepartment] = useState(template?.department ?? '')
  const [inspector, setInspector] = useState(template?.inspector ?? '')
  const [orgDepartments, setOrgDepartments] = useState<{ name: string; people: string[] }[]>([])

  // 부서·점검자는 조직도에 등록된 목록에서만 고른다.
  useEffect(() => {
    fetch('/api/organization', { cache: 'no-store' })
      .then((response) => response.json())
      .then((result) => {
        const list = Array.isArray(result.data?.departments) ? result.data.departments : []
        setOrgDepartments(list.map((item: { name?: string; people?: { label?: string; kind?: string }[] }) => ({
          name: item.name ?? '',
          people: (item.people ?? []).filter((person) => person.kind === 'person' && person.label).map((person) => person.label as string),
        })).filter((item: { name: string }) => item.name))
      })
      .catch(() => setOrgDepartments([]))
  }, [])

  const orgNames = orgDepartments.map((item) => item.name)
  const departmentOptions = department && !orgNames.includes(department) ? [department, ...orgNames] : orgNames
  const orgPeople = department ? orgDepartments.find((item) => item.name === department)?.people ?? [] : []
  const inspectorOptions = inspector && !orgPeople.includes(inspector) ? [inspector, ...orgPeople] : orgPeople
  const changeDepartment = (next: string) => {
    const nextPeople = orgDepartments.find((item) => item.name === next)?.people ?? []
    setDepartment(next)
    setInspector((current) => (nextPeople.includes(current) ? current : ''))
  }
  const [sections, setSections] = useState<DraftSection[]>(() => draftSections(template))
  const [saving, setSaving] = useState(false)

  const updateItem = (sectionId: string, itemId: string, patch: Partial<DraftItem>) => {
    setSections((current) => current.map((section) => section.id === sectionId
      ? { ...section, items: section.items.map((item) => item.id === itemId ? { ...item, ...patch } : item) }
      : section))
  }

  const save = async () => {
    const labeledCount = sections.reduce((count, section) => count + section.items.filter((item) => item.label.trim()).length, 0)
    let no = 0
    const cleaned = sections.flatMap((section) => {
      const title = section.title.trim()
      const fields = section.items.flatMap((item): ProcessFieldSpec[] => {
        const label = item.label.trim()
        if (!label) return []
        no += 1
        if (item.type === 'choice') {
          const options = normalizeChoiceOptionList(item.choiceOptions)
          if (options.length < 2) return []
          return [{ id: item.id, no, label, type: 'choice' as const, options, ...(item.multiple || label === '생산품목' ? { multiple: true } : {}) }]
        }
        if (item.type === 'yesno') return [{ id: item.id, no, label, type: 'yesno' as const }]
        const center = Number(item.center)
        const minus = Number(item.minus)
        const plus = Number(item.plus)
        if (!Number.isFinite(center) || !Number.isFinite(minus) || !Number.isFinite(plus) || minus < 0 || plus < 0) return []
        return [{
          id: item.id,
          no,
          label,
          type: 'number' as const,
          unit: item.unit?.trim() || undefined,
          target: center,
          min: center - minus,
          max: center + plus,
        }]
      })
      if (!title || fields.length === 0) return []
      return [{ id: section.id, title, fields }]
    })
    const cleanedCount = cleaned.reduce((count, section) => count + section.fields.length, 0)
    const active = sections.filter((section) => section.title.trim() || section.items.some((item) => item.label.trim()))
    if (!name.trim()) {
      toast.error('점검 이름을 입력해주세요.')
      return
    }
    if (active.length === 0 || labeledCount === 0) {
      toast.error('큰 항목과 점검 항목을 하나 이상 입력해주세요.')
      return
    }
    if (active.some((section) => !section.title.trim())) {
      toast.error('큰 항목 이름을 입력해주세요. 예: 랙작업, 에칭, 징게이트')
      return
    }
    if (active.some((section) => !section.items.some((item) => item.label.trim()))) {
      toast.error('각 큰 항목에 점검 항목을 하나 이상 넣어주세요.')
      return
    }
    if (cleanedCount !== labeledCount) {
      toast.error('범위·선택 항목 설정을 확인해주세요. (수치: 기준/±허용, 선택: 2개 이상)')
      return
    }
    setSaving(true)
    try {
      const response = await fetch('/api/process-templates', {
        method: template ? 'PATCH' : 'POST',
        headers: getJsonAuthHeaders(),
        body: JSON.stringify({ id: template?.id, floor, name: name.trim(), department: department.trim(), inspector: inspector.trim(), sections: cleaned }),
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(result.error || '저장에 실패했습니다.')
      toast.success(template ? '점검 항목을 수정했습니다.' : '점검을 추가했습니다.')
      onDone(result.data?.id ?? template?.id)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '저장에 실패했습니다.')
    } finally {
      setSaving(false)
    }
  }

  const removeTemplate = async () => {
    if (!template || !window.confirm('이 점검표를 삭제하시겠습니까? 이미 저장된 기록은 목록에서 빠집니다.')) return
    setSaving(true)
    try {
      const response = await fetch('/api/process-templates', {
        method: 'DELETE',
        headers: getJsonAuthHeaders(),
        body: JSON.stringify({ id: template.id }),
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(result.error || '삭제에 실패했습니다.')
      toast.success('점검표를 삭제했습니다.')
      onDone()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '삭제에 실패했습니다.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="rounded-xl border bg-card p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold tracking-wide uppercase">{template ? '항목 수정' : '점검 추가'}</h2>
        <Button disabled={saving} onClick={() => void save()}>
          {saving ? '저장 중...' : template ? '항목 저장' : '점검 추가'}
        </Button>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        {floor}층 점검은 큰 항목으로 나누고, 그 안에 Yes/No, 단일 선택(예: POS/NEG/FUSE), 범위 수치를 넣습니다.
      </p>
      <label className="mt-4 block space-y-1.5 text-sm font-medium">
        점검 이름
        <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="예: 2층 니켈 라인" />
      </label>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5 text-sm font-medium">
          <span>부서</span>
          <Select
            value={department || ORG_EMPTY}
            onValueChange={(value) => changeDepartment(!value || value === ORG_EMPTY ? '' : value)}
          >
            <SelectTrigger aria-label="부서" className="h-10 w-full bg-background">
              {department || '부서 선택'}
            </SelectTrigger>
            <SelectContent className="max-h-60">
              <SelectGroup>
                <SelectItem value={ORG_EMPTY} className="py-2 text-muted-foreground">부서 선택</SelectItem>
                {departmentOptions.map((option) => (
                  <SelectItem key={option} value={option} className="py-2">
                    <span className="font-medium">{option}</span>
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5 text-sm font-medium">
          <span>점검자</span>
          <Select
            disabled={!department}
            value={inspector || ORG_EMPTY}
            onValueChange={(value) => setInspector(!value || value === ORG_EMPTY ? '' : value)}
          >
            <SelectTrigger aria-label="점검자" className="h-10 w-full bg-background disabled:opacity-60">
              {inspector ? <OrgPersonLabel label={inspector} /> : department ? '점검자 선택' : '부서를 먼저 선택'}
            </SelectTrigger>
            <SelectContent className="max-h-72 p-1">
              <SelectGroup>
                <SelectItem value={ORG_EMPTY} className="py-2.5 text-muted-foreground">
                  {department ? '점검자 선택' : '부서를 먼저 선택'}
                </SelectItem>
                {inspectorOptions.map((option) => (
                  <SelectItem key={option} value={option} className="py-2.5">
                    <OrgPersonLabel label={option} />
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="mt-5 flex flex-col gap-4">
        {sections.map((section, sectionIndex) => {
          const startNo = sections.slice(0, sectionIndex).reduce((count, item) => count + item.items.length, 0)
          return (
            <div key={section.id} className="overflow-hidden rounded-xl border">
              <div className="flex items-center gap-2 border-b bg-muted/40 px-3 py-2">
                <span className="w-6 text-center text-sm font-semibold text-muted-foreground">{sectionIndex + 1}</span>
                <Input
                  value={section.title}
                  onChange={(event) => setSections((current) => current.map((row) => row.id === section.id ? { ...row, title: event.target.value } : row))}
                  placeholder="큰 항목. 예: 랙작업, 에칭, 징게이트"
                  className="bg-background"
                />
                <Button
                  type="button"
                  variant="outline"
                  disabled={sections.length === 1}
                  onClick={() => setSections((current) => current.filter((row) => row.id !== section.id))}
                >
                  삭제
                </Button>
              </div>
              <div className="flex flex-col gap-2 p-3">
                {section.items.map((item, itemIndex) => (
                  <div key={item.id} className="rounded-xl border p-3">
                    <div className="grid gap-2 sm:grid-cols-[auto_minmax(0,1fr)_9rem_auto] sm:items-center">
                      <span className="text-sm font-semibold text-muted-foreground">{startNo + itemIndex + 1}</span>
                      <Input value={item.label} onChange={(event) => updateItem(section.id, item.id, { label: event.target.value })} placeholder="항목 이름. 예: 온도, 전압, 수세 OverFlow" />
                      <select
                        value={item.type}
                        onChange={(event) => {
                          const next = event.target.value
                          const type =
                            next === 'number' ? 'number'
                              : next === 'choice' ? 'choice'
                                : 'yesno'
                          updateItem(section.id, item.id, {
                            type,
                            ...(type === 'choice' && item.choiceOptions.every((row) => !row.trim())
                              ? { choiceOptions: [''] }
                              : type === 'choice' && item.choiceOptions.length < 2
                                ? { choiceOptions: defaultChoiceOptions(item) }
                                : {}),
                          })
                        }}
                        className="h-9 rounded-md border bg-background px-2 text-sm"
                      >
                        <option value="yesno">Yes / No</option>
                        <option value="choice">단일 선택</option>
                        <option value="number">범위 수치</option>
                      </select>
                      <Button
                        type="button"
                        variant="outline"
                        disabled={section.items.length === 1}
                        onClick={() => setSections((current) => current.map((row) => row.id === section.id ? { ...row, items: row.items.filter((field) => field.id !== item.id) } : row))}
                      >
                        삭제
                      </Button>
                    </div>
                    {item.type === 'choice' && (
                      <>
                        <label className="mt-2 flex items-center gap-2 text-sm font-medium sm:pl-8">
                          <input
                            type="checkbox"
                            checked={item.multiple === true || item.label.trim() === '생산품목'}
                            onChange={(event) => updateItem(section.id, item.id, { multiple: event.target.checked })}
                          />
                          여러 개 선택
                        </label>
                        <ChoiceOptionsEditor
                          options={item.choiceOptions}
                          onChange={(choiceOptions) => updateItem(section.id, item.id, { choiceOptions })}
                        />
                      </>
                    )}
                    {item.type === 'number' && (
                      <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_1fr_1fr_6rem] sm:pl-8">
                        <label className="space-y-1 text-xs text-muted-foreground">기준
                          <Input value={item.center} onChange={(event) => updateItem(section.id, item.id, { center: event.target.value })} placeholder="50" inputMode="decimal" />
                        </label>
                        <label className="space-y-1 text-xs text-muted-foreground">− 허용
                          <Input value={item.minus} onChange={(event) => updateItem(section.id, item.id, { minus: event.target.value })} placeholder="0" inputMode="decimal" />
                        </label>
                        <label className="space-y-1 text-xs text-muted-foreground">+ 허용
                          <Input value={item.plus} onChange={(event) => updateItem(section.id, item.id, { plus: event.target.value })} placeholder="5" inputMode="decimal" />
                        </label>
                        <label className="space-y-1 text-xs text-muted-foreground">단위
                          <Input value={item.unit ?? ''} onChange={(event) => updateItem(section.id, item.id, { unit: event.target.value })} placeholder="℃" />
                        </label>
                      </div>
                    )}
                  </div>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setSections((current) => current.map((row) => row.id === section.id ? { ...row, items: [...row.items, emptyDraftItem()] } : row))}
                >
                  <Plus className="mr-2 h-4 w-4" /> 항목 추가
                </Button>
              </div>
            </div>
          )
        })}
      </div>
      <Button
        type="button"
        variant="outline"
        className="mt-3"
        onClick={() => setSections((current) => [...current, { id: crypto.randomUUID(), title: '', items: [emptyDraftItem()] }])}
      >
        <Plus className="mr-2 h-4 w-4" /> 큰 항목 추가
      </Button>
      <div className="mt-5 flex flex-wrap justify-end gap-2">
        {template && (
          <Button type="button" variant="outline" className="text-destructive" disabled={saving} onClick={() => void removeTemplate()}>
            점검표 삭제
          </Button>
        )}
        <Button disabled={saving} onClick={() => void save()}>
          {saving ? '저장 중...' : template ? '항목 저장' : '점검 추가'}
        </Button>
      </div>
    </section>
  )
}

function formatAnswer(field: ProcessFieldSpec, value: ProcessAnswer) {
  return displayProcessAnswer(field, value)
}
