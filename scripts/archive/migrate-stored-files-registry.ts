/**
 * stored_files 대장에 legacy 경로만 등록합니다 (1단계).
 * npx tsx --env-file=.env.local scripts/migrate-stored-files-registry.ts
 * 객체 이동은 scripts/migrate-stored-files-objects.ts (2단계) 를 실행하세요.
 */
import { readMetadata } from '@/lib/storage'
import { getSetting } from '@/lib/records'
import { normalizeChangeRequest } from '@/lib/change-request'
import { registerLegacyFile, ensureStoredFilesTable } from '@/lib/stored-files'
import { legacyAttachmentPath } from '@/lib/change-request-stored'
import { fileKind } from '@/lib/file-types'

async function main() {
  await ensureStoredFilesTable()
  let docs = 0
  let attachments = 0

  for (const doc of await readMetadata()) {
    if (!doc.storagePath || doc.storagePath === 'INVENTORY' || doc.storagePath === 'MANUAL') continue
    await registerLegacyFile({
      domain: 'quality',
      category: doc.documentType === '성적서' ? 'certificate' : 'document',
      legacyKey: doc.storagePath,
      originalName: doc.originalName || doc.filename,
      ownerType: 'document',
      ownerId: doc.id,
      mime: fileKind(doc.filename)?.mime,
      sizeBytes: doc.fileSize,
      company: doc.company,
      product: doc.product,
      lot: doc.lotStart,
      uploadedBy: doc.createdById,
      uploadedByName: doc.createdBy,
    })
    docs += 1
  }

  const rows = await getSetting<unknown>('development-change-requests', [])
  const list = Array.isArray(rows) ? rows : []
  for (const raw of list) {
    if (!raw || typeof raw !== 'object') continue
    const row = normalizeChangeRequest(raw)
    if (!row) continue
    for (const side of ['before', 'after'] as const) {
      for (const name of side === 'before' ? row.beforeFiles : row.afterFiles) {
        await registerLegacyFile({
          domain: 'quality',
          category: 'change-request',
          legacyKey: legacyAttachmentPath(row.id, side, name),
          originalName: name,
          ownerType: 'change_request',
          ownerId: row.id,
          mime: fileKind(name)?.mime,
          meta: { side },
        })
        attachments += 1
      }
    }
  }

  console.log(`registered documents=${docs} change-request-files=${attachments}`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
