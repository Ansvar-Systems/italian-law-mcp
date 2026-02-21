#!/usr/bin/env tsx
/**
 * Italian Law MCP — Ingestion Pipeline
 *
 * Article-by-article ingestion from normattiva.it:
 *   1. For each key law, fetch the landing page to get session + TOC
 *   2. Extract individual article URLs from the TOC
 *   3. Fetch each article via the caricaArticolo AJAX endpoint
 *   4. Parse AKN HTML to extract article number, heading, and text
 *   5. Write seed JSON files for build-db.ts
 *
 * Usage:
 *   npm run ingest                    # Full ingestion
 *   npm run ingest -- --limit 5       # Test with 5 acts
 *   npm run ingest -- --force         # Re-fetch even if seed exists
 *
 * Data is sourced from normattiva.it (Italian Government Open Data).
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { fetchAllArticles } from './lib/fetcher.js';
import { parseArticleHtml, parseAttachmentArticleHtml, buildNormattivaUrn, type ActIndexEntry, type ParsedAct } from './lib/parser.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SEED_DIR = path.resolve(__dirname, '../data/seed');

// ─────────────────────────────────────────────────────────────────────────────
// Known key Italian laws for cybersecurity/data protection/compliance scope
// ─────────────────────────────────────────────────────────────────────────────

const KEY_LAWS: ActIndexEntry[] = [
  {
    title: 'Codice in materia di protezione dei dati personali (Codice Privacy)',
    type: 'dlgs', number: 196, year: 2003, date: '2003-06-30',
    urn: 'urn:nir:stato:decreto.legislativo:2003-06-30;196',
    url: 'https://www.normattiva.it/uri-res/N2Ls?urn:nir:stato:decreto.legislativo:2003-06-30;196',
    updated: '',
  },
  {
    title: 'Adeguamento al Regolamento (UE) 2016/679 (GDPR alignment)',
    type: 'dlgs', number: 101, year: 2018, date: '2018-08-10',
    urn: 'urn:nir:stato:decreto.legislativo:2018-08-10;101',
    url: 'https://www.normattiva.it/uri-res/N2Ls?urn:nir:stato:decreto.legislativo:2018-08-10;101',
    updated: '',
  },
  {
    title: 'Attuazione della direttiva (UE) 2022/2555 (NIS2)',
    type: 'dlgs', number: 138, year: 2024, date: '2024-09-04',
    urn: 'urn:nir:stato:decreto.legislativo:2024-09-04;138',
    url: 'https://www.normattiva.it/uri-res/N2Ls?urn:nir:stato:decreto.legislativo:2024-09-04;138',
    updated: '',
  },
  {
    title: 'Codice Penale',
    type: 'rd', number: 1398, year: 1930, date: '1930-10-19',
    urn: 'urn:nir:stato:regio.decreto:1930-10-19;1398',
    url: 'https://www.normattiva.it/uri-res/N2Ls?urn:nir:stato:regio.decreto:1930-10-19;1398',
    updated: '',
  },
  {
    title: 'Codice Civile',
    type: 'rd', number: 262, year: 1942, date: '1942-03-16',
    urn: 'urn:nir:stato:regio.decreto:1942-03-16;262',
    url: 'https://www.normattiva.it/uri-res/N2Ls?urn:nir:stato:regio.decreto:1942-03-16;262',
    updated: '',
  },
  {
    title: "Codice dell'Amministrazione Digitale (CAD)",
    type: 'dlgs', number: 82, year: 2005, date: '2005-03-07',
    urn: 'urn:nir:stato:decreto.legislativo:2005-03-07;82',
    url: 'https://www.normattiva.it/uri-res/N2Ls?urn:nir:stato:decreto.legislativo:2005-03-07;82',
    updated: '',
  },
  {
    title: 'Disciplina della responsabilità amministrativa delle persone giuridiche (D.Lgs. 231/2001)',
    type: 'dlgs', number: 231, year: 2001, date: '2001-06-08',
    urn: 'urn:nir:stato:decreto.legislativo:2001-06-08;231',
    url: 'https://www.normattiva.it/uri-res/N2Ls?urn:nir:stato:decreto.legislativo:2001-06-08;231',
    updated: '',
  },
  {
    title: 'Attuazione della direttiva 2000/31/CE (Commercio elettronico)',
    type: 'dlgs', number: 70, year: 2003, date: '2003-04-09',
    urn: 'urn:nir:stato:decreto.legislativo:2003-04-09;70',
    url: 'https://www.normattiva.it/uri-res/N2Ls?urn:nir:stato:decreto.legislativo:2003-04-09;70',
    updated: '',
  },
  {
    title: 'Codice del consumo (Consumer Code)',
    type: 'dlgs', number: 206, year: 2005, date: '2005-09-06',
    urn: 'urn:nir:stato:decreto.legislativo:2005-09-06;206',
    url: 'https://www.normattiva.it/uri-res/N2Ls?urn:nir:stato:decreto.legislativo:2005-09-06;206',
    updated: '',
  },
  {
    title: 'Disposizioni in materia di perimetro di sicurezza nazionale cibernetica',
    type: 'dl', number: 105, year: 2019, date: '2019-09-21',
    urn: 'urn:nir:stato:decreto-legge:2019-09-21;105',
    url: 'https://www.normattiva.it/uri-res/N2Ls?urn:nir:stato:decreto-legge:2019-09-21;105',
    updated: '',
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// CLI argument parsing
// ─────────────────────────────────────────────────────────────────────────────

function parseArgs(): { limit: number | null; force: boolean } {
  const args = process.argv.slice(2);
  let limit: number | null = null;
  let force = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--limit' && args[i + 1]) {
      limit = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === '--force') {
      force = true;
    }
  }

  return { limit, force };
}

// ─────────────────────────────────────────────────────────────────────────────
// Main ingestion
// ─────────────────────────────────────────────────────────────────────────────

async function ingestAct(act: ActIndexEntry): Promise<{ provisions: number; failed: boolean }> {
  const seedFile = path.join(SEED_DIR, `${act.type}_${act.number}_${act.year}.json`);

  try {
    // Fetch all articles for this act
    const articles = await fetchAllArticles(act.urn);

    if (articles.length === 0) {
      console.log(`    WARNING: No articles fetched, writing empty seed`);
      const emptySeed: ParsedAct = {
        id: `${act.type}-${act.number}-${act.year}`,
        type: act.type,
        title: act.title,
        short_name: act.title,
        status: 'in_force',
        issued_date: act.date,
        url: act.url,
        provisions: [],
      };
      fs.writeFileSync(seedFile, JSON.stringify(emptySeed, null, 2));
      return { provisions: 0, failed: true };
    }

    // Parse each article
    const provisions: Array<{ provision_ref: string; section: string; title: string; content: string }> = [];
    const seenRefs = new Set<string>();

    for (const article of articles) {
      // Try AKN parser first (modern laws), then attachment parser (historical laws)
      const parsed = parseArticleHtml(article.html) ?? parseAttachmentArticleHtml(article.html);
      if (parsed && !seenRefs.has(parsed.provision_ref)) {
        provisions.push(parsed);
        seenRefs.add(parsed.provision_ref);
      }
    }

    const seed: ParsedAct = {
      id: `${act.type}-${act.number}-${act.year}`,
      type: act.type,
      title: act.title,
      short_name: act.title,
      status: 'in_force',
      issued_date: act.date,
      url: act.url,
      provisions,
    };

    fs.writeFileSync(seedFile, JSON.stringify(seed, null, 2));
    console.log(`    OK: ${provisions.length} provisions from ${articles.length} fetched articles`);
    return { provisions: provisions.length, failed: false };

  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.log(`    ERROR: ${msg}`);

    // Write empty seed so we don't block the build
    const emptySeed: ParsedAct = {
      id: `${act.type}-${act.number}-${act.year}`,
      type: act.type,
      title: act.title,
      short_name: act.title,
      status: 'in_force',
      issued_date: act.date,
      url: act.url,
      provisions: [],
    };
    fs.writeFileSync(seedFile, JSON.stringify(emptySeed, null, 2));
    return { provisions: 0, failed: true };
  }
}

async function main(): Promise<void> {
  const { limit, force } = parseArgs();

  console.log('Italian Law MCP — Ingestion Pipeline');
  console.log('=====================================\n');
  console.log('  Strategy: Article-by-article fetch via caricaArticolo AJAX');
  if (limit) console.log(`  --limit ${limit}`);
  if (force) console.log(`  --force (re-fetching all)`);
  console.log('');

  fs.mkdirSync(SEED_DIR, { recursive: true });

  const toProcess = limit ? KEY_LAWS.slice(0, limit) : KEY_LAWS;
  let totalProvisions = 0;
  let processed = 0;
  let skipped = 0;
  let failed = 0;

  for (const act of toProcess) {
    const seedFile = path.join(SEED_DIR, `${act.type}_${act.number}_${act.year}.json`);

    // Skip if seed exists and not forcing
    if (!force && fs.existsSync(seedFile)) {
      const existing = JSON.parse(fs.readFileSync(seedFile, 'utf-8'));
      if (existing.provisions && existing.provisions.length > 5) {
        console.log(`  SKIP (cached, ${existing.provisions.length} provisions): ${act.title}`);
        totalProvisions += existing.provisions.length;
        skipped++;
        processed++;
        continue;
      }
    }

    console.log(`\n  [${processed + 1}/${toProcess.length}] ${act.title} (${act.type.toUpperCase()} ${act.number}/${act.year})`);
    const result = await ingestAct(act);
    totalProvisions += result.provisions;
    if (result.failed) failed++;
    processed++;

    // Pause between acts to be respectful
    if (processed < toProcess.length) {
      console.log('  Pausing 2s between acts...');
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }

  console.log('\n\nIngestion complete:');
  console.log(`  Acts processed: ${processed}`);
  console.log(`  Acts skipped (cached): ${skipped}`);
  console.log(`  Acts failed: ${failed}`);
  console.log(`  Total provisions: ${totalProvisions}`);
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
