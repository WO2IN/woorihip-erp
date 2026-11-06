import sharp from 'sharp'
import {
  getStoredFile,
  putStoredFile,
  readStoredFileBytes,
  removeStoredFileObject,
  softDeleteStoredFile,
} from '@/lib/stored-files'

export const QUALIFICATION_ID_PHOTO_OWNER = 'qualification_ledger_row'

const UUID_RE = /^[a-f0-9-]{36}$/i

export function isQualificationIdPhotoFileId(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value.trim())
}

export function parseDataUrlPhoto(value: unknown): { buffer: Buffer; mime: string } | null {
  if (typeof value !== 'string' || !value.startsWith('data:image/')) return null
  const match = value.match(/^data:([^;]+);base64,(.+)$/s)
  if (!match) return null
  const buffer = Buffer.from(match[2], 'base64')
  if (!buffer.length) return null
  return { buffer, mime: match[1] }
}

export async function uploadQualificationIdPhoto(params: {
  ledgerRowId: string
  buffer: Buffer
  mime: string
  uploadedBy?: string
  uploadedByName?: string
}) {
  const jpeg = await sharp(params.buffer).rotate().jpeg({ quality: 88 }).toBuffer()
  const fileName = `${Date.now()}.jpg`
  const result = await putStoredFile({
    domain: 'quality',
    category: 'qualification-id-photo',
    ownerType: QUALIFICATION_ID_PHOTO_OWNER,
    ownerId: params.ledgerRowId,
    buffer: jpeg,
    mime: 'image/jpeg',
    ext: 'jpg',
    originalName: `qualification-id-${params.ledgerRowId}.jpg`,
    storageFileName: fileName,
    uploadedBy: params.uploadedBy,
    uploadedByName: params.uploadedByName,
  })
  return result.id
}

export async function deleteQualificationIdPhotoFile(fileId: string | undefined | null) {
  if (!isQualificationIdPhotoFileId(fileId)) return
  const row = await getStoredFile(fileId)
  if (!row) return
  await removeStoredFileObject(row)
  await softDeleteStoredFile(fileId)
}

/** 새 data URL, 삭제, 유지 중 하나로 fileId를 정한다. */
export async function reconcileQualificationIdPhoto(input: {
  ledgerRowId: string
  dataUrl?: unknown
  fileId?: unknown
  previousFileId?: string
  uploadedBy?: string
  uploadedByName?: string
}): Promise<string> {
  const parsed = parseDataUrlPhoto(input.dataUrl)
  if (parsed) {
    const newId = await uploadQualificationIdPhoto({
      ledgerRowId: input.ledgerRowId,
      buffer: parsed.buffer,
      mime: parsed.mime,
      uploadedBy: input.uploadedBy,
      uploadedByName: input.uploadedByName,
    })
    if (input.previousFileId && input.previousFileId !== newId) {
      await deleteQualificationIdPhotoFile(input.previousFileId)
    }
    return newId
  }

  const fileId = isQualificationIdPhotoFileId(input.fileId) ? input.fileId.trim() : ''
  if (!fileId) {
    if (input.previousFileId) await deleteQualificationIdPhotoFile(input.previousFileId)
    return ''
  }
  if (input.previousFileId && input.previousFileId !== fileId) {
    await deleteQualificationIdPhotoFile(input.previousFileId)
  }
  return fileId
}

export async function readQualificationIdPhotoBase64(fileId: string) {
  if (!isQualificationIdPhotoFileId(fileId)) return null
  const row = await getStoredFile(fileId)
  if (!row) return null
  const buffer = await readStoredFileBytes(row)
  if (!buffer?.length) return null
  const mime = row.mime ?? 'image/jpeg'
  return { data: `data:${mime};base64,${buffer.toString('base64')}`, mime }
}
