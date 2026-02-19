/**
 * Rate-limited HTTP client for normattiva.it
 *
 * - 500ms minimum delay between requests (normattiva.it is slower)
 * - User-Agent header identifying the MCP
 * - Handles HTML responses
 * - No auth needed (Italian legislation is public domain)
 */

const USER_AGENT = 'Italian-Law-MCP/1.0 (https://github.com/Ansvar-Systems/italian-law-mcp; hello@ansvar.ai)';
const MIN_DELAY_MS = 500;

let lastRequestTime = 0;

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

/**
 * Fetch a URL with rate limiting and proper headers.
 * Retries up to 3 times on 429/5xx errors with exponential backoff.
 */
export async function fetchWithRateLimit(url: string, maxRetries = 3): Promise<FetchResult> {
  await rateLimit();

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const response = await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'text/html, application/xhtml+xml, */*',
        'Accept-Language': 'it-IT,it;q=0.9,en;q=0.1',
      },
    });

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
 * Fetch the act text page from normattiva.it using URN format.
 * URN: urn:nir:stato:decreto.legislativo:2003-06-30;196
 */
export async function fetchNormattivaAct(urn: string): Promise<FetchResult> {
  const url = `https://www.normattiva.it/uri-res/N2Ls?${urn}`;
  return fetchWithRateLimit(url);
}

/**
 * Fetch a specific article from normattiva.it.
 * Example URN: urn:nir:stato:decreto.legislativo:2003-06-30;196~art1
 */
export async function fetchNormattivaArticle(urn: string): Promise<FetchResult> {
  const url = `https://www.normattiva.it/uri-res/N2Ls?${urn}`;
  return fetchWithRateLimit(url);
}

/**
 * Fetch the table of contents for a normattiva act.
 */
export async function fetchNormattivaToc(actUrn: string): Promise<FetchResult> {
  const url = `https://www.normattiva.it/uri-res/N2Ls?${actUrn}~titoloTOC`;
  return fetchWithRateLimit(url);
}
