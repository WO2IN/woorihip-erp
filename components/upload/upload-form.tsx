'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import { Upload, X, CheckCircle, CloudUpload, Loader2, ScanText } from 'lucide-react'
import type { CertificateOcrFields } from '@/lib/ocr/certificate-parse'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { SearchableCombobox } from '@/components/ui/searchable-combobox'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { notifyDataChanged, useDataChanged } from '@/lib/data-events'
import { normalizeLot, normalizeRegisteredLot, buildLotEnd, normalizeIssueDate } from '@/lib/lot'
import dynamic from 'next/dynamic'
import { getSession, buildAuthHeaders } from '@/lib/auth-client'
import {
  ACCEPT_ALL_FILES,
  ACCEPT_CERTIFICATE,
  CERTIFICATE_TYPE,
  DEFAULT_OTHER_TYPE,
  fileKind,
  isCertificate,
} from '@/lib/file-types'

const saveConfigValue = async (
  name: string,
  value: string
) => {
  if (!value.trim()) return

  try {
    const res = await fetch('/api/config', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name,
        value,
      }),
    })

    if (!res.ok) {
      const data = await res.json()
      throw new Error(data.error || '설정 저장 실패')
    }

  } catch (error) {
    console.error(`${name} 저장 실패:`, error)
  }
}

const PdfDragPreview = dynamic(
  () =>
    import('@/components/upload/pdf-drag-preview').then(
      mod => mod.PdfDragPreview
    ),
  {
    ssr: false,
    loading: () => (
      <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
        PDF 미리보기 불러오는 중...
      </div>
    ),
  }
)

type OcrFieldKey = 'company' | 'product' | 'lot' | 'issueDate' | 'quantity' | 'material' | 'specification'

function OcrMark({ show }: { show: boolean }) {
  if (!show) return null
  return (
    <span className="ml-1.5 rounded bg-sky-100 px-1.5 py-0.5 text-[10px] font-semibold text-sky-700 dark:bg-sky-950 dark:text-sky-300">
      자동 인식
    </span>
  )
}

function formatQuantity(value: string) {
  const cleaned = value.replace(/[^\d.]/g, '')
  const [whole = '', ...rest] = cleaned.split('.')
  const fraction = rest.join('').slice(0, 2)
  const grouped = whole.replace(/^0+(?=\d)/, '').replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return cleaned.includes('.') ? `${grouped || '0'}.${fraction}` : grouped
}

function plainQuantity(value: string) {
  return value.replace(/,/g, '')
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function normalizeDate(date: string) {
  if (!date) return ''

  if (date.includes('-')) {
    const [year, month, day] = date.split('-')
    if (year && month && day) {
      return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
    }
  }

  if (date.includes('.')) {
    const [y, m, d] = date.split('.')
    const year = y.length === 2 ? `20${y}` : y
    return `${year}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
  }

  return date
}

export function UploadForm() {
  const searchParams = useSearchParams()
  const linkedMovementId = searchParams.get('link') || ''
  const linkedMovement = searchParams.get('movement') === '입고' || searchParams.get('movement') === '출고'
    ? searchParams.get('movement')
    : ''
  const [file, setFile] = useState<File | null>(null)
  const [dragging, setDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [previewUrl, setPreviewUrl] = useState('')
  const [uploading, setUploading] = useState(false)
  const [success, setSuccess] = useState(false)
  // Required fields
  const [documentType, setDocumentType] = useState(CERTIFICATE_TYPE)
  const isCert = isCertificate(documentType)
  const [company, setCompany] = useState('')
  const [shipmentCategory, setShipmentCategory] = useState('판재')
  const [shipmentFloor, setShipmentFloor] = useState('1')
  const sessionUser = getSession()

  useEffect(() => {
    if (linkedMovementId) return
    const floor = sessionUser?.floor || 1
    setShipmentFloor(String(floor))
    setShipmentCategory(floor === 1 ? '판재' : floor === 2 ? '커넥터' : '랙')
    setQuantityUnit(floor === 3 ? 'EA' : 'Kg')
  }, [linkedMovementId, sessionUser?.floor])

  useEffect(() => {
    if (!linkedMovementId && !searchParams.get('company')) return
    const companyName = searchParams.get('company') || ''
    const productName = searchParams.get('product') || ''
    const floor = searchParams.get('floor') || ''
    const lot = searchParams.get('lot') || ''
    const date = searchParams.get('date') || ''
    const qty = searchParams.get('qty') || ''
    const unit = searchParams.get('unit') || ''
    const type = searchParams.get('type') || ''
    if (companyName) setCompany(companyName)
    if (productName) setProduct(productName)
    if (floor) setShipmentFloor(floor)
    if (type && isCertificate(type)) setDocumentType(type)
    if (qty) setQuantity(formatQuantity(qty))
    if (unit === 'Kg' || unit === 'EA' || unit === 'R') setQuantityUnit(unit)
    if (date) setIssueDate(date)
    const match = lot.match(/^(.*)-(\d+)$/)
    if (match) {
      setLotStart(match[1])
      setLotStartNo(match[2])
    } else if (lot) {
      setLotStart(lot)
      setLotStartNo('1')
    }
  }, [linkedMovementId, searchParams])

  // Optional fields
  const [lotStart, setLotStart] = useState('')
  const [lotEnd, setLotEnd] = useState('')
  const [lotStartNo, setLotStartNo] = useState('')
  const [lotEndNo, setLotEndNo] = useState('')
  const [product, setProduct] = useState('')
  const [material, setMaterial] = useState('')
  const [specification, setSpecification] = useState('')
  const [platingMatches, setPlatingMatches] = useState<Array<{ material: string; specification: string }>>([])
  const [quantity, setQuantity] = useState('')
  const [quantityUnit, setQuantityUnit] = useState<'Kg' | 'EA' | 'R'>('Kg')
  const [issueDate, setIssueDate] = useState('')
  const [note, setNote] = useState('')

  const [ocrStatus, setOcrStatus] = useState<'idle' | 'running'>('idle')
  const [ocrFilled, setOcrFilled] = useState<Set<OcrFieldKey>>(new Set())
  const ocrRequest = useRef(0)
  const ocrPlatingRef = useRef<Pick<CertificateOcrFields, 'material' | 'specification'> | null>(null)
  const latestValues = useRef({ company, product, lotStart, lotStartNo, lotEndNo, issueDate, quantity, material, specification })
  latestValues.current = { company, product, lotStart, lotStartNo, lotEndNo, issueDate, quantity, material, specification }

  // Config lists
  const [companies, setCompanies] = useState<string[]>([])
  const [docTypes, setDocTypes] = useState<string[]>([])
  const [materials, setMaterials] = useState<string[]>([])
  const [specifications, setSpecifications] = useState<string[]>([])
  const [products, setProducts] = useState<string[]>([])
  const [shipmentCategories, setShipmentCategories] = useState<string[]>(['판재', '커넥터', '랙'])

  const [recentProducts, setRecentProducts] = useState<string[]>([])
  const [recentMaterials, setRecentMaterials] = useState<string[]>([])
  const [recentSpecifications, setRecentSpecifications] = useState<string[]>([])

  const [recentCompanies, setRecentCompanies] = useState<string[]>([])
  const [recentDocTypes, setRecentDocTypes] = useState<string[]>([])

  const loadConfig = useCallback(async () => {
    const [c, dt, m, s, p, scat] = await Promise.all([
      fetch('/api/config?name=companies', { cache: 'no-store' }).then(r => r.json()),
      fetch('/api/config?name=document-types', { cache: 'no-store' }).then(r => r.json()),
      fetch('/api/config?name=materials', { cache: 'no-store' }).then(r => r.json()),
      fetch('/api/config?name=specifications', { cache: 'no-store' }).then(r => r.json()),
      fetch('/api/config?name=products', { cache: 'no-store' }).then(r => r.json()),
      fetch('/api/config?name=shipment-categories', { cache: 'no-store' }).then(r => r.json()),
    ])

    setCompanies(c.data || [])
    setDocTypes(dt.data || [])
    setMaterials(m.data || [])
    setSpecifications(s.data || [])
    setProducts(p.data || [])
    setShipmentCategories(scat.data?.length ? scat.data : ['판재', '커넥터', '랙'])
  }, [])

  const loadRecentValues = useCallback(async () => {
    try {
      const [
        productsRes,
        materialsRes,
        specificationsRes,
        companiesRes,
        docTypesRes,
      ] = await Promise.all([
        fetch('/api/config?name=products', {
          cache: 'no-store',
        }).then(res => res.json()),

        fetch('/api/config?name=materials', {
          cache: 'no-store',
        }).then(res => res.json()),

        fetch('/api/config?name=specifications', {
          cache: 'no-store',
        }).then(res => res.json()),

        fetch('/api/config?name=companies', {
          cache: 'no-store',
        }).then(res => res.json()),

        fetch('/api/config?name=document-types', {
          cache: 'no-store',
        }).then(res => res.json()),
      ])

      setRecentProducts(
        productsRes.data?.slice(0, 5) || []
      )

      setRecentMaterials(
        materialsRes.data?.slice(0, 5) || []
      )

      setRecentSpecifications(
        specificationsRes.data?.slice(0, 5) || []
      )

      setRecentCompanies(
        companiesRes.data?.slice(0, 5) || []
      )

      setRecentDocTypes(
        docTypesRes.data?.slice(0, 5) || []
      )

    } catch (error) {
      console.error('최근 사용 항목 로드 실패:', error)
    }
  }, [])

  useEffect(() => {
    loadConfig()
    loadRecentValues()
  }, [loadConfig, loadRecentValues])

  const applyOcrPlating = useCallback((cleared = false) => {
    const plating = ocrPlatingRef.current
    if (!plating) return
    ocrPlatingRef.current = null
    const filled: OcrFieldKey[] = []
    if (plating.material && (cleared || !latestValues.current.material)) {
      setMaterial(plating.material)
      filled.push('material')
    }
    if (plating.specification && (cleared || !latestValues.current.specification)) {
      setSpecification(plating.specification)
      filled.push('specification')
    }
    if (filled.length) setOcrFilled(prev => new Set([...prev, ...filled]))
  }, [])

  useEffect(() => {
    setPlatingMatches([])
    setMaterial('')
    setSpecification('')

    if (!company || !product) {
      applyOcrPlating(true)
      return
    }

    const controller = new AbortController()

    fetch(`/api/plating-info?company=${encodeURIComponent(company)}&product=${encodeURIComponent(product)}`, {
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async response => {
        const body = await response.text()
        if (!response.ok) throw new Error(`도금 정보 API 오류 (${response.status})`)
        if (!body.trim()) return { matches: [] }
        try {
          return JSON.parse(body) as { matches?: Array<{ material: string; specification: string }> }
        } catch {
          throw new Error('도금 정보 API가 올바른 JSON을 반환하지 않았습니다.')
        }
      })
      .then(({ matches = [] }) => {
        setPlatingMatches(matches)
        const firstMatch = matches[0]
        if (!firstMatch) {
          applyOcrPlating(true)
          return
        }
        ocrPlatingRef.current = null
        setMaterial(firstMatch.material || '')
        setSpecification(firstMatch.specification || '')
      })
      .catch(error => {
        if (error.name !== 'AbortError') {
          console.error('도금 정보 자동 입력 실패:', error)
        }
      })

    return () => controller.abort()
  }, [company, product, applyOcrPlating])

  useEffect(() => {
    ocrRequest.current += 1
    setOcrStatus('idle')
    setOcrFilled(new Set())
    ocrPlatingRef.current = null
  }, [file])

  const runOcr = () => {
    if (!file) {
      toast.error('먼저 PDF 파일을 선택해 주세요.')
      return
    }
    if (!isCert || fileKind(file.name)?.ext !== 'pdf') {
      toast.error('성적서 PDF만 자동 인식할 수 있습니다.')
      return
    }

    const requestId = ++ocrRequest.current
    setOcrFilled(new Set())
    ocrPlatingRef.current = null
    setOcrStatus('running')

    // 입출고에서 넘어온 연결 등록은 넘겨받은 값을 지키고, 그 외에는 이 PDF 기준으로 다시 채운다.
    if (!linkedMovementId) {
      setCompany('')
      setProduct('')
      setLotStart('')
      setLotStartNo('')
      setLotEndNo('')
      setIssueDate('')
      setQuantity('')
      setMaterial('')
      setSpecification('')
      setPlatingMatches([])
    }

    const target = file
    ;(async () => {
      const formData = new FormData()
      formData.append('file', target)
      const session = getSession()
      const response = await fetch('/api/ocr/certificate', {
        method: 'POST',
        headers: session ? buildAuthHeaders(session) : {},
        body: formData,
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body.error || '자동 인식 실패')
      return (body.fields ?? {}) as CertificateOcrFields
    })()
      .then(fields => {
        if (ocrRequest.current !== requestId) return
        const current = latestValues.current
        const filled: OcrFieldKey[] = []

        if (fields.lotStart && !current.lotStart) {
          setLotStart(fields.lotStart)
          setLotStartNo(fields.lotStartNo ?? '1')
          if (fields.lotEndNo) setLotEndNo(fields.lotEndNo)
          filled.push('lot')
        }
        if (fields.issueDate && !current.issueDate) {
          setIssueDate(fields.issueDate)
          filled.push('issueDate')
        }
        if (fields.quantity && !current.quantity) {
          setQuantity(formatQuantity(fields.quantity))
          if (fields.quantityUnit) setQuantityUnit(fields.quantityUnit)
          filled.push('quantity')
        }

        ocrPlatingRef.current = { material: fields.material, specification: fields.specification }
        const companyChanges = Boolean(fields.company && !current.company)
        const productChanges = Boolean(fields.product && !current.product)
        if (companyChanges) {
          setCompany(fields.company!)
          filled.push('company')
        }
        if (productChanges) {
          setProduct(fields.product!)
          filled.push('product')
        }
        setOcrFilled(new Set(filled))
        if (!companyChanges && !productChanges) applyOcrPlating()

        if (filled.length) toast.success(`${filled.length}개 항목을 채웠습니다. 등록 전에 확인해 주세요.`)
        else toast.info('읽어낸 항목이 없습니다. 직접 입력해 주세요.')
        setOcrStatus('idle')
      })
      .catch(error => {
        if (ocrRequest.current !== requestId) return
        console.error('성적서 자동 인식 실패:', error)
        toast.error('자동 인식에 실패했습니다. 직접 입력해 주세요.')
        setOcrStatus('idle')
      })
  }

  useEffect(() => {
    if (!file) {
      setPreviewUrl('')
      return
    }

    const url = URL.createObjectURL(file)
    setPreviewUrl(url)

    return () => {
      URL.revokeObjectURL(url)
    }
  }, [file])

  useDataChanged((scope) => {
    if (scope === 'all' || scope === 'config') {
      loadConfig()
    }
  }, [loadConfig])

  const handleFileDrop = (files: FileList | null) => {
    if (!files || files.length === 0) return

    const f = files[0]
    const kind = fileKind(f.name)

    if (!kind) {
      toast.error('지원하지 않는 파일 형식입니다.')
      return
    }

    if (isCert && kind.ext !== 'pdf') {
      toast.error('성적서는 PDF 파일만 올릴 수 있습니다.')
      return
    }

    if (f.size > 50 * 1024 * 1024) {
      toast.error('파일 크기는 50MB를 초과할 수 없습니다.')
      return
    }

    setFile(f)
    setSuccess(false)
  }

  const docTypeOptions = [
    CERTIFICATE_TYPE,
    '도면',
    ...docTypes.filter(type => !isCertificate(type) && type !== '도면' && type !== DEFAULT_OTHER_TYPE),
    DEFAULT_OTHER_TYPE,
  ]
  const fileInfo = file ? fileKind(file.name) : null

  const selectDocumentType = (type: string) => {
    if (!isCertificate(type)) return
    if (file && fileKind(file.name)?.ext !== 'pdf') {
      setFile(null)
      toast.info('성적서는 PDF만 올릴 수 있어 선택한 파일을 비웠습니다.')
    }
    setDocumentType(type)
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setDragging(true)
  }

  const handleDragLeave = () => {
    setDragging(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    handleFileDrop(e.dataTransfer.files)
  }

  const handleSubmit = async () => {
    if (!file) {
      toast.error('파일을 선택해주세요.')
      return
    }

    if (!company) {
      toast.error('업체명을 입력해주세요.')
      return
    }

    if (!isCertificate(documentType)) {
      toast.error('도면과 기타 문서는 테스트 중이라 아직 등록할 수 없습니다.')
      return
    }

    if (isCert && fileKind(file.name)?.ext !== 'pdf') {
      toast.error('성적서는 PDF 파일만 올릴 수 있습니다.')
      return
    }

    setUploading(true)

    try {
      const formData = new FormData()

      formData.append('file', file)
      formData.append('company', company)
      formData.append('documentType', documentType)
      if (isCert && shipmentCategory) formData.append('shipmentCategory', shipmentCategory)
      if (isCert && shipmentFloor) formData.append('shipmentFloor', shipmentFloor)

      const normalizedLotStart = isCert ? normalizeRegisteredLot(normalizeLot(lotStart)) : ''

      if (normalizedLotStart) {
        const startNo = String(parseInt(lotStartNo || '1', 10))

        formData.append(
          'lotStart',
          `${normalizedLotStart}-${startNo}`
        )

        // 끝번호를 입력한 경우에만 저장
        if (lotEndNo.trim()) {
          formData.append(
            'lotEnd',
            `${normalizedLotStart}-${parseInt(lotEndNo, 10)}`
          )
        }
      }

      if (product) formData.append('product', product)
      if (isCert) {
        if (material) formData.append('material', material)
        if (specification) formData.append('specification', specification)
        if (plainQuantity(quantity)) formData.append('quantity', plainQuantity(quantity))
        formData.append('quantityUnit', quantityUnit)
      }

  if (issueDate) {
    try {
      formData.append('issueDate', normalizeIssueDate(issueDate))
    } catch {
      // 존재하지 않는 날짜는 등록을 막지 않고 미지정 값으로 저장합니다.
      formData.append('issueDate', '-')
    }
  }


      if (note) formData.append('note', note)
      if (linkedMovementId) formData.append('linkedMovementId', linkedMovementId)
      if (linkedMovement) formData.append('movementType', linkedMovement)

      const session = getSession()
      const res = await fetch('/api/upload', {
        method: 'POST',
        headers: session ? buildAuthHeaders(session) : {},
        body: formData,
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || '업로드에 실패했습니다.')
      }

      toast.success('문서가 성공적으로 등록되었습니다.')

      await saveConfigValue('products', product)
      if (isCert) {
        await saveConfigValue('materials', material)
        await saveConfigValue('specifications', specification)
      }
      await saveConfigValue('companies', company)
      await saveConfigValue('document-types', documentType)

      notifyDataChanged('documents')
      notifyDataChanged('config')

      await loadConfig()
      await loadRecentValues()

      setSuccess(true)

      setFile(null)
      setCompany('')
      setDocumentType(CERTIFICATE_TYPE)
      const defaultFloor = sessionUser?.floor || 1
      setShipmentFloor(String(defaultFloor))
      setShipmentCategory(defaultFloor === 1 ? '판재' : defaultFloor === 2 ? '커넥터' : '랙')
      setLotStart('')
      setLotEnd('')
      setLotStartNo('')
      setLotEndNo('')
      setProduct('')
      setMaterial('')
      setSpecification('')
      setPlatingMatches([])
      setQuantity('')
      setIssueDate('')
      setNote('')
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : '업로드에 실패했습니다.'

      toast.error(msg)
    } finally {
      setUploading(false)
    }
  }

  const handleReset = () => {
    setFile(null)
    setCompany('')
    setDocumentType(CERTIFICATE_TYPE)
    setLotStart('')
    setLotEnd('')
    setProduct('')
    setMaterial('')
    setSpecification('')
    setQuantity('')
    setIssueDate('')
    setNote('')
    setSuccess(false)
  }

  return (
    <div className="h-full min-h-0">
      <div
        className={cn(
          'mx-auto h-full min-h-0 gap-6',
          fileInfo?.preview
            ? 'max-w-[1500px] grid grid-cols-[minmax(500px,768px)_minmax(550px,1fr)]'
            : 'max-w-3xl'
        )}
      >
        {/* ============================= */}
        {/* 왼쪽: 업로드 + 입력 폼 */}
        {/* ============================= */}
        <div className="flex h-full min-h-0 flex-col gap-3">
          {linkedMovementId && (
            <div className="shrink-0 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100">
              {company || '이 건'} · {product || '품목'} {linkedMovement ? `${linkedMovement} ` : ''}성적서를 기존 입출고에 붙입니다. 수량은 다시 더하지 않습니다.
            </div>
          )}

          <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 bg-card border border-border rounded-xl shadow-sm px-5 py-3">
            <Label className="text-sm shrink-0">
              문서유형 <span className="text-destructive">*</span>
            </Label>
            <div className="flex flex-wrap gap-2">
              {docTypeOptions.map(type => {
                const active = type === documentType
                const planned = !isCertificate(type)
                return (
                  <button
                    key={type}
                    type="button"
                    disabled={planned}
                    title={planned ? '테스트 중이라 아직 등록할 수 없습니다.' : undefined}
                    onClick={() => selectDocumentType(type)}
                    className={cn(
                      'h-8 rounded-lg border px-4 text-sm font-semibold transition-colors',
                      planned
                        ? 'cursor-not-allowed border-dashed text-muted-foreground'
                        : active
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-border bg-background text-foreground hover:border-primary/40'
                    )}
                  >
                    {type}
                    {planned && <span className="ml-1.5 text-[10px] font-medium">예정</span>}
                  </button>
                )
              })}
            </div>
            <Button
              type="button"
              size="sm"
              disabled={ocrStatus === 'running'}
              onClick={runOcr}
              className="ml-auto h-8 gap-1.5"
            >
              {ocrStatus === 'running'
                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                : <ScanText className="h-3.5 w-3.5" />}
              {ocrStatus === 'running' ? '읽는 중' : '자동 인식'}
            </Button>
          </div>

          {/* Drop zone */}
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={cn(
              'shrink-0 border-2 border-dashed rounded-xl text-center cursor-pointer transition-all',
              file ? 'px-4 py-2.5' : 'p-6',
              dragging
                ? 'border-primary bg-accent'
                : file
                  ? 'border-green-400 bg-green-50 dark:bg-green-950/20'
                  : 'border-border hover:border-primary/60 hover:bg-accent/40'
            )}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept={isCert ? ACCEPT_CERTIFICATE : ACCEPT_ALL_FILES}
              className="hidden"
              onChange={e => handleFileDrop(e.target.files)}
            />

            {file ? (
              <div className="flex items-center gap-3 text-left">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-foreground text-sm">
                    {file.name}
                  </p>

                  <p className="text-xs text-muted-foreground">
                    {fileInfo ? `${fileInfo.label} · ` : ''}{formatBytes(file.size)} · 클릭하거나 새 파일을 끌어 놓으면 바뀝니다
                  </p>
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={e => {
                    e.stopPropagation()
                    setFile(null)
                  }}
                  className="gap-1.5 h-7 shrink-0 bg-background text-xs"
                >
                  <X className="w-3 h-3" />
                  파일 빼기
                </Button>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <div
                  className={cn(
                    'w-11 h-11 rounded-xl flex items-center justify-center transition-colors',
                    dragging
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted'
                  )}
                >
                  <CloudUpload
                    className={cn(
                      'w-6 h-6',
                      dragging
                        ? 'text-primary-foreground'
                        : 'text-muted-foreground'
                    )}
                  />
                </div>

                <div>
                  <p className="font-semibold text-foreground text-sm">
                    {isCert ? 'PDF 파일' : '파일'}을 드래그하거나 클릭하여 선택
                  </p>

                  <p className="text-xs text-muted-foreground mt-0.5">
                    {isCert ? 'PDF 형식만 지원' : 'PDF · 엑셀 · 워드 · 한글 · PPT · 이미지 · ZIP'} · 최대 50MB
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Form card */}
          <div className="flex min-h-0 flex-1 flex-col bg-card border border-border rounded-xl shadow-sm overflow-hidden">

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 [scrollbar-width:thin]">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">
                <div className="space-y-1.5">
                  <Label className="text-sm">
                    업체명 <span className="text-destructive">*</span>
                    <OcrMark show={ocrFilled.has('company')} />
                  </Label>

                  <SearchableCombobox
                    configName="companies"
                    options={companies}
                    recentOptions={recentCompanies}
                    value={company}
                    onChange={setCompany}
                    onOptionsChange={next => {
                      setCompanies(next)
                      setRecentCompanies(next.slice(0, 5))
                    }}
                    placeholder="업체 검색 또는 입력..."
                  />
                </div>

                {/* 품목 */}
                <div className="space-y-1.5">
                  <Label className="text-sm">품목<OcrMark show={ocrFilled.has('product')} /></Label>

                  <SearchableCombobox
                    configName="products"
                    options={products}
                    recentOptions={recentProducts}
                    value={product}
                    onChange={setProduct}
                    onOptionsChange={next => {
                      setProducts(next)
                      setRecentProducts(next.slice(0, 5))
                    }}
                    placeholder="품목 선택 또는 입력..."
                  />
                </div>

                {/* LOT 번호 */}
                {isCert && <div className="space-y-1.5">
                  <Label className="text-sm">LOT 번호<OcrMark show={ocrFilled.has('lot')} /></Label>

                  <div className="flex items-stretch">
                    <Input
                      value={lotStart}
                      onChange={e => {
                        const value = e.target.value
                          .replace(/-\d+$/, '')
                          .trim()

                        setLotStart(value)
                        if (/^\d{6}$/.test(value)) {
                          setIssueDate(`20${value}`)
                        } else if (/^\d{8}$/.test(value)) {
                          setIssueDate(value)
                        }
                      }}
                      placeholder="예: 20260918"
                      className="rounded-r-none flex-1 min-w-0"
                    />

                    <Input
                      value={lotStartNo}
                      onChange={e => {
                        setLotStartNo(e.target.value.replace(/\D/g, ''))
                      }}
                      placeholder="1"
                      className="rounded-none border-l-0 w-[3.25rem] shrink-0 text-center px-1.5 font-mono"
                    />

                    <Input
                      value={lotEndNo}
                      onChange={e => {
                        setLotEndNo(e.target.value.replace(/\D/g, ''))
                      }}
                      placeholder="8"
                      className="rounded-l-none border-l-0 w-[3.25rem] shrink-0 text-center px-1.5 font-mono"
                    />
                  </div>
                </div>}

                {/* 발행일 */}
                <div className="space-y-1.5">
                  <Label className="text-sm">발행일<OcrMark show={ocrFilled.has('issueDate')} /></Label>

                  <Input
                    value={issueDate}
                    onChange={e => setIssueDate(e.target.value)}
                    placeholder="예: 20260721"
                    className="h-10"
                  />
                </div>

                {isCert && (<>
                {/* 재질 */}
                <div className="space-y-1.5">
                  <Label className="text-sm">재질<OcrMark show={ocrFilled.has('material')} /></Label>

                  <SearchableCombobox
                    configName="materials"
                    options={materials}
                    recentOptions={recentMaterials}
                    value={material}
                    onChange={setMaterial}
                    onOptionsChange={next => {
                      setMaterials(next)
                      setRecentMaterials(next.slice(0, 5))
                    }}
                    placeholder="재질 선택 또는 입력..."
                  />
                </div>

                {/* 도금사양 */}
                <div className="space-y-1.5">
                  <Label className="text-sm">도금사양<OcrMark show={ocrFilled.has('specification')} /></Label>

                  <SearchableCombobox
                    configName="specifications"
                    options={specifications}
                    recentOptions={recentSpecifications}
                    value={specification}
                    onChange={setSpecification}
                    onOptionsChange={next => {
                      setSpecifications(next)
                      setRecentSpecifications(next.slice(0, 5))
                    }}
                    placeholder="사양 선택 또는 입력..."
                  />
                </div>

                {platingMatches.length > 1 && (
                  <p className="col-span-1 text-xs text-amber-600 dark:text-amber-400 sm:col-span-2">
                    같은 업체와 품목의 정보가 {platingMatches.length}개 있습니다. 재질과 도금사양을 확인해 주세요.
                  </p>
                )}

                {/* 도금 종류 / 층 */}
                <div className="grid grid-cols-1 gap-4 sm:col-span-2 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label className="text-sm">도금 종류</Label>
                    <SearchableCombobox
                      configName="shipment-category"
options={shipmentCategories}
  recentOptions={shipmentCategories.slice(0, 5)}
                      value={shipmentCategory}
                      onChange={setShipmentCategory}
                      onOptionsChange={setShipmentCategories}
                      placeholder="구분 선택"
                      clearable={!sessionUser?.floor}
                      className="h-10"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-sm">층</Label>
                    <SearchableCombobox
                      configName="shipment-floor"
                      options={['1층', '2층', '3층']}
                      recentOptions={['1층', '2층', '3층']}
                      value={shipmentFloor ? `${shipmentFloor}층` : ''}
                      onChange={value => setShipmentFloor(value.replace('층', ''))}
                      placeholder="층 선택"
                      clearable={!sessionUser?.floor}
                      className="h-10"
                    />
                  </div>
                </div>

                {/* 수량 */}
                <div className="space-y-1.5">
                  <Label className="text-sm">수량<OcrMark show={ocrFilled.has('quantity')} /></Label>
                  <div className="flex gap-2">
                    <Input
                      inputMode="decimal"
                      value={quantity}
                      onChange={e => setQuantity(formatQuantity(e.target.value))}
                      placeholder="예: 10,000"
                      className="h-10 min-w-0 flex-1"
                    />
                    <select
                      value={quantityUnit}
                      onChange={e => setQuantityUnit(e.target.value as 'Kg' | 'EA' | 'R')}
                      aria-label="수량 단위"
                      className="h-10 w-20 rounded-md border border-input bg-background px-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <option value="Kg">Kg</option>
                      <option value="EA">EA</option>
                      <option value="R">R</option>
                    </select>
                  </div>
                </div>
                </>)}

                {/* 비고 */}
                <div className={cn('space-y-1.5', !isCert && 'sm:col-span-2')}>
                  <Label className="text-sm">비고</Label>

                  <Input
                    value={note}
                    onChange={e => setNote(e.target.value)}
                    placeholder="추가 메모"
                    className="h-10"
                  />
                </div>
              </div>
            </div>

            {/* 액션 */}
            <div className="flex shrink-0 gap-3 border-t border-border bg-muted/10 px-5 py-3">
              <Button
                onClick={handleSubmit}
                disabled={uploading}
                size="default"
                className="gap-2 min-w-[110px]"
              >
                {uploading ? (
                  <>
                    <Upload className="w-4 h-4 animate-bounce" />
                    등록 중...
                  </>
                ) : success ? (
                  <>
                    <CheckCircle className="w-4 h-4" />
                    등록 완료
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4" />
                    등록하기
                  </>
                )}
              </Button>

              <Button
                variant="outline"
                onClick={handleReset}
              >
                초기화
              </Button>
            </div>
          </div>
        </div>

        {/* ============================= */}
        {/* 오른쪽: PDF 미리보기 */}
        {/* ============================= */}
        {file && fileInfo?.preview && (
          <div className="h-full min-h-0">
            <div className="w-full h-full min-h-0 border border-border rounded-xl overflow-hidden bg-background shadow-md">
              {fileInfo.preview === 'pdf'
                ? <PdfDragPreview file={file} />
                : <ImagePreview file={file} />}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function ImagePreview({ file }: { file: File }) {
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    const next = URL.createObjectURL(file)
    setUrl(next)
    return () => URL.revokeObjectURL(next)
  }, [file])

  if (!url) return null

  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt={file.name} className="h-full w-full object-contain" />
}
