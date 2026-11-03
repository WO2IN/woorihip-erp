/**
 * woorihip(legacy) 버킷 객체 전부 삭제. docs/media 검증 후에만 실행하세요.
 * npx tsx --env-file=.env.local scripts/verify-primary-storage.ts
 * npx tsx --env-file=.env.local scripts/purge-legacy-bucket.ts --confirm
 */
import { Client } from 'minio'
import { bucketForScope, isObjectStorageEnabled } from '@/lib/object-storage'

async function main() {
  if (!process.argv.includes('--confirm')) {
    console.error('Add --confirm to delete all objects in the legacy bucket.')
    process.exit(1)
  }
  if (!isObjectStorageEnabled()) {
    console.error('MinIO required')
    process.exit(1)
  }
  const bucket = bucketForScope('legacy')
  const client = new Client({
    endPoint: process.env.MINIO_ENDPOINT?.trim() || '192.168.0.210',
    port: Number(process.env.MINIO_PORT || 9000),
    useSSL: process.env.MINIO_USE_SSL === 'true',
    accessKey: process.env.MINIO_ACCESS_KEY!.trim(),
    secretKey: process.env.MINIO_SECRET_KEY!.trim(),
  })
  if (!(await client.bucketExists(bucket))) {
    console.log(`bucket ${bucket} does not exist; nothing to purge`)
    return
  }
  const keys: string[] = []
  for await (const obj of client.listObjectsV2(bucket, '', true)) {
    if (obj.name) keys.push(obj.name)
  }
  let removed = 0
  for (const key of keys) {
    await client.removeObject(bucket, key)
    removed += 1
    if (removed % 100 === 0) console.log(`removed ${removed}/${keys.length}`)
  }
  console.log(JSON.stringify({ bucket, removed }))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
