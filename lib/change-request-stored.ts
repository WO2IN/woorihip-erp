import { fileKind } from '@/lib/file-types'
import { loadAttachmentFile } from '@/lib/object-storage'
import {
  findStoredFileByOwnerName,
  putStoredFile,
  readStoredFileBytes,
  registerLegacyFile,
  softDeleteStoredFile,
  removeStoredFileObject,
} from '@/lib/stored-files'

const OWNER = 'change_request'

export function legacyAttachmentPath(id: string, side: 'before' | 'after', name: string) {
  const safeId = id.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80)
  const safeName = name.replace(/[\\/]/g, '_').replace(/\.\./g, '_').trim().slice(0, 80)
  if (!safeId || !safeName) throw new Error('잘못된 첨부 경로입니다.')
  return `change-requests/${safeId}/${side}/${safeName}`
}

function mimeForName(name: string) {
  return fileKind(name)?.mime ?? 'application/octet-stream'
}

function extForName(name: string) {
  return fileKind(name)?.ext ?? 'png'
}

export async function loadChangeRequestAttachment(requestId: string, side: 'before' | 'after', name: string) {
  const row = await findStoredFileByOwnerName(OWNER, requestId, name, side)
  if (row) {
    const data = await readStoredFileBytes(row)
    if (data?.length) return data
  }
  const legacyKey = legacyAttachmentPath(requestId, side, name)
  const legacy = await loadAttachmentFile(legacyKey)
  if (legacy?.length) {
    await registerLegacyFile({
      domain: 'quality',
      category: 'change-request',
      legacyKey,
      originalName: name,
      ownerType: OWNER,
      ownerId: requestId,
      mime: mimeForName(name),
      sizeBytes: legacy.length,
      meta: { side },
    }).catch(() => undefined)
    return legacy
  }
  return null
}

export async function saveChangeRequestAttachment(requestId: string, side: 'before' | 'after', name: string, data: Buffer) {
  const existing = await findStoredFileByOwnerName(OWNER, requestId, name, side)
  if (existing) {
    await softDeleteStoredFile(existing.id)
    await removeStoredFileObject(existing)
  }
  await putStoredFile({
    domain: 'quality',
    category: 'change-request',
    buffer: data,
    mime: mimeForName(name),
    ext: extForName(name),
    originalName: name,
    storageFileName: name,
    ownerType: OWNER,
    ownerId: requestId,
    meta: { side },
    legacyKey: legacyAttachmentPath(requestId, side, name),
  })
}

export async function removeChangeRequestAttachment(requestId: string, side: 'before' | 'after', name: string) {
  const row = await findStoredFileByOwnerName(OWNER, requestId, name, side)
  if (row) {
    await softDeleteStoredFile(row.id)
    await removeStoredFileObject(row)
    return
  }
  // 레지스트리 없는 예전 파일만 MinIO legacy 경로 삭제 (이미 새 경로로 옮긴 객체는 건드리지 않음)
  const { removeAttachmentFile } = await import('@/lib/object-storage')
  await removeAttachmentFile(legacyAttachmentPath(requestId, side, name)).catch(() => undefined)
}
