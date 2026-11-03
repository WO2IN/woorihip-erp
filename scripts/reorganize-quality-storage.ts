/**
 * docs 버킷을 quality/certificate/{업체}/{년도}/{파일} 구조로 맞추고,
 * woorihip legacy 경로(0B 포함)를 실제 PDF 바이트로 복구합니다.
 *
 * npx tsx --env-file=.env.local scripts/reorganize-quality-storage.ts --dry-run
 * npx tsx --env-file=.env.local scripts/reorganize-quality-storage.ts
 */
import { createHash } from 'node:crypto'
import type { DocumentMetadata } from '@/lib/types'
import { query } from '@/lib/db'
import {
  buildCertificateObjectKey,
  buildChangeRequestObjectKey,
  buildDocumentObjectKey,
  certificateObjectKeyMatchesLayout,
  commitStoredFileMigration,
  ensureStoredFilesTable,
  parseLegacyCertificatePath,
  readStoredFileBytes,
  type StoredFileRow,
} from '@/lib/stored-files'
import { getObjectBytes, isObjectStorageEnabled, putObjectBytes, removeObjectBytes } from '@/lib/object-storage'
import { yearFromIssueDate } from '@/lib/lot'
import { readMetadata, updateMetadata } from '@/lib/storage'

const dryRun = process.argv.includes('--dry-run')

function metaById(docs: DocumentMetadata[]) {
  return new Map(docs.map((d) => [d.id, d]))
}

function yearForRow(row: StoredFileRow, meta?: DocumentMetadata | null) {
  const fromIssue = meta?.issueDate ? yearFromIssueDate(meta.issueDate) : ''
  if (fromIssue) return fromIssue
  const fromLegacy = row.legacy_key ? parseLegacyCertificatePath(row.legacy_key)?.year : null
  if (fromLegacy) return fromLegacy
  if (row.created_at) return String(new Date(row.created_at).getFullYear())
  return '0000'
}

function companyForRow(row: StoredFileRow, meta?: DocumentMetadata | null) {
  return row.company || meta?.company || parseLegacyCertificatePath(row.legacy_key ?? '')?.company || 'unknown'
}

function fileNameForRow(row: StoredFileRow, meta?: DocumentMetadata | null) {
  if (meta?.filename) return meta.filename
  const legacy = row.legacy_key ? parseLegacyCertificatePath(row.legacy_key) : null
  if (legacy?.fileName) return legacy.fileName
  if (row.legacy_key?.includes('/')) return row.legacy_key.split('/').pop()!
  return row.original_name
}

function targetDocsKey(row: StoredFileRow, meta?: DocumentMetadata | null) {
  if (row.category === 'certificate') {
    return buildCertificateObjectKey(companyForRow(row, meta), yearForRow(row, meta), fileNameForRow(row, meta))
  }
  if (row.category === 'document') {
    return buildDocumentObjectKey(companyForRow(row, meta), yearForRow(row, meta), fileNameForRow(row, meta))
  }
  if (row.category === 'change-request' && row.owner_id && row.meta?.side) {
    return buildChangeRequestObjectKey(row.owner_id, String(row.meta.side), row.original_name)
  }
  return row.object_key
}

async function main() {
  if (!isObjectStorageEnabled()) {
    console.error('MinIO 설정이 필요합니다.')
    process.exit(1)
  }
  await ensureStoredFilesTable()
  const docs = await readMetadata()
  const byId = metaById(docs)

  const rows = await query<StoredFileRow>(
    `SELECT * FROM stored_files WHERE deleted_at IS NULL AND domain = 'quality' ORDER BY created_at ASC`,
  )

  let moved = 0
  let legacyRestored = 0
  let skipped = 0
  let failed = 0

  for (const row of rows) {
    const meta = row.owner_type === 'document' && row.owner_id ? byId.get(row.owner_id) : undefined
    const targetKey = targetDocsKey(row, meta)
    const legacyKey = row.legacy_key ?? (row.category === 'certificate' ? row.object_key : null)

    const bytes = await readStoredFileBytes(row)
    if (!bytes?.length) {
      console.warn(`no bytes id=${row.id} key=${row.object_key}`)
      failed += 1
      continue
    }
    const sha256 = createHash('sha256').update(bytes).digest('hex')
    const mime = row.mime ?? 'application/pdf'

    const needsDocsMove = row.object_key !== targetKey || !certificateObjectKeyMatchesLayout(row.object_key)
    const legacyBytes = legacyKey ? await getObjectBytes('legacy', legacyKey) : null
    const needsLegacyRestore = Boolean(legacyKey && (legacyBytes?.length ?? 0) < bytes.length)

    if (!needsDocsMove && !needsLegacyRestore) {
      skipped += 1
      continue
    }

    if (dryRun) {
      if (needsDocsMove) console.log(`[dry-run] docs ${row.object_key} -> ${targetKey}`)
      if (needsLegacyRestore) console.log(`[dry-run] legacy restore ${legacyKey} (${bytes.length} B)`)
      moved += needsDocsMove ? 1 : 0
      legacyRestored += needsLegacyRestore ? 1 : 0
      continue
    }

    try {
      if (needsDocsMove) {
        await putObjectBytes('docs', targetKey, bytes, mime)
        const verify = await getObjectBytes('docs', targetKey)
        if (!verify?.length || createHash('sha256').update(verify).digest('hex') !== sha256) {
          throw new Error('docs verify failed')
        }
      }

      if (needsLegacyRestore && legacyKey) {
        await putObjectBytes('legacy', legacyKey, bytes, mime)
        const verifyLegacy = await getObjectBytes('legacy', legacyKey)
        if (!verifyLegacy?.length || verifyLegacy.length < bytes.length) {
          throw new Error('legacy restore verify failed')
        }
        legacyRestored += 1
      }

      const finalKey = needsDocsMove ? targetKey : row.object_key
      const legacyForRow = legacyKey && legacyKey !== finalKey ? legacyKey : row.legacy_key

      await commitStoredFileMigration(
        row.id,
        'docs',
        finalKey,
        legacyForRow ?? legacyKey ?? finalKey,
        sha256,
        bytes.length,
      )

      if (row.owner_type === 'document' && row.owner_id) {
        await updateMetadata(row.owner_id, { storagePath: finalKey, storedFileId: row.id })
      }

      if (needsDocsMove && row.object_key !== finalKey) {
        const oldWrong = /^quality\/certificate\/\d{4}\/\d{2}\//.test(row.object_key)
          || /^quality\/[^/]+\/\d{4}\/\d{2}\//.test(row.object_key)
        if (oldWrong) {
          await removeObjectBytes('docs', row.object_key).catch(() => undefined)
        }
      }

      moved += needsDocsMove ? 1 : 0
    } catch (error) {
      failed += 1
      console.error(`failed id=${row.id}`, error)
    }
  }

  console.log(JSON.stringify({ dryRun, total: rows.length, moved, legacyRestored, skipped, failed }))
  if (failed > 0) process.exit(1)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
