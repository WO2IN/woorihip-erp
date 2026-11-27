import {
  BarChart3, Building2, ClipboardCheck, Factory, FileText, LayoutDashboard,
  Settings, ShieldAlert, ShieldCheck, Users, Wrench, type LucideIcon,
} from 'lucide-react'

export type Role = 'viewer' | 'editor' | 'admin'

export interface NavItem {
  label: string
  href?: string
  minRole?: Role
  soon?: boolean
  testing?: boolean
  children?: NavItem[]
}

export interface NavSection {
  id: string
  label: string
  icon: LucideIcon
  href?: string
  minRole?: Role
  testing?: boolean
  children?: NavItem[]
}

export const NAV: NavSection[] = [
  { id: 'dashboard', label: '대시보드', icon: LayoutDashboard, href: '/' },
  {
    id: 'process', label: '공정관리', icon: ClipboardCheck, href: '/checksheets',
  },
  {
    id: 'customer', label: '고객관리', icon: Building2, minRole: 'admin', children: [
      { label: '고객심사현황', href: '/customer/audit-status' },
      { label: 'QSA · QPA', href: '/customer/qsa-qpa', soon: true },
    ],
  },
  {
    id: 'quality', label: '품질관리', icon: ShieldCheck, minRole: 'admin', children: [
      { label: '부적합관리', href: '/quality/nonconformity' },
      { label: '폐기품 관리', href: '/quality/scrap', testing: true },
      { label: '변경점관리 (4M)', href: '/quality/change-points', testing: true },
      { label: '자격인증 관리', href: '/quality/qualifications', testing: true },
      { label: 'IATF 16949', href: '/quality/iatf', testing: true },
      { label: '내부심사', href: '/quality/internal-audit', testing: true },
    ],
  },
  { id: 'risk', label: '위험성평가', icon: ShieldAlert, href: '/risk-assessment', minRole: 'admin' },
  {
    id: 'kpi', label: 'KPI 관리', icon: BarChart3, minRole: 'admin', children: [
      { label: '수입검사 KPI', href: '/quality/kpi' },
      { label: '공정불량률 KPI', href: '/quality/kpi/process' },
      { label: '출하검사 KPI', href: '/quality/kpi/outgoing' },
      { label: '고객부적합 KPI', href: '/quality/kpi/customer' },
      { label: '납기준수 KPI', href: '/quality/kpi/delivery' },
    ],
  },
  { id: 'shipment', label: '재고 관리', icon: Factory, href: '/shipment', testing: true },
  {
    id: 'equipment', label: '설비관리', icon: Wrench, children: [
      { label: 'MTBF · MTTR 현황', href: '/equipment/mtbf-mttr', testing: true },
      { label: '계측기 이력관리', href: '/equipment/gauges', soon: true },
      { label: '소모품 (설비재고)', href: '/equipment/consumables', soon: true },
    ],
  },
  {
    id: 'documents', label: '문서관리', icon: FileText, children: [
      { label: '문서탐색기', href: '/explorer' },
      { label: '문서등록', href: '/upload', minRole: 'editor' },
    ],
  },
  {
    id: 'organization', label: '조직/사용자', icon: Users, children: [
      { label: '조직도', href: '/organization' },
      { label: '사용자 관리', href: '/admin/users', minRole: 'admin' },
    ],
  },
  {
    id: 'system', label: '시스템관리', icon: Settings, minRole: 'editor', children: [
      { label: '설정', href: '/settings', minRole: 'editor' },
      { label: '시스템 로그', href: '/system-logs', minRole: 'admin' },
    ],
  },
]

export function navSection(id: string) {
  return NAV.find((section) => section.id === id)
}

/** 사이드바 메뉴에 없는 화면의 이름 (서식·점검표 상세 등). 더 긴 주소가 먼저 맞는다. */
const EXTRA_PAGE_LABELS: [string, string][] = [
  ['/approvals', '결재 현황'],
  ['/process-check', '공정 점검'],
  ['/shipment/doc-flow', '입고 · 이력 · 출하 현황'],
  ['/shipment/incoming-inspection', '수입검사 성적서'],
  ['/shipment/lot-card', 'LOT 이력카드'],
  ['/shipment/outgoing-report', '출하성적서'],
  ['/checksheets/daily', '설비 일상점검'],
  ['/checksheets/5s', '3정 5S'],
  ['/checksheets/temp-humidity', '온·습도 점검'],
]

function navEntries(items: (NavSection | NavItem)[]): [string, string][] {
  return items.flatMap((item) => [
    ...(item.href ? [[item.href.split('?')[0], item.label] as [string, string]] : []),
    ...navEntries(item.children ?? []),
  ])
}

const PAGE_LABELS = [...EXTRA_PAGE_LABELS, ...navEntries(NAV)].sort((a, b) => b[0].length - a[0].length)

/** 주소로 화면 이름을 찾는다. 주소창으로 바로 들어와도 탭에 화면 이름을 붙이기 위해 쓴다. */
export function pageLabelFor(pathname: string): string | null {
  if (pathname === '/') return '대시보드'
  const found = PAGE_LABELS.find(([path]) => path !== '/' && (pathname === path || pathname.startsWith(`${path}/`)))
  return found?.[1] ?? null
}
