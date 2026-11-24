'use client'

import { useMemo, useState } from 'react'
import {
  BookOpen,
  Building2,
  CalendarClock,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  DatabaseBackup,
  FlaskConical,
  Hourglass,
  ListTodo,
  ListTree,
  Scale,
  Search,
  SlidersHorizontal,
  Tags,
  X,
} from 'lucide-react'
import { AREA, FIELD, LABEL, MethodPicker, Panel, Pill, Segmented, StatCard, TH, THEAD, decisionTone, type Tone } from '@/components/risk/risk-ui'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  BIZ_FIELDS,
  CHEMS,
  KRAS,
  L3_GUIDE,
  LAWS,
  METHODS,
  METHOD_NO,
  METHOD_ORDER,
  RULES,
  STATUS_LABEL,
  blankBiz,
  decisionOf,
  gradeOf,
  improvementStatus,
  matrixOf,
  needsImprovement,
  riskScore,
  today,
  type MatrixKey,
  type RiskAssessment,
  type RiskMethod,
  type RiskSettings,
} from '@/lib/risk/model'

const PAGE_SIZE = 10

export function RiskImprove({
  assessments,
  editable,
  onChange,
  onOpen,
}: {
  assessments: RiskAssessment[]
  editable: boolean
  onChange: (assessment: RiskAssessment) => void
  onOpen: (id: string) => void
}) {
  const [method, setMethod] = useState<'' | RiskMethod>('CL')
  const [status, setStatus] = useState('')
  const [assessmentId, setAssessmentId] = useState('')
  const [query, setQuery] = useState('')
  const [picked, setPicked] = useState('')
  const [page, setPage] = useState(0)
  const filtered = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('ko-KR')
    return assessments.flatMap((assessment) => assessment.rows.flatMap((row, index) => {
      if (!needsImprovement(assessment, row)) return []
      if (method && assessment.method !== method) return []
      if (assessmentId && assessment.id !== assessmentId) return []
      const haystack = `${row.process} ${row.hazard} ${row.measure} ${row.owner}`.toLocaleLowerCase('ko-KR')
      if (q && !haystack.includes(q)) return []
      return [{ assessment, row, index }]
    }))
  }, [assessmentId, assessments, method, query])
  const items = status ? filtered.filter((item) => improvementStatus(item.row) === status) : filtered
  const pageCount = Math.max(1, Math.ceil(items.length / PAGE_SIZE))
  const currentPage = Math.min(page, pageCount - 1)
  const start = currentPage * PAGE_SIZE
  const visible = items.slice(start, start + PAGE_SIZE)
  const goPage = (next: number) => setPage(Math.min(Math.max(next, 0), pageCount - 1))
  const counts = { done: 0, late: 0, prog: 0 }
  for (const item of filtered) counts[improvementStatus(item.row)] += 1
  const current = filtered.find((item) => `${item.assessment.id}:${item.row.id}` === picked) || null
  const total = counts.done + counts.late + counts.prog
  const statusOptions: Array<{ key: string; label: string; value: number; tone: Tone; icon: typeof ListTodo; hint: string }> = [
    { key: '', label: '개선대상 전체', value: total, tone: 'slate', icon: ListTodo, hint: '대책이 필요한 항목' },
    { key: 'prog', label: '진행', value: counts.prog, tone: 'sky', icon: Hourglass, hint: '예정일 이전' },
    { key: 'late', label: '기한 경과', value: counts.late, tone: counts.late ? 'red' : 'slate', icon: CalendarClock, hint: '예정일 지남 · 미완료' },
    { key: 'done', label: '완료', value: counts.done, tone: 'emerald', icon: CheckCircle2, hint: total ? `완료율 ${Math.round((counts.done / total) * 100)}%` : '—' },
  ]

  const patchRow = (assessment: RiskAssessment, rowId: string, partial: Partial<RiskAssessment['rows'][number]>) => {
    onChange({
      ...assessment,
      rows: assessment.rows.map((row) => (row.id === rowId ? { ...row, ...partial } : row)),
    })
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        {statusOptions.map((option) => (
          <StatCard
            key={option.label}
            label={option.label}
            value={option.value}
            unit="건"
            hint={option.hint}
            icon={option.icon}
            tone={option.tone}
            selected={status === option.key}
            onClick={() => { setStatus(option.key); setPage(0) }}
          />
        ))}
      </div>
      <Panel title="개선대책 목록" description={`${items.length}건 · 행을 누르면 대책·담당·예정일을 바로 고칩니다`} icon={ClipboardList}>
        <div className="flex flex-wrap items-center gap-2 border-b border-border bg-muted/20 px-4 py-3">
          <select className={cn(FIELD, 'w-auto min-w-44')} value={method} onChange={(event) => { setMethod(event.target.value as '' | RiskMethod); setPage(0) }}>
            <option value="">전체 평가방법</option>
            {METHOD_ORDER.map((key) => <option key={key} value={key}>{METHOD_NO[key]} {METHODS[key].name}</option>)}
          </select>
          <select className={cn(FIELD, 'w-auto max-w-xs min-w-44')} value={assessmentId} onChange={(event) => { setAssessmentId(event.target.value); setPage(0) }}>
            <option value="">전체 평가</option>
            {assessments.map((item) => <option key={item.id} value={item.id}>{item.area || item.title}</option>)}
          </select>
          <div className="relative min-w-48 flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <input className={cn(FIELD, 'pl-9')} value={query} onChange={(event) => { setQuery(event.target.value); setPage(0) }} placeholder="공정·요인·대책·담당 검색" />
          </div>
        </div>
        {current && (
          <div className="border-b border-border bg-amber-50/40 px-4 py-4 dark:bg-amber-500/5">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5">
                  <Pill tone={decisionTone(decisionOf(current.assessment, current.row))}>{decisionOf(current.assessment, current.row) || '미판정'}</Pill>
                  <span className="text-xs text-muted-foreground">{current.assessment.area || current.assessment.title} · {current.row.process || '공정 없음'}</span>
                </div>
                <p className="mt-1.5 text-sm font-medium leading-6">{current.row.hazard}</p>
              </div>
              <Button type="button" size="sm" variant="ghost" className="shrink-0" onClick={() => setPicked('')}>
                <X className="size-4" />
                닫기
              </Button>
            </div>
            <div className="mt-3 grid gap-3 md:grid-cols-[1fr_9rem_10rem_auto]">
              <label className={LABEL}>대책<textarea className={AREA} rows={2} disabled={!editable} value={current.row.measure} onChange={(event) => patchRow(current.assessment, current.row.id, { measure: event.target.value })} placeholder="감소대책을 입력해 주세요" /></label>
              <label className={LABEL}>담당<input className={FIELD} disabled={!editable} value={current.row.owner} onChange={(event) => patchRow(current.assessment, current.row.id, { owner: event.target.value })} /></label>
              <label className={LABEL}>예정일<input className={FIELD} type="date" disabled={!editable} value={current.row.due} onChange={(event) => patchRow(current.assessment, current.row.id, { due: event.target.value })} /></label>
              <label className="flex h-9 cursor-pointer items-center gap-2 self-end rounded-lg border border-input bg-background px-3 text-sm font-semibold">
                <input type="checkbox" className="size-4 accent-emerald-600" disabled={!editable} checked={current.row.done} onChange={(event) => patchRow(current.assessment, current.row.id, { done: event.target.checked, doneDate: event.target.checked ? (current.row.doneDate || today()) : '' })} />
                완료
              </label>
            </div>
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[48rem] text-sm">
            <thead className={THEAD}>
              <tr>
                <th className={cn(TH, 'pl-5')}>공정 · 평가</th>
                <th className={TH}>유해·위험요인 / 대책</th>
                <th className={cn(TH, 'text-center')}>판정</th>
                <th className={cn(TH, 'text-center')}>예정일</th>
                <th className={cn(TH, 'text-center')}>상태</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((item) => {
                const state = improvementStatus(item.row)
                const key = `${item.assessment.id}:${item.row.id}`
                const score = riskScore(item.row)
                const grade = score ? gradeOf(item.assessment.matrix, score) : null
                const decision = decisionOf(item.assessment, item.row)
                const rail = state === 'late' ? 'border-l-red-500' : state === 'done' ? 'border-l-emerald-500' : 'border-l-sky-400'
                return (
                  <tr key={key} className={cn('cursor-pointer border-t border-border transition-colors', picked === key ? 'bg-amber-50/60 dark:bg-amber-500/10' : 'hover:bg-muted/40')} onClick={() => setPicked(key)}>
                    <td className={cn('whitespace-nowrap border-l-[3px] py-3.5 pr-4 pl-4 align-top', rail)}>
                      <p className="font-semibold">{item.row.process || '공정 없음'}</p>
                      <button type="button" className="mt-0.5 block text-left text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline" onClick={(event) => { event.stopPropagation(); onOpen(item.assessment.id) }}>{item.assessment.area || item.assessment.title}</button>
                      <p className="text-[11px] text-muted-foreground/80">{METHODS[item.assessment.method].short}</p>
                    </td>
                    <td className="px-4 py-3.5 align-top">
                      <p className="leading-6">{item.row.hazard}</p>
                      <p className={cn('mt-1 flex gap-1.5 text-xs leading-5', item.row.measure ? 'text-slate-600 dark:text-slate-300' : 'text-muted-foreground')}>
                        <span className="shrink-0 font-semibold text-emerald-600 dark:text-emerald-400">대책</span>
                        {item.row.measure || '아직 입력하지 않았습니다'}
                      </p>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3.5 text-center align-top">
                      <Pill tone={decisionTone(decision)}>{decision || '미판정'}{grade ? ` ${score}` : ''}</Pill>
                    </td>
                    <td className={cn('whitespace-nowrap px-4 py-3.5 text-center align-top tabular-nums', state === 'late' ? 'font-semibold text-red-600' : 'text-muted-foreground')}>{item.row.due || '—'}</td>
                    <td className="whitespace-nowrap px-4 py-3.5 text-center align-top">
                      <Pill tone={state === 'late' ? 'red' : state === 'done' ? 'emerald' : 'sky'}>{state === 'late' ? '기한 경과' : STATUS_LABEL[state]}</Pill>
                    </td>
                  </tr>
                )
              })}
              {items.length === 0 && <tr><td colSpan={5} className="px-4 py-14 text-center text-muted-foreground">해당하는 개선대상 항목이 없습니다.</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-4 py-2.5 text-sm">
          <span className="text-xs text-muted-foreground tabular-nums">{items.length === 0 ? '0건' : `${start + 1}–${start + visible.length} / ${items.length}건`}</span>
          <div className="flex items-center gap-1">
            <Button type="button" size="sm" variant="ghost" className="h-8" disabled={currentPage === 0} onClick={() => goPage(currentPage - 1)}>
              <ChevronLeft className="size-4" />
              이전
            </Button>
            {Array.from({ length: pageCount }, (_, index) => (
              <button
                key={index}
                type="button"
                className={cn('size-8 rounded-lg text-sm tabular-nums transition', index === currentPage ? 'bg-foreground font-semibold text-background' : 'text-muted-foreground hover:bg-muted hover:text-foreground')}
                onClick={() => goPage(index)}
              >
                {index + 1}
              </button>
            ))}
            <Button type="button" size="sm" variant="ghost" className="h-8" disabled={currentPage >= pageCount - 1} onClick={() => goPage(currentPage + 1)}>
              다음
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      </Panel>
    </div>
  )
}

const L3_EXAMPLE = {
  상: '사망·중상해 가능성이 있거나, 안전조치가 없거나 상당히 미흡함',
  중: '휴업이 필요한 부상 가능성이 있고, 안전조치 일부가 미흡함',
  하: '경미한 부상 수준이며 안전조치가 적절히 되어 있음',
} as const

const CL_GUIDE = [
  ['○ (적정)', '관련 법령·기준에 따른 안전조치가 되어 있어 해당 유해·위험요인이 허용 가능한 수준으로 관리되고 있음', '현재의 안전보건조치를 유지하고 정기적으로 상태를 관찰'],
  ['× (부적정)', '필요한 안전조치가 없거나 미흡하여 허용 가능한 수준으로 관리되지 않음', '즉시 개선대책을 수립·시행'],
  ['N/A', '해당 공정·작업에 적용되지 않는 점검항목', '-'],
] as const

function lawsFor(method: RiskMethod) {
  const procedure = LAWS.filter((row) => /제36조|제37조|위험성평가에 관한 지침/.test(row[1]))
  if (method === 'FS') return procedure
  if (method === 'L3') return procedure.filter((row) => /제36조|위험성평가에 관한 지침/.test(row[1]))
  return LAWS
}

export function RiskCriteria({ method, onMethod }: { method: RiskMethod; onMethod: (method: RiskMethod) => void }) {
  const [matrix, setMatrix] = useState<MatrixKey>('5x4')
  const [lawMethod, setLawMethod] = useState<RiskMethod | null>(null)
  const spec = matrixOf(method === 'FS' ? matrix : '5x4')
  const showingLaws = lawMethod === method
  return (
    <div className="flex flex-col gap-4">
      <MethodPicker
        method={method}
        onMethod={(key) => { setLawMethod(null); onMethod(key) }}
        footer={(key) => {
          const lawsOpen = lawMethod === key
          return (
            <button
              type="button"
              onClick={() => { onMethod(key); setLawMethod(lawsOpen ? null : key) }}
              className={cn(
                'inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-lg border text-xs font-semibold transition',
                lawsOpen ? 'border-foreground bg-foreground text-background' : 'border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground',
              )}
            >
              <BookOpen className="size-3.5" />
              {lawsOpen ? '법령 닫기' : '관련 법령보기'}
            </button>
          )
        }}
      />
      {showingLaws ? (
        <>
          <ReferenceTable title={`${METHODS[method].name} 관련 법령`} headers={['구분', '법령/조항', '내용']} rows={lawsFor(method)} />
          {method === 'CL' && <ChecklistReferences />}
        </>
      ) : (
        <Panel title={`${METHODS[method].name} 판정 기준`} description={`${METHODS[method].when} · ${METHODS[method].basis}`} icon={Scale}>
          <div className="px-5 py-4">
            <p className="rounded-lg bg-muted/40 px-4 py-3 text-sm leading-7">{METHODS[method].desc}</p>
            {method === 'CL' && <ChecklistGuide />}
            {method === 'L3' && <LevelGuide />}
            {method === 'FS' && <FrequencyGuide matrix={matrix} onMatrix={setMatrix} spec={spec} />}
          </div>
        </Panel>
      )}
      {!showingLaws && (
      <Panel title="평가방법 비교" description="세 가지 평가방법의 판정 방식과 장단점입니다." icon={SlidersHorizontal}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className={THEAD}>
              <tr>{['평가방법', '판정 방식', '개선 필수 기준', '장점', '유의점', '근거'].map((label) => <th key={label} className={TH}>{label}</th>)}</tr>
            </thead>
            <tbody>
              {[
                ['빈도·강도법', '가능성 × 중대성 점수', '5×4는 9점 이상, 3×3은 6점 이상', '위험도를 숫자로 비교할 수 있다', '점수 기준을 같이 써야 한다', '지침 제7조'],
                ['체크리스트법', '○ 적정 / × 부적정', '× 판정', '법령 준수를 빨리 확인한다', '항목 밖 위험이 빠질 수 있다', '지침 제7조'],
                ['3단계 판단법', '상·중·하', '상', '근로자가 같이 판단하기 쉽다', '판단 이유를 적어 두는 편이 좋다', '지침 제7조'],
              ].map((row) => (
                <tr key={row[0]} className={cn('border-t border-border', row[0].startsWith(METHODS[method].short.slice(0, 2)) && 'bg-amber-50/50 dark:bg-amber-500/5')}>
                  {row.map((cell, index) => <td key={`${row[0]}-${index}`} className={cn('px-4 py-3 align-top leading-6', index === 0 && 'whitespace-nowrap font-semibold')}>{cell}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
      )}
    </div>
  )
}

function ChecklistReferences() {
  return (
    <>
      <ReferenceTable title="산업안전보건기준에 관한 규칙 — 도금 공정 주요 조항" headers={['구분', '조항', '내용']} rows={RULES} />
      <Panel title="취급 유해화학물질" description="법적 관리구분은 MSDS로 최종 확인합니다." icon={FlaskConical} tone="orange">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className={THEAD}>
              <tr>{['물질', '사용 공정', '주요 유해성', '법적 관리구분', '취급 구역'].map((label) => <th key={label} className={TH}>{label}</th>)}</tr>
            </thead>
            <tbody>
              {CHEMS.map((chem) => (
                <tr key={chem[0]} className="border-t border-border">
                  {chem.map((cell, index) => <td key={`${chem[0]}-${index}`} className={cn('px-4 py-3 align-top leading-6', index === 0 && 'whitespace-nowrap font-semibold')}>{cell}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
      <Panel title="유해·위험요인 분류" description="평가표의 위험분류 선택지입니다." icon={Tags}>
        <div className="grid gap-3 p-4 md:grid-cols-2">
          {KRAS.map((group) => (
            <div key={group[0]} className="rounded-lg border border-border p-3.5">
              <p className="flex items-center gap-2 text-sm font-bold">
                <span className="grid size-6 place-items-center rounded-md bg-foreground text-xs text-background tabular-nums">{group[0]}</span>
                {group[1]}
              </p>
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {group[2].map((item) => (
                  <span key={item[0]} className="rounded-md bg-muted/70 px-2 py-1 text-xs leading-5 text-slate-600 dark:text-muted-foreground">
                    <span className="font-semibold text-foreground tabular-nums">{item[0]}</span> {item[1]}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Panel>
    </>
  )
}

const CL_STEPS = ['공정별 유해·위험요인 파악', '점검항목 설정', '현재 조치 확인', '○/× 판정', '× 항목 개선대책', '결과 확인·기록']

function ChecklistGuide() {
  return (
    <div className="mt-4">
      <div className="grid gap-2">
        {CL_GUIDE.map((row, index) => {
          const tone: Tone = index === 0 ? 'emerald' : index === 1 ? 'red' : 'slate'
          return <GuideRow key={row[0]} tone={tone} label={row[0]} body={row[1]} action={row[2]} />
        })}
      </div>
      <p className="mt-5 mb-2 text-xs font-semibold text-muted-foreground">진행 순서</p>
      <ol className="grid gap-2 sm:grid-cols-3 xl:grid-cols-6">
        {CL_STEPS.map((step, index) => (
          <li key={step} className="flex items-center gap-2 rounded-lg border border-border px-3 py-2.5 text-sm font-medium leading-5">
            <span className="grid size-6 shrink-0 place-items-center rounded-full bg-foreground text-xs font-bold tabular-nums text-background">{index + 1}</span>
            {step}
          </li>
        ))}
      </ol>
    </div>
  )
}

function LevelGuide() {
  return (
    <div className="mt-4">
      <div className="grid gap-2">
        {(['상', '중', '하'] as const).map((level) => (
          <GuideRow key={level} tone={level === '상' ? 'red' : level === '중' ? 'amber' : 'emerald'} label={`${level} · ${L3_GUIDE[level].t}`} body={L3_EXAMPLE[level]} action={L3_GUIDE[level].act} />
        ))}
      </div>
      <p className="mt-4 text-xs leading-6 text-muted-foreground">판단 기준은 근로자가 참여해 사업장 실정에 맞게 미리 정합니다. (산업안전보건법 제36조)</p>
    </div>
  )
}

const GUIDE_RAIL: Record<Tone, string> = {
  red: 'border-l-red-500',
  orange: 'border-l-orange-500',
  amber: 'border-l-amber-500',
  emerald: 'border-l-emerald-500',
  sky: 'border-l-sky-500',
  slate: 'border-l-slate-300 dark:border-l-slate-600',
}

function GuideRow({ tone, label, body, action }: { tone: Tone; label: string; body: string; action: string }) {
  return (
    <div className={cn('grid items-start gap-2 rounded-lg border border-border border-l-4 bg-card px-4 py-3 sm:grid-cols-[8rem_1fr]', GUIDE_RAIL[tone])}>
      <Pill tone={tone} className="w-fit px-2.5 py-1 text-[13px]">{label}</Pill>
      <div>
        <p className="text-sm leading-6">{body}</p>
        {action && action !== '-' ? <p className="mt-0.5 text-xs leading-5 text-muted-foreground">→ {action}</p> : null}
      </div>
    </div>
  )
}

function FrequencyGuide({
  matrix,
  onMatrix,
  spec,
}: {
  matrix: MatrixKey
  onMatrix: (matrix: MatrixKey) => void
  spec: ReturnType<typeof matrixOf>
}) {
  let low = 1
  return (
    <div className="mt-4 flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-xs font-semibold text-muted-foreground">위험성 행렬</span>
        <Segmented
          value={matrix}
          onChange={onMatrix}
          options={[
            { value: '5x4', label: '5×4 (표준)' },
            { value: '3x3', label: '3×3 (간이)' },
          ]}
        />
        <span className="text-xs text-muted-foreground">출처: {spec.src}</span>
      </div>
      <div className="grid gap-3 xl:grid-cols-2">
        <ScaleTable title="(1) 사고발생 가능성 (빈도)" rows={spec.pL} />
        <ScaleTable title="(2) 사고의 중대성 (강도)" rows={spec.sL} />
      </div>
      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <div className="overflow-hidden rounded-lg border border-border">
          <p className="border-b border-border bg-slate-50/80 px-4 py-2.5 text-xs font-semibold text-slate-500 dark:bg-muted/40 dark:text-muted-foreground">위험성 행렬 (가능성 × 중대성)</p>
          <div className="overflow-x-auto p-3">
            <table className="w-full border-separate border-spacing-1 text-center text-xs">
              <thead>
                <tr>
                  <th className="px-2 py-1.5 font-semibold text-muted-foreground">가능성 \ 중대성</th>
                  {spec.sL.map((label, index) => <th key={label[0]} className="px-2 py-1.5 font-semibold text-muted-foreground">{label[0]}<span className="ml-0.5 tabular-nums">({index + 1})</span></th>)}
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: spec.pN }, (_, offset) => spec.pN - offset).map((possibility) => (
                  <tr key={possibility}>
                    <th className="px-2 py-1.5 font-semibold whitespace-nowrap text-muted-foreground">{spec.pL[possibility - 1][0]}<span className="ml-0.5 tabular-nums">({possibility})</span></th>
                    {spec.sL.map((_, index) => {
                      const score = possibility * (index + 1)
                      const grade = spec.grades.find((item) => score <= item.max) || spec.grades[spec.grades.length - 1]
                      return (
                        <td key={index} className="rounded-md px-2 py-2 font-semibold text-white" style={{ background: grade.c }}>
                          <span className="block text-sm leading-none tabular-nums">{score}</span>
                          <span className="mt-1 block text-[10px] leading-none opacity-90">{grade.g}</span>
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className={THEAD}>
              <tr>{['위험성 수준', '점수', '관리기준'].map((label) => <th key={label} className={TH}>{label}</th>)}</tr>
            </thead>
            <tbody>
              {spec.grades.map((grade) => {
                const from = low
                const to = Math.min(grade.max, spec.pN * spec.sN)
                low = grade.max + 1
                return (
                  <tr key={grade.g} className="border-t border-border">
                    <th className="whitespace-nowrap px-4 py-2.5 text-left">
                      <span className="inline-flex items-center gap-1.5 font-semibold" style={{ color: grade.c }}>
                        <span className="size-2.5 rounded-sm" style={{ background: grade.c }} aria-hidden />
                        {grade.g}
                      </span>
                    </th>
                    <td className="whitespace-nowrap px-4 py-2.5 tabular-nums">{from}~{to}</td>
                    <td className="px-4 py-2.5 leading-6">{grade.act}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <p className="border-t border-border bg-red-50/50 px-4 py-2.5 text-xs leading-5 text-red-700 dark:bg-red-500/10 dark:text-red-300">
            위험성 = (1) 가능성 × (2) 중대성 · <b>{spec.th}점 이상은 개선 필수</b>이며, 위험성 감소대책을 반드시 수립합니다.
          </p>
        </div>
      </div>
    </div>
  )
}

function ScaleTable({ title, rows }: { title: string; rows: Array<[string, string]> }) {
  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <p className="border-b border-border bg-slate-50/80 px-4 py-2.5 text-xs font-semibold text-slate-500 dark:bg-muted/40 dark:text-muted-foreground">{title}</p>
      <table className="w-full text-sm">
        <tbody>
          {rows.map((row, index) => (
            <tr key={row[0]} className="border-t border-border first:border-t-0">
              <td className="w-12 py-2.5 pl-4 text-center">
                <span className="grid size-6 place-items-center rounded-md bg-muted text-xs font-bold tabular-nums">{index + 1}</span>
              </td>
              <th className="whitespace-nowrap px-3 py-2.5 text-left font-semibold">{row[0]}</th>
              <td className="px-3 py-2.5 leading-6 text-slate-600 dark:text-muted-foreground">{row[1]}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function ReferenceTable({ title, headers, rows }: { title: string; headers: string[]; rows: Array<[string, string, string]> }) {
  return (
    <Panel title={title} icon={BookOpen}>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className={THEAD}>
            <tr>{headers.map((label) => <th key={label} className={TH}>{label}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.join('|')} className="border-t border-border">
                {row.map((cell, index) => <td key={`${row[0]}-${index}`} className={cn('px-4 py-3 align-top leading-6', index === 0 && 'whitespace-nowrap font-semibold', index === 1 && 'min-w-48 text-slate-600 dark:text-slate-300')}>{cell}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  )
}

export function RiskMaster({
  settings,
  assessments,
  editable,
  onSave,
  onReset,
  onImport,
}: {
  settings: RiskSettings
  assessments: RiskAssessment[]
  editable: boolean
  onSave: (settings: RiskSettings) => void
  onReset: () => void
  onImport: (payload: { settings: RiskSettings; assessments: RiskAssessment[] }) => void
}) {
  const [draft, setDraft] = useState(settings)
  const [processes, setProcesses] = useState(settings.processes.join('\n'))
  const [backupText, setBackupText] = useState('')
  const biz = draft.biz || blankBiz()
  const updateBiz = (key: keyof typeof biz, value: string) => {
    const next = { ...draft, biz: { ...biz, [key]: value }, company: key === 'name' ? value : draft.company, address: key === 'address' ? value : draft.address }
    setDraft(next)
  }

  return (
    <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(18rem,0.8fr)]">
      <Panel title="사업자 정보" description="출력물 머리글과 평가표 기본 정보에 들어갑니다." icon={Building2}>
        <div className="grid gap-4 p-4 sm:grid-cols-2">
          {BIZ_FIELDS.map(([key, label]) => (
            <label key={key} className={cn(LABEL, (key === 'address' || key === 'item' || key === 'certs') && 'sm:col-span-2')}>{label}<input className={FIELD} disabled={!editable} value={biz[key] || ''} onChange={(event) => updateBiz(key, event.target.value)} /></label>
          ))}
        </div>
      </Panel>
      <div className="flex flex-col gap-4">
        <Panel title="평가 기본값" description="새 평가를 만들 때 미리 채워집니다." icon={SlidersHorizontal}>
          <div className="grid gap-4 p-4">
            <label className={LABEL}>기본 평가부서<input className={FIELD} disabled={!editable} value={draft.dept} onChange={(event) => setDraft({ ...draft, dept: event.target.value })} /></label>
            <label className={LABEL}>기본 참여 근로자<input className={FIELD} disabled={!editable} value={draft.participants} onChange={(event) => setDraft({ ...draft, participants: event.target.value })} /></label>
          </div>
        </Panel>
        <Panel title="공정 / 설비 목록" description="한 줄에 하나씩 적으면 평가표 자동완성에 씁니다." icon={ListTree}>
          <div className="p-4">
          <textarea className={cn(AREA, 'h-36')} disabled={!editable} value={processes} onChange={(event) => setProcesses(event.target.value)} />
          <div className="mt-3 flex flex-wrap justify-end gap-2">
            <Button type="button" variant="outline" disabled={!editable} onClick={() => {
              const next = processes.split('\n').map((line) => line.trim()).filter(Boolean)
              for (const assessment of assessments) {
                for (const row of assessment.rows) {
                  const name = row.process.trim()
                  if (name && !next.includes(name)) next.push(name)
                }
              }
              setProcesses(next.join('\n'))
            }}>공정명 가져오기</Button>
            <Button type="button" disabled={!editable} onClick={() => onSave({ ...draft, processes: processes.split('\n').map((line) => line.trim()).filter(Boolean) })}>저장</Button>
          </div>
          </div>
        </Panel>
        <Panel
          title="백업 / 복원"
          description="전체 평가를 JSON으로 저장하거나 되돌립니다."
          icon={DatabaseBackup}
          actions={<Button type="button" size="sm" variant="outline" onClick={() => downloadJson({ settings: draft, assessments })}>JSON 저장</Button>}
        >
          <div className="p-4">
          <textarea className={cn(AREA, 'h-20 text-xs')} value={backupText} onChange={(event) => setBackupText(event.target.value)} placeholder="백업 JSON을 붙여 넣거나 파일을 선택해 주세요." />
          <input className="mt-2 block text-xs file:mr-2 file:rounded-md file:border file:border-input file:bg-background file:px-2.5 file:py-1 file:text-xs file:font-semibold" type="file" accept="application/json,.json" onChange={(event) => {
            const file = event.target.files?.[0]
            if (!file) return
            void file.text().then(setBackupText)
          }} />
          <div className="mt-3 flex justify-end gap-2">
            <Button type="button" variant="outline" disabled={!editable} onClick={() => { if (window.confirm('모든 평가를 예시 데이터로 바꿉니다.')) onReset() }}>예시로 초기화</Button>
            <Button type="button" disabled={!editable} onClick={() => {
              try {
                const parsed = JSON.parse(backupText) as { settings?: RiskSettings; assessments?: RiskAssessment[] }
                if (!parsed.settings?.biz || !Array.isArray(parsed.assessments)) throw new Error('백업 형식이 아닙니다.')
                if (window.confirm(`평가 ${parsed.assessments.length}건으로 현재 데이터를 바꿉니다.`)) onImport({ settings: parsed.settings, assessments: parsed.assessments })
              } catch (error) {
                window.alert(error instanceof Error ? error.message : 'JSON 형식이 올바르지 않습니다.')
              }
            }}>가져오기</Button>
          </div>
          </div>
        </Panel>
      </div>
    </div>
  )
}

function downloadJson(payload: { settings: RiskSettings; assessments: RiskAssessment[] }) {
  const blob = new Blob([JSON.stringify(payload, null, 1)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  link.href = url
  link.download = `위험성평가_백업_${stamp}.json`
  link.click()
  URL.revokeObjectURL(url)
}
