/**
 * HTTP client for normattiva.it with article-by-article fetching
 *
 * Normattiva.it loads legislation via AJAX: the landing page contains a TOC
 * with JavaScript showArticle('/atto/caricaArticolo?...') calls. Each article
 * must be fetched individually from these endpoints.
 *
 * Strategy:
 *   1. Fetch the act landing page to establish a session + get the TOC
 *   2. Extract all caricaArticolo URLs (filter out imUpdate=true historical versions)
 *   3. Fetch each article individually with session cookies
 *   4. Return raw HTML for each article for the parser to process
 */

const USER_AGENT = 'Italian-Law-MCP/1.0 (https://github.com/Ansvar-Systems/italian-law-mcp; hello@ansvar.ai)';
const MIN_DELAY_MS = 150;
const BASE_URL = 'https://www.normattiva.it';

let lastRequestTime = 0;
let sessionCookies: string[] = [];

async function rateLimit(): Promise<void> {
  const now = Date.now();
  const elapsed = now - lastRequestTime;
  if (elapsed < MIN_DELAY_MS) {
    await new Promise(resolve => setTimeout(resolve, MIN_DELAY_MS - elapsed));
  }
  lastRequestTime = Date.now();
}

export interface FetchResult {
  status: number;
  body: string;
  contentType: string;
}

export interface ArticleFetchResult {
  url: string;
  html: string;
  status: number;
}

/**
 * Fetch a URL with rate limiting, session cookies, and retry logic.
 */
async function fetchWithSession(url: string, maxRetries = 3): Promise<FetchResult> {
  await rateLimit();

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const headers: Record<string, string> = {
      'User-Agent': USER_AGENT,
      'Accept': 'text/html, application/xhtml+xml, */*',
      'Accept-Language': 'it-IT,it;q=0.9,en;q=0.1',
    };

    if (sessionCookies.length > 0) {
      headers['Cookie'] = sessionCookies.join('; ');
    }

    const response = await fetch(url, { headers, redirect: 'follow' });

    // Capture set-cookie headers for session management
    const setCookies = response.headers.getSetCookie?.() ?? [];
    for (const sc of setCookies) {
      const name = sc.split('=')[0];
      // Replace existing cookie with same name
      sessionCookies = sessionCookies.filter(c => !c.startsWith(name + '='));
      sessionCookies.push(sc.split(';')[0]);
    }

    if (response.status === 429 || response.status >= 500) {
      if (attempt < maxRetries) {
        const backoff = Math.pow(2, attempt + 1) * 1000;
        console.log(`  HTTP ${response.status} for ${url}, retrying in ${backoff}ms...`);
        await new Promise(resolve => setTimeout(resolve, backoff));
        continue;
      }
    }

    const body = await response.text();
    return {
      status: response.status,
      body,
      contentType: response.headers.get('content-type') ?? '',
    };
  }

  throw new Error(`Failed to fetch ${url} after ${maxRetries} retries`);
}

/**
 * Extract unique article URLs from the landing page HTML.
 *
 * The landing page contains JavaScript calls like:
 *   showArticle('/atto/caricaArticolo?art.versione=4&art.idGruppo=1&...')
 *
 * We filter out URLs with art.imUpdate=true (historical versions) and
 * deduplicate by the (idArticolo, idSottoArticolo) pair, keeping the
 * URL with the highest version number (= current consolidated text).
 */
export function extractArticleUrls(html: string): string[] {
  const urlPattern = /caricaArticolo\?([^'")\s]+)/g;
  const seen = new Map<string, { url: string; version: number }>();

  let match: RegExpExecArray | null;
  while ((match = urlPattern.exec(html)) !== null) {
    const params = match[1];

    // Skip historical versions
    if (params.includes('imUpdate=true')) continue;

    // Extract the article identity key
    const idArticolo = params.match(/art\.idArticolo=(\d+)/)?.[1] ?? '';
    const idSottoArticolo = params.match(/art\.idSottoArticolo=(\d+)/)?.[1] ?? '';
    const version = parseInt(params.match(/art\.versione=(\d+)/)?.[1] ?? '0', 10);
    const key = `${idArticolo}:${idSottoArticolo}`;

    const existing = seen.get(key);
    if (!existing || version > existing.version) {
      // Clean the URL: remove trailing &, extra spaces
      const cleanParams = params.replace(/&$/, '').replace(/ /g, '%20');
      seen.set(key, {
        url: `${BASE_URL}/atto/caricaArticolo?${cleanParams}`,
        version,
      });
    }
  }

  // Return URLs sorted by idArticolo then idSottoArticolo (natural order)
  return [...seen.entries()]
    .sort((a, b) => {
      const [aArt, aSub] = a[0].split(':').map(Number);
      const [bArt, bSub] = b[0].split(':').map(Number);
      return aArt - bArt || aSub - bSub;
    })
    .map(([, v]) => v.url);
}

/**
 * Fetch an act landing page from normattiva.it to establish session and get TOC.
 */
export async function fetchNormattivaAct(urn: string): Promise<FetchResult> {
  const url = `${BASE_URL}/uri-res/N2Ls?${urn}`;
  return fetchWithSession(url);
}

/**
 * Fetch all articles for a given act, article by article.
 *
 * Returns the list of successfully fetched articles. Logs failures but
 * continues (some articles may be placeholders or headings-only).
 */
export async function fetchAllArticles(urn: string): Promise<ArticleFetchResult[]> {
  // Reset session for each act
  sessionCookies = [];

  // Step 1: Fetch landing page (establishes session, gets TOC)
  console.log(`  Fetching landing page for ${urn}...`);
  const landing = await fetchWithSession(`${BASE_URL}/uri-res/N2Ls?${urn}`);
  if (landing.status !== 200) {
    throw new Error(`Landing page returned HTTP ${landing.status}`);
  }

  // Step 2: Extract article URLs
  const articleUrls = extractArticleUrls(landing.body);
  console.log(`  Found ${articleUrls.length} articles to fetch`);

  if (articleUrls.length === 0) {
    return [];
  }

  // Step 3: Fetch articles in concurrent batches of 4
  const results: ArticleFetchResult[] = [];
  let fetched = 0;
  let failed = 0;
  const ARTICLE_CONCURRENCY = 4;

  for (let i = 0; i < articleUrls.length; i += ARTICLE_CONCURRENCY) {
    const batch = articleUrls.slice(i, i + ARTICLE_CONCURRENCY);
    const batchResults = await Promise.all(batch.map(async (url) => {
      try {
        const result = await fetchWithSession(url);
        if (result.status === 200 && result.body.length > 100) {
          return { url, html: result.body, status: result.status } as ArticleFetchResult;
        }
        return null;
      } catch (err) {
        return null;
      }
    }));

    for (const r of batchResults) {
      if (r) results.push(r);
      else failed++;
      fetched++;
    }

    if (fetched % 50 < ARTICLE_CONCURRENCY) {
      console.log(`    Progress: ${fetched}/${articleUrls.length} fetched, ${failed} failed`);
    }
  }

  console.log(`  Fetched ${results.length} articles (${failed} failed) for ${urn}`);
  return results;
}
