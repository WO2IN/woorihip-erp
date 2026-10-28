import fs from 'node:fs'
import path from 'node:path'
import type { PoolClient } from 'pg'
import iconv from 'iconv-lite'
import { readJsonFile } from './json-file'
import { insertRows } from './records'

const DATA_DIR = path.join(process.cwd(), 'data')

/** DB 컬렉션 이름 → DB 전환 전 data/ 의 JSON 배열 파일 */
export const LEGACY_COLLECTION_FILES: Record<string, string> = {
  metadata: 'metadata.json',
  auditLogs: 'audit-log.json',
  inventory: 'inventory.json',
  floor3WorkLogs: 'floor3-work-logs.json',
  processChecks: 'process-checks.json',
  processTemplates: 'process-templates.json',
  customerNonconformities: 'customer-nonconformities.json',
  processNonconformities: 'process-nonconformities.json',
}

export const CONFIG_NAMES = ['companies', 'document-types', 'materials', 'specifications', 'products', 'shipment-categories']

function readArray(file: string): any[] {
  const parsed = readJsonFile<unknown>(path.join(DATA_DIR, file), [])
  return Array.isArray(parsed) ? parsed : []
}

async function importCollection(client: PoolClient, collection: string, rows: any[]) {
  await insertRows(
    client,
    collection,
    rows.map((row, index) => ({ id: String(row.id), position: index, data: row })),
  )
}

async function importSetting(client: PoolClient, key: string, value: unknown) {
  await client.query('INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO NOTHING', [key, JSON.stringify(value)])
}

/**
 * DB 전환 전 data/ 의 JSON·CSV 파일을 그대로 DB로 옮긴다. records 준비 단계에서 딱 한 번 실행되고,
 * 원본 파일은 건드리지 않는다. 파일이 깨져 있으면 예외로 전체를 취소한다.
 */
export async function importLegacyJsonData(client: PoolClient) {
  for (const [collection, file] of Object.entries(LEGACY_COLLECTION_FILES)) {
    await importCollection(client, collection, readArray(file))
  }

  const store = readJsonFile<Record<string, unknown>>(path.join(DATA_DIR, 'db.json'), {})
  const seq = (store._seq ?? {}) as Record<string, number>
  for (const [table, rows] of Object.entries(store)) {
    if (table === '_seq' || !Array.isArray(rows)) continue
    await importCollection(client, table, rows)
    const maxId = rows.reduce((max: number, row: any) => (typeof row.id === 'number' && row.id > max ? row.id : max), 0)
    const value = Math.max(maxId, Number(seq[table]) || 0)
    if (value > 0) {
      await client.query('INSERT INTO sequences (name, value) VALUES ($1, $2) ON CONFLICT (name) DO NOTHING', [table, value])
    }
  }

  for (const name of CONFIG_NAMES) {
    if (fs.existsSync(path.join(DATA_DIR, `${name}.json`))) {
      await importSetting(client, `config:${name}`, readArray(`${name}.json`))
    }
  }

  const organizationFile = path.join(DATA_DIR, 'organization.json')
  if (fs.existsSync(organizationFile)) {
    await importSetting(client, 'organization', readJsonFile(organizationFile, null))
  }

  const hiddenLines = readArray('process-hidden-lines.json')
  if (hiddenLines.length) await importSetting(client, 'processHiddenLines', hiddenLines)

  const platingFile = path.join(DATA_DIR, 'plating-information.csv')
  if (fs.existsSync(platingFile)) {
    await importSetting(client, 'platingInfoCsv', iconv.decode(fs.readFileSync(platingFile), 'cp949').replace(/^\uFEFF/, ''))
  }
}
