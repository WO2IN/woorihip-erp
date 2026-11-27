'use client'

import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Camera, CameraOff, Keyboard } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'

/**
 * 바코드 한 개를 읽어서 돌려주는 창. 서류 작성 중에 바코드를 연동할 때 쓴다.
 * - 카메라: 창을 열면 바로 켜지고 바코드를 비추면 읽는다 (HTTPS 또는 localhost 에서만 브라우저가 허용).
 * - 번호 입력: USB·블루투스 스캐너는 키보드처럼 입력되므로 입력칸에 스캔하거나 번호를 직접 쳐도 된다.
 * 읽으면 onDetect 를 한 번 부르고 창을 닫는다.
 */
export function BarcodeScanDialog({
  open,
  onOpenChange,
  onDetect,
  title = '바코드 스캔',
  description = '입고 때 붙인 바코드 라벨을 화면 가운데 칸에 맞추세요.',
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onDetect: (code: string) => void
  title?: string
  description?: string
}) {
  const [video, setVideo] = useState<HTMLVideoElement | null>(null)
  const [cameraOn, setCameraOn] = useState(false)
  const [manual, setManual] = useState(false)
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const handled = useRef(false)
  const detectRef = useRef(onDetect)
  detectRef.current = onDetect

  const cameraSupported = typeof window !== 'undefined' && window.isSecureContext && !!navigator.mediaDevices?.getUserMedia

  useEffect(() => {
    if (open) {
      handled.current = false
      setCameraOn(cameraSupported)
      setManual(!cameraSupported)
      setCode('')
      setError('')
    } else {
      setCameraOn(false)
    }
  }, [open, cameraSupported])

  function finish(value: string) {
    const text = value.trim()
    if (!text || handled.current) return
    handled.current = true
    navigator.vibrate?.(80)
    setCameraOn(false)
    onOpenChange(false)
    detectRef.current(text)
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
        hints.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.CODE_128, BarcodeFormat.CODE_39, BarcodeFormat.EAN_13, BarcodeFormat.QR_CODE])
        hints.set(DecodeHintType.TRY_HARDER, true)
        const reader = new BrowserMultiFormatReader(hints, { delayBetweenScanAttempts: 80 })
        const controls = await reader.decodeFromConstraints(
          { video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } } },
          video,
          (result) => { if (result && !cancelled) finish(result.getText()) },
        )
        if (cancelled) controls.stop()
        else stop = () => controls.stop()
      } catch (cause) {
        if (cancelled) return
        const denied = cause instanceof DOMException && (cause.name === 'NotAllowedError' || cause.name === 'SecurityError')
        setCameraOn(false)
        setManual(true)
        setError(denied
          ? '카메라 사용이 허용되지 않았습니다. 주소창의 카메라 아이콘에서 허용한 뒤 다시 켜 주세요.'
          : '카메라를 열지 못했습니다. 다른 앱이 카메라를 쓰고 있지 않은지 확인해 주세요.')
      }
    })()

    return () => {
      cancelled = true
      stop?.()
    }
    // finish 는 ref 만 쓰므로 카메라를 다시 켜지 않도록 의존성에서 뺀다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameraOn, video])

  function submit(event: FormEvent) {
    event.preventDefault()
    finish(code)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent overlayClassName="!z-[90]" className="!z-[100] max-h-[92dvh] overflow-y-auto sm:max-w-md" onPointerDown={(event) => event.stopPropagation()}>
        <DialogHeader>
          <DialogTitle className="text-lg font-bold">{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        {cameraSupported ? (
          cameraOn ? (
            <div className="relative overflow-hidden rounded-xl bg-black">
              <video ref={setVideo} muted playsInline autoPlay className="aspect-[3/4] max-h-[52dvh] w-full object-cover sm:aspect-[4/3]" />
              <div className="pointer-events-none absolute inset-x-[7%] top-1/2 h-[34%] -translate-y-1/2 rounded-xl border-2 border-white/90 shadow-[0_0_0_9999px_rgba(0,0,0,0.5)]">
                <div className="absolute inset-x-3 top-1/2 h-0.5 -translate-y-1/2 bg-rose-500/90" />
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed px-4 py-8 text-center">
              <CameraOff className="h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">카메라가 꺼져 있습니다.</p>
              <Button type="button" onClick={() => { setError(''); setCameraOn(true) }}>
                <Camera className="h-4 w-4" />카메라 켜기
              </Button>
            </div>
          )
        ) : (
          <p className="rounded-xl border border-dashed px-3 py-3 text-sm text-muted-foreground">
            이 주소(HTTP)에서는 브라우저가 카메라를 막습니다. HTTPS 주소로 접속하면 카메라로 스캔할 수 있습니다. 지금은 스캐너나 번호 입력을 사용해 주세요.
          </p>
        )}

        {error && <p className="text-sm font-medium text-rose-600 dark:text-rose-300">{error}</p>}

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
              <Button type="submit" disabled={!code.trim()}>확인</Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
