import fs from 'fs'
import path from 'path'
import { Client } from 'minio'
import { getDocumentFilePath } from '@/lib/storage'

/** legacy: 예전 단일 버킷(마이그레이션·purge 스크립트용). 앱 런타임은 docs/media만 사용 */
export type StorageScope = 'legacy' | 'docs' | 'media' | 'backup'

export function bucketForScope(scope: StorageScope) {
  switch (scope) {
    case 'docs':
      return process.env.MINIO_DOCS_BUCKET?.trim() || 'woorihip-docs'
    case 'media':
      return process.env.MINIO_MEDIA_BUCKET?.trim() || 'woorihip-media'
    case 'backup':
      return process.env.MINIO_BACKUP_BUCKET?.trim() || 'woorihip-backup'
    default:
      return process.env.MINIO_BUCKET?.trim() || 'woorihip'
  }
}

let client: Client | null = null

export function isObjectStorageEnabled() {
  return Boolean(process.env.MINIO_ACCESS_KEY?.trim() && process.env.MINIO_SECRET_KEY?.trim())
}

function getClient() {
  if (!isObjectStorageEnabled()) return null
  if (!client) {
    client = new Client({
      endPoint: process.env.MINIO_ENDPOINT?.trim() || '192.168.0.210',
      port: Number(process.env.MINIO_PORT || 9000),
      useSSL: process.env.MINIO_USE_SSL === 'true',
      accessKey: process.env.MINIO_ACCESS_KEY!.trim(),
      secretKey: process.env.MINIO_SECRET_KEY!.trim(),
    })
  }
  return client
}

export function toObjectKey(relativePath: string) {
  const key = relativePath.replace(/\\/g, '/').replace(/^\/+/, '')
  if (!key || key.split('/').includes('..')) {
    throw new Error('잘못된 파일 경로입니다.')
  }
  return key
}

export function scopeForObjectKey(key: string): StorageScope {
  if (/^uploads\//.test(key)) return 'media'
  return 'docs'
}

function isMissingObject(error: unknown) {
  const code = (error as { code?: string })?.code
  return code === 'NotFound' || code === 'NoSuchKey' || code === 'NoSuchBucket'
}

function readLocalFile(relativePath: string) {
  const absPath = getDocumentFilePath(relativePath)
  if (!fs.existsSync(absPath)) return null
  return fs.readFileSync(absPath)
}

function writeLocalFile(relativePath: string, body: Buffer) {
  const absPath = getDocumentFilePath(relativePath)
  fs.mkdirSync(path.dirname(absPath), { recursive: true })
  fs.writeFileSync(absPath, body)
}

const PLACEHOLDER_PATHS = new Set(['INVENTORY', 'MANUAL'])

async function removeObject(scope: StorageScope, relativePath: string) {
  if (!relativePath || PLACEHOLDER_PATHS.has(relativePath)) return
  const storage = getClient()
  if (storage) {
    try {
      await storage.removeObject(bucketForScope(scope), toObjectKey(relativePath))
    } catch (error) {
      if (!isMissingObject(error)) throw error
    }
  }
  const absPath = getDocumentFilePath(relativePath)
  if (fs.existsSync(absPath)) fs.unlinkSync(absPath)
}

export async function getObjectBytes(scope: StorageScope, relativePath: string) {
  const storage = getClient()
  if (storage) {
    try {
      const stream = await storage.getObject(bucketForScope(scope), toObjectKey(relativePath))
      const chunks: Buffer[] = []
      for await (const chunk of stream) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
      const data = Buffer.concat(chunks)
      if (data.length) return data
    } catch (error) {
      if (!isMissingObject(error)) throw error
    }
  }
  return readLocalFile(relativePath)
}

export async function putObjectBytes(scope: StorageScope, relativePath: string, body: Buffer, contentType: string) {
  const storage = getClient()
  if (!storage) {
    writeLocalFile(relativePath, body)
    return
  }
  await storage.putObject(bucketForScope(scope), toObjectKey(relativePath), body, body.length, {
    'Content-Type': contentType,
  })
}

export async function removeObjectBytes(scope: StorageScope, relativePath: string) {
  await removeObject(scope, relativePath)
}

export async function removeDocumentFile(relativePath: string) {
  await removeObject(scopeForObjectKey(relativePath), relativePath)
}

export async function loadDocumentFile(relativePath: string) {
  return getObjectBytes(scopeForObjectKey(relativePath), relativePath)
}

export async function loadMediaFile(relativePath: string) {
  return getObjectBytes('media', relativePath)
}
