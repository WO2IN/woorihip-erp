'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  AlertTriangle,
  Building2,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Factory,
  FileText,
  FlaskConical,
  LayoutDashboard,
  ListChecks,
  MapPin,
  Plus,
  Scale,
  ShieldAlert,
  Table2,
  Users,
  Warehouse,
  Wrench,
} from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/components/auth/auth-context'
import { RiskEditor } from '@/components/risk/risk-editor'
import { RiskCriteria, RiskImprove, RiskMaster } from '@/components/risk/risk-extra'
import { DistributionBar, FIELD, LABEL, MethodPicker, Panel, Pill, ProgressMini, StatCard, TH, THEAD, type Tone } from '@/components/risk/risk-ui'
import { PAGE_SHELL, PageHeader } from '@/components/shared/page-header'
import { SectionTabs } from '@/components/shared/section-tabs'
import { Button } from '@/components/ui/button'
import { getAuthHeaders, getJsonAuthHeaders } from '@/lib/auth-client'
import {
  EVAL_TYPES,
  METHODS,
  SEED_AREAS,
  ZONES,
  assessmentFromArea,
  decisionOf,
  distribution,
  emptyRow,
  gradeOf,
  improvementStatus,
  isMandatory,
  krasLabel,
  needsImprovement,
  riskId,
  riskScore,
  today,
  zoneOf,
  type RiskAssessment,
  type RiskMethod,
  type RiskRow,
  type RiskSettings,
} from '@/lib/risk/model'
import { cn } from '@/lib/utils'

const ZONE_MARK: Record<string, { icon: typeof Building2; tone: Tone }> = {
  site: { icon: Factory, tone: 'slate' },
  wh: { icon: Warehouse, tone: 'orange' },
  lab: { icon: FlaskConical, tone: 'sky' },
  etc: { icon: Building2, tone: 'slate' },
}

type TabKey = 'dash' | 'new' | 'edit' | 'improve' | 'criteria' | 'master'

const TABS: Array<{ key: TabKey; label: string; hint: string; icon: typeof LayoutDashboard }> = [
  { key: 'dash', label: '현황', hint: '구역별 평가와 분포', icon: LayoutDashboard },
  { key: 'new', label: '새 평가', hint: '평가표를 새로 작성', icon: Plus },
  { key: 'improve', label: '개선대책', hint: '개선 항목을 한곳에서', icon: ClipboardList },
  { key: 'criteria', label: '평가기준', hint: '판정 기준과 법령', icon: Scale },
  { key: 'master', label: '사업자정보', hint: '사업장 정보와 백업', icon: Building2 },
]

function isTab(value: string | null): value is TabKey {
  return TABS.some((tab) => tab.key === value) || value === 'edit'
}

export function RiskView() {
  const { user } = useAuth()
  const router = useRouter()
  const searchParams = useSearchParams()
  const editable = Boolean(user && user.role !== 'viewer')
  const [settings, setSettings] = useState<RiskSettings | null>(null)
  const [assessments, setAssessments] = useState<RiskAssessment[]>([])
  const [loading, setLoading] = useState(true)
  const [method, setMethod] = useState<RiskMethod>('CL')
  const pending = useRef<RiskAssessment | null>(null)
  const timer = useRef<number | null>(null)
  const tab = isTab(searchParams.get('tab')) ? (searchParams.get('tab') as TabKey) : 'dash'
  const editId = searchParams.get('id') || ''

  const openTab = (next: TabKey, id = '') => {
    const params = new URLSearchParams()
    if (next !== 'dash') params.set('tab', next)
    if (id) params.set('id', id)
    const query = params.toString()
    router.replace(query ? `/risk-assessment?${query}` : '/risk-assessment')
  }

  useEffect(() => {
    let alive = true
    fetch('/api/risk-assessment', { cache: 'no-store', headers: getAuthHeaders() })
      .then(async (response) => {
        const result = await response.json().catch(() => ({}))
        if (!response.ok) throw new Error(result.error || '위험성평가를 불러오지 못했습니다.')
        return result as { settings: RiskSettings; assessments: RiskAssessment[] }
      })
      .then((result) => {
        if (!alive) return
        setSettings(result.settings)
        setAssessments(result.assessments)
      })
      .catch((error) => {
        if (alive) toast.error(error instanceof Error ? error.message : '위험성평가를 불러오지 못했습니다.')
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [])

  const persist = async (assessment: RiskAssessment) => {
    const response = await fetch('/api/risk-assessment', {
      method: 'POST',
      headers: getJsonAuthHeaders(),
      body: JSON.stringify({ action: 'save', assessment }),
    })
    const result = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(result.error || '평가를 저장하지 못했습니다.')
  }

  const updateAssessment = (next: RiskAssessment, immediate = false) => {
    setAssessments((current) => current.map((item) => (item.id === next.id ? next : item)))
    pending.current = next
    if (timer.current) window.clearTimeout(timer.current)
    const run = () => {
      const target = pending.current
      if (!target) return
      void persist(target).catch((error) => toast.error(error instanceof Error ? error.message : '평가를 저장하지 못했습니다.'))
    }
    if (immediate) run()
    else timer.current = window.setTimeout(run, 600)
  }

  const createAssessment = async (assessment: RiskAssessment) => {
    setAssessments((current) => [...current, assessment])
    await persist(assessment)
    openTab('edit', assessment.id)
  }

  const removeAssessment = async (id: string) => {
    const response = await fetch('/api/risk-assessment', {
      method: 'POST',
      headers: getJsonAuthHeaders(),
      body: JSON.stringify({ action: 'delete', id }),
    })
    const result = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(result.error || '평가를 삭제하지 못했습니다.')
    setAssessments((current) => current.filter((item) => item.id !== id))
    if (editId === id) openTab('dash')
  }

  const saveSettings = async (next: RiskSettings) => {
    const response = await fetch('/api/risk-assessment', {
      method: 'POST',
      headers: getJsonAuthHeaders(),
      body: JSON.stringify({ action: 'settings', settings: next }),
    })
    const result = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(result.error || '기준정보를 저장하지 못했습니다.')
    setSettings(next)
  }

  const replaceAll = async (action: 'reset' | 'import', payload?: { settings: RiskSettings; assessments: RiskAssessment[] }) => {
    const response = await fetch('/api/risk-assessment', {
      method: 'POST',
      headers: getJsonAuthHeaders(),
      body: JSON.stringify(action === 'reset' ? { action } : { action, ...payload }),
    })
    const result = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(result.error || '데이터를 바꾸지 못했습니다.')
    setSettings(result.settings)
    setAssessments(result.assessments)
    openTab('dash')
  }

  const editing = assessments.find((item) => item.id === editId) || null

  return (
    <div className={PAGE_SHELL}>
      <PageHeader
        tone="red"
        icon={ShieldAlert}
        eyebrow="위험성평가"
        title="위험성평가"
        description="구역별 평가를 보고, 항목을 눌러 고칩니다."
      />
      <SectionTabs
        label="위험성평가 메뉴"
        items={[...TABS.filter((item) => item.key !== 'new'), ...(editing ? [{ key: 'edit' as const, label: '평가표', hint: editing.area || editing.title, icon: Table2 }] : [])]}
        value={tab}
        onChange={(key) => openTab(key, key === 'edit' ? editing?.id || '' : '')}
        actions={
          <Button type="button" className="h-9 rounded-lg px-3.5" aria-current={tab === 'new' ? 'page' : undefined} onClick={() => openTab('new')}>
            <Plus className="size-4" />
            새 평가
          </Button>
        }
      />
      <div className="min-w-0">
      {loading || !settings ? (
        <div className="rounded-xl border border-dashed border-border bg-card px-4 py-12 text-center text-sm text-muted-foreground">위험성평가를 불러오는 중입니다.</div>
      ) : tab === 'edit' && editing ? (
        <RiskEditor
          key={editing.id}
          assessment={editing}
          settings={settings}
          editable={editable}
          onChange={(next) => updateAssessment(next)}
          onPrint={() => printAssessment(editing)}
        />
      ) : tab === 'new' ? (
        <NewAssessment
          settings={settings}
          assessments={assessments}
          method={method}
          editable={editable}
          onMethod={setMethod}
          onCreate={(assessment) => void createAssessment(assessment).catch((error) => toast.error(error instanceof Error ? error.message : '평가를 만들지 못했습니다.'))}
        />
      ) : tab === 'improve' ? (
        <RiskImprove
          assessments={assessments}
          editable={editable}
          onChange={(next) => updateAssessment(next, true)}
          onOpen={(id) => openTab('edit', id)}
        />
      ) : tab === 'criteria' ? (
        <RiskCriteria method={method} onMethod={setMethod} />
      ) : tab === 'master' ? (
        <RiskMaster
          settings={settings}
          assessments={assessments}
          editable={editable}
          onSave={(next) => void saveSettings(next).then(() => toast.success('기준정보를 저장했습니다.')).catch((error) => toast.error(error instanceof Error ? error.message : '기준정보를 저장하지 못했습니다.'))}
          onReset={() => void replaceAll('reset').then(() => toast.success('예시 데이터로 초기화했습니다.')).catch((error) => toast.error(error instanceof Error ? error.message : '초기화하지 못했습니다.'))}
          onImport={(payload) => void replaceAll('import', payload).then(() => toast.success('백업을 가져왔습니다.')).catch((error) => toast.error(error instanceof Error ? error.message : '가져오지 못했습니다.'))}
        />
      ) : (
        <Dashboard
          settings={settings}
          assessments={assessments}
          method={method}
          editable={editable}
          onMethod={setMethod}
          onOpen={(id) => openTab('edit', id)}
          onCreate={(assessment) => void createAssessment(assessment).catch((error) => toast.error(error instanceof Error ? error.message : '평가를 만들지 못했습니다.'))}
        />
      )}
      </div>
    </div>
  )
}

function Dashboard({
  settings,
  assessments,
  method,
  editable,
  onMethod,
  onOpen,
  onCreate,
}: {
  settings: RiskSettings
  assessments: RiskAssessment[]
  method: RiskMethod
  editable: boolean
  onMethod: (method: RiskMethod) => void
  onOpen: (id: string) => void
  onCreate: (assessment: RiskAssessment) => void
}) {
  const current = assessments.filter((item) => item.method === method)
  const mandatoryLabel = method === 'CL' ? '× 부적정' : method === 'L3' ? '상(높음)' : '개선 필수'
  const zoneCount = (key: RiskMethod) => new Set(assessments.filter((item) => item.method === key).map((item) => item.areaKey || item.area)).size
  let itemCount = 0
  let mandatory = 0
  let targets = 0
  let done = 0
  let late = 0
  for (const assessment of current) {
    for (const row of assessment.rows) {
      itemCount += 1
      if (isMandatory(assessment, row)) mandatory += 1
      if (!needsImprovement(assessment, row)) continue
      targets += 1
      const state = improvementStatus(row)
      if (state === 'done') done += 1
      if (state === 'late') late += 1
    }
  }
  const doneRate = targets ? Math.round((done / targets) * 100) : 0

  return (
    <div className="flex flex-col gap-4">
      <MethodPicker method={method} onMethod={onMethod} meta={(key) => `${zoneCount(key)}개 구역 평가`} />
      <div className="grid grid-cols-2 gap-2.5 md:grid-cols-3 xl:grid-cols-6">
        <StatCard label="평가 구역" value={zoneCount(method)} unit="곳" icon={MapPin} />
        <StatCard label="평가 항목" value={itemCount} unit="건" icon={ListChecks} />
        <StatCard label={mandatoryLabel} value={mandatory} unit="건" icon={AlertTriangle} tone="red" hint={itemCount ? `전체의 ${Math.round((mandatory / itemCount) * 100)}%` : undefined} />
        <StatCard label="개선대상" value={targets} unit="건" icon={Wrench} tone="orange" hint="대책 수립 항목" />
        <StatCard label="개선 완료" value={done} unit="건" icon={CheckCircle2} tone="emerald" hint={`완료율 ${doneRate}%`} />
        <StatCard label="기한 경과" value={late} unit="건" icon={CalendarClock} tone={late ? 'red' : 'slate'} hint={late ? '예정일 지남 · 미완료' : '지연 없음'} />
      </div>
      {ZONES.map((zone) => {
        const rows = current.filter((item) => zoneOf(item.areaKey) === zone.id)
        const missing = SEED_AREAS.filter((area) => zone.keys.includes(area.key) && !rows.some((item) => item.areaKey === area.key))
        if (!rows.length && !missing.length) return null
        const mark = ZONE_MARK[zone.id] || ZONE_MARK.etc
        return (
          <Panel key={zone.id} title={zone.name} description={`평가 ${rows.length}건${missing.length ? ` · 미작성 ${missing.length}곳` : ''}`} icon={mark.icon} tone={mark.tone}>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[60rem] table-fixed text-sm">
                <colgroup>
                  <col />
                  <col className="w-[30%]" />
                  <col className="w-16" />
                  <col className="w-20" />
                  <col className="w-36" />
                  <col className="w-24" />
                  <col className="w-10" />
                </colgroup>
                <thead className={THEAD}>
                  <tr>
                    <th className={cn(TH, 'pl-5')}>구역</th>
                    <th className={TH}>판정 분포</th>
                    <th className={cn(TH, 'text-center')}>항목</th>
                    <th className={cn(TH, 'text-center')}>{mandatoryLabel}</th>
                    <th className={TH}>개선 진행</th>
                    <th className={cn(TH, 'text-center')}>상태</th>
                    <th className="w-10" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((item) => {
                    let need = 0
                    let doneCount = 0
                    let mandatoryCount = 0
                    for (const row of item.rows) {
                      if (isMandatory(item, row)) mandatoryCount += 1
                      if (!needsImprovement(item, row)) continue
                      need += 1
                      if (row.done) doneCount += 1
                    }
                    const share = item.rows.length ? Math.round((mandatoryCount / item.rows.length) * 100) : 0
                    return (
                      <tr key={item.id} className="group cursor-pointer border-t border-border transition-colors hover:bg-muted/40" onClick={() => onOpen(item.id)}>
                        <td className="py-3.5 pr-4 pl-5">
                          <p className="font-semibold text-foreground">{item.area || item.title}</p>
                          <p className="mt-0.5 text-xs text-muted-foreground">{item.type} · {item.start}</p>
                        </td>
                        <td className="px-4 py-3.5">
                          <DistributionBar parts={distribution(item)} title={`${mandatoryLabel} ${share}%`} />
                        </td>
                        <td className="whitespace-nowrap px-4 py-3.5 text-center font-medium tabular-nums">{item.rows.length}</td>
                        <td className="whitespace-nowrap px-4 py-3.5 text-center">
                          {mandatoryCount ? <Pill tone="red" className="tabular-nums">{mandatoryCount}</Pill> : <span className="text-muted-foreground">0</span>}
                        </td>
                        <td className="px-4 py-3.5"><ProgressMini done={doneCount} total={need} /></td>
                        <td className="whitespace-nowrap px-4 py-3.5 text-center">
                          <Pill tone={item.status === '완료' ? 'emerald' : 'amber'}>{item.status}</Pill>
                        </td>
                        <td className="pr-4 text-muted-foreground/50 transition-colors group-hover:text-foreground">
                          <ChevronRight className="size-4" />
                        </td>
                      </tr>
                    )
                  })}
                  {missing.map((area) => (
                    <tr key={area.key} className="border-t border-dashed border-border bg-muted/20">
                      <td className="py-3 pr-4 pl-5 font-medium text-muted-foreground">{area.area}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground" colSpan={4}>아직 평가표가 없습니다.</td>
                      <td className="px-4 py-3 text-center" colSpan={2}>
                        {editable && (
                          <Button type="button" size="sm" variant="outline" className="h-8 rounded-lg" onClick={() => onCreate(assessmentFromArea(area.key, method, settings, true))}>
                            <Plus className="size-3.5" />
                            평가 만들기
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        )
      })}
    </div>
  )
}

function NewAssessment({
  settings,
  assessments,
  method,
  editable,
  onMethod,
  onCreate,
}: {
  settings: RiskSettings
  assessments: RiskAssessment[]
  method: RiskMethod
  editable: boolean
  onMethod: (method: RiskMethod) => void
  onCreate: (assessment: RiskAssessment) => void
}) {
  const [areaKey, setAreaKey] = useState(SEED_AREAS[0]?.key || '')
  const [areaText, setAreaText] = useState('')
  const [title, setTitle] = useState('')
  const [type, setType] = useState<(typeof EVAL_TYPES)[number]>('정기')
  const [start, setStart] = useState(today())
  const [end, setEnd] = useState(today())
  const [dept, setDept] = useState(settings.dept)
  const [evaluator, setEvaluator] = useState('')
  const [participants, setParticipants] = useState(settings.participants)
  const [fill, setFill] = useState('tpl')

  const create = () => {
    const withScores = fill === 'tpl'
    const assessment = areaKey
      ? assessmentFromArea(areaKey, method, settings, withScores || fill === 'tplblank')
      : assessmentFromArea('', method, settings, false)
    if (fill === 'tplblank') {
      assessment.rows = assessment.rows.map((row) => ({ ...row, p: '', s: '', p2: '', s2: '', judge: '', level: '', level2: '', measure: '' }))
      assessment.memo = ''
    }
    if (!areaKey) {
      assessment.area = areaText
      assessment.memo = ''
      if (areaText) assessment.title = `${new Date().getFullYear()}년 ${areaText} 위험성평가 (${METHODS[method].name})`
    }
    if (fill === 'blank') assessment.rows = [emptyRow()]
    if (fill === 'proc' && settings.processes.length) {
      assessment.rows = settings.processes.map((process) => ({ ...emptyRow(), process }))
      assessment.memo = ''
    }
    if (fill.startsWith('copy:')) {
      const source = assessments.find((item) => item.id === fill.slice(5))
      if (source) {
        assessment.rows = source.rows.map((row) => {
          const next: RiskRow = { ...emptyRow(), process: row.process, cat: row.cat, current: row.current }
          let hazard = row.hazard || ''
          if (method === 'CL' && !/여부\s*$/.test(hazard)) hazard = `${hazard} 방지조치 적정 여부`
          if (method !== 'CL') hazard = hazard.replace(/\s*방지조치 적정 여부\s*$/, '')
          next.hazard = hazard
          return next
        })
      }
      assessment.memo = ''
    }
    assessment.title = title || assessment.title
    assessment.type = type
    assessment.start = start
    assessment.end = end
    assessment.dept = dept
    assessment.evaluator = evaluator
    assessment.participants = participants
    onCreate(assessment)
  }

  return (
    <div className="flex flex-col gap-4">
      <MethodPicker method={method} onMethod={onMethod} />
      <Panel title="평가 정보" description="평가명과 구역, 처음 채울 항목을 고릅니다." icon={FileText}>
        <div className="grid gap-4 p-4 sm:grid-cols-2 xl:grid-cols-4">
          <label className={cn(LABEL, 'sm:col-span-2')}>평가명<input className={FIELD} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="비우면 자동으로 만듭니다" /></label>
          <label className={LABEL}>평가구분<select className={FIELD} value={type} onChange={(event) => setType(event.target.value as typeof type)}>{EVAL_TYPES.map((item) => <option key={item}>{item}</option>)}</select></label>
          <label className={LABEL}>초기 항목<select className={FIELD} value={fill} onChange={(event) => setFill(event.target.value)}>
            <option value="tpl">표준 위험요인 + 예시 판정</option>
            <option value="tplblank">표준 위험요인만</option>
            <option value="blank">빈 행 1개</option>
            <option value="proc">공정 목록으로 행 생성</option>
            {assessments.map((item) => <option key={item.id} value={`copy:${item.id}`}>가져오기 — {item.title}</option>)}
          </select></label>
          <label className={cn(LABEL, 'sm:col-span-2')}>평가구역<select className={FIELD} value={areaKey} onChange={(event) => setAreaKey(event.target.value)}>{SEED_AREAS.map((area) => <option key={area.key} value={area.key}>{area.area}</option>)}<option value="">기타(직접 입력)</option></select></label>
          <label className={cn(LABEL, 'sm:col-span-2')}>기타 구역명<input className={FIELD} disabled={Boolean(areaKey)} value={areaText} onChange={(event) => setAreaText(event.target.value)} placeholder={areaKey ? '평가구역에서 기타를 고르면 입력합니다' : '구역명을 입력해 주세요'} /></label>
        </div>
      </Panel>
      <Panel title="일정 · 참여자" description="평가 기간과 평가에 참여하는 사람을 적습니다." icon={Users}>
        <div className="grid gap-4 p-4 sm:grid-cols-2 xl:grid-cols-4">
          <label className={LABEL}>시작일<input className={FIELD} type="date" value={start} onChange={(event) => setStart(event.target.value)} /></label>
          <label className={LABEL}>종료일<input className={FIELD} type="date" value={end} onChange={(event) => setEnd(event.target.value)} /></label>
          <label className={LABEL}>평가부서<input className={FIELD} value={dept} onChange={(event) => setDept(event.target.value)} /></label>
          <label className={LABEL}>평가자<input className={FIELD} value={evaluator} onChange={(event) => setEvaluator(event.target.value)} /></label>
          <label className={cn(LABEL, 'sm:col-span-2 xl:col-span-4')}>참여 근로자<input className={FIELD} value={participants} onChange={(event) => setParticipants(event.target.value)} placeholder="쉼표로 구분해 주세요" /></label>
        </div>
        <div className="flex items-center justify-end gap-3 border-t border-border bg-muted/20 px-4 py-3">
          <span className="text-xs text-muted-foreground">{METHODS[method].name}으로 평가표를 만듭니다.</span>
          <Button type="button" className="h-9 rounded-lg px-4" disabled={!editable} onClick={create}>평가표 작성 시작</Button>
        </div>
      </Panel>
    </div>
  )
}

function escapeHtml(value: unknown) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char] || char))
}

export function printAssessment(assessment: RiskAssessment) {
  const body = assessment.rows.map((row, index) => {
    const score = riskScore(row)
    const grade = score ? gradeOf(assessment.matrix, score) : null
    const judged = assessment.method === 'CL' ? row.judge : assessment.method === 'L3' ? row.level : grade ? `${score} ${grade.g}` : ''
    return `<tr><td>${index + 1}</td><td>${escapeHtml(row.process)}</td><td>${escapeHtml(krasLabel(row.cat))}</td><td>${escapeHtml(row.hazard)}</td><td>${escapeHtml(row.current)}</td><td>${escapeHtml(judged)}</td><td>${escapeHtml(decisionOf(assessment, row))}</td><td>${escapeHtml(row.measure)}</td><td>${escapeHtml(row.owner)}</td><td>${escapeHtml(row.due)}</td></tr>`
  }).join('')
  const html = `<!DOCTYPE html><html lang="ko"><head><meta charset="utf-8"><title>${escapeHtml(assessment.title)}</title><style>@page{size:A4 landscape;margin:10mm}body{font-family:'Malgun Gothic',sans-serif;font-size:11px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #555;padding:4px;vertical-align:top}th{background:#dde6f0}h1{font-size:18px;margin:0 0 8px}</style></head><body><h1>${escapeHtml(assessment.title)}</h1><p>${escapeHtml(METHODS[assessment.method].name)} · ${escapeHtml(assessment.area)} · ${escapeHtml(assessment.start)}${assessment.end && assessment.end !== assessment.start ? ` ~ ${escapeHtml(assessment.end)}` : ''}</p><table><thead><tr><th>No</th><th>공정</th><th>분류</th><th>유해·위험요인</th><th>현재 조치</th><th>판정</th><th>결정</th><th>감소대책</th><th>담당</th><th>예정일</th></tr></thead><tbody>${body}</tbody></table></body></html>`
  const popup = window.open('', '_blank')
  if (!popup) return
  popup.document.write(html)
  popup.document.close()
  popup.focus()
  window.setTimeout(() => popup.print(), 300)
}
