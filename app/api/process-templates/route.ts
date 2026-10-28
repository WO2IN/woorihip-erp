import { NextRequest, NextResponse } from 'next/server'
import { appendAuditLog, deleteProcessChecksForLine, hideProcessLine, readHiddenProcessLines, readProcessTemplates, writeProcessTemplates } from '@/lib/storage'
import { canEdit, getUserFromHeaders } from '@/lib/auth'
import {
  PROCESS_LINES,
  ProcessFieldSpec,
  ProcessFloor,
  ProcessTemplate,
  ProcessTemplateSection,
  parseChoiceOptions,
  sectionsOf,
} from '@/lib/process-checklist'

function parseFloor(value: unknown): ProcessFloor | null {
  const floor = Number(value)
  return floor === 1 || floor === 2 || floor === 3 ? floor : null
}

function canUseFloor(role: string, userFloor: ProcessFloor | undefined, floor: ProcessFloor) {
  return role === 'admin' || userFloor == null || userFloor === floor
}

function parseField(raw: unknown, no: number): ProcessFieldSpec | { error: string } {
  if (!raw || typeof raw !== 'object') return { error: '점검 항목이 올바르지 않습니다.' }
  const source = raw as Record<string, unknown>
  const label = String(source.label || '').trim()
  if (!label) return { error: '항목 이름을 입력해주세요.' }
  const type =
    source.type === 'number' ? 'number'
      : source.type === 'choice' ? 'choice'
        : source.type === 'yesno' ? 'yesno'
          : null
  if (!type) return { error: '항목 종류는 Yes/No, 단일 선택, 범위 수치 중 하나입니다.' }
  const unit = type === 'number' ? String(source.unit || '').trim() : ''
  const min = type === 'number' ? Number(source.min) : undefined
  const max = type === 'number' ? Number(source.max) : undefined
  const target = type === 'number' && source.target != null && source.target !== '' ? Number(source.target) : undefined
  if (type === 'number' && (!Number.isFinite(min) || !Number.isFinite(max) || min! > max!)) {
    return { error: `${label} 항목의 기준과 −/+ 허용을 입력해주세요.` }
  }
  if (type === 'number' && target != null && (!Number.isFinite(target) || target < min! || target > max!)) {
    return { error: `${label} 항목의 기준이 허용 범위 밖입니다.` }
  }
  if (type === 'choice') {
    const options = Array.isArray(source.options)
      ? source.options.map((item) => String(item).trim()).filter(Boolean)
      : parseChoiceOptions(String(source.optionsText || ''))
    const unique = [...new Set(options)]
    if (unique.length < 2) {
      return { error: `${label} 항목의 선택지를 2개 이상 입력해주세요. (쉼표로 구분)` }
    }
    return {
      id: typeof source.id === 'string' && source.id.trim() ? source.id.trim() : crypto.randomUUID(),
      no,
      label,
      type: 'choice',
      options: unique,
    }
  }
  return {
    id: typeof source.id === 'string' && source.id.trim() ? source.id.trim() : crypto.randomUUID(),
    no,
    label,
    type,
    ...(unit ? { unit } : {}),
    ...(type === 'number' ? { min, max, ...(target != null ? { target } : {}) } : {}),
  }
}

function fieldSummary(field: ProcessFieldSpec) {
  if (field.type === 'number' && field.min != null && field.max != null) {
    return `${field.label} ${field.min}~${field.max}${field.unit ?? ''}`
  }
  if (field.type === 'choice' && field.options?.length) return `${field.label}(${field.options.join('/')})`
  return field.label
}

function listSummary(fields: ProcessFieldSpec[]) {
  if (fields.length === 0) return '없음'
  const shown = fields.slice(0, 4).map(fieldSummary)
  const extra = fields.length - shown.length
  return extra > 0 ? `${shown.join(', ')} 외 ${extra}개` : shown.join(', ')
}

function templateLog(template: Pick<ProcessTemplate, 'floor' | 'name'>, lines: string[]) {
  return [`${template.floor}층 · ${template.name}`, ...lines].join('\n')
}

function diffTemplate(before: ProcessTemplate, after: ProcessTemplate) {
  const lines: string[] = []
  if (before.name !== after.name) lines.push(`이름: ${before.name} → ${after.name}`)
  const beforeSections = sectionsOf(before)
  const afterSections = sectionsOf(after)
  const beforeSectionMap = new Map(beforeSections.map((section) => [section.id, section]))
  const afterSectionMap = new Map(afterSections.map((section) => [section.id, section]))
  const addedSections = afterSections.filter((section) => !beforeSectionMap.has(section.id))
  const removedSections = beforeSections.filter((section) => !afterSectionMap.has(section.id))
  if (addedSections.length) lines.push(`큰 항목 추가: ${addedSections.map((section) => section.title).join(', ')}`)
  if (removedSections.length) lines.push(`큰 항목 삭제: ${removedSections.map((section) => section.title).join(', ')}`)
  for (const section of afterSections) {
    const previous = beforeSectionMap.get(section.id)
    if (previous && previous.title !== section.title) lines.push(`큰 항목 이름: ${previous.title} → ${section.title}`)
  }
  const beforeFields = new Map(before.items.map((field) => [field.id, field]))
  const added = after.items.filter((field) => !beforeFields.has(field.id))
  const removed = before.items.filter((field) => !after.items.some((item) => item.id === field.id))
  const changed = after.items.flatMap((field) => {
    const previous = beforeFields.get(field.id)
    if (!previous) return []
    const previousText = fieldSummary(previous)
    const nextText = fieldSummary(field)
    return previousText === nextText ? [] : [`${previous.label} → ${nextText}`]
  })
  if (added.length) lines.push(`항목 추가: ${listSummary(added)}`)
  if (removed.length) lines.push(`항목 삭제: ${listSummary(removed)}`)
  if (changed.length) {
    const shown = changed.slice(0, 3)
    const extra = changed.length - shown.length
    lines.push(`항목 변경: ${shown.join(', ')}${extra > 0 ? ` 외 ${extra}개` : ''}`)
  }
  if (lines.length === 0) lines.push('저장했지만 바뀐 내용은 없습니다.')
  return lines
}

function createdTemplateLines(template: ProcessTemplate) {
  const sections = sectionsOf(template)
  const lines = [`항목 ${template.items.length}개: ${listSummary(template.items)}`]
  if (sections.length > 1) lines.unshift(`큰 항목: ${sections.map((section) => section.title).join(', ')}`)
  return lines
}

function parseSections(incoming: unknown): { sections: ProcessTemplateSection[]; items: ProcessFieldSpec[] } | { error: string } {
  if (!Array.isArray(incoming) || incoming.length === 0) {
    return { error: '큰 항목을 하나 이상 입력해주세요.' }
  }
  const sections: ProcessTemplateSection[] = []
  const items: ProcessFieldSpec[] = []
  for (const raw of incoming) {
    if (!raw || typeof raw !== 'object') return { error: '큰 항목이 올바르지 않습니다.' }
    const source = raw as Record<string, unknown>
    const title = String(source.title || '').trim()
    if (!title) return { error: '큰 항목 이름을 입력해주세요.' }
    if (!Array.isArray(source.fields) || source.fields.length === 0) {
      return { error: `${title}에 점검 항목을 하나 이상 넣어주세요.` }
    }
    const fields: ProcessFieldSpec[] = []
    for (const fieldRaw of source.fields) {
      const field = parseField(fieldRaw, items.length + 1)
      if ('error' in field) return field
      fields.push(field)
      items.push(field)
    }
    sections.push({
      id: typeof source.id === 'string' && source.id.trim() ? source.id.trim() : crypto.randomUUID(),
      title,
      fields,
    })
  }
  return { sections, items }
}

export async function GET() {
  return NextResponse.json({ data: await readProcessTemplates(), hidden: await readHiddenProcessLines() })
}

export async function POST(req: NextRequest) {
  const requestUser = await getUserFromHeaders(req.headers)
  if (!requestUser || !canEdit(requestUser.role)) {
    return NextResponse.json({ error: '점검 추가 권한이 없습니다.' }, { status: 403 })
  }
  const body = await req.json().catch(() => ({}))
  const floor = parseFloor(body.floor)
  const name = String(body.name || '').trim()
  if (!floor) return NextResponse.json({ error: '층을 선택해주세요.' }, { status: 400 })
  if (!canUseFloor(requestUser.role, requestUser.floor, floor)) {
    return NextResponse.json({ error: '이 층에는 점검을 추가할 수 없습니다.' }, { status: 403 })
  }
  if (!name) return NextResponse.json({ error: '점검 이름을 입력해주세요.' }, { status: 400 })
  const parsed = parseSections(body.sections ?? [{ id: 'items', title: name, fields: body.items }])
  if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 })

  const template: ProcessTemplate = {
    id: crypto.randomUUID(),
    floor,
    name,
    sections: parsed.sections,
    items: parsed.items,
    createdAt: new Date().toISOString(),
    createdBy: requestUser.displayName,
    createdById: requestUser.id,
  }
  const all = await readProcessTemplates()
  all.unshift(template)
  await writeProcessTemplates(all)
  await appendAuditLog({
    action: 'CREATE',
    target: 'process-template',
    detail: templateLog(template, createdTemplateLines(template)),
    userId: requestUser.id,
    userName: requestUser.displayName,
  })
  return NextResponse.json({ success: true, data: template })
}

export async function PATCH(req: NextRequest) {
  const requestUser = await getUserFromHeaders(req.headers)
  if (!requestUser || !canEdit(requestUser.role)) {
    return NextResponse.json({ error: '점검 수정 권한이 없습니다.' }, { status: 403 })
  }
  const body = await req.json().catch(() => ({}))
  const id = String(body.id || '')
  const all = await readProcessTemplates()
  const index = all.findIndex((item) => item.id === id)
  if (index === -1) return NextResponse.json({ error: '점검을 찾을 수 없습니다.' }, { status: 404 })
  if (!canUseFloor(requestUser.role, requestUser.floor, all[index].floor)) {
    return NextResponse.json({ error: '이 층 점검은 수정할 수 없습니다.' }, { status: 403 })
  }
  const previous = all[index]
  const name = body.name != null ? String(body.name).trim() : previous.name
  if (!name) return NextResponse.json({ error: '점검 이름을 입력해주세요.' }, { status: 400 })
  const parsed = body.sections == null && body.items == null
    ? { sections: previous.sections, items: previous.items }
    : parseSections(body.sections ?? [{ id: 'items', title: name, fields: body.items }])
  if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 })
  all[index] = { ...all[index], name, sections: parsed.sections, items: parsed.items }
  await writeProcessTemplates(all)
  await appendAuditLog({
    action: 'UPDATE',
    target: 'process-template',
    detail: templateLog(all[index], diffTemplate(previous, all[index])),
    userId: requestUser.id,
    userName: requestUser.displayName,
  })
  return NextResponse.json({ success: true, data: all[index] })
}

export async function DELETE(req: NextRequest) {
  const requestUser = await getUserFromHeaders(req.headers)
  if (!requestUser || !canEdit(requestUser.role)) {
    return NextResponse.json({ error: '점검 삭제 권한이 없습니다.' }, { status: 403 })
  }
  const body = await req.json().catch(() => ({}))
  const id = String(body.id || '')
  const builtin = PROCESS_LINES.find((item) => item.id === id)
  if (builtin) {
    if (!builtin.floors.some((floor) => canUseFloor(requestUser.role, requestUser.floor, floor))) {
      return NextResponse.json({ error: '이 층 점검은 삭제할 수 없습니다.' }, { status: 403 })
    }
    await hideProcessLine(id)
    await deleteProcessChecksForLine(id)
    await appendAuditLog({
      action: 'DELETE',
      target: 'process-template',
      detail: `${builtin.floors.join(',')}층 · ${builtin.product}\n기본 공정 점검표를 삭제했습니다.`,
      userId: requestUser.id,
      userName: requestUser.displayName,
    })
    return NextResponse.json({ success: true, data: { id } })
  }
  const all = await readProcessTemplates()
  const index = all.findIndex((item) => item.id === id)
  if (index === -1) return NextResponse.json({ error: '점검을 찾을 수 없습니다.' }, { status: 404 })
  if (!canUseFloor(requestUser.role, requestUser.floor, all[index].floor)) {
    return NextResponse.json({ error: '이 층 점검은 삭제할 수 없습니다.' }, { status: 403 })
  }
  const [removed] = all.splice(index, 1)
  await writeProcessTemplates(all)
  await deleteProcessChecksForLine(id)
  await appendAuditLog({
    action: 'DELETE',
    target: 'process-template',
    detail: templateLog(removed, [`삭제한 항목: ${listSummary(removed.items)}`]),
    userId: requestUser.id,
    userName: requestUser.displayName,
  })
  return NextResponse.json({ success: true, data: removed })
}
