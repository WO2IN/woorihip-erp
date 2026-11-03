'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { useAuth } from '@/components/auth/auth-context'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,  
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { LogOut, User, ShieldCheck, Eye, Pencil, PenLine, Trash2, Upload } from 'lucide-react'
import { SessionUser, UserRole } from '@/lib/types'

const ROLE_LABEL: Record<UserRole, string> = {
  viewer: '뷰어',
  editor: '편집자',
  admin: '관리자',
}

const ROLE_ICON: Record<UserRole, React.ReactNode> = {
  viewer: <Eye className="w-3 h-3" />,
  editor: <Pencil className="w-3 h-3" />,
  admin: <ShieldCheck className="w-3 h-3" />,
}

const ROLE_COLOR: Record<UserRole, string> = {
  viewer: 'text-muted-foreground',
  editor: 'text-blue-500',
  admin: 'text-amber-500',
}

export function UserMenu() {
  const { user, logout, replaceUser } = useAuth()
  const [accountOpen, setAccountOpen] = useState(false)
  if (!user) return null

  return (
    <>
    <DropdownMenu>
      <DropdownMenuTrigger
        className="inline-flex items-center gap-2 h-8 px-2.5 text-sm font-medium hover:bg-muted rounded-lg outline-none"
        aria-label="사용자 메뉴"
      >
        <div className="w-6 h-6 rounded-full bg-primary/15 flex items-center justify-center flex-shrink-0">
          <User className="w-3.5 h-3.5 text-primary" />
        </div>

        <span className="hidden sm:block max-w-[100px] truncate text-foreground">
          {user.displayName}
        </span>

        <span
          className={`hidden sm:flex items-center gap-0.5 text-[11px] font-medium ${ROLE_COLOR[user.role]}`}
        >
          {ROLE_ICON[user.role]}
        </span>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="font-normal">
            <div className="flex flex-col gap-0.5">
              <p className="text-sm font-semibold text-foreground truncate">
                {user.displayName}
              </p>

              <p className={`text-xs flex items-center gap-1 ${ROLE_COLOR[user.role]}`}>
                {ROLE_ICON[user.role]}
                {ROLE_LABEL[user.role]}
              </p>
            </div>
          </DropdownMenuLabel>

          <DropdownMenuSeparator />

          <DropdownMenuItem onClick={() => setAccountOpen(true)} className="cursor-pointer gap-2">
            <User className="w-4 h-4" />
            내 정보
          </DropdownMenuItem>

          <DropdownMenuItem
            onClick={logout}
            className="text-destructive focus:text-destructive focus:bg-destructive/10 cursor-pointer gap-2"
          >
            <LogOut className="w-4 h-4" />
            로그아웃
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
    <AccountDialog user={user} open={accountOpen} onOpenChange={setAccountOpen} onSaved={replaceUser} />
    </>
  )
}

function AccountDialog({ user, open, onOpenChange, onSaved }: { user: SessionUser; open: boolean; onOpenChange: (open: boolean) => void; onSaved: (user: SessionUser) => void }) {
  const [savedPreview, setSavedPreview] = useState<string | null>(null)
  const [pickedPreview, setPickedPreview] = useState<string | null>(null)
  const [picked, setPicked] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    let objectUrl = ''
    fetch('/api/auth/signature', { cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok || cancelled) return
        objectUrl = URL.createObjectURL(await response.blob())
        if (!cancelled) setSavedPreview(objectUrl)
      })
      .catch(() => {})
    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
      setSavedPreview(null)
      setPicked(null)
      setPickedPreview((current) => {
        if (current) URL.revokeObjectURL(current)
        return null
      })
    }
  }, [open])

  const preview = pickedPreview || savedPreview

  const save = async () => {
    if (!picked) return
    setSaving(true)
    try {
      const body = new FormData()
      body.append('file', picked)
      const response = await fetch('/api/auth/signature', { method: 'PUT', body })
      const result = await response.json().catch(() => null)
      if (!response.ok || !result?.user) {
        toast.error(result?.error || '서명을 저장하지 못했습니다.')
        return
      }
      onSaved(result.user)
      setPicked(null)
      setPickedPreview((current) => {
        if (current) URL.revokeObjectURL(current)
        return null
      })
      const saved = await fetch('/api/auth/signature', { cache: 'no-store' })
      if (saved.ok) {
        const url = URL.createObjectURL(await saved.blob())
        setSavedPreview((current) => {
          if (current) URL.revokeObjectURL(current)
          return url
        })
      }
      toast.success('서명을 저장했습니다. 흰 배경은 지우고 결재칸 크기에 맞춥니다.')
    } catch {
      toast.error('서명을 저장하지 못했습니다.')
    } finally {
      setSaving(false)
    }
  }

  const remove = async () => {
    setSaving(true)
    try {
      const response = await fetch('/api/auth/signature', { method: 'DELETE' })
      const result = await response.json().catch(() => null)
      if (!response.ok || !result?.user) {
        toast.error(result?.error || '서명을 지우지 못했습니다.')
        return
      }
      onSaved(result.user)
      setSavedPreview(null)
      setPicked(null)
      setPickedPreview((current) => {
        if (current) URL.revokeObjectURL(current)
        return null
      })
      toast.success('서명을 지웠습니다.')
    } catch {
      toast.error('서명을 지우지 못했습니다.')
    } finally {
      setSaving(false)
    }
  }

  const pick = (file: File | null) => {
    setPicked(file)
    setPickedPreview((current) => {
      if (current) URL.revokeObjectURL(current)
      return file ? URL.createObjectURL(file) : null
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-5 sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>내 정보</DialogTitle>
          <DialogDescription>로그인한 계정과 결재에 쓰는 서명입니다.</DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-4 rounded-xl border bg-muted/30 p-4">
          <div className="flex size-14 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xl font-bold text-primary">
            {user.displayName.slice(0, 1)}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="truncate text-lg font-semibold">{user.displayName}</p>
              <span className={`inline-flex items-center gap-1 rounded-full border bg-background px-2 py-0.5 text-[11px] font-medium ${ROLE_COLOR[user.role]}`}>
                {ROLE_ICON[user.role]}
                {ROLE_LABEL[user.role]}
              </span>
            </div>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {user.username}
              {user.floor ? ` · ${user.floor}층 담당` : ''}
            </p>
          </div>
        </div>

        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold">서명</p>
              <p className="text-xs text-muted-foreground">결재칸의 서명하기를 누르면 이 서명이 들어갑니다.</p>
            </div>
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${preview ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-300' : 'bg-muted text-muted-foreground'}`}>
              {picked ? '저장 전' : preview ? '등록됨' : '미등록'}
            </span>
          </div>

          <div className="grid grid-cols-[minmax(0,1fr)_88px] gap-3">
            <div
              className="flex h-32 items-center justify-center rounded-lg border"
              style={{ backgroundColor: '#ffffff', backgroundImage: 'linear-gradient(45deg, #f1f5f9 25%, transparent 25%), linear-gradient(-45deg, #f1f5f9 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #f1f5f9 75%), linear-gradient(-45deg, transparent 75%, #f1f5f9 75%)', backgroundSize: '16px 16px', backgroundPosition: '0 0, 0 8px, 8px -8px, -8px 0' }}
            >
              {preview
                ? <img src={preview} alt={`${user.displayName} 서명`} className="max-h-28 max-w-[90%] object-contain" />
                : (
                  <div className="flex flex-col items-center gap-1 text-muted-foreground">
                    <PenLine className="size-5" />
                    <p className="text-sm">아직 서명이 없습니다.</p>
                  </div>
                )}
            </div>
            <div className="flex flex-col overflow-hidden rounded-lg border bg-white text-black">
              <span className="border-b py-1 text-center text-[10px] font-semibold text-slate-500">결재칸</span>
              <div className="flex flex-1 items-center justify-center p-1.5">
                {preview
                  ? <img src={preview} alt="" className="max-h-full max-w-full object-contain" />
                  : <span className="text-[10px] text-slate-400">미리보기</span>}
              </div>
            </div>
          </div>

          <label className="relative flex cursor-pointer items-center justify-center gap-2 overflow-hidden rounded-lg border border-dashed px-3 py-3 text-sm font-medium text-muted-foreground transition-colors hover:border-primary/50 hover:bg-primary/5 hover:text-primary">
            <Upload className="size-4" />
            <span className="truncate">{picked ? picked.name : preview ? '다른 서명으로 바꾸기' : '서명 그림 올리기'}</span>
            <input
              key={savedPreview ? 'saved' : 'empty'}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="absolute inset-0 cursor-pointer opacity-0"
              onChange={(event) => pick(event.target.files?.[0] ?? null)}
            />
          </label>
        </section>

        <DialogFooter className="sm:justify-between">
          {savedPreview
            ? <Button type="button" variant="ghost" className="text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={remove} disabled={saving}><Trash2 className="size-4" />서명 삭제</Button>
            : <span />}
          <div className="flex gap-2">
            {picked && <Button type="button" variant="outline" onClick={() => pick(null)} disabled={saving}>취소</Button>}
            <Button type="button" onClick={save} disabled={!picked || saving}>{saving ? '저장 중' : '서명 저장'}</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
