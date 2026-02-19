/**
 * FTS5 query builder for Italian Law MCP.
 *
 * Sanitises user input to prevent FTS5 syntax errors from unescaped
 * special characters while still allowing intentional FTS5 operators.
 */

const EXPLICIT_FTS_SYNTAX = /["""]|(\bAND\b)|(\bOR\b)|(\bNOT\b)|\*$/;

const MAX_QUERY_LENGTH = 1000;

export interface FtsQueryVariants {
  primary: string;
  fallback?: string;
}

function sanitiseToken(token: string): string {
  return token.replace(/[^\p{L}\p{N}_-]/gu, '');
}

export function buildFtsQueryVariants(query: string): FtsQueryVariants {
  const trimmed = query.trim().slice(0, MAX_QUERY_LENGTH);

  if (trimmed.length === 0) {
    return { primary: '""' };
  }

  if (EXPLICIT_FTS_SYNTAX.test(trimmed)) {
    let normalised = trimmed
      .replace(/[\u201C\u201D]/g, '"')
      .replace(/;/g, '')
      .replace(/--/g, '')
      .slice(0, MAX_QUERY_LENGTH);

    const quoteCount = (normalised.match(/"/g) ?? []).length;
    if (quoteCount % 2 !== 0) {
      normalised += '"';
    }

    return { primary: normalised };
  }

  const tokens = trimmed
    .split(/\s+/)
    .filter(t => t.length > 0)
    .map(sanitiseToken)
    .filter(t => t.length > 0);

  if (tokens.length === 0) {
    return { primary: '""' };
  }

  const primary = tokens.map(t => `"${t}"*`).join(' ');
  const fallback = tokens.map(t => `${t}*`).join(' OR ');

  return { primary, fallback };
}
