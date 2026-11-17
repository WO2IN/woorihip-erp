import { fileKind } from '@/lib/file-types'
import { getStoredFile, putStoredFile, readStoredFileBytes, removeStoredFileObject, softDeleteStoredFile } from '@/lib/stored-files'
import type { ApprovalFile } from '@/lib/approval'

export const APPROVAL_FILE_LIMIT = 5
export const APPROVAL_FILE_BYTES = 8 * 1024 * 1024
export const APPROVAL_FILE_TOTAL = 20 * 1024 * 1024

type Upload = { name: string; data: Buffer }

function safeName(value: string) {
  const base = value.split(/[/\\]/).pop()?.trim() ?? ''
  return base.replace(/[\\/:*?"<>|\r\n]/g, '_').slice(0, 120)
}

export function decodeApprovalFiles(value: unknown): Upload[] {
  if (value == null) return []
  if (!Array.isArray(value)) throw new Error('첨부파일이 올바르지 않습니다.')
  if (value.length > APPROVAL_FILE_LIMIT) throw new Error(`첨부는 ${APPROVAL_FILE_LIMIT}개까지 넣을 수 있습니다.`)

  const files: Upload[] = []
  const used = new Set<string>()
  let total = 0
  for (const item of value) {
    if (!item || typeof item !== 'object') throw new Error('첨부파일이 올바르지 않습니다.')
    const row = item as Record<string, unknown>
    const name = typeof row.name === 'string' ? safeName(row.name) : ''
    const data = typeof row.data === 'string' ? row.data : ''
    if (!name || !data) throw new Error('첨부파일 이름을 확인해 주세요.')
    if (!fileKind(name)) throw new Error(`${name}은 올릴 수 없는 형식입니다.`)
    const buffer = Buffer.from(data, 'base64')
    if (!buffer.length) throw new Error(`${name}이 비어 있습니다.`)
    if (buffer.length > APPROVAL_FILE_BYTES) throw new Error(`${name}은 8MB를 넘습니다.`)
    total += buffer.length
    if (total > APPROVAL_FILE_TOTAL) throw new Error('첨부 용량이 20MB를 넘습니다.')
    let unique = name
    let index = 2
    while (used.has(unique.toLowerCase())) {
      const dot = name.lastIndexOf('.')
      unique = dot > 0 ? `${name.slice(0, dot)} (${index})${name.slice(dot)}` : `${name} (${index})`
      index += 1
    }
    used.add(unique.toLowerCase())
    files.push({ name: unique, data: buffer })
  }
  return files
}

export async function storeApprovalFiles(
  approvalId: string,
  files: Upload[],
  userName: string,
): Promise<ApprovalFile[]> {
  const saved: ApprovalFile[] = []
  try {
    for (const file of files) {
      const kind = fileKind(file.name)
      if (!kind) continue
      const stored = await putStoredFile({
        domain: 'quality',
        category: 'approval',
        buffer: file.data,
        mime: kind.mime,
        ext: kind.ext,
        originalName: file.name,
        ownerType: 'approval',
        ownerId: approvalId,
        uploadedByName: userName,
      })
      saved.push({ id: stored.id, name: file.name, size: file.data.length })
    }
    return saved
  } catch (error) {
    await Promise.all(saved.map((file) => discardApprovalFile(file.id)))
    throw error
  }
}

async function discardApprovalFile(id: string) {
  const row = await getStoredFile(id)
  if (!row) return
  await softDeleteStoredFile(id).catch(() => undefined)
  await removeStoredFileObject(row).catch(() => undefined)
}

export async function readApprovalFile(approvalId: string, fileId: string) {
  const row = await getStoredFile(fileId)
  if (!row || row.owner_type !== 'approval' || row.owner_id !== approvalId) return null
  const data = await readStoredFileBytes(row)
  if (!data?.length) return null
  return { name: row.original_name, mime: row.mime, data }
}
