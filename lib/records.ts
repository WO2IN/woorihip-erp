import type { PoolClient } from 'pg'
import { ensureSetup, query, transaction } from './db'
import { importLegacyJsonData } from './legacy-import'

// JSON 파일 시절의 "배열 하나 = 컬렉션" 구조를 그대로 옮긴 저장소.
// 각 행은 records 테이블에 (collection, id, position, data jsonb) 로 들어가고, position 이 배열 순서를 보존한다.

interface CachedCollection {
  version: number
  rows: { id: string; position: number; data: any }[]
}

const globalForRecords = globalThis as unknown as { recordCache?: Map<string, CachedCollection> }
const cache = (globalForRecords.recordCache ??= new Map())

export function recordsReady() {
  return ensureSetup('records', async (client) => {
    await client.query(`
      CREATE TABLE IF NOT EXISTS records (
        collection text NOT NULL,
        id         text NOT NULL,
        position   double precision NOT NULL,
        data       jsonb NOT NULL,
        PRIMARY KEY (collection, id)
      )
    `)
    await client.query('CREATE INDEX IF NOT EXISTS records_collection_position ON records (collection, position)')
    await client.query(`
      CREATE TABLE IF NOT EXISTS collection_versions (
        name    text PRIMARY KEY,
        version bigint NOT NULL DEFAULT 0
      )
    `)
    await client.query('CREATE TABLE IF NOT EXISTS sequences (name text PRIMARY KEY, value bigint NOT NULL)')
    await client.query(`
      CREATE TABLE IF NOT EXISTS settings (
        key        text PRIMARY KEY,
        value      jsonb NOT NULL,
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `)
    await client.query(`
      CREATE TABLE IF NOT EXISTS migrations (
        name       text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `)
    const { rowCount } = await client.query("SELECT 1 FROM migrations WHERE name = 'legacy-json-import'")
    if (rowCount) return
    await importLegacyJsonData(client)
    await client.query("INSERT INTO migrations (name) VALUES ('legacy-json-import')")
  })
}

async function currentVersion(collection: string) {
  const [row] = await query<{ version: string }>('SELECT version FROM collection_versions WHERE name = $1', [collection])
  return row ? Number(row.version) : 0
}

async function loadCollection(collection: string): Promise<CachedCollection> {
  await recordsReady()
  const version = await currentVersion(collection)
  const cached = cache.get(collection)
  if (cached && cached.version === version) return cached

  const rows = await query<{ id: string; position: number; data: any }>(
    'SELECT id, position, data FROM records WHERE collection = $1 ORDER BY position',
    [collection],
  )
  const fresh = { version, rows }
  cache.set(collection, fresh)
  return fresh
}

/**
 * 컬렉션 단위로 잠근 뒤 쓰기 작업을 실행한다. 버전을 올려 다른 서버 프로세스의 캐시를 무효화하고,
 * 그 사이 다른 쓰기가 없었다면 이 프로세스의 캐시는 applyToCache 로 바로 갱신한다.
 */
async function write<T>(
  collection: string,
  work: (client: PoolClient, cachedRows: CachedCollection['rows'] | null) => Promise<T>,
  applyToCache: (rows: CachedCollection['rows'], result: T) => void,
): Promise<T> {
  await recordsReady()
  const before = cache.get(collection)
  const { result, version } = await transaction(async (client) => {
    await client.query('INSERT INTO collection_versions (name) VALUES ($1) ON CONFLICT DO NOTHING', [collection])
    const { rows } = await client.query<{ version: string }>(
      'UPDATE collection_versions SET version = version + 1 WHERE name = $1 RETURNING version',
      [collection],
    )
    const version = Number(rows[0].version)
    // 버전 행을 잠근 상태이므로, 캐시 버전이 바로 직전이면 캐시 내용이 곧 DB 내용이다.
    const cachedRows = before && cache.get(collection) === before && before.version === version - 1 ? before.rows : null
    return { result: await work(client, cachedRows), version }
  })

  if (before && cache.get(collection) === before && before.version === version - 1) {
    applyToCache(before.rows, result)
    before.version = version
  } else {
    cache.delete(collection)
  }
  return result
}

function clone<T>(value: T): T {
  return value === undefined ? value : JSON.parse(JSON.stringify(value))
}

// ─── Read ────────────────────────────────────────────────────────────────────

export async function listRecords<T>(collection: string): Promise<T[]> {
  const { rows } = await loadCollection(collection)
  return rows.map((row) => clone(row.data) as T)
}

/** predicate 는 캐시된 원본을 받으므로 인자를 수정하면 안 된다. 일치하는 행만 복사해 돌려준다. */
export async function findRecords<T>(collection: string, predicate: (row: T) => boolean, limit = Infinity): Promise<T[]> {
  const { rows } = await loadCollection(collection)
  const matches: T[] = []
  for (const row of rows) {
    if (matches.length >= limit) break
    if (predicate(row.data)) matches.push(clone(row.data) as T)
  }
  return matches
}

export async function getRecord<T>(collection: string, id: string | number): Promise<T | null> {
  const { rows } = await loadCollection(collection)
  const row = rows.find((candidate) => candidate.id === String(id))
  return row ? (clone(row.data) as T) : null
}

// ─── Write ───────────────────────────────────────────────────────────────────

export async function insertRecord<T extends { id: string | number }>(
  collection: string,
  data: T,
  at: 'first' | 'last' = 'last',
): Promise<T> {
  const id = String(data.id)
  const stored = clone(data)
  await write(
    collection,
    async (client) => {
      const { rows } = await client.query<{ position: number }>(
        at === 'first'
          ? 'SELECT coalesce(min(position), 0) - 1 AS position FROM records WHERE collection = $1'
          : 'SELECT coalesce(max(position), 0) + 1 AS position FROM records WHERE collection = $1',
        [collection],
      )
      const nextPosition = rows[0].position
      await client.query(
        'INSERT INTO records (collection, id, position, data) VALUES ($1, $2, $3, $4)',
        [collection, id, nextPosition, JSON.stringify(stored)],
      )
      return nextPosition
    },
    (rows, nextPosition) => {
      if (at === 'first') rows.unshift({ id, position: nextPosition, data: stored })
      else rows.push({ id, position: nextPosition, data: stored })
    },
  )
  return clone(stored)
}

/** 같은 id 가 있으면 자리는 그대로 두고 내용을 통째로 바꾸고, 없으면 맨 뒤에 추가한다. */
export async function putRecord<T extends { id: string | number }>(collection: string, data: T): Promise<T> {
  const id = String(data.id)
  const stored = clone(data)
  await write(
    collection,
    async (client) => {
      const { rows } = await client.query<{ position: number }>(
        `INSERT INTO records (collection, id, position, data)
         VALUES ($1, $2, (SELECT coalesce(max(position), 0) + 1 FROM records WHERE collection = $1), $3)
         ON CONFLICT (collection, id) DO UPDATE SET data = EXCLUDED.data
         RETURNING position`,
        [collection, id, JSON.stringify(stored)],
      )
      return rows[0].position
    },
    (rows, position) => {
      const row = rows.find((candidate) => candidate.id === id)
      if (row) row.data = stored
      else rows.push({ id, position, data: stored })
    },
  )
  return clone(stored)
}

/** 기존 행에 patch 를 덮어쓴다 ({ ...기존, ...patch }). 행이 없으면 null. */
export async function patchRecord<T>(
  collection: string,
  id: string | number,
  patch: Partial<T> | ((current: T) => Partial<T>),
): Promise<T | null> {
  const key = String(id)
  const next = await write(
    collection,
    async (client) => {
      const { rows } = await client.query<{ data: T }>(
        'SELECT data FROM records WHERE collection = $1 AND id = $2 FOR UPDATE',
        [collection, key],
      )
      if (!rows[0]) return null
      const current = rows[0].data
      const merged = clone({ ...current, ...(typeof patch === 'function' ? patch(current) : patch) }) as T
      await client.query('UPDATE records SET data = $3 WHERE collection = $1 AND id = $2', [collection, key, JSON.stringify(merged)])
      return merged
    },
    (rows, merged) => {
      if (!merged) return
      const row = rows.find((candidate) => candidate.id === key)
      if (row) row.data = merged
    },
  )
  return next ? clone(next) : null
}

/** predicate 에 맞는 모든 행에 patch 를 덮어쓰고, 바뀐 행들을 돌려준다. */
export async function patchRecordsWhere<T>(
  collection: string,
  predicate: (row: T) => boolean,
  patch: Partial<T>,
): Promise<T[]> {
  const updated = await write(
    collection,
    async (client, cachedRows) => {
      const rows = cachedRows ?? (await client.query<{ id: string; data: T }>(
        'SELECT id, data FROM records WHERE collection = $1 ORDER BY position',
        [collection],
      )).rows
      const changed: { id: string; data: T }[] = []
      for (const row of rows) {
        if (!predicate(row.data)) continue
        const merged = clone({ ...row.data, ...patch }) as T
        await client.query('UPDATE records SET data = $3 WHERE collection = $1 AND id = $2', [collection, row.id, JSON.stringify(merged)])
        changed.push({ id: row.id, data: merged })
      }
      return changed
    },
    (rows, changed) => {
      for (const { id, data } of changed) {
        const row = rows.find((candidate) => candidate.id === id)
        if (row) row.data = data
      }
    },
  )
  return updated.map((row) => clone(row.data))
}

export async function deleteRecord<T>(collection: string, id: string | number): Promise<T | null> {
  const key = String(id)
  const removed = await write(
    collection,
    async (client) => {
      const { rows } = await client.query<{ data: T }>(
        'DELETE FROM records WHERE collection = $1 AND id = $2 RETURNING data',
        [collection, key],
      )
      return rows[0]?.data ?? null
    },
    (rows) => {
      const index = rows.findIndex((candidate) => candidate.id === key)
      if (index !== -1) rows.splice(index, 1)
    },
  )
  return removed
}

/** predicate 에 맞는 행을 모두 지우고, 지운 행들을 돌려준다. */
export async function deleteRecordsWhere<T>(collection: string, predicate: (row: T) => boolean): Promise<T[]> {
  const removed = await write(
    collection,
    async (client, cachedRows) => {
      const rows = cachedRows ?? (await client.query<{ id: string; data: T }>(
        'SELECT id, data FROM records WHERE collection = $1',
        [collection],
      )).rows
      const targets = rows
        .filter((row) => predicate(row.data))
        .map((row) => ({ id: row.id, data: clone(row.data) }))
      if (targets.length) {
        await client.query('DELETE FROM records WHERE collection = $1 AND id = ANY($2::text[])', [collection, targets.map((row) => row.id)])
      }
      return targets
    },
    (rows, targets) => {
      const ids = new Set(targets.map((row) => row.id))
      for (let index = rows.length - 1; index >= 0; index--) {
        if (ids.has(rows[index].id)) rows.splice(index, 1)
      }
    },
  )
  return removed.map((row) => row.data)
}

/** 컬렉션 전체를 주어진 배열 순서대로 교체한다. */
export async function replaceRecords<T extends { id: string | number }>(collection: string, items: T[]) {
  const stored = items.map((item, index) => ({ id: String(item.id), position: index, data: clone(item) }))
  await write(
    collection,
    async (client) => {
      await client.query('DELETE FROM records WHERE collection = $1', [collection])
      await insertRows(client, collection, stored)
    },
    (rows) => {
      rows.splice(0, rows.length, ...stored)
    },
  )
}

export async function insertRows(
  client: PoolClient,
  collection: string,
  rows: { id: string; position: number; data: unknown }[],
) {
  for (let start = 0; start < rows.length; start += 500) {
    const chunk = rows.slice(start, start + 500)
    await client.query(
      `INSERT INTO records (collection, id, position, data)
       SELECT $1, t.id, t.position, t.data
       FROM unnest($2::text[], $3::float8[], $4::jsonb[]) AS t(id, position, data)`,
      [collection, chunk.map((row) => row.id), chunk.map((row) => row.position), chunk.map((row) => JSON.stringify(row.data))],
    )
  }
}

/**
 * 여러 행 추가·수정을 트랜잭션 하나로 처리한다. NAS 디스크는 커밋마다 수십 ms 가 걸리므로
 * 반복문 안에서 행을 하나씩 저장하지 말고 이 함수로 모아서 저장한다.
 * sequence 를 주면 insert 행에 그 시퀀스로 숫자 id 를 붙인다.
 */
export async function bulkWrite(
  collection: string,
  { insert = [], patch = [], sequence }: {
    insert?: Record<string, any>[]
    patch?: { id: string | number; patch: Record<string, any> }[]
    sequence?: string
  },
): Promise<any[]> {
  if (insert.length === 0 && patch.length === 0) return []
  const result = await write(
    collection,
    async (client, cachedRows) => {
      let inserted = insert.map((data) => clone(data))
      if (sequence && inserted.length) {
        const { rows } = await client.query<{ value: string }>(
          `INSERT INTO sequences (name, value) VALUES ($1, $2)
           ON CONFLICT (name) DO UPDATE SET value = sequences.value + $2
           RETURNING value`,
          [sequence, inserted.length],
        )
        const first = Number(rows[0].value) - inserted.length + 1
        inserted = inserted.map((data, index) => ({ id: first + index, ...data }))
      }
      const { rows: positionRows } = await client.query<{ position: number }>(
        'SELECT coalesce(max(position), 0) AS position FROM records WHERE collection = $1',
        [collection],
      )
      const insertedRows = inserted.map((data, index) => ({
        id: String(data.id),
        position: positionRows[0].position + 1 + index,
        data,
      }))
      await insertRows(client, collection, insertedRows)

      const patchIds = patch.map((item) => String(item.id))
      const currentById = new Map<string, any>()
      if (patchIds.length) {
        const source = cachedRows
          ? cachedRows.filter((row) => patchIds.includes(row.id))
          : (await client.query<{ id: string; data: any }>(
            'SELECT id, data FROM records WHERE collection = $1 AND id = ANY($2::text[])',
            [collection, patchIds],
          )).rows
        for (const row of source) currentById.set(row.id, row.data)
      }
      const patchedRows: { id: string; data: any }[] = []
      for (const item of patch) {
        const key = String(item.id)
        const current = currentById.get(key)
        if (!current) continue
        const merged = clone({ ...current, ...item.patch })
        currentById.set(key, merged)
        patchedRows.push({ id: key, data: merged })
      }
      if (patchedRows.length) {
        await client.query(
          `UPDATE records AS r SET data = t.data
           FROM unnest($2::text[], $3::jsonb[]) AS t(id, data)
           WHERE r.collection = $1 AND r.id = t.id`,
          [collection, patchedRows.map((row) => row.id), patchedRows.map((row) => JSON.stringify(row.data))],
        )
      }
      return { insertedRows, patchedRows }
    },
    (rows, { insertedRows, patchedRows }) => {
      for (const { id, data } of patchedRows) {
        const row = rows.find((candidate) => candidate.id === id)
        if (row) row.data = data
      }
      rows.push(...insertedRows)
    },
  )
  return result.insertedRows.map((row) => clone(row.data))
}

// ─── Sequence ────────────────────────────────────────────────────────────────

export async function nextSequence(name: string): Promise<number> {
  await recordsReady()
  const [row] = await query<{ value: string }>(
    `INSERT INTO sequences (name, value) VALUES ($1, 1)
     ON CONFLICT (name) DO UPDATE SET value = sequences.value + 1
     RETURNING value`,
    [name],
  )
  return Number(row.value)
}

// ─── Settings ────────────────────────────────────────────────────────────────

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  await recordsReady()
  const [row] = await query<{ value: T }>('SELECT value FROM settings WHERE key = $1', [key])
  return row ? row.value : fallback
}

export async function setSetting(key: string, value: unknown) {
  await recordsReady()
  await query(
    `INSERT INTO settings (key, value, updated_at) VALUES ($1, $2, now())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
    [key, JSON.stringify(value)],
  )
}
