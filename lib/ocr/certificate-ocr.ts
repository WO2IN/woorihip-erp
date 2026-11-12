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
let workerChain: Promise<unknown> = Promise.resolve()

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
      user_defined_dpi: '200',
    })
    return worker
  })().catch(error => {
    workerPromise = null
    throw error
  })
  return workerPromise
}

function withWorker<T>(task: (worker: Worker) => Promise<T>) {
  const run = workerChain.then(async () => task(await getWorker()))
  workerChain = run.then(() => undefined, () => undefined)
  return run
}

/** pdftoppm으로 첫 페이지를 200dpi PNG로 만든다. 속도 우선이다. */
export async function renderPdfFirstPage(pdf: Buffer) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'woorihip-ocr-'))
  try {
    const input = path.join(dir, 'input.pdf')
    const output = path.join(dir, 'page')
    await writeFile(input, pdf)
    await execFileAsync('pdftoppm', ['-r', '200', '-f', '1', '-l', '1', '-png', '-singlefile', input, output], { timeout: 20_000 })
    return await readFile(`${output}.png`)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

/** 성적서 상단만 한 번 읽는다. */
export async function recognizeCertificateHeader(page: Buffer) {
  const source = sharp(page)
  const { width = 0, height = 0 } = await source.metadata()
  if (!width || !height) throw new Error('이미지를 읽을 수 없습니다.')

  const top = Math.round(height * 0.02)
  const cropHeight = Math.min(Math.round(height * 0.32), height - top)
  const image = await source
    .extract({ left: 0, top, width, height: cropHeight })
    .flatten({ background: '#ffffff' })
    .grayscale()
    .withMetadata({ density: 200 })
    .png()
    .toBuffer()

  return withWorker(async worker => {
    const { data } = await worker.recognize(image)
    return { text: data.text, confidence: data.confidence ?? 0 }
  })
}
