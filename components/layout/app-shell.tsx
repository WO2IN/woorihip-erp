'use client'

import { useCallback, useEffect, useState, type MouseEvent as ReactMouseEvent } from 'react'
import { usePathname } from 'next/navigation'
import { Header } from './header'
import { Sidebar } from './sidebar'
import { AuthProvider, useAuth } from '@/components/auth/auth-context'
import { MAIN_TAB, TabBar, TabsProvider, useTabs, withTabMode } from './tab-bar'
import { cn } from '@/lib/utils'
import { pageLabelFor } from '@/lib/nav'

interface AppShellProps {
  children: React.ReactNode
  currentPage?: string
}

function ShellInner({ children, currentPage }: AppShellProps) {
  const { user, loading } = useAuth()
  const pathname = usePathname()
  const { frames, activeId, openTab, activate } = useTabs()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  // 탭 화면(iframe, ?tabmode=1)인지 여부. 서버에서는 알 수 없으므로 마운트 후에 정한다.
  const [framed, setFramed] = useState(false)

  useEffect(() => {
    // 탭 화면은 iframe 안에서 열리므로, 화면 안에서 주소가 바뀌어 ?tabmode=1 이 빠져도 iframe 이면 탭 화면으로 본다
    const isFrame = window.self !== window.top || new URLSearchParams(window.location.search).get('tabmode') === '1'
    setFramed(isFrame)
    if (!isFrame) return
    document.documentElement.classList.add('tab-frame')
    return () => document.documentElement.classList.remove('tab-frame')
  }, [])

  // 탭 화면(iframe)은 별도 문서라서 부모의 다크 모드 상태를 따로 맞춰야 한다
  const syncFrameTheme = useCallback((frame: HTMLIFrameElement) => {
    const doc = frame.contentDocument
    if (!doc) return
    doc.documentElement.classList.toggle('dark', document.documentElement.classList.contains('dark'))
  }, [])

  useEffect(() => {
    const observer = new MutationObserver(() => {
      document.querySelectorAll<HTMLIFrameElement>('iframe[data-tab-frame]').forEach(syncFrameTheme)
    })
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    return () => observer.disconnect()
  }, [syncFrameTheme])

  // Login page renders without shell chrome
  if (pathname === '/login') {
    return <>{children}</>
  }

  // While checking session, render a minimal placeholder to avoid flash
  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  // No session — AuthProvider will redirect, just render nothing
  if (!user) return null

  // 탭 화면은 메뉴·머리글·탭 줄 없이 화면만 그린다
  if (framed) {
    return (
      <main className="app-shell-main relative flex h-screen min-w-0 flex-col overflow-x-hidden overflow-y-auto overscroll-y-contain bg-background pb-10">
        {children}
      </main>
    )
  }

  // 사이드바에서 누른 메뉴는 현재 화면을 바꾸지 않고 새 탭으로 연다 (Ctrl/Shift 클릭 등은 기존 동작 유지)
  const handleSidebarClick = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    const anchor = (event.target as HTMLElement).closest('a[href]')
    if (!(anchor instanceof HTMLAnchorElement) || anchor.target) return
    const href = anchor.getAttribute('href') ?? ''
    if (!href.startsWith('/') || href.startsWith('//')) return
    event.preventDefault()
    // 지금 보고 있는 화면(현재 화면 탭)과 같은 주소면 새 탭을 만들지 않고 그 탭으로 간다
    const [path, query] = href.split('?')
    if (!query && path === pathname) {
      activate(MAIN_TAB)
      return
    }
    // 접힌 메뉴는 글자가 없으므로 title 속성(메뉴 이름)을 먼저 쓴다
    const label = (anchor.getAttribute('title') || anchor.textContent || '').replace(/\s+/g, ' ').trim()
    openTab(href, label || (path === '/' ? '대시보드' : href))
  }

  const mainLabel = currentPage || pageLabelFor(pathname) || '현재 화면'

  return (
    <div className="app-shell flex h-screen overflow-hidden bg-background">
      <div className="contents" onClickCapture={handleSidebarClick}>
        <Sidebar
          open={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          collapsed={collapsed}
          setCollapsed={setCollapsed}
        />
      </div>
      <div className="app-shell-column flex min-h-0 flex-1 flex-col min-w-0 overflow-hidden">
        <Header
          currentPage={currentPage}
          onMenuToggle={() => setSidebarOpen(true)}
        />
        <TabBar mainLabel={mainLabel} mainHome={!currentPage && pathname === '/'} />
        {/* 탭 화면은 숨길 뿐 언마운트하지 않아서, 탭을 오가도 입력 중인 내용이 남는다 */}
        <div className="relative flex min-h-0 flex-1 flex-col">
          <main className={cn('app-shell-main relative flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden overflow-y-auto overscroll-y-contain pb-10', activeId !== MAIN_TAB && 'hidden')}>
            {children}
          </main>
          {frames.map((frame) => (
            <iframe
              key={frame.id}
              data-tab-frame
              onLoad={(event) => syncFrameTheme(event.currentTarget)}
              src={withTabMode(frame.href)}
              title={frame.title}
              className={cn('absolute inset-0 h-full w-full border-0 bg-background', frame.id !== activeId && 'hidden')}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

export function AppShell({ children, currentPage }: AppShellProps) {
  return (
    <AuthProvider>
      <TabsProvider>
        <ShellInner currentPage={currentPage}>
          {children}
        </ShellInner>
      </TabsProvider>
    </AuthProvider>
  )
}
