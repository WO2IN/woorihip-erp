import { spawn } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {
  buildRecognitionCertificateWorkbook,
  type RecognitionCertificateInput,
} from '@/lib/recognition-certificate-excel'

function run(command: string, args: string[]) {
  return new Promise<{ code: number; stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString()
    })
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString()
    })
    child.on('error', reject)
    child.on('close', (code) => {
      resolve({ code: code ?? 1, stdout: stdout.trim(), stderr: stderr.trim() })
    })
  })
}

function officeError(stderr: string, stdout: string, app: string) {
  const raw = `${stdout}\n${stderr}`
  const text = raw
    .replace(/#<\s*CLIXML[\s\S]*$/i, '')
    .replace(/<Objs[\s\S]*$/i, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return text.slice(0, 300) || `${app}에서 PDF를 만들지 못했습니다.`
}

async function windowsPath(filePath: string) {
  const result = await run('wslpath', ['-w', filePath])
  if (result.code !== 0 || !result.stdout) throw new Error('Windows 경로를 만들지 못했습니다.')
  return result.stdout
}

/** 엑셀 양식(xlsx) → PDF (Excel COM, WSL + Windows) */
export async function convertRecognitionXlsxFileToPdf(xlsxPath: string, pdfPath: string) {
  const xlsxWin = (await windowsPath(xlsxPath)).replace(/'/g, "''")
  const pdfWin = (await windowsPath(pdfPath)).replace(/'/g, "''")
  const script = [
    "$ProgressPreference = 'SilentlyContinue'",
    "$InformationPreference = 'SilentlyContinue'",
    "$ErrorActionPreference = 'Stop'",
    'try {',
    '  $running = @(Get-Process EXCEL -ErrorAction SilentlyContinue).Count -gt 0',
    '  $excel = New-Object -ComObject Excel.Application',
    '  $excel.Visible = $false',
    '  $excel.DisplayAlerts = $false',
    `$wb = $excel.Workbooks.Open('${xlsxWin}')`,
    `$wb.ExportAsFixedFormat(0, '${pdfWin}')`,
    '  $wb.Close($false)',
    '  if (-not $running) { $excel.Quit() }',
    `[System.Runtime.InteropServices.Marshal]::ReleaseComObject($wb) | Out-Null`,
    `  if (-not (Test-Path -LiteralPath '${pdfWin}')) { throw 'PDF file was not created' }`,
    "  Write-Output 'OK'",
    '} catch {',
    '  Write-Output $_.Exception.Message',
    '  exit 1',
    '}',
  ].join('\n')
  const encoded = Buffer.from(script, 'utf16le').toString('base64')
  const exported = await run('powershell.exe', [
    '-NoProfile',
    '-NonInteractive',
    '-ExecutionPolicy',
    'Bypass',
    '-EncodedCommand',
    encoded,
  ])
  if (exported.code !== 0) throw new Error(officeError(exported.stderr, exported.stdout, 'Excel'))
  const bytes = await readFile(pdfPath)
  if (bytes.length < 5 || bytes.subarray(0, 4).toString() !== '%PDF') {
    throw new Error('PDF를 만들지 못했습니다.')
  }
  return bytes
}

export async function buildRecognitionCertificatePdf(input: RecognitionCertificateInput): Promise<Buffer> {
  const work = await mkdtemp(path.join(os.tmpdir(), 'wh-cert-xlsx-'))
  const xlsx = path.join(work, 'certificate.xlsx')
  const pdf = path.join(work, 'certificate.pdf')
  try {
    const workbook = await buildRecognitionCertificateWorkbook(input)
    await writeFile(xlsx, workbook)
    return await convertRecognitionXlsxFileToPdf(xlsx, pdf)
  } finally {
    await rm(work, { recursive: true, force: true }).catch(() => undefined)
  }
}
