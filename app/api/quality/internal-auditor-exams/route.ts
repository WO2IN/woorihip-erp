import { NextRequest, NextResponse } from 'next/server'
import { canManageQualityRecords, getUserFromHeaders } from '@/lib/auth'
import {
  APPROVAL_STEPS,
  INTERNAL_AUDITOR_EXAM_COLLECTION,
  scoreExam,
  type ApprovalStep,
  type InternalAuditorExamApproval,
  type InternalAuditorExamRecord,
} from '@/lib/internal-auditor-exam'
import { insertRecord, listRecords } from '@/lib/records'
import { appendAuditLog } from '@/lib/storage'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function text(value: unknown, max: number) {
  if (typeof value !== 'string') return ''
  return value.trim().slice(0, max)
}

function approvals(value: unknown): InternalAuditorExamApproval[] | null {
  if (value == null) return []
  if (!Array.isArray(value)) return null
  const steps = new Set<string>()
  const rows: InternalAuditorExamApproval[] = []
  for (const item of value) {
    if (!item || typeof item !== 'object') return null
    const step = (item as { step?: unknown }).step
    if (typeof step !== 'string' || !APPROVAL_STEPS.includes(step as ApprovalStep) || steps.has(step)) return null
    steps.add(step)
    rows.push({
      step: step as ApprovalStep,
      signedById: text((item as { signedById?: unknown }).signedById, 80),
      signedByName: text((item as { signedByName?: unknown }).signedByName, 40),
    })
  }
  return rows
}

export async function GET() {
  const data = await listRecords<InternalAuditorExamRecord>(INTERNAL_AUDITOR_EXAM_COLLECTION)
  return NextResponse.json({ data })
}

export async function POST(request: NextRequest) {
  const user = await getUserFromHeaders(request.headers)
  if (!user || !canManageQualityRecords(user.role)) {
    return NextResponse.json({ error: '관리자만 저장할 수 있습니다.' }, { status: 403 })
  }

  const body = await request.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: '시험 기록이 올바르지 않습니다.' }, { status: 400 })
  }

  const examinee = text((body as { examinee?: unknown }).examinee, 40)
  const examineeId = text((body as { examineeId?: unknown }).examineeId, 80)
  const examDate = text((body as { examDate?: unknown }).examDate, 10)
  const supervisor = text((body as { supervisor?: unknown }).supervisor, 40)
  const paperId = text((body as { paperId?: unknown }).paperId, 40)
  const rawAnswers = (body as { answers?: unknown }).answers
  const signed = approvals((body as { approvals?: unknown }).approvals)

  if (!examinee || !/^\d{4}-\d{2}-\d{2}$/.test(examDate) || !supervisor) {
    return NextResponse.json({ error: '응시자, 시험일, 감독자를 확인해 주세요.' }, { status: 400 })
  }
  if (!Array.isArray(rawAnswers) || rawAnswers.some((value) => typeof value !== 'number') || !signed) {
    return NextResponse.json({ error: '답안이 올바르지 않습니다.' }, { status: 400 })
  }

  const graded = scoreExam(paperId, rawAnswers)
  if (!graded) {
    return NextResponse.json({ error: '모든 문항을 고른 뒤 저장해 주세요.' }, { status: 400 })
  }

  const record: InternalAuditorExamRecord = {
    id: crypto.randomUUID(),
    ...(examineeId ? { examineeId } : {}),
    examinee,
    examDate,
    supervisor,
    paperId: graded.paper.id,
    paperStep: graded.paper.step,
    paperTitle: graded.paper.title,
    answers: rawAnswers,
    correct: graded.correct,
    total: graded.total,
    score: graded.score,
    passed: graded.passed,
    approvals: signed,
    savedById: user.id,
    savedByName: user.displayName,
    savedAt: new Date().toISOString(),
  }

  await insertRecord(INTERNAL_AUDITOR_EXAM_COLLECTION, record, 'first')
  await appendAuditLog({
    action: 'CREATE',
    target: 'internal-auditor-exam',
    detail: `내부심사원 시험 저장: ${examinee} · ${graded.paper.step} ${graded.score}점`,
    userId: user.id,
    userName: user.displayName,
  })

  const data = await listRecords<InternalAuditorExamRecord>(INTERNAL_AUDITOR_EXAM_COLLECTION)
  return NextResponse.json({ data: record, count: data.length })
}
