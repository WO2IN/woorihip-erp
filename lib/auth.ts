import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { promisify } from 'node:util'
import { User, UserRole } from './types'
import { readJsonFile } from './json-file'
import { ensureSetup, query } from './db'

const LEGACY_USERS_FILE = path.join(process.cwd(), 'data', 'users.json')
const SESSION_SECRET_FILE = path.join(process.cwd(), 'data', '.session-secret')

export const SESSION_COOKIE = 'wms_session'
export const SESSION_MAX_AGE = 60 * 60 * 24 * 30

export const sessionCookieOptions = {
  httpOnly: true,
  sameSite: 'lax' as const,
  path: '/',
  maxAge: SESSION_MAX_AGE,
}

// ─── User storage ────────────────────────────────────────────────────────────

interface UserRow {
  id: string
  username: string
  display_name: string
  password_hash: string
  role: UserRole
  floor: number | null
  status: 'pending' | null
  nav_order: string | null
  created_at: Date
}

function fromRow(row: UserRow): User {
  const navOrder = parseNavOrder(row.nav_order)
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    passwordHash: row.password_hash,
    role: row.role,
    ...(row.floor ? { floor: row.floor as 1 | 2 | 3 } : {}),
    ...(row.status ? { status: row.status } : {}),
    ...(navOrder ? { navOrder } : {}),
    createdAt: row.created_at.toISOString(),
  }
}

function parseNavOrder(value: string | null): string[] | undefined {
  if (!value) return undefined
  try {
    const parsed = JSON.parse(value)
    if (!Array.isArray(parsed)) return undefined
    const order = parsed.filter((id): id is string => typeof id === 'string')
    return order.length ? order : undefined
  } catch {
    return undefined
  }
}

async function usersReady() {
  await ensureSetup('users', async (client) => {
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id            text PRIMARY KEY,
        username      text NOT NULL,
        display_name  text NOT NULL,
        password_hash text NOT NULL,
        role          text NOT NULL CHECK (role IN ('viewer', 'editor', 'admin')),
        floor         smallint CHECK (floor IN (1, 2, 3)),
        status        text CHECK (status IN ('pending')),
        created_at    timestamptz NOT NULL DEFAULT now()
      )
    `)
    await client.query('CREATE UNIQUE INDEX IF NOT EXISTS users_username_lower ON users (lower(username))')
    await client.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS nav_order text')

    const { rows } = await client.query<{ count: string }>('SELECT count(*) FROM users')
    if (Number(rows[0].count) > 0) return
    // DB 전환 전 data/users.json 계정을 처음 한 번만 옮긴다. 원본 파일은 백업으로 남겨 둔다.
    for (const user of readJsonFile<User[]>(LEGACY_USERS_FILE, [])) {
      await client.query(
        `INSERT INTO users (id, username, display_name, password_hash, role, floor, status, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [user.id, user.username, user.displayName, user.passwordHash, user.role, user.floor ?? null, user.status ?? null, user.createdAt],
      )
    }
  })
  await ensureSetup('users-nav-order', async (client) => {
    await client.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS nav_order text')
  })
}

const USER_COLUMNS = 'id, username, display_name, password_hash, role, floor, status, nav_order, created_at'

export async function listUsers(): Promise<User[]> {
  await usersReady()
  const rows = await query<UserRow>(`SELECT ${USER_COLUMNS} FROM users ORDER BY created_at`)
  return rows.map(fromRow)
}

export async function findUserById(id: string): Promise<User | null> {
  await usersReady()
  const [row] = await query<UserRow>(`SELECT ${USER_COLUMNS} FROM users WHERE id = $1`, [id])
  return row ? fromRow(row) : null
}

async function findUserByUsername(username: string): Promise<User | null> {
  await usersReady()
  const [row] = await query<UserRow>(`SELECT ${USER_COLUMNS} FROM users WHERE username = $1`, [username])
  return row ? fromRow(row) : null
}

export async function isUsernameTaken(username: string) {
  await usersReady()
  const rows = await query('SELECT 1 FROM users WHERE lower(username) = lower($1)', [username])
  return rows.length > 0
}

/** 아이디가 이미 있으면 false. */
export async function insertUser(user: User): Promise<boolean> {
  await usersReady()
  const rows = await query(
    `INSERT INTO users (id, username, display_name, password_hash, role, floor, status, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT DO NOTHING
     RETURNING id`,
    [user.id, user.username, user.displayName, user.passwordHash, user.role, user.floor ?? null, user.status ?? null, user.createdAt],
  )
  return rows.length > 0
}

export interface UserPatch {
  displayName?: string
  role?: UserRole
  floor?: 1 | 2 | 3 | null
  passwordHash?: string
  status?: 'pending' | null
  navOrder?: string[] | null
}

const PATCH_COLUMNS: Record<keyof UserPatch, string> = {
  displayName: 'display_name',
  role: 'role',
  floor: 'floor',
  passwordHash: 'password_hash',
  status: 'status',
  navOrder: 'nav_order',
}

export async function updateUser(id: string, patch: UserPatch): Promise<User | null> {
  await usersReady()
  const entries = (Object.keys(PATCH_COLUMNS) as (keyof UserPatch)[]).filter((key) => patch[key] !== undefined)
  if (entries.length === 0) return findUserById(id)
  const sets = entries.map((key, index) => `${PATCH_COLUMNS[key]} = $${index + 2}`)
  const values = entries.map((key) => {
    if (key !== 'navOrder') return patch[key]
    return patch.navOrder?.length ? JSON.stringify(patch.navOrder) : null
  })
  const [row] = await query<UserRow>(
    `UPDATE users SET ${sets.join(', ')} WHERE id = $1 RETURNING ${USER_COLUMNS}`,
    [id, ...values],
  )
  return row ? fromRow(row) : null
}

export async function deleteUser(id: string) {
  await usersReady()
  await query('DELETE FROM users WHERE id = $1', [id])
}

export function toPublicUser(user: User) {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    role: user.role,
    floor: user.floor,
    navOrder: user.navOrder ?? null,
  }
}

// ─── Password hashing ────────────────────────────────────────────────────────

const scrypt = promisify(crypto.scrypt) as (password: string, salt: Buffer, keylen: number) => Promise<Buffer>
const SCRYPT_PREFIX = 'scrypt$'

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16)
  const key = await scrypt(password, salt, 64)
  return `${SCRYPT_PREFIX}${salt.toString('base64')}$${key.toString('base64')}`
}

function legacySha256(password: string) {
  return crypto.createHash('sha256').update(password).digest('hex')
}

function safeEqual(a: Buffer, b: Buffer) {
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

async function verifyPassword(password: string, stored: string): Promise<boolean> {
  if (stored.startsWith(SCRYPT_PREFIX)) {
    const [saltB64, keyB64] = stored.slice(SCRYPT_PREFIX.length).split('$')
    if (!saltB64 || !keyB64) return false
    const expected = Buffer.from(keyB64, 'base64')
    const actual = await scrypt(password, Buffer.from(saltB64, 'base64'), expected.length)
    return safeEqual(actual, expected)
  }
  return safeEqual(Buffer.from(legacySha256(password)), Buffer.from(stored))
}

// ─── Authenticate ────────────────────────────────────────────────────────────

export async function authenticate(
  username: string,
  password: string
): Promise<User | null> {
  const user = await findUserByUsername(username)
  if (!user) return null

  if (!(await verifyPassword(password, user.passwordHash))) return null

  if (!user.passwordHash.startsWith(SCRYPT_PREFIX)) {
    return (await updateUser(user.id, { passwordHash: await hashPassword(password) })) ?? user
  }

  return user
}

// ─── Session token ───────────────────────────────────────────────────────────

let sessionSecret: string | null = null

function getSessionSecret() {
  if (sessionSecret) return sessionSecret
  if (process.env.SESSION_SECRET) return (sessionSecret = process.env.SESSION_SECRET)
  if (!fs.existsSync(SESSION_SECRET_FILE)) {
    fs.mkdirSync(path.dirname(SESSION_SECRET_FILE), { recursive: true })
    try {
      fs.writeFileSync(SESSION_SECRET_FILE, crypto.randomBytes(32).toString('hex'), { flag: 'wx', mode: 0o600 })
    } catch (error: any) {
      if (error?.code !== 'EEXIST') throw error
    }
  }
  sessionSecret = fs.readFileSync(SESSION_SECRET_FILE, 'utf-8').trim()
  return sessionSecret
}

// 비밀번호가 바뀌면 기존 토큰이 모두 무효가 되도록 서명에 passwordHash를 포함한다.
function signSession(payload: string, passwordHash: string) {
  return crypto.createHmac('sha256', getSessionSecret()).update(`${payload}.${passwordHash}`).digest('base64url')
}

export function createSessionToken(user: User) {
  const payload = `${user.id}.${Date.now() + SESSION_MAX_AGE * 1000}`
  return `${payload}.${signSession(payload, user.passwordHash)}`
}

export async function verifySessionToken(token: string | null | undefined): Promise<User | null> {
  if (!token) return null
  const [id, expires, signature, ...rest] = token.split('.')
  if (!id || !expires || !signature || rest.length) return null
  if (!(Number(expires) > Date.now())) return null

  const user = await findUserById(id)
  if (!user || user.status === 'pending') return null

  const expected = signSession(`${id}.${expires}`, user.passwordHash)
  return safeEqual(Buffer.from(signature), Buffer.from(expected)) ? user : null
}

function readCookie(cookieHeader: string | null, name: string) {
  if (!cookieHeader) return null
  for (const part of cookieHeader.split(';')) {
    const [key, ...value] = part.trim().split('=')
    if (key === name) return decodeURIComponent(value.join('='))
  }
  return null
}

// ─── Permission helpers ──────────────────────────────────────────────────────

const ROLE_LEVEL: Record<UserRole, number> = {
  viewer: 1,
  editor: 2,
  admin: 3,
}

export function hasPermission(userRole: UserRole, required: UserRole): boolean {
  return ROLE_LEVEL[userRole] >= ROLE_LEVEL[required]
}

export function canEdit(role: UserRole): boolean {
  return hasPermission(role, 'editor')
}

export function canManageUsers(role: UserRole): boolean {
  return hasPermission(role, 'admin')
}

// ─── Request user ────────────────────────────────────────────────────────────

export async function getUserFromHeaders(headers: Headers): Promise<{
  id: string
  displayName: string
  role: UserRole
  floor?: 1 | 2 | 3
} | null> {
  const user = await verifySessionToken(readCookie(headers.get('cookie'), SESSION_COOKIE))
  if (!user) return null
  return { id: user.id, displayName: user.displayName, role: user.role, floor: user.floor }
}
