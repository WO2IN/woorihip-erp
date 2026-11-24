// 바코드 스캔 → 제품 이력 화면 테스트용 임시 데이터.
//   node --env-file=.env.local scripts/trace-test-data.mjs          만들기 (이미 있으면 덮어씀)
//   node --env-file=.env.local scripts/trace-test-data.mjs remove   지우기
import pg from 'pg'

const BARCODE = 'WR2611249999'
const IDS = {
  'incoming-inspections': '7e57c0de-0000-4000-8000-000000000001',
  'lot-cards': '7e57c0de-0000-4000-8000-000000000002',
  'outgoing-reports': '7e57c0de-0000-4000-8000-000000000003',
}
const EXTRA_IDS = {
  inventory: ['7e57c0de-0000-4000-8000-000000000011'],
  'trace-barcodes': ['7e57c0de-0000-4000-8000-000000000031'],
  floor3WorkLogs: ['7e57c0de-0000-4000-8000-000000000021', '7e57c0de-0000-4000-8000-000000000022'],
}
// 실제 피티씨 0.3*63 출하성적서(LOT 20261014-01, 282Kg)의 값을 본떠 채운 임시 데이터.
const COMPANY = '피티씨'
const PRODUCT = '0.3*63'
const LOT = '20261014-01'
const SPEC = '0.3*63'
const MATERIAL = 'SUS 301 3/4H'
const now = new Date().toISOString()

const bath = (v, a) => ({ v, a })
const emptyDim = { qty: '', name: '', our1: '', our2: '', spec: '', cust1: '', cust2: '', cycle: '', judge: '', lower: '', upper: '' }

const sheet = {
  id: IDS['incoming-inspections'],
  floor: '1', done: true, createdAt: now, updatedAt: now,
  inspectedOn: '2026-10-13', inspector: '홍길동', company: COMPANY, model: PRODUCT,
  lotWeight: '282', lotWeightUnit: 'Kg', lotRoll: '3', spec: SPEC, material: MATERIAL,
  appearanceSpec: '1)외관 변형 없을것.\n2)스크래치 없을 것.', appearanceResult: 'OK',
  thicknessSpec: '0.3±0.01', lengthSpec: '63 -0.1', thicknessResult: '0.301', widthResult: '62.931', dimensionResult: 'OK',
  drawLength: '63', drawThickness: '0.3', judgment: '합격', writer: '홍길동', approver: '',
}

const card = {
  id: IDS['lot-cards'],
  floor: '1', done: true, createdAt: now, updatedAt: now,
  partner: COMPANY, product: PRODUCT, spec: SPEC, material: MATERIAL, sourceIncomingId: sheet.id,
  lotNo: LOT, receivedAt: '2026-10-13', seqNo: '1', rollCount: '3', quantity: '282', platedQuantity: '280', materialVendor: '포스코',
  barcode: BARCODE,
  incoming: [{ left: '0.301', right: '0.300' }, { left: '0.299', right: '0.301' }],
  incomingFullWidth: '62.931', incomingGap: '5.775', incomingPlateWidth: '3.499', incomingDate: '2026-10-13', incomingJudge: 'OK',
  niSpec: '2.0μm Min', niDate: '2026-10-14',
  niBaths: [bath('3.2', '15'), bath('3.1', '20'), bath('3.1', '20'), bath('', ''), bath('', '')],
  niFirst: '2.3', niLast: '2.4', niJudge: 'OK',
  maskDate: '2026-10-14', workDate: '2026-10-14', maskFullWidth: '62.95', maskGap: '5.80', maskPlateWidth: '3.50', maskJudge: 'OK',
  auDate: '2026-10-14', auSpec: '0.03μm Min',
  auBaths: [bath('2.0', '3'), bath('2.1', '3'), bath('', ''), bath('', ''), bath('', '')],
  auFirst: '0.040', auLast: '0.035', auJudge: 'OK',
  snDate: '', snSpec: '', snBaths: [bath('', ''), bath('', ''), bath('', ''), bath('', ''), bath('', '')], snFirst: '', snLast: '', snJudge: '',
  shipDate: '2026-10-14', niThickness: '2.35', auThickness: '0.037', snThickness: '', adhesion: 'OK', solder: '', salt: '', shipJudge: 'OK',
}

const report = {
  id: IDS['outgoing-reports'],
  floor: '1', done: true, createdAt: now, updatedAt: now,
  customer: COMPANY, product: PRODUCT, lotNo: LOT, lotRange: '', issuedOn: '2026-10-14',
  spec: SPEC, material: MATERIAL, platingSpec: 'Au 0.03㎛ Min', sourceLotCardId: card.id, lotSize: '282',
  visual: Array(10).fill('OK'),
  dimensions: [
    { ...emptyDim, name: '전폭', spec: '63.0', lower: '-0.1', cycle: 'Reel/Lot', judge: 'OK', our1: '62.931', qty: '94.5' },
    { ...emptyDim, name: '간격', spec: '6.0', cycle: 'Reel/Lot', judge: 'OK', our1: '5.775', qty: '93.0' },
    { ...emptyDim, name: '도금폭', spec: '3.0', cycle: 'Reel/Lot', judge: 'OK', our1: '3.499', qty: '94.5' },
    ...Array.from({ length: 12 }, () => ({ ...emptyDim })),
  ],
  platingResult: 'OK', adhesionSpec: '', adhesionResult: 'OK',
  ourWriter: '홍길동', ourApprover: '', customerWriter: '', customerApprover: '', judgment: '합격',
}

const inboundRecord = {
  id: EXTRA_IDS.inventory[0], barcode: BARCODE, floor: 1, company: COMPANY, product: SPEC, lotStart: LOT, quantity: 282, quantityUnit: 'Kg',
  issueDate: '2026-10-13', movementType: '입고', storagePath: 'INVENTORY', defectQuantity: 0, sampleQuantity: 0, createdAt: now,
}
// 바코드 대장: 입고등록에서 발급된 바코드. 상태는 스캔 모드로 바뀌며 여기서는 '출하대기'까지 간 상태로 둔다.
const at = (date, hour) => `${date}T0${hour}:00:00.000Z`
const traceBarcode = {
  id: EXTRA_IDS['trace-barcodes'][0], barcode: BARCODE, company: COMPANY, product: PRODUCT, floor: 1,
  quantity: 282, quantityUnit: 'Kg', receivedAt: '2026-10-13', source: 'inbound', inventoryId: inboundRecord.id, note: '',
  status: 'shipReady',
  statusLog: [
    { status: 'received', at: at('2026-10-13', 1), by: '홍길동' },
    { status: 'working', at: at('2026-10-14', 0), by: '홍길동' },
    { status: 'done', at: at('2026-10-14', 6), by: '홍길동' },
    { status: 'shipReady', at: at('2026-10-14', 7), by: '홍길동' },
  ],
  createdAt: now, createdBy: '홍길동',
}
const workLogs = [
  ['2026-10-14', 150, 1],
  ['2026-10-14', 130, 0],
].map(([workDate, workQuantity, defectQuantity], index) => ({
  id: EXTRA_IDS.floor3WorkLogs[index], company: COMPANY, product: SPEC, floor: 1, unit: 'EA', workDate,
  workQuantity, defectQuantity, sampleQuantity: 0, totalQuantity: workQuantity, createdAt: now,
}))

const client = new pg.Client({ connectionString: process.env.DATABASE_URL })
await client.connect()
const remove = process.argv[2] === 'remove'
try {
  await client.query('BEGIN')
  const rows = [['incoming-inspections', sheet], ['lot-cards', card], ['outgoing-reports', report], ['inventory', inboundRecord], ['trace-barcodes', traceBarcode], ...workLogs.map((log) => ['floor3WorkLogs', log])]
  for (const [collection, data] of rows) {
    await client.query('DELETE FROM records WHERE collection = $1 AND id = $2', [collection, data.id])
    if (!remove) {
      await client.query(
        `INSERT INTO records (collection, id, position, data)
         VALUES ($1, $2, (SELECT coalesce(min(position), 0) - 1 FROM records WHERE collection = $1), $3)`,
        [collection, data.id, JSON.stringify(data)],
      )
    }
    // 서버 메모리 캐시가 새 내용을 읽도록 버전을 올린다.
    await client.query('INSERT INTO collection_versions (name) VALUES ($1) ON CONFLICT DO NOTHING', [collection])
    await client.query('UPDATE collection_versions SET version = version + 1 WHERE name = $1', [collection])
  }
  await client.query('COMMIT')
  console.log(remove ? '임시 데이터를 지웠습니다.' : `임시 데이터를 만들었습니다. 바코드: ${BARCODE} (LOT ${LOT})`)
} catch (error) {
  await client.query('ROLLBACK')
  throw error
} finally {
  await client.end()
}
