'use client'

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { Camera, CameraOff, CheckCircle2, CircleAlert, Keyboard, Plus, ScanBarcode } from 'lucide-react'
import { useAuth } from '@/components/auth/auth-context'
import { BarcodeRegisterDialog } from '@/components/shared/barcode-register-dialog'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { TraceResultView } from '@/components/dashboard/trace-result'
import { getJsonAuthHeaders } from '@/lib/auth-client'
import { BARCODE_STATUS_LABEL, SCAN_STATUS_MODES, type BarcodeStatus, type StatusChangeResult, type TraceResult } from '@/lib/trace'
import { cn } from '@/lib/utils'

type Status = { tone: 'info' | 'error'; text: string } | null
type ScanMode = 'view' | BarcodeStatus

/** 상태 변경 모드로 찍은 결과를 화면 아래에 쌓아 두는 한 줄 */
interface ChangeEntry {
  key: number
  tone: 'changed' | 'same' | 'error'
  text: string
}

const MODE_HINT: Record<ScanMode, string> = {
  view: '제품 라벨의 바코드를 화면 가운데 칸에 맞추면 제품 이력이 나타납니다.',
  received: '',
  working: '작업을 시작하는 제품의 바코드를 찍으면 "작업중"으로 바뀝니다. 계속 찍어서 여러 개를 처리할 수 있습니다.',
  done: '작업이 끝난 제품의 바코드를 찍으면 "작업완료"로 바뀝니다. 계속 찍어서 여러 개를 처리할 수 있습니다.',
  shipReady: '출하성적서가 나온 제품의 바코드를 찍으면 "출하대기"로 바뀝니다. 출하성적서가 없으면 바뀌지 않습니다.',
  shipped: '출하된 제품의 바코드를 찍으면 "출하완료"로 바뀝니다. 계속 찍어서 여러 개를 처리할 수 있습니다.',
}

const MODE_TONE: Record<ScanMode, string> = {
  view: 'border-blue-600 bg-blue-600 text-white',
  received: '',
  working: 'border-amber-500 bg-amber-400 text-amber-950',
  done: 'border-sky-500 bg-sky-400 text-sky-950',
  shipReady: 'border-violet-500 bg-violet-500 text-white',
  shipped: 'border-emerald-600 bg-emerald-500 text-white',
}

/**
 * 바코드 스캔 버튼 + 창. 읽은 제품의 정보·작업 이력·관련 서류를 같은 창에 보여 준다.
 * - 카메라(기본): 창을 열면 바로 카메라가 켜지고 바코드를 비추면 읽는다(HTTPS 또는 localhost 에서만 브라우저가 카메라를 허용).
 * - 번호 입력: USB·블루투스 스캐너는 키보드처럼 입력되므로 입력칸에 스캔하거나 번호를 직접 쳐도 된다.
 */
export function BarcodeScanButton({ variant = 'card' }: { variant?: 'card' | 'header' }) {
  const [open, setOpen] = useState(false)
  const [code, setCode] = useState('')
  const [status, setStatus] = useState<Status>(null)
  const [busy, setBusy] = useState(false)
  const [cameraOn, setCameraOn] = useState(false)
  const [manual, setManual] = useState(false)
  const [video, setVideo] = useState<HTMLVideoElement | null>(null)
  const [result, setResult] = useState<TraceResult | null>(null)
  const [mode, setModeState] = useState<ScanMode>('view')
  const [changes, setChanges] = useState<ChangeEntry[]>([])
  const [registerOpen, setRegisterOpen] = useState(false)
  const { user } = useAuth()
  const canWrite = user?.role === 'editor' || user?.role === 'admin'
  const lookingUp = useRef(false)
  // 카메라 읽기 콜백은 한 번만 만들어 두므로, 모드는 ref 로 최신값을 읽는다.
  const modeRef = useRef<ScanMode>('view')
  const lastScan = useRef({ code: '', at: 0 })
  const changeKey = useRef(0)

  function setMode(next: ScanMode) {
    modeRef.current = next
    setModeState(next)
    setStatus(null)
    setChanges([])
  }

  const cameraSupported = typeof window !== 'undefined' && window.isSecureContext && !!navigator.mediaDevices?.getUserMedia

  const pushChange = useCallback((entry: Omit<ChangeEntry, 'key'>) => {
    changeKey.current += 1
    setChanges((current) => [{ ...entry, key: changeKey.current }, ...current].slice(0, 6))
  }, [])

  /** 상태 변경 모드: 바코드를 찍으면 모드에 맞는 상태로 바꾸고, 화면은 그대로 둬서 이어서 찍을 수 있게 한다. */
  const changeStatus = useCallback(async (value: string, target: BarcodeStatus) => {
    setBusy(true)
    setStatus(null)
    try {
      const response = await fetch('/api/trace/status', {
        method: 'POST',
        headers: getJsonAuthHeaders(),
        body: JSON.stringify({ code: value, status: target }),
      })
      const body = await response.json().catch(() => null)
      if (!response.ok) {
        navigator.vibrate?.([60, 40, 60])
        pushChange({ tone: 'error', text: `${value} — ${body?.error ?? '상태를 바꾸지 못했습니다.'}` })
        return
      }
      const data = body.data as StatusChangeResult
      const name = [data.partner, data.product].filter(Boolean).join(' · ')
      navigator.vibrate?.(80)
      pushChange(data.changed
        ? { tone: 'changed', text: `${data.barcode} · ${name} — ${BARCODE_STATUS_LABEL[data.previous]} → ${BARCODE_STATUS_LABEL[data.status]}` }
        : { tone: 'same', text: `${data.barcode} · ${name} — 이미 ${BARCODE_STATUS_LABEL[data.status]} 상태입니다` })
    } catch {
      pushChange({ tone: 'error', text: `${value} — 상태를 바꾸지 못했습니다. 잠시 후 다시 시도해 주세요.` })
    } finally {
      setBusy(false)
      setCode('')
    }
  }, [pushChange])

  const lookup = useCallback(async (raw: string) => {
    const value = raw.trim()
    if (!value || lookingUp.current) return
    const target = modeRef.current
    if (target !== 'view') {
      // 카메라가 같은 바코드를 연달아 읽어도 한 번만 처리한다.
      const now = Date.now()
      if (lastScan.current.code === value && now - lastScan.current.at < 4000) return
      lastScan.current = { code: value, at: now }
      lookingUp.current = true
      await changeStatus(value, target)
      window.setTimeout(() => { lookingUp.current = false }, 800)
      return
    }
    lookingUp.current = true
    setBusy(true)
    setStatus({ tone: 'info', text: `${value} 조회 중…` })
    try {
      const response = await fetch(`/api/trace?code=${encodeURIComponent(value)}`, { cache: 'no-store' })
      const body = await response.json().catch(() => null)
      if (!response.ok) {
        setStatus({ tone: 'error', text: `${value} — ${body?.error ?? '조회하지 못했습니다.'}` })
        setCode('')
        return
      }
      navigator.vibrate?.(80)
      setCameraOn(false)
      setStatus(null)
      setCode('')
      setResult(body.data)
    } catch {
      setStatus({ tone: 'error', text: '조회하지 못했습니다. 잠시 후 다시 시도해 주세요.' })
    } finally {
      setBusy(false)
      // 같은 바코드를 연달아 읽어 중복 조회하지 않도록 잠깐 막는다.
      window.setTimeout(() => { lookingUp.current = false }, 1500)
    }
  }, [changeStatus])

  // 창을 열면 카메라를 바로 켠다. 카메라를 쓸 수 없는 주소(HTTP)면 번호 입력을 펼쳐 둔다.
  useEffect(() => {
    if (open) {
      setCameraOn(cameraSupported)
      setManual(!cameraSupported)
    } else {
      setCameraOn(false)
      setManual(false)
      setCode('')
      setStatus(null)
      setResult(null)
      setChanges([])
      modeRef.current = 'view'
      setModeState('view')
      lastScan.current = { code: '', at: 0 }
    }
  }, [open, cameraSupported])

  function scanAgain() {
    setResult(null)
    setStatus(null)
    setCameraOn(cameraSupported)
  }

  useEffect(() => {
    if (!cameraOn || !video) return
    let cancelled = false
    let stop: (() => void) | undefined

    ;(async () => {
      try {
        const [{ BrowserMultiFormatReader }, { BarcodeFormat, DecodeHintType }] = await Promise.all([
          import('@zxing/browser'),
          import('@zxing/library'),
        ])
        const hints = new Map()
        hints.set(DecodeHintType.POSSIBLE_FORMATS, [
          BarcodeFormat.CODE_128, BarcodeFormat.CODE_39, BarcodeFormat.EAN_13, BarcodeFormat.QR_CODE,
        ])
        hints.set(DecodeHintType.TRY_HARDER, true)
        const reader = new BrowserMultiFormatReader(hints, { delayBetweenScanAttempts: 80 })
        const controls = await reader.decodeFromConstraints(
          { video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } } },
          video,
          (result) => { if (result && !cancelled) void lookup(result.getText()) },
        )
        if (cancelled) controls.stop()
        else stop = () => controls.stop()
      } catch (error) {
        if (cancelled) return
        const denied = error instanceof DOMException && (error.name === 'NotAllowedError' || error.name === 'SecurityError')
        setCameraOn(false)
        setManual(true)
        setStatus({
          tone: 'error',
          text: denied
            ? '카메라 사용이 허용되지 않았습니다. 주소창의 카메라 아이콘에서 허용한 뒤 다시 켜 주세요.'
            : '카메라를 열지 못했습니다. 다른 앱이 카메라를 쓰고 있지 않은지 확인해 주세요.',
        })
      }
    })()

    return () => {
      cancelled = true
      stop?.()
    }
  }, [cameraOn, video, lookup])

  function submit(event: FormEvent) {
    event.preventDefault()
    void lookup(code)
  }

  return (
    <>
      <button
        type="button"
        onPointerDown={(event) => event.stopPropagation()}
        onClick={() => setOpen(true)}
        aria-label="바코드 스캔"
        className={variant === 'header'
          ? 'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-blue-600 bg-blue-600 px-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700 sm:px-3'
          : 'inline-flex items-center gap-1 rounded-lg border bg-card px-2.5 py-1 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800'}
      >
        <ScanBarcode className={variant === 'header' ? 'h-4 w-4' : 'h-3.5 w-3.5'} />
        {variant === 'header' ? (
          <>
            <span className="sm:hidden">스캔</span>
            <span className="hidden sm:inline">바코드 스캔</span>
          </>
        ) : (
          '바코드 스캔'
        )}
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          overlayClassName="!z-[70]"
          className={result ? '!z-[80] max-h-[92dvh] max-w-[calc(100%-1rem)] overflow-y-auto sm:max-w-5xl' : '!z-[80] max-h-[92dvh] overflow-y-auto sm:max-w-md'}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <DialogHeader>
            <DialogTitle className="text-lg font-bold">{result ? '제품 이력' : '바코드 스캔'}</DialogTitle>
            <DialogDescription className={result ? 'sr-only' : undefined}>
              {result ? '스캔한 제품의 정보와 작업 이력, 관련 서류입니다.' : MODE_HINT[mode]}
            </DialogDescription>
          </DialogHeader>

          {result ? (
            <TraceResultView data={result} onNavigate={() => setOpen(false)} onRescan={scanAgain} />
          ) : (
            <>
            <div role="radiogroup" aria-label="스캔 모드" className="grid grid-cols-5 gap-1">
              {(['view', ...SCAN_STATUS_MODES] as ScanMode[]).map((item) => {
                const selected = mode === item
                const locked = item !== 'view' && !canWrite
                return (
                  <button
                    key={item}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    disabled={locked}
                    title={locked ? '상태를 바꾸려면 편집 권한이 필요합니다.' : undefined}
                    onClick={() => setMode(item)}
                    className={cn(
                      'h-11 rounded-lg border px-1 text-[13px] font-bold leading-tight transition disabled:cursor-not-allowed disabled:opacity-40',
                      selected ? MODE_TONE[item] : 'bg-card text-slate-600 hover:bg-muted dark:text-slate-300',
                    )}
                  >
                    {item === 'view' ? '조회' : BARCODE_STATUS_LABEL[item]}
                  </button>
                )
              })}
            </div>
            {mode !== 'view' && (
              <p className="rounded-lg bg-muted px-3 py-2 text-xs font-medium text-muted-foreground">
                지금은 <b className="text-foreground">{BARCODE_STATUS_LABEL[mode]}</b> 모드입니다. 찍는 즉시 상태가 바뀝니다. 제품 이력을 보려면 "조회"를 누르세요.
              </p>
            )}

            {cameraSupported && (
              cameraOn ? (
                <div className="relative overflow-hidden rounded-xl bg-black">
                  <video ref={setVideo} muted playsInline autoPlay className="aspect-[3/4] max-h-[52dvh] w-full object-cover sm:aspect-[4/3]" />
                  <div className="pointer-events-none absolute inset-x-[7%] top-1/2 h-[34%] -translate-y-1/2 rounded-xl border-2 border-white/90 shadow-[0_0_0_9999px_rgba(0,0,0,0.5)]">
                    <div className="absolute inset-x-3 top-1/2 h-0.5 -translate-y-1/2 bg-rose-500/90" />
                  </div>
                  {busy && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/55 text-sm font-semibold text-white">{mode === 'view' ? '조회 중…' : '처리 중…'}</div>
                  )}
                </div>
              ) : (
                <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed px-4 py-8 text-center">
                  <CameraOff className="h-8 w-8 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">카메라가 꺼져 있습니다.</p>
                  <Button type="button" onClick={() => setCameraOn(true)}>
                    <Camera className="h-4 w-4" />카메라 켜기
                  </Button>
                </div>
              )
            )}

            {!cameraSupported && (
              <p className="rounded-xl border border-dashed px-3 py-3 text-sm text-muted-foreground">
                이 주소(HTTP)에서는 브라우저가 카메라를 막습니다. HTTPS 주소로 접속하면 카메라로 스캔할 수 있습니다. 지금은 스캐너나 번호 입력을 사용해 주세요.
              </p>
            )}

            {status && (
              <p className={status.tone === 'error' ? 'text-sm font-medium text-rose-600 dark:text-rose-300' : 'text-sm text-muted-foreground'}>
                {status.text}
              </p>
            )}

            {changes.length > 0 && (
              <ul className="space-y-1.5" aria-live="polite">
                {changes.map((entry) => (
                  <li
                    key={entry.key}
                    className={cn(
                      'flex items-start gap-2 rounded-lg border px-3 py-2 text-sm font-medium',
                      entry.tone === 'changed' && 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-500/40 dark:bg-emerald-950/40 dark:text-emerald-100',
                      entry.tone === 'same' && 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-500/40 dark:bg-amber-950/40 dark:text-amber-100',
                      entry.tone === 'error' && 'border-rose-200 bg-rose-50 text-rose-900 dark:border-rose-500/40 dark:bg-rose-950/40 dark:text-rose-100',
                    )}
                  >
                    {entry.tone === 'changed' ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />}
                    <span className="min-w-0 break-words">{entry.text}</span>
                  </li>
                ))}
              </ul>
            )}

            {cameraSupported && !manual ? (
              <button
                type="button"
                onClick={() => setManual(true)}
                className="inline-flex items-center justify-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground"
              >
                <Keyboard className="h-3.5 w-3.5" />
                번호로 직접 입력 / 스캐너 사용
              </button>
            ) : (
              <form onSubmit={submit} className="space-y-1.5">
                <span className="text-xs font-semibold text-muted-foreground">번호 입력 / 스캐너</span>
                <div className="flex gap-2">
                  <Input
                    autoFocus={!cameraSupported}
                    value={code}
                    onChange={(event) => setCode(event.target.value)}
                    placeholder="예) WR2611240001"
                    autoComplete="off"
                    autoCapitalize="characters"
                    className="font-mono"
                  />
                  <Button type="submit" disabled={busy || !code.trim()}>{mode === 'view' ? '조회' : '적용'}</Button>
                </div>
              </form>
            )}

            {canWrite && (
              <Button type="button" variant="outline" size="sm" onClick={() => setRegisterOpen(true)} className="w-full">
                <Plus className="h-4 w-4" />입고 없이 바코드 직접 등록
              </Button>
            )}
            </>
          )}
        </DialogContent>
      </Dialog>

      <BarcodeRegisterDialog open={registerOpen} onOpenChange={setRegisterOpen} />
    </>
  )
}
