/**
 * legacy 없이 docs/media만으로 모든 등록 파일을 읽을 수 있는지 검증합니다.
 * npx tsx --env-file=.env.local scripts/verify-primary-storage.ts
 */
import { query } from '@/lib/db'
import { getObjectBytes, isObjectStorageEnabled, loadDocumentFile } from '@/lib/object-storage'
import { ensureStoredFilesTable, type StoredFileRow } from '@/lib/stored-files'
import { readMetadata } from '@/lib/storage'

async function main() {
  if (!isObjectStorageEnabled()) {
    console.error('MinIO required')
    process.exit(1)
  }
  await ensureStoredFilesTable()
  let fail = 0
  const rows = await query<StoredFileRow>(
    'SELECT * FROM stored_files WHERE deleted_at IS NULL ORDER BY created_at',
  )
  for (const row of rows) {
    const data = await getObjectBytes(row.bucket_scope === 'legacy' ? 'docs' : row.bucket_scope, row.object_key)
    if (!data?.length && row.bucket_scope === 'docs') {
      const mediaTry = await getObjectBytes('media', row.object_key)
      if (!mediaTry?.length) {
        console.error(`stored_file missing id=${row.id} key=${row.object_key}`)
        fail += 1
      }
    } else if (!data?.length) {
      console.error(`stored_file missing id=${row.id} scope=${row.bucket_scope} key=${row.object_key}`)
      fail += 1
    }
  }

  const docs = await readMetadata()
  for (const doc of docs) {
    if (!doc.storagePath || doc.storagePath === 'INVENTORY' || doc.storagePath === 'MANUAL') continue
    const buf = await loadDocumentFile(doc.storagePath)
    if (!buf?.length) {
      console.error(`metadata missing file id=${doc.id} path=${doc.storagePath}`)
      fail += 1
    }
  }

  console.log(JSON.stringify({ stored_files: rows.length, metadata_checked: docs.length, fail }))
  if (fail > 0) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
