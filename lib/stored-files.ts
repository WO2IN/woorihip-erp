import { createHash, randomUUID } from 'node:crypto'
import { ensureSetup, query } from '@/lib/db'
import {
  getObjectBytes,
  putObjectBytes,
  removeObjectBytes,
  type StorageScope,
  scopeForObjectKey,
} from '@/lib/object-storage'

export type StoredFileRow = {
  id: string
  bucket_scope: StorageScope
  object_key: string
  legacy_key: string | null
  domain: string
  category: string
  owner_type: string | null
  owner_id: string | null
  original_name: string
  mime: string | null
  size_bytes: string | null
  sha256: string | null
  company: string | null
  product: string | null
  lot: string | null
  meta: Record<string, unknown> | null
  uploaded_by: string | null
  uploaded_by_name: string | null
  created_at: string
  deleted_at: string | null
}

export type PutStoredFileInput = {
  domain: string
  category: string
  buffer: Buffer
  mime: string
  ext: string
  originalName: string
  ownerType?: string
  ownerId?: string
  company?: string
  product?: string
  lot?: string
  meta?: Record<string, unknown>
  uploadedBy?: string
  uploadedByName?: string
  legacyKey?: string
  /** 성적서 등: 발행 연도(yyyy) */
  issueYear?: string
  /** MinIO object 파일명(확장자 포함) */
  storageFileName?: string
}

let tableReady: Promise<void> | null = null

export function ensureStoredFilesTable() {
  if (!tableReady) {
    tableReady = ensureSetup('stored-files', async (client) => {
      await client.query(`
        CREATE TABLE IF NOT EXISTS stored_files (
          id uuid PRIMARY KEY,
          bucket_scope text NOT NULL,
          object_key text NOT NULL,
          legacy_key text,
          domain text NOT NULL,
          category text NOT NULL,
          owner_type text,
          owner_id text,
          original_name text NOT NULL,
          mime text,
          size_bytes bigint,
          sha256 text,
          company text,
          product text,
          lot text,
          meta jsonb,
          uploaded_by uuid,
          uploaded_by_name text,
          created_at timestamptz NOT NULL DEFAULT now(),
          deleted_at timestamptz
        )
      `)
      await client.query(`
        CREATE INDEX IF NOT EXISTS stored_files_owner_idx
        ON stored_files (owner_type, owner_id)
        WHERE deleted_at IS NULL
      `)
      await client.query(`
        CREATE INDEX IF NOT EXISTS stored_files_legacy_key_idx
        ON stored_files (legacy_key)
        WHERE legacy_key IS NOT NULL AND deleted_at IS NULL
      `)
      await client.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS stored_files_legacy_key_uq
        ON stored_files (legacy_key)
        WHERE legacy_key IS NOT NULL AND deleted_at IS NULL
      `)
    })
  }
  return tableReady
}

function yearMonth(date = new Date()) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  return { y, m }
}

export function sanitizeStorageSegment(value: string, max = 120) {
  const trimmed = value.replace(/[\\/:*?"<>|\r\n]/g, '_').replace(/\.\./g, '_').trim()
  return (trimmed || 'unknown').slice(0, max)
}

export function parseLegacyCertificatePath(legacyKey: string) {
  const match = legacyKey.match(/^([^/]+)\/성적서\/(\d{4})\/([^/]+)$/)
  if (!match) return null
  return { company: match[1], year: match[2], fileName: match[3] }
}

/** quality/certificate/{업체}/{년도}/{파일명} */
export function buildCertificateObjectKey(company: string, year: string, fileName: string) {
  const safeYear = /^\d{4}$/.test(year) ? year : '0000'
  return `quality/certificate/${sanitizeStorageSegment(company)}/${safeYear}/${sanitizeStorageSegment(fileName, 200)}`
}

export function buildDocumentObjectKey(company: string, year: string, fileName: string) {
  const safeYear = /^\d{4}$/.test(year) ? year : '0000'
  return `quality/document/${sanitizeStorageSegment(company)}/${safeYear}/${sanitizeStorageSegment(fileName, 200)}`
}

export function buildChangeRequestObjectKey(requestId: string, side: string, fileName: string) {
  const safeId = sanitizeStorageSegment(requestId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80), 80)
  const safeName = sanitizeStorageSegment(fileName.replace(/[\\/]/g, '_'), 200)
  return `quality/change-request/${safeId}/${side}/${safeName}`
}

export function buildEquipmentPhotoKey(fileName: string) {
  return `uploads/equipment-photos/${sanitizeStorageSegment(fileName.replace(/[\\/]/g, '_'), 200)}`
}

export function resolveObjectKey(input: PutStoredFileInput): string {
  if (input.domain === 'equipment' && input.category === 'photo' && input.storageFileName) {
    return buildEquipmentPhotoKey(input.storageFileName)
  }
  if (input.domain === 'quality' && input.category === 'certificate' && input.company && input.issueYear && input.storageFileName) {
    return buildCertificateObjectKey(input.company, input.issueYear, input.storageFileName)
  }
  if (
    input.domain === 'quality'
    && input.category === 'change-request'
    && input.ownerId
    && input.meta?.side
    && input.storageFileName
  ) {
    return buildChangeRequestObjectKey(input.ownerId, String(input.meta.side), input.storageFileName)
  }
  if (input.domain === 'quality' && input.category === 'document' && input.company && input.issueYear && input.storageFileName) {
    return buildDocumentObjectKey(input.company, input.issueYear, input.storageFileName)
  }
  return buildObjectKey(input.domain, input.category, input.ext)
}

export function certificateObjectKeyMatchesLayout(objectKey: string) {
  return /^quality\/certificate\/[^/]+\/\d{4}\/[^/]+$/.test(objectKey)
}

export function buildObjectKey(domain: string, category: string, ext: string, date = new Date()) {
  const { y, m } = yearMonth(date)
  const safeDomain = domain.replace(/[^a-z0-9-]/gi, '').toLowerCase() || 'general'
  const safeCategory = category.replace(/[^a-z0-9-]/gi, '').toLowerCase() || 'file'
  const safeExt = ext.replace(/[^a-z0-9]/gi, '').toLowerCase() || 'bin'
  return `${safeDomain}/${safeCategory}/${y}/${m}/${randomUUID()}.${safeExt}`
}

export function scopeForLegacyPath(key: string): StorageScope {
  return scopeForObjectKey(key)
}

export async function readStoredFileBytes(row: Pick<StoredFileRow, 'bucket_scope' | 'object_key'>) {
  const scope = row.bucket_scope === 'legacy' ? 'docs' : row.bucket_scope
  return getObjectBytes(scope, row.object_key)
}

export async function getStoredFileByLegacyKey(legacyKey: string) {
  await ensureStoredFilesTable()
  const [row] = await query<StoredFileRow>(
    'SELECT * FROM stored_files WHERE legacy_key = $1 AND deleted_at IS NULL LIMIT 1',
    [legacyKey],
  )
  return row ?? null
}

export async function getStoredFile(id: string) {
  await ensureStoredFilesTable()
  const [row] = await query<StoredFileRow>(
    'SELECT * FROM stored_files WHERE id = $1 AND deleted_at IS NULL',
    [id],
  )
  return row ?? null
}

export async function findStoredFileByOwnerName(
  ownerType: string,
  ownerId: string,
  originalName: string,
  metaSide?: string,
) {
  await ensureStoredFilesTable()
  const [row] = await query<StoredFileRow>(
    `SELECT * FROM stored_files
     WHERE owner_type = $1 AND owner_id = $2 AND original_name = $3
       AND deleted_at IS NULL
       AND COALESCE(meta->>'side', '') = COALESCE($4, '')
     ORDER BY created_at DESC
     LIMIT 1`,
    [ownerType, ownerId, originalName, metaSide ?? ''],
  )
  return row ?? null
}

export async function registerLegacyFile(input: {
  domain: string
  category: string
  legacyKey: string
  originalName: string
  ownerType?: string
  ownerId?: string
  mime?: string
  sizeBytes?: number
  company?: string
  product?: string
  lot?: string
  meta?: Record<string, unknown>
  uploadedBy?: string
  uploadedByName?: string
}) {
  await ensureStoredFilesTable()
  const scope = scopeForLegacyPath(input.legacyKey)
  const existing = input.ownerType && input.ownerId
    ? await findStoredFileByOwnerName(input.ownerType, input.ownerId, input.originalName, input.meta?.side as string | undefined)
    : null
  if (existing) return existing

  const [dup] = await query<StoredFileRow>(
    `SELECT * FROM stored_files WHERE legacy_key = $1 AND deleted_at IS NULL LIMIT 1`,
    [input.legacyKey],
  )
  if (dup) return dup

  const id = randomUUID()
  await query(
    `INSERT INTO stored_files (
      id, bucket_scope, object_key, legacy_key, domain, category,
      owner_type, owner_id, original_name, mime, size_bytes,
      company, product, lot, meta, uploaded_by, uploaded_by_name
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
    [
      id,
      scope,
      input.legacyKey,
      input.legacyKey,
      input.domain,
      input.category,
      input.ownerType ?? null,
      input.ownerId ?? null,
      input.originalName,
      input.mime ?? null,
      input.sizeBytes ?? null,
      input.company ?? null,
      input.product ?? null,
      input.lot ?? null,
      input.meta ? JSON.stringify(input.meta) : null,
      input.uploadedBy ?? null,
      input.uploadedByName ?? null,
    ],
  )
  return (await getStoredFile(id))!
}

export async function putStoredFile(input: PutStoredFileInput) {
  await ensureStoredFilesTable()
  const objectKey = resolveObjectKey(input)
  const scope: StorageScope = input.domain === 'equipment' || input.category === 'photo' ? 'media' : 'docs'
  const sha256 = createHash('sha256').update(input.buffer).digest('hex')
  await putObjectBytes(scope, objectKey, input.buffer, input.mime)

  const id = randomUUID()
  await query(
    `INSERT INTO stored_files (
      id, bucket_scope, object_key, legacy_key, domain, category,
      owner_type, owner_id, original_name, mime, size_bytes, sha256,
      company, product, lot, meta, uploaded_by, uploaded_by_name
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,
    [
      id,
      scope,
      objectKey,
      input.legacyKey ?? null,
      input.domain,
      input.category,
      input.ownerType ?? null,
      input.ownerId ?? null,
      input.originalName.slice(0, 240),
      input.mime,
      input.buffer.length,
      sha256,
      input.company ?? null,
      input.product ?? null,
      input.lot ?? null,
      input.meta ? JSON.stringify(input.meta) : null,
      input.uploadedBy ?? null,
      input.uploadedByName ?? null,
    ],
  )
  return { id, objectKey, scope }
}

/** 일회성 마이그레이션 스크립트용 */
export function storedFileNeedsObjectMigration(row: Pick<StoredFileRow, 'bucket_scope' | 'object_key' | 'legacy_key' | 'category'>) {
  const key = row.object_key
  if (row.category === 'certificate' && certificateObjectKeyMatchesLayout(key) && row.bucket_scope === 'docs') {
    return false
  }
  if (row.category === 'change-request' && key.startsWith('quality/change-request/') && row.bucket_scope === 'docs') {
    return false
  }
  const uuidMonthLayout = /^(quality|engineering|office|equipment)\/[^/]+\/\d{4}\/\d{2}\/[0-9a-f-]{36}\./i.test(key)
  if (uuidMonthLayout && (row.bucket_scope === 'docs' || row.bucket_scope === 'media')) {
    return Boolean(row.legacy_key && row.legacy_key === key)
  }
  return row.bucket_scope !== 'docs' && row.bucket_scope !== 'media'
}

export function targetScopeForStoredFile(row: Pick<StoredFileRow, 'domain' | 'category'>) {
  return row.domain === 'equipment' || row.category === 'photo' ? ('media' as const) : ('docs' as const)
}

export async function commitStoredFileMigration(
  id: string,
  scope: StorageScope,
  objectKey: string,
  legacyKey: string,
  sha256: string,
  sizeBytes: number,
) {
  await ensureStoredFilesTable()
  await query(
    `UPDATE stored_files
     SET bucket_scope = $2, object_key = $3, legacy_key = $4, sha256 = $5, size_bytes = $6
     WHERE id = $1 AND deleted_at IS NULL`,
    [id, scope, objectKey, legacyKey, sha256, sizeBytes],
  )
}

export async function softDeleteStoredFile(id: string) {
  await ensureStoredFilesTable()
  await query('UPDATE stored_files SET deleted_at = now() WHERE id = $1 AND deleted_at IS NULL', [id])
}

export async function removeStoredFileObject(row: StoredFileRow) {
  if (row.bucket_scope === 'docs' || row.bucket_scope === 'media') {
    await removeObjectBytes(row.bucket_scope, row.object_key).catch(() => undefined)
  }
}
