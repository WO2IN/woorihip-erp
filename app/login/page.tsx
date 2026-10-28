'use client'

import { useState, useEffect } from 'react'
import Image from 'next/image'
import { Eye, EyeOff, LogIn, UserPlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { setSession, getSession } from '@/lib/auth-client'
import { SessionUser } from '@/lib/types'
import { cn } from '@/lib/utils'

type Tab = 'login' | 'register'

export default function LoginPage() {
  const [tab, setTab] = useState<Tab>('login')

  // Login state
  const [loginUsername, setLoginUsername] = useState('')
  const [loginPassword, setLoginPassword] = useState('')
  const [loginShowPw, setLoginShowPw] = useState(false)
  const [loginError, setLoginError] = useState('')
  const [loginLoading, setLoginLoading] = useState(false)

  // Register state
  const [regUsername, setRegUsername] = useState('')
  const [regDisplayName, setRegDisplayName] = useState('')
  const [regPassword, setRegPassword] = useState('')
  const [regConfirm, setRegConfirm] = useState('')
  const [regShowPw, setRegShowPw] = useState(false)
  const [regError, setRegError] = useState('')
  const [regSuccess, setRegSuccess] = useState('')
  const [regLoading, setRegLoading] = useState(false)

  const [dark, setDark] = useState(false)

  useEffect(() => {
    const session = getSession()
    if (session) window.location.replace('/')
  }, [])

  useEffect(() => {
    const stored = localStorage.getItem('theme')
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    const isDark = stored ? stored === 'dark' : prefersDark
    setDark(isDark)
    document.documentElement.classList.toggle('dark', isDark)
  }, [])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!loginUsername.trim() || !loginPassword) return

    setLoginError('')
    setLoginLoading(true)

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: loginUsername.trim(), password: loginPassword }),
      })

      const data = await res.json()

      if (!res.ok) {
        setLoginError(data.error || '로그인에 실패했습니다.')
        return
      }

      setSession(data.user as SessionUser)
      window.location.replace('/')
    } catch {
      setLoginError('서버와 연결할 수 없습니다. 잠시 후 다시 시도해주세요.')
    } finally {
      setLoginLoading(false)
    }
  }

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    setRegError('')
    setRegSuccess('')

    if (!regUsername.trim() || !regDisplayName.trim() || !regPassword) return

    if (regPassword !== regConfirm) {
      setRegError('비밀번호가 일치하지 않습니다.')
      return
    }

    setRegLoading(true)

    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: regUsername.trim(),
          displayName: regDisplayName.trim(),
          password: regPassword,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        setRegError(data.error || '회원가입에 실패했습니다.')
        return
      }

      setRegSuccess('가입 신청이 접수되었습니다. 관리자 승인 후 로그인할 수 있습니다.')
      setTimeout(() => {
        setTab('login')
      }, 1500)
      setRegUsername('')
      setRegDisplayName('')
      setRegPassword('')
      setRegConfirm('')
    } catch {
      setRegError('서버와 연결할 수 없습니다. 잠시 후 다시 시도해주세요.')
    } finally {
      setRegLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex justify-center mb-8">
          <div className="w-[140px] h-[60px] flex items-center justify-center">
            <Image
              src={dark ? '/logo-dark.png' : '/logo.png'}
              width={140}
              height={60}
              alt="WOORI-HIP"
              className="object-contain"
              priority
            />
          </div>
        </div>

        {/* Card */}
        <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
          {/* Tabs */}
          <div className="flex border-b border-border">
            <button
              type="button"
              onClick={() => { setTab('login'); setLoginError('') }}
              className={cn(
                'flex-1 py-3.5 text-sm font-medium transition-colors',
                tab === 'login'
                  ? 'text-foreground border-b-2 border-primary -mb-px'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              로그인
            </button>
            <button
              type="button"
              onClick={() => { setTab('register'); setRegError(''); setRegSuccess('') }}
              className={cn(
                'flex-1 py-3.5 text-sm font-medium transition-colors',
                tab === 'register'
                  ? 'text-foreground border-b-2 border-primary -mb-px'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              회원가입
            </button>
          </div>

          <div className="p-8">
            {/* Login form */}
            {tab === 'login' && (
              <>
                <div className="mb-6">
                  <h1 className="text-xl font-semibold text-foreground">로그인</h1>
                  <p className="text-sm text-muted-foreground mt-1">
                    통합 업무 관리 시스템에 로그인하세요
                  </p>
                </div>

                <form onSubmit={handleLogin} className="flex flex-col gap-4">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="username" className="text-sm font-medium">
                      아이디
                    </Label>
                    <Input
                      id="username"
                      type="text"
                      value={loginUsername}
                      onChange={e => setLoginUsername(e.target.value)}
                      placeholder="아이디를 입력하세요"
                      autoComplete="username"
                      autoFocus
                      disabled={loginLoading}
                      className="h-10"
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="password" className="text-sm font-medium">
                      비밀번호
                    </Label>
                    <div className="relative">
                      <Input
                        id="password"
                        type={loginShowPw ? 'text' : 'password'}
                        value={loginPassword}
                        onChange={e => setLoginPassword(e.target.value)}
                        placeholder="비밀번호를 입력하세요"
                        autoComplete="current-password"
                        disabled={loginLoading}
                        className="h-10 pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setLoginShowPw(v => !v)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                        aria-label={loginShowPw ? '비밀번호 숨기기' : '비밀번호 보기'}
                        tabIndex={-1}
                      >
                        {loginShowPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  {loginError && (
                    <p className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2">
                      {loginError}
                    </p>
                  )}

                  <Button
                    type="submit"
                    className="h-10 gap-2 mt-1"
                    disabled={loginLoading || !loginUsername.trim() || !loginPassword}
                  >
                    <LogIn className="w-4 h-4" />
                    {loginLoading ? '로그인 중...' : '로그인'}
                  </Button>
                </form>
              </>
            )}

            {/* Register form */}
            {tab === 'register' && (
              <>
                <div className="mb-6">
                  <h1 className="text-xl font-semibold text-foreground">회원가입</h1>
                  <p className="text-sm text-muted-foreground mt-1">
                    가입 후 기본 뷰어 권한이 부여됩니다
                  </p>
                </div>

                <form onSubmit={handleRegister} className="flex flex-col gap-4">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="reg-username" className="text-sm font-medium">
                      아이디
                    </Label>
                    <Input
                      id="reg-username"
                      type="text"
                      value={regUsername}
                      onChange={e => setRegUsername(e.target.value)}
                      placeholder="영문, 숫자 3자 이상"
                      autoComplete="username"
                      autoFocus
                      disabled={regLoading}
                      className="h-10"
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="reg-displayname" className="text-sm font-medium">
                      이름
                    </Label>
                    <Input
                      id="reg-displayname"
                      type="text"
                      value={regDisplayName}
                      onChange={e => setRegDisplayName(e.target.value)}
                      placeholder="표시될 이름 (예: 홍길동)"
                      autoComplete="name"
                      disabled={regLoading}
                      className="h-10"
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="reg-password" className="text-sm font-medium">
                      비밀번호
                    </Label>
                    <div className="relative">
                      <Input
                        id="reg-password"
                        type={regShowPw ? 'text' : 'password'}
                        value={regPassword}
                        onChange={e => setRegPassword(e.target.value)}
                        placeholder="4자 이상"
                        autoComplete="new-password"
                        disabled={regLoading}
                        className="h-10 pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setRegShowPw(v => !v)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                        aria-label={regShowPw ? '비밀번호 숨기기' : '비밀번호 보기'}
                        tabIndex={-1}
                      >
                        {regShowPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="reg-confirm" className="text-sm font-medium">
                      비밀번호 확인
                    </Label>
                    <Input
                      id="reg-confirm"
                      type={regShowPw ? 'text' : 'password'}
                      value={regConfirm}
                      onChange={e => setRegConfirm(e.target.value)}
                      placeholder="비밀번호를 다시 입력하세요"
                      autoComplete="new-password"
                      disabled={regLoading}
                      className="h-10"
                    />
                  </div>

                  {regError && (
                    <p className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2">
                      {regError}
                    </p>
                  )}

                  {regSuccess && (
                    <p className="text-sm text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-950/40 border border-green-200 dark:border-green-800/50 rounded-lg px-3 py-2">
                      {regSuccess}
                    </p>
                  )}

                  <Button
                    type="submit"
                    className="h-10 gap-2 mt-1"
                    disabled={
                      regLoading ||
                      !regUsername.trim() ||
                      !regDisplayName.trim() ||
                      !regPassword ||
                      !regConfirm
                    }
                  >
                    <UserPlus className="w-4 h-4" />
                    {regLoading ? '가입 중...' : '가입하기'}
                  </Button>
                </form>
              </>
            )}
          </div>
        </div>

        <p className="text-center text-xs text-muted-foreground mt-4">
          WOORI-HIP ERP v0.1
        </p>
      </div>
    </div>
  )
}
