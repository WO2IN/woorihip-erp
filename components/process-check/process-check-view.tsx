'use client'

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Check,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  FileText,
  History,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  TrendingUp,
  TriangleAlert,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import { canOperateFloor, homeFloor } from '@/lib/access'
import { Button } from '@/components/ui/button'
import { BAND_BUTTON, PageHeader } from '@/components/shared/page-header'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { useAuth } from '@/components/auth/auth-context'
import { buildAuthHeaders, getSession } from '@/lib/auth-client'
import { useDataChanged } from '@/lib/data-events'
import { cn } from '@/lib/utils'
import { ProcessTrend } from '@/components/process-check/process-trend'
import {
  PROCESS_CHECK_FIELDS,
  PROCESS_CHECK_SECTIONS,
  PROCESS_FLOORS,
  PROCESS_LINES,
  ProcessAnswer,
  ProcessCheckRecord,
  ProcessFieldSpec,
  ProcessFloor,
  ProcessLineId,
  ProcessTemplate,
  countFilled,
  emptyAnswers,
  isOutOfRange,
  linesForFloor,
  mergeAnswers,
  numericAnswer,
  recordFloor,
  recordLineId,
  sectionsOf,
} from '@/lib/process-checklist'

type Screen = 'lines' | 'board' | 'form' | 'template'

type LineModel = {
  id: string
  name: string
  company: string
  summary: string
  custom: boolean
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
    sections,
    fields,
    chartFields,
  }
}

function nowDate() {
  return new Date().toISOString().slice(0, 10)
}

function nowTime() {
  const date = new Date()
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

function authHeaders() {
  const session = getSession()
  return {
    'Content-Type': 'application/json',
    ...(session ? buildAuthHeaders(session) : {}),
  }
}

function latestNumber(records: ProcessCheckRecord[], fieldId: string) {
  const sorted = [...records].sort((a, b) => `${b.writtenDate} ${b.writtenTime}`.localeCompare(`${a.writtenDate} ${a.writtenTime}`))
  for (const record of sorted) {
    const value = numericAnswer(record.answers[fieldId])
    if (value != null) return value
  }
  return null
}

export function ProcessCheckView() {
  const { user } = useAuth()
  const home = homeFloor(user)
  const [floor, setFloor] = useState<ProcessFloor>(home ?? 1)
  const editable = canOperateFloor(user, floor)
  const [lineId, setLineId] = useState<ProcessLineId | null>(null)
  const [screen, setScreen] = useState<Screen>('lines')
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
    if (!requestedLine && !hasFloor) return
    openedFromQuery.current = true
    if (hasFloor) setFloor(requestedFloor as ProcessFloor)
    if (!requestedLine) return
    const template = templates.find((item) => item.id === requestedLine)
    if (!template) return
    setFloor(hasFloor ? requestedFloor as ProcessFloor : template.floor)
    setLineId(requestedLine)
    setScreen('board')
  }, [loading, templates])

  const pinnedHome = useRef(false)
  useEffect(() => {
    if (pinnedHome.current || home == null || openedFromQuery.current) return
    pinnedHome.current = true
    setFloor(home)
  }, [home])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const session = getSession()
      const response = await fetch('/api/process-checks', {
        cache: 'no-store',
        headers: session ? buildAuthHeaders(session) : {},
      })
      if (!response.ok) throw new Error('기록을 불러오지 못했습니다.')
      const result = await response.json()
      setRecords(result.data || [])
      const templatesResponse = await fetch('/api/process-templates', {
        cache: 'no-store',
        headers: session ? buildAuthHeaders(session) : {},
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
  const floorRecords = records.filter((record) => recordFloor(record) === floor)
  const lineRecords = floorRecords.filter((record) => !line || recordLineId(record) === line.id)

  const openLine = (id: ProcessLineId) => {
    setLineId(id)
    setViewing(null)
    setEditingId(null)
    setScreen('board')
  }

  const removeTemplate = async (id: string) => {
    if (!window.confirm('이 점검표를 삭제하시겠습니까? 이미 저장된 기록은 목록에서 빠집니다.')) return
    try {
      const response = await fetch('/api/process-templates', {
        method: 'DELETE',
        headers: authHeaders(),
        body: JSON.stringify({ id }),
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(result.error || '삭제에 실패했습니다.')
      toast.success('점검표를 삭제했습니다.')
      if (lineId === id) {
        setLineId(null)
        setViewing(null)
        setEditingId(null)
        setScreen('lines')
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
        headers: authHeaders(),
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

  const floorModels = (target: ProcessFloor) => [
    ...linesForFloor(target).filter((item) => !hiddenLines.includes(item.id)).map((item) => item.id),
    ...templates.filter((item) => item.floor === target).map((item) => item.id),
  ].flatMap((id) => {
    const model = lineModel(id, templates)
    return model ? [model] : []
  })
  const models = floorModels(floor)
  const today = nowDate()

  return (
    <main className="flex w-full flex-col gap-5 px-4 py-6 md:px-6">
      <PageHeader
        tone="violet"
        icon={ClipboardCheck}
        eyebrow="DAILY CHECK · 일일 점검"
        title={screen === 'lines' || !line ? '공정 점검' : line.name}
        description={
          <>
            {screen === 'lines' && '층을 고른 뒤 점검표를 선택해 기록을 남깁니다. 현장에서는 휴대폰으로, 기록·추이는 PC로 확인하세요.'}
            {screen === 'board' && line && `${floor}층 · ${line.company ? `${line.company} · ` : ''}큰 항목 ${line.sections.length}개 · 항목 ${line.fields.length}개${editable ? '' : ' · 조회만 가능'}`}
            {screen === 'form' && (editingId ? '점검 기록을 수정합니다.' : '새 점검 기록을 작성합니다.')}
            {screen === 'template' && (editingTemplateId ? '점검 항목을 수정합니다.' : '새 점검과 항목을 만듭니다.')}
          </>
        }
        leading={screen !== 'lines' && (
            <Button
              variant="outline"
              size="icon"
              className={BAND_BUTTON}
              aria-label="뒤로"
              onClick={() => {
                if (screen === 'form') setScreen('board')
                else if (screen === 'template') setScreen(editingTemplateId ? 'board' : 'lines')
                else setScreen('lines')
                setViewing(null)
                setEditingId(null)
              }}
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
        )}
        actions={
          <Button variant="outline" className={BAND_BUTTON} onClick={() => void load()}>
            <RefreshCw className="mr-2 h-4 w-4" /> 새로고침
          </Button>
        }
      />

      {screen === 'lines' && (
        <>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div role="tablist" aria-label="층 선택" className="grid grid-cols-3 gap-1 rounded-xl border bg-muted/50 p-1 sm:inline-grid sm:w-auto">
              {PROCESS_FLOORS.map((item) => {
                const active = floor === item
                const itemModels = floorModels(item)
                const ids = new Set(itemModels.map((model) => model.id))
                const todayCount = records.filter((record) => recordFloor(record) === item && ids.has(recordLineId(record)) && record.writtenDate === today).length
                return (
                  <button
                    key={item}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setFloor(item)}
                    className={cn(
                      'flex min-h-12 flex-col items-center justify-center rounded-lg px-6 py-1.5 transition-all',
                      active ? 'bg-card text-foreground shadow-sm ring-1 ring-border' : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    <span className="text-base font-bold">{item}층</span>
                    <span className="text-[11px] text-muted-foreground">점검표 {itemModels.length} · 오늘 {todayCount}</span>
                  </button>
                )
              })}
            </div>
            {editable && (
              <Button className="h-10" onClick={() => { setEditingTemplateId(null); setScreen('template') }}>
                <Plus className="mr-2 h-4 w-4" /> 점검표 추가
              </Button>
            )}
          </div>
          {user?.role === 'viewer' ? (
            <p className="text-sm text-muted-foreground">뷰어 계정은 점검 기록을 보기만 할 수 있습니다.</p>
          ) : home != null && !editable ? (
            <p className="text-sm text-muted-foreground">{floor}층은 조회만 가능합니다. 기록과 점검표 수정은 {home}층에서만 할 수 있습니다.</p>
          ) : null}

          {loading ? (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 3 }).map((_, index) => <Skeleton key={index} className="h-52 rounded-2xl" />)}
            </div>
          ) : models.length === 0 ? (
            <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed bg-card px-6 py-14 text-center">
              <span className="flex size-12 items-center justify-center rounded-2xl bg-violet-100 text-violet-700 dark:bg-violet-950/60 dark:text-violet-300">
                <ClipboardCheck className="size-6" />
              </span>
              <div>
                <p className="font-semibold">{floor}층에 등록된 점검표가 없습니다.</p>
                <p className="mt-1 text-sm text-muted-foreground">라인별로 큰 항목(랙작업, 에칭 등)과 점검 항목을 만들어 사용하세요.</p>
              </div>
              {editable && (
                <Button variant="outline" onClick={() => { setEditingTemplateId(null); setScreen('template') }}>
                  <Plus className="mr-2 h-4 w-4" /> 첫 점검표 만들기
                </Button>
              )}
            </div>
          ) : (
            <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {models.map((model) => (
                <LineCard
                  key={model.id}
                  model={model}
                  records={floorRecords.filter((record) => recordLineId(record) === model.id)}
                  onOpen={() => openLine(model.id)}
                  onDelete={editable ? () => void removeTemplate(model.id) : undefined}
                />
              ))}
            </section>
          )}
        </>
      )}

      {screen === 'template' && (
        <TemplateEditor
          floor={floor}
          template={templates.find((item) => item.id === editingTemplateId) ?? null}
          onDone={(id) => {
            setEditingTemplateId(null)
            if (id) {
              setLineId(id)
              setScreen('board')
            } else {
              setLineId(null)
              setScreen('lines')
            }
            void load()
          }}
        />
      )}

      {screen !== 'lines' && screen !== 'template' && line && (
        screen === 'form' ? (
          <RecordForm
            floor={floor}
            line={line}
            editable={editable}
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
        ) : (
          <LineBoard
            loading={loading}
            line={line}
            records={lineRecords}
            editable={editable}
            viewing={viewing}
            onCreate={() => {
              setEditingId(null)
              setViewing(null)
              setScreen('form')
            }}
            onEditItems={() => {
              setEditingTemplateId(line.id)
              setScreen('template')
            }}
            onDeleteTemplate={() => void removeTemplate(line.id)}
            onView={setViewing}
            onEdit={(record) => {
              setEditingId(record.id)
              setViewing(null)
              setScreen('form')
            }}
            onDelete={remove}
          />
        )
      )}
    </main>
  )
}

function sortDesc(records: ProcessCheckRecord[]) {
  return [...records].sort((a, b) => `${b.writtenDate} ${b.writtenTime}`.localeCompare(`${a.writtenDate} ${a.writtenTime}`))
}

function recordIssues(answers: Record<string, ProcessAnswer>, fields: ProcessFieldSpec[]) {
  let out = 0
  let no = 0
  for (const field of fields) {
    const value = answers[field.id]
    if (isOutOfRange(field, value)) out += 1
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

function LineCard({ model, records, onOpen, onDelete }: { model: LineModel; records: ProcessCheckRecord[]; onOpen: () => void; onDelete?: () => void }) {
  const today = nowDate()
  const todayCount = records.filter((record) => record.writtenDate === today).length
  const latest = sortDesc(records)[0]
  const metrics = model.chartFields.slice(0, 2)
  const issues = latest ? recordIssues(latest.answers, model.fields) : null
  return (
    <div className="group relative overflow-hidden rounded-2xl border bg-card shadow-sm transition-all hover:-translate-y-0.5 hover:border-violet-300 hover:shadow-md dark:hover:border-violet-800">
      <span className={cn('absolute inset-y-0 left-0 w-1', todayCount ? 'bg-emerald-500' : 'bg-amber-400')} aria-hidden />
      <button type="button" onClick={onOpen} className="flex w-full flex-col gap-4 p-5 pl-6 text-left">
        <div className="flex items-start gap-3 pr-8">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-violet-100 text-violet-700 dark:bg-violet-950/60 dark:text-violet-300">
            <ClipboardCheck className="size-5" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-base font-bold">{model.name}</p>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              {model.company ? `${model.company} · ` : ''}큰 항목 {model.sections.length}개 · 항목 {model.fields.length}개
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <span
            className={cn(
              'inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold ring-1',
              todayCount
                ? 'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-900'
                : 'bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-900',
            )}
          >
            <span className={cn('size-1.5 rounded-full', todayCount ? 'bg-emerald-500' : 'bg-amber-500')} />
            {todayCount ? `오늘 ${todayCount}건 기록` : '오늘 미기록'}
          </span>
          <span className="rounded-full bg-muted px-2 py-0.5 font-medium text-muted-foreground">전체 {records.length}건</span>
          {issues && <ResultChips {...issues} />}
        </div>

        {metrics.length > 0 ? (
          <div className="grid grid-cols-2 gap-2">
            {metrics.map((metric) => {
              const value = latestNumber(records, metric.id)
              return (
                <div key={metric.id} className="min-w-0 rounded-lg bg-muted/50 px-3 py-2">
                  <p className="truncate text-[11px] text-muted-foreground">{metric.label}</p>
                  <p className="mt-0.5 text-lg font-bold tabular-nums">
                    {value ?? '-'}
                    {metric.unit && <span className="ml-1 text-xs font-medium text-muted-foreground">{metric.unit}</span>}
                  </p>
                </div>
              )
            })}
          </div>
        ) : (
          <p className="rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">수치 항목이 없는 점검표입니다.</p>
        )}

        <span className="flex items-center justify-between border-t pt-3 text-xs text-muted-foreground">
          <span className="truncate">
            {latest ? `최근 ${latest.writtenDate.slice(5)} ${latest.writtenTime} · ${latest.author}` : '아직 기록이 없습니다'}
          </span>
          <span className="flex shrink-0 items-center gap-0.5 text-sm font-semibold text-violet-700 dark:text-violet-300">
            열기 <ChevronRight className="size-4" />
          </span>
        </span>
      </button>
      {onDelete && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="점검표 삭제"
          className="absolute right-3 top-3 size-8 text-muted-foreground hover:text-destructive sm:opacity-0 sm:group-hover:opacity-100"
          onClick={onDelete}
        >
          <Trash2 className="size-4" />
        </Button>
      )}
    </div>
  )
}

function BoardStat({ label, value, sub, tone = 'default' }: { label: string; value: string; sub?: string; tone?: 'default' | 'green' | 'amber' | 'rose' }) {
  return (
    <div className="rounded-xl border bg-card px-4 py-3 shadow-sm">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p
        className={cn(
          'mt-1 text-xl font-bold tabular-nums',
          tone === 'green' && 'text-emerald-600 dark:text-emerald-400',
          tone === 'amber' && 'text-amber-600 dark:text-amber-400',
          tone === 'rose' && 'text-rose-600 dark:text-rose-400',
        )}
      >
        {value}
      </p>
      {sub && <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{sub}</p>}
    </div>
  )
}

const RECORD_PAGE = 20

function LineBoard({
  loading,
  line,
  records,
  editable,
  viewing,
  onCreate,
  onEditItems,
  onDeleteTemplate,
  onView,
  onEdit,
  onDelete,
}: {
  loading: boolean
  line: LineModel
  records: ProcessCheckRecord[]
  editable: boolean
  viewing: ProcessCheckRecord | null
  onCreate: () => void
  onEditItems: () => void
  onDeleteTemplate: () => void
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
  const [onlyIssues, setOnlyIssues] = useState(false)
  const [shown, setShown] = useState(RECORD_PAGE)
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
    () => sortDesc(records).map((record) => ({ record, issues: recordIssues(record.answers, line.fields) })),
    [records, line.fields],
  )
  const today = nowDate()
  const todayCount = sorted.filter(({ record }) => record.writtenDate === today).length
  const issueCount = sorted.filter(({ issues }) => issues.out > 0).length
  const latest = sorted[0]?.record
  const oldest = sorted.at(-1)?.record
  const keyword = query.trim().toLowerCase()
  const filtered = sorted.filter(({ record, issues }) => {
    if (onlyIssues && !issues.out && !issues.no) return false
    if (!keyword) return true
    return `${record.writtenDate} ${record.writtenTime} ${record.author}`.toLowerCase().includes(keyword)
  })
  const listed = dateOrder === 'desc' ? filtered : [...filtered].reverse()

  return (
    <div className="flex flex-col gap-5 pb-20 md:pb-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="grid flex-1 grid-cols-2 gap-3 lg:grid-cols-4">
          <BoardStat label="오늘 기록" value={`${todayCount}건`} sub={todayCount ? '오늘 작성 완료' : '아직 작성하지 않았습니다'} tone={todayCount ? 'green' : 'amber'} />
          <BoardStat label="전체 기록" value={`${sorted.length}건`} sub={oldest ? `${oldest.writtenDate}부터` : '기록 없음'} />
          <BoardStat label="최근 기록" value={latest ? `${latest.writtenDate.slice(5)} ${latest.writtenTime}` : '-'} sub={latest ? latest.author : '기록 없음'} />
          <BoardStat label="규격 이탈 기록" value={`${issueCount}건`} sub="수치가 기준 범위를 벗어난 기록" tone={issueCount ? 'rose' : 'default'} />
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2">
        {editable && line.custom && (
          <Button variant="outline" size="sm" onClick={onEditItems}>
            <Pencil className="mr-1.5 h-3.5 w-3.5" /> 항목 수정
          </Button>
        )}
        {editable && (
          <Button variant="outline" size="sm" className="text-destructive" onClick={onDeleteTemplate}>
            <Trash2 className="mr-1.5 h-3.5 w-3.5" /> 점검표 삭제
          </Button>
        )}
        {editable && (
          <Button className="hidden md:inline-flex" onClick={onCreate}>
            <Plus className="mr-2 h-4 w-4" /> 기록하기
          </Button>
        )}
      </div>

      {chartSections.length > 0 && selectedSection && (
        <section className="order-2 overflow-hidden rounded-2xl border bg-card shadow-sm md:order-none">
          <div className="flex flex-col gap-3 border-b px-4 py-3">
            <div>
              <h2 className="flex items-center gap-2 text-sm font-semibold">
                <TrendingUp className="size-4 text-violet-600 dark:text-violet-400" /> 수치 추이
              </h2>
              <p className="mt-0.5 text-xs text-muted-foreground">초록 띠는 기준 범위, 빨간 점은 범위를 벗어난 값입니다. 최근 20회까지 표시합니다.</p>
            </div>
            <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5">
              {chartSections.map((section) => {
                const index = line.sections.findIndex((item) => item.id === section.id)
                const active = section.id === selectedSection.id
                return (
                  <button
                    key={section.id}
                    type="button"
                    onClick={() => setSectionId(section.id)}
                    className={cn(
                      'shrink-0 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors',
                      active
                        ? 'border-violet-600 bg-violet-600 text-white dark:border-violet-500 dark:bg-violet-500'
                        : 'bg-background text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {index + 1}. {section.title}
                  </button>
                )
              })}
            </div>
          </div>
          <div className="overflow-x-auto p-4">
            <div className="flex gap-3">
              {selectedNumbers.map((field) => (
                <div key={field.id} className="min-w-72 flex-1">
                  <ProcessTrend title={field.label} field={field} records={records} />
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      <section className="overflow-hidden rounded-2xl border bg-card shadow-sm">
        <div className="flex flex-col gap-3 border-b px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <History className="size-4 text-violet-600 dark:text-violet-400" /> 점검 기록
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground tabular-nums">
              {filtered.length === sorted.length ? `${sorted.length}건` : `${filtered.length} / ${sorted.length}건`}
            </span>
          </h2>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => { setOnlyIssues((value) => !value); setShown(RECORD_PAGE) }}
              className={cn(
                'h-9 shrink-0 rounded-lg border px-3 text-xs font-semibold transition-colors',
                onlyIssues
                  ? 'border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300'
                  : 'bg-background text-muted-foreground hover:text-foreground',
              )}
            >
              이상 있는 기록만
            </button>
            <div className="relative flex-1 sm:w-56 sm:flex-none">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => { setQuery(event.target.value); setShown(RECORD_PAGE) }}
                placeholder="날짜·작성자 검색"
                className="h-9 pl-8"
              />
            </div>
          </div>
        </div>

        {loading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 3 }).map((_, index) => <Skeleton key={index} className="h-12 w-full" />)}
          </div>
        ) : sorted.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
            <p className="font-semibold">아직 기록이 없습니다.</p>
            <p className="text-sm text-muted-foreground">현장에서 휴대폰으로 ‘기록하기’를 눌러 첫 점검을 남겨보세요.</p>
          </div>
        ) : filtered.length === 0 ? (
          <p className="px-6 py-12 text-center text-sm text-muted-foreground">조건에 맞는 기록이 없습니다.</p>
        ) : (
          <>
            <div className="hidden grid-cols-[1.25rem_11rem_9rem_minmax(0,1fr)_auto] gap-4 border-b bg-muted/40 px-4 py-2 text-xs font-semibold text-muted-foreground md:grid">
              <span />
              <button
                type="button"
                onClick={() => { setDateOrder((value) => (value === 'desc' ? 'asc' : 'desc')); setShown(RECORD_PAGE) }}
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
              {listed.slice(0, shown).map(({ record, issues }) => {
                const filled = countFilled(record.answers, line.fields)
                return (
                  <li key={record.id}>
                    <button
                      type="button"
                      onClick={() => onView(record)}
                      className="group flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-violet-50/60 md:grid md:grid-cols-[1.25rem_11rem_9rem_minmax(0,1fr)_auto] md:gap-4 dark:hover:bg-violet-950/20"
                    >
                      <FileText className="size-4 shrink-0 text-muted-foreground group-hover:text-violet-600" aria-hidden />
                      <span className="min-w-0 flex-1 md:contents">
                        <span className="block text-sm font-semibold tabular-nums">
                          {record.writtenDate} <span className="font-normal text-muted-foreground">{record.writtenTime}</span>
                        </span>
                        <span className="block truncate text-xs text-muted-foreground md:text-sm md:text-foreground">
                          {record.author}
                          <span className="md:hidden"> · 입력 {filled}/{line.fields.length}</span>
                        </span>
                        <span className="hidden items-center gap-2 md:flex">
                          <span className="h-1.5 w-24 overflow-hidden rounded-full bg-muted">
                            <span className="block h-full rounded-full bg-violet-500" style={{ width: `${line.fields.length ? (filled / line.fields.length) * 100 : 0}%` }} />
                          </span>
                          <span className="text-xs text-muted-foreground tabular-nums">{filled}/{line.fields.length}</span>
                        </span>
                      </span>
                      <span className="shrink-0">
                        <ResultChips {...issues} />
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
            {listed.length > shown && (
              <div className="border-t p-3 text-center">
                <Button variant="ghost" size="sm" onClick={() => setShown((value) => value + RECORD_PAGE)}>
                  {RECORD_PAGE}건 더 보기 ({listed.length - shown}건 남음)
                </Button>
              </div>
            )}
          </>
        )}
      </section>

      <RecordDialog
        record={viewing}
        line={line}
        list={listed.map(({ record }) => record)}
        editable={editable}
        onView={onView}
        onEdit={onEdit}
        onDelete={onDelete}
      />

      {editable && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 p-3 backdrop-blur md:hidden">
          <Button className="h-12 w-full text-base" onClick={onCreate}>
            <Plus className="mr-2 h-5 w-5" /> 기록하기
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
  onView,
  onEdit,
  onDelete,
}: {
  record: ProcessCheckRecord | null
  line: LineModel
  list: ProcessCheckRecord[]
  editable: boolean
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
  const issues = record ? recordIssues(record.answers, line.fields) : null
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
              <RecordDetail record={record} line={line} />
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
}: {
  record: ProcessCheckRecord
  line: LineModel
}) {
  const answers = useMemo(() => mergeAnswers(record.answers, line.fields), [record, line.fields])

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
                  const out = isOutOfRange(field, value)
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
  editing,
  onCancel,
  onDone,
}: {
  floor: ProcessFloor
  line: LineModel
  editable: boolean
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
  const issues = recordIssues(answers, line.fields)
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
        headers: authHeaders(),
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
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">{floor}층 · {line.name}</h2>
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
        <div className="mt-4">
          <div className="mb-1.5 flex justify-between text-xs text-muted-foreground">
            <span>입력 진행</span>
            <span className="font-semibold tabular-nums text-foreground">{filled} / {total}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-violet-500 transition-all" style={{ width: `${total ? (filled / total) * 100 : 0}%` }} />
          </div>
        </div>
      </section>

      <section ref={topRef} className="scroll-mt-2 rounded-2xl border bg-card shadow-sm">
        <div className="sticky top-0 z-10 flex gap-1.5 overflow-x-auto rounded-t-2xl border-b bg-card/95 p-2 backdrop-blur">
          {line.sections.map((item, index) => {
            const sectionFilled = countFilled(answers, item.fields)
            const sectionIssues = recordIssues(answers, item.fields)
            const done = sectionFilled === item.fields.length
            const active = item.id === section.id
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => goSection(index)}
                className={cn(
                  'flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors',
                  active
                    ? 'border-violet-600 bg-violet-600 text-white dark:border-violet-500 dark:bg-violet-500'
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
        <div className="flex items-center justify-between border-b bg-muted/30 px-4 py-2.5">
          <p className="text-sm font-bold">
            <span className="mr-1.5 text-violet-600 dark:text-violet-400">{sectionIndex + 1}/{line.sections.length}</span>
            {section.title}
          </p>
          <span className="text-xs text-muted-foreground">항목 {section.fields.length}개</span>
        </div>
        <div className="divide-y [&>*:last-child]:rounded-b-2xl">
          {section.fields.map((field) => (
            <FieldRow
              key={field.id}
              field={field}
              value={answers[field.id]}
              disabled={!editable}
              onChange={(value) => setAnswers((current) => ({ ...current, [field.id]: value }))}
            />
          ))}
        </div>
      </section>

      <div className="sticky bottom-0 z-20 -mx-4 border-t bg-background/95 px-4 py-3 backdrop-blur md:mx-0 md:rounded-2xl md:border md:shadow-sm">
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

function FieldRow({
  field,
  value,
  onChange,
  disabled,
}: {
  field: ProcessFieldSpec
  value: ProcessAnswer
  onChange: (value: ProcessAnswer) => void
  disabled?: boolean
}) {
  const rangeHint = numberRangeHint(field)
  const out = isOutOfRange(field, value)

  return (
    <div className={cn('px-4 py-4', out && 'bg-rose-50/60 dark:bg-rose-950/20')}>
      <div className="mb-3 flex items-start gap-2">
        <span className="mt-0.5 shrink-0 rounded bg-muted px-1.5 py-0.5 text-[11px] font-semibold text-muted-foreground tabular-nums">#{field.no}</span>
        <div className="min-w-0">
          <p className="text-[15px] font-semibold leading-snug">{field.label}</p>
          {rangeHint && <p className="mt-0.5 text-xs text-muted-foreground">{rangeHint}</p>}
          {field.hint && <p className="mt-0.5 text-xs text-muted-foreground">{field.hint}</p>}
        </div>
      </div>

      {field.type === 'choice' ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {(field.options ?? []).map((choice) => (
            <button
              key={choice}
              type="button"
              disabled={disabled}
              onClick={() => onChange(choice)}
              className={cn(
                'h-12 truncate rounded-xl border px-3 text-sm font-semibold transition-colors',
                value === choice
                  ? 'border-violet-600 bg-violet-600 text-white shadow-sm dark:border-violet-500 dark:bg-violet-500'
                  : 'bg-background hover:bg-muted/50',
              )}
            >
              {choice}
            </button>
          ))}
        </div>
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

function fieldTitle(field: ProcessFieldSpec) {
  return field.label
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
          return [{ id: item.id, no, label, type: 'choice' as const, options }]
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
        headers: authHeaders(),
        body: JSON.stringify({ id: template?.id, floor, name: name.trim(), sections: cleaned }),
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
        headers: authHeaders(),
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
      <h2 className="text-sm font-semibold tracking-wide uppercase">{template ? '항목 수정' : '점검 추가'}</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        {floor}층 점검은 큰 항목으로 나누고, 그 안에 Yes/No, 단일 선택(예: POS/NEG/FUSE), 범위 수치를 넣습니다.
      </p>
      <label className="mt-4 block space-y-1.5 text-sm font-medium">
        점검 이름
        <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="예: 2층 니켈 라인" />
      </label>
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
                      <ChoiceOptionsEditor
                        options={item.choiceOptions}
                        onChange={(choiceOptions) => updateItem(section.id, item.id, { choiceOptions })}
                      />
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
  if (value === '' || value == null) return '-'
  if (value === 'yes') return 'Yes'
  if (value === 'no') return 'No'
  return field.unit ? `${value} ${field.unit}` : String(value)
}
