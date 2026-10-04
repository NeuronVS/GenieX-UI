// Text extraction per file kind, for the kinds we actually summarize
// (pdf/docx/text). Images and everything else are cataloged by metadata
// only — see the "Image handling" decision in project notes: no vision
// model exists in this stack yet, so we don't attempt to understand them.

import fs from 'node:fs/promises';
import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';

/** Cap extracted text before it goes into a summarization prompt. */
const MAX_EXTRACT_CHARS = 8000;

export async function extractText(filePath: string, kind: 'pdf' | 'docx' | 'text'): Promise<string> {
  if (kind === 'text') {
    const raw = await fs.readFile(filePath, 'utf8');
    return raw.slice(0, MAX_EXTRACT_CHARS);
  }
  if (kind === 'pdf') {
    const buffer = await fs.readFile(filePath);
    const data = await pdfParse(buffer);
    return (data.text || '').slice(0, MAX_EXTRACT_CHARS);
  }
  // docx
  const buffer = await fs.readFile(filePath);
  const result = await mammoth.extractRawText({ buffer });
  return (result.value || '').slice(0, MAX_EXTRACT_CHARS);
}
