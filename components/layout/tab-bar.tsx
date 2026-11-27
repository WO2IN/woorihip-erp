'use client'

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { House, X } from 'lucide-react'
import { cn } from '@/lib/utils'

/** 현재 라우트 화면(children)을 나타내는 탭 id */
export const MAIN_TAB = 'main'

export type FrameTab = {
  /** 탭 id = 열린 주소 (같은 주소는 한 탭으로만 연다) */
  id: string
  href: string
  title: string
}

type TabsValue = {
  frames: FrameTab[]
  activeId: string
  openTab: (href: string, title: string) => void
  activate: (id: string) => void
  close: (id: string) => void
}

const TabsContext = createContext<TabsValue | null>(null)

export function TabsProvider({ children }: { children: ReactNode }) {
  const [frames, setFrames] = useState<FrameTab[]>([])
  const [activeId, setActiveId] = useState(MAIN_TAB)

  const openTab = useCallback((href: string, title: string) => {
    setFrames((current) => (current.some((frame) => frame.id === href) ? current : [...current, { id: href, href, title: title || href }]))
    setActiveId(href)
  }, [])

  const activate = useCallback((id: string) => setActiveId(id), [])

  const close = useCallback((id: string) => {
    setFrames((current) => current.filter((frame) => frame.id !== id))
    setActiveId((current) => (current === id ? MAIN_TAB : current))
  }, [])

  const value = useMemo(() => ({ frames, activeId, openTab, activate, close }), [frames, activeId, openTab, activate, close])
  return <TabsContext.Provider value={value}>{children}</TabsContext.Provider>
}

export function useTabs() {
  const value = useContext(TabsContext)
  if (!value) throw new Error('useTabs must be used inside TabsProvider')
  return value
}

/** 메뉴 제목 끝에 붙은 '개발 중' 표시를 떼어 내서, 탭에서는 따로 뱃지로 그린다. */
function splitTitle(title: string) {
  const match = title.match(/^(.*?)\s*개발\s*중$/)
  if (match && match[1].trim()) return { label: match[1].trim(), dev: true }
  return { label: title, dev: false }
}

// Tailwind 는 클래스 이름을 문자열 그대로 찾으므로, 조각을 이어 붙이지 않고 전체 문자열을 적는다.
const TAB_BASE =
  'group relative flex max-w-[260px] shrink-0 items-center gap-2 rounded-t-xl border border-b-0 px-4 py-2 text-sm font-semibold transition-all duration-150'
const TAB_ACTIVE =
  'z-10 border-transparent bg-card text-foreground shadow-[0_-3px_8px_-4px_rgba(15,23,42,0.25)] before:absolute before:-left-2 before:bottom-0 before:h-2 before:w-2 before:bg-[radial-gradient(circle_at_0_0,transparent_7px,var(--card)_7.5px)] after:absolute after:-right-2 after:bottom-0 after:h-2 after:w-2 after:bg-[radial-gradient(circle_at_100%_0,transparent_7px,var(--card)_7.5px)]'
const TAB_IDLE =
  'border-transparent bg-gradient-to-b from-white/75 to-white/45 text-slate-600 shadow-[inset_0_1px_0_rgba(255,255,255,0.95)] hover:from-white hover:to-white/80 hover:text-slate-900'

/** 상단 탭 줄. 첫 탭은 현재 화면, 그 뒤는 메뉴에서 연 화면들이다. */
export function TabBar({ mainLabel, mainHome = false }: { mainLabel: string; mainHome?: boolean }) {
  const { frames, activeId, openTab, activate, close } = useTabs()
  const router = useRouter()

  const tabClass = (active: boolean) => cn(TAB_BASE, active ? TAB_ACTIVE : TAB_IDLE)
  const closeButtonClass = (active: boolean) => cn(
    'flex h-5 w-5 shrink-0 items-center justify-center rounded-full',
    active ? 'text-muted-foreground hover:bg-muted hover:text-foreground' : 'text-slate-500 hover:bg-slate-200/80 hover:text-slate-900',
  )

  // 첫 탭은 주소창의 화면이라 없앨 수 없다. 닫으면 다음 탭을 그 자리로 올리고, 남은 탭이 없으면 대시보드로 간다.
  function closeMain() {
    const next = frames[0]
    if (next) {
      close(next.id)
      router.push(next.href)
    } else {
      router.push('/')
    }
    activate(MAIN_TAB)
  }

  // 홈 탭은 항상 맨 앞에 둔다. 지금 화면이 대시보드가 아니면, 그 화면을 탭으로 남겨 두고 대시보드로 간다.
  function goHome() {
    const here = `${window.location.pathname}${window.location.search}`
    openTab(here, mainLabel)
    router.push('/')
    activate(MAIN_TAB)
  }

  return (
    <div className="app-tabbar no-print flex shrink-0 items-end gap-1 overflow-x-auto overflow-y-hidden border-b border-slate-400/70 bg-background px-3 pt-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {!mainHome && (
        <div className={tabClass(false)}>
          <button type="button" onClick={goHome} className="flex h-5 items-center justify-center" title="대시보드" aria-label="대시보드">
            <House className="h-4 w-4" />
          </button>
        </div>
      )}
      <div className={tabClass(activeId === MAIN_TAB)}>
        <button
          type="button"
          onClick={() => activate(MAIN_TAB)}
          className={cn('min-w-0 text-left', mainHome ? 'flex h-5 items-center justify-center' : 'truncate')}
          title={mainLabel}
          aria-label={mainHome ? mainLabel : undefined}
        >
          {mainHome ? <House className="h-4 w-4" /> : mainLabel}
        </button>
        {!mainHome && (
          <button type="button" onClick={closeMain} aria-label={`${mainLabel} 탭 닫기`} className={closeButtonClass(activeId === MAIN_TAB)}>
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      {frames.map((frame) => {
        const { label, dev } = splitTitle(frame.title)
        return (
          <div key={frame.id} className={tabClass(activeId === frame.id)}>
            <button type="button" onClick={() => activate(frame.id)} className="flex min-w-0 items-center gap-1.5 text-left" title={frame.title}>
              <span className="truncate">{label}</span>
              {dev && (
                <span className="shrink-0 rounded-full border border-sky-200 bg-sky-100 px-1.5 py-px text-[10px] font-semibold leading-4 text-sky-700 dark:border-sky-400/20 dark:bg-sky-400/15 dark:text-sky-300">
                  개발 중
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => close(frame.id)}
              aria-label={`${frame.title} 탭 닫기`}
              className={closeButtonClass(activeId === frame.id)}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )
      })}
    </div>
  )
}

/** 탭으로 여는 주소에 tabmode=1 을 붙여, 그 화면이 메뉴·머리글 없이 보이게 한다. */
export function withTabMode(href: string) {
  return `${href}${href.includes('?') ? '&' : '?'}tabmode=1`
}
