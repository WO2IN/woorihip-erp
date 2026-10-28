'use client'

import { useEffect, useMemo, useState } from 'react'
import { Activity, AlertCircle, CheckCircle2, Clock3, RefreshCw, Search, ShieldAlert, Trash2 } from 'lucide-react'
import { useAuth } from '@/components/auth/auth-context'
import { getSession, buildAuthHeaders } from '@/lib/auth-client'
import { describeAuditDetail } from '@/lib/audit-detail'
import { AuditLogEntry } from '@/lib/storage'
import { BAND_BUTTON, PageHeader } from '@/components/shared/page-header'

function formatDate(value: string) {
  return new Intl.DateTimeFormat('ko-KR', {
    dateStyle: 'medium',
    timeStyle: 'medium',
  }).format(new Date(value))
}

function getActionLabel(action: string) {
  const labels: Record<string, string> = {
    CREATE: '등록',
    UPLOAD: '문서 등록',
    UPDATE: '수정',
    DELETE: '삭제',
    LOGIN: '로그인',
    READ: '조회',
  }
  return labels[action.trim().toUpperCase()] ?? action
}

function getTargetLabel(target: string) {
  const labels: Record<string, string> = {
    document: '문서',
    config: '기초정보',
    user: '사용자',
    organization: '조직도',
    'process-template': '공정 점검표',
    'process-check': '공정 점검 기록',
    inventory: '입고',
    'process-nonconformity': '공정 부적합',
    'customer-nonconformity': '고객 부적합',
  }
  return labels[target] ?? target
}

function LogDetail({ log }: { log: AuditLogEntry }) {
  const detail = describeAuditDetail(log)
  return (
    <div className="max-w-md">
      <p className="font-medium text-foreground">{detail.title}</p>
      {detail.lines.map((line, index) => (
        <p key={`${index}-${line}`} className="text-xs leading-5 text-muted-foreground">{line}</p>
      ))}
    </div>
  )
}

async function deleteLog(id: string) {
  const session = getSession()
  const response = await fetch('/api/audit-logs', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json', ...(session ? buildAuthHeaders(session) : {}) },
    body: JSON.stringify({ id }),
  })
  if (!response.ok) {
    const result = await response.json().catch(() => ({}))
    throw new Error(result.error ?? '로그를 삭제하지 못했습니다.')
  }
}

function getActionClass(action: string) {
  const normalized = action.trim().toLowerCase()

  if (normalized.includes('업로드') || normalized.includes('생성') || normalized.includes('등록') || normalized.includes('create') || normalized.includes('upload') || normalized.includes('insert')) {
    return 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
  }

  if (normalized.includes('수정') || normalized.includes('업데이트') || normalized.includes('update') || normalized.includes('edit') || normalized.includes('patch')) {
    return 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
  }

  if (normalized.includes('삭제') || normalized.includes('delete') || normalized.includes('remove')) {
    return 'bg-red-500/15 text-red-700 dark:text-red-300'
  }

  if (normalized.includes('로그인') || normalized.includes('조회') || normalized.includes('열람') || normalized.includes('login') || normalized.includes('read') || normalized.includes('view')) {
    return 'bg-blue-500/15 text-blue-700 dark:text-blue-300'
  }

  return 'bg-primary/10 text-primary'
}

export default function SystemLogsPage() {
  const { user } = useAuth()
  const [logs, setLogs] = useState<AuditLogEntry[]>([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [deletingId, setDeletingId] = useState<string | null>(null)

  async function handleDelete(id: string) {
    if (!window.confirm('이 시스템 로그를 삭제하시겠습니까? 삭제한 기록은 복구할 수 없습니다.')) return
    setDeletingId(id)
    setError('')
    try {
      await deleteLog(id)
      setLogs(current => current.filter(log => log.id !== id))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '로그를 삭제하지 못했습니다.')
    } finally {
      setDeletingId(null)
    }
  }

  async function loadLogs() {
    setLoading(true)
    setError('')
    try {
      const session = getSession()
      const response = await fetch('/api/audit-logs?limit=500', {
        cache: 'no-store',
        headers: session ? buildAuthHeaders(session) : {},
      })
      if (!response.ok) throw new Error('로그를 불러오지 못했습니다.')
      const result = await response.json()
      setLogs(result.data ?? [])
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '로그를 불러오지 못했습니다.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (user?.role === 'admin') loadLogs()
  }, [user?.role])

  const filteredLogs = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    if (!normalized) return logs
    return logs.filter(log => {
      const detail = describeAuditDetail(log)
      return [log.action, getActionLabel(log.action), log.target, getTargetLabel(log.target), log.detail, detail.title, ...detail.lines, log.userName, log.userId]
        .filter(Boolean)
        .some(value => value!.toLowerCase().includes(normalized))
    })
  }, [logs, query])

  if (!user || user.role !== 'admin') {
    return (
      <div className="flex min-h-[70vh] items-center justify-center p-6">
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-red-50 dark:bg-red-950/30">
            <ShieldAlert className="h-7 w-7 text-red-500" />
          </div>
          <h1 className="text-2xl font-bold">접근 권한이 없습니다.</h1>
          <p className="mt-2 text-muted-foreground">시스템 로그는 관리자만 확인할 수 있습니다.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-full bg-muted/20 p-4 md:p-6 lg:p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <PageHeader
          tone="slate"
          icon={Activity}
          eyebrow="SYSTEM · 시스템관리"
          title="시스템 로그"
          description="누가 무엇을 등록·수정·삭제했는지 확인합니다."
          actions={
            <button type="button" onClick={loadLogs} disabled={loading} className={`inline-flex h-9 items-center justify-center gap-2 rounded-md px-3 text-sm font-medium transition-colors ${BAND_BUTTON}`}>
              <RefreshCw className={loading ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} /> 새로고침
            </button>
          }
        />

        <section className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border bg-card p-4 shadow-sm"><div className="flex items-center gap-2 text-sm text-muted-foreground"><Clock3 className="h-4 w-4" /> 전체 기록</div><p className="mt-2 text-2xl font-semibold">{logs.length}</p></div>
          <div className="rounded-xl border bg-card p-4 shadow-sm"><div className="flex items-center gap-2 text-sm text-muted-foreground"><CheckCircle2 className="h-4 w-4 text-emerald-500" /> 표시 중</div><p className="mt-2 text-2xl font-semibold">{filteredLogs.length}</p></div>
          <div className="rounded-xl border bg-card p-4 shadow-sm"><div className="flex items-center gap-2 text-sm text-muted-foreground"><Activity className="h-4 w-4 text-primary" /> 최근 활동</div><p className="mt-2 text-sm font-semibold">{logs[0] ? formatDate(logs[0].createdAt) : '기록 없음'}</p></div>
        </section>

        <section className="overflow-hidden rounded-xl border bg-card shadow-sm">
          <div className="flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-center sm:justify-between">
            <div><h2 className="text-sm font-semibold tracking-wide uppercase">활동 기록</h2><p className="mt-1 text-xs text-muted-foreground">최대 500개의 최근 기록을 표시합니다.</p></div>
            <div className="relative w-full sm:w-72"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="사용자, 작업, 대상 검색" className="h-9 w-full rounded-md border bg-background pl-9 pr-3 text-sm outline-none ring-offset-background placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring" /></div>
          </div>
          {error ? <div className="flex items-center gap-2 p-6 text-sm text-destructive"><AlertCircle className="h-4 w-4" /> {error}</div> : loading ? <div className="p-10 text-center text-sm text-muted-foreground">로그를 불러오는 중입니다.</div> : filteredLogs.length === 0 ? <div className="p-10 text-center text-sm text-muted-foreground">조건에 맞는 기록이 없습니다.</div> : <div className="overflow-x-auto"><table className="w-full min-w-[860px] text-sm"><thead className="bg-muted/40 text-left text-xs text-muted-foreground"><tr><th className="px-4 py-3 font-medium">일시</th><th className="px-4 py-3 font-medium">사용자</th><th className="px-4 py-3 font-medium">작업</th><th className="px-4 py-3 font-medium">대상</th><th className="px-4 py-3 font-medium">상세 내용</th><th className="px-4 py-3 text-right font-medium">관리</th></tr></thead><tbody className="divide-y">{filteredLogs.map(log => <tr key={log.id} className="transition-colors hover:bg-muted/20"><td className="whitespace-nowrap px-4 py-3 text-muted-foreground">{formatDate(log.createdAt)}</td><td className="px-4 py-3"><div className="font-medium">{log.userName}</div><div className="text-xs text-muted-foreground">{log.userId}</div></td><td className="px-4 py-3"><span className={`rounded-full px-2 py-1 text-xs font-medium ${getActionClass(log.action)}`}>{getActionLabel(log.action)}</span></td><td className="px-4 py-3 font-medium">{getTargetLabel(log.target)}</td><td className="px-4 py-3"><LogDetail log={log} /></td><td className="px-4 py-3 text-right"><button type="button" onClick={() => handleDelete(log.id)} disabled={deletingId === log.id} className="inline-flex h-8 items-center gap-1 rounded-md border border-red-200 px-2 text-xs font-medium text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50 dark:border-red-900 dark:hover:bg-red-950/40" aria-label="로그 삭제"><Trash2 className="h-3.5 w-3.5" /> 삭제</button></td></tr>)}</tbody></table></div>}
        </section>
      </div>
    </div>
  )
}
