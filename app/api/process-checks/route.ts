import { NextRequest, NextResponse } from 'next/server'
import { appendAuditLog, appendProcessCheck, deleteProcessCheck, readProcessChecks, readProcessTemplates, updateProcessCheck } from '@/lib/storage'
import { canEdit, getUserFromHeaders } from '@/lib/auth'
import { canOperateFloor } from '@/lib/access'
import {
  PROCESS_CHECK_FIELDS,
  PROCESS_LINES,
  ProcessAnswer,
  ProcessCheckRecord,
  ProcessFieldSpec,
  ProcessFloor,
  sectionsOf,
} from '@/lib/process-checklist'

export async function GET() {
  return NextResponse.json({ data: await readProcessChecks() })
}

export async function DELETE(req: NextRequest) {
  const requestUser = await getUserFromHeaders(req.headers)
  if (!requestUser || !canEdit(requestUser.role)) {
    return NextResponse.json({ error: '공정 점검 삭제 권한이 없습니다.' }, { status: 403 })
  }
  const { id } = await req.json().catch(() => ({}))
  if (!id || typeof id !== 'string') {
    return NextResponse.json({ error: '삭제할 기록 ID가 필요합니다.' }, { status: 400 })
  }
  const target = (await readProcessChecks()).find((item) => item.id === id)
  if (target && !canOperateFloor(requestUser, target.floor)) {
    return NextResponse.json({ error: '다른 층 점검 기록은 삭제할 수 없습니다.' }, { status: 403 })
  }
  const removed = await deleteProcessCheck(id)
  if (!removed) return NextResponse.json({ error: '기록을 찾을 수 없습니다.' }, { status: 404 })
  await appendAuditLog({
    action: 'DELETE',
    target: 'process-check',
    detail: [
      `${removed.floor ?? '-'}층 · ${removed.product || '공정 점검'}`,
      `${removed.writtenDate} ${removed.writtenTime} · ${removed.author} 기록 삭제`,
    ].join('\n'),
    userId: requestUser.id,
    userName: requestUser.displayName,
  })
  return NextResponse.json({ success: true, data: removed })
}

function answerText(value: ProcessAnswer | undefined) {
  if (value === 'yes') return '예'
  if (value === 'no') return '아니오'
  if (value === '' || value == null) return '미입력'
  return String(value)
}

async function diffCheck(before: ProcessCheckRecord, after: ProcessCheckRecord) {
  const lines: string[] = []
  if (before.writtenDate !== after.writtenDate || before.writtenTime !== after.writtenTime) {
    lines.push(`작성일시: ${before.writtenDate} ${before.writtenTime} → ${after.writtenDate} ${after.writtenTime}`)
  }
  if (before.author !== after.author) lines.push(`작성자: ${before.author} → ${after.author}`)
  const labels = new Map((await fieldsForLine(after.lineId)).map((field) => [field.id, field.label]))
  const changes: string[] = []
  for (const id of new Set([...Object.keys(before.answers), ...Object.keys(after.answers)])) {
    const previous = before.answers[id]
    const next = after.answers[id]
    if (String(previous ?? '') === String(next ?? '')) continue
    changes.push(`${labels.get(id) ?? '항목'}: ${answerText(previous)} → ${answerText(next)}`)
  }
  const shown = changes.slice(0, 4)
  if (shown.length) lines.push(...shown)
  if (changes.length > shown.length) lines.push(`외 ${changes.length - shown.length}항목`)
  if (lines.length === 0) lines.push('저장했지만 바뀐 내용은 없습니다.')
  return lines
}

async function fieldsForLine(lineId: string | undefined): Promise<ProcessFieldSpec[]> {
  const resolved = lineId || 'busbar-mtm'
  const template = (await readProcessTemplates()).find((item) => item.id === resolved)
  if (template) return sectionsOf(template).flatMap((section) => section.fields)
  if (resolved === 'busbar-mtm') return PROCESS_CHECK_FIELDS
  return []
}

function parseAnswers(incoming: unknown, fields: ProcessFieldSpec[]): Record<string, ProcessAnswer> {
  const answers: Record<string, ProcessAnswer> = {}
  const source = incoming && typeof incoming === 'object' ? incoming as Record<string, unknown> : {}
  for (const field of fields) {
    const raw = source[field.id]
    if (raw === '' || raw == null) {
      answers[field.id] = ''
      continue
    }
    if (field.type === 'yesno') {
      answers[field.id] = raw === 'yes' || raw === 'no' ? raw : ''
      continue
    }
    if (field.type === 'choice') {
      const choice = String(raw).trim()
      answers[field.id] = field.options?.includes(choice) ? choice : ''
      continue
    }
    const quantity = Number(raw)
    answers[field.id] = Number.isFinite(quantity) ? quantity : ''
  }
  return answers
}

function parseFloor(value: unknown): ProcessFloor | null {
  const floor = Number(value)
  return floor === 1 || floor === 2 || floor === 3 ? floor : null
}

function parseLineId(value: unknown): string | null {
  const id = String(value || '').trim()
  return id ? id : null
}

function parseHeader(body: Record<string, unknown>) {
  const author = String(body.author || '').trim()
  const writtenDate = String(body.writtenDate || '').trim()
  const writtenTime = String(body.writtenTime || '').trim()
  if (!author || !writtenDate || !writtenTime) {
    return { error: '작성일자, 시간, 작성자는 필수입니다.' as const }
  }
  return { author, writtenDate, writtenTime }
}

export async function POST(req: NextRequest) {
  const requestUser = await getUserFromHeaders(req.headers)
  if (!requestUser || !canEdit(requestUser.role)) {
    return NextResponse.json({ error: '공정 점검 등록 권한이 없습니다.' }, { status: 403 })
  }

  const body = await req.json().catch(() => ({}))
  const header = parseHeader(body)
  if ('error' in header) {
    return NextResponse.json({ error: header.error }, { status: 400 })
  }
  const floor = parseFloor(body.floor)
  const lineId = parseLineId(body.lineId)
  const builtin = PROCESS_LINES.find((item) => item.id === lineId)
  const template = lineId ? (await readProcessTemplates()).find((item) => item.id === lineId) : undefined
  if (!floor || !lineId || (!builtin && !template)) {
    return NextResponse.json({ error: '층과 라인을 선택해주세요.' }, { status: 400 })
  }
  if (template && template.floor !== floor) {
    return NextResponse.json({ error: '이 점검은 다른 층에 있습니다.' }, { status: 400 })
  }
  if (builtin && !builtin.floors.includes(floor)) {
    return NextResponse.json({ error: '이 점검은 다른 층에 있습니다.' }, { status: 400 })
  }
  if (!canOperateFloor(requestUser, floor)) {
    return NextResponse.json({ error: '다른 층 점검은 기록할 수 없습니다.' }, { status: 403 })
  }

  const now = new Date().toISOString()
  const record: ProcessCheckRecord = {
    id: crypto.randomUUID(),
    company: builtin?.company ?? '',
    product: builtin?.product ?? template?.name ?? lineId,
    floor,
    lineId,
    writtenDate: header.writtenDate,
    writtenTime: header.writtenTime,
    author: header.author,
    answers: parseAnswers(body.answers, await fieldsForLine(lineId)),
    createdAt: now,
    createdBy: requestUser.displayName,
    createdById: requestUser.id,
  }

  await appendProcessCheck(record)
  const filled = Object.values(record.answers).filter((value) => value !== '' && value != null).length
  await appendAuditLog({
    action: 'CREATE',
    target: 'process-check',
    detail: [
      `${floor}층 · ${record.product}`,
      `${record.writtenDate} ${record.writtenTime} · ${record.author}`,
      `입력 ${filled}항목`,
    ].join('\n'),
    userId: requestUser.id,
    userName: requestUser.displayName,
  })
  return NextResponse.json({ success: true, data: record })
}

export async function PATCH(req: NextRequest) {
  const requestUser = await getUserFromHeaders(req.headers)
  if (!requestUser || !canEdit(requestUser.role)) {
    return NextResponse.json({ error: '공정 점검 수정 권한이 없습니다.' }, { status: 403 })
  }

  const body = await req.json().catch(() => ({}))
  if (!body.id || typeof body.id !== 'string') {
    return NextResponse.json({ error: '수정할 기록 ID가 필요합니다.' }, { status: 400 })
  }
  const header = parseHeader(body)
  if ('error' in header) {
    return NextResponse.json({ error: header.error }, { status: 400 })
  }

  const existing = (await readProcessChecks()).find((item) => item.id === body.id)
  if (!existing) return NextResponse.json({ error: '기록을 찾을 수 없습니다.' }, { status: 404 })
  if (!canOperateFloor(requestUser, existing.floor)) {
    return NextResponse.json({ error: '다른 층 점검 기록은 수정할 수 없습니다.' }, { status: 403 })
  }

  const updated = await updateProcessCheck(body.id, {
    writtenDate: header.writtenDate,
    writtenTime: header.writtenTime,
    author: header.author,
    answers: parseAnswers(body.answers, await fieldsForLine(existing.lineId)),
    updatedAt: new Date().toISOString(),
    updatedBy: requestUser.displayName,
    updatedById: requestUser.id,
  })
  if (!updated) return NextResponse.json({ error: '기록을 찾을 수 없습니다.' }, { status: 404 })

  await appendAuditLog({
    action: 'UPDATE',
    target: 'process-check',
    detail: [
      `${updated.floor ?? '-'}층 · ${updated.product || '공정 점검'}`,
      ...(await diffCheck(existing, updated)),
    ].join('\n'),
    userId: requestUser.id,
    userName: requestUser.displayName,
  })
  return NextResponse.json({ success: true, data: updated })
}

