/**
 * 신규 버킷이 없으면 생성합니다. 기존 버킷·객체는 변경하지 않습니다.
 * npx tsx --env-file=.env.local scripts/ensure-minio-buckets.ts
 */
import { Client } from 'minio'

function bucketsToEnsure() {
  const names = new Set<string>()
  names.add(process.env.MINIO_DOCS_BUCKET?.trim() || 'woorihip-docs')
  names.add(process.env.MINIO_MEDIA_BUCKET?.trim() || 'woorihip-media')
  const backup = process.env.MINIO_BACKUP_BUCKET?.trim()
  if (backup) names.add(backup)
  return [...names]
}

async function main() {
  const accessKey = process.env.MINIO_ACCESS_KEY?.trim()
  const secretKey = process.env.MINIO_SECRET_KEY?.trim()
  if (!accessKey || !secretKey) {
    console.log('MinIO credentials not set; skipped.')
    return
  }
  const client = new Client({
    endPoint: process.env.MINIO_ENDPOINT?.trim() || '192.168.0.210',
    port: Number(process.env.MINIO_PORT || 9000),
    useSSL: process.env.MINIO_USE_SSL === 'true',
    accessKey,
    secretKey,
  })
  for (const name of bucketsToEnsure()) {
    const exists = await client.bucketExists(name)
    if (exists) {
      console.log(`ok exists ${name}`)
      continue
    }
    await client.makeBucket(name, '')
    console.log(`created ${name}`)
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
