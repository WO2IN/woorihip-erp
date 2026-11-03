/**
 * woorihip legacy uploads/equipment-photos/* → woorihip-media (동일 object key).
 * npx tsx --env-file=.env.local scripts/migrate-equipment-photos-to-media.ts [--dry-run] [--keep-legacy]
 */
import { createHash } from 'node:crypto'
import { Client } from 'minio'
import { bucketForScope, getObjectBytes, isObjectStorageEnabled, putObjectBytes, removeObjectBytes } from '@/lib/object-storage'

const PREFIX = 'uploads/equipment-photos/'
const dryRun = process.argv.includes('--dry-run')
const keepLegacy = process.argv.includes('--keep-legacy')

const MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
}

function mimeForKey(key: string) {
  const ext = key.split('.').pop()?.toLowerCase() ?? ''
  return MIME[ext] ?? 'application/octet-stream'
}

async function main() {
  if (!isObjectStorageEnabled()) {
    console.error('MinIO 설정이 필요합니다.')
    process.exit(1)
  }
  const legacyBucket = bucketForScope('legacy')
  const mediaBucket = bucketForScope('media')
  const client = new Client({
    endPoint: process.env.MINIO_ENDPOINT?.trim() || '192.168.0.210',
    port: Number(process.env.MINIO_PORT || 9000),
    useSSL: process.env.MINIO_USE_SSL === 'true',
    accessKey: process.env.MINIO_ACCESS_KEY!.trim(),
    secretKey: process.env.MINIO_SECRET_KEY!.trim(),
  })

  const keys: string[] = []
  for await (const obj of client.listObjectsV2(legacyBucket, PREFIX, true)) {
    if (obj.name && !obj.name.endsWith('/')) keys.push(obj.name)
  }

  let moved = 0
  let skipped = 0
  let failed = 0

  for (const key of keys) {
    const legacyBytes = await getObjectBytes('legacy', key)
    if (!legacyBytes?.length) {
      console.warn(`skip empty/missing legacy ${key}`)
      failed += 1
      continue
    }
    const sha = createHash('sha256').update(legacyBytes).digest('hex')
    const existingMedia = await getObjectBytes('media', key)
    if (existingMedia?.length) {
      const existingSha = createHash('sha256').update(existingMedia).digest('hex')
      if (existingSha === sha) {
        skipped += 1
        if (!dryRun && !keepLegacy) {
          await removeObjectBytes('legacy', key).catch(() => undefined)
        }
        continue
      }
    }

    if (dryRun) {
      console.log(`[dry-run] ${key} (${legacyBytes.length} B) -> media:${mediaBucket}`)
      moved += 1
      continue
    }

    try {
      await putObjectBytes('media', key, legacyBytes, mimeForKey(key))
      const verify = await getObjectBytes('media', key)
      if (!verify?.length || createHash('sha256').update(verify).digest('hex') !== sha) {
        throw new Error('verify failed')
      }
      if (!keepLegacy) {
        await removeObjectBytes('legacy', key)
      }
      moved += 1
    } catch (error) {
      failed += 1
      console.error(`failed ${key}`, error)
    }
  }

  console.log(JSON.stringify({
    dryRun,
    keepLegacy,
    legacyBucket,
    mediaBucket,
    listed: keys.length,
    moved,
    skipped,
    failed,
  }))
  if (failed > 0) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
