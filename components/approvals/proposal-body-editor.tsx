'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Image as ImageIcon, List, ListIndentDecrease, ListIndentIncrease, ListOrdered, Minus, Table, TextAlignCenter, TextAlignEnd, TextAlignJustify, TextAlignStart } from 'lucide-react'
import { toast } from 'sonner'
import { RICH_IMAGE_COUNT_MAX, RICH_IMAGE_DATA_MAX, RICH_TEXT_HTML_MAX, richTextPlain, sanitizeRichText } from '@/lib/rich-text'
import { cn } from '@/lib/utils'

const FONTS = [
  { label: '나눔고딕', value: 'Nanum Gothic' },
  { label: '맑은 고딕', value: 'Malgun Gothic' },
  { label: '굴림', value: 'Gulim' },
  { label: '돋움', value: 'Dotum' },
  { label: '바탕', value: 'Batang' },
  { label: 'Arial', value: 'Arial' },
] as const

const SIZES = [8, 9, 10, 11, 12, 14, 16, 18, 24, 36]

export function ProposalBodyEditor({ value, onChange, label = '품의 내용' }: { value: string; onChange: (value: string) => void; label?: string }) {
  const editorRef = useRef<HTMLDivElement>(null)
  const savedRange = useRef<Range | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const [font, setFont] = useState<string>(FONTS[0].value)
  const [size, setSize] = useState(10)
  const [insertOpen, setInsertOpen] = useState(false)
  const [dropping, setDropping] = useState(false)
  const frameRef = useRef<HTMLDivElement>(null)
  const selectedImg = useRef<HTMLImageElement | null>(null)
  const [imageBox, setImageBox] = useState<{ left: number; top: number; width: number; height: number } | null>(null)

  useEffect(() => {
    const editor = editorRef.current
    if (!editor || document.activeElement === editor || editor.innerHTML === value) return
    editor.innerHTML = value
  }, [value])

  function placeImageBox(img: HTMLImageElement) {
    const frame = frameRef.current
    if (!frame || !img.isConnected) {
      selectedImg.current = null
      setImageBox(null)
      return
    }
    const box = frame.getBoundingClientRect()
    const rect = img.getBoundingClientRect()
    setImageBox({
      left: rect.left - box.left,
      top: rect.top - box.top,
      width: rect.width,
      height: rect.height,
    })
  }

  function selectImage(img: HTMLImageElement) {
    selectedImg.current = img
    placeImageBox(img)
  }

  function resizeImage(nextWidth: number) {
    const img = selectedImg.current
    const frame = editorRef.current
    if (!img || !frame) return
    const max = Math.max(120, frame.clientWidth - 32)
    const width = Math.round(Math.min(max, Math.max(96, nextWidth)))
    img.style.width = `${width}px`
    img.style.height = 'auto'
    img.removeAttribute('height')
    img.removeAttribute('width')
    placeImageBox(img)
  }

  function emit() {
    const editor = editorRef.current
    if (!editor) return
    onChange(richTextPlain(editor.innerHTML) ? editor.innerHTML : '')
  }

  function remember() {
    const selection = window.getSelection()
    const editor = editorRef.current
    if (!selection || selection.rangeCount === 0 || !editor) return
    if (editor.contains(selection.anchorNode)) savedRange.current = selection.getRangeAt(0).cloneRange()
  }

  function focusEditor() {
    const editor = editorRef.current
    const selection = window.getSelection()
    editor?.focus()
    if (!selection || !savedRange.current) return
    selection.removeAllRanges()
    selection.addRange(savedRange.current)
  }

  function command(name: string, commandValue?: string) {
    focusEditor()
    document.execCommand('styleWithCSS', false, 'true')
    document.execCommand(name, false, commandValue)
    emit()
  }

  function applyFont(next: string) {
    setFont(next)
    focusEditor()
    document.execCommand('styleWithCSS', false, 'false')
    document.execCommand('fontName', false, next)
    editorRef.current?.querySelectorAll('font[face]').forEach((node) => {
      if (!(node instanceof HTMLElement) || node.getAttribute('face') !== next) return
      node.removeAttribute('face')
      node.style.fontFamily = next
    })
    document.execCommand('styleWithCSS', false, 'true')
    emit()
  }

  function applySize(next: number) {
    setSize(next)
    focusEditor()
    document.execCommand('styleWithCSS', false, 'false')
    document.execCommand('fontSize', false, '7')
    editorRef.current?.querySelectorAll('font[size="7"]').forEach((node) => {
      if (!(node instanceof HTMLElement)) return
      node.removeAttribute('size')
      node.style.fontSize = `${next}pt`
    })
    document.execCommand('styleWithCSS', false, 'true')
    emit()
  }

  function addLink() {
    const raw = window.prompt('링크 주소', 'https://')
    if (!raw || raw === 'https://') return
    const href = /^https?:\/\//i.test(raw) ? raw.trim() : `https://${raw.trim()}`
    if (!/^https?:\/\/\S+$/i.test(href)) {
      toast.error('http 또는 https 주소만 넣을 수 있습니다.')
      return
    }
    command('createLink', href)
  }

  async function shrinkImage(file: File) {
    let bitmap: ImageBitmap
    try {
      bitmap = await createImageBitmap(file)
    } catch {
      return null
    }
    let maxSide = 1400
    let quality = 0.82
    try {
      for (let attempt = 0; attempt < 6; attempt += 1) {
        const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height))
        const canvas = document.createElement('canvas')
        canvas.width = Math.max(1, Math.round(bitmap.width * scale))
        canvas.height = Math.max(1, Math.round(bitmap.height * scale))
        const context = canvas.getContext('2d')
        if (!context) return null
        context.fillStyle = '#fff'
        context.fillRect(0, 0, canvas.width, canvas.height)
        context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
        const data = canvas.toDataURL('image/jpeg', quality)
        if (data.length <= RICH_IMAGE_DATA_MAX) return data
        maxSide = Math.round(maxSide * 0.72)
        quality = Math.max(0.45, quality - 0.08)
      }
      return null
    } finally {
      bitmap.close()
    }
  }

  async function addImages(files: File[]) {
    const images = files.filter((file) => file.type.startsWith('image/'))
    if (images.length === 0) {
      toast.error('그림 파일만 넣을 수 있습니다.')
      return
    }
    const existing = editorRef.current?.querySelectorAll('img').length ?? 0
    if (existing >= RICH_IMAGE_COUNT_MAX) {
      toast.error(`그림은 ${RICH_IMAGE_COUNT_MAX}장까지 넣을 수 있습니다.`)
      return
    }
    const room = RICH_IMAGE_COUNT_MAX - existing
    const batch = images.slice(0, room)
    if (images.length > room) toast.error(`그림은 ${RICH_IMAGE_COUNT_MAX}장까지 넣을 수 있습니다.`)
    focusEditor()
    for (const file of batch) {
      const data = await shrinkImage(file)
      if (!data) {
        toast.error('그림을 줄여도 너무 커서 넣지 못했습니다.')
        continue
      }
      if ((editorRef.current?.innerHTML.length ?? 0) + data.length > RICH_TEXT_HTML_MAX) {
        toast.error('그림이 많아서 더 넣을 수 없습니다.')
        break
      }
      document.execCommand('insertHTML', false, `<img src="${data}" alt="" style="width:100%"><br>`)
      const images = editorRef.current?.querySelectorAll('img')
      const inserted = images?.[images.length - 1]
      if (inserted instanceof HTMLImageElement) selectImage(inserted)
    }
    emit()
  }

  function insertHtml(html: string) {
    focusEditor()
    document.execCommand('insertHTML', false, html)
    emit()
    setInsertOpen(false)
  }

  return (
    <div className="bg-white">
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Nanum+Gothic:wght@400;700&display=swap" />
      <div className="flex flex-nowrap items-center gap-0.5 border-b border-slate-300 bg-slate-50 px-1 py-1 [&>*]:shrink-0" onMouseDownCapture={remember}>
        <select value={font} onMouseDown={remember} onChange={(event) => applyFont(event.target.value)} className="h-6 w-20 rounded border border-slate-300 bg-white px-1 text-[11px]" aria-label="글꼴">
          {FONTS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
        </select>
        <select value={size} onMouseDown={remember} onChange={(event) => applySize(Number(event.target.value))} className="h-6 rounded border border-slate-300 bg-white px-1 text-[11px]" aria-label="글자 크기">
          {SIZES.map((item) => <option key={item} value={item}>{item}pt</option>)}
        </select>
        <Mark label="굵게" className="font-bold" onClick={() => command('bold')}>가</Mark>
        <Mark label="기울임" className="italic" onClick={() => command('italic')}>가</Mark>
        <Mark label="밑줄" className="underline" onClick={() => command('underline')}>가</Mark>
        <Mark label="취소선" className="line-through" onClick={() => command('strikeThrough')}>가</Mark>
        <ColorMark label="글자색" swatch="text" onPick={(color) => command('foreColor', color)} />
        <ColorMark label="강조색" swatch="bg" onPick={(color) => {
          focusEditor()
          document.execCommand('styleWithCSS', false, 'true')
          if (!document.execCommand('hiliteColor', false, color)) document.execCommand('backColor', false, color)
          emit()
        }} />
        <span className="mx-0.5 h-4 w-px bg-slate-300" />
        <IconButton label="왼쪽 정렬" onClick={() => command('justifyLeft')}><TextAlignStart className="size-3.5" /></IconButton>
        <IconButton label="가운데 정렬" onClick={() => command('justifyCenter')}><TextAlignCenter className="size-3.5" /></IconButton>
        <IconButton label="오른쪽 정렬" onClick={() => command('justifyRight')}><TextAlignEnd className="size-3.5" /></IconButton>
        <IconButton label="양쪽 정렬" onClick={() => command('justifyFull')}><TextAlignJustify className="size-3.5" /></IconButton>
        <IconButton label="글머리 기호" onClick={() => command('insertUnorderedList')}><List className="size-3.5" /></IconButton>
        <IconButton label="번호 매기기" onClick={() => command('insertOrderedList')}><ListOrdered className="size-3.5" /></IconButton>
        <IconButton label="내어쓰기" onClick={() => command('outdent')}><ListIndentDecrease className="size-3.5" /></IconButton>
        <IconButton label="들여쓰기" onClick={() => command('indent')}><ListIndentIncrease className="size-3.5" /></IconButton>
        <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={addLink} className="h-6 rounded px-1 text-[11px] font-semibold text-slate-600 hover:bg-white" aria-label="링크">URL</button>
        <IconButton label="그림" onClick={() => fileRef.current?.click()}><ImageIcon className="size-3.5" /></IconButton>
        <input ref={fileRef} type="file" accept="image/*" multiple className="sr-only" onChange={(event) => { const files = [...(event.target.files ?? [])]; if (files.length) void addImages(files); event.target.value = '' }} />
        <div className="relative">
          <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => setInsertOpen((open) => !open)} className="h-6 rounded px-1 text-[11px] text-slate-600 hover:bg-white" aria-expanded={insertOpen}>삽입</button>
          {insertOpen && (
            <div className="absolute left-0 z-10 mt-1 w-28 rounded border border-slate-200 bg-white py-1 shadow-md">
              <button type="button" className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-xs hover:bg-slate-50" onMouseDown={(event) => event.preventDefault()} onClick={() => insertHtml('<hr>')}><Minus className="size-3.5" />구분선</button>
              <button type="button" className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-xs hover:bg-slate-50" onMouseDown={(event) => event.preventDefault()} onClick={() => insertHtml('<table style="border-collapse:collapse;width:100%"><tbody><tr><td style="border:1px solid #334155;padding:4px">&nbsp;</td><td style="border:1px solid #334155;padding:4px">&nbsp;</td></tr><tr><td style="border:1px solid #334155;padding:4px">&nbsp;</td><td style="border:1px solid #334155;padding:4px">&nbsp;</td></tr></tbody></table><p><br></p>')}><Table className="size-3.5 text-sky-600" />표</button>
            </div>
          )}
        </div>
      </div>
      <style>{`
        .proposal-rich { font-family: "Nanum Gothic", "Malgun Gothic", sans-serif; font-size: 10pt; }
        .proposal-rich:focus { outline: none; }
        .proposal-rich p, .proposal-rich div { margin: 0; }
        .proposal-rich ul { list-style: disc; padding-left: 1.25rem; }
        .proposal-rich ol { list-style: decimal; padding-left: 1.25rem; }
        .proposal-rich a { color: #0369a1; text-decoration: underline; }
        .proposal-rich img { display: block; max-width: 100%; height: auto !important; max-height: none; object-fit: contain; margin: 8px 0; }
        .proposal-rich table { border-collapse: collapse; width: 100%; }
        .proposal-rich td, .proposal-rich th { border: 1px solid #1e293b; padding: 4px; min-width: 3rem; }
      `}</style>
      <div ref={frameRef} className="relative">
      <div
        ref={editorRef}
        className={cn('proposal-rich min-h-56 w-full px-4 py-3 leading-6', dropping && 'bg-sky-50 outline outline-2 outline-sky-400')}
        contentEditable
        role="textbox"
        aria-multiline
        aria-label={label}
        data-empty={richTextPlain(value) ? 'false' : 'true'}
        suppressContentEditableWarning
        onMouseUp={remember}
        onKeyUp={remember}
        onClick={(event) => {
          if (event.target instanceof HTMLImageElement) selectImage(event.target)
          else {
            selectedImg.current = null
            setImageBox(null)
          }
        }}
        onInput={() => {
          emit()
          if (selectedImg.current) placeImageBox(selectedImg.current)
        }}
        onDragOver={(event) => {
          if (![...event.dataTransfer.types].includes('Files')) return
          event.preventDefault()
          setDropping(true)
        }}
        onDragLeave={() => setDropping(false)}
        onDrop={(event) => {
          event.preventDefault()
          setDropping(false)
          const files = [...event.dataTransfer.files]
          if (files.some((file) => file.type.startsWith('image/'))) void addImages(files)
        }}
        onPaste={(event) => {
          const images = imageFilesFrom(event.clipboardData)
          if (images.length > 0) {
            event.preventDefault()
            void addImages(images)
            return
          }
          event.preventDefault()
          const html = event.clipboardData.getData('text/html')
          const text = event.clipboardData.getData('text/plain')
          const safe = html
            ? sanitizeRichText(html)
            : text.replace(/[&<>]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[char] ?? char)).replace(/\n/g, '<br>')
          focusEditor()
          document.execCommand('insertHTML', false, safe)
          emit()
        }}
      />
      {imageBox && (
        <div className="pointer-events-none absolute z-10 border-2 border-sky-500" style={{ left: imageBox.left, top: imageBox.top, width: imageBox.width, height: imageBox.height }}>
          <div className="pointer-events-auto absolute left-1/2 flex -translate-x-1/2 gap-1" style={{ top: imageBox.top > 36 ? -30 : 6 }}>
            <button type="button" className="rounded bg-slate-900 px-2 py-0.5 text-[11px] text-white" onMouseDown={(event) => event.preventDefault()} onClick={() => { resizeImage(imageBox.width * 0.8); emit() }}>작게</button>
            <button type="button" className="rounded bg-slate-900 px-2 py-0.5 text-[11px] text-white" onMouseDown={(event) => event.preventDefault()} onClick={() => { resizeImage(imageBox.width / 0.8); emit() }}>크게</button>
          </div>
          <button
            type="button"
            aria-label="그림 크기 조절"
            title="끌어서 크기 조절"
            className="pointer-events-auto absolute -right-1.5 -bottom-1.5 size-3.5 cursor-nwse-resize rounded-sm border border-sky-700 bg-white"
            onMouseDown={(event) => {
              event.preventDefault()
              event.stopPropagation()
              const img = selectedImg.current
              if (!img) return
              const startX = event.clientX
              const startWidth = img.getBoundingClientRect().width
              const move = (ev: MouseEvent) => resizeImage(startWidth + ev.clientX - startX)
              const up = () => {
                window.removeEventListener('mousemove', move)
                window.removeEventListener('mouseup', up)
                emit()
              }
              window.addEventListener('mousemove', move)
              window.addEventListener('mouseup', up)
            }}
          />
        </div>
      )}
      </div>
    </div>
  )
}

export function ProposalBodyView({ value, print = false }: { value: string; print?: boolean }) {
  const safe = sanitizeRichText(value)
  const formatted = /<[a-z][\s\S]*>/i.test(safe)
  if (!formatted) return <div className={cn('px-4 py-4 text-sm leading-7 whitespace-pre-wrap', print ? 'h-full' : 'min-h-56')}>{value}</div>
  return (
    <>
      <style>{`
        .proposal-rich { font-family: "Nanum Gothic", "Malgun Gothic", sans-serif; font-size: 10pt; }
        .proposal-rich p, .proposal-rich div { margin: 0; }
        .proposal-rich ul { list-style: disc; padding-left: 1.25rem; }
        .proposal-rich ol { list-style: decimal; padding-left: 1.25rem; }
        .proposal-rich a { color: #0369a1; text-decoration: underline; }
        .proposal-rich img { display: block; max-width: 100%; height: auto !important; max-height: none; object-fit: contain; margin: 8px 0; }
        .proposal-rich table { border-collapse: collapse; width: 100%; }
        .proposal-rich td, .proposal-rich th { border: 1px solid #1e293b; padding: 4px; }
      `}</style>
      <div className={cn('proposal-rich px-4 py-4 leading-6', print ? 'h-full' : 'min-h-56')} dangerouslySetInnerHTML={{ __html: safe }} />
    </>
  )
}

function imageFilesFrom(data: DataTransfer) {
  const fromFiles = [...data.files].filter((file) => file.type.startsWith('image/'))
  if (fromFiles.length > 0) return fromFiles
  return [...data.items].flatMap((item) => {
    if (item.kind !== 'file' || !item.type.startsWith('image/')) return []
    const file = item.getAsFile()
    return file ? [file] : []
  })
}

function Mark({ children, label, className, onClick }: { children: string; label: string; className?: string; onClick: () => void }) {
  return (
    <button type="button" aria-label={label} title={label} onMouseDown={(event) => event.preventDefault()} onClick={onClick} className={cn('flex size-6 items-center justify-center rounded text-sm hover:bg-white', className)}>
      {children}
    </button>
  )
}

function IconButton({ children, label, onClick }: { children: ReactNode; label: string; onClick: () => void }) {
  return (
    <button type="button" aria-label={label} title={label} onMouseDown={(event) => event.preventDefault()} onClick={onClick} className="flex size-6 items-center justify-center rounded text-slate-600 hover:bg-white">
      {children}
    </button>
  )
}

function ColorMark({ label, swatch, onPick }: { label: string; swatch: 'text' | 'bg'; onPick: (color: string) => void }) {
  return (
    <label title={label} aria-label={label} className="relative flex size-6 cursor-pointer items-center justify-center rounded hover:bg-white">
      <span className={cn('text-sm font-medium', swatch === 'text' ? 'text-rose-600' : 'bg-amber-200 px-0.5')}>가</span>
      <input type="color" defaultValue={swatch === 'text' ? '#e11d48' : '#fde68a'} onChange={(event) => onPick(event.target.value)} className="absolute inset-0 cursor-pointer opacity-0" />
    </label>
  )
}
