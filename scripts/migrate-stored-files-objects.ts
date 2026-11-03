/**
 * stored_files 대상 MinIO 객체를 docs/media 버킷의 새 경로로 이동합니다.
 * 1) 새 위치에 업로드·해시 검증 2) DB·문서 metadata 갱신 3) legacy 객체 삭제
 *
 * npx tsx --env-file=.env.local scripts/migrate-stored-files-objects.ts
 * npx tsx --env-file=.env.local scripts/migrate-stored-files-objects.ts --dry-run
 * npx tsx --env-file=.env.local scripts/migrate-stored-files-objects.ts --keep-legacy  (복사만, legacy 유지)
 */
import { createHash } from 'node:crypto'
import { query } from '@/lib/db'
import { fileKind } from '@/lib/file-types'
import {
  buildObjectKey,
  commitStoredFileMigration,
  ensureStoredFilesTable,
  readStoredFileBytes,
  storedFileNeedsObjectMigration,
  targetScopeForStoredFile,
  type StoredFileRow,
} from '@/lib/stored-files'
import {
  bucketForScope,
  getObjectBytes,
  isObjectStorageEnabled,
  putObjectBytes,
  removeObjectBytes,
} from '@/lib/object-storage'
import { readMetadata, updateMetadata } from '@/lib/storage'

const args = new Set(process.argv.slice(2))
const dryRun = args.has('--dry-run')
const keepLegacy = args.has('--keep-legacy')

function extForRow(row: StoredFileRow) {
  return fileKind(row.original_name)?.ext ?? fileKind(row.object_key)?.ext ?? 'bin'
}

function mimeForRow(row: StoredFileRow) {
  return row.mime ?? fileKind(row.original_name)?.mime ?? 'application/octet-stream'
}

async function loadSourceBytes(row: StoredFileRow) {
  const fromRow = await readStoredFileBytes(row)
  if (fromRow?.length) return fromRow
  const legacyKey = row.legacy_key ?? row.object_key
  return getObjectBytes('legacy', legacyKey)
}

async function main() {
  if (!isObjectStorageEnabled()) {
    console.error('MinIO가 설정되지 않았습니다. 로컬 파일만 있는 환경에서는 이 스크립트를 사용하지 마세요.')
    process.exit(1)
  }

  await ensureStoredFilesTable()
  const rows = await query<StoredFileRow>(
    'SELECT * FROM stored_files WHERE deleted_at IS NULL ORDER BY created_at ASC',
  )

  let skipped = 0
  let migrated = 0
  let missing = 0
  let failed = 0

  for (const row of rows) {
    if (!storedFileNeedsObjectMigration(row)) {
      skipped += 1
      continue
    }

    const legacyKey = row.legacy_key ?? row.object_key
    const bytes = await loadSourceBytes(row)
    if (!bytes?.length) {
      console.warn(`missing bytes id=${row.id} legacy=${legacyKey}`)
      missing += 1
      continue
    }

    const sha256 = createHash('sha256').update(bytes).digest('hex')
    const scope = targetScopeForStoredFile(row)
    const createdAt = row.created_at ? new Date(row.created_at) : new Date()
    const objectKey = buildObjectKey(row.domain, row.category, extForRow(row), createdAt)
    const mime = mimeForRow(row)

    if (dryRun) {
      console.log(`[dry-run] ${legacyKey} -> ${scope}:${objectKey} (${bytes.length} bytes)`)
      migrated += 1
      continue
    }

    try {
      await putObjectBytes(scope, objectKey, bytes, mime)
      const verify = await getObjectBytes(scope, objectKey)
      if (!verify?.length) throw new Error('new object not readable')
      const verifySha = createHash('sha256').update(verify).digest('hex')
      if (verifySha !== sha256) throw new Error('hash mismatch after upload')

      await commitStoredFileMigration(row.id, scope, objectKey, legacyKey, sha256, bytes.length)

      if (row.owner_type === 'document' && row.owner_id) {
        await updateMetadata(row.owner_id, {
          storagePath: objectKey,
          storedFileId: row.id,
        })
      }

      if (!keepLegacy && legacyKey) {
        await removeObjectBytes('legacy', legacyKey).catch((error) => {
          console.warn(`legacy remove failed ${legacyKey}:`, (error as Error).message)
        })
      }

      migrated += 1
      if (migrated % 25 === 0) {
        console.log(`progress migrated=${migrated} (latest ${objectKey})`)
      }
    } catch (error) {
      failed += 1
      console.error(`failed id=${row.id} legacy=${legacyKey}:`, error)
    }
  }

  const metaSample = (await readMetadata()).filter((d) => d.storedFileId).length
  console.log(
    JSON.stringify({
      dryRun,
      keepLegacy,
      total: rows.length,
      skipped,
      migrated,
      missing,
      failed,
      docsWithStoredFileId: metaSample,
      docsBucket: bucketForScope('docs'),
      mediaBucket: bucketForScope('media'),
      legacyBucket: bucketForScope('legacy'),
    }),
  )

  if (failed > 0) process.exit(1)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
