/**
 * Italian legal citation parser.
 *
 * Parses citations like:
 *   "Art. 1, Decreto legislativo 30 giugno 2003, n. 196"     (full)
 *   "Art. 1, D.Lgs. 196/2003"                                 (short)
 *   "Art. 4-bis, D.Lgs. 196/2003"                             (with bis suffix)
 *   "Art. 1, comma 1, D.Lgs. 196/2003"                        (with comma/paragraph)
 *   "dlgs-196-2003, art. 1"                                    (ID-based)
 */

import type { ParsedCitation, ItalianDocumentType } from '../types/index.js';

/** Italian month names for date parsing */
const ITALIAN_MONTHS: Record<string, number> = {
  gennaio: 1, febbraio: 2, marzo: 3, aprile: 4,
  maggio: 5, giugno: 6, luglio: 7, agosto: 8,
  settembre: 9, ottobre: 10, novembre: 11, dicembre: 12,
};

/** Document type abbreviation mapping */
const TYPE_MAP: Record<string, ItalianDocumentType> = {
  'decreto legislativo': 'dlgs',
  'd.lgs.': 'dlgs',
  'd.lgs': 'dlgs',
  'dlgs': 'dlgs',
  'decreto-legge': 'dl',
  'decreto legge': 'dl',
  'd.l.': 'dl',
  'd.l': 'dl',
  'dl': 'dl',
  'legge': 'legge',
  'l.': 'legge',
  'd.p.r.': 'dpr',
  'dpr': 'dpr',
  'r.d.': 'rd',
  'rd': 'rd',
  'regio decreto': 'rd',
  'codice': 'codice',
};

/** Article suffix patterns (bis, ter, quater, etc.) */
const ARTICLE_SUFFIXES = ['bis', 'ter', 'quater', 'quinquies', 'sexies', 'septies', 'octies', 'novies', 'decies'];

// Full citation: "Art. 1, Decreto legislativo 30 giugno 2003, n. 196"
const FULL_CITATION = /^Art\.?\s+(\d+(?:-(?:bis|ter|quater|quinquies|sexies|septies|octies|novies|decies))?)\s*(?:,\s*(?:comma\s+(\d+)\s*,\s*)?)?(?:,\s*)?(Decreto\s+legislativo|Decreto-legge|Decreto\s+legge|Legge|Regio\s+decreto|D\.P\.R\.?)\s+(\d{1,2})\s+(gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre)\s+(\d{4})\s*,?\s*n\.?\s*(\d+)/i;

// Short citation: "Art. 1, D.Lgs. 196/2003"
const SHORT_CITATION = /^Art\.?\s+(\d+(?:-(?:bis|ter|quater|quinquies|sexies|septies|octies|novies|decies))?)\s*(?:,\s*(?:comma\s+(\d+)\s*,\s*)?)?(?:,\s*)?(D\.Lgs\.?|D\.L\.?|L\.?|D\.P\.R\.?|R\.D\.?|Legge|Decreto\s+legislativo|Decreto-legge)\s+(?:n\.?\s*)?(\d+)\s*\/\s*(\d{4})/i;

// With comma/paragraph: "Art. 1, comma 1, D.Lgs. 196/2003"
const COMMA_CITATION = /^Art\.?\s+(\d+(?:-(?:bis|ter|quater|quinquies|sexies|septies|octies|novies|decies))?)\s*,\s*comma\s+(\d+)\s*,\s*(D\.Lgs\.?|D\.L\.?|L\.?|D\.P\.R\.?|R\.D\.?|Legge|Decreto\s+legislativo|Decreto-legge)\s+(?:n\.?\s*)?(\d+)\s*\/\s*(\d{4})/i;

// ID-based: "dlgs-196-2003, art. 1" or "dlgs-196-2003, art. 4-bis"
const ID_BASED_CITATION = /^(legge|dlgs|dl|dpr|rd)-(\d+)-(\d{4})\s*,?\s*art\.?\s*(\d+(?:-(?:bis|ter|quater|quinquies|sexies|septies|octies|novies|decies))?)(?:\s*,?\s*comma\s+(\d+))?/i;

// Codice-style: "Art. 615-ter, Codice Penale" or "Art. 1, Codice Civile"
const CODICE_CITATION = /^Art\.?\s+(\d+(?:-(?:bis|ter|quater|quinquies|sexies|septies|octies|novies|decies))?)\s*(?:,\s*(?:comma\s+(\d+)\s*,\s*)?)?(?:,\s*)?(Codice\s+\w+(?:\s+\w+)?)/i;

function parseArticleRef(raw: string): { article: string; suffix?: string } {
  const suffixMatch = raw.match(/^(\d+)-(bis|ter|quater|quinquies|sexies|septies|octies|novies|decies)$/i);
  if (suffixMatch) {
    return { article: suffixMatch[1], suffix: suffixMatch[2].toLowerCase() };
  }
  return { article: raw };
}

function resolveDocType(raw: string): ItalianDocumentType {
  const lower = raw.toLowerCase().replace(/\s+/g, ' ').trim();
  return TYPE_MAP[lower] ?? 'unknown';
}

function buildDocumentId(type: ItalianDocumentType, number: number, year: number): string {
  return `${type}-${number}-${year}`;
}

export function parseCitation(citation: string): ParsedCitation {
  const trimmed = citation.trim();

  // Try comma citation first (most specific)
  let match = trimmed.match(COMMA_CITATION);
  if (match) {
    const { article, suffix } = parseArticleRef(match[1]);
    const comma = match[2];
    const docType = resolveDocType(match[3]);
    const number = parseInt(match[4], 10);
    const year = parseInt(match[5], 10);
    return {
      valid: true,
      type: docType,
      article,
      suffix,
      comma,
      number,
      year,
      document_id: buildDocumentId(docType, number, year),
    };
  }

  // Try ID-based citation
  match = trimmed.match(ID_BASED_CITATION);
  if (match) {
    const docType = match[1].toLowerCase() as ItalianDocumentType;
    const number = parseInt(match[2], 10);
    const year = parseInt(match[3], 10);
    const { article, suffix } = parseArticleRef(match[4]);
    const comma = match[5] || undefined;
    return {
      valid: true,
      type: docType,
      article,
      suffix,
      comma,
      number,
      year,
      document_id: buildDocumentId(docType, number, year),
    };
  }

  // Try codice-style citation
  match = trimmed.match(CODICE_CITATION);
  if (match) {
    const { article, suffix } = parseArticleRef(match[1]);
    const comma = match[2] || undefined;
    const title = match[3].trim();
    return {
      valid: true,
      type: 'codice',
      title,
      article,
      suffix,
      comma,
    };
  }

  // Try full citation
  match = trimmed.match(FULL_CITATION);
  if (match) {
    const { article, suffix } = parseArticleRef(match[1]);
    const comma = match[2] || undefined;
    const docType = resolveDocType(match[3]);
    const number = parseInt(match[7], 10);
    const year = parseInt(match[6], 10);
    return {
      valid: true,
      type: docType,
      article,
      suffix,
      comma,
      number,
      year,
      document_id: buildDocumentId(docType, number, year),
    };
  }

  // Try short citation
  match = trimmed.match(SHORT_CITATION);
  if (match) {
    const { article, suffix } = parseArticleRef(match[1]);
    const comma = match[2] || undefined;
    const docType = resolveDocType(match[3]);
    const number = parseInt(match[4], 10);
    const year = parseInt(match[5], 10);
    return {
      valid: true,
      type: docType,
      article,
      suffix,
      comma,
      number,
      year,
      document_id: buildDocumentId(docType, number, year),
    };
  }

  return {
    valid: false,
    type: 'unknown',
    error: `Could not parse Italian citation: "${trimmed}"`,
  };
}

/**
 * Parse an Italian date string like "30 giugno 2003" into ISO format.
 */
export function parseItalianDate(dateStr: string): string | null {
  const match = dateStr.trim().match(/^(\d{1,2})\s+(gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre)\s+(\d{4})$/i);
  if (!match) return null;

  const day = parseInt(match[1], 10);
  const month = ITALIAN_MONTHS[match[2].toLowerCase()];
  const year = parseInt(match[3], 10);

  if (!month || day < 1 || day > 31) return null;

  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}
