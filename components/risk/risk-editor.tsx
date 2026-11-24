'use client'

import { useState } from 'react'
import { ArrowDownUp, Copy, Info, Plus, Printer, Trash2, X } from 'lucide-react'
import { AREA, FIELD, LABEL, METHOD_ICON, Pill, ProgressMini, Segmented, TH, THEAD, decisionTone, type Tone } from '@/components/risk/risk-ui'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import {
  EVAL_TYPES,
  KRAS,
  METHODS,
  decisionOf,
  emptyRow,
  gradeOf,
  isMandatory,
  matrixOf,
  needsImprovement,
  riskId,
  riskScore,
  today,
  type RiskAssessment,
  type RiskLevel,
  type RiskRow,
  type RiskSettings,
} from '@/lib/risk/model'
import { cn } from '@/lib/utils'

export function RiskEditor({
  assessment,
  settings,
  editable,
  onChange,
  onPrint,
}: {
  assessment: RiskAssessment
  settings: RiskSettings
  editable: boolean
  onChange: (assessment: RiskAssessment) => void
  onPrint: () => void
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [onlyNeed, setOnlyNeed] = useState(false)
  const [showInfo, setShowInfo] = useState(false)
  const patch = (partial: Partial<RiskAssessment>) => onChange({ ...assessment, ...partial })
  const patchRow = (id: string, partial: Partial<RiskRow>) => {
    onChange({ ...assessment, rows: assessment.rows.map((row) => (row.id === id ? { ...row, ...partial } : row)) })
  }
  const selected = assessment.rows.find((row) => row.id === selectedId) || null
  let need = 0
  let done = 0
  for (const row of assessment.rows) {
    if (!needsImprovement(assessment, row)) continue
    need += 1
    if (row.done) done += 1
  }
  const visible = assessment.rows
    .map((row, index) => ({ row, index }))
    .filter(({ row }) => !onlyNeed || needsImprovement(assessment, row))
  const MethodIcon = METHOD_ICON[assessment.method]

  return (
    <div className="flex flex-col gap-4">
      <section className="rounded-xl border border-border bg-card p-4 shadow-xs">
        <div className="flex flex-wrap items-center gap-4">
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-foreground text-background">
            <MethodIcon className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-lg font-bold tracking-tight">{assessment.area || assessment.title}</h2>
            <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
              <Pill tone="slate">{METHODS[assessment.method].name}</Pill>
              <Pill tone="slate">{assessment.type}</Pill>
              <span className="tabular-nums">{assessment.start}{assessment.end && assessment.end !== assessment.start ? ` ~ ${assessment.end}` : ''}</span>
              <span className="text-border">|</span>
              <span>항목 <b className="font-semibold text-foreground tabular-nums">{assessment.rows.length}</b></span>
            </div>
          </div>
          <div className="flex min-w-44 flex-col gap-1">
            <span className="text-[11px] font-medium text-muted-foreground">개선 진행</span>
            <ProgressMini done={done} total={need} />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Segmented
              value={assessment.status}
              disabled={!editable}
              onChange={(status) => patch({ status })}
              options={[
                { value: '작성중', label: '작성중', activeClass: 'bg-amber-500 text-white shadow-sm' },
                { value: '완료', label: '완료', activeClass: 'bg-emerald-600 text-white shadow-sm' },
              ]}
            />
            <Button type="button" variant={showInfo ? 'secondary' : 'outline'} className="h-9 rounded-lg" onClick={() => setShowInfo((value) => !value)}>
              <Info className="size-4" />
              기본정보
            </Button>
            <Button type="button" variant="outline" className="h-9 rounded-lg" onClick={onPrint}>
              <Printer className="size-4" />
              출력
            </Button>
          </div>
        </div>

        {showInfo && (
          <div className="mt-4 grid gap-4 border-t border-border pt-4 sm:grid-cols-2 xl:grid-cols-4">
            <label className={cn(LABEL, 'xl:col-span-2')}>평가명<input className={FIELD} disabled={!editable} value={assessment.title} onChange={(event) => patch({ title: event.target.value })} /></label>
            <label className={LABEL}>구분<select className={FIELD} disabled={!editable} value={assessment.type} onChange={(event) => patch({ type: event.target.value as RiskAssessment['type'] })}>{EVAL_TYPES.map((item) => <option key={item}>{item}</option>)}</select></label>
            <label className={LABEL}>구역<input className={FIELD} disabled={!editable} value={assessment.area} onChange={(event) => patch({ area: event.target.value })} /></label>
            <label className={LABEL}>시작<input className={FIELD} type="date" disabled={!editable} value={assessment.start} onChange={(event) => patch({ start: event.target.value })} /></label>
            <label className={LABEL}>종료<input className={FIELD} type="date" disabled={!editable} value={assessment.end} onChange={(event) => patch({ end: event.target.value })} /></label>
            <label className={LABEL}>부서<input className={FIELD} disabled={!editable} value={assessment.dept} onChange={(event) => patch({ dept: event.target.value })} /></label>
            <label className={LABEL}>평가자<input className={FIELD} disabled={!editable} value={assessment.evaluator} onChange={(event) => patch({ evaluator: event.target.value })} /></label>
            <label className={cn(LABEL, 'sm:col-span-2')}>참여 근로자<input className={FIELD} disabled={!editable} value={assessment.participants} onChange={(event) => patch({ participants: event.target.value })} /></label>
            <label className={LABEL}>작성<input className={FIELD} disabled={!editable} value={assessment.sign.write} onChange={(event) => patch({ sign: { ...assessment.sign, write: event.target.value } })} /></label>
            <label className={LABEL}>검토<input className={FIELD} disabled={!editable} value={assessment.sign.review} onChange={(event) => patch({ sign: { ...assessment.sign, review: event.target.value } })} /></label>
            <label className={LABEL}>승인<input className={FIELD} disabled={!editable} value={assessment.sign.approve} onChange={(event) => patch({ sign: { ...assessment.sign, approve: event.target.value } })} /></label>
            {assessment.method === 'FS' && (
              <label className={LABEL}>개선 기준점<input className={FIELD} type="number" min={1} disabled={!editable} value={assessment.threshold} onChange={(event) => patch({ threshold: event.target.value })} /></label>
            )}
          </div>
        )}
      </section>

      {selected && (
        <EditPanel
          assessment={assessment}
          row={selected}
          index={assessment.rows.findIndex((item) => item.id === selected.id)}
          editable={editable}
          onChange={(partial) => patchRow(selected.id, partial)}
          onClose={() => setSelectedId(null)}
          onDuplicate={() => {
            const copy = { ...selected, id: riskId() }
            const rows = [...assessment.rows]
            rows.splice(assessment.rows.findIndex((item) => item.id === selected.id) + 1, 0, copy)
            patch({ rows })
            setSelectedId(copy.id)
          }}
          onDelete={() => {
            patch({ rows: assessment.rows.filter((item) => item.id !== selected.id) })
            setSelectedId(null)
          }}
        />
      )}

      <datalist id="risk-processes">{settings.processes.map((process) => <option key={process} value={process} />)}</datalist>
      <section className="overflow-hidden rounded-xl border border-border bg-card shadow-xs">
        <div className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3">
          <Segmented
            value={onlyNeed ? 'need' : 'all'}
            onChange={(value) => setOnlyNeed(value === 'need')}
            options={[
              { value: 'all', label: `전체 ${assessment.rows.length}` },
              { value: 'need', label: `개선 대상 ${need}` },
            ]}
          />
          <span className="text-xs text-muted-foreground">행을 누르면 편집 창이 열립니다.</span>
          <span className="ml-auto flex gap-2">
            <Button type="button" size="sm" variant="ghost" className="h-9 rounded-lg" disabled={!editable} onClick={() => {
              const order = new Map(settings.processes.map((process, index) => [process, index]))
              patch({ rows: [...assessment.rows].sort((a, b) => (order.get(a.process) ?? 999) - (order.get(b.process) ?? 999) || a.process.localeCompare(b.process, 'ko')) })
            }}>
              <ArrowDownUp className="size-4" />
              공정순 정렬
            </Button>
            <Button type="button" size="sm" variant="outline" className="h-9 rounded-lg" disabled={!editable} onClick={() => {
              const row = emptyRow()
              patch({ rows: [...assessment.rows, row] })
              setSelectedId(row.id)
            }}>
              <Plus className="size-4" />
              행 추가
            </Button>
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[44rem] text-sm">
            <thead className={THEAD}>
              <tr>
                <th className={cn(TH, 'w-14 text-center')}>No</th>
                <th className={cn(TH, 'w-40')}>공정</th>
                <th className={TH}>{assessment.method === 'CL' ? '점검항목' : '유해·위험요인'}</th>
                <th className={cn(TH, 'w-28 text-center')}>판정</th>
              </tr>
            </thead>
            <tbody>
              {visible.map(({ row, index }) => {
                const mark = verdict(assessment, row)
                const active = row.id === selectedId
                return (
                  <tr
                    key={row.id}
                    className={cn('cursor-pointer border-t border-border transition-colors', active ? 'bg-amber-50/70 dark:bg-amber-500/10' : 'hover:bg-muted/40')}
                    onClick={() => setSelectedId(row.id)}
                  >
                    <td className={cn('border-l-[3px] px-4 py-3.5 text-center align-top tabular-nums text-muted-foreground', active ? 'border-l-amber-500' : 'border-l-transparent')}>{index + 1}</td>
                    <td className="px-4 py-3.5 align-top font-semibold">{row.process || <span className="font-normal text-muted-foreground">—</span>}</td>
                    <td className="px-4 py-3.5 align-top">
                      <p className="leading-6">{row.hazard || <span className="text-muted-foreground">—</span>}</p>
                      {(row.current || row.measure) && (
                        <div className="mt-1.5 flex flex-col gap-0.5 text-xs leading-5">
                          {row.current && (
                            <p className="flex gap-1.5 text-slate-600 dark:text-slate-300">
                              <span className="shrink-0 font-semibold text-slate-400">현재</span>
                              {row.current}
                            </p>
                          )}
                          {row.measure && (
                            <p className="flex gap-1.5 text-slate-600 dark:text-slate-300">
                              <span className="shrink-0 font-semibold text-emerald-600 dark:text-emerald-400">대책</span>
                              {row.measure}
                            </p>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-center align-top">
                      <Pill tone={mark.tone}>{mark.label}</Pill>
                    </td>
                  </tr>
                )
              })}
              {visible.length === 0 && <tr><td colSpan={4} className="px-4 py-14 text-center text-muted-foreground">표시할 항목이 없습니다.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}

function EditPanel({
  assessment,
  row,
  index,
  editable,
  onChange,
  onClose,
  onDuplicate,
  onDelete,
}: {
  assessment: RiskAssessment
  row: RiskRow
  index: number
  editable: boolean
  onChange: (partial: Partial<RiskRow>) => void
  onClose: () => void
  onDuplicate: () => void
  onDelete: () => void
}) {
  const score = riskScore(row)
  const after = riskScore(row, true)
  const grade = score ? gradeOf(assessment.matrix, score) : null
  const afterGrade = after ? gradeOf(assessment.matrix, after) : null
  const decision = decisionOf(assessment, row)
  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
    <DialogContent showCloseButton={false} overlayClassName="z-[70]" className="z-[70] flex max-h-[90vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl">
      <DialogDescription className="sr-only">평가 항목을 고치면 자동으로 저장됩니다.</DialogDescription>
      <header className="flex shrink-0 flex-wrap items-center gap-2.5 border-b border-amber-200/70 bg-amber-50/60 px-4 py-3 dark:border-amber-500/20 dark:bg-amber-500/10">
        <span className="grid size-7 place-items-center rounded-lg bg-amber-500 text-xs font-bold tabular-nums text-white">{index + 1}</span>
        <DialogTitle className="text-[15px] font-bold tracking-tight">{row.process || '새 항목'}</DialogTitle>
        {decision ? <Pill tone={decisionTone(decision)}>{decision}</Pill> : null}
        <span className="ml-auto flex items-center gap-1">
          {editable && (
            <>
              <Button type="button" size="sm" variant="ghost" className="h-8" onClick={onDuplicate}>
                <Copy className="size-3.5" />
                복제
              </Button>
              <Button type="button" size="sm" variant="ghost" className="h-8 text-muted-foreground hover:text-destructive" onClick={onDelete}>
                <Trash2 className="size-3.5" />
                삭제
              </Button>
            </>
          )}
          <Button type="button" size="sm" variant="ghost" className="h-8" onClick={onClose}>
            <X className="size-4" />
            닫기
          </Button>
        </span>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="grid gap-4 p-4 md:grid-cols-2">
        <label className={LABEL}>공정<input className={FIELD} list="risk-processes" disabled={!editable} value={row.process} onChange={(event) => onChange({ process: event.target.value })} /></label>
        <label className={LABEL}>위험분류
          <select className={FIELD} disabled={!editable} value={row.cat} onChange={(event) => onChange({ cat: event.target.value })}>
            <option value="">선택</option>
            {KRAS.map((group) => (
              <optgroup key={group[0]} label={`${group[0]}. ${group[1]}`}>
                {group[2].map((item) => <option key={item[0]} value={item[0]}>{item[0]} {item[1]}</option>)}
              </optgroup>
            ))}
          </select>
        </label>
        <label className={cn(LABEL, 'md:col-span-2')}>{assessment.method === 'CL' ? '점검항목' : '유해·위험요인'}
          <textarea className={AREA} rows={2} disabled={!editable} value={row.hazard} onChange={(event) => onChange({ hazard: event.target.value })} />
        </label>
        <label className={LABEL}>현재 조치<textarea className={AREA} rows={2} disabled={!editable} value={row.current} onChange={(event) => onChange({ current: event.target.value })} /></label>
        <label className={LABEL}>{assessment.method === 'CL' ? '개선사항' : '감소대책'}<textarea className={AREA} rows={2} disabled={!editable} value={row.measure} onChange={(event) => onChange({ measure: event.target.value })} /></label>
      </div>
      <div className="flex flex-wrap items-end gap-4 border-t border-border bg-muted/20 px-4 py-3.5">
        {assessment.method === 'CL' && <JudgePills value={row.judge} disabled={!editable} onChange={(judge) => onChange({ judge })} />}
        {assessment.method === 'L3' && (
          <>
            <LevelPills label="수준" value={row.level} disabled={!editable} onChange={(level) => onChange({ level })} />
            <LevelPills label="개선 후" value={row.level2} disabled={!editable} onChange={(level2) => onChange({ level2 })} />
          </>
        )}
        {assessment.method === 'FS' && (
          <>
            <ScoreSelect kind="p" matrix={assessment.matrix} disabled={!editable} value={row.p} onChange={(value) => onChange({ p: value })} />
            <ScoreSelect kind="s" matrix={assessment.matrix} disabled={!editable} value={row.s} onChange={(value) => onChange({ s: value })} />
            {grade && <ScoreBadge label="위험성" score={score} grade={grade} />}
            <ScoreSelect kind="p" matrix={assessment.matrix} disabled={!editable} value={row.p2} onChange={(value) => onChange({ p2: value })} />
            <ScoreSelect kind="s" matrix={assessment.matrix} disabled={!editable} value={row.s2} onChange={(value) => onChange({ s2: value })} />
            {afterGrade && <ScoreBadge label="개선 후" score={after} grade={afterGrade} />}
          </>
        )}
        <label className={cn(LABEL, 'min-w-40 flex-1')}>법령<input className={FIELD} disabled={!editable} value={row.law} onChange={(event) => onChange({ law: event.target.value })} /></label>
        <label className={cn(LABEL, 'w-28')}>담당<input className={FIELD} disabled={!editable} value={row.owner} onChange={(event) => onChange({ owner: event.target.value })} /></label>
        <label className={cn(LABEL, 'w-40')}>예정일<input className={FIELD} type="date" disabled={!editable} value={row.due} onChange={(event) => onChange({ due: event.target.value })} /></label>
        <label className="flex h-9 cursor-pointer items-center gap-2 rounded-lg border border-input bg-background px-3 text-sm font-semibold">
          <input type="checkbox" className="size-4 accent-emerald-600" disabled={!editable} checked={row.done} onChange={(event) => onChange({ done: event.target.checked, doneDate: event.target.checked ? (row.doneDate || today()) : '' })} />
          완료
        </label>
      </div>
      </div>
    </DialogContent>
    </Dialog>
  )
}

function ScoreBadge({ label, score, grade }: { label: string; score: number; grade: { g: string; c: string } }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-semibold text-slate-600 dark:text-muted-foreground">{label}</span>
      <span className="inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-bold text-white" style={{ background: grade.c }}>
        <span className="tabular-nums">{score}</span>
        <span className="text-xs font-semibold opacity-90">{grade.g}</span>
      </span>
    </div>
  )
}

function verdict(assessment: RiskAssessment, row: RiskRow): { label: string; tone: Tone } {
  if (assessment.method === 'CL') {
    if (row.judge === '×') return { label: '부적정', tone: 'red' }
    if (row.judge === '○') return { label: '적정', tone: 'emerald' }
    if (row.judge === 'N/A') return { label: '해당없음', tone: 'slate' }
    return { label: '미판정', tone: 'slate' }
  }
  if (assessment.method === 'L3') {
    if (row.level === '상') return { label: '상', tone: 'red' }
    if (row.level === '중') return { label: '중', tone: 'amber' }
    if (row.level === '하') return { label: '하', tone: 'emerald' }
    return { label: '미판정', tone: 'slate' }
  }
  const score = riskScore(row)
  const grade = score ? gradeOf(assessment.matrix, score) : null
  if (!grade) return { label: '미산정', tone: 'slate' }
  return { label: `${score} ${grade.g}`, tone: isMandatory(assessment, row) ? 'red' : 'emerald' }
}

function JudgePills({ value, disabled, onChange }: { value: RiskRow['judge']; disabled: boolean; onChange: (value: RiskRow['judge']) => void }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-semibold text-slate-600 dark:text-muted-foreground">판정</span>
      <Segmented
        value={value}
        disabled={disabled}
        onChange={onChange}
        options={[
          { value: '○', label: '○ 적정', activeClass: 'bg-emerald-600 text-white shadow-sm' },
          { value: '×', label: '× 부적정', activeClass: 'bg-red-600 text-white shadow-sm' },
          { value: 'N/A', label: '해당없음', activeClass: 'bg-slate-600 text-white shadow-sm' },
        ]}
      />
    </div>
  )
}

function LevelPills({ label, value, disabled, onChange }: { label: string; value: RiskLevel; disabled: boolean; onChange: (value: RiskLevel) => void }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-semibold text-slate-600 dark:text-muted-foreground">{label}</span>
      <Segmented
        value={value}
        disabled={disabled}
        onChange={onChange}
        options={[
          { value: '상', label: '상', activeClass: 'bg-red-600 text-white shadow-sm' },
          { value: '중', label: '중', activeClass: 'bg-amber-500 text-white shadow-sm' },
          { value: '하', label: '하', activeClass: 'bg-emerald-600 text-white shadow-sm' },
        ]}
      />
    </div>
  )
}

function ScoreSelect({
  kind,
  matrix,
  value,
  disabled,
  onChange,
}: {
  kind: 'p' | 's'
  matrix: RiskAssessment['matrix']
  value: number | ''
  disabled: boolean
  onChange: (value: number | '') => void
}) {
  const spec = matrixOf(matrix)
  const labels = kind === 'p' ? spec.pL : spec.sL
  const count = kind === 'p' ? spec.pN : spec.sN
  return (
    <label className={LABEL}>
      {kind === 'p' ? '가능성' : '중대성'}
      <select className={cn(FIELD, 'w-28')} disabled={disabled} value={value === '' ? '' : String(value)} onChange={(event) => onChange(event.target.value ? Number(event.target.value) : '')}>
        <option value="" />
        {Array.from({ length: count }, (_, index) => (
          <option key={index + 1} value={index + 1}>{index + 1} {labels[index]?.[0]}</option>
        ))}
      </select>
    </label>
  )
}
