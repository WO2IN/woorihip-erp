import type { ChangeRequest } from '@/lib/change-request'
import {
  legacyAttachmentPath,
  loadChangeRequestAttachment,
  removeChangeRequestAttachment,
  saveChangeRequestAttachment,
} from '@/lib/change-request-stored'

export type ChangeRequestFile = {
  side: 'before' | 'after'
  name: string
  data: Buffer
}

const MAX_FILES = 40
const MAX_BYTES = 8 * 1024 * 1024
const PHOTO_NAME = /\.(png|jpe?g|gif|webp)$/i

export function isPhotoName(name: string) {
  return PHOTO_NAME.test(name)
}

export function isPhotoBuffer(buffer: Buffer) {
  if (buffer.length > 8 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) return true
  if (buffer.length > 3 && buffer[0] === 0xff && buffer[1] === 0xd8) return true
  if (buffer.length > 6 && buffer.subarray(0, 3).toString('ascii') === 'GIF') return true
  return buffer.length > 12 && buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP'
}

export { legacyAttachmentPath }

export function decodeAttachments(value: unknown): ChangeRequestFile[] {
  if (!Array.isArray(value)) return []
  const files: ChangeRequestFile[] = []
  for (const item of value) {
    if (!item || typeof item !== 'object') continue
    const row = item as Record<string, unknown>
    const side = row.side === 'before' || row.side === 'after' ? row.side : null
    const name = typeof row.name === 'string' ? row.name.trim().slice(0, 120) : ''
    const data = typeof row.data === 'string' ? row.data : ''
    if (!side || !name || !data) continue
    const buffer = Buffer.from(data, 'base64')
    if (!buffer.length || buffer.length > MAX_BYTES) continue
    if (!isPhotoName(name) || !isPhotoBuffer(buffer)) throw new Error('첨부는 png, jpg 사진만 올릴 수 있습니다.')
    files.push({ side, name, data: buffer })
  }
  return files.slice(0, MAX_FILES)
}

export function filesForRow(row: ChangeRequest, uploaded: ChangeRequestFile[], stored: ChangeRequestFile[]) {
  const pick = (side: 'before' | 'after', names: string[]) => names.flatMap((name) => {
    const fresh = uploaded.find((file) => file.side === side && file.name === name)
    if (fresh) return [fresh]
    const saved = stored.find((file) => file.side === side && file.name === name)
    return saved ? [saved] : []
  })
  return [...pick('before', row.beforeFiles), ...pick('after', row.afterFiles)]
}

export async function loadStoredAttachments(row: ChangeRequest) {
  const files: ChangeRequestFile[] = []
  for (const side of ['before', 'after'] as const) {
    for (const name of side === 'before' ? row.beforeFiles : row.afterFiles) {
      try {
        const data = await loadChangeRequestAttachment(row.id, side, name)
        if (data?.length) files.push({ side, name, data })
      } catch {
        // 없는 첨부는 이름만 남긴다.
      }
    }
  }
  return files
}

export async function storeUploadedAttachments(row: ChangeRequest, uploaded: ChangeRequestFile[], previous?: ChangeRequest | null) {
  for (const side of ['before', 'after'] as const) {
    const incoming = uploaded.filter((file) => file.side === side && (side === 'before' ? row.beforeFiles : row.afterFiles).includes(file.name))
    if (!incoming.length) continue
    const names = side === 'before' ? row.beforeFiles : row.afterFiles
    const oldNames = previous ? (side === 'before' ? previous.beforeFiles : previous.afterFiles) : []
    for (const name of oldNames) {
      if (names.includes(name)) continue
      await removeChangeRequestAttachment(row.id, side, name).catch(() => undefined)
    }
    for (const file of incoming) {
      await saveChangeRequestAttachment(row.id, side, file.name, file.data)
    }
  }
}

export async function removeRequestAttachments(row: ChangeRequest) {
  for (const side of ['before', 'after'] as const) {
    for (const name of side === 'before' ? row.beforeFiles : row.afterFiles) {
      await removeChangeRequestAttachment(row.id, side, name).catch(() => undefined)
    }
  }
}
