import fs from 'fs'
import path from 'path'
import zlib from 'zlib'
import { fileURLToPath } from 'url'
import pg from 'pg'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const file = process.argv[2]
const confirmed = process.argv.includes('--restore')

if (!file || !confirmed) {
  console.error('사용법: node scripts/restore-db.mjs backups/파일.json.gz --restore')
  console.error('이 명령은 접속 중인 데이터베이스의 표를 비우고 백업 내용으로 덮어씁니다.')
  process.exit(1)
}

function databaseUrl() {
  const text = fs.readFileSync(path.join(root, '.env.local'), 'utf8')
  const line = text.split('\n').find((item) => item.startsWith('DATABASE_URL='))
  if (!line) throw new Error('DATABASE_URL 이 .env.local 에 없습니다.')
  let url = line.slice('DATABASE_URL='.length).trim()
  if ((url.startsWith('"') && url.endsWith('"')) || (url.startsWith("'") && url.endsWith("'"))) url = url.slice(1, -1)
  return url
}

const url = databaseUrl()
const target = decodeURIComponent(new URL(url).pathname.replace(/^\//, ''))
const dump = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.resolve(file))).toString('utf8'))
if (dump.database !== target) {
  console.error(`백업은 ${dump.database} 인데 접속 대상은 ${target} 입니다. 복구를 멈췄습니다.`)
  process.exit(1)
}

const names = Object.keys(dump.tables).filter((name) => /^[a-z_][a-z0-9_]*$/i.test(name))
const client = new pg.Client({ connectionString: url })
await client.connect()

try {
  const types = new Map()
  for (const name of names) {
    const columns = await client.query(
      `SELECT attname AS name, pg_catalog.format_type(atttypid, atttypmod) AS type
       FROM pg_attribute
       WHERE attrelid = $1::regclass AND attnum > 0 AND NOT attisdropped`,
      [`public.${name}`],
    )
    types.set(name, new Map(columns.rows.map((column) => [column.name, column.type])))
  }

  await client.query('BEGIN')
  await client.query(`TRUNCATE ${names.map((name) => `"${name}"`).join(', ')}`)
  for (const name of names) {
    const table = dump.tables[name]
    const columnTypes = types.get(name)
    const columns = table.columns.filter((column) => columnTypes?.has(column))
    if (columns.length === 0 || table.rows.length === 0) continue
    const placeholders = columns.map((column, index) => {
      const type = columnTypes.get(column)
      return type === 'jsonb' || type === 'json' ? `$${index + 1}::jsonb` : `$${index + 1}`
    })
    const sql = `INSERT INTO "${name}" (${columns.map((column) => `"${column}"`).join(', ')}) VALUES (${placeholders.join(', ')})`
    for (const row of table.rows) {
      const values = columns.map((column) => {
        const value = row[column]
        const type = columnTypes.get(column)
        if (value == null) return null
        if (type === 'jsonb' || type === 'json') return JSON.stringify(value)
        return value
      })
      await client.query(sql, values)
    }
  }
  await client.query('COMMIT')
  console.log(`restore ok ${target} from ${path.basename(file)}`)
} catch (error) {
  await client.query('ROLLBACK')
  throw error
} finally {
  await client.end()
}
