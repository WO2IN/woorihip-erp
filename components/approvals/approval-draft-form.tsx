'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Paperclip, Printer, X } from 'lucide-react'
import { toast } from 'sonner'
import { ApprovalLinePicker } from '@/components/approvals/approval-line-picker'
import { useAuth } from '@/components/auth/auth-context'
import { Button } from '@/components/ui/button'
import { LeaveSheet } from '@/components/approvals/leave-sheet'
import { formatFileSize, isHigherTitle, isTeamLeadTitle, jobRank, seoulDayKey, type ApprovalCandidate, type ApprovalDraft, type ApprovalPerson, type LeaveType } from '@/lib/approval'
import { richTextIsEmpty, RICH_TEXT_HTML_MAX, RICH_TEXT_PLAIN_MAX, richTextPlain } from '@/lib/rich-text'
import { ProposalPrintPage } from '@/components/approvals/proposal-print-page'
import { ProposalSheet, storedProposalDocNo } from '@/components/approvals/proposal-sheet'
import { ACCEPT_ALL_FILES, fileKind } from '@/lib/file-types'

const FILE_LIMIT = 5
const FILE_BYTES = 8 * 1024 * 1024
const FILE_TOTAL = 20 * 1024 * 1024

export function ApprovalDraftForm({
  kind,
  people,
  teamReviewers = [],
  viewerTitle,
  docNo,
  department,
  loading,
  onSubmitted,
}: {
  kind: 'proposal' | 'leave'
  people: ApprovalPerson[]
  teamReviewers: ApprovalCandidate[]
  viewerTitle: string
  docNo: string
  department: string
  loading: boolean
  onSubmitted: () => Promise<void> | void
}) {
  const { user } = useAuth()
  const proposal = kind === 'proposal'
  const leave = kind === 'leave'
  const [draftedOn, setDraftedOn] = useState(() => {
    const key = seoulDayKey()
    return `${key.slice(0, 4)}-${key.slice(4, 6)}-${key.slice(6, 8)}`
  })
  const [retention, setRetention] = useState('1년')
  const [agreement, setAgreement] = useState('')
  const [opinion, setOpinion] = useState('')
  const [receiver, setReceiver] = useState('')
  const [reference, setReference] = useState('')
  const [destination, setDestination] = useState('')
  const [proposalDepartment, setProposalDepartment] = useState(department)
  const [drafterName, setDrafterName] = useState('')
  const [docNoText, setDocNoText] = useState('')
  const [docNoDirty, setDocNoDirty] = useState(false)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [leaveDepartment, setLeaveDepartment] = useState(department)
  const [jobTitle, setJobTitle] = useState(viewerTitle)
  const [applicantName, setApplicantName] = useState('')
  const [emergencyContact, setEmergencyContact] = useState('')
  const [leaveType, setLeaveType] = useState<LeaveType | ''>('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [detail, setDetail] = useState('')
  const [finalId, setFinalId] = useState('')
  const [query, setQuery] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [sending, setSending] = useState(false)
  const attachRef = useRef<HTMLInputElement>(null)
  const printRootRef = useRef<HTMLDivElement>(null)
  const [printing, setPrinting] = useState(false)
  const [portalReady, setPortalReady] = useState(false)

  useEffect(() => setPortalReady(true), [])
  useEffect(() => {
    if (department) setLeaveDepartment((current) => current || department)
    if (department) setProposalDepartment((current) => current || department)
  }, [department])
  useEffect(() => {
    if (user?.displayName) setDrafterName((current) => current || user.displayName)
  }, [user?.displayName])
  useEffect(() => {
    if (viewerTitle) setJobTitle((current) => current || viewerTitle)
  }, [viewerTitle])
  useEffect(() => {
    if (user?.displayName) setApplicantName((current) => current || user.displayName)
  }, [user?.displayName])

  const finalPerson = people.find((person) => person.id === finalId) ?? null
  const directFinal = !!finalPerson && isTeamLeadTitle(finalPerson.jobTitle)
  const reviewMissing = !!finalPerson && !directFinal && teamReviewers.length === 0
  const keyword = query.trim().toLowerCase()
  const higher = useMemo(() => people.filter((person) => {
    if (person.id === finalId || !isHigherTitle(person.jobTitle, viewerTitle)) return false
    if (!keyword) return true
    return `${person.displayName} ${person.jobTitle}`.toLowerCase().includes(keyword)
  }).sort((a, b) => jobRank(b.jobTitle) - jobRank(a.jobTitle) || a.displayName.localeCompare(b.displayName, 'ko')), [finalId, keyword, people, viewerTitle])

  function addFiles(list: FileList | null) {
    if (!list?.length) return
    const next = [...files]
    for (const file of Array.from(list)) {
      if (next.length >= FILE_LIMIT) {
        toast.error(`첨부는 ${FILE_LIMIT}개까지 넣을 수 있습니다.`)
        break
      }
      if (!fileKind(file.name)) {
        toast.error(`${file.name}은 올릴 수 없는 형식입니다.`)
        continue
      }
      if (file.size > FILE_BYTES) {
        toast.error(`${file.name}은 8MB를 넘습니다.`)
        continue
      }
      if (next.some((item) => item.name === file.name && item.size === file.size)) continue
      next.push(file)
    }
    if (next.reduce((sum, file) => sum + file.size, 0) > FILE_TOTAL) {
      toast.error('첨부 용량이 20MB를 넘습니다.')
      return
    }
    setFiles(next)
  }

  async function waitForPrintImages(root: HTMLElement) {
    await Promise.all([...root.querySelectorAll('img')].map((img) => (
      img.complete
        ? Promise.resolve()
        : new Promise<void>((resolve) => {
            img.onload = () => resolve()
            img.onerror = () => resolve()
          })
    )))
  }

  function concealProposalPrintPage(sheet: HTMLElement) {
    const hidden: HTMLElement[] = []
    const conceal = (element: Element) => {
      if (!(element instanceof HTMLElement)) return
      if (element === sheet) return
      if (element.contains(sheet)) {
        ;[...element.children].forEach(conceal)
        return
      }
      hidden.push(element)
      element.dataset.proposalPrintHidden = element.style.display
      element.style.setProperty('display', 'none', 'important')
    }
    conceal(document.body)
    return hidden
  }

  function restoreConcealedProposalPrint(hidden: HTMLElement[], root: HTMLElement) {
    hidden.forEach((element) => {
      element.style.display = element.dataset.proposalPrintHidden ?? ''
      delete element.dataset.proposalPrintHidden
    })
    root.style.removeProperty('display')
  }

  async function printSheet() {
    if (proposal && (!title.trim() || richTextIsEmpty(body))) {
      toast.error('제목과 내용을 입력한 뒤 출력해 주세요.')
      return
    }
    if (leave && (!leaveType || !startDate || !endDate)) {
      toast.error('휴가 구분과 기간을 입력한 뒤 출력해 주세요.')
      return
    }
    const root = printRootRef.current
    if (!root) return
    const sheet = root.querySelector('.proposal-print-page')
    if (!(sheet instanceof HTMLElement)) return
    setPrinting(true)
    const previousTitle = document.title
    const html = document.documentElement
    const hidden = concealProposalPrintPage(sheet)
    root.style.setProperty('display', 'block', 'important')
    html.classList.add('proposal-print-active')
    document.body.classList.add('proposal-print')
    document.title = leave ? `휴가신청서_${applicantName.trim() || '신청'}` : (title.trim() ? `기안품의서_${title.trim()}` : '기안품의서')
    let restored = false
    const restore = () => {
      if (restored) return
      restored = true
      restoreConcealedProposalPrint(hidden, root)
      html.classList.remove('proposal-print-active')
      document.body.classList.remove('proposal-print')
      document.title = previousTitle
      setPrinting(false)
      window.removeEventListener('afterprint', restore)
    }
    try {
      await waitForPrintImages(root)
      window.addEventListener('afterprint', restore)
      window.print()
      restore()
    } catch {
      restore()
      toast.error('출력하지 못했습니다.')
    }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (proposal && !proposalDepartment.trim()) {
      toast.error('작성부서를 입력해 주세요.')
      return
    }
    if (leave) {
      if (!leaveDepartment.trim() || !applicantName.trim()) {
        toast.error('부서와 성명을 입력해 주세요.')
        return
      }
      if (!leaveType) {
        toast.error('휴가 구분을 골라 주세요.')
        return
      }
      if (!startDate || !endDate) {
        toast.error('휴가 기간을 입력해 주세요.')
        return
      }
      if (endDate < startDate) {
        toast.error('휴가 종료일이 시작일보다 빠릅니다.')
        return
      }
      if (richTextPlain(detail).length > RICH_TEXT_PLAIN_MAX || detail.length > RICH_TEXT_HTML_MAX) {
        toast.error('세부사항이 너무 깁니다.')
        return
      }
    } else if (!title.trim() || richTextIsEmpty(body)) {
      toast.error('제목과 내용을 입력해 주세요.')
      return
    }
    if (!leave && (richTextPlain(body).length > RICH_TEXT_PLAIN_MAX || body.length > RICH_TEXT_HTML_MAX)) {
      toast.error('내용이 너무 깁니다.')
      return
    }
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
      const draft: ApprovalDraft = proposal
        ? { kind: 'proposal', docNo: docNoDirty ? storedProposalDocNo('품의', docNoText) : '', department: proposalDepartment.trim(), draftedOn, formType: '품의', retention: retention.trim() || '1년', agreement: agreement.trim(), opinion: opinion.trim(), receiver: receiver.trim(), reference: reference.trim(), destination: destination.trim(), drafterName: drafterName.trim() }
        : { kind: 'leave', docNo: '', draftedOn, department: leaveDepartment.trim(), jobTitle: jobTitle.trim(), applicantName: applicantName.trim(), emergencyContact: emergencyContact.trim(), leaveType: leaveType as LeaveType, startDate, endDate, detail }
      const requestTitle = leave ? `휴가신청서 · ${leaveType}` : title
      const requestBody = leave ? (richTextPlain(detail) || `${leaveType} ${startDate} ~ ${endDate}`) : body
      const response = await fetch('/api/approvals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: requestTitle,
          body: requestBody,
          finalApproverId: finalId,
          draft,
          files: await Promise.all(files.map(async (file) => ({ name: file.name, data: await readBase64(file) }))),
        }),
      })
      const data = await response.json().catch(() => null)
      if (!response.ok) {
        toast.error(data?.error ?? '결재 요청을 보내지 못했습니다.')
        return
      }
      toast.success(data?.data?.docNo ? `결재 요청을 보냈습니다. 문서번호 ${data.data.docNo}` : '결재 요청을 보냈습니다.')
      await onSubmitted()
    } catch {
      toast.error('결재 요청을 보내지 못했습니다.')
    } finally {
      setSending(false)
    }
  }

  const draftProposalStamps = useMemo(() => [
    {
      label: '작성' as const,
      name: drafterName || user?.displayName || '',
      title: '',
      imageUrl: user?.hasSignature ? '/api/auth/signature' : undefined,
    },
    { label: '검토' as const, name: '', title: '' },
    { label: '승인' as const, name: '', title: '' },
  ], [drafterName, user?.displayName, user?.hasSignature])

  const printPortal = portalReady ? createPortal(
    <div ref={printRootRef} className="proposal-print-root" aria-hidden>
      {proposal ? (
      <ProposalPrintPage
        formType="품의"
        docNo={docNoDirty ? docNoText : docNo}
        draftedOn={draftedOn}
        retention={retention}
        department={proposalDepartment}
        drafterName={drafterName || user?.displayName || ''}
        agreement={agreement}
        opinion={opinion}
        receiver={receiver}
        reference={reference}
        title={title}
        body={body}
        destination={destination}
        stamps={draftProposalStamps}
      />
      ) : (
        <article className="proposal-print-page leave-print-sheet">
          <LeaveSheet
            print
            draftedOn={draftedOn}
            department={leaveDepartment}
            jobTitle={jobTitle}
            applicantName={applicantName}
            emergencyContact={emergencyContact}
            leaveType={leaveType}
            startDate={startDate}
            endDate={endDate}
            detail={detail}
            stamps={draftProposalStamps}
          />
        </article>
      )}
    </div>,
    document.body,
  ) : null

  return (
    <>
    {printPortal}
    <form onSubmit={submit} className="approval-draft-form grid items-start gap-5 pb-8 xl:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="space-y-4">
        {proposal ? (
          <ProposalSheet
            formType="품의"
            docNo={docNoDirty ? docNoText : docNo}
            onDocNo={(value) => { setDocNoDirty(true); setDocNoText(value) }}
            draftedOn={draftedOn}
            onDraftedOn={setDraftedOn}
            retention={retention}
            onRetention={setRetention}
            department={proposalDepartment}
            onDepartment={setProposalDepartment}
            drafterName={drafterName || user?.displayName || ''}
            onDrafterName={setDrafterName}
            agreement={agreement}
            onAgreement={setAgreement}
            opinion={opinion}
            onOpinion={setOpinion}
            receiver={receiver}
            onReceiver={setReceiver}
            reference={reference}
            onReference={setReference}
            title={title}
            onTitle={setTitle}
            body={body}
            onBody={setBody}
            destination={destination}
            onDestination={setDestination}
            stamps={draftProposalStamps}
          />
        ) : (
          <LeaveSheet
            draftedOn={draftedOn}
            onDraftedOn={setDraftedOn}
            department={leaveDepartment}
            onDepartment={setLeaveDepartment}
            jobTitle={jobTitle}
            onJobTitle={setJobTitle}
            applicantName={applicantName}
            onApplicantName={setApplicantName}
            emergencyContact={emergencyContact}
            onEmergencyContact={setEmergencyContact}
            leaveType={leaveType}
            onLeaveType={setLeaveType}
            startDate={startDate}
            onStartDate={setStartDate}
            endDate={endDate}
            onEndDate={setEndDate}
            detail={detail}
            onDetail={setDetail}
            stamps={draftProposalStamps}
          />
        )}

        <section className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-card">
          <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">첨부</p>
          <input
            ref={attachRef}
            type="file"
            multiple
            accept={ACCEPT_ALL_FILES}
            tabIndex={-1}
            className="hidden"
            onChange={(event) => {
              addFiles(event.target.files)
              event.target.value = ''
            }}
          />
          <button
            type="button"
            onClick={() => attachRef.current?.click()}
            className="mt-3 flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-3 py-4 text-sm text-slate-500 hover:border-sky-300 hover:bg-white dark:border-white/15 dark:bg-white/[0.03] dark:hover:bg-white/[0.06]"
          >
            <Paperclip className="size-4" />
            파일 선택
          </button>
          <p className="mt-1.5 text-[11px] text-slate-400">PDF, 엑셀, 워드, 한글, 이미지, ZIP. 5개, 파일당 8MB, 합계 20MB.</p>
          {files.length > 0 && (
            <ul className="mt-3 space-y-1.5">
              {files.map((file) => (
                <li key={`${file.name}-${file.size}`} className="flex items-center gap-2 rounded-lg bg-slate-50 px-2.5 py-2 dark:bg-white/[0.04]">
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{file.name}</span>
                  <span className="shrink-0 text-xs text-slate-400">{formatFileSize(file.size)}</span>
                  <button type="button" aria-label={`${file.name} 빼기`} onClick={() => setFiles((current) => current.filter((item) => item !== file))} className="rounded-md p-1 text-slate-400 hover:text-rose-600">
                    <X className="size-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" disabled={printing || sending} className="h-10 gap-1.5 px-4" onClick={() => void printSheet()}>
              <Printer className="size-4" />
              {printing ? '출력 중…' : '출력'}
            </Button>
          <Button type="submit" disabled={sending || printing} className="h-10 px-5">{sending ? '요청 중…' : '결재 요청'}</Button>
        </div>
      </div>

      <aside className="self-start rounded-2xl border border-slate-200 bg-slate-50/80 p-4 xl:sticky xl:top-4 dark:border-white/10 dark:bg-white/[0.03]">
        <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">결재선</p>
        <div className="mt-4">
          <ApprovalLinePicker
            people={higher}
            reviewers={teamReviewers}
            finalPerson={finalPerson}
            showReview={!directFinal && (teamReviewers.length > 0 || reviewMissing)}
            reviewMissing={reviewMissing}
            query={query}
            onQuery={setQuery}
            onPick={setFinalId}
            onClear={() => setFinalId('')}
            loading={loading}
            drafterName={user?.displayName ?? ''}
            drafterTitle={viewerTitle}
          />
        </div>
      </aside>
    </form>
    </>
  )
}

function readBase64(file: File) {
  return file.arrayBuffer().then((buffer) => {
    const bytes = new Uint8Array(buffer)
    let binary = ''
    for (let index = 0; index < bytes.length; index += 8192) {
      binary += String.fromCharCode(...bytes.subarray(index, index + 8192))
    }
    return btoa(binary)
  })
}
