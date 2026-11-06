# WOORI-HIP 대시보드 — DB·저장소 데이터 정리

**작성일:** 2026-11-06  
**대상:** PostgreSQL + MinIO(선택) + `public/storage` 로컬 폴백

---

## 1. 저장 구조 개요

| 계층 | 기술 | 역할 |
|------|------|------|
| 관계형 DB | PostgreSQL | 사용자, JSON 컬렉션(`records`), 설정(`settings`), 파일 메타(`stored_files`), 시퀀스 |
| 객체 저장 | MinIO (`woorihip-docs`, `woorihip-media` 등) | 성적서 PDF, 설비 사진, 4M 첨부 등 바이너리 |
| 로컬 폴백 | `public/storage/` | MinIO 미설정 시 문서 파일 |
| 브라우저 | `localStorage` (`wms_session`) | 로그인 세션(사용자 JSON, DB 아님) |

---

## 2. PostgreSQL 고정 테이블

### 2.1 `users` (`lib/auth.ts`)

| 컬럼(요약) | 설명 |
|------------|------|
| id, username, display_name | 계정 식별·표시 이름 |
| password_hash, role, floor, status | viewer/editor/admin, 층, 승인 상태 |
| nav_order | 사이드바 메뉴 순서 |
| signature (bytea) | 결재·4M 서명 PNG |
| job_title | 직위(조직도·담당자 표시) |
| last_seen_at | 접속 시각 |

**사용처**

- `/login`, `/api/auth/*` — 로그인·회원가입·세션
- `/admin/users` — 사용자 관리
- `/organization` — 조직도 인원과 연동
- `/api/auth/signature` — 서명 이미지
- `/api/auth/nav-order` — 메뉴 순서
- 4M 변경요청·부적합 등 `displayName` / 서명 ID

---

### 2.2 `records` (`lib/records.ts`)

**형식:** `(collection, id, position, data jsonb)` — 예전 JSON 배열 파일을 컬렉션별로 보관.

#### A. 레거시 JSON 파일에서 1회 import (`lib/legacy-import.ts`)

| collection | 원본 파일 | 용도 |
|------------|-----------|------|
| `metadata` | `data/metadata.json` | **문서 메타**(성적서·출고 PDF 등) |
| `auditLogs` | `data/audit-log.json` | **시스템 감사 로그** |
| `inventory` | `data/inventory.json` | **입고(재고) 등록** |
| `floor3WorkLogs` | `data/floor3-work-logs.json` | **3층 작업일보** |
| `processChecks` | `data/process-checks.json` | **공정 점검 기록** |
| `processTemplates` | `data/process-templates.json` | **공정 점검표 템플릿** |
| `customerNonconformities` | `data/customer-nonconformities.json` | **고객 부적합** |
| `processNonconformities` | `data/process-nonconformities.json` | **공정 부적합** |

#### B. `data/db.json` 테이블 → 동일 collection 이름 (`lib/local-store.ts`)

| collection | 용도 |
|------------|------|
| `equipment` | 설비 마스터 |
| `equipmentPhotos` | 설비 사진 메타(파일은 MinIO/media) |
| `dailyCheckItems` | 일상점검 항목 |
| `dailyCheckSheets` | 일상점검 월별 시트 |
| `dailyCheckEntries` | 일상점검 셀 기록 |
| `dailyCheckIssues` | 일상점검 이슈 |
| `equipmentEmergencyGuides` | 비상 가이드 |
| `equipmentEmergencyHistories` | 비상 이력 |
| `fiveSTargets` | 5S 구역 |
| `fiveSCheckItems` | 5S 점검 항목 |
| `fiveSSheets` | 5S 월별 시트 |
| `fiveSEntries` | 5S 기록 |
| `tempHumidityTargets` | 온·습도 측정 위치 |
| `tempHumiditySheets` | 온·습도 시트 |
| `tempHumidityEntries` | 온·습도 기록 |
| `tempHumidityIssues` | 온·습도 이슈 |

**사용처 (공통 패턴: `app/actions/*.ts` + checksheets 페이지)**

- `/checksheets`, `/checksheets/daily`, `/5s`, `/temp-humidity` — 점검 UI
- `/equipment` — 설비·사진
- `lib/dashboard-stats.ts` — 홈 대시보드 점검율·누락
- `/api/stats` — 대시보드 API

#### C. `lib/storage.ts` 래퍼로 접근하는 collection

| collection | API / 화면 |
|------------|------------|
| `metadata` | `/explorer`, `/upload`, `/api/documents`, `/api/upload`, `/api/file`, KPI(출하·납기) |
| `inventory` | `/shipment`, `/api/inventory`, KPI 카탈로그 |
| `floor3WorkLogs` | `/api/floor3-work-logs`, KPI 출하 |
| `processChecks` | `/process-check`, `/api/process-checks` |
| `processTemplates` | `/process-check`, `/api/process-templates` |
| `customerNonconformities` | `/quality/nonconformity`, `/api/quality/customer-nonconformities`, KPI 고객 |
| `processNonconformities` | `/quality/nonconformity`, `/api/quality/process-nonconformities` |
| `auditLogs` | `/system-logs`, `/api/audit-logs`, 각 API `appendAuditLog` |

---

### 2.3 `settings` (`settings.key` → jsonb)

| key | 내용 | API / 화면 |
|-----|------|------------|
| `config:companies` | 고객사 목록 | `/api/config`, 설정, 심사·부적합·문서 combobox |
| `config:document-types` | 문서 유형 | 설정, 업로드 |
| `config:materials` | 재질 | 설정 |
| `config:specifications` | 규격 | 설정 |
| `config:products` | 제품 | 설정 |
| `config:shipment-categories` | 출하 구분 | 설정 |
| `organization` | 부서·인원 트리 | `/api/organization`, `/organization`, **고객심사 담당자** |
| `processHiddenLines` | 숨긴 공정 라인 ID | `/api/process-templates` |
| `platingInfoCsv` | 도금 정보 CSV 문자열 | `/api/plating-info`, `/settings`, KPI 카탈로그 |
| `customer-audits` | **고객심사(QSA/QPA) 행 배열** | `/api/customer/audits`, `/customer/audit-status`, 대시보드 |
| `development-change-requests` | **4M 변경요청 배열** | `/api/development/change-requests`, `/quality/change-points` |
| `qualification-ledger` | **자격인증 대장** | `/api/quality/qualifications`, `/quality/qualifications` |
| `suitability-sheet` | **적격성평가서** | `/api/quality/suitability`, 자격 화면 연동 |
| `incoming-inspection-kpi` | 수입검사 KPI 상태 | `/quality/kpi`, `/api/quality/kpi?kind=incoming` |
| `process-defect-kpi` | 공정불량률 KPI | `/quality/kpi/process` |
| `outgoing-inspection-kpi` | 출하검사 KPI | `/quality/kpi/outgoing` |
| `customer-nc-kpi` | 고객부적합 KPI | `/quality/kpi/customer` |
| `on-time-delivery-kpi` | 납기준수 KPI | `/quality/kpi/delivery` |

---

### 2.4 `sequences`

- 체크시트·설비 등 **숫자 id** 발급 (`local-store` insert 시 collection 이름별 카운터).

---

### 2.5 `stored_files` (`lib/stored-files.ts`)

MinIO 객체와 1:1 메타. `domain`, `category`, `owner_id`, `object_key`, `company`, `product`, `lot` 등.

**사용처**

- 문서 업로드/다운로드 (`/api/upload`, `/api/files/[id]`, `/api/documents`)
- 4M 변경 전·후 첨부 (`lib/change-request-stored.ts`, `development-change-requests` API)
- 설비 사진 마이그레이션 경로 (`uploads/equipment-photos/` → media 버킷)

---

## 3. MinIO / 파일 바이너리

| scope | 버킷(기본) | 내용 |
|-------|------------|------|
| docs | `woorihip-docs` | 성적서 PDF, 문서 `storagePath` |
| media | `woorihip-media` | 설비 사진, `uploads/` prefix |
| legacy | `woorihip` | 구 단일 버킷(마이그레이션용) |

**메타는** `metadata` collection + `stored_files` 테이블. **4M 첨부**는 change-request id + side(before/after) 키.

---

## 4. 화면 → 데이터 빠른 참조

| 메뉴 / 페이지 | 주 데이터 소스 |
|---------------|----------------|
| `/` 대시보드 | `GET /api/stats` → metadata, inventory, NC, checksheets collections, customer-audits, processChecks… |
| `/explorer`, `/upload` | `metadata` + MinIO/docs |
| `/shipment` | `inventory`, `metadata`(출고) |
| `/checksheets/*` | `db.json` collections (daily/5S/temp) |
| `/process-check` | `processTemplates`, `processChecks`, `processHiddenLines` |
| `/quality/nonconformity` | `customerNonconformities`, `processNonconformities` |
| `/customer/audit-status` | `settings.customer-audits`, `organization`, `config:companies` |
| `/quality/change-points` | `settings.development-change-requests` + MinIO 첨부 |
| `/quality/qualifications` | `settings.qualification-ledger`, `suitability-sheet` |
| `/quality/kpi/*` | 각 KPI `settings` 키 + metadata/inventory/NC/workLogs 파생 |
| `/organization` | `settings.organization` |
| `/settings` | `config:*`, `platingInfoCsv` |
| `/admin/users` | `users` |
| `/system-logs` | `records.auditLogs` |

---

## 5. 감사 로그 target 라벨 (`lib/audit-target-labels.ts`)

document, config, user, organization, process-template, process-check, inventory, floor3-work-log, process-nonconformity, customer-nonconformity, development-change-requests, qualification-ledger, suitability-sheet, customer-audits, KPI settings keys.

---

## 6. DB에 없는 것

- 로그인 **세션 쿠키** / `localStorage` 세션
- Next.js **빌드 산출물**
- `data/*.json` 원본(최초 import 후에는 DB가 기준; 파일은 백업용으로 남을 수 있음)

---

## 7. 환경 변수(DB·MinIO)

- `DATABASE_URL` — PostgreSQL
- `MINIO_*` — 객체 저장 endpoint, 키, 버킷명

---

*이 문서는 코드베이스(`lib/records.ts`, `lib/storage.ts`, `lib/auth.ts`, `app/api/*`) 기준으로 자동 정리되었습니다.*
