import { randomUUID } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { findUserById, getUserFromHeaders, listUsers } from '@/lib/auth'
import { decodeApprovalFiles, storeApprovalFiles } from '@/lib/approval-files'
import {
  APPROVALS_COLLECTION,
  markApprovalRead,
  unreadCount,
  approvalNotices,
  isHigherTitle,
  isTeamLeadTitle,
  nextApprovalDocNo,
  readApprovalDraft,
  readApprovalTarget,
  sortApprovalPeople,
  teamLeadReviewers,
  visibleApproval,
  type ApprovalRequest,
  type ApprovalStep,
} from '@/lib/approval'
import { ensureApprovalTargetFree } from '@/lib/approval-apply'
import { RICH_TEXT_HTML_MAX, RICH_TEXT_PLAIN_MAX, richTextPlain, sanitizeRichText } from '@/lib/rich-text'
import { insertRecordPrepared, getSetting, listRecords } from '@/lib/records'
import { departmentForPerson } from '@/lib/organization'
import { appendAuditLog } from '@/lib/storage'

const TITLE_MAX = 80

export async function GET(request: NextRequest) {
  const user = await getUserFromHeaders(request.headers)
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })

  const all = await listRecords<ApprovalRequest>(APPROVALS_COLLECTION)
  const pendingCount = unreadCount(all, user.id)
  if (request.nextUrl.searchParams.get('summary') === '1') {
    return NextResponse.json({ pendingCount, notices: approvalNotices(all, user.id) })
  }

  const mine = all.filter((item) => visibleApproval(item, user.id))
  const accounts = await listUsers()
  const organization = await getSetting<unknown>('organization', null)
  const people = sortApprovalPeople(
    accounts
      .filter((item) => item.status !== 'pending' && item.id !== user.id)
      .map((item) => ({
        id: item.id,
        displayName: item.displayName,
        jobTitle: item.jobTitle?.trim() || '직급 없음',
        hasSignature: Boolean(item.hasSignature),
      })),
  )
  return NextResponse.json({
    data: mine,
    pendingCount,
    people,
    teamReviewers: teamLeadReviewers(organization, accounts, user.displayName),
    viewerJobTitle: user.jobTitle ?? '',
    viewerDepartment: departmentForPerson(organization, user.displayName),
    nextDocNo: nextApprovalDocNo(all),
  })
}

export async function POST(request: NextRequest) {
  const user = await getUserFromHeaders(request.headers)
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })

  const body = await request.json().catch(() => null) as { title?: unknown; body?: unknown; finalApproverId?: unknown; target?: unknown; draft?: unknown; files?: unknown } | null
  const title = typeof body?.title === 'string' ? body.title.trim() : ''
  const rawText = typeof body?.body === 'string' ? body.body : ''
  const text = sanitizeRichText(rawText)
  const plain = richTextPlain(text)
  const finalApproverId = typeof body?.finalApproverId === 'string' ? body.finalApproverId.trim() : ''
  const target = readApprovalTarget(body?.target)
  if (target && 'error' in target) return NextResponse.json({ error: target.error }, { status: 400 })
  const organization = await getSetting<unknown>('organization', null)
  const rawDraft = body?.draft && typeof body.draft === 'object' ? { ...(body.draft as Record<string, unknown>) } : body?.draft
  if (rawDraft && typeof rawDraft === 'object' && (rawDraft as { kind?: unknown }).kind === 'proposal') {
    const submitted = typeof (rawDraft as { department?: unknown }).department === 'string'
      ? (rawDraft as { department: string }).department.trim().slice(0, 40)
      : ''
    const department = submitted || departmentForPerson(organization, user.displayName)
    if (!department) return NextResponse.json({ error: '작성부서를 입력해 주세요.' }, { status: 400 })
    ;(rawDraft as { department: string }).department = department
  }
  if (rawDraft && typeof rawDraft === 'object' && (rawDraft as { kind?: unknown }).kind === 'leave' && typeof (rawDraft as { detail?: unknown }).detail === 'string') {
    ;(rawDraft as { detail: string }).detail = sanitizeRichText((rawDraft as { detail: string }).detail).slice(0, RICH_TEXT_HTML_MAX)
  }
  const draft = readApprovalDraft(rawDraft)
  if (draft && 'error' in draft) return NextResponse.json({ error: draft.error }, { status: 400 })
  let uploads
  try {
    uploads = decodeApprovalFiles(body?.files)
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : '첨부파일을 확인하지 못했습니다.' }, { status: 400 })
  }

  if (!title || !plain) return NextResponse.json({ error: '제목과 내용을 입력해 주세요.' }, { status: 400 })
  if (title.length > TITLE_MAX || plain.length > RICH_TEXT_PLAIN_MAX || text.length > RICH_TEXT_HTML_MAX) return NextResponse.json({ error: '제목 또는 내용이 너무 깁니다.' }, { status: 400 })
  if (!finalApproverId) return NextResponse.json({ error: '최종 결재자를 골라 주세요.' }, { status: 400 })
  if (finalApproverId === user.id) return NextResponse.json({ error: '본인은 결재선에 넣을 수 없습니다.' }, { status: 400 })

  const finalApprover = await findUserById(finalApproverId)
  if (!finalApprover || finalApprover.status === 'pending') {
    return NextResponse.json({ error: '결재할 수 없는 사용자가 포함되어 있습니다.' }, { status: 400 })
  }
  const finalTitle = finalApprover.jobTitle?.trim() || '직급 없음'
  if (!isHigherTitle(finalTitle, user.jobTitle ?? '')) {
    return NextResponse.json({ error: '본인보다 높은 직급만 결재선에 넣을 수 있습니다.' }, { status: 400 })
  }
  const finalStep: ApprovalStep = {
    userId: finalApprover.id,
    name: finalApprover.displayName,
    jobTitle: finalTitle,
    role: 'approval',
    status: 'pending',
  }
  const selfReviews = isTeamLeadTitle(user.jobTitle ?? '')
  let steps: ApprovalStep[] = [finalStep]
  if (selfReviews) {
    steps = [
      {
        userId: user.id,
        name: user.displayName,
        jobTitle: user.jobTitle?.trim() || '직급 없음',
        role: 'review',
        status: 'approved',
      },
      { ...finalStep, status: 'pending' },
    ]
  } else if (!isTeamLeadTitle(finalTitle)) {
    const reviewers = teamLeadReviewers(organization, await listUsers(), user.displayName)
    if (reviewers.length === 0) {
      return NextResponse.json({ error: '같은 팀에 검토할 차장·부장이 없습니다.' }, { status: 400 })
    }
    steps = [
      {
        userId: '',
        name: '차장·부장',
        jobTitle: '같은 팀',
        role: 'review',
        status: 'pending',
        candidates: reviewers,
      },
      { ...finalStep, status: 'waiting' },
    ]
  }

  if (target) {
    const open = await ensureApprovalTargetFree(target)
    if (!open.ok) return NextResponse.json({ error: open.error }, { status: 400 })
  }

  const id = randomUUID()
  let files
  try {
    files = await storeApprovalFiles(id, uploads, user.displayName)
  } catch {
    return NextResponse.json({ error: '첨부파일을 저장하지 못했습니다.' }, { status: 500 })
  }

  const created = await insertRecordPrepared<ApprovalRequest>(APPROVALS_COLLECTION, (existing) => {
    const now = new Date()
    const signedAt = now.toISOString()
    const requestedDocNo = draft?.docNo.trim() ?? ''
    const docNo = requestedDocNo || nextApprovalDocNo(existing, now)
    const writerStep: ApprovalStep = {
      userId: user.id,
      name: user.displayName,
      jobTitle: user.jobTitle?.trim() || '직급 없음',
      status: 'approved',
      signedAt,
    }
    const row: ApprovalRequest = {
      id,
      docNo,
      title,
      body: text,
      requesterId: user.id,
      requesterName: user.displayName,
      createdAt: signedAt,
      status: 'pending',
      steps: [writerStep, ...steps.map((step) => (
        step.role === 'review' && step.status === 'approved' ? { ...step, signedAt } : step
      ))],
      ...(target ? { target } : {}),
      ...(draft ? { draft: { ...draft, docNo } } : {}),
      ...(files.length ? { files } : {}),
    }
    return markApprovalRead(row, user.id)
  }, 'first')
  await appendAuditLog({
    action: 'CREATE',
    target: 'approval',
    detail: `결재 요청 · ${created.docNo} · ${title}`,
    userId: user.id,
    userName: user.displayName,
  })
  return NextResponse.json({ data: created })
}

export const dynamic = 'force-dynamic'
