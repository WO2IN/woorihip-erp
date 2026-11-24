import {
  APPROVALS_COLLECTION,
  approvalTargetKey,
  type ApprovalRequest,
  type ApprovalTarget,
} from '@/lib/approval'
import { STAMP_KEYS, type ChangeRequest, type StampKey } from '@/lib/change-request'
import { APPROVAL_STEPS, INTERNAL_AUDITOR_EXAM_COLLECTION, type InternalAuditorExamApproval, type InternalAuditorExamRecord } from '@/lib/internal-auditor-exam'
import { INSPECTOR_EXAM_COLLECTION } from '@/lib/inspector-exam'
import { getSetting, listRecords, patchRecord, setSetting } from '@/lib/records'
import { emptyStampEntry, readStampBook, SUITABILITY_STAMPS_KEY, type SuitabilityStampStep } from '@/lib/suitability-stamps'

const CHANGE_REQUESTS_KEY = 'development-change-requests'

type Signer = { id: string; displayName: string }
type ApplyResult = { ok: true } | { ok: false; error: string }

function changeStampOpen(row: ChangeRequest, stamp: StampKey) {
  if (stamp === 'ourFinal') return row.ourJeongyeol
  if (stamp === 'customerFinal') return row.customerJeongyeol
  if (stamp === 'ourReview' || stamp === 'ourDecision') return !row.ourJeongyeol
  if (stamp === 'customerReview' || stamp === 'customerDecision') return !row.customerJeongyeol
  return true
}

async function readChangeRequests() {
  const rows = await getSetting<unknown>(CHANGE_REQUESTS_KEY, [])
  return Array.isArray(rows) ? rows.filter((row): row is ChangeRequest => !!row && typeof row === 'object' && typeof (row as ChangeRequest).id === 'string') : []
}

function sameExam(left: InternalAuditorExamRecord, right: InternalAuditorExamRecord) {
  if (left.paperId !== right.paperId) return false
  if (left.examineeId && right.examineeId) return left.examineeId === right.examineeId
  return left.examinee === right.examinee
}

function withExamStep(approvals: InternalAuditorExamApproval[] | undefined, step: InternalAuditorExamApproval['step'], signer: Signer) {
  const next = (approvals ?? []).filter((item) => item.step !== step)
  next.push({ step, signedById: signer.id, signedByName: signer.displayName })
  return APPROVAL_STEPS.flatMap((item) => {
    const found = next.find((approval) => approval.step === item)
    return found ? [found] : []
  })
}

async function suitabilityOwner(personId: string, step: SuitabilityStampStep) {
  const book = readStampBook(await getSetting(SUITABILITY_STAMPS_KEY, {}))
  return book[personId]?.signs[step] ?? ''
}

async function examRows(target: Extract<ApprovalTarget, { kind: 'exam' }>) {
  const collection = target.examKind === 'auditor' ? INTERNAL_AUDITOR_EXAM_COLLECTION : INSPECTOR_EXAM_COLLECTION
  const records = await listRecords<InternalAuditorExamRecord>(collection)
  const targetRow = records.find((row) => row.id === target.recordId)
  if (!targetRow) return { error: '저장된 시험 기록을 찾지 못했습니다. 채점 저장 후 다시 올려 주세요.' as const }
  const related = records
    .filter((row) => sameExam(row, targetRow))
    .sort((a, b) => (b.savedAt || '').localeCompare(a.savedAt || ''))
  const newest = related[0] ?? targetRow
  const rows = newest.id === targetRow.id ? [targetRow] : [targetRow, newest]
  return { collection, rows }
}

export async function ensureApprovalTargetFree(target: ApprovalTarget): Promise<ApplyResult> {
  if (target.kind === 'suitability') {
    if (await suitabilityOwner(target.personId, target.step)) return { ok: false, error: '이 칸에는 이미 서명이 있습니다.' }
  } else if (target.kind === 'exam') {
    const found = await examRows(target)
    if ('error' in found) return { ok: false, error: found.error }
    const taken = found.rows.some((row) => row.approvals?.some((item) => item.step === target.step && item.signedById && item.signedById !== ''))
    if (taken) return { ok: false, error: '이 칸에는 이미 서명이 있습니다.' }
  } else if (target.kind === 'change-request') {
    const rows = await readChangeRequests()
    const row = rows.find((item) => item.id === target.requestId)
    if (!row) return { ok: false, error: '저장한 변경요청을 찾지 못했습니다.' }
    if (!changeStampOpen(row, target.stamp)) return { ok: false, error: '이 칸은 지금 서명할 수 없습니다.' }
    if (row.signs?.[target.stamp]) return { ok: false, error: '이 칸에는 이미 서명이 있습니다.' }
  }

  const key = approvalTargetKey(target)
  const pending = await listRecords<ApprovalRequest>(APPROVALS_COLLECTION)
  if (pending.some((item) => item.status === 'pending' && item.target && approvalTargetKey(item.target) === key)) {
    return { ok: false, error: '이 칸은 이미 결재 중입니다.' }
  }
  return { ok: true }
}

export async function applyApprovalTarget(target: ApprovalTarget | undefined, signer: Signer): Promise<ApplyResult> {
  if (!target) return { ok: true }
  if (target.kind === 'suitability') {
    const book = readStampBook(await getSetting(SUITABILITY_STAMPS_KEY, {}))
    const entry = book[target.personId] ?? emptyStampEntry()
    const existing = entry.signs[target.step]
    if (existing && existing !== signer.id) return { ok: false, error: '이 칸에는 이미 서명이 있습니다.' }
    entry.signs[target.step] = signer.id
    entry.names[target.step] = signer.displayName
    book[target.personId] = entry
    await setSetting(SUITABILITY_STAMPS_KEY, book)
    return { ok: true }
  }
  if (target.kind === 'exam') {
    const found = await examRows(target)
    if ('error' in found) return { ok: false, error: found.error }
    for (const row of found.rows) {
      const existing = row.approvals?.find((item) => item.step === target.step && item.signedById)
      if (existing && existing.signedById !== signer.id) return { ok: false, error: '이 칸에는 이미 서명이 있습니다.' }
    }
    for (const row of found.rows) {
      await patchRecord<InternalAuditorExamRecord>(found.collection, row.id, (current) => ({
        approvals: withExamStep(current.approvals, target.step, signer),
      }))
    }
    return { ok: true }
  }
  if (target.kind === 'lot-card' || target.kind === 'incoming-inspection' || target.kind === 'outgoing-report') return { ok: true }

  const rows = await readChangeRequests()
  const index = rows.findIndex((row) => row.id === target.requestId)
  if (index < 0) return { ok: false, error: '변경요청을 찾지 못했습니다.' }
  const row = rows[index]
  if (!changeStampOpen(row, target.stamp)) return { ok: false, error: '이 칸은 지금 서명할 수 없습니다.' }
  const existing = row.signs?.[target.stamp]
  if (existing && existing !== signer.id) return { ok: false, error: '이 칸에는 이미 서명이 있습니다.' }
  const next: ChangeRequest = {
    ...row,
    signs: { ...(row.signs ?? {}), [target.stamp]: signer.id },
    [target.stamp]: signer.displayName,
    updatedAt: new Date().toISOString(),
  }
  const saved = rows.slice()
  saved[index] = next
  await setSetting(CHANGE_REQUESTS_KEY, saved)
  return { ok: true }
}

export async function mergeExamApprovalsForSave(
  collection: string,
  paperId: string,
  examineeId: string,
  examinee: string,
  incoming: InternalAuditorExamApproval[],
  basedOnId: string,
) {
  const rows = await listRecords<InternalAuditorExamRecord>(collection)
  const latest = rows
    .filter((row) => row.paperId === paperId && (examineeId && row.examineeId ? row.examineeId === examineeId : row.examinee === examinee))
    .sort((a, b) => (b.savedAt || '').localeCompare(a.savedAt || ''))[0]
  if (!latest || latest.id === basedOnId) return incoming
  const kept = new Map(incoming.filter((item) => item.signedById).map((item) => [item.step, item]))
  for (const item of latest.approvals ?? []) {
    if (item.signedById && !kept.has(item.step)) kept.set(item.step, item)
  }
  return APPROVAL_STEPS.flatMap((step) => {
    const item = kept.get(step)
    return item ? [item] : []
  })
}

export function keptChangeStamps(next: ChangeRequest, current: ChangeRequest | undefined, cleared: unknown) {
  if (!current?.signs) return next
  const dropped = new Set(
    Array.isArray(cleared) ? cleared.filter((item): item is StampKey => typeof item === 'string' && STAMP_KEYS.includes(item as StampKey)) : [],
  )
  for (const key of STAMP_KEYS) {
    const remote = current.signs[key]
    if (!remote || next.signs[key] || dropped.has(key)) continue
    next.signs[key] = remote
    if (current[key]) next[key] = current[key]
  }
  return next
}
