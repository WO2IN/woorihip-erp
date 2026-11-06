'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { ShieldAlert } from 'lucide-react'
import {
  Plus, Trash2, Edit, ShieldCheck, Eye, EyeOff, Pencil,
  RefreshCw, UserRound, UserCheck, ArrowUpDown, ChevronDown,
  Clock, KeyRound, PenLine, Info, Check, RotateCw, ImageIcon, Crown,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { BAND_BUTTON, PAGE_SHELL, PageHeader } from '@/components/shared/page-header'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ConfirmDeleteDialog } from '@/components/shared/confirm-delete-dialog'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { toast } from 'sonner'
import { useAuth } from '@/components/auth/auth-context'
import { getAuthHeaders } from '@/lib/auth-client'
import { UserRole } from '@/lib/types'
import { cn } from '@/lib/utils'
import { formatLastSeenLabel, isUserOnline } from '@/lib/user-presence'
import { JOB_TITLES, JOB_TITLES_MENU, jobTitleHasCrown } from '@/lib/user-job-titles'

interface UserRow {
  id: string
  username: string
  displayName: string
  role: UserRole
  floor?: 1 | 2 | 3
  status?: 'pending'
  hasSignature?: boolean
  lastSeenAt?: string | null
  jobTitle?: string | null
  createdAt: string
}

function userInitials(name: string) {
  const trimmed = name.trim()
  if (!trimmed) return '?'
  if (/^[a-zA-Z]/.test(trimmed)) return trimmed.slice(0, 2).toUpperCase()
  return trimmed.slice(-2)
}

function formatJoined(iso: string) {
  if (!iso) return '-'
  return new Date(iso).toLocaleDateString('ko-KR', { year: 'numeric', month: 'short', day: 'numeric' })
}

function formatJoinDateLong(iso: string) {
  if (!iso) return '-'
  return new Date(iso).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' })
}

const DISPLAY_NAME_MAX = 20

type UserSortKey = 'name' | 'jobTitle' | 'role' | 'joined' | 'presence'
type UserSortDir = 'asc' | 'desc'

const USER_SORT_OPTIONS: UserSortKey[] = ['name', 'jobTitle', 'role', 'joined', 'presence']

const USER_SORT_LABEL: Record<UserSortKey, string> = {
  name: '이름순',
  jobTitle: '직급순',
  role: '권한순',
  joined: '가입순',
  presence: '접속순',
}

/** 정렬 기준을 바꿀 때 적용할 기본 방향 */
function preferredSortDir(key: UserSortKey): UserSortDir {
  switch (key) {
    case 'name':
      return 'asc'
    case 'jobTitle':
    case 'role':
      return 'desc'
    case 'joined':
    case 'presence':
      return 'desc'
  }
}

const JOB_TITLE_SORT_RANK = Object.fromEntries(JOB_TITLES.map((title, index) => [title, index])) as Record<
  string,
  number
>

function jobTitleSortRank(title: string | null | undefined) {
  const trimmed = title?.trim()
  if (!trimmed) return JOB_TITLES.length
  return JOB_TITLE_SORT_RANK[trimmed] ?? JOB_TITLES.length
}

const ROLE_SORT_RANK: Record<UserRole, number> = {
  admin: 0,
  editor: 1,
  viewer: 2,
}

function lastSeenSortTime(iso: string | null | undefined): number | null {
  if (!iso) return null
  const t = new Date(iso).getTime()
  return Number.isNaN(t) ? null : t
}

/** 접속순: 접속 중 맨 위 → 같은 그룹 안에서는 마지막 활동 시각. 기록 없음은 오프라인 맨 아래. */
function compareUsersByPresence(a: UserRow, b: UserRow, dir: UserSortDir): number {
  const onlineA = isUserOnline(a.lastSeenAt)
  const onlineB = isUserOnline(b.lastSeenAt)
  if (onlineA !== onlineB) return onlineA ? -1 : 1

  const ta = lastSeenSortTime(a.lastSeenAt)
  const tb = lastSeenSortTime(b.lastSeenAt)
  if (ta === null && tb === null) {
    return a.displayName.localeCompare(b.displayName, 'ko')
  }
  if (ta === null) return 1
  if (tb === null) return -1
  const byTime = dir === 'asc' ? ta - tb : tb - ta
  return byTime || a.displayName.localeCompare(b.displayName, 'ko')
}

function compareUsersForSort(a: UserRow, b: UserRow, sort: UserSortKey, dir: UserSortDir): number {
  const pendingA = a.status === 'pending'
  const pendingB = b.status === 'pending'
  if (pendingA !== pendingB) return pendingA ? -1 : 1

  if (sort === 'presence') return compareUsersByPresence(a, b, dir)

  let cmp = 0
  switch (sort) {
    case 'name':
      cmp = a.displayName.localeCompare(b.displayName, 'ko') || a.username.localeCompare(b.username, 'ko')
      break
    case 'jobTitle': {
      const hasA = Boolean(a.jobTitle?.trim())
      const hasB = Boolean(b.jobTitle?.trim())
      if (!hasA && !hasB) {
        cmp = a.displayName.localeCompare(b.displayName, 'ko')
      } else if (!hasA) {
        cmp = 1
      } else if (!hasB) {
        cmp = -1
      } else {
        cmp =
          jobTitleSortRank(a.jobTitle) - jobTitleSortRank(b.jobTitle)
          || a.displayName.localeCompare(b.displayName, 'ko')
      }
      break
    }
    case 'role':
      cmp =
        ROLE_SORT_RANK[a.role] - ROLE_SORT_RANK[b.role]
        || a.displayName.localeCompare(b.displayName, 'ko')
      // 내림차순 = 높은 권한 먼저 (관리자→뷰어)
      return dir === 'desc' ? cmp : -cmp
    case 'joined':
      cmp = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      break
    default:
      cmp = 0
  }
  return dir === 'asc' ? cmp : -cmp
}

const ROLE_LABEL: Record<UserRole, string> = {
  viewer: '뷰어',
  editor: '편집자',
  admin: '관리자',
}

const CREATE_ROLE_LABEL: Record<UserRole, string> = {
  viewer: '뷰어 — 조회 및 다운로드만 가능',
  editor: '편집자 — 등록, 수정, 삭제 가능',
  admin: '관리자 — 전체 권한',
}

const FLOOR_LABEL: Record<string, string> = {
  none: '미지정',
  '1': '1층 · 판재',
  '2': '2층 · 커넥터',
  '3': '3층 · 랙',
}

const ROLE_COLOR: Record<UserRole, string> = {
  viewer: 'bg-muted text-muted-foreground',
  editor: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
  admin: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
}

const ROLE_ICON: Record<UserRole, React.ReactNode> = {
  viewer: <Eye className="w-3 h-3" />,
  editor: <Pencil className="w-3 h-3" />,
  admin: <ShieldCheck className="w-3 h-3" />,
}

const STYLED_SELECT_CONTENT =
  'z-[100] min-w-[var(--anchor-width)] rounded-xl border-border/80 bg-popover p-2 shadow-xl'

const SELECT_MENU_TRIGGER =
  'inline-flex h-9 w-full items-center justify-between gap-2 rounded-lg border border-input bg-background px-2.5 text-sm font-normal shadow-none outline-none hover:bg-muted/50 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50'

const ROLE_OPTIONS: { value: UserRole; hint: string }[] = [
  { value: 'viewer', hint: '조회 및 다운로드만' },
  { value: 'editor', hint: '등록, 수정, 삭제' },
  { value: 'admin', hint: '전체 권한' },
]

const FLOOR_OPTIONS = ['1', '2', '3'] as const

function JobTitleLabel({ title, className }: { title: string; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5', className)}>
      <span>{title}</span>
      {jobTitleHasCrown(title) ? (
        <Crown className="h-3.5 w-3.5 shrink-0 text-amber-500 dark:text-amber-400" aria-hidden />
      ) : null}
    </span>
  )
}

function JobTitleSelect({
  value,
  onChange,
  triggerClassName,
}: {
  value: string
  onChange: (next: string) => void
  triggerClassName?: string
}) {
  const trimmed = value.trim()
  const label = trimmed || '미지정'
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className={cn(SELECT_MENU_TRIGGER, triggerClassName)}>
        <span className="truncate">
          {trimmed ? <JobTitleLabel title={trimmed} /> : label}
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" sideOffset={8} className={STYLED_SELECT_CONTENT}>
        <DropdownMenuGroup>
          <DropdownMenuLabel className="px-2.5 pb-1.5 pt-1 text-[11px] font-semibold tracking-wide text-muted-foreground">
            직급
          </DropdownMenuLabel>
          <DropdownMenuItem
            className="flex cursor-pointer items-center justify-between gap-3 rounded-lg py-2 pl-2.5 text-muted-foreground"
            onClick={() => onChange('')}
          >
            미지정
            {!value.trim() ? <Check className="h-4 w-4 shrink-0 text-primary" /> : null}
          </DropdownMenuItem>
          <DropdownMenuSeparator className="my-1.5" />
          {JOB_TITLES_MENU.map((title) => (
            <DropdownMenuItem
              key={title}
              className="flex cursor-pointer items-center justify-between gap-3 rounded-lg py-2 pl-2.5 font-medium"
              onClick={() => onChange(title)}
            >
              <JobTitleLabel title={title} />
              {value === title ? <Check className="h-4 w-4 shrink-0 text-primary" /> : null}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function FloorSelect({
  value,
  onChange,
}: {
  value: string
  onChange: (next: string) => void
}) {
  const label = value ? FLOOR_LABEL[value] ?? '미지정' : '미지정'
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className={SELECT_MENU_TRIGGER}>
        <span className="truncate">{label}</span>
        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" sideOffset={8} className={STYLED_SELECT_CONTENT}>
        <DropdownMenuGroup>
          <DropdownMenuLabel className="px-2.5 pb-1.5 pt-1 text-[11px] font-semibold tracking-wide text-muted-foreground">
            층
          </DropdownMenuLabel>
          <DropdownMenuItem
            className="flex cursor-pointer items-center justify-between gap-3 rounded-lg py-2 pl-2.5 text-muted-foreground"
            onClick={() => onChange('')}
          >
            미지정
            {!value ? <Check className="h-4 w-4 shrink-0 text-primary" /> : null}
          </DropdownMenuItem>
          <DropdownMenuSeparator className="my-1.5" />
          {FLOOR_OPTIONS.map((floor) => (
            <DropdownMenuItem
              key={floor}
              className="flex cursor-pointer items-center justify-between gap-3 rounded-lg py-2 pl-2.5 font-medium"
              onClick={() => onChange(floor)}
            >
              {FLOOR_LABEL[floor]}
              {value === floor ? <Check className="h-4 w-4 shrink-0 text-primary" /> : null}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function RoleSelect({
  value,
  onChange,
  triggerDetail = false,
}: {
  value: UserRole
  onChange: (next: UserRole) => void
  /** 사용자 추가 등에서 트리거에 설명 포함 */
  triggerDetail?: boolean
}) {
  const triggerLabel = triggerDetail ? CREATE_ROLE_LABEL[value] : ROLE_LABEL[value]
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className={SELECT_MENU_TRIGGER}>
        <span className="truncate text-left">{triggerLabel}</span>
        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        sideOffset={8}
        className={cn(STYLED_SELECT_CONTENT, triggerDetail && 'min-w-[15rem]')}
      >
        <DropdownMenuGroup>
          <DropdownMenuLabel className="px-2.5 pb-1.5 pt-1 text-[11px] font-semibold tracking-wide text-muted-foreground">
            권한
          </DropdownMenuLabel>
          {ROLE_OPTIONS.map((option) => (
            <DropdownMenuItem
              key={option.value}
              className="flex cursor-pointer items-center justify-between gap-3 rounded-lg py-2 pl-2.5"
              onClick={() => onChange(option.value)}
            >
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="inline-flex items-center gap-1.5 font-medium">
                  {ROLE_ICON[option.value]}
                  {ROLE_LABEL[option.value]}
                </span>
                <span className="text-xs font-normal text-muted-foreground">{option.hint}</span>
              </span>
              {value === option.value ? <Check className="h-4 w-4 shrink-0 text-primary" /> : null}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function RoleBadge({ role }: { role: UserRole }) {
  return (
    <span
      className={cn(
        'inline-flex w-[5.75rem] items-center justify-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
        ROLE_COLOR[role],
      )}
    >
      {ROLE_ICON[role]}
      {ROLE_LABEL[role]}
    </span>
  )
}

function UserAvatar({ name, pending }: { name: string; pending?: boolean }) {
  return (
    <div
      className={cn(
        'flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-semibold',
        pending
          ? 'bg-orange-100 text-orange-800 dark:bg-orange-950/50 dark:text-orange-200'
          : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200',
      )}
    >
      {userInitials(name)}
    </div>
  )
}

function PresenceBadge({ lastSeenAt }: { lastSeenAt?: string | null }) {
  const online = isUserOnline(lastSeenAt)
  const label = formatLastSeenLabel(lastSeenAt)
  if (online) {
    return (
      <Badge variant="secondary" className="gap-1.5 border border-emerald-200/80 bg-emerald-50 font-normal text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
        </span>
        접속 중
      </Badge>
    )
  }
  return (
    <Badge variant="outline" className="gap-1.5 font-normal text-muted-foreground" title={label}>
      <span className="h-2 w-2 shrink-0 rounded-full bg-muted-foreground/35" />
      {label}
    </Badge>
  )
}

function AccountStatusBadge({ pending }: { pending?: boolean }) {
  if (!pending) return null
  return (
    <Badge className="gap-1 bg-orange-500/90 hover:bg-orange-500">
      <Clock className="h-3 w-3" />
      승인 대기
    </Badge>
  )
}

export default function AdminUsersPage() {
  const { user } = useAuth()
  const [users, setUsers] = useState<UserRow[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [userSort, setUserSort] = useState<UserSortKey>('presence')
  const [userSortDir, setUserSortDir] = useState<UserSortDir>('desc')

  // Create dialog
  const [createOpen, setCreateOpen] = useState(false)
  const [createForm, setCreateForm] = useState({
    username: '',
    displayName: '',
    jobTitle: '',
    password: '',
    role: 'viewer' as UserRole,
    floor: '',
  })
  const [creating, setCreating] = useState(false)

  // Edit dialog
  const [editTarget, setEditTarget] = useState<UserRow | null>(null)
  const [editForm, setEditForm] = useState({
    displayName: '',
    jobTitle: '',
    role: 'viewer' as UserRole,
    password: '',
    floor: '',
  })
  const [editing, setEditing] = useState(false)
  const [signaturePreview, setSignaturePreview] = useState<string | null>(null)
  const [signaturePickedPreview, setSignaturePickedPreview] = useState<string | null>(null)
  const [signatureFile, setSignatureFile] = useState<File | null>(null)
  const [signatureLoading, setSignatureLoading] = useState(false)
  const [signatureSaving, setSignatureSaving] = useState(false)
  const [showEditPassword, setShowEditPassword] = useState(false)
  const [showCreatePassword, setShowCreatePassword] = useState(false)

  // Delete dialog
  const [deleteTarget, setDeleteTarget] = useState<UserRow | null>(null)
  const [deleting, setDeleting] = useState(false)

  const authHeaders = useCallback(() => getAuthHeaders(), [])

  const loadUsers = useCallback(async () => {
    try {
      const res = await fetch('/api/users', {
        headers: authHeaders(),
        cache: 'no-store',
      })
  
      if (!res.ok) {
        const data = await res.json()
        toast.error(data.error || '사용자 목록을 불러올 수 없습니다.')
        return
      }
  
      const data = await res.json()
      setUsers(data.data || [])
  
    } catch (error) {
      console.error('loadUsers error:', error)
      toast.error('서버와 연결할 수 없습니다.')
    } finally {
      setLoading(false)
    }
  }, [authHeaders])

  useEffect(() => { loadUsers() }, [loadUsers])

  useEffect(() => {
    const id = window.setInterval(() => { loadUsers() }, 30_000)
    return () => window.clearInterval(id)
  }, [loadUsers])

  useEffect(() => {
    if (!editTarget) {
      setSignaturePreview(null)
      setSignatureFile(null)
      setSignaturePickedPreview((current) => {
        if (current) URL.revokeObjectURL(current)
        return null
      })
      return
    }
    let objectUrl: string | null = null
    setSignatureLoading(true)
    setSignaturePreview(null)
    setSignatureFile(null)
    setSignaturePickedPreview((current) => {
      if (current) URL.revokeObjectURL(current)
      return null
    })
    fetch(`/api/auth/signature?userId=${encodeURIComponent(editTarget.id)}`, {
      headers: authHeaders(),
      cache: 'no-store',
    })
      .then(async (res) => {
        if (!res.ok) return
        const blob = await res.blob()
        if (!blob.size) return
        objectUrl = URL.createObjectURL(blob)
        setSignaturePreview(objectUrl)
      })
      .finally(() => setSignatureLoading(false))
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [editTarget, authHeaders])

  const refreshSignaturePreview = async (userId: string) => {
    const res = await fetch(`/api/auth/signature?userId=${encodeURIComponent(userId)}`, {
      headers: authHeaders(),
      cache: 'no-store',
    })
    setSignaturePreview((current) => {
      if (current) URL.revokeObjectURL(current)
      return null
    })
    if (!res.ok) return
    const blob = await res.blob()
    if (!blob.size) return
    setSignaturePreview(URL.createObjectURL(blob))
  }

  const pickSignatureFile = (file: File | null) => {
    setSignatureFile(file)
    setSignaturePickedPreview((current) => {
      if (current) URL.revokeObjectURL(current)
      return file ? URL.createObjectURL(file) : null
    })
  }

  const saveSignatureForEditTarget = async () => {
    if (!editTarget || !signatureFile) return
    setSignatureSaving(true)
    try {
      const body = new FormData()
      body.append('file', signatureFile)
      body.append('userId', editTarget.id)
      const res = await fetch('/api/auth/signature', { method: 'PUT', headers: authHeaders(), body })
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.error || '서명 저장 실패')
      toast.success('서명을 저장했습니다.')
      setUsers(prev => prev.map(u => u.id === editTarget.id ? { ...u, hasSignature: true } : u))
      setEditTarget(prev => (prev ? { ...prev, hasSignature: true } : prev))
      setSignatureFile(null)
      setSignaturePickedPreview((current) => {
        if (current) URL.revokeObjectURL(current)
        return null
      })
      await refreshSignaturePreview(editTarget.id)
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : '서명 저장 실패')
    } finally {
      setSignatureSaving(false)
    }
  }

  const removeSignatureForEditTarget = async () => {
    if (!editTarget) return
    setSignatureSaving(true)
    try {
      const res = await fetch(`/api/auth/signature?userId=${encodeURIComponent(editTarget.id)}`, {
        method: 'DELETE',
        headers: authHeaders(),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.error || '서명 삭제 실패')
      toast.success('서명을 삭제했습니다.')
      setUsers(prev => prev.map(u => u.id === editTarget.id ? { ...u, hasSignature: false } : u))
      setEditTarget(prev => (prev ? { ...prev, hasSignature: false } : prev))
      setSignaturePreview((current) => {
        if (current) URL.revokeObjectURL(current)
        return null
      })
      pickSignatureFile(null)
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : '서명 삭제 실패')
    } finally {
      setSignatureSaving(false)
    }
  }

  const handleRefresh = async () => {
    setRefreshing(true)
    await loadUsers()
    setRefreshing(false)
  }

  const handleCreate = async () => {
    if (!createForm.username || !createForm.displayName || !createForm.password) {
      toast.error('모든 필드를 입력해주세요.')
      return
    }
    setCreating(true)
    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify(createForm),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      toast.success('사용자가 추가되었습니다.')
      setUsers(prev => [...prev, data.user])
      setCreateOpen(false)
      setCreateForm({ username: '', displayName: '', jobTitle: '', password: '', role: 'viewer', floor: '' })
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : '추가에 실패했습니다.')
    } finally {
      setCreating(false)
    }
  }

  const handleEdit = async () => {
    if (!editTarget) return
    setEditing(true)
    try {
      const body: Record<string, string> = {}
      if (editForm.displayName) body.displayName = editForm.displayName
      if (editForm.role) body.role = editForm.role
      if (editForm.password) body.password = editForm.password
      body.floor = editForm.floor
      body.jobTitle = editForm.jobTitle.trim()

      const res = await fetch(`/api/users/${editTarget.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      toast.success('사용자 정보가 수정되었습니다.')
      setUsers(prev => prev.map(u => u.id === editTarget.id ? { ...u, ...data.user } : u))
      setEditTarget(null)
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : '수정에 실패했습니다.')
    } finally {
      setEditing(false)
    }
  }

  const handleApprove = async (target: UserRow) => {
    try {
      const res = await fetch(`/api/users/${target.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ approve: true }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      toast.success(`${target.displayName} 계정을 승인했습니다.`)
      setUsers(prev => prev.map(u => u.id === target.id ? { ...u, status: undefined } : u))
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : '승인에 실패했습니다.')
    }
  }

  const pendingCount = users.filter(u => u.status === 'pending').length
  const onlineCount = users.filter(u => u.status !== 'pending' && isUserOnline(u.lastSeenAt)).length
  const sortedUsers = useMemo(
    () => [...users].sort((a, b) => compareUsersForSort(a, b, userSort, userSortDir)),
    [users, userSort, userSortDir],
  )

  const handleDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/users/${deleteTarget.id}`, {
        method: 'DELETE',
        headers: authHeaders(),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      toast.success('사용자가 삭제되었습니다.')
      setUsers(prev => prev.filter(u => u.id !== deleteTarget.id))
      setDeleteTarget(null)
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : '삭제에 실패했습니다.')
    } finally {
      setDeleting(false)
    }
  }

  if (user && user.role !== 'admin') {
    return (
      <div className="flex items-center justify-center h-[70vh]">
        <div className="text-center">
  
          <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-red-50 dark:bg-red-950/30 flex items-center justify-center">
            <ShieldAlert className="w-7 h-7 text-red-500" />
          </div>
  
          <h1 className="text-2xl font-bold mb-2">
            접근 권한이 없습니다.
          </h1>
  
          <p className="text-muted-foreground">
            사용자 관리는 관리자만 사용할 수 있습니다.
          </p>
  
        </div>
      </div>
    )
  }

  return (
    <div className={cn(PAGE_SHELL, 'space-y-6')}>
      <PageHeader
        tone="slate"
        icon={UserRound}
        eyebrow="ORGANIZATION · 조직/사용자"
        title="사용자 관리"
        description={
          <>
            계정을 추가하거나 권한을 변경합니다.
            {pendingCount > 0 && (
              <span className="ml-2 rounded-full bg-[oklch(0.74_0.16_62)] px-2 py-0.5 text-xs font-bold text-white">승인 대기 {pendingCount}명</span>
            )}
          </>
        }
        stat={{ label: '전체 사용자', value: users.length, unit: '명' }}
        actions={
          <button
            type="button"
            onClick={handleRefresh}
            disabled={refreshing}
            className={`inline-flex h-9 items-center justify-center gap-2 rounded-lg px-3 text-sm font-medium transition-colors disabled:cursor-not-allowed ${BAND_BUTTON}`}
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            새로고침
          </button>
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        {[
          { label: '전체 계정', value: users.length, unit: '명' },
          { label: '접속 중', value: onlineCount, unit: '명', highlight: onlineCount > 0 },
          { label: '승인 대기', value: pendingCount, unit: '명', highlight: pendingCount > 0 },
        ].map((item) => (
          <div
            key={item.label}
            className={cn(
              'rounded-xl border bg-card px-4 py-3 shadow-sm',
              item.highlight && 'border-orange-200 dark:border-orange-900/50',
            )}
          >
            <p className="text-xs font-medium text-muted-foreground">{item.label}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">
              {loading ? '—' : item.value}
              <span className="ml-1 text-sm font-normal text-muted-foreground">{item.unit}</span>
            </p>
          </div>
        ))}
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/25 px-4 py-2.5 sm:px-5">
          <p className="text-xs text-muted-foreground">
            {loading ? '불러오는 중…' : `표시 ${sortedUsers.length}명`}
          </p>
          <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" className="h-8 gap-1.5 shadow-none" onClick={() => setCreateOpen(true)}>
            <Plus className="h-3.5 w-3.5" />
            사용자 추가
          </Button>
          <div className="inline-flex overflow-hidden rounded-lg border border-input bg-background shadow-none">
            <DropdownMenu>
              <DropdownMenuTrigger
                className="inline-flex h-8 items-center px-2.5 text-xs font-medium outline-none hover:bg-muted"
                aria-label="목록 정렬 기준"
              >
                {USER_SORT_LABEL[userSort]}
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" sideOffset={6} className="min-w-[9.5rem] rounded-xl p-1.5">
                {USER_SORT_OPTIONS.map((key) => (
                  <DropdownMenuItem
                    key={key}
                    className="flex cursor-pointer items-center justify-between gap-3 rounded-lg py-2 text-sm"
                    onClick={() => {
                      if (key !== userSort) setUserSortDir(preferredSortDir(key))
                      setUserSort(key)
                    }}
                  >
                    <span>{USER_SORT_LABEL[key]}</span>
                    {userSort === key ? <Check className="h-4 w-4 shrink-0 text-primary" /> : null}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <button
              type="button"
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center border-l border-input hover:bg-muted"
              aria-label={
                userSortDir === 'asc'
                  ? `${USER_SORT_LABEL[userSort]} 오름차순. 내림차순으로 바꾸기`
                  : `${USER_SORT_LABEL[userSort]} 내림차순. 오름차순으로 바꾸기`
              }
              onClick={() => setUserSortDir((dir) => (dir === 'asc' ? 'desc' : 'asc'))}
            >
              <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
          </div>
          </div>
        </div>
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="h-7 w-7 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : users.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-20 text-muted-foreground">
            <UserRound className="h-10 w-10 opacity-30" />
            <p className="text-sm">등록된 사용자가 없습니다.</p>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {sortedUsers.map((u) => (
              <li
                key={u.id}
                className="grid grid-cols-1 gap-2 px-4 py-3 transition-colors hover:bg-muted/25 sm:grid-cols-[minmax(0,1fr)_5.75rem_auto] sm:items-center sm:gap-x-4 sm:px-5"
              >
                <div className="flex min-w-0 items-start gap-3 sm:items-center">
                  <UserAvatar name={u.displayName} pending={u.status === 'pending'} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="inline-flex min-w-0 flex-wrap items-baseline gap-x-0">
                        <span className="truncate text-base font-semibold text-foreground">{u.displayName}</span>
                        {u.jobTitle ? (
                          <>
                            <span className="mx-1.5 text-muted-foreground/50" aria-hidden>
                              ·
                            </span>
                            <JobTitleLabel title={u.jobTitle} className="shrink-0 text-sm font-semibold text-foreground/75" />
                          </>
                        ) : null}
                      </span>
                      <AccountStatusBadge pending={u.status === 'pending'} />
                      <PresenceBadge lastSeenAt={u.lastSeenAt} />
                    </div>
                    <p className="mt-0.5 font-mono text-xs text-muted-foreground">@{u.username}</p>
                    <p className="mt-1 text-xs text-muted-foreground">가입 {formatJoined(u.createdAt)}</p>
                  </div>
                </div>

                <div className="flex items-center sm:justify-center">
                  <RoleBadge role={u.role} />
                </div>

                <div className="flex items-center justify-end gap-1">
                  {u.status === 'pending' && (
                    <Button variant="outline" size="sm" className="h-8 gap-1 text-xs" onClick={() => handleApprove(u)}>
                      <UserCheck className="h-3.5 w-3.5" />
                      승인
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-foreground"
                    onClick={() => {
                      setEditTarget(u)
                      setEditForm({
                        displayName: u.displayName,
                        jobTitle: u.jobTitle ?? '',
                        role: u.role,
                        password: '',
                        floor: u.floor ? String(u.floor) : '',
                      })
                    }}
                    title="수정"
                  >
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    onClick={() => setDeleteTarget(u)}
                    disabled={u.id === user?.id}
                    title="삭제"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Create user dialog */}
      <Dialog
        open={createOpen}
        onOpenChange={(open) => {
          setCreateOpen(open)
          if (!open) setShowCreatePassword(false)
        }}
      >
        <DialogContent className="flex max-h-[min(92dvh,880px)] max-w-xl flex-col gap-0 overflow-hidden p-0 sm:max-w-xl">
          <div className="flex shrink-0 items-start gap-3 px-6 pt-6 pb-1">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[oklch(0.55_0.19_258/0.12)] text-[oklch(0.48_0.19_258)] dark:bg-[oklch(0.55_0.19_258/0.2)] dark:text-[oklch(0.72_0.16_258)]">
              <Plus className="h-5 w-5" />
            </div>
            <DialogHeader className="min-w-0 flex-1 space-y-1 text-left">
              <DialogTitle className="text-lg font-semibold leading-tight">사용자 추가</DialogTitle>
              <p className="text-sm font-normal text-muted-foreground">새 계정을 만들고 권한·직급을 지정합니다.</p>
            </DialogHeader>
          </div>

          <div className="mx-6 mt-4 flex shrink-0 items-start gap-2.5 rounded-lg border border-[oklch(0.55_0.19_258/0.15)] bg-[oklch(0.55_0.19_258/0.06)] px-4 py-3 text-sm text-foreground dark:border-[oklch(0.55_0.19_258/0.25)] dark:bg-[oklch(0.55_0.19_258/0.1)]">
            <Info className="mt-0.5 h-5 w-5 shrink-0 text-[oklch(0.48_0.19_258)] dark:text-[oklch(0.72_0.16_258)]" />
            <p className="text-muted-foreground">
              기본 권한은 <span className="font-medium text-foreground">뷰어</span>입니다.
              <br />
              관리자가 추가한 계정은 별도 승인 없이 바로 로그인할 수 있습니다.
            </p>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            <div className="grid gap-5 px-6 py-5 pb-6">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="new-username" className="text-sm font-medium">
                    아이디 <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="new-username"
                    value={createForm.username}
                    onChange={(e) => setCreateForm((p) => ({ ...p, username: e.target.value }))}
                    placeholder="로그인에 사용할 아이디"
                    autoComplete="off"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="new-display" className="text-sm font-medium">
                    표시 이름 <span className="text-destructive">*</span>
                  </Label>
                  <div className="relative">
                    <Input
                      id="new-display"
                      value={createForm.displayName}
                      maxLength={DISPLAY_NAME_MAX}
                      className="pr-14"
                      onChange={(e) =>
                        setCreateForm((p) => ({
                          ...p,
                          displayName: e.target.value.slice(0, DISPLAY_NAME_MAX),
                        }))
                      }
                      placeholder="예: 홍길동"
                    />
                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs tabular-nums text-muted-foreground">
                      {createForm.displayName.length} / {DISPLAY_NAME_MAX}
                    </span>
                  </div>
                </div>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="new-password" className="flex items-center gap-1.5 text-sm font-medium">
                  <KeyRound className="h-4 w-4 text-muted-foreground" />
                  초기 비밀번호 <span className="text-destructive">*</span>
                </Label>
                <div className="relative">
                  <Input
                    id="new-password"
                    type={showCreatePassword ? 'text' : 'password'}
                    value={createForm.password}
                    className="pr-10"
                    onChange={(e) => setCreateForm((p) => ({ ...p, password: e.target.value }))}
                    placeholder="최소 8자 권장"
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                    onClick={() => setShowCreatePassword((v) => !v)}
                    aria-label={showCreatePassword ? '비밀번호 숨기기' : '비밀번호 보기'}
                  >
                    {showCreatePassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <div className="grid gap-2">
                  <Label className="text-sm font-medium">직급</Label>
                  <JobTitleSelect
                    value={createForm.jobTitle}
                    onChange={(jobTitle) => setCreateForm((p) => ({ ...p, jobTitle }))}
                  />
                </div>
                <div className="grid gap-2">
                  <Label className="text-sm font-medium">층 지정</Label>
                  <FloorSelect
                    value={createForm.floor}
                    onChange={(floor) => setCreateForm((p) => ({ ...p, floor }))}
                  />
                </div>
                <div className="grid gap-2 sm:col-span-3">
                  <Label className="text-sm font-medium">권한</Label>
                  <RoleSelect
                    value={createForm.role}
                    triggerDetail
                    onChange={(role) => setCreateForm((p) => ({ ...p, role }))}
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="flex shrink-0 flex-col-reverse gap-2 rounded-b-xl border-t bg-muted/30 px-6 py-4 pb-6 sm:flex-row sm:justify-end">
            <Button variant="outline" className="min-w-[5rem] bg-background" onClick={() => setCreateOpen(false)}>
              취소
            </Button>
            <Button
              className="min-w-[5rem] gap-1.5 bg-[oklch(0.52_0.19_258)] hover:bg-[oklch(0.46_0.19_258)]"
              onClick={handleCreate}
              disabled={creating}
            >
              <Check className="h-4 w-4" />
              {creating ? '추가 중…' : '추가'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit user dialog */}
      <Dialog
        open={!!editTarget}
        onOpenChange={(v) => {
          if (!v) {
            setEditTarget(null)
            setShowEditPassword(false)
          }
        }}
      >
        <DialogContent className="flex max-h-[min(92dvh,880px)] max-w-xl flex-col gap-0 overflow-hidden p-0 sm:max-w-xl">
          <div className="flex shrink-0 items-start gap-3 px-6 pt-6 pb-1">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[oklch(0.55_0.19_258/0.12)] text-[oklch(0.48_0.19_258)] dark:bg-[oklch(0.55_0.19_258/0.2)] dark:text-[oklch(0.72_0.16_258)]">
              <Pencil className="h-5 w-5" />
            </div>
            <DialogHeader className="min-w-0 flex-1 space-y-1 text-left">
              <DialogTitle className="text-lg font-semibold leading-tight">사용자 수정</DialogTitle>
              <p className="text-sm font-normal text-muted-foreground">사용자 정보를 수정할 수 있습니다.</p>
            </DialogHeader>
          </div>

          {editTarget && (
            <div className="mx-6 mt-4 flex shrink-0 items-center gap-2.5 rounded-lg border border-[oklch(0.55_0.19_258/0.15)] bg-[oklch(0.55_0.19_258/0.06)] px-4 py-3 text-sm text-foreground dark:border-[oklch(0.55_0.19_258/0.25)] dark:bg-[oklch(0.55_0.19_258/0.1)]">
              <UserRound className="h-5 w-5 shrink-0 text-[oklch(0.48_0.19_258)] dark:text-[oklch(0.72_0.16_258)]" />
              <span>
                <span className="font-medium">{editTarget.displayName}</span>
                {' · '}
                가입일: {formatJoinDateLong(editTarget.createdAt)}
              </span>
            </div>
          )}

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            <div className="grid gap-5 px-6 py-5 pb-6">
            <div className="grid gap-2">
              <Label htmlFor="edit-display" className="text-sm font-medium">
                표시 이름 <span className="text-destructive">*</span>
              </Label>
              <div className="relative">
                <Input
                  id="edit-display"
                  value={editForm.displayName}
                  maxLength={DISPLAY_NAME_MAX}
                  className="pr-14"
                  onChange={(e) => setEditForm((p) => ({ ...p, displayName: e.target.value.slice(0, DISPLAY_NAME_MAX) }))}
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs tabular-nums text-muted-foreground">
                  {editForm.displayName.length} / {DISPLAY_NAME_MAX}
                </span>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="grid gap-2">
                <Label className="text-sm font-medium">직급</Label>
                <JobTitleSelect
                  value={editForm.jobTitle}
                  onChange={(jobTitle) => setEditForm((p) => ({ ...p, jobTitle }))}
                />
              </div>
              <div className="grid gap-2">
                <Label className="text-sm font-medium">층 지정</Label>
                <FloorSelect
                  value={editForm.floor}
                  onChange={(floor) => setEditForm((p) => ({ ...p, floor }))}
                />
              </div>
              <div className="grid gap-2">
                <Label className="text-sm font-medium">권한</Label>
                <RoleSelect
                  value={editForm.role}
                  onChange={(role) => setEditForm((p) => ({ ...p, role }))}
                />
              </div>
            </div>

            <div className="rounded-xl border bg-card p-4 shadow-sm">
              <div className="mb-3 flex items-center gap-1.5 text-sm font-medium">
                <PenLine className="h-4 w-4 text-[oklch(0.48_0.19_258)]" />
                결재 서명
                <button
                  type="button"
                  className="ml-0.5 rounded-full p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                  title="4M·결재 문서에 사용할 서명입니다. 관리자가 대신 등록할 수 있습니다."
                  aria-label="결재 서명 안내"
                >
                  <Info className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="relative flex min-h-[140px] items-center justify-center rounded-lg border bg-background p-4">
                {signatureLoading ? (
                  <div className="h-7 w-7 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                ) : signaturePickedPreview || signaturePreview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={signaturePickedPreview || signaturePreview || ''}
                    alt="서명 미리보기"
                    className="max-h-32 max-w-full object-contain"
                  />
                ) : (
                  <p className="text-sm text-muted-foreground">등록된 서명이 없습니다.</p>
                )}
                {editTarget && !signatureLoading && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-2 top-2 h-8 w-8 text-muted-foreground hover:text-foreground"
                    title="서명 미리보기 새로고침"
                    disabled={signatureSaving}
                    onClick={() => void refreshSignaturePreview(editTarget.id)}
                  >
                    <RotateCw className="h-4 w-4" />
                  </Button>
                )}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <label className="relative inline-flex h-9 cursor-pointer items-center gap-1.5 overflow-hidden rounded-md bg-[oklch(0.52_0.19_258)] px-3 text-sm font-medium text-white hover:bg-[oklch(0.46_0.19_258)] dark:bg-[oklch(0.55_0.19_258)] dark:hover:bg-[oklch(0.5_0.19_258)]">
                  <PenLine className="h-4 w-4" />
                  파일 선택
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/jpg"
                    className="absolute inset-0 cursor-pointer opacity-0"
                    onChange={(e) => pickSignatureFile(e.target.files?.[0] ?? null)}
                  />
                </label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-9 gap-1.5 bg-background"
                  disabled={!signatureFile || signatureSaving}
                  onClick={saveSignatureForEditTarget}
                >
                  <ImageIcon className="h-4 w-4 text-muted-foreground" />
                  {signatureSaving ? '저장 중…' : '서명 저장'}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-9 gap-1.5 bg-background text-muted-foreground hover:text-destructive"
                  disabled={signatureSaving || (!editTarget?.hasSignature && !signaturePreview && !signaturePickedPreview)}
                  onClick={removeSignatureForEditTarget}
                >
                  <Trash2 className="h-4 w-4" />
                  서명 삭제
                </Button>
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="edit-pw" className="flex items-center gap-1.5 text-sm font-medium">
                <KeyRound className="h-4 w-4 text-muted-foreground" />
                새 비밀번호
              </Label>
              <div className="relative">
                <Input
                  id="edit-pw"
                  type={showEditPassword ? 'text' : 'password'}
                  value={editForm.password}
                  className="pr-10"
                  onChange={(e) => setEditForm((p) => ({ ...p, password: e.target.value }))}
                  placeholder="변경할 때만 입력해주세요"
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                  onClick={() => setShowEditPassword((v) => !v)}
                  aria-label={showEditPassword ? '비밀번호 숨기기' : '비밀번호 보기'}
                >
                  {showEditPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            </div>
          </div>

          <div className="flex shrink-0 flex-col-reverse gap-2 rounded-b-xl border-t bg-muted/30 px-6 py-4 pb-6 sm:flex-row sm:justify-end">
            <Button variant="outline" className="min-w-[5rem] bg-background" onClick={() => setEditTarget(null)}>
              취소
            </Button>
            <Button className="min-w-[5rem] gap-1.5 bg-[oklch(0.52_0.19_258)] hover:bg-[oklch(0.46_0.19_258)]" onClick={handleEdit} disabled={editing}>
              <Check className="h-4 w-4" />
              {editing ? '저장 중…' : '저장'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <ConfirmDeleteDialog open={!!deleteTarget} onOpenChange={v => !v && setDeleteTarget(null)} title="사용자 삭제" onConfirm={handleDelete} pending={deleting}>
        <strong>{deleteTarget?.displayName}</strong> ({deleteTarget?.username}) 계정을 삭제하시겠습니까?
        <br />이 작업은 되돌릴 수 없습니다.
      </ConfirmDeleteDialog>
    </div>
  )
}
