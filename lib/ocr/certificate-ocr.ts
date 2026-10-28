import { execFile } from 'child_process'
import { mkdtemp, readFile, rm, writeFile } from 'fs/promises'
import os from 'os'
import path from 'path'
import { promisify } from 'util'
import sharp from 'sharp'
import { createWorker, PSM, type Worker } from 'tesseract.js'

const execFileAsync = promisify(execFile)
const TESSDATA_DIR = path.join(process.cwd(), 'tessdata')

let workerPromise: Promise<Worker> | null = null

function getWorker() {
  workerPromise ??= (async () => {
    const worker = await createWorker(['kor', 'eng'], 1, {
      langPath: TESSDATA_DIR,
      cachePath: TESSDATA_DIR,
      gzip: false,
    })
    await worker.setParameters({
      tessedit_pageseg_mode: PSM.SPARSE_TEXT,
      preserve_interword_spaces: '1',
    })
    return worker
  })().catch(error => {
    workerPromise = null
    throw error
  })
  return workerPromise
}

/** pdftoppm(poppler-utils)으로 첫 페이지를 300dpi PNG로 만든다. 브라우저 렌더링보다 OCR 결과가 훨씬 안정적이다. */
export async function renderPdfFirstPage(pdf: Buffer) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'woorihip-ocr-'))
  try {
    const input = path.join(dir, 'input.pdf')
    const output = path.join(dir, 'page')
    await writeFile(input, pdf)
    await execFileAsync('pdftoppm', ['-r', '300', '-f', '1', '-l', '1', '-png', '-singlefile', input, output], { timeout: 30_000 })
    return await readFile(`${output}.png`)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

export type HeaderVariant = 'threshold170' | 'gray' | 'threshold200'

export const HEADER_VARIANTS: HeaderVariant[] = ['threshold170', 'gray', 'threshold200']

/** 성적서 상단(고객명·품명·LOT·발행일·재질·사양·수량 표)만 잘라 인식한다. */
export async function recognizeCertificateHeader(page: Buffer, variant: HeaderVariant) {
  const source = sharp(page)
  const { width = 0, height = 0 } = await source.metadata()
  if (!width || !height) throw new Error('이미지를 읽을 수 없습니다.')

  let pipeline = source
    .extract({ left: 0, top: Math.round(height * 0.02), width, height: Math.round(height * 0.3) })
    .flatten({ background: '#ffffff' })
    .grayscale()
  if (variant === 'threshold170') pipeline = pipeline.threshold(170)
  if (variant === 'threshold200') pipeline = pipeline.threshold(200)

  const worker = await getWorker()
  const { data } = await worker.recognize(await pipeline.png().toBuffer())
  return data.text
}
