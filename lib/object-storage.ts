import fs from 'fs'
import path from 'path'
import { Client } from 'minio'
import { getDocumentFilePath } from '@/lib/storage'

const bucket = process.env.MINIO_BUCKET?.trim() || 'woorihip'

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

function isMissingObject(error: unknown) {
  const code = (error as { code?: string })?.code
  return code === 'NotFound' || code === 'NoSuchKey'
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

export async function removeDocumentFile(relativePath: string) {
  if (!relativePath || PLACEHOLDER_PATHS.has(relativePath)) return
  const storage = getClient()
  if (storage) {
    try {
      await storage.removeObject(bucket, toObjectKey(relativePath))
    } catch (error) {
      if (!isMissingObject(error)) throw error
    }
  }
  const absPath = getDocumentFilePath(relativePath)
  if (fs.existsSync(absPath)) fs.unlinkSync(absPath)
}

export async function saveDocumentFile(relativePath: string, body: Buffer, contentType: string) {
  const storage = getClient()
  if (!storage) {
    writeLocalFile(relativePath, body)
    return
  }
  await storage.putObject(bucket, toObjectKey(relativePath), body, body.length, {
    'Content-Type': contentType,
  })
}

export async function loadDocumentFile(relativePath: string) {
  const storage = getClient()
  if (storage) {
    try {
      const stream = await storage.getObject(bucket, toObjectKey(relativePath))
      const chunks: Buffer[] = []
      for await (const chunk of stream) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
      return Buffer.concat(chunks)
    } catch (error) {
      if (!isMissingObject(error)) throw error
    }
  }
  return readLocalFile(relativePath)
}
