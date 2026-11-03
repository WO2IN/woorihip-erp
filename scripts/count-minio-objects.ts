/**
 * npx tsx --env-file=.env.local scripts/count-minio-objects.ts
 */
import { Client } from 'minio'
import { bucketForScope } from '@/lib/object-storage'

async function countBucket(client: Client, bucket: string) {
  const byPrefix = new Map<string, number>()
  let total = 0
  const stream = client.listObjectsV2(bucket, '', true)
  for await (const obj of stream) {
    if (!obj.name) continue
    total += 1
    const top = obj.name.includes('/') ? obj.name.split('/')[0]! : obj.name
    byPrefix.set(top, (byPrefix.get(top) ?? 0) + 1)
  }
  return { total, byPrefix: Object.fromEntries([...byPrefix.entries()].sort((a, b) => b[1] - a[1])) }
}

async function main() {
  const client = new Client({
    endPoint: process.env.MINIO_ENDPOINT?.trim() || '192.168.0.210',
    port: Number(process.env.MINIO_PORT || 9000),
    useSSL: process.env.MINIO_USE_SSL === 'true',
    accessKey: process.env.MINIO_ACCESS_KEY!.trim(),
    secretKey: process.env.MINIO_SECRET_KEY!.trim(),
  })
  const legacy = bucketForScope('legacy')
  const docs = bucketForScope('docs')
  const [leg, doc] = await Promise.all([countBucket(client, legacy), countBucket(client, docs)])
  console.log(JSON.stringify({ legacy: { bucket: legacy, ...leg }, docs: { bucket: docs, ...doc } }, null, 2))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
