'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { BadgeCheck, CalendarRange, ClipboardList, Files, LayoutDashboard, MessagesSquare, ShieldCheck } from 'lucide-react'
import { CertificationPanel, DocumentPanel, FindingsPanel, SchedulePanel, SketchPanel, YearlyPanel } from '@/components/quality/iatf/panels'
import { PAGE_SHELL_RELATIVE, PageHeader } from '@/components/shared/page-header'
import { cn } from '@/lib/utils'

const GROUPS = {
  audit: {
    label: '심사',
    tabs: [
      { key: 'yearly', label: '연도별 현황', nav: '지적 6건 · 완료 67%', hint: '2026년 2차 사후관리심사 기준 지적사항과 처리 현황입니다.', icon: LayoutDashboard },
      { key: 'findings', label: '지적사항 관리', nav: '개선 진행 2건', hint: '조항·관련 문서·시정조치 진행 상태를 관리합니다.', icon: ClipboardList },
      { key: 'schedule', label: '심사 일정 · 이력', nav: '다음 재인증 2027', hint: 'IATF 3년 인증 주기와 실시 이력입니다.', icon: CalendarRange },
    ],
  },
  system: {
    label: '시스템',
    tabs: [
      { key: 'certification', label: '인증 현황', nav: 'IATF 유효 · NQA', hint: 'IATF 16949 인증서와 ISO 인증 현황입니다.', icon: BadgeCheck },
      { key: 'doc-history', label: '문서 변경이력', nav: '관리 문서 29종', hint: '품질시스템 문서의 현행본과 개정 이력입니다.', icon: Files },
      { key: 'management-review', label: '경영검토', nav: '입력 · 결과 · 과제', hint: '경영검토 입력 · 결과 · 후속 과제입니다.', icon: MessagesSquare },
    ],
  },
} as const

type GroupKey = keyof typeof GROUPS
type AuditTabKey = (typeof GROUPS.audit.tabs)[number]['key']
type SystemTabKey = (typeof GROUPS.system.tabs)[number]['key']
type TabKey = AuditTabKey | SystemTabKey

const GROUP_KEYS: GroupKey[] = ['audit', 'system']
const AUDIT_TAB_KEYS = GROUPS.audit.tabs.map((t) => t.key)
const SYSTEM_TAB_KEYS = GROUPS.system.tabs.map((t) => t.key)

function isGroupKey(value: string | null): value is GroupKey {
  return value === 'audit' || value === 'system'
}

function isTabKeyForGroup(group: GroupKey, value: string | null): value is TabKey {
  if (!value) return false
  const keys = group === 'audit' ? AUDIT_TAB_KEYS : SYSTEM_TAB_KEYS
  return (keys as readonly string[]).includes(value)
}

function defaultTab(group: GroupKey): TabKey {
  return GROUPS[group].tabs[0].key
}

export function IatfView() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const groupParam = searchParams.get('group')
  const tabParam = searchParams.get('tab')

  const [group, setGroupState] = useState<GroupKey>(isGroupKey(groupParam) ? groupParam : 'audit')
  const [tab, setTabState] = useState<TabKey>(() => {
    const g = isGroupKey(groupParam) ? groupParam : 'audit'
    return isTabKeyForGroup(g, tabParam) ? tabParam : defaultTab(g)
  })

  useEffect(() => {
    const g = isGroupKey(groupParam) ? groupParam : 'audit'
    setGroupState(g)
    setTabState(isTabKeyForGroup(g, tabParam) ? tabParam : defaultTab(g))
  }, [groupParam, tabParam])

  const active = GROUPS[group].tabs.find((item) => item.key === tab) ?? GROUPS[group].tabs[0]

  const replaceUrl = (nextGroup: GroupKey, nextTab: TabKey) => {
    router.replace(`/quality/iatf?group=${nextGroup}&tab=${nextTab}`, { scroll: false })
  }

  const select = (nextGroup: GroupKey, nextTab: TabKey) => {
    setGroupState(nextGroup)
    setTabState(nextTab)
    replaceUrl(nextGroup, nextTab)
  }

  return (
    <main className={PAGE_SHELL_RELATIVE}>
      <PageHeader
        tone="green"
        icon={ShieldCheck}
        eyebrow="QUALITY · 품질관리"
        title="IATF 16949"
        description="인증 심사 · 지적사항 · 품질시스템 문서를 한곳에서 관리합니다."
        stat={{ label: '2026 완료율', value: '67', unit: '%', sub: '지적 6건 중 4건 완료' }}
      />

      <div className="grid items-stretch gap-6 lg:grid-cols-[18.5rem_minmax(0,1fr)]">
        <nav
          aria-label="IATF 메뉴"
          className="flex h-full flex-col gap-5 overflow-x-auto rounded-2xl border border-slate-200/80 bg-card p-3 shadow-[0_1px_2px_rgba(15,23,42,0.04)] lg:sticky lg:top-4 lg:overflow-visible dark:border-white/10"
        >
          {GROUP_KEYS.map((key) => (
            <div key={key}>
              <p className="px-2.5 pt-1 pb-2 text-[11px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">{GROUPS[key].label}</p>
              <div className="space-y-1.5">
                {GROUPS[key].tabs.map((item) => {
                  const selected = group === key && tab === item.key
                  const Icon = item.icon
                  return (
                    <button
                      key={item.key}
                      type="button"
                      aria-current={selected ? 'page' : undefined}
                      onClick={() => select(key, item.key)}
                      className={cn(
                        'group flex w-full items-center gap-3 rounded-xl px-2.5 py-2.5 text-left transition-all',
                        selected
                          ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-sm shadow-emerald-600/25'
                          : 'text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-white/5',
                      )}
                    >
                      <span
                        className={cn(
                          'flex size-9 shrink-0 items-center justify-center rounded-lg transition-colors',
                          selected ? 'bg-white/20' : 'bg-slate-100 text-slate-500 group-hover:bg-emerald-50 group-hover:text-emerald-700 dark:bg-white/5',
                        )}
                      >
                        <Icon className="size-4" />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold">{item.label}</span>
                        <span className={cn('mt-0.5 block truncate text-[11px]', selected ? 'text-white/80' : 'text-muted-foreground')}>{item.nav}</span>
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
          <div className="mt-auto hidden rounded-xl bg-slate-50 px-3.5 py-3 lg:block dark:bg-white/[0.04]">
            <p className="text-[11px] font-semibold text-muted-foreground">인증</p>
            <p className="mt-1 text-sm font-semibold">NQA · IATF 0545442</p>
            <p className="mt-0.5 text-xs text-muted-foreground">다음 재인증 2027년</p>
          </div>
        </nav>
        <div className="min-w-0">
          <header className="mb-5 flex flex-wrap items-end justify-between gap-2">
            <div>
              <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">{GROUPS[group].label}</p>
              <h2 className="mt-0.5 text-xl font-bold tracking-tight text-slate-950 dark:text-white">{active.label}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{active.hint}</p>
            </div>
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-500 dark:bg-white/5">레이아웃 예시</span>
          </header>
          {group === 'audit' && tab === 'yearly' ? <YearlyPanel /> : null}
          {group === 'audit' && tab === 'findings' ? <FindingsPanel /> : null}
          {group === 'audit' && tab === 'schedule' ? <SchedulePanel /> : null}
          {group === 'system' && tab === 'certification' ? <CertificationPanel /> : null}
          {group === 'system' && tab === 'doc-history' ? <DocumentPanel /> : null}
          {group === 'system' && tab === 'management-review' ? (
            <SketchPanel title="경영검토" lines={['입력 자료', '검토 결과', '후속 과제']} />
          ) : null}
        </div>
      </div>
    </main>
  )
}

