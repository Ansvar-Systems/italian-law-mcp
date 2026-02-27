/**
 * Italian statute identifier handling.
 *
 * Italian laws are identified by type-number-year format:
 *   dlgs-196-2003  (Decreto legislativo 30 giugno 2003, n. 196)
 *   legge-633-1941 (Legge 22 aprile 1941, n. 633)
 *   dl-82-2021     (Decreto-legge 14 giugno 2021, n. 82)
 *   dpr-445-2000   (DPR 28 dicembre 2000, n. 445)
 *   rd-262-1942    (Regio decreto 16 marzo 1942, n. 262 — Codice Civile)
 *
 * Also supports short names like "Codice Privacy", "Codice Civile", etc.
 */

import type { Database } from '@ansvar/mcp-sqlite';

/** Document type abbreviation mapping */
const TYPE_ABBREVIATIONS: Record<string, string> = {
  'd.lgs.': 'dlgs',
  'd.lgs': 'dlgs',
  'dlgs': 'dlgs',
  'decreto legislativo': 'dlgs',
  'd.l.': 'dl',
  'd.l': 'dl',
  'dl': 'dl',
  'decreto-legge': 'dl',
  'decreto legge': 'dl',
  'l.': 'legge',
  'legge': 'legge',
  'd.p.r.': 'dpr',
  'dpr': 'dpr',
  'r.d.': 'rd',
  'rd': 'rd',
  'regio decreto': 'rd',
};

export function isValidStatuteId(id: string): boolean {
  return id.length > 0 && id.trim().length > 0;
}

/**
 * Attempt to parse a user-provided identifier into a canonical document ID.
 * Handles formats like:
 *   "D.Lgs. 196/2003" -> "dlgs-196-2003"
 *   "dlgs-196-2003" -> "dlgs-196-2003"
 *   "Codice Privacy" -> lookup by title
 */
export function normalizeDocumentIdentifier(input: string): string | null {
  const trimmed = input.trim();

  // Already in canonical form: type-number-year
  if (/^(legge|dlgs|dl|dpr|rd)-\d+-\d{4}$/.test(trimmed)) {
    return trimmed;
  }

  // Try "D.Lgs. 196/2003" or "D.Lgs. n. 196/2003"
  const shortMatch = trimmed.match(
    /^(D\.Lgs\.?|D\.L\.?|L\.?|D\.P\.R\.?|R\.D\.?|Legge|Decreto\s+legislativo|Decreto-legge|Decreto\s+legge)\s+(?:n\.?\s*)?(\d+)\s*\/\s*(\d{4})/i
  );
  if (shortMatch) {
    const typeRaw = shortMatch[1].toLowerCase().replace(/\s+/g, ' ').trim();
    const type = TYPE_ABBREVIATIONS[typeRaw] ?? typeRaw.replace(/[.\s]/g, '');
    const number = shortMatch[2];
    const year = shortMatch[3];
    return `${type}-${number}-${year}`;
  }

  // Try extracting from parenthetical, e.g. "D.Lgs. 196/2003 (Codice Privacy)"
  const parenMatch = trimmed.match(
    /^(D\.Lgs\.?|D\.L\.?|L\.?|D\.P\.R\.?|R\.D\.?|Legge|Decreto\s+legislativo|Decreto-legge)\s+(?:n\.?\s*)?(\d+)\s*\/\s*(\d{4})\s*\(/i
  );
  if (parenMatch) {
    const typeRaw = parenMatch[1].toLowerCase().replace(/\s+/g, ' ').trim();
    const type = TYPE_ABBREVIATIONS[typeRaw] ?? typeRaw.replace(/[.\s]/g, '');
    const number = parenMatch[2];
    const year = parenMatch[3];
    return `${type}-${number}-${year}`;
  }

  return null;
}

export function statuteIdCandidates(id: string): string[] {
  const trimmed = id.trim().toLowerCase();
  const candidates = new Set<string>();
  candidates.add(trimmed);
  candidates.add(id.trim());

  // Try normalized form
  const normalized = normalizeDocumentIdentifier(id);
  if (normalized) {
    candidates.add(normalized);
  }

  if (trimmed.includes(' ')) {
    candidates.add(trimmed.replace(/\s+/g, '-'));
  }
  if (trimmed.includes('-')) {
    candidates.add(trimmed.replace(/-/g, ' '));
  }

  return [...candidates];
}

export function resolveExistingStatuteId(
  db: Database,
  inputId: string,
): string | null {
  // Try exact match first
  const exact = db.prepare(
    "SELECT id FROM legal_documents WHERE id = ? LIMIT 1"
  ).get(inputId) as { id: string } | undefined;

  if (exact) return exact.id;

  // Try normalized form
  const normalized = normalizeDocumentIdentifier(inputId);
  if (normalized) {
    const normMatch = db.prepare(
      "SELECT id FROM legal_documents WHERE id = ? LIMIT 1"
    ).get(normalized) as { id: string } | undefined;
    if (normMatch) return normMatch.id;
  }

  // Try exact title match first (case-insensitive)
  const exactTitle = db.prepare(
    "SELECT id FROM legal_documents WHERE LOWER(title) = LOWER(?) OR LOWER(short_name) = LOWER(?) LIMIT 1"
  ).get(inputId, inputId) as { id: string } | undefined;
  if (exactTitle) return exactTitle.id;

  // Try LIKE match on title or short_name, preferring shorter titles (more likely to be the canonical document)
  const byTitle = db.prepare(
    "SELECT id FROM legal_documents WHERE title LIKE ? OR short_name LIKE ? ORDER BY LENGTH(title) ASC LIMIT 1"
  ).get(`%${inputId}%`, `%${inputId}%`) as { id: string } | undefined;

  return byTitle?.id ?? null;
}
