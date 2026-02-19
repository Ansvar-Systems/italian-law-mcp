/**
 * HTML parser for Italian legislation from normattiva.it
 *
 * Parses the normattiva.it HTML format into structured seed JSON.
 * Uses cheerio for HTML parsing.
 *
 * Normattiva HTML structure:
 * - Act title in <h1> or <div class="intestazione">
 * - Articles as <div class="art-body"> or similar containers
 * - Article numbers with "Art." prefix, possible bis/ter/quater suffixes
 * - Commi (paragraphs) within articles, numbered
 * - Italian date format (30 giugno 2003)
 */

/** Italian month names for date construction */
const ITALIAN_MONTHS: Record<string, string> = {
  gennaio: '01', febbraio: '02', marzo: '03', aprile: '04',
  maggio: '05', giugno: '06', luglio: '07', agosto: '08',
  settembre: '09', ottobre: '10', novembre: '11', dicembre: '12',
};

/** Map normattiva document type names to canonical abbreviations */
const DOC_TYPE_MAP: Record<string, string> = {
  'decreto legislativo': 'dlgs',
  'decreto-legge': 'dl',
  'legge': 'legge',
  'decreto del presidente della repubblica': 'dpr',
  'regio decreto': 'rd',
};

export interface ActIndexEntry {
  title: string;
  type: string;
  number: number;
  year: number;
  date: string;
  urn: string;
  url: string;
  updated: string;
}

export interface ParsedProvision {
  provision_ref: string;
  section: string;
  title: string;
  content: string;
  chapter?: string;
}

export interface ParsedAct {
  id: string;
  type: string;
  title: string;
  short_name: string;
  status: 'in_force' | 'amended' | 'repealed';
  issued_date: string;
  url: string;
  provisions: ParsedProvision[];
}

/**
 * Build a normattiva URN for a given document.
 * Format: urn:nir:stato:decreto.legislativo:2003-06-30;196
 */
export function buildNormattivaUrn(type: string, date: string, number: number): string {
  const typeMap: Record<string, string> = {
    dlgs: 'decreto.legislativo',
    dl: 'decreto-legge',
    legge: 'legge',
    dpr: 'decreto.del.presidente.della.repubblica',
    rd: 'regio.decreto',
  };
  const urnType = typeMap[type] ?? type;
  return `urn:nir:stato:${urnType}:${date};${number}`;
}

/**
 * Parse normattiva.it HTML to extract articles from the act page.
 *
 * This is a simplified parser that extracts article text from normattiva HTML.
 * The actual normattiva HTML structure varies, so we use regex-based extraction
 * as a robust fallback when cheerio DOM structure differs.
 */
export function parseNormattivaHtml(
  html: string,
  docType: string,
  number: number,
  year: number,
  title: string,
): ParsedAct {
  const provisions: ParsedProvision[] = [];
  const id = `${docType}-${number}-${year}`;

  // Extract articles using regex patterns that match normattiva format
  // Articles appear as "Art. N" or "Art. N-bis" followed by content
  const articlePattern = /Art\.\s*(\d+(?:-(?:bis|ter|quater|quinquies|sexies|septies|octies|novies|decies))?)\s*(?:\.\s*)?\n?\s*(?:\(([^)]*)\))?\s*\n?([\s\S]*?)(?=Art\.\s*\d+(?:-(?:bis|ter|quater|quinquies|sexies|septies|octies|novies|decies))?\s*(?:\.|$)|$)/gi;

  // Strip HTML tags for text extraction
  const textContent = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)))
    .replace(/\r\n/g, '\n');

  let match: RegExpExecArray | null;
  while ((match = articlePattern.exec(textContent)) !== null) {
    const articleNum = match[1].trim();
    const articleTitle = (match[2] ?? '').trim();
    let content = (match[3] ?? '').trim();

    // Clean up content
    content = content
      .replace(/\s+/g, ' ')
      .replace(/^\s+|\s+$/g, '')
      .trim();

    if (content.length === 0) {
      continue;
    }

    // Determine suffix
    const suffixMatch = articleNum.match(/^(\d+)-(bis|ter|quater|quinquies|sexies|septies|octies|novies|decies)$/i);
    const provisionRef = `art${articleNum}`;
    const section = articleNum;

    provisions.push({
      provision_ref: provisionRef,
      section,
      title: articleTitle,
      content,
    });
  }

  // If regex extraction found nothing, try a simpler line-based approach
  if (provisions.length === 0) {
    const lines = textContent.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    let currentArticle: string | null = null;
    let currentTitle = '';
    let currentContent: string[] = [];

    for (const line of lines) {
      const artMatch = line.match(/^Art\.\s*(\d+(?:-(?:bis|ter|quater|quinquies|sexies|septies|octies|novies|decies))?)\s*(?:\.\s*)?(?:\(([^)]*)\))?/i);
      if (artMatch) {
        if (currentArticle && currentContent.length > 0) {
          provisions.push({
            provision_ref: `art${currentArticle}`,
            section: currentArticle,
            title: currentTitle,
            content: currentContent.join(' ').replace(/\s+/g, ' ').trim(),
          });
        }
        currentArticle = artMatch[1].trim();
        currentTitle = (artMatch[2] ?? '').trim();
        currentContent = [];
        // Add remaining text on the article line
        const remainder = line.replace(artMatch[0], '').trim();
        if (remainder) currentContent.push(remainder);
      } else if (currentArticle) {
        currentContent.push(line);
      }
    }

    // Flush last article
    if (currentArticle && currentContent.length > 0) {
      provisions.push({
        provision_ref: `art${currentArticle}`,
        section: currentArticle,
        title: currentTitle,
        content: currentContent.join(' ').replace(/\s+/g, ' ').trim(),
      });
    }
  }

  return {
    id,
    type: docType,
    title,
    short_name: title,
    status: 'in_force',
    issued_date: `${year}-01-01`,
    url: `https://www.normattiva.it/uri-res/N2Ls?${buildNormattivaUrn(docType, `${year}-01-01`, number)}`,
    provisions,
  };
}

/**
 * Parse Italian date "30 giugno 2003" to ISO "2003-06-30"
 */
export function parseItalianDate(dateStr: string): string | null {
  const match = dateStr.trim().match(/^(\d{1,2})\s+(gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre)\s+(\d{4})$/i);
  if (!match) return null;

  const day = match[1].padStart(2, '0');
  const month = ITALIAN_MONTHS[match[2].toLowerCase()];
  const year = match[3];

  if (!month) return null;
  return `${year}-${month}-${day}`;
}
