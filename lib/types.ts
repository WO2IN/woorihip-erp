export type UserRole = 'viewer' | 'editor' | 'admin'

export interface User {
  id: string
  username: string
  displayName: string
  passwordHash: string      // scrypt$salt$key (구버전 SHA-256 hex는 로그인 시 자동 변환)
  role: UserRole
  floor?: 1 | 2 | 3
  /** 회원가입 직후 'pending'. 값이 없으면 승인된 계정. */
  status?: 'pending'
  /** 사이드바 메뉴 id 순서. 없으면 기본 순서. */
  navOrder?: string[]
  createdAt: string
}

export interface SessionUser {
  id: string
  username: string
  displayName: string
  role: UserRole
  floor?: 1 | 2 | 3
  navOrder?: string[] | null
}

export interface DocumentMetadata {
  id: string
  filename: string          // stored filename (auto-generated)
  originalName: string      // original upload name
  company: string
  documentType: string
  shipmentCategory?: string
  movementType?: '입고' | '출고'
  /** 이미 있는 입출고 건에 붙인 성적서. 있으면 재고 수량으로 다시 세지 않습니다. */
  linkedMovementId?: string
  shipmentFloor?: 1 | 2 | 3
  floor?: 1 | 2 | 3
  lotStart: string
  lotEnd?: string
  product: string
  material: string
  specification?: string
  quantity?: number
  quantityUnit?: 'Kg' | 'EA' | 'R'
  issueDate: string         // YYYY-MM-DD
  note?: string
  fileSize: number          // bytes
  year: string              // extracted from issueDate
  storagePath: string       // relative path inside /storage
  createdAt: string         // ISO timestamp
  createdBy?: string        // displayName of uploader
  createdById?: string      // user id of uploader
  updatedAt?: string        // ISO timestamp of last update
  updatedBy?: string        // displayName of last editor
  updatedById?: string      // user id of last editor
}

export interface SearchFilters {
  company?: string
  documentType?: string
  year?: string
  product?: string
  material?: string
  specification?: string
  lotNumber?: string
  query?: string
}
