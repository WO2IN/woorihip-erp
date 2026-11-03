/**
 * docs·media 버킷 객체 버전 관리(삭제·덮어쓰기 복구용)를 켭니다.
 * npx tsx --env-file=.env.local scripts/ensure-minio-versioning.ts
 */
import { Client } from 'minio'
import { bucketForScope } from '@/lib/object-storage'

async function enable(client: Client, bucket: string) {
  const current = await client.getBucketVersioning(bucket).catch(() => ({ Status: 'Suspended' as const }))
  if (current.Status === 'Enabled') {
    console.log(`versioning already enabled ${bucket}`)
    return
  }
  await client.setBucketVersioning(bucket, { Status: 'Enabled' })
  console.log(`versioning enabled ${bucket}`)
}

async function main() {
  const accessKey = process.env.MINIO_ACCESS_KEY?.trim()
  const secretKey = process.env.MINIO_SECRET_KEY?.trim()
  if (!accessKey || !secretKey) {
    console.error('MinIO credentials required')
    process.exit(1)
  }
  const client = new Client({
    endPoint: process.env.MINIO_ENDPOINT?.trim() || '192.168.0.210',
    port: Number(process.env.MINIO_PORT || 9000),
    useSSL: process.env.MINIO_USE_SSL === 'true',
    accessKey,
    secretKey,
  })
  for (const scope of ['docs', 'media'] as const) {
    const bucket = bucketForScope(scope)
    if (!(await client.bucketExists(bucket))) {
      console.error(`bucket missing: ${bucket}`)
      process.exit(1)
    }
    await enable(client, bucket)
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
