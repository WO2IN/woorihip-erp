'use client'

import { useState } from 'react'
import { usePathname } from 'next/navigation'
import { Header } from './header'
import { Sidebar } from './sidebar'
import { AuthProvider, useAuth } from '@/components/auth/auth-context'

interface AppShellProps {
  children: React.ReactNode
  currentPage?: string
}

function ShellInner({ children, currentPage }: AppShellProps) {
  const { user, loading } = useAuth()
  const pathname = usePathname()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(false)

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

  return (
    <div className="app-shell flex h-screen overflow-hidden bg-background">
      <Sidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        collapsed={collapsed}
        setCollapsed={setCollapsed}
      />
      <div className="app-shell-column flex flex-col flex-1 min-w-0 overflow-hidden">
        <Header
          currentPage={currentPage}
          onMenuToggle={() => setSidebarOpen(true)}
        />
        <main className="app-shell-main flex-1 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  )
}

export function AppShell({ children, currentPage }: AppShellProps) {
  return (
    <AuthProvider>
      <ShellInner currentPage={currentPage}>
        {children}
      </ShellInner>
    </AuthProvider>
  )
}
