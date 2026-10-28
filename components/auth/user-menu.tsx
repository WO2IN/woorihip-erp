'use client'

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

import { Button } from '@/components/ui/button'
import { LogOut, User, ShieldCheck, Eye, Pencil } from 'lucide-react'
import { UserRole } from '@/lib/types'

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
  const { user, logout } = useAuth()
  if (!user) return null

  return (
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
  )
}
