import { fileKind } from '@/lib/file-types'
import { getObjectBytes, removeObjectBytes } from '@/lib/object-storage'
import {
  buildChangeRequestObjectKey,
  findStoredFileByOwnerName,
  putStoredFile,
  readStoredFileBytes,
  softDeleteStoredFile,
  removeStoredFileObject,
} from '@/lib/stored-files'

const OWNER = 'change_request'

/** @deprecated 이름 호환. 신규 키는 buildChangeRequestObjectKey */
export function legacyAttachmentPath(id: string, side: 'before' | 'after', name: string) {
  return buildChangeRequestObjectKey(id, side, name)
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
  const key = buildChangeRequestObjectKey(requestId, side, name)
  const fromDocs = await getObjectBytes('docs', key)
  if (fromDocs?.length) return fromDocs
  // 예전 change-requests/… 키 (docs에만 존재할 수 있음)
  const oldKey = `change-requests/${requestId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80)}/${side}/${name.replace(/[\\/]/g, '_')}`
  return getObjectBytes('docs', oldKey)
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
  })
}

export async function removeChangeRequestAttachment(requestId: string, side: 'before' | 'after', name: string) {
  const row = await findStoredFileByOwnerName(OWNER, requestId, name, side)
  if (row) {
    await softDeleteStoredFile(row.id)
    await removeStoredFileObject(row)
    return
  }
  const key = buildChangeRequestObjectKey(requestId, side, name)
  await removeObjectBytes('docs', key).catch(() => undefined)
}
