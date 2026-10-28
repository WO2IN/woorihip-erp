import { Pool, type PoolClient, type QueryResultRow } from 'pg'

const globalForDb = globalThis as unknown as {
  pgPool?: Pool
  dbSetups?: Map<string, Promise<void>>
}

function getPool() {
  if (!globalForDb.pgPool) {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL 환경변수가 설정되지 않았습니다.')
    globalForDb.pgPool = new Pool({ connectionString: process.env.DATABASE_URL, max: 10 })
  }
  return globalForDb.pgPool
}

export async function query<T extends QueryResultRow>(text: string, params: unknown[] = []) {
  const result = await getPool().query<T>(text, params)
  return result.rows
}

export async function transaction<T>(work: (client: PoolClient) => Promise<T>) {
  const client = await getPool().connect()
  try {
    await client.query('BEGIN')
    const result = await work(client)
    await client.query('COMMIT')
    return result
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

/**
 * 테이블 생성·기존 JSON 데이터 이전처럼 서버 기동 후 한 번만 필요한 작업을 실행합니다.
 * 같은 name 은 프로세스당 한 번만 실행되고, 실패하면 다음 요청에서 다시 시도합니다.
 */
export function ensureSetup(name: string, setup: (client: PoolClient) => Promise<void>) {
  globalForDb.dbSetups ??= new Map()
  let pending = globalForDb.dbSetups.get(name)
  if (!pending) {
    pending = transaction(async (client) => {
      // 여러 서버 프로세스가 동시에 시작해도 이전 작업이 겹치지 않도록 DB 차원에서 잠근다.
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [name])
      await setup(client)
    }).catch((error) => {
      globalForDb.dbSetups?.delete(name)
      throw error
    })
    globalForDb.dbSetups.set(name, pending)
  }
  return pending
}
