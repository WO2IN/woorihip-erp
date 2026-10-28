import { NextRequest, NextResponse } from 'next/server'
import { canEdit, getUserFromHeaders } from '@/lib/auth'
import { getSetting, setSetting } from '@/lib/records'

export type PlatingInfo = {
  company: string
  product: string
  gold: string
  nickel: string
  material: string
}

function parseCsvLine(line: string) {
  const values: string[] = []
  let value = ''
  let quoted = false

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index]
    const next = line[index + 1]

    if (character === '"' && quoted && next === '"') {
      value += '"'
      index += 1
    } else if (character === '"') {
      quoted = !quoted
    } else if (character === ',' && !quoted) {
      values.push(value.trim())
      value = ''
    } else {
      value += character
    }
  }

  values.push(value.trim())
  return values
}

function escapeCsv(value: string) {
  return /[\",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
}

function validateRows(rows: unknown): PlatingInfo[] {
  if (!Array.isArray(rows)) throw new Error('데이터 형식이 올바르지 않습니다.')
  const seen = new Set<string>()
  return rows.map((row) => {
    if (!row || typeof row !== 'object') throw new Error('행 형식이 올바르지 않습니다.')
    const item = row as Record<string, unknown>
    const normalized = {
      company: String(item.company ?? '').trim(),
      product: String(item.product ?? '').trim(),
      gold: String(item.gold ?? '').trim(),
      nickel: String(item.nickel ?? '').trim(),
      material: String(item.material ?? '').trim(),
    }
    if (!normalized.company || !normalized.product) throw new Error('업체명과 품목은 필수입니다.')
    const key = [normalized.company, normalized.product, normalized.material, normalized.gold, normalized.nickel].join('\u0000')
    if (seen.has(key)) throw new Error(`동일한 도금 정보가 중복됩니다: ${normalized.company} / ${normalized.product} / ${normalized.material}`)
    seen.add(key)
    return normalized
  })
}

async function writePlatingInfo(rows: PlatingInfo[]) {
  const csv = [
    '업체명,품목,재질,금도금,니켈도금',
    ...rows.map(row => [row.company, row.product, row.material, row.gold, row.nickel].map(escapeCsv).join(',')),
  ].join('\n') + '\n'
  await setSetting('platingInfoCsv', csv)
}

async function readPlatingInfo(): Promise<PlatingInfo[]> {
  const content = await getSetting<string>('platingInfoCsv', '')

  return content
    .split(/\r?\n/)
    .slice(1)
    .filter(Boolean)
    .map(parseCsvLine)
    .filter(row => row.length >= 5 && row[0] && row[1])
    .map(row => ({
      company: row[0],
      product: row[1],
      material: row[2],
      gold: row[3],
      nickel: row[4],
    }))
}

export async function PUT(request: NextRequest) {
  const requestUser = await getUserFromHeaders(request.headers)
  if (!requestUser || !canEdit(requestUser.role)) {
    return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 })
  }
  try {
    const rows = validateRows(await request.json())
    await writePlatingInfo(rows)
    return NextResponse.json({ rows })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'CSV 저장에 실패했습니다.'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}

export async function GET(request: NextRequest) {
  if (!await getUserFromHeaders(request.headers)) {
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })
  }
  try {
    const searchParams = new URL(request.url).searchParams
    const company = searchParams.get('company')?.trim()
    const product = searchParams.get('product')?.trim()

    if (!company || !product) {
      const rows = (await readPlatingInfo()).map(item => ({
        ...item,
        specification: [item.gold, item.nickel].filter(Boolean).join(' / '),
      }))
      return NextResponse.json({ rows })
    }

    const matches = (await readPlatingInfo()).filter(
      item => item.company === company && item.product === product
    )

    const formattedMatches = matches.map(item => ({
      material: item.material,
      specification: [item.gold, item.nickel].filter(Boolean).join(' / '),
    }))

    return NextResponse.json({
      matches: formattedMatches,
      match: formattedMatches[0] ?? null,
    })
  } catch (error) {
    console.error('[v0] 도금 정보 CSV 조회 실패:', error)
    return NextResponse.json({ matches: [], error: '도금 정보를 불러오지 못했습니다.' }, { status: 500 })
  }
}
