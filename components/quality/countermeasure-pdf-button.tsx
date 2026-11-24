'use client'

import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { useAuth } from '@/components/auth/auth-context'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { getAuthHeaders, getJsonAuthHeaders } from '@/lib/auth-client'
import type { CountermeasureFile } from '@/lib/non-conformity'
import { cn } from '@/lib/utils'

export function CountermeasurePdfButton({
  kind,
  recordId,
  file,
  editable,
  onChange,
  className,
}: {
  kind: 'customer' | 'process'
  recordId: string
  file?: CountermeasureFile | null
  editable: boolean
  onChange: (file: CountermeasureFile | null) => void
  className?: string
}) {
  const { user } = useAuth()
  const inputRef = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const saved = Boolean(file?.id)

  async function upload(next: File) {
    if (!user) return
    setBusy(true)
    try {
      const body = new FormData()
      body.set('kind', kind)
      body.set('id', recordId)
      body.set('file', next)
      const res = await fetch('/api/quality/countermeasure-pdf', { method: 'POST', headers: getAuthHeaders(user), body })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(typeof json.error === 'string' ? json.error : '대책서를 저장하지 못했습니다.')
        return
      }
      onChange(json.data as CountermeasureFile)
      setOpen(true)
      toast.success('대책서를 저장했습니다.')
    } catch {
      toast.error('대책서를 저장하지 못했습니다.')
    } finally {
      setBusy(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  async function remove() {
    if (!user || !file) return
    setBusy(true)
    try {
      const res = await fetch('/api/quality/countermeasure-pdf', {
        method: 'DELETE',
        headers: getJsonAuthHeaders(user),
        body: JSON.stringify({ kind, id: recordId }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(typeof json.error === 'string' ? json.error : '대책서를 삭제하지 못했습니다.')
        return
      }
      onChange(null)
      setOpen(false)
      toast.success('대책서를 삭제했습니다.')
    } catch {
      toast.error('대책서를 삭제하지 못했습니다.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <button
        type="button"
        disabled={busy}
        title={saved ? file?.name : 'PDF를 올립니다'}
        onClick={() => {
          if (saved) {
            setOpen(true)
            return
          }
          if (!editable) {
            toast.message('등록된 대책서가 없습니다.')
            return
          }
          inputRef.current?.click()
        }}
        className={cn(
          'rounded-md border px-2 py-1.5 font-medium disabled:opacity-60',
          saved ? 'border-emerald-600 bg-emerald-600 text-white hover:bg-emerald-700' : 'bg-white text-slate-600 hover:bg-slate-50 dark:bg-background',
          className,
        )}
      >
        대책서
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,.pdf"
        className="hidden"
        onChange={(event) => {
          const next = event.target.files?.[0]
          if (next) void upload(next)
        }}
      />
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="flex max-h-[90vh] flex-col gap-3 sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>대책서</DialogTitle>
          </DialogHeader>
          {file ? (
            <>
              <p className="truncate text-sm text-muted-foreground">{file.name}</p>
              <iframe title={file.name} src={`/api/files/${file.id}`} className="h-[70vh] w-full rounded-md border bg-muted" />
              {editable ? (
                <div className="flex justify-end gap-2">
                  <button type="button" disabled={busy} className="rounded-md border px-3 py-1.5 text-sm" onClick={() => inputRef.current?.click()}>변경</button>
                  <button type="button" disabled={busy} className="rounded-md border px-3 py-1.5 text-sm text-destructive" onClick={() => void remove()}>삭제</button>
                </div>
              ) : null}
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  )
}
