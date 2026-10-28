import { NextRequest, NextResponse } from 'next/server'
import { readConfig, writeConfig, appendAuditLog } from '@/lib/storage'
import { canEdit, getUserFromHeaders } from '@/lib/auth'
import { readMetadata } from '@/lib/storage'

const VALID_CONFIGS = ['companies', 'document-types', 'materials', 'specifications', 'products', 'shipment-categories']
const CONFIG_ALIASES: Record<string, string> = {
  'shipment-category': 'shipment-categories',
}

function normalizeConfigName(name: unknown) {
  const value = typeof name === 'string' ? name.trim() : ''
  return CONFIG_ALIASES[value] ?? value
}

const CONFIG_FIELD_MAP: Record<string, keyof import('@/lib/types').DocumentMetadata> = {
  companies: 'company',
  'document-types': 'documentType',
  materials: 'material',
  specifications: 'specification',
  products: 'product',
  'shipment-categories': 'shipmentCategory',
}

function normalizeConfigEntry(value: string): string {
  return value.trim()
}

/** 문서 메타에 실제로 쓰인 값만 사용 중으로 본다 (-, 빈값 제외) */
function isConfigValueInUse(
  metadata: import('@/lib/types').DocumentMetadata[],
  field: keyof import('@/lib/types').DocumentMetadata,
  rawValue: string,
): boolean {
  const target = normalizeConfigEntry(rawValue)
  if (!target) return false
  return metadata.some((doc) => {
    const raw = doc[field]
    if (typeof raw !== 'string') return false
    const entry = normalizeConfigEntry(raw)
    if (!entry || entry === '-') return false
    return entry === target
  })
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const name = normalizeConfigName(searchParams.get('name'))
  if (!name || !VALID_CONFIGS.includes(name)) {
    return NextResponse.json({ error: '유효하지 않은 설정 파일입니다.' }, { status: 400 })
  }
  const data = await readConfig(name)
  return NextResponse.json({ data })
}

export async function POST(req: NextRequest) {
  const user = await getUserFromHeaders(req.headers)
  if (!user || !canEdit(user.role)) {
    return NextResponse.json(
      { error: '권한이 없습니다.' },
      { status: 403 }
    )
  }
  const body = await req.json()
  const name = normalizeConfigName(body.name)
  const { value } = body

  if (!name || !VALID_CONFIGS.includes(name) || !value?.trim()) {
    return NextResponse.json(
      { error: '유효하지 않은 요청입니다.' },
      { status: 400 }
    )
  }

  const data = await readConfig(name)
  const trimmed = value.trim()

  // 기존 값 제거 후 맨 앞으로 이동
  const updated = [
    trimmed,
    ...data.filter(v => v !== trimmed),
  ]

  await writeConfig(name, updated)
  await appendAuditLog({ action: 'CREATE', target: 'config', detail: `${name}: ${trimmed}`, userId: user.id, userName: user.displayName })

  return NextResponse.json({ data: updated })
}

export async function DELETE(req: NextRequest) {
  const user = await getUserFromHeaders(req.headers)
  if (!user || !canEdit(user.role)) {
    return NextResponse.json(
      { error: '권한이 없습니다.' },
      { status: 403 }
    )
  }
  const body = await req.json()
  const name = normalizeConfigName(body.name)
  const { value: rawValue, force } = body
  const value = typeof rawValue === 'string' ? normalizeConfigEntry(rawValue) : ''
  if (!name || !VALID_CONFIGS.includes(name) || !value) {
    return NextResponse.json({ error: '유효하지 않은 요청입니다.' }, { status: 400 })
  }

  const metadata = await readMetadata()
  const field = CONFIG_FIELD_MAP[name]
  if (field && isConfigValueInUse(metadata, field, value) && !force) {
    return NextResponse.json(
      {
        error: '등록된 문서에서 사용 중입니다.',
        used: true,
      },
      { status: 409 },
    )
  }

  const data = await readConfig(name)
  const updated = data.filter((v) => normalizeConfigEntry(v) !== value)
  await writeConfig(name, updated)
  await appendAuditLog({ action: 'DELETE', target: 'config', detail: `${name}: ${value}`, userId: user.id, userName: user.displayName })
  return NextResponse.json({ data: updated })
}
