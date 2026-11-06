import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { QUALIFICATION_ID_PHOTO_PLACEHOLDER_URL } from '@/lib/qualification-id-photo-placeholder'

const PLACEHOLDER_FILE = path.join(process.cwd(), 'public', QUALIFICATION_ID_PHOTO_PLACEHOLDER_URL.replace(/^\//, ''))

export async function readQualificationIdPhotoPlaceholderDataUrl() {
  const buffer = await readFile(PLACEHOLDER_FILE)
  return { data: `data:image/png;base64,${buffer.toString('base64')}`, mime: 'image/png' as const }
}
