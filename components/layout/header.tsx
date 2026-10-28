'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Sun, Moon, Menu } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'  
import Image from "next/image"
import { UserMenu } from '@/components/auth/user-menu'

interface HeaderProps {
  currentPage?: string
  onMenuToggle?: () => void
}

export function Header({ currentPage, onMenuToggle }: HeaderProps) {
  const router = useRouter()
  const [dark, setDark] = useState(false)

  useEffect(() => {
    const stored = localStorage.getItem('theme')
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    const isDark = stored ? stored === 'dark' : prefersDark
    setDark(isDark)
    document.documentElement.classList.toggle('dark', isDark)
  }, [])

  const toggleDark = () => {
    const next = !dark
    setDark(next)
    document.documentElement.classList.toggle('dark', next)
    localStorage.setItem('theme', next ? 'dark' : 'light')
  }

  return (
    <header className="no-print h-14 bg-card border-b border-border flex items-center px-4 gap-3 sticky top-0 z-40 shadow-sm">
      <button
        onClick={onMenuToggle}
        className="lg:hidden p-1.5 rounded-md hover:bg-muted transition-colors"
        aria-label="메뉴 열기"
      >
        <Menu className="w-5 h-5 text-muted-foreground" />
      </button>

      {/* Logo */}
      <button
        onClick={() => router.push('/')}
        className="flex items-center gap-3 mr-0 cursor-pointer lg:hidden"
        aria-label="대시보드로 이동"
      >
        <div className="w-[95px] h-[50px] flex items-center justify-center flex-shrink-0">
          <Image
            src={dark ? "/logo-dark.png" : "/logo.png"}
            width={120}
            height={72}
            alt="logo"
            className="object-contain"
            priority
          />
        </div>
      </button>

      {/* Current page indicator */}
      {currentPage && (
        <div className="hidden md:flex items-center gap-2">
          <span className="text-muted-foreground text-lg">/</span>
          <span className="text-lg font-semibold text-foreground">{currentPage}</span>
        </div>
      )}

      <div className="flex-1" />
      {/* Dark mode toggle */}
      <Button
        variant="ghost"
        size="icon"
        onClick={toggleDark}
        className="text-muted-foreground hover:text-foreground w-8 h-8"
        aria-label={dark ? '라이트 모드로 전환' : '다크 모드로 전환'}
      >
        {dark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
      </Button>

      {/* User menu */}
      <UserMenu />
    </header>
  )
}
