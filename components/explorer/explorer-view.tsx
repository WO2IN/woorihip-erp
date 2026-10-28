'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import {
  Folder,
  FolderOpen,
  ChevronRight,
  LayoutGrid,
  List,
  SortAsc,
  SortDesc,
  FileText,
  CheckSquare,
  Square,
  Download,
  Trash2,
  Search,
  X,
  SlidersHorizontal,
  RefreshCw,
  PanelLeftClose,
  PanelLeftOpen,
  Files,
  Upload,
} from 'lucide-react'
import Link from 'next/link'
import { Button, buttonVariants } from '@/components/ui/button'
import { BAND_BUTTON_PRIMARY, PageHeader } from '@/components/shared/page-header'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { MultiSelect } from '@/components/ui/multi-select'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { DocumentMetadata } from '@/lib/types'
import { FileCard, LIST_GRID } from './file-card'
import { documentDownloadName } from '@/lib/file-types'
import { FilePreviewDrawer } from './file-preview-drawer'
import { cn } from '@/lib/utils'
import { FILTER_CONSONANTS, chosungSearch, matchesChosung } from '@/lib/korean'
import { useDataChanged } from '@/lib/data-events'
import { getSession, buildAuthHeaders } from '@/lib/auth-client'
import { useAuth } from '@/components/auth/auth-context'
import { toast } from 'sonner'

type Level = 'docType' | 'year' | 'files'
type SortField =
  | 'filename'
  | 'documentType'
  | 'product'
  | 'lot'
  | 'issueDate'
  | 'quantity'
  | 'company'
type SortDir = 'asc' | 'desc'

function FilterField({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <Label className="text-xs text-muted-foreground">
        {label}
      </Label>
      {children}
    </div>
  )
}

const LIST_COLUMNS: { field: SortField; label: string; align: string }[] = [
  { field: 'company', label: '업체', align: 'justify-start' },
  { field: 'documentType', label: '유형', align: 'justify-center' },
  { field: 'product', label: '품목', align: 'justify-center' },
  { field: 'lot', label: 'LOT', align: 'justify-start' },
  { field: 'issueDate', label: '발행일', align: 'justify-center' },
  { field: 'quantity', label: '수량', align: 'justify-end' },
]

function ListHeader({
  handleListSort,
  sortField,
  sortDir,
  allSelected,
  onToggleAll,
}: {
  handleListSort: (field: SortField) => void
  sortField: SortField
  sortDir: SortDir
  allSelected: boolean
  onToggleAll: () => void
}) {
  return (
    <div className="sticky -top-4 z-10 flex items-center gap-3 border-b border-border bg-muted px-4 py-2 shadow-[0_1px_0_0_var(--border)]">
      <button
        type="button"
        aria-label="전체 선택"
        className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md hover:bg-muted"
        onClick={onToggleAll}
      >
        {allSelected
          ? <CheckSquare className="h-5 w-5 text-primary" />
          : <Square className="h-5 w-5 text-muted-foreground" />}
      </button>
      <div className="w-9 shrink-0" />
      <div className={cn('min-w-0 flex-1', LIST_GRID)}>
        {LIST_COLUMNS.map(column => (
          <button
            key={column.field}
            type="button"
            onClick={() => handleListSort(column.field)}
            className={cn(
              'hidden md:flex items-center gap-1 whitespace-nowrap rounded-md px-1.5 py-1 text-xs font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground',
              column.align,
              sortField === column.field && 'text-foreground',
            )}
          >
            {column.label}
            {sortField === column.field && (
              sortDir === 'asc'
                ? <SortAsc className="h-3.5 w-3.5" />
                : <SortDesc className="h-3.5 w-3.5" />
            )}
          </button>
        ))}
      </div>
      <div className="w-8 shrink-0" />
    </div>
  )
}

function getInitialConsonant(name: string) {
  const firstChar = name.charCodeAt(0)

  if (firstChar < 0xac00 || firstChar > 0xd7a3) {
    return '#'
  }

  const index = Math.floor((firstChar - 0xac00) / 588)

  const initials = [
    'ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ',
    'ㅂ', 'ㅃ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅉ',
    'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'
  ]

  const initial = initials[index]

  const normalize: Record<string, string> = {
    'ㄲ': 'ㄱ',
    'ㄸ': 'ㄷ',
    'ㅃ': 'ㅂ',
    'ㅆ': 'ㅅ',
    'ㅉ': 'ㅈ',
  }

  return normalize[initial] || initial
}

interface ExplorerViewProps {
  initialCompany?: string
  initialDocType?: string
}

export function ExplorerView({ initialCompany, initialDocType }: ExplorerViewProps = {}) {
  const { user } = useAuth()
  const canDelete = user?.role === 'editor' || user?.role === 'admin'
  const [allDocs, setAllDocs] = useState<DocumentMetadata[]>([])
  const [companies, setCompanies] = useState<string[]>([])
  const [docTypes, setDocTypes] = useState<string[]>([])
  
  const [products, setProducts] = useState<string[]>([])
  const [materials, setMaterials] = useState<string[]>([])
  const [specifications, setSpecifications] = useState<string[]>([])
  
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const [sidebarOpen, setSidebarOpen] = useState(true)

  // Sidebar state
  const [consonant, setConsonant] = useState<string | null>(null)
  const [selectedInitial, setSelectedInitial] = useState<string | null>(null)


  // Navigation — 세 상태를 하나의 객체로 관리하여 항상 원자적으로 업데이트
  const [nav, setNav] = useState<{
    company: string | null
    docType: string | null
    year: string | null
  }>({
    company: initialCompany ?? null,
    docType: initialDocType ?? null,
    year: null,
  })

  const selectedCompany = nav.company
  const selectedDocType = nav.docType
  const selectedYear = nav.year

  // View
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('list')
  const [sortField, setSortField] = useState<SortField>('issueDate')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  const handleListSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(prev => prev === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDir('asc')
    }
  }
  const [previewDoc, setPreviewDoc] = useState<DocumentMetadata | null>(null)

  // Search
  const [query, setQuery] = useState('')
  const [filtersOpen, setFiltersOpen] = useState(false)

  const [selectedCompanies, setSelectedCompanies] = useState<string[]>([])
  const [selectedDocTypes, setSelectedDocTypes] = useState<string[]>([])
  const [selectedProducts, setSelectedProducts] = useState<string[]>([])
  const [selectedMaterials, setSelectedMaterials] = useState<string[]>([])
  const [selectedSpecifications, setSelectedSpecifications] = useState<string[]>([])

  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [lotNumber, setLotNumber] = useState('')
  
  const [selectedDocs, setSelectedDocs] = useState<string[]>([])
  const [downloading, setDownloading] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)

  const loadData = useCallback(async () => {
    setLoading(true)
    const [
      docsRes,
      compRes,
      dtRes,
      productRes,
      materialRes,
      specificationRes
    ] = await Promise.all([
    
      fetch('/api/documents', {
        cache:'no-store'
      }).then(r=>r.json()),
    
      fetch('/api/config?name=companies', {
        cache:'no-store'
      }).then(r=>r.json()),
    
      fetch('/api/config?name=document-types', {
        cache:'no-store'
      }).then(r=>r.json()),
    
      fetch('/api/config?name=products', {
        cache:'no-store'
      }).then(r=>r.json()),
    
      fetch('/api/config?name=materials', {
        cache:'no-store'
      }).then(r=>r.json()),
    
      fetch('/api/config?name=specifications', {
        cache:'no-store'
      }).then(r=>r.json()),
    
    ])
    setAllDocs(docsRes.data || [])
    setCompanies(compRes.data || [])
    setDocTypes(dtRes.data || [])
    setProducts(productRes.data || [])
    setMaterials(materialRes.data || [])
    setSpecifications(specificationRes.data || [])
    setLoading(false)
  }, [])

  const handleRefresh = async () => {
    setRefreshing(true)
  
    try {
      await loadData()
      toast.success('데이터를 새로고침했습니다.')
    } catch {
      toast.error('새로고침 실패')
    } finally {
      setRefreshing(false)
    }
  }

  useEffect(() => { loadData() }, [loadData])

  useDataChanged(() => { loadData() }, [loadData])

  // 사이드바 트리(쿼리 파라미터)에서 업체/문서유형 선택 시 nav 동기화
  useEffect(() => {
    const company = initialCompany ?? null
    const docType = initialDocType ?? null
    setNav(prev => {
      if (prev.company === company && prev.docType === docType) return prev
      return { company, docType, year: null }
    })
  }, [initialCompany, initialDocType])

  // --- Sidebar: filtered companies ---
  const activeConsonants = useMemo(() => {
    return new Set(FILTER_CONSONANTS.filter(fc => companies.some(c => matchesChosung(c, fc))))
  }, [companies])

  const filteredCompanies = useMemo(() => {
    return companies.filter(c =>
      consonant ? matchesChosung(c, consonant) : true
    )
  }, [companies, consonant])

  const companiesByInitial = useMemo(() => {
    return FILTER_CONSONANTS
      .map(initial => ({
        initial,
        companies: companies.filter(
          company => getInitialConsonant(company) === initial
        ),
      }))
      .filter(group => group.companies.length > 0)
  }, [companies])

  // --- Content level ---
  const level: Level | null = selectedCompany
    ? selectedDocType
      ? selectedYear ? 'files' : 'year'
      : 'docType'
    : null

  // 업체 변경 시 하위 상태를 동일 렌더 사이클에서 원자적으로 초기화
  const handleSelectCompany = (c: string) => {
    if (c === selectedCompany) return
  
    setSelectedDocs([])
  
    setNav({
      company: c,
      docType: null,
      year: null
    })
  }

  // useCallback → useMemo: 렌더마다 함수를 중복 호출하지 않고 결과값을 메모이제이션
  const docTypesForCompany = useMemo(() => {
    if (!selectedCompany) return []
    const docs = allDocs.filter(d => d.company === selectedCompany)
    return docTypes
      .filter(dt => docs.some(d => d.documentType === dt))
      .map(dt => ({ name: dt, count: docs.filter(d => d.documentType === dt).length }))
  }, [allDocs, docTypes, selectedCompany])

  const yearsForDocType = useMemo(() => {
    if (!selectedCompany || !selectedDocType) return []
    const docs = allDocs.filter(d => d.company === selectedCompany && d.documentType === selectedDocType)
    const years = [...new Set(docs.map(d => d.year))].sort((a, b) => Number(b) - Number(a))
    return years.map(y => ({ year: y, count: docs.filter(d => d.year === y).length }))
  }, [allDocs, selectedCompany, selectedDocType])

  const filteredDocs = useMemo(() => {
    const keyword = query.trim().toLowerCase()
  
    const docs = allDocs.filter(d => {

      const issueDate = d.issueDate
        ? d.issueDate.replace(/[^0-9]/g, '')
        : ''

      const start = startDate.replace(/-/g, '')
      const end = endDate.replace(/-/g, '')
      return (
        // 트리 선택
        (!selectedCompany ||
          d.company === selectedCompany)
        &&
        (!selectedDocType ||
          d.documentType === selectedDocType)
        &&
        (!selectedYear ||
          selectedYear === 'ALL' ||
          d.year === selectedYear)
        &&
        // 업체 필터
        (
          selectedCompanies.length === 0 ||
          selectedCompanies.includes(d.company)
        )
        &&
        // 문서유형 필터
        (
          selectedDocTypes.length === 0 ||
          selectedDocTypes.includes(d.documentType)
        )
        &&
        // 품목
        (
          selectedProducts.length === 0 ||
          selectedProducts.includes(d.product)
        )
        &&
        // 재질
        (
          selectedMaterials.length === 0 ||
          selectedMaterials.includes(d.material)
        )
        &&
        // 규격
        (
          selectedSpecifications.length === 0 ||
          selectedSpecifications.includes(d.specification ?? '')
        )
        &&
        // 시작일
        (
          !start ||
          issueDate >= start
        )
        &&
        // 종료일
        (
          !end ||
          issueDate <= end
        )
        &&
        // LOT
        (
          !lotNumber ||
          d.lotStart?.includes(lotNumber) ||
          d.lotEnd?.includes(lotNumber)
        )
        &&
        // 통합 검색창
        (
          !keyword ||
          d.filename?.toLowerCase().includes(keyword) ||
          d.originalName?.toLowerCase().includes(keyword) ||
          d.company?.toLowerCase().includes(keyword) ||
          d.documentType?.toLowerCase().includes(keyword) ||
          d.product?.toLowerCase().includes(keyword) ||
          d.material?.toLowerCase().includes(keyword) ||
          d.specification?.toLowerCase().includes(keyword) ||
          d.lotStart?.toLowerCase().includes(keyword) ||
          d.lotEnd?.toLowerCase().includes(keyword) ||
          d.note?.toLowerCase().includes(keyword)
        )
      )
    })
  
    return docs.sort((a, b) => {
      let va: string | number = ''
      let vb: string | number = ''
    
      switch (sortField) {
        case 'filename':
          va = a.originalName || a.filename || ''
          vb = b.originalName || b.filename || ''
          break
    
        case 'documentType':
          va = a.documentType || ''
          vb = b.documentType || ''
          break
        
        case 'product':
          va = a.product || ''
          vb = b.product || ''
          break
        
        case 'lot':
          va = a.lotStart || ''
          vb = b.lotStart || ''
          break
    
        case 'issueDate':
          va = Number(String(a.issueDate || '').replace(/[^0-9]/g, '').slice(0, 8)) || 0
          vb = Number(String(b.issueDate || '').replace(/[^0-9]/g, '').slice(0, 8)) || 0
          break
    
        case 'quantity':
          va = a.quantity || 0
          vb = b.quantity || 0
          break
    
        case 'company':
          va = a.company || ''
          vb = b.company || ''
          break
      }
    
      if (typeof va === 'number' && typeof vb === 'number') {
        return sortDir === 'asc' ? va - vb : vb - va
      }
    
      return sortDir === 'asc'
        ? String(va).localeCompare(String(vb), 'ko-KR', { numeric: true })
        : String(vb).localeCompare(String(va), 'ko-KR', { numeric: true })
    })
  }, [
    allDocs,
   
    selectedCompany,
    selectedDocType,
    selectedYear,
   
    selectedCompanies,
    selectedDocTypes,
    selectedProducts,
    selectedMaterials,
    selectedSpecifications,
   
    startDate,
    endDate,
    lotNumber,
   
    sortField,
    sortDir,
   
    query
   ])

  const cascadingOptions = useMemo(() => {
    const matches = (doc: DocumentMetadata, excluded: 'company' | 'documentType' | 'product' | 'material' | 'specification') => {
      if (excluded !== 'company' && selectedCompanies.length > 0 && !selectedCompanies.includes(doc.company)) return false
      if (excluded !== 'documentType' && selectedDocTypes.length > 0 && !selectedDocTypes.includes(doc.documentType)) return false
      if (excluded !== 'product' && selectedProducts.length > 0 && !selectedProducts.includes(doc.product)) return false
      if (excluded !== 'material' && selectedMaterials.length > 0 && !selectedMaterials.includes(doc.material)) return false
      if (excluded !== 'specification' && selectedSpecifications.length > 0 && !selectedSpecifications.includes(doc.specification ?? '')) return false
      return true
    }

    const values = (excluded: Parameters<typeof matches>[1], field: keyof DocumentMetadata) =>
      [...new Set(allDocs.filter(doc => matches(doc, excluded)).map(doc => String(doc[field] ?? '')).filter(Boolean))]
        .sort((a, b) => a.localeCompare(b, 'ko-KR', { numeric: true }))

    return {
      companies: values('company', 'company'),
      docTypes: values('documentType', 'documentType'),
      products: values('product', 'product'),
      materials: values('material', 'material'),
      specifications: values('specification', 'specification'),
    }
  }, [allDocs, selectedCompanies, selectedDocTypes, selectedProducts, selectedMaterials, selectedSpecifications])

  const handleDeleteDoc = (id: string) => {

    setAllDocs(prev =>
      prev.filter(d => d.id !== id)
    )
   
    setSelectedDocs(prev =>
      prev.filter(v => v !== id)
   )
   
   }
  const handleUpdateDoc = (updated: DocumentMetadata) =>
    setAllDocs(prev => prev.map(d => d.id === updated.id ? updated : d))

  const downloadSingleDocument = (doc: DocumentMetadata) => {
    const downloadName = documentDownloadName(doc)
    const a = document.createElement('a')

    a.href =
      `/api/file?path=${encodeURIComponent(doc.storagePath)}&download=true&downloadName=${encodeURIComponent(downloadName)}`
    a.download = downloadName
    a.click()
  }
  
  
  const downloadDocuments = async (
    docs: DocumentMetadata[]
  ) => {
  
    if (docs.length === 0) return
  
  
    if (docs.length === 1) {
      downloadSingleDocument(docs[0])
      return
    }
  
  
    setDownloading(true)
  
    try {
  
      const res = await fetch('/api/download-zip', {
        method:'POST',
        headers:{
          'Content-Type':'application/json'
        },
        body:JSON.stringify({
          ids:docs.map(doc=>doc.id)
        })
      })
  
  
      if(!res.ok){
        toast.error('다운로드 실패')
        return
      }
  
  
      const blob = await res.blob()
  
      const url = window.URL.createObjectURL(blob)
  
      const a = document.createElement('a')
  
      a.href=url
      a.download='documents.zip'
  
      a.click()
  
      window.URL.revokeObjectURL(url)
  
  
    } catch {
  
      toast.error('다운로드 실패')
  
    } finally {
  
      setDownloading(false)
  
    }
  }

  const handleDeleteSelected = async () => {
    setDeleting(true)
  
    try {
      const ids = [...selectedDocs]
      const session = getSession()
      const authHeaders = session ? buildAuthHeaders(session) : {}
  
      const responses = await Promise.all(
        ids.map(id =>
          fetch(`/api/documents/${id}`, {
            method: 'DELETE',
            headers: authHeaders,
          })
        )
      )
  
      const failedCount =
        responses.filter(res => !res.ok).length
  
      const successCount =
        ids.length - failedCount
  
  
      if (successCount === 0) {
        toast.error('삭제에 실패했습니다.')
        setDeleteOpen(false)
        return
      }
  
  
      setAllDocs(prev =>
        prev.filter(doc => !ids.includes(doc.id))
      )
  
      setSelectedDocs([])
  
  
      if (failedCount > 0) {
        toast.error(
          `${successCount}건 삭제, ${failedCount}건 실패`
        )
      } else {
        toast.success(
          `${successCount}건의 문서가 삭제되었습니다.`
        )
      }
  
  
    } catch {
      toast.error('삭제 실패')
    } finally {
      setDeleting(false)
      setDeleteOpen(false)
    }
  }

  const toggleSelectDoc = (id: string) => {
    setSelectedDocs(prev =>
      prev.includes(id)
        ? prev.filter(v => v !== id)
        : [...prev, id]
    )
  }
  
  
  const toggleSelectAll = () => {
    if (selectedDocs.length === filteredDocs.length) {
      setSelectedDocs([])
    } else {
      setSelectedDocs(filteredDocs.map(doc => doc.id))
    }
  }
  
  
  const selectedDocuments = filteredDocs.filter(doc =>
    selectedDocs.includes(doc.id)
  )
  const allSelected = filteredDocs.length > 0 && selectedDocs.length === filteredDocs.length

  const [companySearch, setCompanySearch] = useState('')

  const docCount = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const d of allDocs) {
      counts[d.company] = (counts[d.company] || 0) + 1
    }
    return counts
  }, [allDocs])

  const visibleCompanies = useMemo(() => {
    const keyword = companySearch.trim()
    if (!keyword) return filteredCompanies
    return filteredCompanies.filter(company =>
      company.toLowerCase().includes(keyword.toLowerCase()) || chosungSearch(company, keyword)
    )
  }, [filteredCompanies, companySearch])

  const monthCount = useMemo(() => {
    const now = new Date()
    const prefix = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`
    return allDocs.filter(doc => String(doc.issueDate || '').replace(/[^0-9]/g, '').startsWith(prefix)).length
  }, [allDocs])

  const docTypeCounts = useMemo(() => {
    const scoped = selectedCompany ? allDocs.filter(doc => doc.company === selectedCompany) : allDocs
    const counts = new Map<string, number>()
    for (const doc of scoped) counts.set(doc.documentType, (counts.get(doc.documentType) || 0) + 1)
    return [...counts].sort((a, b) => b[1] - a[1])
  }, [allDocs, selectedCompany])

  const filterChips = [
    ...selectedCompanies.map(value => ({ key: `company-${value}`, label: `업체 ${value}`, clear: () => setSelectedCompanies(prev => prev.filter(v => v !== value)) })),
    ...selectedProducts.map(value => ({ key: `product-${value}`, label: `품목 ${value}`, clear: () => setSelectedProducts(prev => prev.filter(v => v !== value)) })),
    ...selectedMaterials.map(value => ({ key: `material-${value}`, label: `재질 ${value}`, clear: () => setSelectedMaterials(prev => prev.filter(v => v !== value)) })),
    ...selectedSpecifications.map(value => ({ key: `spec-${value}`, label: `규격 ${value}`, clear: () => setSelectedSpecifications(prev => prev.filter(v => v !== value)) })),
    ...(startDate || endDate ? [{ key: 'date', label: `발행일 ${startDate || '처음'} ~ ${endDate || '오늘'}`, clear: () => { setStartDate(''); setEndDate('') } }] : []),
    ...(lotNumber ? [{ key: 'lot', label: `LOT ${lotNumber}`, clear: () => setLotNumber('') }] : []),
  ]
  const activeFilterCount = filterChips.length

  const clearFilters = () => {
    setSelectedCompanies([])
    setSelectedDocTypes([])
    setSelectedProducts([])
    setSelectedMaterials([])
    setSelectedSpecifications([])
    setStartDate('')
    setEndDate('')
    setLotNumber('')
  }

  const toggleDocType = (type: string | null) => {
    setSelectedDocs([])
    if (type === null) {
      setSelectedDocTypes([])
      return
    }
    setSelectedDocTypes(prev => prev.length === 1 && prev[0] === type ? [] : [type])
  }

  const goHome = () => {
    setSelectedDocs([])
    setNav({ company: null, docType: null, year: null })
  }

  // Breadcrumb back navigation — setNav으로 원자적 업데이트
  const breadcrumbs = [
    selectedCompany ? {
      label: selectedCompany,
      action: selectedDocType ? () => setNav(n => ({ ...n, docType: null, year: null })) : undefined
    } : null,
    selectedDocType ? {
      label: selectedDocType,
      action: selectedYear ? () => setNav(n => ({ ...n, year: null })) : undefined
    } : null,
    selectedYear ? { label: selectedYear === 'ALL' ? '전체 연도' : `${selectedYear}년`, action: undefined } : null,
  ].filter(Boolean) as { label: string; action: (() => void) | undefined }[]

  const showDocs = !selectedCompany || level === 'files'

  const docList = filteredDocs.length === 0 ? (
    <div className="flex h-56 flex-col items-center justify-center gap-3 text-muted-foreground">
      <FileText className="h-12 w-12 opacity-25" />
      <p className="text-sm">{query || activeFilterCount || selectedDocTypes.length ? '조건에 맞는 문서가 없습니다.' : '등록된 문서가 없습니다.'}</p>
      {(query || activeFilterCount > 0 || selectedDocTypes.length > 0) && (
        <Button variant="outline" size="sm" onClick={() => { setQuery(''); clearFilters() }}>
          검색 조건 지우기
        </Button>
      )}
    </div>
  ) : viewMode === 'grid' ? (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
      {filteredDocs.map(doc => (
        <FileCard
          key={doc.id}
          document={doc}
          onPreview={setPreviewDoc}
          onDelete={handleDeleteDoc}
          viewMode="grid"
          selected={selectedDocs.includes(doc.id)}
          onSelect={() => toggleSelectDoc(doc.id)}
        />
      ))}
    </div>
  ) : (
    <div className="min-w-[880px] overflow-clip rounded-xl border border-border bg-card">
      <ListHeader
        handleListSort={handleListSort}
        sortField={sortField}
        sortDir={sortDir}
        allSelected={allSelected}
        onToggleAll={toggleSelectAll}
      />
      {filteredDocs.map(doc => (
        <FileCard
          key={doc.id}
          document={doc}
          onPreview={setPreviewDoc}
          onDelete={handleDeleteDoc}
          viewMode="list"
          selected={selectedDocs.includes(doc.id)}
          onSelect={() => toggleSelectDoc(doc.id)}
        />
      ))}
    </div>
  )

  return (
    <div className="flex h-full flex-col gap-4 p-5">
      <PageHeader
        tone="blue"
        icon={FileText}
        eyebrow="DOCUMENTS · 문서관리"
        title="문서탐색기"
        stat={{
          label: '전체 문서',
          value: allDocs.length.toLocaleString(),
          unit: '건',
          sub: `이번 달 ${monthCount.toLocaleString()}건 · 업체 ${companies.length}곳`,
        }}
        actions={canDelete && (
          <Link href="/upload" className={cn(buttonVariants(), BAND_BUTTON_PRIMARY, 'h-10 gap-2 px-4')}>
            <Upload className="h-4 w-4" /> 문서 등록
          </Link>
        )}
      />

      <div className="flex min-h-0 flex-1 overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        {/* ──── 업체 목록 ──── */}
        <aside
          className={cn(
            'flex shrink-0 flex-col border-r border-border bg-muted/20 transition-all duration-300',
            sidebarOpen ? 'w-64' : 'w-12'
          )}
        >
          <div className={cn('flex items-center gap-2 border-b border-border px-3 py-2.5', !sidebarOpen && 'justify-center px-0')}>
            {sidebarOpen && (
              <p className="flex-1 text-sm font-bold text-foreground">
                업체 <span className="ml-1 font-medium text-muted-foreground">{visibleCompanies.length}</span>
              </p>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              title={sidebarOpen ? '업체 목록 접기' : '업체 목록 펼치기'}
              onClick={() => setSidebarOpen(prev => !prev)}
            >
              {sidebarOpen ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeftOpen className="h-4 w-4" />}
            </Button>
          </div>

          {sidebarOpen && (
            <div className="space-y-2 border-b border-border px-3 py-2.5">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={companySearch}
                  onChange={e => setCompanySearch(e.target.value)}
                  placeholder="업체 검색 (초성 가능)"
                  className="h-8 pl-8 text-sm"
                />
              </div>
              <div className="flex flex-wrap gap-1">
                {FILTER_CONSONANTS.filter(fc => activeConsonants.has(fc)).map(fc => (
                  <button
                    key={fc}
                    type="button"
                    onClick={() => setConsonant(prev => prev === fc ? null : fc)}
                    className={cn(
                      'h-6 min-w-6 rounded-md px-1.5 text-xs font-semibold transition-colors',
                      consonant === fc
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted text-muted-foreground hover:bg-accent hover:text-foreground'
                    )}
                  >
                    {fc}
                  </button>
                ))}
              </div>
            </div>
          )}

          {sidebarOpen && (
            <div className="flex-1 overflow-y-auto p-1.5">
              <button
                type="button"
                onClick={() => { setConsonant(null); goHome() }}
                className={cn(
                  'mb-1 flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition-colors',
                  !selectedCompany ? 'bg-primary/10 font-bold text-primary' : 'font-semibold text-foreground hover:bg-accent'
                )}
              >
                <Files className="h-4 w-4 shrink-0" />
                <span className="flex-1">전체 문서</span>
                <span className="text-xs tabular-nums text-muted-foreground">{allDocs.length}</span>
              </button>
              {loading ? (
                <div className="space-y-1 pt-1">
                  {Array.from({ length: 8 }).map((_, i) => (
                    <Skeleton key={i} className="h-8 w-full rounded-lg" />
                  ))}
                </div>
              ) : visibleCompanies.length === 0 ? (
                <p className="px-3 py-8 text-center text-xs text-muted-foreground">검색 결과 없음</p>
              ) : (
                visibleCompanies.map(c => {
                  const isSelected = c === selectedCompany
                  const count = docCount[c] || 0
                  return (
                    <button
                      key={c}
                      type="button"
                      onClick={() => handleSelectCompany(c)}
                      className={cn(
                        'flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition-colors',
                        isSelected ? 'bg-primary/10 font-bold text-primary' : 'text-foreground hover:bg-accent'
                      )}
                    >
                      {isSelected
                        ? <FolderOpen className="h-4 w-4 shrink-0 text-primary" />
                        : <Folder className="h-4 w-4 shrink-0 text-amber-500" />}
                      <span className="flex-1 truncate font-medium">{c}</span>
                      {count > 0 && (
                        <span className={cn(
                          'rounded-full px-1.5 text-[11px] tabular-nums',
                          isSelected ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground'
                        )}>
                          {count}
                        </span>
                      )}
                    </button>
                  )
                })
              )}
            </div>
          )}
        </aside>

        {/* ──── 본문 ──── */}
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex shrink-0 flex-col gap-2.5 border-b border-border px-4 py-3">
            <div className="flex flex-wrap items-center gap-2">
              <nav className="flex min-w-0 shrink-0 items-center gap-1 whitespace-nowrap text-sm">
                <button
                  type="button"
                  onClick={goHome}
                  className={cn('rounded-md px-1.5 py-0.5', breadcrumbs.length ? 'text-primary hover:bg-primary/10' : 'font-bold text-foreground')}
                >
                  전체 문서
                </button>
                {breadcrumbs.map((item, i) => (
                  <div key={i} className="flex min-w-0 items-center gap-1">
                    <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    {item.action ? (
                      <button type="button" onClick={item.action} className="max-w-[160px] truncate rounded-md px-1.5 py-0.5 text-primary hover:bg-primary/10">
                        {item.label}
                      </button>
                    ) : (
                      <span className="max-w-[160px] truncate px-1.5 font-bold text-foreground">{item.label}</span>
                    )}
                  </div>
                ))}
              </nav>

              <div className="ml-auto flex min-w-0 flex-1 flex-wrap items-center justify-end gap-2">
                <div className="relative min-w-[200px] max-w-md flex-1">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    placeholder="업체, 품목, LOT, 비고로 검색"
                    className="h-9 pl-9 pr-8"
                  />
                  {query && (
                    <button type="button" onClick={() => setQuery('')} className="absolute right-2.5 top-1/2 -translate-y-1/2" aria-label="검색어 지우기">
                      <X className="h-4 w-4 text-muted-foreground" />
                    </button>
                  )}
                </div>
                <Button
                  variant={filtersOpen || activeFilterCount > 0 ? 'secondary' : 'outline'}
                  className="h-9 gap-1.5 px-3"
                  onClick={() => setFiltersOpen(prev => !prev)}
                >
                  <SlidersHorizontal className="h-4 w-4" />
                  필터
                  {activeFilterCount > 0 && (
                    <span className="rounded-full bg-primary px-1.5 text-[11px] font-bold text-primary-foreground">{activeFilterCount}</span>
                  )}
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-9 w-9"
                  onClick={handleRefresh}
                  disabled={refreshing}
                  title="데이터 새로고침"
                >
                  <RefreshCw className={cn('h-4 w-4', refreshing && 'animate-spin')} />
                </Button>
                <div className="flex overflow-hidden rounded-md border border-border">
                  <Button
                    variant={viewMode === 'list' ? 'default' : 'ghost'}
                    size="icon"
                    className="h-9 w-9 rounded-none"
                    title="목록 보기"
                    onClick={() => setViewMode('list')}
                  >
                    <List className="h-4 w-4" />
                  </Button>
                  <Button
                    variant={viewMode === 'grid' ? 'default' : 'ghost'}
                    size="icon"
                    className="h-9 w-9 rounded-none"
                    title="카드 보기"
                    onClick={() => setViewMode('grid')}
                  >
                    <LayoutGrid className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>

            {filtersOpen && (
              <div className="grid grid-cols-1 gap-3 rounded-xl border border-border bg-muted/30 p-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
                <FilterField label="업체명">
                  <MultiSelect options={cascadingOptions.companies} value={selectedCompanies} onChange={setSelectedCompanies} />
                </FilterField>
                <FilterField label="품목">
                  <MultiSelect options={cascadingOptions.products} value={selectedProducts} onChange={setSelectedProducts} />
                </FilterField>
                <FilterField label="재질">
                  <MultiSelect options={cascadingOptions.materials} value={selectedMaterials} onChange={setSelectedMaterials} />
                </FilterField>
                <FilterField label="규격">
                  <MultiSelect options={cascadingOptions.specifications} value={selectedSpecifications} onChange={setSelectedSpecifications} />
                </FilterField>
                <FilterField label="발행일 시작">
                  <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
                </FilterField>
                <FilterField label="발행일 종료">
                  <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
                </FilterField>
                <FilterField label="LOT 번호">
                  <Input placeholder="LOT 검색" value={lotNumber} onChange={e => setLotNumber(e.target.value)} />
                </FilterField>
              </div>
            )}

            {showDocs && (
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => toggleDocType(null)}
                  className={cn(
                    'h-7 rounded-full border px-3 text-xs font-semibold transition-colors',
                    selectedDocTypes.length === 0
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border bg-background text-muted-foreground hover:text-foreground'
                  )}
                >
                  전체 유형
                </button>
                {docTypeCounts.map(([type, count]) => {
                  const active = selectedDocTypes.includes(type)
                  return (
                    <button
                      key={type}
                      type="button"
                      onClick={() => toggleDocType(type)}
                      className={cn(
                        'h-7 rounded-full border px-3 text-xs font-semibold transition-colors',
                        active
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-border bg-background text-foreground hover:border-primary/40'
                      )}
                    >
                      {type} <span className={cn('ml-0.5 tabular-nums', active ? 'text-primary-foreground/80' : 'text-muted-foreground')}>{count}</span>
                    </button>
                  )
                })}
                {filterChips.length > 0 && <span className="mx-1 h-4 w-px bg-border" />}
                {filterChips.map(chip => (
                  <span key={chip.key} className="inline-flex h-7 items-center gap-1 rounded-full bg-primary/10 pl-3 pr-1.5 text-xs font-semibold text-primary">
                    {chip.label}
                    <button type="button" onClick={chip.clear} className="rounded-full p-0.5 hover:bg-primary/15" aria-label={`${chip.label} 지우기`}>
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
                {filterChips.length > 0 && (
                  <button type="button" onClick={clearFilters} className="px-1.5 text-xs text-muted-foreground hover:text-foreground">
                    모두 지우기
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="flex-1 overflow-auto p-4">
            {loading ? (
              <div className="space-y-2">
                {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-12 rounded-lg" />)}
              </div>
            ) : showDocs ? (
              <>
                <div className={cn('flex items-center gap-2', (selectedDocs.length > 0 || viewMode === 'grid') && 'mb-3 min-h-9')}>
                  {selectedDocs.length > 0 ? (
                    <div className="flex w-full flex-wrap items-center gap-2 rounded-xl border border-primary/30 bg-primary/5 px-3 py-1.5">
                      <span className="text-sm font-bold text-primary">{selectedDocs.length}개 선택됨</span>
                      <Button size="sm" className="h-8 gap-1.5" disabled={downloading} onClick={() => downloadDocuments(selectedDocuments)}>
                        <Download className="h-4 w-4" />
                        {downloading ? '압축 중...' : selectedDocs.length > 1 ? 'ZIP 다운로드' : '다운로드'}
                      </Button>
                      {canDelete && (
                        <Button size="sm" variant="outline" className="h-8 gap-1.5 border-destructive/40 text-destructive hover:bg-destructive/10" disabled={deleting} onClick={() => setDeleteOpen(true)}>
                          <Trash2 className="h-4 w-4" /> 삭제
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" className="ml-auto h-8" onClick={() => setSelectedDocs([])}>
                        선택 해제
                      </Button>
                    </div>
                  ) : viewMode === 'grid' ? (
                    <>
                      <Button variant="ghost" size="sm" className="h-8 gap-1.5" onClick={toggleSelectAll} disabled={filteredDocs.length === 0}>
                        <CheckSquare className="h-4 w-4" /> 전체 선택
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="ml-auto h-8 gap-1.5"
                        onClick={() => {
                          if (sortField === 'issueDate' && sortDir === 'desc') {
                            setSortDir('asc')
                          } else if (sortField === 'issueDate') {
                            setSortField('company')
                            setSortDir('asc')
                          } else {
                            setSortField('issueDate')
                            setSortDir('desc')
                          }
                        }}
                      >
                        {sortField === 'issueDate'
                          ? sortDir === 'desc'
                            ? <><SortDesc className="h-4 w-4" /> 최신순</>
                            : <><SortAsc className="h-4 w-4" /> 오래된순</>
                          : <><SortAsc className="h-4 w-4" /> 업체순</>}
                      </Button>
                    </>
                  ) : null}
                </div>
                {docList}
              </>
            ) : level === 'docType' ? (
              docTypesForCompany.length === 0 ? (
                <div className="flex h-56 flex-col items-center justify-center gap-3 text-muted-foreground">
                  <FolderOpen className="h-12 w-12 opacity-25" />
                  <p className="text-sm">등록된 문서가 없습니다.</p>
                </div>
              ) : (
                <>
                  <p className="mb-3 text-sm text-muted-foreground">문서 유형을 고르세요.</p>
                  <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
                    {docTypesForCompany.map(dt => (
                      <button
                        key={dt.name}
                        type="button"
                        onClick={() => {
                          setSelectedDocs([])
                          setNav(n => ({ ...n, docType: dt.name, year: null }))
                        }}
                        className="group flex items-center gap-3 rounded-xl border border-border bg-card p-4 text-left transition-all hover:border-primary/40 hover:shadow-md"
                      >
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-50 dark:bg-blue-950/30">
                          <FolderOpen className="h-5 w-5 text-blue-500" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-base font-bold text-foreground">{dt.name}</p>
                          <p className="text-sm text-muted-foreground">{dt.count.toLocaleString()}건</p>
                        </div>
                        <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                      </button>
                    ))}
                  </div>
                </>
              )
            ) : level === 'year' ? (
              <>
                <p className="mb-3 text-sm text-muted-foreground">연도를 고르세요.</p>
                <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
                  {[
                    {
                      year: 'ALL',
                      label: '전체',
                      count: allDocs.filter(d => d.company === selectedCompany && d.documentType === selectedDocType).length,
                    },
                    ...yearsForDocType.map(item => ({ year: item.year, label: `${item.year}년`, count: item.count })),
                  ].map(item => (
                    <button
                      key={item.year}
                      type="button"
                      onClick={() => {
                        setSelectedDocs([])
                        setNav(n => ({ ...n, year: item.year }))
                      }}
                      className="group flex items-center gap-3 rounded-xl border border-border bg-card p-4 text-left transition-all hover:border-primary/40 hover:shadow-md"
                    >
                      <div className={cn(
                        'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg',
                        item.year === 'ALL' ? 'bg-blue-50 dark:bg-blue-950/30' : 'bg-emerald-50 dark:bg-emerald-950/30'
                      )}>
                        {item.year === 'ALL'
                          ? <FolderOpen className="h-5 w-5 text-blue-500" />
                          : <Folder className="h-5 w-5 text-emerald-500" />}
                      </div>
                      <div className="min-w-0">
                        <p className="text-base font-bold text-foreground">{item.label}</p>
                        <p className="text-xs text-muted-foreground">{item.count.toLocaleString()}건</p>
                      </div>
                    </button>
                  ))}
                </div>
              </>
            ) : null}
          </div>
        </div>
      </div>

      <FilePreviewDrawer
        document={previewDoc}
        open={!!previewDoc}
        onClose={() => setPreviewDoc(null)}
        onDelete={handleDeleteDoc}
        onUpdate={handleUpdateDoc}
      />

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>문서 삭제</AlertDialogTitle>
            <AlertDialogDescription>
              선택한 {selectedDocs.length}개의 문서를 삭제하시겠습니까?
              <br />
              삭제 후에는 복구할 수 없습니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteSelected}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              삭제
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
