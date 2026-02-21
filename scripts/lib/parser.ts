/**
 * HTML parser for Italian legislation from normattiva.it
 *
 * Parses individual article HTML pages (fetched via caricaArticolo AJAX endpoint)
 * that use Akoma Ntoso (AKN) markup classes:
 *
 *   <div class="bodyTesto">
 *     <h2 class="article-num-akn" id="art_1">Art. 1</h2>
 *     <div class="article-heading-akn">(( (Oggetto). ))</div>
 *     <!-- Short articles: -->
 *     <span class="art-just-text-akn">...</span>
 *     <!-- Long articles with numbered paragraphs (commi): -->
 *     <div class="art-commi-div-akn">
 *       <div class="art-comma-div-akn">
 *         <span class="comma-num-akn">1. </span>
 *         <span class="art_text_in_comma">Text...</span>
 *       </div>
 *     </div>
 *   </div>
 */

export interface ParsedProvision {
  provision_ref: string;
  section: string;
  title: string;
  content: string;
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
 * Decode HTML entities commonly found in normattiva text.
 */
function decodeEntities(text: string): string {
  return text
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&agrave;/gi, 'à')
    .replace(/&egrave;/gi, 'è')
    .replace(/&eacute;/gi, 'é')
    .replace(/&igrave;/gi, 'ì')
    .replace(/&ograve;/gi, 'ò')
    .replace(/&ugrave;/gi, 'ù')
    .replace(/&laquo;/gi, '«')
    .replace(/&raquo;/gi, '»')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)));
}

/**
 * Strip HTML tags and normalize whitespace.
 */
function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Clean amendment markers (( )) from normattiva text.
 * These indicate text added/modified by subsequent laws.
 */
function cleanAmendmentMarkers(text: string): string {
  return text
    .replace(/\(\(\s*/g, '')
    .replace(/\s*\)\)/g, '')
    .trim();
}

/**
 * Parse a single article's HTML (from caricaArticolo endpoint) into a provision.
 *
 * Returns null if the HTML doesn't contain a recognizable article.
 */
export function parseArticleHtml(html: string): ParsedProvision | null {
  // Extract the bodyTesto section — use greedy match up to the navigation div
  const bodyStart = html.indexOf('<div class="bodyTesto">');
  if (bodyStart === -1) return null;
  const bodyEnd = html.indexOf('<div class="d-flex', bodyStart);
  const body = bodyEnd > bodyStart
    ? html.substring(bodyStart, bodyEnd)
    : html.substring(bodyStart);

  // Extract article number from article-num-akn
  const numMatch = body.match(/<h2[^>]*class="article-num-akn"[^>]*>([\s\S]*?)<\/h2>/i);
  if (!numMatch) return null;

  const articleLabel = stripHtml(numMatch[1]).trim();
  // Parse "Art. 1", "Art. 1-bis", "Art. 2-ter" etc.
  const artNumMatch = articleLabel.match(/Art\.\s*(\d+(?:-(?:bis|ter|quater|quinquies|sexies|septies|octies|novies|decies|undecies|duodecies|terdecies|quaterdecies|quindecies))?)/i);
  if (!artNumMatch) return null;

  const articleNum = artNumMatch[1];
  const provisionRef = `art${articleNum}`;

  // Extract heading from article-heading-akn
  let heading = '';
  const headingMatch = body.match(/<div[^>]*class="article-heading-akn"[^>]*>([\s\S]*?)<\/div>/i);
  if (headingMatch) {
    heading = cleanAmendmentMarkers(stripHtml(decodeEntities(headingMatch[1])));
    // Remove surrounding parentheses from headings like "(Oggetto)"
    heading = heading.replace(/^\s*\(\s*/, '').replace(/\s*\)\s*\.?\s*$/, '').trim();
  }

  // Extract article text - two possible structures:
  let content = '';

  // Structure 1: art-just-text-akn (short articles, single paragraph)
  const justTextMatch = body.match(/<span[^>]*class="art-just-text-akn"[^>]*>([\s\S]*?)<\/span>/i);
  if (justTextMatch) {
    content = cleanAmendmentMarkers(stripHtml(decodeEntities(justTextMatch[1])));
  }

  // Structure 2: art-commi-div-akn (multi-paragraph articles)
  if (!content) {
    const commiMatch = body.match(/<div[^>]*class="art-commi-div-akn"[^>]*>([\s\S]*)/i);
    if (commiMatch) {
      // Extract each comma (paragraph) individually
      const commaPattern = /<div[^>]*class="art-comma-div-akn"[^>]*>([\s\S]*?)<\/div>/gi;
      const paragraphs: string[] = [];
      let commaMatch2: RegExpExecArray | null;

      while ((commaMatch2 = commaPattern.exec(commiMatch[1])) !== null) {
        const commaHtml = commaMatch2[1];
        const text = cleanAmendmentMarkers(stripHtml(decodeEntities(commaHtml)));
        // Skip empty paragraphs and standalone (( or )) markers
        if (text && text !== '((' && text !== '))' && text.length > 1) {
          paragraphs.push(text);
        }
      }

      content = paragraphs.join(' ');
    }
  }

  // Structure 3: fallback — grab everything in bodyTesto after the article-num heading
  if (!content) {
    const afterNum = body.substring((numMatch.index ?? 0) + numMatch[0].length);
    content = cleanAmendmentMarkers(stripHtml(decodeEntities(afterNum)));
  }

  content = content.replace(/\s+/g, ' ').trim();

  if (!content || content.length < 5) return null;

  return {
    provision_ref: provisionRef,
    section: articleNum,
    title: heading,
    content,
  };
}

/**
 * Parse an article in the older "attachment-just-text" format.
 *
 * Used by historical laws (Regio Decreto, pre-Republic) where the article HTML
 * looks like:
 *   <span class="attachment-just-text">
 *     <div style="text-align:center;"> Art. 85. <br><br> (Capacità d'intendere...) </div>
 *     <br> Nessuno può essere punito... <br>
 *   </span>
 */
export function parseAttachmentArticleHtml(html: string): ParsedProvision | null {
  // Look for attachment-just-text span
  const attachMatch = html.match(/<span[^>]*class="attachment-just-text"[^>]*>([\s\S]*?)<\/span>/i);
  if (!attachMatch) return null;

  const raw = attachMatch[1];

  // Extract article number from centered div: "Art. 85." or "Art. 640-bis."
  const artMatch = raw.match(/Art\.\s*(\d+(?:-(?:bis|ter|quater|quinquies|sexies|septies|octies|novies|decies|undecies|duodecies|terdecies|quaterdecies|quindecies))?)\s*\./i);
  if (!artMatch) return null;

  const articleNum = artMatch[1];
  const provisionRef = `art${articleNum}`;

  // Extract heading from parenthetical in the centered div: "(Capacità d'intendere...)"
  let heading = '';
  const headingMatch = raw.match(/\(([^)]{3,})\)/);
  if (headingMatch) {
    heading = decodeEntities(headingMatch[1]).trim();
  }

  // Extract content: everything after the centered div
  let content = '';
  const centerEnd = raw.indexOf('</div>');
  if (centerEnd > 0) {
    content = raw.substring(centerEnd + 6);
  } else {
    // No centered div, take everything after "Art. N."
    const artEnd = raw.indexOf(artMatch[0]) + artMatch[0].length;
    content = raw.substring(artEnd);
  }

  content = cleanAmendmentMarkers(stripHtml(decodeEntities(content)));
  content = content.replace(/\s+/g, ' ').trim();

  if (!content || content.length < 5) return null;

  return {
    provision_ref: provisionRef,
    section: articleNum,
    title: heading,
    content,
  };
}


/**
 * Parse Italian date "30 giugno 2003" to ISO "2003-06-30"
 */
export function parseItalianDate(dateStr: string): string | null {
  const ITALIAN_MONTHS: Record<string, string> = {
    gennaio: '01', febbraio: '02', marzo: '03', aprile: '04',
    maggio: '05', giugno: '06', luglio: '07', agosto: '08',
    settembre: '09', ottobre: '10', novembre: '11', dicembre: '12',
  };

  const match = dateStr.trim().match(/^(\d{1,2})\s+(gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre)\s+(\d{4})$/i);
  if (!match) return null;

  const day = match[1].padStart(2, '0');
  const month = ITALIAN_MONTHS[match[2].toLowerCase()];
  const year = match[3];

  if (!month) return null;
  return `${year}-${month}-${day}`;
}
