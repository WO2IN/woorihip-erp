'use client'

import { Suspense, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { ChevronDown, GripVertical, PanelLeft, PanelLeftClose } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { NAV, type NavSection, type Role } from '@/lib/nav'
import { applyNavOrder, isDefaultNavOrder, mergeVisibleOrder } from '@/lib/nav-order'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useAuth } from '@/components/auth/auth-context'

const LEVELS: Record<Role, number> = { viewer: 1, editor: 2, admin: 3 }

function matches(href: string, pathname: string, tab: string | null) {
  const [path, query] = href.split('?')
  if (path === '/') return pathname === '/'
  if (pathname !== path && !pathname.startsWith(`${path}/`)) return false
  if (!query) return true
  return (tab ?? 'stock') === new URLSearchParams(query).get('tab')
}

const ALL_HREFS = NAV.flatMap((s) => [s.href, ...(s.children ?? []).map((c) => c.href)]).filter((h): h is string => !!h)

function isActive(href: string | undefined, pathname: string, tab: string | null) {
  if (!href || !matches(href, pathname, tab)) return false
  const best = Math.max(...ALL_HREFS.filter((h) => matches(h, pathname, tab)).map((h) => h.split('?')[0].length))
  return href.split('?')[0].length === best
}

interface SidebarProps {
  open: boolean
  onClose: () => void
  collapsed: boolean
  setCollapsed: React.Dispatch<React.SetStateAction<boolean>>
}

export function Sidebar({ open, onClose, collapsed, setCollapsed }: SidebarProps) {
  return (
    <>
      {open && <div className="fixed inset-0 z-30 bg-black/40 lg:hidden" onClick={onClose} />}
      <aside
        className={cn(
          'no-print fixed left-0 top-0 z-[60] flex h-full flex-col overflow-visible lg:static',
          'bg-[linear-gradient(180deg,oklch(0.995_0.003_250),oklch(0.965_0.012_250))] dark:bg-[linear-gradient(180deg,oklch(0.235_0.045_255),oklch(0.175_0.035_258))] text-slate-700 dark:text-[oklch(0.86_0.02_250)]',
          'border-r border-slate-200 dark:border-white/5 transition-[width,transform] duration-300 ease-in-out',
          collapsed ? 'w-20' : 'w-64',
          open ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
        )}
      >
        <button
          onClick={onClose}
          className="absolute right-3 top-5 z-[100] flex h-8 w-8 items-center justify-center rounded-md text-slate-600 dark:text-white/70 hover:bg-slate-100 dark:hover:bg-white/10 lg:hidden"
          aria-label="메뉴 닫기"
        >
          <PanelLeftClose className="h-5 w-5" />
        </button>
        <button
          onClick={() => setCollapsed((prev) => !prev)}
          className="absolute -right-3 top-[86px] z-[100] hidden h-7 w-7 items-center justify-center rounded-full border bg-background text-foreground shadow-md hover:bg-accent lg:flex"
          aria-label={collapsed ? '사이드바 펼치기' : '사이드바 접기'}
        >
          {collapsed ? <PanelLeft className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
        </button>

        <Link
          href="/"
          onClick={onClose}
          className={cn('flex items-center gap-3 border-b border-slate-200 dark:border-white/10 py-5', collapsed ? 'justify-center px-0' : 'px-5')}
        >
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[oklch(0.52_0.19_258)] bg-[linear-gradient(135deg,oklch(0.58_0.19_255),oklch(0.45_0.19_262))] text-lg font-black text-white shadow-[0_4px_12px_oklch(0.52_0.19_258/0.3)] dark:border-[oklch(0.78_0.14_220/0.7)] dark:bg-none dark:bg-[oklch(0.3_0.07_245)] dark:shadow-[0_0_14px_oklch(0.78_0.14_220/0.35)]">
            W
          </span>
          {!collapsed && (
            <span className="min-w-0">
              <span className="block text-[17px] font-black tracking-[0.12em] text-slate-900 dark:text-white">WOORI-HIP</span>
              <span className="block text-[11.5px] text-slate-400 dark:text-white/55">통합 업무 관리 시스템</span>
            </span>
          )}
        </Link>

        <ScrollArea className="min-h-0 flex-1 py-4">
          <Suspense fallback={<NavList collapsed={collapsed} onClose={onClose} onExpand={() => setCollapsed(false)} tab={null} />}>
            <NavWithParams collapsed={collapsed} onClose={onClose} onExpand={() => setCollapsed(false)} />
          </Suspense>
        </ScrollArea>

        <div className={cn('border-t border-slate-200 dark:border-white/10 py-3 text-[11px] text-slate-400 dark:text-white/40', collapsed ? 'text-center' : 'px-5')}>
          {collapsed ? 'v0.1' : 'WOORI-HIP v0.1'}
        </div>
      </aside>
    </>
  )
}

function NavWithParams(props: { collapsed: boolean; onClose: () => void; onExpand: () => void }) {
  const tab = useSearchParams().get('tab')
  return <NavList {...props} tab={tab} />
}

function NavList({ collapsed, onClose, onExpand, tab }: { collapsed: boolean; onClose: () => void; onExpand: () => void; tab: string | null }) {
  const { user, replaceUser } = useAuth()
  const pathname = usePathname()
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({})
  const [reordering, setReordering] = useState(false)
  const [saving, setSaving] = useState(false)
  const [draft, setDraft] = useState<string[] | null>(null)
  const [dragId, setDragId] = useState<string | null>(null)
  const rowRefs = useRef(new Map<string, HTMLDivElement>())
  const [dragY, setDragY] = useState<number | null>(null)
  const dragRef = useRef<{ id: string; order: string[]; tops: number[]; height: number; grab: number } | null>(null)
  const allowed = (role?: Role) => !role || !user || LEVELS[user.role] >= LEVELS[role]
  const savedSections = applyNavOrder(NAV.filter((section) => allowed(section.minRole)), user?.navOrder)
  const sections = draft
    ? draft.map((id) => savedSections.find((section) => section.id === id)).filter((section): section is NavSection => !!section)
    : savedSections
  const collapsible = sections.filter((section) => section.children)
  const isSectionOpen = (section: NavSection) => {
    const items = section.children?.filter((item) => allowed(item.minRole)) ?? []
    return openSections[section.label] ?? items.some((item) => isActive(item.href, pathname, tab))
  }
  const anyOpen = collapsible.some(isSectionOpen)
  const setAll = (open: boolean) => {
    setOpenSections(Object.fromEntries(collapsible.map((section) => [section.label, open])))
  }
  const saveOrder = async (order: string[] | null) => {
    if (!user || saving) return
    const previous = user.navOrder ?? null
    replaceUser({ ...user, navOrder: order })
    setSaving(true)
    try {
      const response = await fetch('/api/auth/nav-order', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order }),
      })
      const data = await response.json().catch(() => null)
      if (!response.ok || !data?.user) {
        replaceUser({ ...user, navOrder: previous })
        toast.error(data?.error ?? '순서를 저장하지 못했습니다.')
        return
      }
      replaceUser(data.user)
    } catch {
      replaceUser({ ...user, navOrder: previous })
      toast.error('순서를 저장하지 못했습니다.')
    } finally {
      setSaving(false)
    }
  }
  const startDrag = (event: React.PointerEvent<HTMLDivElement>, id: string) => {
    if (saving || event.button !== 0) return
    event.preventDefault()
    const order = savedSections.map((section) => section.id)
    const rects = order.map((key) => rowRefs.current.get(key)?.getBoundingClientRect())
    if (rects.some((rect) => !rect)) return
    const tops = rects.map((rect) => rect!.top)
    const self = rects[order.indexOf(id)]!
    dragRef.current = { id, order, tops, height: self.height, grab: event.clientY - self.top }
    setDragY(event.clientY)
    setDragId(id)
    setDraft(order)
  }

  useEffect(() => {
    if (!dragId) return
    const move = (event: PointerEvent) => {
      const drag = dragRef.current
      if (!drag) return
      const min = drag.tops[0] + drag.grab
      const max = drag.tops[drag.tops.length - 1] + drag.grab
      const y = Math.min(max, Math.max(min, event.clientY))
      setDragY(y)
      const center = y - drag.grab + drag.height / 2
      const index = drag.tops.filter((top, i) => i > 0 && top + drag.height / 2 <= center).length
      const others = drag.order.filter((key) => key !== drag.id)
      const next = [...others.slice(0, index), drag.id, ...others.slice(index)]
      if (next.some((key, i) => key !== drag.order[i])) {
        drag.order = next
        setDraft(next)
      }
    }
    const finish = (event: PointerEvent) => {
      if (event.type === 'pointerup') move(event)
      const drag = dragRef.current
      dragRef.current = null
      setDragId(null)
      setDraft(null)
      setDragY(null)
      if (event.type === 'pointerup' && drag && drag.order.some((key, i) => key !== savedSections[i]?.id)) {
        void saveOrder(mergeVisibleOrder(user?.navOrder, drag.order))
      }
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', finish)
    window.addEventListener('pointercancel', finish)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', finish)
      window.removeEventListener('pointercancel', finish)
    }
  })

  const dragOffset = (id: string) => {
    const drag = dragRef.current
    if (!drag || drag.id !== id || dragY === null) return 0
    return dragY - drag.grab - drag.tops[drag.order.indexOf(id)]
  }

  return (
    <nav className="space-y-1 px-3">
      {!collapsed && (
        <div className="mb-2 flex items-center justify-end gap-1">
          <button
            type="button"
            onClick={() => setReordering((value) => !value)}
            className="rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:border-white/15 dark:bg-white/5 dark:text-white/70 dark:hover:bg-white/10 dark:hover:text-white"
          >
            {reordering ? '완료' : '순서'}
          </button>
          {reordering ? (
            !isDefaultNavOrder(user?.navOrder) && (
              <button
                type="button"
                onClick={() => void saveOrder(null)}
                className="rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:border-white/15 dark:bg-white/5 dark:text-white/70 dark:hover:bg-white/10 dark:hover:text-white"
              >
                기본
              </button>
            )
          ) : (
            <button
              type="button"
              onClick={() => setAll(!anyOpen)}
              className="rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:border-white/15 dark:bg-white/5 dark:text-white/70 dark:hover:bg-white/10 dark:hover:text-white"
            >
              {anyOpen ? '전체 접기' : '전체 펼치기'}
            </button>
          )}
        </div>
      )}
      {reordering && !collapsed && (
        <p className="px-2 pb-1 text-[11px] text-slate-500 dark:text-white/50">메뉴를 끌어서 순서를 바꾸세요</p>
      )}
      {sections.map((section) => {
        const Icon = section.icon
        const items = section.children?.filter((item) => allowed(item.minRole)) ?? []
        const childActive = items.some((item) => isActive(item.href, pathname, tab))
        const selfActive = isActive(section.href, pathname, tab)

        const headerClass = cn(
          'group relative flex h-11 w-full items-center rounded-lg text-[15px] font-bold transition-colors',
          collapsed ? 'justify-center px-0' : 'px-3',
          selfActive || (collapsed && childActive)
            ? 'bg-[oklch(0.52_0.19_258/0.1)] dark:bg-white/10 text-slate-900 dark:text-white after:absolute after:-right-3 after:top-1.5 after:h-8 after:w-[3px] after:rounded-full after:bg-[oklch(0.52_0.19_258)] dark:after:bg-[oklch(0.78_0.14_220)]'
            : 'text-slate-800 dark:text-white/90 hover:bg-slate-100 dark:hover:bg-white/5',
        )
        const iconEl = (
          <Icon className={cn('h-[18px] w-[18px] shrink-0', selfActive || childActive ? 'text-[oklch(0.52_0.19_258)] dark:text-[oklch(0.8_0.13_220)]' : 'text-slate-400 dark:text-white/55')} />
        )
        if (reordering && !collapsed) {
          return (
            <div
              key={section.id}
              ref={(node) => {
                if (node) rowRefs.current.set(section.id, node)
                else rowRefs.current.delete(section.id)
              }}
              role="button"
              aria-label={`${section.label} 끌어서 순서 바꾸기`}
              draggable={false}
              onDragStart={(event) => event.preventDefault()}
              onPointerDown={(event) => startDrag(event, section.id)}
              style={dragId === section.id ? { transform: `translateY(${dragOffset(section.id)}px)` } : undefined}
              className={cn(
                headerClass,
                'cursor-grab touch-none select-none border border-dashed border-slate-300 bg-white/60 dark:border-white/15 dark:bg-white/5',
                dragId === section.id && 'z-20 scale-[1.03] cursor-grabbing border-solid border-[oklch(0.52_0.19_258)] bg-white shadow-xl transition-none dark:bg-[oklch(0.3_0.05_255)]',
                saving && 'cursor-wait opacity-60',
              )}
            >
              {iconEl}
              <span className="ml-3 truncate">{section.label}</span>
              <GripVertical className="ml-auto h-4 w-4 text-slate-400 dark:text-white/40" />
            </div>
          )
        }

        if (!section.children) {
          return (
            <Link key={section.id} href={section.href ?? '/'} onClick={onClose} className={headerClass} title={collapsed ? section.label : undefined}>
              {iconEl}
              {!collapsed && <span className="ml-3">{section.label}</span>}
            </Link>
          )
        }

        const expanded = !collapsed && isSectionOpen(section)

        return (
          <div key={section.id}>
            <button
              type="button"
              aria-expanded={expanded}
              title={collapsed ? section.label : undefined}
              onClick={() => {
                if (collapsed) {
                  onExpand()
                  setOpenSections((prev) => ({ ...prev, [section.label]: true }))
                } else {
                  setOpenSections((prev) => ({ ...prev, [section.label]: !expanded }))
                }
              }}
              className={headerClass}
            >
              {iconEl}
              {!collapsed && (
                <>
                  <span className="ml-3">{section.label}</span>
                  <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full border border-slate-300 dark:border-white/15 px-1.5 text-[11px] font-semibold text-slate-600 dark:text-white/75">
                    {items.length}
                  </span>
                  <ChevronDown className={cn('h-4 w-4 text-slate-400 dark:text-white/40 transition-transform', 'ml-2', !expanded && '-rotate-90')} />
                </>
              )}
            </button>
            {expanded && (
              <div className="mb-2 ml-[22px] space-y-px border-l border-slate-200 dark:border-white/10 pl-3">
                {items.map((item) => {
                  const active = isActive(item.href, pathname, tab)
                  return (
                    <Link
                      key={item.label}
                      href={item.href}
                      onClick={onClose}
                      className={cn(
                        'relative flex h-9 items-center rounded-md px-3 text-[15px] transition-colors',
                        active
                          ? 'bg-[oklch(0.52_0.19_258/0.09)] dark:bg-[oklch(0.78_0.14_220/0.14)] font-semibold text-[oklch(0.52_0.19_258)] dark:text-[oklch(0.85_0.12_215)] before:absolute before:-left-[13px] before:top-2 before:h-5 before:w-[2px] before:bg-[oklch(0.52_0.19_258)] dark:before:bg-[oklch(0.78_0.14_220)]'
                          : item.soon
                            ? 'text-slate-700 dark:text-white/70 hover:bg-slate-100 dark:hover:bg-white/5'
                            : 'text-slate-800 dark:text-white/90 hover:bg-slate-100 dark:hover:bg-white/5 hover:text-slate-950 dark:hover:text-white',
                      )}
                    >
                      <span className="truncate">{item.label}</span>
                      {item.soon && (
                        <span className="ml-auto rounded bg-amber-100 px-1.5 py-px text-[10px] font-semibold text-amber-700 dark:bg-white/5 dark:text-white/40">예정</span>
                      )}
                      {item.testing && (
                        <span className="ml-auto rounded bg-sky-100 px-1.5 py-px text-[10px] font-semibold text-sky-700 dark:bg-sky-400/10 dark:text-sky-300">개발 중</span>
                      )}
                    </Link>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}
    </nav>
  )
}
