'use client'

import { useEffect, useState } from 'react'
import { SettingsView } from '@/components/settings/settings-view'
import { getSession } from '@/lib/auth-client'
import { SessionUser } from '@/lib/types'
import { ShieldAlert } from 'lucide-react'

export default function SettingsPage() {
  const [user, setUser] = useState<SessionUser | null | undefined>(undefined)

  useEffect(() => {
    setUser(getSession())
  }, [])

  if (user === undefined) {
    return null
  }

  if (!user) {
    return null
  }

  // 뷰어 차단
  if (user.role === 'viewer') {
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
            설정은 편집자 또는 관리자만 사용할 수 있습니다.
          </p>
  
        </div>
      </div>
    )
  }

  return <SettingsView />
}