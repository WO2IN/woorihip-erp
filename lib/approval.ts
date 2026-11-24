import { STAMP_KEYS, type StampKey } from '@/lib/change-request'
import { RICH_TEXT_HTML_MAX } from '@/lib/rich-text'
import { sharesTeam } from '@/lib/organization'
import { JOB_TITLES } from '@/lib/user-job-titles'

export const APPROVALS_COLLECTION = 'approvals'

const SUITABILITY_STEPS = ['작성', '검토', '승인'] as const
const EXAM_STEPS = ['감독', '검토', '승인'] as const

export type ApprovalTarget =
  | { kind: 'suitability'; personId: string; personName: string; step: (typeof SUITABILITY_STEPS)[number] }
  | { kind: 'exam'; examKind: 'auditor' | 'inspector'; recordId: string; examinee: string; step: (typeof EXAM_STEPS)[number] }
  | { kind: 'change-request'; requestId: string; docLabel: string; stamp: StampKey }
  | { kind: 'lot-card'; cardId: string; label: string }
  | { kind: 'incoming-inspection'; sheetId: string; label: string }
  | { kind: 'outgoing-report'; sheetId: string; label: string }

const CHANGE_STAMP_LABEL: Record<StampKey, string> = {
  ourDraft: '우리하이피 · 입안',
  ourReview: '우리하이피 · 심의',
  ourDecision: '우리하이피 · 결정',
  ourFinal: '우리하이피 · 전결',
  customerDraft: '고객사 · 입안',
  customerReview: '고객사 · 심의',
  customerDecision: '고객사 · 결정',
  customerFinal: '고객사 · 전결',
}

function clip(value: unknown, max: number) {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

export function readApprovalTarget(value: unknown): ApprovalTarget | undefined | { error: string } {
  if (value == null) return undefined
  if (!value || typeof value !== 'object') return { error: '결재 대상이 올바르지 않습니다.' }
  const raw = value as Record<string, unknown>
  if (raw.kind === 'suitability') {
    const personId = clip(raw.personId, 80)
    const personName = clip(raw.personName, 40) || '대상자'
    const step = raw.step
    if (!personId || typeof step !== 'string' || !SUITABILITY_STEPS.includes(step as (typeof SUITABILITY_STEPS)[number])) {
      return { error: '적격성평가서 결재 칸이 올바르지 않습니다.' }
    }
    return { kind: 'suitability', personId, personName, step: step as (typeof SUITABILITY_STEPS)[number] }
  }
  if (raw.kind === 'exam') {
    const examKind = raw.examKind === 'inspector' ? 'inspector' : raw.examKind === 'auditor' ? 'auditor' : ''
    const recordId = clip(raw.recordId, 80)
    const examinee = clip(raw.examinee, 40) || '응시자'
    const step = raw.step
    if (!examKind || !recordId || typeof step !== 'string' || !EXAM_STEPS.includes(step as (typeof EXAM_STEPS)[number])) {
      return { error: '시험 결재 칸이 올바르지 않습니다.' }
    }
    return { kind: 'exam', examKind, recordId, examinee, step: step as (typeof EXAM_STEPS)[number] }
  }
  if (raw.kind === 'change-request') {
    const requestId = clip(raw.requestId, 80)
    const docLabel = clip(raw.docLabel, 80) || '변경요청'
    const stamp = raw.stamp
    if (!requestId || typeof stamp !== 'string' || !STAMP_KEYS.includes(stamp as StampKey)) {
      return { error: '4M 변경점 결재 칸이 올바르지 않습니다.' }
    }
    return { kind: 'change-request', requestId, docLabel, stamp: stamp as StampKey }
  }
  if (raw.kind === 'lot-card') {
    const cardId = clip(raw.cardId, 80)
    const label = clip(raw.label, 80) || '이력카드'
    if (!cardId) return { error: '이력카드 결재 대상이 올바르지 않습니다.' }
    return { kind: 'lot-card', cardId, label }
  }
  if (raw.kind === 'incoming-inspection') {
    const sheetId = clip(raw.sheetId, 80)
    const label = clip(raw.label, 80) || '수입검사'
    if (!sheetId) return { error: '수입검사 성적서 결재 대상이 올바르지 않습니다.' }
    return { kind: 'incoming-inspection', sheetId, label }
  }
  if (raw.kind === 'outgoing-report') {
    const sheetId = clip(raw.sheetId, 80)
    const label = clip(raw.label, 80) || '출하성적서'
    if (!sheetId) return { error: '출하성적서 결재 대상이 올바르지 않습니다.' }
    return { kind: 'outgoing-report', sheetId, label }
  }
  return { error: '결재 대상이 올바르지 않습니다.' }
}

export function approvalTargetKey(target: ApprovalTarget) {
  if (target.kind === 'suitability') return `suitability:${target.personId}:${target.step}`
  if (target.kind === 'exam') return `exam:${target.examKind}:${target.recordId}:${target.step}`
  if (target.kind === 'lot-card') return `lot-card:${target.cardId}`
  if (target.kind === 'incoming-inspection') return `incoming-inspection:${target.sheetId}`
  if (target.kind === 'outgoing-report') return `outgoing-report:${target.sheetId}`
  return `change-request:${target.requestId}:${target.stamp}`
}

export const PROPOSAL_FORM_TYPES = ['품의', '기안', '보고', '협조', '통신'] as const
export type ProposalFormType = (typeof PROPOSAL_FORM_TYPES)[number]

export const LEAVE_TYPES = ['월차', '연차', '반차', '병가', '기타'] as const
export type LeaveType = (typeof LEAVE_TYPES)[number]

export type ApprovalDraft =
  | {
      kind: 'proposal'
      docNo: string
      department: string
      draftedOn: string
      formType: ProposalFormType
      retention: string
      agreement: string
      opinion: string
      receiver: string
      reference: string
      destination: string
      drafterName: string
    }
  | { kind: 'paper'; docNo: string; draftedOn: string }
  | {
      kind: 'leave'
      docNo: string
      draftedOn: string
      department: string
      jobTitle: string
      applicantName: string
      emergencyContact: string
      leaveType: LeaveType
      startDate: string
      endDate: string
      detail: string
    }

function dateOrEmpty(value: unknown) {
  const text = clip(value, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : ''
}

function proposalFormType(value: unknown): ProposalFormType {
  const text = clip(value, 10)
  return (PROPOSAL_FORM_TYPES as readonly string[]).includes(text) ? text as ProposalFormType : '품의'
}

export function readApprovalDraft(value: unknown): ApprovalDraft | undefined | { error: string } {
  if (value == null) return undefined
  if (!value || typeof value !== 'object') return { error: '양식이 올바르지 않습니다.' }
  const raw = value as Record<string, unknown>
  const docNo = clip(raw.docNo, 40)
  const draftedOn = dateOrEmpty(raw.draftedOn)
  if (raw.kind === 'proposal') {
    const department = clip(raw.department, 40)
    if (!department) return { error: '작성부서를 입력해 주세요.' }
    return {
      kind: 'proposal',
      docNo,
      department,
      draftedOn,
      formType: proposalFormType(raw.formType),
      retention: clip(raw.retention, 20) || '1년',
      agreement: clip(raw.agreement, 140),
      opinion: clip(raw.opinion, 200),
      receiver: clip(raw.receiver, 80),
      reference: clip(raw.reference, 80),
      destination: clip(raw.destination, 80),
      drafterName: clip(raw.drafterName, 40),
    }
  }
  if (raw.kind === 'paper') return { kind: 'paper', docNo, draftedOn }
  if (raw.kind === 'leave') {
    const leaveType = clip(raw.leaveType, 10)
    if (!(LEAVE_TYPES as readonly string[]).includes(leaveType)) return { error: '휴가 구분을 골라 주세요.' }
    const startDate = dateOrEmpty(raw.startDate)
    const endDate = dateOrEmpty(raw.endDate)
    if (!startDate || !endDate) return { error: '휴가 기간을 입력해 주세요.' }
    if (endDate < startDate) return { error: '휴가 종료일이 시작일보다 빠릅니다.' }
    const department = clip(raw.department, 40)
    const applicantName = clip(raw.applicantName, 40)
    if (!department || !applicantName) return { error: '부서와 성명을 입력해 주세요.' }
    return {
      kind: 'leave',
      docNo,
      draftedOn,
      department,
      jobTitle: clip(raw.jobTitle, 20),
      applicantName,
      emergencyContact: clip(raw.emergencyContact, 40),
      leaveType: leaveType as LeaveType,
      startDate,
      endDate,
      detail: typeof raw.detail === 'string' ? raw.detail.slice(0, RICH_TEXT_HTML_MAX) : '',
    }
  }
  return { error: '양식이 올바르지 않습니다.' }
}

export function approvalDraftLabel(draft?: ApprovalDraft) {
  if (!draft) return ''
  if (draft.kind === 'proposal') return '기안품의서'
  if (draft.kind === 'leave') return '휴가신청서'
  return '결재 서류'
}

export function approvalDocNoOf(item: { docNo?: string; draft?: { docNo?: string } }) {
  return item.docNo || item.draft?.docNo || ''
}

/** 한국 날짜 YYYYMMDD */
export function seoulDayKey(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)
  const year = parts.find((part) => part.type === 'year')?.value ?? ''
  const month = parts.find((part) => part.type === 'month')?.value ?? ''
  const day = parts.find((part) => part.type === 'day')?.value ?? ''
  return `${year}${month}${day}`
}

/** 같은 날 결재 수와 이미 발급된 번호 중 큰 값의 다음. 01, 02, … 지워진 번호는 다시 쓰지 않는다. */
export function nextApprovalDocNo(existing: { docNo?: string; draft?: { docNo?: string }; createdAt?: string }[], now = new Date()) {
  const day = seoulDayKey(now)
  const prefix = `${day}-`
  let max = 0
  let todayCount = 0
  for (const item of existing) {
    const docNo = approvalDocNoOf(item)
    const numberedToday = docNo.startsWith(prefix)
    if (numberedToday) {
      const seq = Number(docNo.slice(prefix.length))
      if (Number.isInteger(seq) && seq > max) max = seq
    }
    const created = item.createdAt ? new Date(item.createdAt) : null
    const createdToday = !!created && !Number.isNaN(created.getTime()) && seoulDayKey(created) === day
    if (numberedToday || createdToday) todayCount += 1
  }
  return `${prefix}${String(Math.max(max, todayCount) + 1).padStart(2, '0')}`
}

export function approvalTargetLabel(target: ApprovalTarget) {
  if (target.kind === 'suitability') return `적격성평가서 · ${target.personName} · ${target.step}`
  if (target.kind === 'lot-card') return `LOT 이력카드 · ${target.label}`
  if (target.kind === 'incoming-inspection') return `수입검사 성적서 · ${target.label}`
  if (target.kind === 'outgoing-report') return `출하성적서 · ${target.label}`
  if (target.kind === 'exam') {
    const exam = target.examKind === 'auditor' ? '내부심사원 평가' : '검사원 평가'
    return `${exam} · ${target.examinee} · ${target.step}`
  }
  return `4M 변경점 · ${target.docLabel} · ${CHANGE_STAMP_LABEL[target.stamp]}`
}

export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'cancelled'
export type ApprovalStepStatus = 'waiting' | 'pending' | 'approved' | 'rejected' | 'cancelled'

export interface ApprovalCandidate {
  userId: string
  name: string
  jobTitle: string
}

export interface ApprovalStep {
  userId: string
  name: string
  jobTitle: string
  /** 검토는 같은 팀 차장·부장 중 한 명, 결재는 고른 최종 결재자 */
  role?: 'review' | 'approval'
  /** 검토 칸이 비어 있을 때 서명할 수 있는 사람. 한 명이 서명하면 그 사람으로 확정된다. */
  candidates?: ApprovalCandidate[]
  status: ApprovalStepStatus
  signedAt?: string
  comment?: string
}

export interface ApprovalFile {
  id: string
  name: string
  size: number
}

export interface ApprovalRequest {
  id: string
  /** 요청한 날(한국 날짜) + 그날 전체 순번. 예: 20261112-01 */
  docNo?: string
  title: string
  body: string
  requesterId: string
  requesterName: string
  createdAt: string
  status: ApprovalStatus
  rejectReason?: string
  cancelledAt?: string
  steps: ApprovalStep[]
  target?: ApprovalTarget
  draft?: ApprovalDraft
  files?: ApprovalFile[]
  /** 사용자별 마지막으로 확인한 결재 상태. 바뀌면 다시 알림이 된다. */
  reads?: Record<string, string>
}

export function formatFileSize(bytes: number) {
  if (!Number.isFinite(bytes) || bytes < 1024) return `${Math.max(0, Math.round(bytes))}B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)}KB`
  const mega = bytes / (1024 * 1024)
  return `${mega >= 10 ? Math.round(mega) : mega.toFixed(1)}MB`
}

export interface ApprovalPerson {
  id: string
  displayName: string
  jobTitle: string
  hasSignature: boolean
}

const RANK = new Map<string, number>(JOB_TITLES.map((title, index) => [title, index]))
const SENIOR_RANK = RANK.get('차장') ?? 4
const EXECUTIVE_RANK = RANK.get('상무') ?? 6

export function jobRank(title: string) {
  return RANK.get(title) ?? -1
}

export function isHigherTitle(title: string, requesterTitle: string) {
  const rank = jobRank(title)
  return rank >= 0 && rank > jobRank(requesterTitle)
}

export function isExecutiveTitle(title: string) {
  return jobRank(title) >= EXECUTIVE_RANK
}

export function isTeamLeadTitle(title: string) {
  return title === '차장' || title === '부장'
}

export function teamLeadReviewers(
  organization: unknown,
  users: { id: string; displayName: string; jobTitle?: string | null; status?: string }[],
  requesterName: string,
): ApprovalCandidate[] {
  return users
    .filter((person) => (
      person.status !== 'pending'
      && isTeamLeadTitle(person.jobTitle?.trim() ?? '')
      && sharesTeam(organization, requesterName, person.displayName)
    ))
    .map((person) => ({
      userId: person.id,
      name: person.displayName,
      jobTitle: person.jobTitle?.trim() || '직급 없음',
    }))
    .sort((a, b) => jobRank(a.jobTitle) - jobRank(b.jobTitle) || a.name.localeCompare(b.name, 'ko'))
}

/** 임원이 결재선에 있으면 그 앞 직급은 검토다. */
export function approvalLineRole(title: string, titles: string[]): 'review' | 'approval' {
  return titles.some((item) => isExecutiveTitle(item)) && !isExecutiveTitle(title) ? 'review' : 'approval'
}

/** 직급이 낮은 사람이 먼저 서명하도록 같은 직급의 상대 순서는 유지한다. */
export function orderApprovalIds(ids: string[], people: { id: string; jobTitle: string }[]) {
  const ranks = new Map(people.map((person) => [person.id, jobRank(person.jobTitle)]))
  return [...ids].sort((a, b) => (ranks.get(a) ?? -1) - (ranks.get(b) ?? -1))
}

export function approvalStepRole(index: number, total: number, role?: 'review' | 'approval') {
  if (role === 'review') return '검토'
  if (role === 'approval') return '결재'
  if (total <= 1) return '결재'
  if (index === total - 1) return '최종'
  return `${index + 1}차`
}

export function approvalLadderError(approvers: { jobTitle: string }[], requesterTitle: string) {
  if (approvers.some((person) => !isHigherTitle(person.jobTitle, requesterTitle))) {
    return '본인보다 높은 직급만 결재선에 넣을 수 있습니다.'
  }
  return ''
}

export function sortApprovalPeople(people: ApprovalPerson[]) {
  return [...people].sort((a, b) => {
    const aRank = RANK.get(a.jobTitle) ?? -1
    const bRank = RANK.get(b.jobTitle) ?? -1
    const aSenior = aRank >= SENIOR_RANK
    const bSenior = bRank >= SENIOR_RANK
    if (aSenior !== bSenior) return aSenior ? -1 : 1
    if (aRank !== bRank) return bRank - aRank
    return a.displayName.localeCompare(b.displayName, 'ko')
  })
}

export function stepIncludes(step: ApprovalStep, userId: string) {
  if (!userId) return false
  if (step.userId && step.userId === userId) return true
  return step.status === 'pending' && (step.candidates?.some((item) => item.userId === userId) ?? false)
}

export function visibleApproval(request: ApprovalRequest, userId: string) {
  if (request.requesterId === userId) return true
  return request.steps.some((step) => (
    (step.status === 'pending' || step.status === 'approved' || step.status === 'rejected') && stepIncludes(step, userId)
  ))
}

export function pendingFor(request: ApprovalRequest, userId: string) {
  return request.status === 'pending' && request.steps.some((step) => step.status === 'pending' && stepIncludes(step, userId))
}

export function countPending(requests: ApprovalRequest[], userId: string) {
  return requests.filter((request) => pendingFor(request, userId)).length
}

export function activityToken(request: ApprovalRequest) {
  let latest = request.cancelledAt ?? ''
  for (const step of request.steps) {
    if (step.signedAt && step.signedAt > latest) latest = step.signedAt
  }
  return `${request.status}:${latest || request.createdAt}`
}

export function markApprovalRead(request: ApprovalRequest, userId: string): ApprovalRequest {
  const token = activityToken(request)
  if (request.reads?.[userId] === token) return request
  return { ...request, reads: { ...request.reads, [userId]: token } }
}

export function unseenApproval(request: ApprovalRequest, userId: string, bucket: 'inbox' | 'sent' | 'done') {
  if (!userId || request.reads?.[userId] === activityToken(request)) return false
  if (bucket === 'inbox') return pendingFor(request, userId)
  if (bucket === 'sent') return request.status === 'pending' && request.requesterId === userId
  if (request.status === 'pending') return false
  if (request.requesterId === userId) return true
  return request.steps.some((step) => step.userId === userId && (step.status === 'approved' || step.status === 'rejected'))
}

export function unreadCount(requests: ApprovalRequest[], userId: string) {
  return requests.filter((request) => (
    unseenApproval(request, userId, 'inbox')
    || unseenApproval(request, userId, 'sent')
    || unseenApproval(request, userId, 'done')
  )).length
}

export type ApprovalNotice = {
  id: string
  title: string
  docNo: string
  form: string
  message: string
}

export function approvalNotices(requests: ApprovalRequest[], userId: string): ApprovalNotice[] {
  const rows: { at: string; notice: ApprovalNotice }[] = []
  for (const request of requests) {
    let message = ''
    if (unseenApproval(request, userId, 'inbox')) message = '내 결재 차례입니다.'
    else if (unseenApproval(request, userId, 'done')) {
      message = request.status === 'approved' ? '결재가 승인되었습니다.' : request.status === 'rejected' ? '결재가 반려되었습니다.' : '결재가 취소되었습니다.'
    } else if (unseenApproval(request, userId, 'sent')) message = '올린 결재가 진행 중입니다.'
    if (!message) continue
    let at = request.cancelledAt || request.createdAt
    for (const step of request.steps) {
      if (step.signedAt && step.signedAt > at) at = step.signedAt
    }
    rows.push({
      at,
      notice: {
        id: request.id,
        title: request.title,
        docNo: request.docNo || request.draft?.docNo || '',
        form: approvalDraftLabel(request.draft) || '결재',
        message,
      },
    })
  }
  return rows.sort((a, b) => b.at.localeCompare(a.at)).slice(0, 6).map((row) => row.notice)
}

function claimStep(step: ApprovalStep, userId: string): ApprovalStep {
  const signer = step.candidates?.find((item) => item.userId === userId)
  const next: ApprovalStep = signer
    ? { ...step, userId: signer.userId, name: signer.name, jobTitle: signer.jobTitle }
    : { ...step }
  delete next.candidates
  return next
}

export function applySign(request: ApprovalRequest, userId: string, now: string): ApprovalRequest | { error: string } {
  if (request.status !== 'pending') return { error: '이미 끝난 결재입니다.' }
  const index = request.steps.findIndex((step) => step.status === 'pending')
  if (index < 0 || !stepIncludes(request.steps[index], userId)) return { error: '지금은 서명할 차례가 아닙니다.' }
  const steps = request.steps.map((step, stepIndex) => (
    stepIndex === index ? { ...claimStep(step, userId), status: 'approved' as const, signedAt: now } : step
  ))
  const next = steps.findIndex((step) => step.status === 'waiting')
  if (next >= 0) steps[next] = { ...steps[next], status: 'pending' }
  return {
    ...request,
    steps,
    status: steps.every((step) => step.status === 'approved') ? 'approved' : 'pending',
  }
}

export function applyReject(request: ApprovalRequest, userId: string, reason: string, now: string): ApprovalRequest | { error: string } {
  const comment = reason.trim()
  if (!comment) return { error: '반려 사유를 입력해 주세요.' }
  if (request.status !== 'pending') return { error: '이미 끝난 결재입니다.' }
  const index = request.steps.findIndex((step) => step.status === 'pending')
  if (index < 0 || !stepIncludes(request.steps[index], userId)) return { error: '지금은 반려할 차례가 아닙니다.' }
  const steps = request.steps.map((step, stepIndex) => (
    stepIndex === index ? { ...claimStep(step, userId), status: 'rejected' as const, signedAt: now, comment } : step
  ))
  return { ...request, steps, status: 'rejected', rejectReason: comment }
}

export function applyCancel(request: ApprovalRequest, userId: string, now: string): ApprovalRequest | { error: string } {
  if (request.requesterId !== userId) return { error: '올린 사람만 취소할 수 있습니다.' }
  if (request.status !== 'pending') return { error: '이미 끝난 결재는 취소할 수 없습니다.' }
  const steps = request.steps.map((step) => (
    step.status === 'pending' || step.status === 'waiting'
      ? { ...step, status: 'cancelled' as const }
      : step
  ))
  return { ...request, steps, status: 'cancelled', cancelledAt: now }
}

export function isApprovalError(value: ApprovalRequest | { error: string }): value is { error: string } {
  return 'error' in value
}
