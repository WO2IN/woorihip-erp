'use client'

import { useRef, useState } from 'react'
import { ImagePlusIcon, Loader2Icon, RefreshCwIcon, Trash2Icon } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { addEquipmentPhoto, deleteEquipmentPhoto, updateEquipmentPhoto } from '@/app/actions/equipment'

export interface EquipmentPhoto {
  id: number
  url: string
  label: string | null
}

async function uploadFile(file: File) {
  const formData = new FormData()
  formData.append('file', file)
  const res = await fetch('/api/equipment-photos', { method: 'POST', body: formData })
  if (!res.ok) throw new Error('upload failed')
  const { url } = (await res.json()) as { url: string }
  return url
}

export function PhotoSlot({
  equipmentId,
  label,
  photo,
  size = 'default',
}: {
  equipmentId: number
  label: string
  photo?: EquipmentPhoto
  size?: 'default' | 'large'
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  async function handleFile(file: File) {
    setBusy(true)
    try {
      const url = await uploadFile(file)
      if (photo) {
        await updateEquipmentPhoto(photo.id, equipmentId, url, photo.url)
        toast.success(`${label} 사진을 교체했습니다.`)
      } else {
        await addEquipmentPhoto(equipmentId, url, label)
        toast.success(`${label} 사진을 추가했습니다.`)
      }
    } catch {
      toast.error('사진 업로드에 실패했습니다.')
    } finally {
      setBusy(false)
    }
  }

  async function handleDelete() {
    if (!photo) return
    if (!confirmDelete) {
      setConfirmDelete(true)
      return
    }
    setBusy(true)
    try {
      await deleteEquipmentPhoto(photo.id, equipmentId, photo.url)
      toast.success(`${label} 사진을 삭제했습니다.`)
    } catch {
      toast.error('사진 삭제에 실패했습니다.')
    } finally {
      setBusy(false)
      setConfirmDelete(false)
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-medium">{label}</span>
      <button
        type="button"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
        className={cn(
          'relative flex items-center justify-center overflow-hidden rounded-xl border bg-muted/30 transition-colors',
          size === 'large' ? 'aspect-[16/10] w-full' : 'aspect-square w-full',
          photo ? 'border-border' : 'border-dashed border-border text-muted-foreground hover:bg-muted/60',
        )}
      >
        {photo ? (
          <img src={photo.url} alt={label} className="absolute inset-0 size-full object-cover" />
        ) : (
          <span className="flex flex-col items-center gap-1 text-xs">
            <ImagePlusIcon className="size-6" aria-hidden="true" />
            사진 추가
          </span>
        )}
        {busy && (
          <span className="absolute inset-0 flex items-center justify-center bg-background/70">
            <Loader2Icon className="size-6 animate-spin" aria-hidden="true" />
          </span>
        )}
      </button>
      {photo && (
        <div className="grid grid-cols-2 gap-1.5">
          <button
            type="button"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
            className="flex h-9 items-center justify-center gap-1 rounded-lg border border-border bg-card text-xs font-medium hover:bg-muted"
          >
            <RefreshCwIcon className="size-3.5" aria-hidden="true" />
            교체
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={handleDelete}
            onBlur={() => setConfirmDelete(false)}
            className={cn(
              'flex h-9 items-center justify-center gap-1 rounded-lg border text-xs font-medium',
              confirmDelete
                ? 'border-destructive bg-destructive text-white'
                : 'border-border bg-card text-destructive hover:bg-destructive/10',
            )}
          >
            <Trash2Icon className="size-3.5" aria-hidden="true" />
            {confirmDelete ? '한번 더' : '삭제'}
          </button>
        </div>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) handleFile(file)
          e.target.value = ''
        }}
      />
    </div>
  )
}
