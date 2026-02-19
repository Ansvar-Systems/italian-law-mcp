/**
 * Italian legal citation formatter.
 *
 * Formats:
 *   full:     "Art. 1, Decreto legislativo 30 giugno 2003, n. 196"
 *   short:    "Art. 1, D.Lgs. 196/2003"
 *   pinpoint: "Art. 1, comma 1"
 */

import type { ParsedCitation, CitationFormat } from '../types/index.js';

/** Map document type to full Italian name */
const TYPE_FULL_NAME: Record<string, string> = {
  dlgs: 'Decreto legislativo',
  dl: 'Decreto-legge',
  legge: 'Legge',
  dpr: 'Decreto del Presidente della Repubblica',
  rd: 'Regio decreto',
  codice: '',
};

/** Map document type to short abbreviation */
const TYPE_SHORT_NAME: Record<string, string> = {
  dlgs: 'D.Lgs.',
  dl: 'D.L.',
  legge: 'L.',
  dpr: 'D.P.R.',
  rd: 'R.D.',
  codice: '',
};

export function formatCitation(
  parsed: ParsedCitation,
  format: CitationFormat = 'full'
): string {
  if (!parsed.valid || !parsed.article) {
    return '';
  }

  const articleRef = buildArticleRef(parsed);
  const commaRef = parsed.comma ? `, comma ${parsed.comma}` : '';

  switch (format) {
    case 'full': {
      if (parsed.type === 'codice' && parsed.title) {
        return `Art. ${articleRef}${commaRef}, ${parsed.title}`;
      }
      const typeName = TYPE_FULL_NAME[parsed.type] ?? parsed.type;
      if (parsed.number && parsed.year) {
        return `Art. ${articleRef}${commaRef}, ${typeName} n. ${parsed.number}/${parsed.year}`.trim();
      }
      return `Art. ${articleRef}${commaRef}`;
    }

    case 'short': {
      if (parsed.type === 'codice' && parsed.title) {
        return `Art. ${articleRef}${commaRef}, ${parsed.title}`;
      }
      const typeAbbrev = TYPE_SHORT_NAME[parsed.type] ?? parsed.type;
      if (parsed.number && parsed.year) {
        return `Art. ${articleRef}${commaRef}, ${typeAbbrev} ${parsed.number}/${parsed.year}`.trim();
      }
      return `Art. ${articleRef}${commaRef}`;
    }

    case 'pinpoint':
      return `Art. ${articleRef}${commaRef}`;

    default:
      return `Art. ${articleRef}${commaRef}`;
  }
}

function buildArticleRef(parsed: ParsedCitation): string {
  let ref = parsed.article ?? '';
  if (parsed.suffix) {
    ref += `-${parsed.suffix}`;
  }
  return ref;
}
