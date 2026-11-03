import {
  readAuditLogs,
  readConfig,
  readCustomerNonconformities,
  readFloor3WorkLogs,
  readHiddenProcessLines,
  readInventory,
  readMetadata,
  readProcessChecks,
  readProcessNonconformities,
  readProcessTemplates,
} from './storage'
import { selectAll } from './local-store'
import { getSetting } from './records'
import { applyFloor3WorkLogs, buildLotFlow, buildStockGroups, collectMovements, compactDate } from './stock'
import { getTodayCheckStatuses } from '@/app/actions/today-status'
import { detectFloor } from './floor'
import { isDayOffDate, isWeekend } from './date-utils'
import { recordFloor, recordLineId } from './process-checklist'
import type { WorkflowStatus } from './non-conformity'

export interface MissingCheck {
  kind: '설비' | '5S' | '온습도' | '공정'
  name: string
  floor: string
  href: string
}

export interface FloorCheck {
  floor: string
  done: number
  missing: number
}

export type StatusCounts = Record<WorkflowStatus, number>

function localDate(date = new Date()) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function isoDate(year: number, month: number, day: number) {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function nextDate(date: string) {
  const [year, month, day] = date.split('-').map(Number)
  const next = new Date(year, month - 1, day + 1)
  return isoDate(next.getFullYear(), next.getMonth() + 1, next.getDate())
}

/** 시트별 첫 기록일부터 오늘까지, 점검일인데 값이 없는 날. 하루 1건. */
function countOmitted(
  entries: { sheetId?: number | null; day?: number | null }[],
  sheets: { id?: number | null; year?: number | null; month?: number | null; holidays?: number[]; workdays?: number[] }[],
  targetKey: 'equipmentId' | 'targetId',
  today: string,
  filled: (entry: any) => boolean,
) {
  const byId = new Map(sheets.map((sheet) => [String(sheet.id), sheet]))
  const byMonth = new Map(sheets.map((sheet) => [`${(sheet as any)[targetKey]}:${sheet.year}-${sheet.month}`, sheet]))
  const recorded = new Map<string, Set<string>>()
  for (const entry of entries) {
    if (!filled(entry)) continue
    const sheet = byId.get(String(entry.sheetId))
    const day = Number(entry.day)
    if (!sheet?.year || !sheet.month || !Number.isInteger(day) || day < 1 || day > 31) continue
    const date = isoDate(sheet.year, sheet.month, day)
    if (date > today) continue
    const targetId = String((sheet as any)[targetKey])
    const days = recorded.get(targetId) ?? new Set<string>()
    days.add(date)
    recorded.set(targetId, days)
  }
  let missing = 0
  for (const [targetId, days] of recorded) {
    const first = [...days].sort()[0]
    for (let date = first; date <= today; date = nextDate(date)) {
      const [year, month, day] = date.split('-').map(Number)
      const sheet = byMonth.get(`${targetId}:${year}-${month}`)
      if (isDayOffDate(year, month, day, sheet?.holidays ?? [], sheet?.workdays ?? [])) continue
      if (!days.has(date)) missing += 1
    }
  }
  return missing
}

/** 대상별 첫 기록일부터 오늘까지, 점검해야 하는 날과 실제로 채운 날. */
function coverageByTarget(
  entries: { sheetId?: number | null; day?: number | null }[],
  sheets: { id?: number | null; year?: number | null; month?: number | null; holidays?: number[]; workdays?: number[] }[],
  targetKey: 'equipmentId' | 'targetId',
  today: string,
  filled: (entry: any) => boolean,
) {
  const byId = new Map(sheets.map((sheet) => [String(sheet.id), sheet]))
  const byMonth = new Map(sheets.map((sheet) => [`${(sheet as any)[targetKey]}:${sheet.year}-${sheet.month}`, sheet]))
  const recorded = new Map<string, Set<string>>()
  for (const entry of entries) {
    if (!filled(entry)) continue
    const sheet = byId.get(String(entry.sheetId))
    const day = Number(entry.day)
    if (!sheet?.year || !sheet.month || !Number.isInteger(day) || day < 1 || day > 31) continue
    const date = isoDate(sheet.year, sheet.month, day)
    if (date > today) continue
    const targetId = String((sheet as any)[targetKey])
    const days = recorded.get(targetId) ?? new Set<string>()
    days.add(date)
    recorded.set(targetId, days)
  }
  const coverage = new Map<string, { done: number; due: number }>()
  for (const [targetId, days] of recorded) {
    const first = [...days].sort()[0]
    let done = 0
    let due = 0
    for (let date = first; date <= today; date = nextDate(date)) {
      const [year, month, day] = date.split('-').map(Number)
      const sheet = byMonth.get(`${targetId}:${year}-${month}`)
      if (isDayOffDate(year, month, day, sheet?.holidays ?? [], sheet?.workdays ?? [])) continue
      due += 1
      if (days.has(date)) done += 1
    }
    coverage.set(targetId, { done, due })
  }
  return coverage
}

function countProcessOmitted(checks: { floor?: string | null; writtenDate?: string | null }[], today: string) {
  const recorded = new Map<string, Set<string>>()
  for (const row of checks) {
    if (!row.writtenDate || row.writtenDate > today) continue
    const floor = String(row.floor ?? '')
    const days = recorded.get(floor) ?? new Set<string>()
    days.add(row.writtenDate)
    recorded.set(floor, days)
  }
  let missing = 0
  for (const days of recorded.values()) {
    const first = [...days].sort()[0]
    for (let date = first; date <= today; date = nextDate(date)) {
      const [year, month, day] = date.split('-').map(Number)
      if (isWeekend(year, month, day)) continue
      if (!days.has(date)) missing += 1
    }
  }
  return missing
}

/** 층별 첫 공정 점검일부터 오늘까지, 평일 중 점검이 있는 날. */
function processCoverage(checks: { floor?: string | null; writtenDate?: string | null }[], today: string) {
  const recorded = new Map<string, Set<string>>()
  for (const row of checks) {
    if (!row.writtenDate || row.writtenDate > today) continue
    const floor = String(row.floor ?? '')
    const days = recorded.get(floor) ?? new Set<string>()
    days.add(row.writtenDate)
    recorded.set(floor, days)
  }
  const coverage = new Map<string, { done: number; due: number }>()
  for (const [floor, days] of recorded) {
    const first = [...days].sort()[0]
    let done = 0
    let due = 0
    for (let date = first; date <= today; date = nextDate(date)) {
      const [year, month, day] = date.split('-').map(Number)
      if (isWeekend(year, month, day)) continue
      due += 1
      if (days.has(date)) done += 1
    }
    coverage.set(floor, { done, due })
  }
  return coverage
}

function countStatuses(values: WorkflowStatus[]): StatusCounts {
  const counts: StatusCounts = { done: 0, in_progress: 0, not_started: 0 }
  for (const value of values) counts[value] = (counts[value] ?? 0) + 1
  return counts
}

/** 고객 부적합은 대책·처리결과·유효성 검증이 모두 끝나야 완료 */
function customerNcStatus(row: { countermeasurePlan: WorkflowStatus; processingResult: WorkflowStatus; effectivenessVerification: WorkflowStatus }): WorkflowStatus {
  const steps = [row.countermeasurePlan, row.processingResult, row.effectivenessVerification]
  if (steps.every((s) => s === 'done')) return 'done'
  if (steps.every((s) => s === 'not_started')) return 'not_started'
  return 'in_progress'
}

export async function getDashboardStats() {
  const [
    docs, companies, documentTypes, products, inventory, workLogs,
    customerNc, processNc, processChecks, processTemplates, hiddenLines, auditLogs,
    equipment, dailyItems, photos, dailySheets, dailyEntries, fiveSTargets, fiveSSheets, fiveSEntries, tempTargets, tempSheets, tempEntries,
    today,
  ] = await Promise.all([
    readMetadata(), readConfig('companies'), readConfig('document-types'), readConfig('products'),
    readInventory(), readFloor3WorkLogs(),
    readCustomerNonconformities(), readProcessNonconformities(), readProcessChecks(), readProcessTemplates(),
    readHiddenProcessLines(), readAuditLogs(),
    selectAll<any>('equipment'), selectAll<any>('dailyCheckItems'), selectAll<any>('equipmentPhotos'),
    selectAll<any>('dailyCheckSheets'), selectAll<any>('dailyCheckEntries'),
    selectAll<any>('fiveSTargets'), selectAll<any>('fiveSSheets'), selectAll<any>('fiveSEntries'),
    selectAll<any>('tempHumidityTargets'), selectAll<any>('tempHumiditySheets'), selectAll<any>('tempHumidityEntries'),
    getTodayCheckStatuses(),
  ])
  const auditRows = await getSetting<unknown>('customer-audits', null)
  const customerAudits = (Array.isArray(auditRows) ? auditRows : []) as { kind?: string; count?: number; done?: number }[]
  const auditSummary = {
    qsa: customerAudits.filter((row) => row.kind === 'QSA' || row.kind === 'SQA').length,
    qpa: customerAudits.filter((row) => row.kind === 'QPA' || row.kind === 'SPA').length,
    findings: customerAudits.reduce((sum, row) => sum + (Number(row.count) || 0), 0),
    closed: customerAudits.reduce((sum, row) => sum + (Number(row.done) || 0), 0),
  }

  const todayIso = localDate()
  const todayCompact = todayIso.replace(/-/g, '')
  const todayCount = docs.filter((d) => d.createdAt?.startsWith(todayIso)).length

  const recent = [...docs]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 8)

  // 최근 6개월 문서 등록 건수
  const now = new Date()
  const monthly = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - 5 + i, 1)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    return { key, label: `${d.getMonth() + 1}월`, count: docs.filter((doc) => doc.createdAt?.startsWith(key)).length }
  })

  const docCount = new Map<string, number>()
  for (const d of docs) if (d.company) docCount.set(d.company, (docCount.get(d.company) ?? 0) + 1)
  const docTop = [...docCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([company, count]) => ({ company, count }))

  const byType = (type: string) => docs.filter((d) => d.documentType === type).length
  const certificateDocs = docs.filter((d) => d.documentType === '성적서' && d.storagePath !== 'INVENTORY')
  const certificateMonthly = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - 5 + i, 1)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    return { key, label: `${d.getMonth() + 1}월`, count: certificateDocs.filter((doc) => doc.createdAt?.startsWith(key)).length }
  })
  const recentCertificates = [...certificateDocs]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 5)
    .map((d) => ({ id: d.id, company: d.company, product: d.product, quantity: d.quantity, unit: d.quantityUnit, issueDate: d.issueDate }))

  const movements = collectMovements(docs, inventory)
  const groups = applyFloor3WorkLogs(buildStockGroups(movements), workLogs)
  const inbound = movements.filter((m) => m.kind === '입고')
  const outbound = movements.filter((m) => m.kind === '출고')
  const recentMovement = (rows: typeof inbound) =>
    [...rows]
      .sort((a, b) => compactDate(b.issueDate).localeCompare(compactDate(a.issueDate)))
      .slice(0, 5)
      .map((m) => ({ id: m.id, company: m.company, product: m.product, quantity: m.quantity, unit: m.unit, issueDate: m.issueDate, floor: m.floor }))
  const recentOutbound = recentMovement(outbound)
  const recentInbound = recentMovement(inbound)
  const monthlyOf = (dates: string[]) =>
    Array.from({ length: 6 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - 5 + i, 1)
      const key = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`
      return { key, label: `${d.getMonth() + 1}월`, count: dates.filter((date) => compactDate(date).startsWith(key)).length }
    })
  const weekday = ['일', '월', '화', '수', '목', '금', '토']
  const weekTrend = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6 + i)
    const key = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
    return {
      key,
      label: weekday[d.getDay()],
      full: `${d.getMonth() + 1}월 ${d.getDate()}일 (${weekday[d.getDay()]})`,
      inbound: inbound.filter((m) => compactDate(m.issueDate) === key).length,
      outbound: outbound.filter((m) => compactDate(m.issueDate) === key).length,
    }
  })
  const inboundMonthly = monthlyOf(inbound.map((m) => m.issueDate))
  const outboundMonthly = monthlyOf(outbound.map((m) => m.issueDate))
  const monthTrend = inboundMonthly.map((row, index) => ({
    key: row.key,
    label: row.label,
    full: `${row.key.slice(0, 4)}년 ${row.label}`,
    inbound: row.count,
    outbound: outboundMonthly[index]?.count ?? 0,
  }))
  const flow = buildLotFlow(movements)
  const flowStages = (['waiting', 'working', 'ready', 'done'] as const).map((key) => {
    const rows = flow.lots.filter((lot) => lot.stage === key)
    const shown = key === 'done'
      ? [...rows].sort((a, b) => (b.lastShipDate || b.inbound.issueDate).localeCompare(a.lastShipDate || a.inbound.issueDate)).slice(0, 3)
      : rows.slice(0, 4)
    return {
      key,
      count: rows.length,
      lots: shown.map((lot) => ({
        id: lot.inbound.id,
        company: lot.inbound.company,
        product: lot.inbound.product,
        remaining: lot.remaining,
        unit: lot.inbound.unit,
      })),
    }
  })
  const recentWork = [...workLogs]
    .sort((a, b) => `${b.workDate}${b.updatedAt ?? b.createdAt}`.localeCompare(`${a.workDate}${a.updatedAt ?? a.createdAt}`))
    .slice(0, 5)
    .map((w) => ({
      id: w.id,
      company: w.company,
      product: w.product,
      workDate: w.workDate,
      workQuantity: w.workQuantity,
      defect: w.defectQuantity,
      sample: w.sampleQuantity,
      unit: w.unit,
    }))

  const hidden = new Set(hiddenLines)
  const lines = processTemplates.filter((t) => !hidden.has(t.id))
  const visibleLineIds = new Set(lines.map((line) => line.id))
  const processFloors = [...new Set(lines.map((line) => String(line.floor)))]
  const processCovered = (floor: string) => processChecks.some((row) =>
    row.writtenDate === todayIso && String(recordFloor(row)) === floor && visibleLineIds.has(recordLineId(row)),
  )
  const lastProcessCheck = [...processChecks].sort((a, b) => `${b.writtenDate}${b.writtenTime}`.localeCompare(`${a.writtenDate}${a.writtenTime}`))[0]

  const floorOf = (value: unknown) => String(value ?? '').replace(/층$/, '')
  const missing: MissingCheck[] = [
    ...equipment.filter((e) => today.daily[e.id] === 'missing')
      .map((e) => ({ kind: '설비' as const, name: e.name, floor: floorOf(e.floor), href: `/checksheets/daily/${e.id}` })),
    ...fiveSTargets.filter((t) => today.fiveS[t.id] === 'missing')
      .map((t) => ({ kind: '5S' as const, name: t.name, floor: floorOf(t.floor), href: `/checksheets/5s/${t.id}` })),
    ...tempTargets.filter((t) => today.temp[t.id] === 'missing')
      .map((t) => ({ kind: '온습도' as const, name: t.name, floor: floorOf(t.floor), href: `/checksheets/temp-humidity/${t.id}` })),
    ...processFloors
      .filter((floor) => !today.weekend && !processCovered(floor))
      .map((floor) => ({ kind: '공정' as const, name: '공정 점검', floor, href: `/process-check?floor=${floor}` })),
  ].sort((a, b) => a.floor.localeCompare(b.floor) || a.name.localeCompare(b.name, 'ko'))

  const floorTally = new Map<string, FloorCheck>(['1', '2', '3'].map((floor) => [floor, { floor, done: 0, missing: 0 }]))
  const countFloor = (floor: unknown, status: string | undefined) => {
    if (status !== 'done' && status !== 'missing') return
    const key = floorOf(floor) || '?'
    const row = floorTally.get(key) ?? { floor: key, done: 0, missing: 0 }
    row[status] += 1
    floorTally.set(key, row)
  }
  for (const item of equipment) countFloor(item.floor, today.daily[item.id])
  for (const item of fiveSTargets) countFloor(item.floor, today.fiveS[item.id])
  for (const item of tempTargets) countFloor(item.floor, today.temp[item.id])
  for (const floor of processFloors) {
    countFloor(floor, today.weekend ? 'off' : processCovered(floor) ? 'done' : 'missing')
  }
  const floorChecks = [...floorTally.values()]

  const progressOf = (items: { id: number; floor?: unknown; name?: string }[], statuses: Record<number, string>, floor?: string) => {
    const list = floor ? items.filter((item) => detectFloor(String(item.floor ?? ''), item.name) === floor) : items
    const values = list.map((item) => statuses[item.id]).filter((status): status is string => !!status)
    return { done: values.filter((s) => s === 'done').length, due: values.filter((s) => s !== 'off').length }
  }
  const processProgress = (floor?: string) => {
    const list = floor ? processFloors.filter((item) => item === floor) : processFloors
    return {
      done: list.filter((item) => processCovered(item)).length,
      due: today.weekend ? 0 : list.length,
    }
  }
  const progressOfKinds = (floor?: string) => [
    { kind: '설비 일상점검', ...progressOf(equipment, today.daily, floor) },
    { kind: '3정 5S', ...progressOf(fiveSTargets, today.fiveS, floor) },
    { kind: '온 · 습도', ...progressOf(tempTargets, today.temp, floor) },
    { kind: '공정 점검', ...processProgress(floor) },
  ]
  const progress = progressOfKinds()
  const floorProgress = Object.fromEntries(['1', '2', '3'].map((floor) => [floor, progressOfKinds(floor)])) as Record<string, typeof progress>

  const customerNcStatuses = countStatuses(customerNc.map(customerNcStatus))
  const processNcStatuses = countStatuses(processNc.map((n) => n.processingResult))
  const openNc = customerNcStatuses.in_progress + customerNcStatuses.not_started + processNcStatuses.in_progress + processNcStatuses.not_started

  const monthKey = todayCompact.slice(0, 6)
  const monthOut = new Map<string, number>()
  for (const m of outbound) {
    if (compactDate(m.issueDate).startsWith(monthKey)) monthOut.set(m.company, (monthOut.get(m.company) ?? 0) + 1)
  }
  const topCustomers = [...monthOut.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([company, count]) => ({ company, count }))
  const monthOutTotal = [...monthOut.values()].reduce((a, b) => a + b, 0)

  const recentLogs = [...auditLogs]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 6)

  const firstLog = auditLogs.reduce<string | null>((min, l) => (!min || l.createdAt < min ? l.createdAt : min), null)
  const hasMark = (entry: { value?: string | null }) => Boolean(String(entry.value ?? '').trim())
  const hasReading = (entry: { temperature?: string | null; humidity?: string | null }) =>
    Boolean(String(entry.temperature ?? '').trim() || String(entry.humidity ?? '').trim())
  const dailyOmitted = countOmitted(dailyEntries, dailySheets, 'equipmentId', todayIso, hasMark)
  const fiveSOmitted = countOmitted(fiveSEntries, fiveSSheets, 'targetId', todayIso, hasMark)
  const tempOmitted = countOmitted(tempEntries, tempSheets, 'targetId', todayIso, hasReading)
  const processOmitted = countProcessOmitted(
    processChecks
      .filter((row) => visibleLineIds.has(recordLineId(row)))
      .map((row) => ({ floor: String(recordFloor(row)), writtenDate: row.writtenDate })),
    todayIso,
  )
  const dailyCoverage = coverageByTarget(dailyEntries, dailySheets, 'equipmentId', todayIso, hasMark)
  const fiveCoverage = coverageByTarget(fiveSEntries, fiveSSheets, 'targetId', todayIso, hasMark)
  const tempCoverage = coverageByTarget(tempEntries, tempSheets, 'targetId', todayIso, hasReading)
  const processSpan = processCoverage(
    processChecks
      .filter((row) => visibleLineIds.has(recordLineId(row)))
      .map((row) => ({ floor: String(recordFloor(row)), writtenDate: row.writtenDate })),
    todayIso,
  )
  const spanFloors = new Map<string, { done: number; due: number }>(['1', '2', '3'].map((floor) => [floor, { done: 0, due: 0 }]))
  const addSpan = (floor: string, part?: { done: number; due: number }) => {
    const row = spanFloors.get(floor)
    if (!row || !part) return
    row.done += part.done
    row.due += part.due
  }
  for (const item of equipment) addSpan(detectFloor(String(item.floor ?? ''), item.name), dailyCoverage.get(String(item.id)))
  for (const item of fiveSTargets) addSpan(detectFloor(String(item.floor ?? ''), item.name), fiveCoverage.get(String(item.id)))
  for (const item of tempTargets) addSpan(detectFloor(String(item.floor ?? ''), item.name), tempCoverage.get(String(item.id)))
  for (const floor of ['1', '2', '3']) addSpan(floor, processSpan.get(floor))
  const spanRows = [...spanFloors.entries()].map(([floor, row]) => ({
    floor,
    done: row.done,
    due: row.due,
    rate: row.due > 0 ? Math.round((row.done / row.due) * 100) : null,
  }))
  const spanDone = spanRows.reduce((sum, row) => sum + row.done, 0)
  const spanDue = spanRows.reduce((sum, row) => sum + row.due, 0)
  const span = {
    done: spanDone,
    due: spanDue,
    rate: spanDue > 0 ? Math.round((spanDone / spanDue) * 100) : 0,
    floors: spanRows,
  }

  const processDays = new Set(
    processChecks
      .filter((row) => row.writtenDate && row.writtenDate <= todayIso)
      .map((row) => `${row.lineId ?? ''}:${row.writtenDate}`),
  ).size

  return {
    totalDocuments: docs.length,
    todayUploads: todayCount,
    companyCount: companies.length,
    documentTypeCount: documentTypes.length,
    recentDocuments: recent,

    today: { date: todayIso, weekend: today.weekend, missing, progress, floorProgress, floors: floorChecks },
    customer: {
      companies: companies.length,
      products: products.length,
      certificates: byType('성적서'),
      drawings: byType('도면'),
      docTop,
      monthly,
      nc: customerNcStatuses,
      ncTotal: customerNc.length,
      audits: auditSummary,
      recentOutbound,
      topCustomers,
      monthOutTotal,
      monthCompanies: monthOut.size,
    },
    quality: {
      daily: dailyOmitted,
      fiveS: fiveSOmitted,
      temp: tempOmitted,
      totalChecks: dailyOmitted + fiveSOmitted + tempOmitted,
      customerNc: customerNcStatuses,
      processNc: processNcStatuses,
      openNc,
      certificateMonthly,
      recentCertificates,
      monthCertificates: certificateMonthly[certificateMonthly.length - 1]?.count ?? 0,
      todayCertificates: certificateDocs.filter((d) => d.createdAt?.startsWith(todayIso)).length,
    },
    process: {
      inbound: inbound.length,
      outbound: outbound.length,
      todayIn: inbound.filter((m) => compactDate(m.issueDate) === todayCompact).length,
      todayOut: outbound.filter((m) => compactDate(m.issueDate) === todayCompact).length,
      stockItems: groups.length,
      stockPositive: groups.filter((g) => g.stock > 0).length,
      stockZero: groups.filter((g) => g.stock === 0).length,
      shortage: groups.filter((g) => g.stock < 0).length,
      lines: lines.map((t) => ({ id: t.id, floor: t.floor, name: t.name, records: processChecks.filter((c) => c.lineId === t.id).length })),
      checkRecords: processDays,
      span,
      omitted: processOmitted,
      lastCheck: lastProcessCheck ? `${lastProcessCheck.writtenDate}` : null,
      workLogs: workLogs.length,
      views: {
        flow: { stages: flowStages, unregistered: flow.unregistered.length, open: flow.lots.filter((lot) => lot.stage !== 'done').length },
        inbound: { recent: recentInbound, monthly: inboundMonthly },
        outbound: { recent: recentOutbound, monthly: outboundMonthly },
        trend: { week: weekTrend, month: monthTrend },
        work: { recent: recentWork, monthly: monthlyOf(workLogs.map((w) => w.workDate)) },
      },
    },
    equipment: {
      equipment: equipment.length,
      checkItems: dailyItems.length,
      photos: photos.length,
      fiveSTargets: fiveSTargets.length,
      tempTargets: tempTargets.length,
      dailyRecords: dailyEntries.length,
    },
    audit: { count: auditLogs.length, since: firstLog, recent: recentLogs },
  }
}

export type DashboardStats = Awaited<ReturnType<typeof getDashboardStats>>
