'use client'

import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { ApprovalLinePicker } from '@/components/approvals/approval-line-picker'
import { useAuth } from '@/components/auth/auth-context'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { isHigherTitle, isTeamLeadTitle, jobRank, type ApprovalCandidate, type ApprovalPerson, type ApprovalTarget } from '@/lib/approval'
import { cn } from '@/lib/utils'

export function StampApprovalButton({
  target,
  title,
  body,
  disabled,
  hint,
  className,
  onSent,
}: {
  target: ApprovalTarget
  title: string
  body: string
  disabled?: boolean
  hint?: string
  className?: string
  onSent?: () => void
}) {
  const [open, setOpen] = useState(false)
  const [people, setPeople] = useState<ApprovalPerson[]>([])
  const [teamReviewers, setTeamReviewers] = useState<ApprovalCandidate[]>([])
  const [viewerTitle, setViewerTitle] = useState('')
  const [finalId, setFinalId] = useState('')
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [sending, setSending] = useState(false)
  const { user } = useAuth()

  async function show() {
    if (disabled) return
    setOpen(true)
    setLoading(true)
    try {
      const response = await fetch('/api/approvals', { cache: 'no-store' })
      const data = await response.json().catch(() => null)
      if (!response.ok) {
        toast.error(data?.error ?? '결재자를 불러오지 못했습니다.')
        return
      }
      setPeople(Array.isArray(data.people) ? data.people : [])
      setTeamReviewers(Array.isArray(data.teamReviewers) ? data.teamReviewers : [])
      setViewerTitle(typeof data.viewerJobTitle === 'string' ? data.viewerJobTitle : '')
    } finally {
      setLoading(false)
    }
  }

  function close(next: boolean) {
    setOpen(next)
    if (!next) {
      setFinalId('')
      setQuery('')
    }
  }

  const finalPerson = people.find((person) => person.id === finalId) ?? null
  const selfReview = isTeamLeadTitle(viewerTitle)
  const directFinal = !!finalPerson && isTeamLeadTitle(finalPerson.jobTitle)
  const reviewMissing = !!finalPerson && !selfReview && !directFinal && teamReviewers.length === 0
  const shownReviewers = selfReview
    ? [{ userId: user?.id ?? 'self', name: user?.displayName || '본인', jobTitle: viewerTitle }]
    : teamReviewers
  const keyword = query.trim().toLowerCase()
  const higher = useMemo(() => people.filter((person) => {
    if (person.id === finalId || !isHigherTitle(person.jobTitle, viewerTitle)) return false
    if (!keyword) return true
    return `${person.displayName} ${person.jobTitle}`.toLowerCase().includes(keyword)
  }).sort((a, b) => jobRank(b.jobTitle) - jobRank(a.jobTitle) || a.displayName.localeCompare(b.displayName, 'ko')), [finalId, keyword, people, viewerTitle])

  async function submit() {
    if (!finalId) {
      toast.error('최종 결재자를 골라 주세요.')
      return
    }
    if (reviewMissing) {
      toast.error('같은 팀에 검토할 차장·부장이 없습니다.')
      return
    }
    setSending(true)
    try {
      const response = await fetch('/api/approvals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, body, finalApproverId: finalId, target }),
      })
      const data = await response.json().catch(() => null)
      if (!response.ok) {
        toast.error(data?.error ?? '결재를 올리지 못했습니다.')
        return
      }
      toast.success(data?.data?.docNo ? `결재 요청을 보냈습니다. 문서번호 ${data.data.docNo}` : '결재 요청을 보냈습니다. 차례가 되면 결재 현황에서 서명합니다.')
      onSent?.()
      close(false)
    } finally {
      setSending(false)
    }
  }

  return (
    <>
      <button
        type="button"
        disabled={disabled}
        title={disabled ? hint : '결재 요청'}
        onClick={() => void show()}
        className={cn(
          'whitespace-nowrap text-[10px] font-semibold text-sky-700 hover:underline disabled:cursor-not-allowed disabled:text-slate-300 disabled:no-underline dark:text-sky-300 dark:disabled:text-slate-600',
          className,
        )}
      >
        결재 요청
      </button>
      <Dialog open={open} onOpenChange={close}>
        <DialogContent overlayClassName="!z-[70]" className="!z-[80] gap-0 p-0 sm:max-w-xl">
          <div className="flex max-h-[min(720px,calc(100vh-4rem))] flex-col">
            <div className="px-6 pt-6 pr-12 pb-4">
              <DialogHeader>
                <DialogTitle className="text-xl tracking-tight">결재 요청</DialogTitle>
                <DialogDescription className="mt-1 text-sm text-slate-500">{title}</DialogDescription>
              </DialogHeader>
              <p className="mt-3 text-sm leading-6 text-slate-700 dark:text-slate-200">{body}</p>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto border-t border-slate-100 px-6 py-4 dark:border-white/10">
              <ApprovalLinePicker
                people={higher}
                reviewers={shownReviewers}
                finalPerson={finalPerson}
                showReview={selfReview || (!directFinal && (teamReviewers.length > 0 || reviewMissing))}
                reviewMissing={reviewMissing}
                reviewNote={selfReview ? '올리는 순간 검토도 본인 서명으로 들어가고, 최종 결재만 받습니다.' : undefined}
                query={query}
                onQuery={setQuery}
                onPick={setFinalId}
                onClear={() => setFinalId('')}
                loading={loading}
                drafterName={user?.displayName ?? ''}
                drafterTitle={viewerTitle}
              />
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-100 px-6 py-4 dark:border-white/10">
              <Button type="button" variant="ghost" onClick={() => close(false)}>취소</Button>
              <Button type="button" disabled={sending} onClick={() => void submit()}>{sending ? '올리는 중…' : '올리기'}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
