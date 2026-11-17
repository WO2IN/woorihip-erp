'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Archive, CalendarDays, Inbox, ScrollText, Send, type LucideIcon } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/components/auth/auth-context'
import { ApprovalDraftForm } from '@/components/approvals/approval-draft-form'
import { LeaveSheet } from '@/components/approvals/leave-sheet'
import { ProposalSheet, type ProposalStamp } from '@/components/approvals/proposal-sheet'
import { PAGE_SHELL } from '@/components/shared/page-header'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Textarea } from '@/components/ui/textarea'
import { approvalDocNoOf, approvalDraftLabel, approvalStepRole, approvalTargetLabel, formatFileSize, markApprovalRead, pendingFor, stepIncludes, unseenApproval, type ApprovalCandidate, type ApprovalPerson, type ApprovalRequest, type ApprovalStatus, type ApprovalStep } from '@/lib/approval'
import { cn } from '@/lib/utils'

type Section = 'proposal' | 'leave' | 'inbox' | 'sent' | 'done'

function isSection(value: string | null): value is Section {
  return value === 'proposal' || value === 'leave' || value === 'inbox' || value === 'sent' || value === 'done'
}

const STATUS_LABEL: Record<ApprovalStatus, string> = {
  pending: '진행 중',
  approved: '승인',
  rejected: '반려',
  cancelled: '취소',
}

function proposalStamps(item: ApprovalRequest): ProposalStamp[] {
  const review = item.steps.find((step) => step.role === 'review')
  const approval = [...item.steps].reverse().find((step) => step.role === 'approval')
  const writerSigned = item.steps.some((step) => step.userId === item.requesterId && step.status === 'approved')
  const signatureUrl = (userId: string) => `/api/approvals/${item.id}/signature?userId=${encodeURIComponent(userId)}`
  const cell = (label: ProposalStamp['label'], step?: ApprovalRequest['steps'][number]): ProposalStamp => {
    const signed = step?.status === 'approved'
    return {
      label,
      name: signed ? step.name : '',
      title: signed && step.jobTitle !== '직급 없음' ? step.jobTitle : '',
      imageUrl: signed && step.userId ? signatureUrl(step.userId) : undefined,
    }
  }
  const showWriterSignature =
    Boolean(item.requesterId)
    && (writerSigned || !item.steps.some((step) => step.userId === item.requesterId))
  return [
    {
      label: '작성',
      name: item.requesterName,
      title: '',
      imageUrl: showWriterSignature ? signatureUrl(item.requesterId) : undefined,
    },
    cell('검토', review),
    cell('승인', approval),
  ]
}

function documentDate(item: ApprovalRequest) {
  if (item.draft?.draftedOn) return item.draft.draftedOn.replaceAll('-', '.')
  const date = new Date(item.createdAt)
  if (Number.isNaN(date.getTime())) return ''
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}.${pad(date.getMonth() + 1)}.${pad(date.getDate())}`
}

function formatWhen(iso: string) {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getMonth() + 1}.${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function statusClass(status: ApprovalStatus) {
  if (status === 'approved') return 'text-emerald-700 dark:text-emerald-300'
  if (status === 'rejected') return 'text-rose-600 dark:text-rose-300'
  if (status === 'cancelled') return 'text-slate-500 dark:text-slate-300'
  return 'text-sky-700 dark:text-sky-300'
}

function statusPill(status: ApprovalStatus, turn: boolean) {
  if (turn) return 'bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-200 dark:ring-amber-500/30'
  if (status === 'approved') return 'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-200 dark:ring-emerald-500/30'
  if (status === 'rejected') return 'bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-950/40 dark:text-rose-200 dark:ring-rose-500/30'
  if (status === 'cancelled') return 'bg-slate-100 text-slate-500 ring-slate-200 dark:bg-white/10 dark:text-slate-300 dark:ring-white/10'
  return 'bg-sky-50 text-sky-700 ring-sky-200 dark:bg-sky-950/40 dark:text-sky-200 dark:ring-sky-500/30'
}

function stepLabel(step: ApprovalStep) {
  if (step.status === 'approved') return formatWhen(step.signedAt ?? '')
  if (step.status === 'rejected') return '반려'
  if (step.status === 'cancelled') return '취소'
  if (step.status === 'pending') return step.role === 'review' ? '검토 차례' : '서명 차례'
  return '대기'
}

function finishedAt(item: ApprovalRequest) {
  if (item.cancelledAt) return item.cancelledAt
  let latest = ''
  for (const step of item.steps) {
    if (step.signedAt && step.signedAt > latest) latest = step.signedAt
  }
  return latest || item.createdAt
}

function initial(name: string) {
  return name.trim().slice(0, 1) || '?'
}

export function ApprovalsView() {
  const { user } = useAuth()
  const router = useRouter()
  const searchParams = useSearchParams()
  const sectionParam = searchParams.get('section')
  const section: Section = sectionParam === 'paper' ? 'leave' : (isSection(sectionParam) ? sectionParam : 'inbox')
  const [items, setItems] = useState<ApprovalRequest[]>([])
  const [people, setPeople] = useState<ApprovalPerson[]>([])
  const [teamReviewers, setTeamReviewers] = useState<ApprovalCandidate[]>([])
  const [viewerTitle, setViewerTitle] = useState('')
  const [nextDocNo, setNextDocNo] = useState('')
  const [viewerDepartment, setViewerDepartment] = useState('')
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState('')
  const [reason, setReason] = useState('')
  const [rejecting, setRejecting] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [acting, setActing] = useState(false)

  const load = useCallback(async () => {
    const response = await fetch('/api/approvals', { cache: 'no-store' })
    const data = await response.json().catch(() => null)
    if (!response.ok) {
      toast.error(data?.error ?? '결재를 불러오지 못했습니다.')
      return
    }
    setItems(Array.isArray(data.data) ? data.data : [])
    setPeople(Array.isArray(data.people) ? data.people : [])
    setTeamReviewers(Array.isArray(data.teamReviewers) ? data.teamReviewers : [])
    setViewerTitle(typeof data.viewerJobTitle === 'string' ? data.viewerJobTitle : '')
    setNextDocNo(typeof data.nextDocNo === 'string' ? data.nextDocNo : '')
    setViewerDepartment(typeof data.viewerDepartment === 'string' ? data.viewerDepartment : '')
  }, [])

  useEffect(() => {
    let cancelled = false
    void load().finally(() => {
      if (!cancelled) setLoading(false)
    })
    return () => { cancelled = true }
  }, [load])

  const inbox = useMemo(
    () => items.filter((item) => item.status === 'pending' && item.steps.some((step) => (step.status === 'pending' || step.status === 'approved') && stepIncludes(step, user?.id ?? ''))),
    [items, user?.id],
  )
  const sent = useMemo(
    () => items.filter((item) => item.status === 'pending' && item.requesterId === user?.id),
    [items, user?.id],
  )
  const done = useMemo(
    () => items.filter((item) => item.status !== 'pending').sort((a, b) => finishedAt(b).localeCompare(finishedAt(a))),
    [items],
  )
  const listed = section === 'sent' ? sent : section === 'done' ? done : inbox
  const selected = items.find((item) => item.id === selectedId) ?? null
  const myTurn = selected ? pendingFor(selected, user?.id ?? '') : false
  const canCancel = selected?.status === 'pending' && selected.requesterId === user?.id
  const cancelHasSignedSteps = useMemo(
    () => selected?.steps.some((step) => step.status === 'approved') ?? false,
    [selected],
  )
  const formSection = section === 'proposal' || section === 'leave'

  function openSection(next: Section) {
    setSelectedId('')
    setReason('')
    setRejecting(false)
    setCancelling(false)
    router.replace(next === 'inbox' ? '/approvals' : `/approvals?section=${next}`, { scroll: false })
  }

  const forms: { id: Section; label: string; nav: string; icon: LucideIcon }[] = [
    { id: 'proposal', label: '기안품의서', nav: '부서 · 제목 · 품의', icon: ScrollText },
    { id: 'leave', label: '휴가신청서', nav: '구분 · 기간 · 사유', icon: CalendarDays },
  ]
  const statuses: { id: Section; label: string; count: string; unread: number }[] = [
    { id: 'inbox', label: '받은 결재', count: `${inbox.length}`, unread: user ? inbox.filter((item) => unseenApproval(item, user.id, 'inbox')).length : 0 },
    { id: 'sent', label: '올린 결재', count: `${sent.length}`, unread: user ? sent.filter((item) => unseenApproval(item, user.id, 'sent')).length : 0 },
    { id: 'done', label: '완료', count: `${done.length}`, unread: user ? done.filter((item) => unseenApproval(item, user.id, 'done')).length : 0 },
  ]

  function openItem(id: string) {
    setSelectedId(id)
    setReason('')
    setRejecting(false)
    if (!user) return
    setItems((current) => current.map((item) => item.id === id ? markApprovalRead(item, user.id) : item))
    void fetch(`/api/approvals/${id}/seen`, { method: 'POST' }).catch(() => undefined)
  }

  async function act(id: string, kind: 'sign' | 'reject' | 'cancel') {
    setActing(true)
    try {
      const response = await fetch(`/api/approvals/${id}/${kind}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: kind === 'reject' ? JSON.stringify({ reason }) : undefined,
      })
      const data = await response.json().catch(() => null)
      if (!response.ok) {
        toast.error(data?.error ?? (kind === 'sign' ? '서명하지 못했습니다.' : kind === 'cancel' ? '취소하지 못했습니다.' : '반려하지 못했습니다.'))
        return
      }
      toast.success(kind === 'sign' ? '서명했습니다.' : kind === 'cancel' ? '결재 요청을 철회했습니다.' : '반려했습니다.')
      setReason('')
      setRejecting(false)
      setCancelling(false)
      await load()
    } catch {
      toast.error('요청을 보내지 못했습니다.')
    } finally {
      setActing(false)
    }
  }

  return (
    <div className={cn(PAGE_SHELL, formSection ? 'min-h-0' : 'min-h-full')}>
      <div className="approvals-page-chrome">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-950 dark:text-white">결재 현황</h1>
        <p className="mt-1 text-sm text-slate-500">양식을 골라 결재를 요청하고, 진행과 완료를 나눠 확인합니다.</p>
        <div role="tablist" aria-label="결재 현황" className="mt-4 flex gap-1 border-b border-slate-200 dark:border-white/10">
          {statuses.map((item) => {
            const picked = section === item.id
            return (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={picked}
                onClick={() => openSection(item.id)}
                className={cn(
                  '-mb-px border-b-2 px-4 py-2.5 text-sm font-medium transition-colors',
                  picked
                    ? 'border-slate-900 text-slate-950 dark:border-white dark:text-white'
                    : 'border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100',
                )}
              >
                {item.label}
                <span className={cn('ml-2 text-xs tabular-nums', picked ? 'text-slate-500 dark:text-slate-300' : 'text-slate-400')}>{item.count}</span>
                {item.unread > 0 && (
                  <span className="ml-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] font-bold text-white">
                    {item.unread > 99 ? '99+' : item.unread}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[18.5rem_minmax(0,1fr)]">
        <nav
          aria-label="결재 메뉴"
          className="flex flex-col gap-5 self-start rounded-2xl border border-slate-200/80 bg-card p-3 shadow-[0_1px_2px_rgba(15,23,42,0.04)] lg:sticky lg:top-4 dark:border-white/10"
        >
          <div>
            <p className="px-2.5 pt-1 pb-2 text-[11px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">양식</p>
            <div className="space-y-1.5">
              {forms.map((item) => {
                const picked = section === item.id
                const Icon = item.icon
                return (
                  <button
                    key={item.id}
                    type="button"
                    aria-current={picked ? 'page' : undefined}
                    onClick={() => openSection(item.id)}
                    className={cn(
                      'group flex w-full items-center gap-3 rounded-xl px-2.5 py-2.5 text-left transition-all',
                      picked
                        ? 'bg-gradient-to-r from-slate-800 to-slate-700 text-white shadow-sm'
                        : 'text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-white/5',
                    )}
                  >
                    <span className={cn('flex size-9 shrink-0 items-center justify-center rounded-lg', picked ? 'bg-white/15' : 'bg-slate-100 text-slate-500 group-hover:bg-slate-200 dark:bg-white/5')}>
                      <Icon className="size-4" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold">{item.label}</span>
                      <span className={cn('mt-0.5 block truncate text-[11px]', picked ? 'text-white/75' : 'text-muted-foreground')}>{item.nav}</span>
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        </nav>

        <div className="min-w-0">
          {formSection ? (
            <ApprovalDraftForm
              key={section}
              kind={section === 'leave' ? 'leave' : 'proposal'}
              people={people}
              teamReviewers={teamReviewers}
              viewerTitle={viewerTitle}
              docNo={nextDocNo}
              department={viewerDepartment}
              loading={loading}
              onSubmitted={async () => {
                await load()
                openSection('sent')
              }}
            />
          ) : (
      <section className={cn('overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-card', listed.length === 0 && 'flex min-h-[32rem] flex-1 flex-col')}>
        {listed.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center px-6 py-20 text-center">
            <span className="flex size-14 items-center justify-center rounded-full bg-slate-100 text-slate-400 dark:bg-white/10">
              {section === 'inbox' ? <Inbox className="size-6" /> : section === 'sent' ? <Send className="size-6" /> : <Archive className="size-6" />}
            </span>
            <p className="mt-4 text-base font-medium text-slate-800 dark:text-slate-100">{loading ? '불러오는 중입니다.' : section === 'inbox' ? '진행 중인 받은 결재가 없습니다.' : section === 'sent' ? '진행 중인 올린 결재가 없습니다.' : '끝난 결재가 없습니다.'}</p>
            <p className="mt-1 text-sm text-slate-400">{section === 'inbox' ? '서명할 차례가 되면 여기에 나타납니다.' : section === 'sent' ? '왼쪽 양식에서 결재를 요청하면 여기에 남습니다.' : '승인, 반려, 취소된 결재가 여기에 남습니다.'}</p>
          </div>
        ) : (
          <ul className="space-y-2 bg-slate-50/80 p-3 dark:bg-white/[0.02]">
            {listed.map((item) => {
              const turn = pendingFor(item, user?.id ?? '')
              const fresh = user ? unseenApproval(item, user.id, section === 'sent' ? 'sent' : section === 'done' ? 'done' : 'inbox') : false
              const current = item.steps.find((step) => step.status === 'pending')
              const docNo = approvalDocNoOf(item)
              const who = section === 'sent' ? (current?.name ?? item.requesterName) : item.requesterName
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => openItem(item.id)}
                    className="flex w-full items-center gap-3 rounded-xl border border-slate-200/80 bg-white px-3.5 py-3 text-left shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition hover:border-slate-300 hover:shadow-sm dark:border-white/10 dark:bg-card dark:hover:border-white/20"
                  >
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-sm font-semibold text-slate-600 dark:bg-white/10 dark:text-slate-200">
                      {initial(who)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        {fresh && <span className="size-1.5 shrink-0 rounded-full bg-rose-600" />}
                        <span className="truncate text-sm font-semibold text-slate-950 dark:text-white">{item.title}</span>
                      </span>
                      <span className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[11px] text-slate-500">
                        {docNo ? <span className="rounded-md bg-slate-100 px-1.5 py-0.5 font-medium text-slate-600 dark:bg-white/10 dark:text-slate-300">{docNo}</span> : null}
                        {item.draft ? <span>{approvalDraftLabel(item.draft)}</span> : null}
                        <span>{item.requesterName}</span>
                        <span className="text-slate-300 dark:text-slate-600">·</span>
                        <span>{formatWhen(section === 'done' ? finishedAt(item) : item.createdAt)}</span>
                        {item.files?.length ? <span>첨부 {item.files.length}</span> : null}
                        {item.target ? <span>{approvalTargetLabel(item.target)}</span> : null}
                        {item.status === 'pending' && current ? <span>{current.name} 대기</span> : null}
                      </span>
                    </span>
                    <span className={cn('shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset', statusPill(item.status, turn))}>
                      {turn ? '내 차례' : STATUS_LABEL[item.status]}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </section>
          )}
        </div>
      </div>

      <Dialog open={selected != null} onOpenChange={(open) => { if (!open) { setSelectedId(''); setReason(''); setRejecting(false); setCancelling(false) } }}>
        <DialogContent className="gap-0 overflow-hidden bg-slate-100 p-0 sm:max-w-4xl dark:bg-slate-900">
          {selected && (
            <div className="flex max-h-[min(880px,calc(100vh-3rem))] flex-col">
              <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-8">
                <article className="overflow-hidden rounded-sm border border-slate-300 bg-white shadow-md dark:border-white/15 dark:bg-card">
                  {selected.draft?.kind === 'proposal' ? (
                    <div className="p-3">
                      <DialogTitle className="sr-only">{selected.title || '기안품의서'}</DialogTitle>
                      <DialogDescription className="sr-only">{myTurn ? '내 차례' : STATUS_LABEL[selected.status]}</DialogDescription>
                      <ProposalSheet
                        formType={selected.draft.formType ?? '품의'}
                        docNo={approvalDocNoOf(selected)}
                        draftedOn={selected.draft.draftedOn}
                        retention={selected.draft.retention || '1년'}
                        department={selected.draft.department}
                        drafterName={selected.draft.drafterName || selected.requesterName}
                        agreement={selected.draft.agreement ?? ''}
                        opinion={selected.draft.opinion ?? ''}
                        receiver={selected.draft.receiver ?? ''}
                        reference={selected.draft.reference ?? ''}
                        title={selected.title}
                        body={selected.body}
                        destination={selected.draft.destination ?? ''}
                        stamps={proposalStamps(selected)}
                      />
                      {selected.status === 'rejected' && selected.rejectReason ? (
                        <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-950/30 dark:text-rose-300">반려 사유 · {selected.rejectReason}</p>
                      ) : null}
                    </div>
                  ) : selected.draft?.kind === 'leave' ? (
                    <div className="p-3">
                      <DialogTitle className="sr-only">{selected.title || '휴가신청서'}</DialogTitle>
                      <DialogDescription className="sr-only">{myTurn ? '내 차례' : STATUS_LABEL[selected.status]}</DialogDescription>
                      <LeaveSheet
                        draftedOn={selected.draft.draftedOn}
                        department={selected.draft.department}
                        jobTitle={selected.draft.jobTitle}
                        applicantName={selected.draft.applicantName}
                        emergencyContact={selected.draft.emergencyContact}
                        leaveType={selected.draft.leaveType}
                        startDate={selected.draft.startDate}
                        endDate={selected.draft.endDate}
                        detail={selected.draft.detail}
                        stamps={proposalStamps(selected)}
                      />
                      {selected.status === 'rejected' && selected.rejectReason ? (
                        <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-950/30 dark:text-rose-300">반려 사유 · {selected.rejectReason}</p>
                      ) : null}
                    </div>
                  ) : (
                  <>
                  <header className="grid items-start gap-4 border-b border-slate-200 px-5 py-4 sm:grid-cols-[1fr_auto_1fr] dark:border-white/10">
                    <div className="hidden sm:block" />
                    <div className="pt-3 text-center sm:pt-6">
                      <p className="text-[11px] tracking-[0.32em] text-slate-400">WOORI-HIP</p>
                      <DialogTitle className="mt-2 text-[1.7rem] font-black tracking-[0.28em] text-slate-950 dark:text-white">{selected.draft ? approvalDraftLabel(selected.draft) : '결재'}</DialogTitle>
                      <DialogDescription className="mt-2 text-xs font-medium">
                        <span className={cn(myTurn ? 'text-amber-700 dark:text-amber-300' : statusClass(selected.status))}>{myTurn ? '내 차례' : STATUS_LABEL[selected.status]}</span>
                      </DialogDescription>
                    </div>
                    <div className="flex justify-end">
                      <div className="flex border border-slate-300 dark:border-white/15">
                        {selected.steps.filter((step) => step.role === 'review' || step.role === 'approval').map((step, index, line) => (
                          <div key={`${step.role ?? 'step'}-${index}`} title={step.candidates?.map((person) => `${person.name} ${person.jobTitle}`).join(', ') || undefined} className="flex w-[5.5rem] flex-col border-r border-slate-300 last:border-r-0 dark:border-white/15">
                            <p className="border-b border-slate-300 bg-slate-50 py-1 text-center text-[11px] font-medium text-slate-500 dark:border-white/15 dark:bg-white/5">{approvalStepRole(index, line.length, step.role)}</p>
                            <div className="flex h-14 items-center justify-center overflow-hidden px-1.5">
                              {step.status === 'approved' ? (
                                <img src={`/api/approvals/${selected.id}/signature?userId=${encodeURIComponent(step.userId)}`} alt={`${step.name} 서명`} className="max-h-11 max-w-full object-contain" />
                              ) : (
                                <span className="text-[11px] text-slate-300">{stepLabel(step)}</span>
                              )}
                            </div>
                            <div className="border-t border-slate-300 px-1 py-1 text-center dark:border-white/15">
                              <p className="truncate text-xs font-medium text-slate-800 dark:text-slate-100">{step.status === 'approved' ? step.name : ''}</p>
                              <p className="truncate text-[11px] text-slate-400">{step.status === 'approved' && step.jobTitle !== '직급 없음' ? step.jobTitle : '—'}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </header>
                  <div className="grid sm:grid-cols-2">
                    <DocCell label="문서번호" value={approvalDocNoOf(selected)} />
                    <DocCell label={selected.draft?.kind === 'paper' ? '작성일' : '기안일'} value={documentDate(selected)} />
                    {selected.draft?.kind === 'proposal' ? <DocCell label="기안 부서" value={selected.draft.department} /> : null}
                    <DocCell label={selected.draft?.kind === 'paper' ? '작성자' : '기안자'} value={selected.requesterName} />
                    <DocCell label="제목" value={selected.title} className="sm:col-span-2" />
                  </div>
                  <div className="min-h-56 border-t border-slate-200 px-6 py-5 dark:border-white/10">
                    <p className="text-sm leading-7 whitespace-pre-wrap text-slate-900 dark:text-slate-100">{selected.body}</p>
                    {selected.target ? <p className="mt-4 text-xs text-slate-400">{approvalTargetLabel(selected.target)}</p> : null}
                    {selected.status === 'rejected' && selected.rejectReason ? (
                      <p className="mt-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-950/30 dark:text-rose-300">반려 사유 · {selected.rejectReason}</p>
                    ) : null}
                  </div>
                  </>
                  )}
                  {selected.files && selected.files.length > 0 && (
                    <div className="border-t border-slate-200 dark:border-white/10">
                      <p className="border-b border-slate-200 bg-slate-50 px-6 py-2 text-xs font-semibold text-slate-500 dark:border-white/10 dark:bg-white/5">첨부</p>
                      <ul>
                        {selected.files.map((file) => (
                          <li key={file.id} className="border-b border-slate-100 last:border-b-0 dark:border-white/10">
                            <a
                              href={`/api/approvals/${selected.id}/files/${file.id}`}
                              className="flex items-center gap-2 px-6 py-2.5 text-sm text-sky-700 hover:bg-slate-50 dark:text-sky-300 dark:hover:bg-white/[0.04]"
                            >
                              <span className="min-w-0 flex-1 truncate">{file.name}</span>
                              <span className="shrink-0 text-xs text-slate-400">{formatFileSize(file.size)}</span>
                            </a>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </article>
              </div>
              {myTurn && (
                <div className="border-t border-slate-200 bg-white px-6 py-3 dark:border-white/10 dark:bg-card">
                  {rejecting && (
                    <Textarea value={reason} onChange={(event) => setReason(event.target.value)} placeholder="반려 사유" className="mb-3 min-h-20 resize-none" autoFocus />
                  )}
                  <div className="flex justify-end gap-2">
                    {rejecting ? (
                      <>
                        <Button type="button" variant="ghost" onClick={() => { setRejecting(false); setReason('') }}>닫기</Button>
                        <Button type="button" variant="outline" className="text-rose-600" disabled={acting || !reason.trim()} onClick={() => void act(selected.id, 'reject')}>반려하기</Button>
                      </>
                    ) : (
                      <>
                        <Button type="button" variant="outline" onClick={() => setRejecting(true)}>반려</Button>
                        <Button type="button" className="min-w-24" disabled={acting} onClick={() => void act(selected.id, 'sign')}>서명</Button>
                      </>
                    )}
                  </div>
                </div>
              )}
              {canCancel && (
                <div className="flex flex-col gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3 sm:flex-row sm:items-center sm:justify-between dark:border-white/10 dark:bg-white/[0.03]">
                  <p className="text-sm text-slate-600 dark:text-slate-300">올린 결재가 아직 진행 중입니다. 더 이상 결재를 받지 않으려면 요청을 철회하세요.</p>
                  <Button type="button" variant="outline" className="shrink-0" onClick={() => setCancelling(true)}>
                    요청 철회
                  </Button>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={cancelling} onOpenChange={(open) => { if (!open) setCancelling(false) }}>
        <AlertDialogContent className="sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>결재 요청을 철회할까요?</AlertDialogTitle>
            <AlertDialogDescription className="text-left">
              철회하면 남은 결재선은 더 이상 서명할 수 없습니다.
              {cancelHasSignedSteps ? ' 이미 서명한 기록은 문서에 그대로 보입니다.' : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={acting}>돌아가기</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              disabled={acting || !selected}
              onClick={() => { if (selected) void act(selected.id, 'cancel') }}
            >
              철회하기
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function DocCell({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className={cn('grid grid-cols-[5.5rem_minmax(0,1fr)] border-b border-slate-200 dark:border-white/10', className)}>
      <div className="flex items-center border-r border-slate-200 bg-slate-50 px-3 py-2.5 text-xs font-semibold text-slate-500 dark:border-white/10 dark:bg-white/5">{label}</div>
      <div className="flex items-center px-3 py-2.5 text-sm break-words text-slate-900 dark:text-white">{value || '—'}</div>
    </div>
  )
}
