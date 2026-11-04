import {
  BarChart3, Building2, ClipboardCheck, Factory, FileText, LayoutDashboard,
  Settings, ShieldCheck, Users, Wrench, type LucideIcon,
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
    id: 'process', label: '공정관리', icon: ClipboardCheck, children: [
      { label: '통합 점검', href: '/checksheets' },
      { label: '설비 일상점검', href: '/checksheets/daily' },
      { label: '온·습도', href: '/checksheets/temp-humidity' },
      { label: '3정 5S', href: '/checksheets/5s' },
      { label: '공정 점검', href: '/process-check' },
    ],
  },
  {
    id: 'customer', label: '고객관리', icon: Building2, children: [
      { label: '고객심사현황', href: '/customer/audit-status', testing: true },
      { label: 'QSA · QPA', href: '/customer/qsa-qpa', soon: true },
    ],
  },
  {
    id: 'quality', label: '품질관리', icon: ShieldCheck, children: [
      { label: '부적합관리', href: '/quality/nonconformity' },
      { label: '변경점관리 (4M)', href: '/quality/change-points', testing: true },
      { label: '자격관리', href: '/quality/qualifications', soon: true },
      { label: 'IATF 16949', href: '/quality/iatf', soon: true },
    ],
  },
  {
    id: 'kpi', label: 'KPI 관리', icon: BarChart3, testing: true, children: [
      { label: '수입검사 KPI', href: '/quality/kpi', testing: true },
      { label: '공정불량률 KPI', href: '/quality/kpi/process', testing: true },
      { label: '출하검사 KPI', href: '/quality/kpi/outgoing', testing: true },
      { label: '고객부적합 KPI', href: '/quality/kpi/customer', testing: true },
      { label: '납기준수 KPI', href: '/quality/kpi/delivery', testing: true },
    ],
  },
  {
    id: 'shipment', label: '재고 관리', icon: Factory, children: [
      { label: '재고 관리', href: '/shipment', testing: true },
    ],
  },
  {
    id: 'equipment', label: '설비관리', icon: Wrench, children: [
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
