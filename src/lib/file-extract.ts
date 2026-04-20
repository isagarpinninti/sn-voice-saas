/**
 * Extract plaintext from uploaded attachments so the voice agent can reason
 * about file contents, not just the filename.
 *
 * Supports PDF and XLSX/XLS today. PPT/PPTX and images are out of scope (the
 * former has no reliable Node parser; images need a vision model).
 *
 * All functions cap output length — the extracted text is inlined into the
 * LLM conversation as a system message, so we can't afford to blow out the
 * context window. Truncation is deterministic (no summarization) to keep the
 * contract predictable.
 */

import { PDFParse } from 'pdf-parse'
import * as XLSX from 'xlsx'

export const MAX_EXTRACTED_CHARS = 8000

export type Extraction = {
  kind: 'pdf' | 'xlsx' | 'xls' | 'unsupported' | 'error'
  text: string
  truncated: boolean
  /** Human-readable note — e.g. "2 sheets, 42 rows", "5 pages" */
  note?: string
  /** Error message when kind === 'error' */
  error?: string
}

export async function extractText(params: {
  bytes: Buffer
  mimeType: string
  fileName: string
}): Promise<Extraction> {
  const ext = (params.fileName.split('.').pop() || '').toLowerCase()
  const mt = (params.mimeType || '').toLowerCase()

  try {
    if (mt === 'application/pdf' || ext === 'pdf') {
      return await extractPdf(params.bytes)
    }
    if (
      mt === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
      mt === 'application/vnd.ms-excel' ||
      ext === 'xlsx' ||
      ext === 'xls'
    ) {
      return extractXlsx(params.bytes, ext === 'xls' ? 'xls' : 'xlsx')
    }
    return { kind: 'unsupported', text: '', truncated: false }
  } catch (err) {
    return {
      kind: 'error',
      text: '',
      truncated: false,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

async function extractPdf(bytes: Buffer): Promise<Extraction> {
  const parser = new PDFParse({ data: new Uint8Array(bytes) })
  try {
    const result = await parser.getText({ last: 50 }) // cap at 50 pages
    const raw = (result.text || '').replace(/\u0000/g, '').trim()
    const pageCount = Array.isArray(result.pages) ? result.pages.length : 0
    const truncated = raw.length > MAX_EXTRACTED_CHARS
    return {
      kind: 'pdf',
      text: truncated ? raw.slice(0, MAX_EXTRACTED_CHARS) : raw,
      truncated,
      note: `${pageCount} page${pageCount === 1 ? '' : 's'}${truncated ? ', truncated' : ''}`,
    }
  } finally {
    await parser.destroy().catch(() => {})
  }
}

function extractXlsx(bytes: Buffer, kind: 'xlsx' | 'xls'): Extraction {
  const wb = XLSX.read(bytes, { type: 'buffer' })
  const parts: string[] = []
  let totalRows = 0

  for (const name of wb.SheetNames) {
    const sheet = wb.Sheets[name]
    if (!sheet) continue
    // Convert to CSV — most compact textual representation for an LLM.
    const csv = XLSX.utils.sheet_to_csv(sheet, { blankrows: false, strip: true }).trim()
    if (!csv) continue
    const lines = csv.split('\n')
    totalRows += lines.length
    parts.push(`--- Sheet: ${name} ---\n${csv}`)
    // Early-out once we've collected enough raw text
    const runningLen = parts.reduce((s, p) => s + p.length, 0)
    if (runningLen > MAX_EXTRACTED_CHARS * 1.5) break
  }

  const combined = parts.join('\n\n').trim()
  const truncated = combined.length > MAX_EXTRACTED_CHARS
  return {
    kind,
    text: truncated ? combined.slice(0, MAX_EXTRACTED_CHARS) : combined,
    truncated,
    note: `${wb.SheetNames.length} sheet${wb.SheetNames.length === 1 ? '' : 's'}, ${totalRows} row${totalRows === 1 ? '' : 's'}${truncated ? ', truncated' : ''}`,
  }
}
