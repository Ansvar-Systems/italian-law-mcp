#!/usr/bin/env tsx
/**
 * Census script for Italian Law MCP.
 *
 * Enumerates ALL legislation from normattiva.it by crawling the chronological
 * listing (/ricerca/elencoPerData/anno/YYYY) for each year from 1946 to present.
 *
 * Pre-Republic acts (codici, key royal decrees) are added from a curated list.
 *
 * Writes data/census.json in golden standard format.
 *
 * Usage:
 *   npx tsx scripts/census.ts                    # Full census (1946–present)
 *   npx tsx scripts/census.ts --from 2020        # Census from 2020 only
 *   npx tsx scripts/census.ts --resume           # Resume from last saved year
 *   npx tsx scripts/census.ts --pre-republic     # Include pre-Republic acts
 *
 * Data sourced from normattiva.it (Italian Government Open Data).
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { buildNormattivaUrn, parseItalianDate } from './lib/parser.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.resolve(__dirname, '../data');
const CENSUS_PATH = path.join(DATA_DIR, 'census.json');

const USER_AGENT = 'Italian-Law-MCP/1.0 (https://github.com/Ansvar-Systems/italian-law-mcp; hello@ansvar.ai)';
const BASE_URL = 'https://www.normattiva.it';
const MIN_DELAY_MS = 800;
const FIRST_REPUBLIC_YEAR = 1946;
const CURRENT_YEAR = new Date().getFullYear();

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface CensusLaw {
  id: string;
  title: string;
  type: string;
  number: number;
  year: number;
  date: string;
  urn: string;
  url: string;
  codice_redazionale: string;
  category: string;
  classification: 'ingestable' | 'excluded' | 'pre_republic';
  exclusion_reason?: string;
  ingested: boolean;
  provision_count: number;
  ingestion_date: string | null;
}

interface CensusSummary {
  total_laws: number;
  ingestable: number;
  excluded: number;
  pre_republic: number;
  ingested: number;
  by_type: Array<{
    type: string;
    type_label: string;
    total: number;
    ingestable: number;
    excluded: number;
  }>;
}

interface CensusFile {
  schema_version: string;
  jurisdiction: string;
  jurisdiction_name: string;
  portal: string;
  census_date: string;
  agent: string;
  year_range: { from: number; to: number };
  summary: CensusSummary;
  laws: CensusLaw[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Italian legislation type mapping
// ─────────────────────────────────────────────────────────────────────────────

/** Map from display name (on Normattiva pages) to internal type code */
const TYPE_MAP: Record<string, { code: string; urnType: string; label: string }> = {
  'LEGGE': { code: 'legge', urnType: 'legge', label: 'Legge' },
  'LEGGE COSTITUZIONALE': { code: 'lc', urnType: 'legge.costituzionale', label: 'Legge Costituzionale' },
  'DECRETO LEGISLATIVO': { code: 'dlgs', urnType: 'decreto.legislativo', label: 'Decreto Legislativo' },
  'DECRETO-LEGGE': { code: 'dl', urnType: 'decreto-legge', label: 'Decreto-Legge' },
  'DECRETO DEL PRESIDENTE DELLA REPUBBLICA': { code: 'dpr', urnType: 'decreto.del.presidente.della.repubblica', label: 'D.P.R.' },
  'DECRETO DEL PRESIDENTE DEL CONSIGLIO DEI MINISTRI': { code: 'dpcm', urnType: 'decreto.del.presidente.del.consiglio.dei.ministri', label: 'D.P.C.M.' },
  'REGIO DECRETO': { code: 'rd', urnType: 'regio.decreto', label: 'Regio Decreto' },
  'REGIO DECRETO-LEGGE': { code: 'rdl', urnType: 'regio.decreto-legge', label: 'R.D.L.' },
  'REGIO DECRETO LEGISLATIVO': { code: 'rdlgs', urnType: 'regio.decreto.legislativo', label: 'R.D.Lgs.' },
  'DECRETO': { code: 'decreto', urnType: 'decreto', label: 'Decreto' },
  'DECRETO LEGISLATIVO DEL CAPO PROVVISORIO DELLO STATO': { code: 'dlcps', urnType: 'decreto.legislativo.del.capo.provvisorio.dello.stato', label: 'D.L.C.P.S.' },
  'DECRETO LEGISLATIVO LUOGOTENENZIALE': { code: 'dll', urnType: 'decreto.legislativo.luogotenenziale', label: 'D.L.L.' },
  'DECRETO LUOGOTENENZIALE': { code: 'dluo', urnType: 'decreto.luogotenenziale', label: 'D.Luo.' },
  'DECRETO DEL CAPO DEL GOVERNO': { code: 'dcg', urnType: 'decreto.del.capo.del.governo', label: 'D.C.G.' },
  'COSTITUZIONE': { code: 'cost', urnType: 'costituzione', label: 'Costituzione' },
  'DELIBERAZIONE': { code: 'del', urnType: 'deliberazione', label: 'Deliberazione' },
  'ORDINANZA': { code: 'ord', urnType: 'ordinanza', label: 'Ordinanza' },
  'REGOLAMENTO': { code: 'reg', urnType: 'regolamento', label: 'Regolamento' },
};

/**
 * Types to include in census. We focus on the core legislation types.
 * DPR is included but many are administrative — we ingest them anyway.
 */
const INCLUDED_TYPES = new Set([
  'LEGGE',
  'LEGGE COSTITUZIONALE',
  'DECRETO LEGISLATIVO',
  'DECRETO-LEGGE',
  'DECRETO DEL PRESIDENTE DELLA REPUBBLICA',
  'DECRETO DEL PRESIDENTE DEL CONSIGLIO DEI MINISTRI',
  'REGIO DECRETO',
  'REGIO DECRETO-LEGGE',
  'REGIO DECRETO LEGISLATIVO',
  'DECRETO',
  'DECRETO LEGISLATIVO DEL CAPO PROVVISORIO DELLO STATO',
  'DECRETO LEGISLATIVO LUOGOTENENZIALE',
  'DECRETO LUOGOTENENZIALE',
  'DECRETO DEL CAPO DEL GOVERNO',
  'COSTITUZIONE',
  'DELIBERAZIONE',
  'ORDINANZA',
  'REGOLAMENTO',
]);

// ─────────────────────────────────────────────────────────────────────────────
// Pre-Republic acts (important historical legislation still in force)
// ─────────────────────────────────────────────────────────────────────────────

const PRE_REPUBLIC_ACTS: CensusLaw[] = [
  {
    id: 'rd-262-1942',
    title: 'Codice Civile',
    type: 'rd',
    number: 262,
    year: 1942,
    date: '1942-03-16',
    urn: 'urn:nir:stato:regio.decreto:1942-03-16;262',
    url: 'https://www.normattiva.it/uri-res/N2Ls?urn:nir:stato:regio.decreto:1942-03-16;262',
    codice_redazionale: '',
    category: 'Codici',
    classification: 'pre_republic',
    ingested: false,
    provision_count: 0,
    ingestion_date: null,
  },
  {
    id: 'rd-1398-1930',
    title: 'Codice Penale',
    type: 'rd',
    number: 1398,
    year: 1930,
    date: '1930-10-19',
    urn: 'urn:nir:stato:regio.decreto:1930-10-19;1398',
    url: 'https://www.normattiva.it/uri-res/N2Ls?urn:nir:stato:regio.decreto:1930-10-19;1398',
    codice_redazionale: '',
    category: 'Codici',
    classification: 'pre_republic',
    ingested: false,
    provision_count: 0,
    ingestion_date: null,
  },
  {
    id: 'rd-1443-1930',
    title: 'Codice di Procedura Penale (1930)',
    type: 'rd',
    number: 1443,
    year: 1930,
    date: '1930-10-19',
    urn: 'urn:nir:stato:regio.decreto:1930-10-19;1443',
    url: 'https://www.normattiva.it/uri-res/N2Ls?urn:nir:stato:regio.decreto:1930-10-19;1443',
    codice_redazionale: '',
    category: 'Codici',
    classification: 'pre_republic',
    ingested: false,
    provision_count: 0,
    ingestion_date: null,
  },
  {
    id: 'rd-1326-1942',
    title: 'Codice della Navigazione',
    type: 'rd',
    number: 1326,
    year: 1942,
    date: '1942-03-30',
    urn: 'urn:nir:stato:regio.decreto:1942-03-30;1326',
    url: 'https://www.normattiva.it/uri-res/N2Ls?urn:nir:stato:regio.decreto:1942-03-30;1326',
    codice_redazionale: '',
    category: 'Codici',
    classification: 'pre_republic',
    ingested: false,
    provision_count: 0,
    ingestion_date: null,
  },
  {
    id: 'rd-267-1942',
    title: 'Disposizioni per l\'attuazione del Codice civile e disposizioni transitorie',
    type: 'rd',
    number: 267,
    year: 1942,
    date: '1942-03-30',
    urn: 'urn:nir:stato:regio.decreto:1942-03-30;267',
    url: 'https://www.normattiva.it/uri-res/N2Ls?urn:nir:stato:regio.decreto:1942-03-30;267',
    codice_redazionale: '',
    category: 'Codici',
    classification: 'pre_republic',
    ingested: false,
    provision_count: 0,
    ingestion_date: null,
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// HTTP client with rate limiting and session
// ─────────────────────────────────────────────────────────────────────────────

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

async function fetchPage(url: string, maxRetries = 3): Promise<string> {
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
      sessionCookies = sessionCookies.filter(c => !c.startsWith(name + '='));
      sessionCookies.push(sc.split(';')[0]);
    }

    if (response.status === 429 || response.status >= 500) {
      if (attempt < maxRetries) {
        const backoff = Math.pow(2, attempt + 1) * 1000;
        console.log(`  HTTP ${response.status}, retrying in ${backoff}ms...`);
        await new Promise(resolve => setTimeout(resolve, backoff));
        continue;
      }
    }

    if (response.status !== 200) {
      throw new Error(`HTTP ${response.status} for ${url}`);
    }

    return await response.text();
  }

  throw new Error(`Failed to fetch ${url} after ${maxRetries} retries`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Parse chronological listing page
// ─────────────────────────────────────────────────────────────────────────────

interface RawActEntry {
  codice_redazionale: string;
  data_pubblicazione: string;
  tipo_display: string;
  date_text: string;
  number: number;
  description: string;
}

const ITALIAN_MONTHS: Record<string, string> = {
  gennaio: '01', febbraio: '02', marzo: '03', aprile: '04',
  maggio: '05', giugno: '06', luglio: '07', agosto: '08',
  settembre: '09', ottobre: '10', novembre: '11', dicembre: '12',
};

/**
 * Parse a single act entry from the chronological listing HTML.
 *
 * Structure:
 *   <div id="collapseDiv_N" ...>
 *     <a ...href="/atto/caricaDettaglioAtto?atto.dataPubblicazioneGazzetta=...&atto.codiceRedazionale=...">
 *       TIPO DD mese YYYY,
 *       n. NNN
 *     </a>
 *     <p>[Description...]</p>
 *     <span class="DateGU">(GU n. ... del DD-MM-YYYY)</span>
 *   </div>
 */
function parseYearPage(html: string): RawActEntry[] {
  const entries: RawActEntry[] = [];

  // Match each collapse div containing an act entry
  const entryPattern = /<div\s+id="collapseDiv_\d+"[^>]*>[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/g;
  let entryMatch: RegExpExecArray | null;

  while ((entryMatch = entryPattern.exec(html)) !== null) {
    const block = entryMatch[0];

    // Extract codiceRedazionale and dataPubblicazioneGazzetta from the link
    const codiceMatch = block.match(/codiceRedazionale=([^&"]+)/);
    const dataPubMatch = block.match(/dataPubblicazioneGazzetta=([^&"]+)/);
    if (!codiceMatch) continue;

    const codice_redazionale = codiceMatch[1];
    const data_pubblicazione = dataPubMatch?.[1] ?? '';

    // Extract the act type and date from the link text
    // Pattern: TYPE DD Month YYYY, n. NNN
    const linkTextMatch = block.match(
      /class="font-weight-semibold"[\s\S]*?>([\s\S]*?)<\/a>/
    );
    if (!linkTextMatch) continue;

    const linkText = linkTextMatch[1]
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    // Parse: "DECRETO LEGISLATIVO 27 Dicembre 2024, n. 209"
    const actMatch = linkText.match(
      /^([\w\s'-]+?)\s+(\d{1,2})\s+(Gennaio|Febbraio|Marzo|Aprile|Maggio|Giugno|Luglio|Agosto|Settembre|Ottobre|Novembre|Dicembre)\s+(\d{4})\s*,?\s*n\.\s*(\d+)/i
    );

    if (!actMatch) continue;

    const tipo_display = actMatch[1].trim().toUpperCase();
    const day = actMatch[2].padStart(2, '0');
    const monthName = actMatch[3].toLowerCase();
    const year = actMatch[4];
    const number = parseInt(actMatch[5], 10);
    const month = ITALIAN_MONTHS[monthName];

    if (!month || isNaN(number)) continue;

    const date_text = `${year}-${month}-${day}`;

    // Extract description from the paragraph after the link
    let description = '';
    const descMatch = block.match(/<p>\s*\[([\s\S]*?)\]\s*<\/p>/);
    if (descMatch) {
      description = descMatch[1]
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .replace(/\([^)]*\)\s*$/, '') // Remove trailing GU reference code
        .replace(/&agrave;/gi, 'à')
        .replace(/&egrave;/gi, 'è')
        .replace(/&eacute;/gi, 'é')
        .replace(/&igrave;/gi, 'ì')
        .replace(/&ograve;/gi, 'ò')
        .replace(/&ugrave;/gi, 'ù')
        .replace(/&laquo;/gi, '«')
        .replace(/&raquo;/gi, '»')
        .replace(/&amp;/gi, '&')
        .replace(/&nbsp;/gi, ' ')
        .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)))
        .trim();
    }

    entries.push({
      codice_redazionale,
      data_pubblicazione,
      tipo_display,
      date_text,
      number,
      description,
    });
  }

  return entries;
}

/**
 * Extract total results count from the listing page.
 * Handles both "222" and "1.265" number formats.
 */
function extractTotalCount(html: string): number {
  const match = html.match(/Sono stati trovati\s+([\d.]+)\s+atti/);
  if (!match) return 0;
  return parseInt(match[1].replace(/\./g, ''), 10);
}

/**
 * Extract pagination URLs from the listing page.
 */
function extractPaginationUrls(html: string): string[] {
  const urls: string[] = [];
  const pattern = /href="(\/ricerca\/elencoPerData\/\d+)"/g;
  let match: RegExpExecArray | null;
  const seen = new Set<string>();

  while ((match = pattern.exec(html)) !== null) {
    const url = match[1];
    if (!seen.has(url)) {
      seen.add(url);
      urls.push(url);
    }
  }

  return urls;
}

// ─────────────────────────────────────────────────────────────────────────────
// Census logic
// ─────────────────────────────────────────────────────────────────────────────

function buildId(typeCode: string, number: number, year: number): string {
  return `${typeCode}-${number}-${year}`;
}

function classifyAct(tipo_display: string): { classification: 'ingestable' | 'excluded'; reason?: string } {
  if (!INCLUDED_TYPES.has(tipo_display)) {
    // Check for partial matches (some types have extra text)
    for (const included of INCLUDED_TYPES) {
      if (tipo_display.startsWith(included)) {
        return { classification: 'ingestable' };
      }
    }
    return { classification: 'excluded', reason: `Unknown act type: ${tipo_display}` };
  }
  return { classification: 'ingestable' };
}

function resolveType(tipo_display: string): { code: string; urnType: string; label: string } | null {
  // Exact match first
  if (TYPE_MAP[tipo_display]) return TYPE_MAP[tipo_display];

  // Prefix match
  for (const [key, value] of Object.entries(TYPE_MAP)) {
    if (tipo_display.startsWith(key)) return value;
  }

  return null;
}

async function fetchYearActs(year: number): Promise<RawActEntry[]> {
  // Reset session for each year to avoid stale cookies
  sessionCookies = [];

  console.log(`[census] Fetching year ${year}...`);

  // Fetch first page
  const firstPageHtml = await fetchPage(`${BASE_URL}/ricerca/elencoPerData/anno/${year}`);
  const totalCount = extractTotalCount(firstPageHtml);
  const firstPageEntries = parseYearPage(firstPageHtml);

  console.log(`[census]   ${totalCount} total acts, ${firstPageEntries.length} on first page`);

  const allEntries = [...firstPageEntries];

  // If there are more pages, fetch them
  if (totalCount > firstPageEntries.length) {
    const paginationUrls = extractPaginationUrls(firstPageHtml);
    // Filter out "Successiva" which points to the same URL as page 2
    // We only need unique page URLs after the first page
    const uniquePageUrls = [...new Set(paginationUrls)];

    // Calculate how many pages we need
    const perPage = firstPageEntries.length || 20;
    const totalPages = Math.ceil(totalCount / perPage);

    console.log(`[census]   ${totalPages} pages total, fetching remaining...`);

    // Fetch pages 2..N (pages are 0-indexed in the URL: /0 = page 2, /1 = page 3, etc.)
    for (let pageIdx = 0; pageIdx < totalPages - 1; pageIdx++) {
      const pageUrl = `${BASE_URL}/ricerca/elencoPerData/${pageIdx}`;
      try {
        const pageHtml = await fetchPage(pageUrl);
        const pageEntries = parseYearPage(pageHtml);
        allEntries.push(...pageEntries);

        if (pageEntries.length === 0) {
          console.log(`[census]   Page ${pageIdx + 2}: empty, stopping pagination`);
          break;
        }

        if ((pageIdx + 1) % 10 === 0) {
          console.log(`[census]   Fetched page ${pageIdx + 2}/${totalPages} (${allEntries.length} entries so far)`);
        }
      } catch (err) {
        console.log(`[census]   Page ${pageIdx + 2} failed: ${err instanceof Error ? err.message : err}`);
        break;
      }
    }
  }

  console.log(`[census]   Parsed ${allEntries.length} entries for year ${year}`);
  return allEntries;
}

// ─────────────────────────────────────────────────────────────────────────────
// CLI
// ─────────────────────────────────────────────────────────────────────────────

function parseArgs(): { fromYear: number; resume: boolean; preRepublic: boolean } {
  const args = process.argv.slice(2);
  let fromYear = FIRST_REPUBLIC_YEAR;
  let resume = false;
  let preRepublic = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--from' && args[i + 1]) {
      fromYear = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === '--resume') {
      resume = true;
    } else if (args[i] === '--pre-republic') {
      preRepublic = true;
    }
  }

  return { fromYear, resume, preRepublic };
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const { fromYear, resume, preRepublic } = parseArgs();

  fs.mkdirSync(DATA_DIR, { recursive: true });

  // Load existing census if resuming
  let existingLaws: Map<string, CensusLaw> = new Map();
  const processedYears = new Set<number>();

  if (resume && fs.existsSync(CENSUS_PATH)) {
    const existing = JSON.parse(fs.readFileSync(CENSUS_PATH, 'utf-8')) as CensusFile;
    for (const law of existing.laws) {
      existingLaws.set(law.id, law);
      if (law.classification !== 'pre_republic') {
        processedYears.add(law.year);
      }
    }
    console.log(`[census] Resuming with ${existingLaws.size} laws, ${processedYears.size} years already processed`);
  }

  const endYear = CURRENT_YEAR;
  const startYear = resume ? Math.max(fromYear, lastProcessedYear + 1) : fromYear;
  const allLaws: Map<string, CensusLaw> = new Map(existingLaws);
  const typeStats = new Map<string, { total: number; ingestable: number; excluded: number }>();

  // Add pre-Republic acts
  if (preRepublic || existingLaws.size === 0) {
    for (const act of PRE_REPUBLIC_ACTS) {
      if (!allLaws.has(act.id)) {
        allLaws.set(act.id, act);
      }
    }
    console.log(`[census] Added ${PRE_REPUBLIC_ACTS.length} pre-Republic acts`);
  }

  // Build year list — go from newest to oldest (most relevant first)
  const years: number[] = [];
  for (let y = endYear; y >= startYear; y--) {
    years.push(y);
  }

  // Process each year (newest first)
  for (const year of years) {
    // Skip years already processed when resuming
    if (resume && processedYears.has(year)) {
      continue;
    }

    try {
      const entries = await fetchYearActs(year);

      let yearIngestable = 0;
      let yearExcluded = 0;

      for (const entry of entries) {
        const typeInfo = resolveType(entry.tipo_display);
        const { classification, reason } = classifyAct(entry.tipo_display);

        const typeCode = typeInfo?.code ?? entry.tipo_display.toLowerCase().replace(/\s+/g, '_');
        const id = buildId(typeCode, entry.number, parseInt(entry.date_text.substring(0, 4), 10));

        // Skip if we already have this act
        if (allLaws.has(id)) continue;

        const urnType = typeInfo?.urnType ?? typeCode;
        const urn = `urn:nir:stato:${urnType}:${entry.date_text};${entry.number}`;
        const url = `${BASE_URL}/uri-res/N2Ls?${urn}`;

        const title = entry.description || `${typeInfo?.label ?? entry.tipo_display} ${entry.date_text}, n. ${entry.number}`;

        const law: CensusLaw = {
          id,
          title,
          type: typeCode,
          number: entry.number,
          year: parseInt(entry.date_text.substring(0, 4), 10),
          date: entry.date_text,
          urn,
          url,
          codice_redazionale: entry.codice_redazionale,
          category: typeInfo?.label ?? entry.tipo_display,
          classification,
          ingested: false,
          provision_count: 0,
          ingestion_date: null,
        };

        if (reason) {
          law.exclusion_reason = reason;
        }

        allLaws.set(id, law);

        if (classification === 'ingestable') yearIngestable++;
        else yearExcluded++;

        // Track type stats
        const typeKey = typeInfo?.label ?? entry.tipo_display;
        const stat = typeStats.get(typeKey) ?? { total: 0, ingestable: 0, excluded: 0 };
        stat.total++;
        if (classification === 'ingestable') stat.ingestable++;
        else stat.excluded++;
        typeStats.set(typeKey, stat);
      }

      console.log(`[census]   Year ${year}: ${yearIngestable} ingestable, ${yearExcluded} excluded (running total: ${allLaws.size})`);

      // Save progress after each year
      saveCensus(allLaws, startYear, year);

    } catch (err) {
      console.log(`[census] ERROR for year ${year}: ${err instanceof Error ? err.message : err}`);
      // Save progress and continue
      saveCensus(allLaws, startYear, year - 1);
    }
  }

  // Final save
  saveCensus(allLaws, fromYear, endYear);

  // Print summary
  const laws = Array.from(allLaws.values());
  const ingestable = laws.filter(l => l.classification === 'ingestable').length;
  const excluded = laws.filter(l => l.classification === 'excluded').length;
  const preRep = laws.filter(l => l.classification === 'pre_republic').length;

  console.log(`\n[census] Census complete:`);
  console.log(`  Total laws: ${laws.length}`);
  console.log(`  Ingestable: ${ingestable}`);
  console.log(`  Excluded:   ${excluded}`);
  console.log(`  Pre-Republic: ${preRep}`);

  for (const [type, stat] of typeStats.entries()) {
    console.log(`  ${type}: ${stat.total} total, ${stat.ingestable} ingestable, ${stat.excluded} excluded`);
  }

  console.log(`\n[census] Written to ${CENSUS_PATH}`);
}

function saveCensus(allLaws: Map<string, CensusLaw>, fromYear: number, toYear: number): void {
  const laws = Array.from(allLaws.values());

  // Build type stats
  const typeMap = new Map<string, { type: string; label: string; total: number; ingestable: number; excluded: number }>();
  for (const law of laws) {
    const key = law.type;
    const stat = typeMap.get(key) ?? {
      type: law.type,
      label: law.category,
      total: 0,
      ingestable: 0,
      excluded: 0,
    };
    stat.total++;
    if (law.classification === 'excluded') stat.excluded++;
    else stat.ingestable++;
    typeMap.set(key, stat);
  }

  const ingestable = laws.filter(l => l.classification !== 'excluded').length;
  const excluded = laws.filter(l => l.classification === 'excluded').length;
  const preRepublic = laws.filter(l => l.classification === 'pre_republic').length;
  const ingested = laws.filter(l => l.ingested).length;

  const census: CensusFile = {
    schema_version: '1.0',
    jurisdiction: 'IT',
    jurisdiction_name: 'Italy',
    portal: 'https://www.normattiva.it',
    census_date: new Date().toISOString().slice(0, 10),
    agent: 'census.ts',
    year_range: { from: fromYear, to: toYear },
    summary: {
      total_laws: laws.length,
      ingestable,
      excluded,
      pre_republic: preRepublic,
      ingested,
      by_type: Array.from(typeMap.values()).sort((a, b) => b.total - a.total),
    },
    laws: laws.sort((a, b) => {
      // Sort by year desc, then by number desc
      if (a.year !== b.year) return b.year - a.year;
      return b.number - a.number;
    }),
  };

  fs.writeFileSync(CENSUS_PATH, JSON.stringify(census, null, 2), 'utf-8');
}

main().catch(err => {
  console.error('[census] Fatal error:', err);
  process.exit(1);
});
