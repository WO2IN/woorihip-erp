import { NextRequest, NextResponse } from 'next/server'
import { canManageQualityRecords, getUserFromHeaders } from '@/lib/auth'
import { appendAuditLog, readConfig, readCustomerNonconformities, readInventory, readMetadata } from '@/lib/storage'
import { getSetting, setSetting } from '@/lib/records'
import { DEFAULT_TARGET, KPI_KINDS, kpiKind, lotsFromCertificates, lotsFromCustomerNonconformities, normalizeState, type KpiState } from '@/lib/incoming-kpi'
import type { UserRole } from '@/lib/types'

export async function GET(request: NextRequest) {
  const kind = kpiKind(new URL(request.url).searchParams.get('kind'))
  const spec = KPI_KINDS[kind]
  const [saved, catalog] = await Promise.all([getSetting<unknown>(spec.key, null), loadCatalog()])
  const state = normalizeState(saved)
  if (kind === 'outgoing' || kind === 'customer') {
    const base = state ?? { target: DEFAULT_TARGET, monthTargets: {}, closed: [], lots: [] }
    const lots = kind === 'outgoing' ? await loadCertificateLots() : await loadCustomerLots()
    return NextResponse.json({ data: { ...base, lots }, catalog, derived: true })
  }
  const blank = state && state.lots.length === 0 && state.closed.length === 0 && Object.keys(state.monthTargets).length === 0 && state.target === DEFAULT_TARGET
  return NextResponse.json({ data: blank ? null : state, catalog })
}

async function loadCertificateLots() {
  return lotsFromCertificates(await readMetadata())
}

async function loadCustomerLots() {
  return lotsFromCustomerNonconformities(await readCustomerNonconformities())
}

async function loadCatalog() {
  const [companies, csv, docs, inventory] = await Promise.all([
    readConfig('companies'),
    getSetting<string>('platingInfoCsv', ''),
    readMetadata(),
    readInventory(),
  ])
  const products = new Map<string, Set<string>>()
  const add = (company: unknown, product: unknown) => {
    const name = typeof company === 'string' ? company.trim() : ''
    const item = typeof product === 'string' ? product.trim() : ''
    if (!name || !item || item === '-') return
    const list = products.get(name) ?? new Set<string>()
    list.add(item)
    products.set(name, list)
  }
  for (const line of csv.split(/\r?\n/).slice(1)) {
    const cells = splitCsv(line)
    if (cells.length >= 2) add(cells[0], cells[1])
  }
  for (const doc of docs) add(doc.company, doc.product)
  for (const row of inventory) add(row.company, row.product)

  const names = [...new Set(companies.map((name) => name.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ko'))
  const productsByCompany: Record<string, string[]> = {}
  for (const name of names) productsByCompany[name] = [...(products.get(name) ?? [])].sort((a, b) => a.localeCompare(b, 'ko'))
  return { companies: names, productsByCompany }
}

function splitCsv(line: string) {
  const values: string[] = []
  let value = ''
  let quoted = false
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index]
    if (character === '"' && quoted && line[index + 1] === '"') {
      value += '"'
      index += 1
    } else if (character === '"') quoted = !quoted
    else if (character === ',' && !quoted) {
      values.push(value.trim())
      value = ''
    } else value += character
  }
  values.push(value.trim())
  return values
}

export async function PUT(request: NextRequest) {
  const user = await getUserFromHeaders(request.headers)
  const role = user?.role as UserRole | undefined
  if (!user || !role || !canManageQualityRecords(role)) {
    return NextResponse.json({ error: '관리자만 수정할 수 있습니다.' }, { status: 403 })
  }

  const body = await request.json().catch(() => null)
  const kind = kpiKind(body?.kind)
  const spec = KPI_KINDS[kind]
  const next = normalizeState(body?.state)
  if (!next) {
    return NextResponse.json({ error: '검사 일자와 업체명은 꼭 입력해야 합니다.' }, { status: 400 })
  }

  const previous = normalizeState(await getSetting<unknown>(spec.key, null))
  const locked = new Set(previous?.closed ?? [])
  if (locked.size > 0 && previous) {
    const before = lotMap(previous)
    const after = lotMap(next)
    const touched = new Set<string>()
    for (const [id, lot] of after) {
      const old = before.get(id)
      if (!old) {
        touched.add(lot.date.slice(0, 7))
        continue
      }
      if (old.date.slice(0, 7) !== lot.date.slice(0, 7)) {
        touched.add(old.date.slice(0, 7))
        touched.add(lot.date.slice(0, 7))
        continue
      }
      if (!sameInspection(old, lot)) touched.add(lot.date.slice(0, 7))
    }
    for (const [id, lot] of before) if (!after.has(id)) touched.add(lot.date.slice(0, 7))
    const blocked = [...touched].filter((key) => locked.has(key) && next.closed.includes(key))
    if (blocked.length > 0) {
      return NextResponse.json({ error: `${blocked[0].replace('-', '년 ')}월은 마감되어 수정할 수 없습니다.` }, { status: 409 })
    }
  }

  if (kind === 'outgoing' || kind === 'customer') next.lots = []
  await setSetting(spec.key, next)
  await appendAuditLog({
    action: 'UPDATE',
    target: spec.key,
    detail: typeof body.detail === 'string' && body.detail ? body.detail.slice(0, 200) : `${spec.name} KPI 수정`,
    userId: user.id,
    userName: user.displayName,
  })
  const data = kind === 'outgoing'
    ? { ...next, lots: await loadCertificateLots() }
    : kind === 'customer'
      ? { ...next, lots: await loadCustomerLots() }
      : next
  return NextResponse.json({ data, derived: kind === 'outgoing' || kind === 'customer' })
}

function lotMap(state: KpiState) {
  return new Map(state.lots.map((lot) => [lot.id, lot]))
}

/** 마감된 달에도 SCAR 상태와 조치 기한은 바꿀 수 있다. */
function sameInspection(a: KpiState['lots'][number], b: KpiState['lots'][number]) {
  return a.id === b.id && a.date === b.date && a.vendor === b.vendor && a.product === b.product
    && a.floor === b.floor && a.quantity === b.quantity && a.result === b.result && a.defect === b.defect && a.note === b.note
}

export const dynamic = 'force-dynamic'
