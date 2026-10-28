'use client'

import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { SessionUser } from '@/lib/types'
import { getSession, clearSession, setSession } from '@/lib/auth-client'

interface AuthContextValue {
  user: SessionUser | null
  loading: boolean
  logout: () => void
  replaceUser: (user: SessionUser) => void
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  loading: true,
  logout: () => {},
  replaceUser: () => {},
})

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const syncedId = useRef<string | null>(null)
  const [user, setUser] = useState<SessionUser | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const session = getSession()
    setUser(session)
    setLoading(false)

    if (session && syncedId.current !== session.id) {
      syncedId.current = session.id
      fetch('/api/auth/session', { method: 'POST' })
        .then(async (response) => {
          if (!response.ok) {
            clearSession()
            setUser(null)
            window.location.replace('/login')
            return
          }
          const data = await response.json()
          setSession(data.user)
          setUser(data.user)
          router.refresh()
        })
        .catch(() => {})
    }

    if (!session && pathname !== '/login') {
      window.location.replace('/login')
    }
  }, [pathname, router])

  const logout = useCallback(() => {
    clearSession()
    setUser(null)
    fetch('/api/auth/session', { method: 'DELETE' }).finally(() => {
      window.location.replace('/login')
    })
  }, [])

  const replaceUser = useCallback((next: SessionUser) => {
    setSession(next)
    setUser(next)
  }, [])

  return (
    <AuthContext.Provider value={{ user, loading, logout, replaceUser }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
