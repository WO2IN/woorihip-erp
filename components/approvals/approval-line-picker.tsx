'use client'

import { ArrowUp, Search, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { jobRank, type ApprovalCandidate, type ApprovalPerson } from '@/lib/approval'
import { cn } from '@/lib/utils'

export function ApprovalLinePicker({
  people,
  reviewers,
  finalPerson,
  showReview,
  reviewMissing,
  query,
  onQuery,
  onPick,
  onClear,
  loading,
  drafterName,
  drafterTitle,
}: {
  people: ApprovalPerson[]
  reviewers: ApprovalCandidate[]
  finalPerson: ApprovalPerson | null
  showReview: boolean
  reviewMissing: boolean
  query: string
  onQuery: (value: string) => void
  onPick: (id: string) => void
  onClear: () => void
  loading: boolean
  drafterName: string
  drafterTitle: string
}) {
  const reviewLine = [...reviewers].sort((a, b) => jobRank(b.jobTitle) - jobRank(a.jobTitle) || a.name.localeCompare(b.name, 'ko'))
  const keyword = query.trim()

  return (
    <div>
      <section className="rounded-2xl border border-sky-300 bg-white p-3 dark:border-sky-800 dark:bg-card">
        <StepHead index={showReview ? '02' : '01'} label="최종 결재" badge="최종" tone="sky" />
        {finalPerson ? (
          <PersonRow name={finalPerson.displayName} title={finalPerson.jobTitle} onRemove={onClear} />
        ) : (
          <p className="rounded-lg border border-dashed border-slate-300 px-3 py-3 text-center text-sm text-slate-400 dark:border-white/15">한 명을 고릅니다.</p>
        )}
        <div className="mt-3 rounded-xl bg-slate-50 p-2.5 dark:bg-white/[0.04]">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
            <Input value={query} onChange={(event) => onQuery(event.target.value)} placeholder="이름 또는 직급" className="h-10 bg-white pl-9 dark:bg-card" />
          </div>
          <div className="mt-2 max-h-52 overflow-y-auto">
            {people.length > 0 ? (
              <div className="overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-white/10 dark:bg-card">
                {people.map((person) => (
                  <button
                    key={person.id}
                    type="button"
                    onClick={() => onPick(person.id)}
                    className="flex w-full items-center gap-2 border-b border-slate-100 px-2.5 py-2 text-left last:border-b-0 hover:bg-sky-50 dark:border-white/10 dark:hover:bg-sky-950/40"
                  >
                    <Mark name={person.displayName} />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{person.displayName}</span>
                    <span className="shrink-0 text-xs text-slate-400">{person.jobTitle === '직급 없음' ? '—' : person.jobTitle}</span>
                  </button>
                ))}
              </div>
            ) : !loading ? (
              <p className="px-1 py-6 text-center text-sm text-slate-400">{keyword ? '찾는 사람이 없습니다.' : '나보다 높은 직급이 없습니다.'}</p>
            ) : null}
          </div>
        </div>
      </section>

      {showReview && (
        <>
          <Rise />
          <section className="rounded-2xl border border-slate-200 bg-white p-3 dark:border-white/10 dark:bg-card">
            <StepHead index="01" label="검토" tone="slate" />
            {reviewMissing ? (
              <p className="text-sm text-rose-600">같은 팀에 검토할 차장·부장이 없습니다.</p>
            ) : (
              <div className="space-y-1.5">
                {reviewLine.map((person) => (
                  <PersonRow key={person.userId} name={person.name} title={person.jobTitle} />
                ))}
              </div>
            )}
          </section>
        </>
      )}

      <Rise />
      <section className="rounded-2xl border border-slate-200 bg-white p-3 dark:border-white/10 dark:bg-card">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">기안</p>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500 dark:bg-white/10">작성</span>
        </div>
        <PersonRow name={drafterName || '—'} title={drafterTitle || '직급 없음'} />
      </section>
    </div>
  )
}

function Rise() {
  return (
    <div className="flex justify-center py-1.5 text-sky-500">
      <ArrowUp className="size-4" />
    </div>
  )
}

function StepHead({ index, label, badge, tone }: { index: string; label: string; badge?: string; tone: 'sky' | 'slate' }) {
  return (
    <div className="mb-2 flex items-center gap-2">
      <span className={cn('flex h-6 min-w-6 items-center justify-center rounded-full px-1.5 text-[11px] font-semibold text-white', tone === 'sky' ? 'bg-sky-600' : 'bg-slate-400')}>{index}</span>
      <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{label}</p>
      {badge && <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">{badge}</span>}
    </div>
  )
}

function PersonRow({ name, title, onRemove }: { name: string; title: string; onRemove?: () => void }) {
  const shown = title === '직급 없음' ? '—' : title
  return (
    <div className="flex items-center gap-2 rounded-lg bg-slate-50 px-2.5 py-2 dark:bg-white/[0.04]">
      <Mark name={name} />
      <span className="min-w-0 flex-1 truncate text-sm">
        <span className="font-medium text-slate-900 dark:text-slate-100">{name}</span>
        <span className="ml-2 text-slate-400">{shown}</span>
      </span>
      {onRemove && (
        <button type="button" aria-label="빼기" onClick={onRemove} className="rounded-md p-1 text-slate-400 hover:text-rose-600">
          <X className="size-4" />
        </button>
      )}
    </div>
  )
}

function Mark({ name }: { name: string }) {
  return (
    <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-sky-100 text-xs font-semibold text-sky-800 dark:bg-sky-950 dark:text-sky-200">
      {name.trim().slice(0, 1) || '?'}
    </span>
  )
}
