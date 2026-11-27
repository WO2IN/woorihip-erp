'use client'

import { useEffect, useState, type FormEvent } from 'react'
import { ExternalLink as ExternalLinkIcon, Link2, Pencil, Plus, X } from 'lucide-react'
import { useAuth } from '@/components/auth/auth-context'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { EXTERNAL_LINK_TITLE_MAX, type ExternalLink } from '@/lib/external-links'
import { cn } from '@/lib/utils'
import { CARD_HEADER } from '@/components/dashboard/card-band'
import { toast } from 'sonner'

const TONES = [
  'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-200',
  'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-200',
  'bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-200',
  'bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-200',
  'bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-200',
  'bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-200',
  'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-200',
  'bg-teal-100 text-teal-700 dark:bg-teal-500/20 dark:text-teal-200',
]

function hostOf(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

export function ExternalLinks() {
  const { user } = useAuth()
  const editable = user?.role === 'editor' || user?.role === 'admin'
  const [links, setLinks] = useState<ExternalLink[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<ExternalLink | null>(null)
  const [removing, setRemoving] = useState<ExternalLink | null>(null)
  const [removeBusy, setRemoveBusy] = useState(false)
  const [title, setTitle] = useState('')
  const [url, setUrl] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    fetch('/api/external-links', { cache: 'no-store' })
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error('links'))))
      .then((body) => { if (!cancelled) setLinks(Array.isArray(body?.data) ? body.data : []) })
      .catch(() => { if (!cancelled) setFailed(true) })
    return () => { cancelled = true }
  }, [])

  function openDialog(link?: ExternalLink) {
    setEditing(link ?? null)
    setTitle(link?.title ?? '')
    setUrl(link?.url ?? '')
    setError('')
    setOpen(true)
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (saving) return
    setSaving(true)
    setError('')
    try {
      const response = await fetch(editing ? `/api/external-links/${editing.id}` : '/api/external-links', {
        method: editing ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, url }),
      })
      const body = await response.json().catch(() => null)
      if (!response.ok) {
        setError(body?.error ?? (editing ? '링크를 수정하지 못했습니다.' : '링크를 등록하지 못했습니다.'))
        return
      }
      setLinks((current) => editing
        ? (current ?? []).map((item) => (item.id === body.data.id ? body.data : item))
        : [...(current ?? []), body.data])
      setOpen(false)
    } catch {
      setError(editing ? '링크를 수정하지 못했습니다.' : '링크를 등록하지 못했습니다.')
    } finally {
      setSaving(false)
    }
  }

  async function confirmRemove() {
    if (!removing || removeBusy) return
    setRemoveBusy(true)
    try {
      const response = await fetch(`/api/external-links/${removing.id}`, { method: 'DELETE' })
      if (response.ok) {
        setLinks((current) => (current ?? []).filter((item) => item.id !== removing.id))
        setRemoving(null)
      } else {
        const body = await response.json().catch(() => null)
        toast.error(body?.error ?? '링크를 삭제하지 못했습니다.')
      }
    } finally {
      setRemoveBusy(false)
    }
  }

  return (
    <section aria-label="링크 바로가기" className="shrink-0 overflow-hidden rounded-2xl border bg-card shadow-sm">
      <div className={cn('flex items-center justify-between px-4 py-3', CARD_HEADER)}>
        <h2 className="flex items-center gap-2.5 text-[15px] font-bold text-white">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-white text-slate-600 shadow-sm ring-1 ring-slate-200 dark:bg-slate-700 dark:text-slate-200 dark:ring-slate-600">
            <Link2 className="h-4 w-4" />
          </span>
          링크 바로가기
        </h2>
        {editable && (
          <button
            type="button"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={() => openDialog()}
            className="inline-flex items-center gap-1 rounded-lg border bg-card px-2.5 py-1 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <Plus className="h-3.5 w-3.5" />
            링크 등록
          </button>
        )}
      </div>

      <div className="p-3">
        {failed ? (
          <p className="rounded-xl border border-dashed px-3 py-4 text-sm text-muted-foreground">링크를 불러오지 못했습니다.</p>
        ) : links === null ? (
          <p className="px-1 py-4 text-sm text-muted-foreground">불러오는 중…</p>
        ) : links.length === 0 ? (
          <p className="rounded-xl border border-dashed px-3 py-4 text-sm text-muted-foreground">
            {editable ? '등록된 링크가 없습니다. 자주 쓰는 외부 사이트를 등록해 보세요.' : '등록된 링크가 없습니다.'}
          </p>
        ) : (
          <ul className="grid grid-cols-3 gap-1 sm:grid-cols-5 xl:grid-cols-10">
            {links.map((link, index) => (
              <li key={link.id} className="group relative">
                <a
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={link.url}
                  onPointerDown={(event) => event.stopPropagation()}
                  className="flex flex-col items-center gap-1.5 rounded-xl px-1 py-2 text-center hover:bg-slate-100 dark:hover:bg-slate-800/70"
                >
                  <span className={cn('flex h-10 w-10 items-center justify-center rounded-xl text-base font-bold', TONES[index % TONES.length])}>
                    {Array.from(link.title)[0]?.toUpperCase()}
                  </span>
                  <span className="line-clamp-2 break-keep text-xs font-medium leading-tight text-slate-700 dark:text-slate-200">{link.title}</span>
                </a>
                {editable && (
                  <div className="absolute right-0.5 top-0.5 hidden items-center gap-0.5 group-hover:flex">
                    <button
                      type="button"
                      aria-label={`${link.title} 수정`}
                      onPointerDown={(event) => event.stopPropagation()}
                      onClick={() => openDialog(link)}
                      className="flex h-5 w-5 items-center justify-center rounded-full border bg-card text-muted-foreground shadow-sm hover:text-blue-600"
                    >
                      <Pencil className="h-3 w-3" />
                    </button>
                    <button
                      type="button"
                      aria-label={`${link.title} 삭제`}
                      onPointerDown={(event) => event.stopPropagation()}
                      onClick={() => setRemoving(link)}
                      className="flex h-5 w-5 items-center justify-center rounded-full border bg-card text-muted-foreground shadow-sm hover:text-rose-600"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent overlayClassName="!z-[70]" className="!z-[80] sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold">{editing ? '링크 수정' : '링크 등록'}</DialogTitle>
            <DialogDescription>
              {editing ? '이름과 웹 주소를 수정할 수 있습니다.' : '자주 쓰는 외부 사이트를 등록하면 누르는 즉시 새 탭으로 열립니다.'}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={submit} className="space-y-4">
            <label className="block space-y-1.5">
              <span className="text-xs font-semibold text-muted-foreground">이름</span>
              <Input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                maxLength={EXTERNAL_LINK_TITLE_MAX}
                placeholder="예) 환경부"
                autoFocus
              />
            </label>
            <label className="block space-y-1.5">
              <span className="text-xs font-semibold text-muted-foreground">웹 주소</span>
              <Input
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                inputMode="url"
                placeholder="예) www.me.go.kr"
              />
            </label>
            {url.trim() && !error && (
              <p className="flex items-center gap-1 text-xs text-muted-foreground">
                <ExternalLinkIcon className="h-3 w-3" />
                {hostOf(/^[a-z][a-z0-9+.-]*:/i.test(url.trim()) ? url.trim() : `https://${url.trim()}`)}
              </p>
            )}
            {error && <p className="text-sm font-medium text-rose-600 dark:text-rose-300">{error}</p>}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>취소</Button>
              <Button type="submit" disabled={saving || !title.trim() || !url.trim()}>{saving ? (editing ? '저장 중…' : '등록 중…') : (editing ? '저장' : '등록')}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={removing != null} onOpenChange={(next) => { if (!next && !removeBusy) setRemoving(null) }}>
        <DialogContent overlayClassName="!z-[70]" className="!z-[80] sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold">링크 삭제</DialogTitle>
            <DialogDescription>삭제하면 모든 사용자의 바로가기에서 사라집니다.</DialogDescription>
          </DialogHeader>
          {removing && (
            <div className="rounded-xl border bg-slate-50/70 px-3 py-2.5 dark:bg-slate-900/40">
              <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">{removing.title}</p>
              <p className="truncate text-xs text-muted-foreground">{hostOf(removing.url)}</p>
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" disabled={removeBusy} onClick={() => setRemoving(null)}>취소</Button>
            <Button type="button" variant="destructive" disabled={removeBusy} onClick={confirmRemove}>{removeBusy ? '삭제 중…' : '삭제'}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  )
}
