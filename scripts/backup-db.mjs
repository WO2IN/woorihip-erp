import fs from 'fs'
import path from 'path'
import zlib from 'zlib'
import { fileURLToPath } from 'url'
import pg from 'pg'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const backupDir = path.join(root, 'backups')
const keepDays = 7

function databaseUrl() {
  const envPath = path.join(root, '.env.local')
  const text = fs.readFileSync(envPath, 'utf8')
  const line = text.split('\n').find((item) => item.startsWith('DATABASE_URL='))
  if (!line) throw new Error('DATABASE_URL 이 .env.local 에 없습니다.')
  let url = line.slice('DATABASE_URL='.length).trim()
  if ((url.startsWith('"') && url.endsWith('"')) || (url.startsWith("'") && url.endsWith("'"))) url = url.slice(1, -1)
  return url
}

function databaseName(url) {
  const name = decodeURIComponent(new URL(url).pathname.replace(/^\//, ''))
  if (!/^[A-Za-z0-9_]+$/.test(name)) throw new Error('데이터베이스 이름이 올바르지 않습니다.')
  return name
}

function stamp() {
  const now = new Date()
  const pad = (value) => String(value).padStart(2, '0')
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
}

const url = databaseUrl()
const name = databaseName(url)
const client = new pg.Client({ connectionString: url })
await client.connect()

try {
  const version = await client.query('SELECT version()')
  const tables = await client.query(`
    SELECT c.relname AS name
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r'
    ORDER BY c.relname
  `)
  const dump = {
    database: name,
    createdAt: new Date().toISOString(),
    serverVersion: version.rows[0].version,
    tables: {},
  }
  const counts = []
  for (const table of tables.rows) {
    const columns = await client.query(
      `SELECT attname AS name
       FROM pg_attribute
       WHERE attrelid = $1::regclass AND attnum > 0 AND NOT attisdropped
       ORDER BY attnum`,
      [`public.${table.name}`],
    )
    const names = columns.rows.map((column) => column.name)
    const rows = await client.query(`SELECT ${names.map((column) => `"${column}"`).join(', ')} FROM "${table.name}"`)
    dump.tables[table.name] = { columns: names, rows: rows.rows }
    counts.push(`${table.name} ${rows.rowCount}`)
  }

  fs.mkdirSync(backupDir, { recursive: true, mode: 0o700 })
  const file = path.join(backupDir, `${name}-${stamp()}.json.gz`)
  fs.writeFileSync(file, zlib.gzipSync(Buffer.from(JSON.stringify(dump))), { mode: 0o600 })
  const bytes = fs.statSync(file).size

  const cutoff = Date.now() - keepDays * 24 * 60 * 60 * 1000
  for (const entry of fs.readdirSync(backupDir)) {
    if (!entry.startsWith(`${name}-`) || !entry.endsWith('.json.gz')) continue
    const target = path.join(backupDir, entry)
    if (target === file) continue
    if (fs.statSync(target).mtimeMs < cutoff) fs.rmSync(target)
  }

  console.log(`backup ok ${name} ${file} ${bytes} bytes | ${counts.join(', ')}`)
} finally {
  await client.end()
}
