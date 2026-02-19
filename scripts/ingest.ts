#!/usr/bin/env tsx
/**
 * Italian Law MCP — Ingestion Pipeline
 *
 * Two-phase ingestion of Italian legislation from normattiva.it:
 *   Phase 1 (Discovery): Build act index from known key laws
 *   Phase 2 (Content): Fetch HTML for each act, parse, and write seed JSON
 *
 * Usage:
 *   npm run ingest                    # Full ingestion
 *   npm run ingest -- --limit 5       # Test with 5 acts
 *   npm run ingest -- --skip-discovery # Reuse cached act index
 *
 * Data is sourced from normattiva.it (Italian Government Open Data).
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { fetchNormattivaAct } from './lib/fetcher.js';
import { parseNormattivaHtml, buildNormattivaUrn, type ActIndexEntry, type ParsedAct } from './lib/parser.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SOURCE_DIR = path.resolve(__dirname, '../data/source');
const SEED_DIR = path.resolve(__dirname, '../data/seed');
const INDEX_PATH = path.join(SOURCE_DIR, 'act-index.json');

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
    title: 'Codice dell\'Amministrazione Digitale (CAD)',
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

function parseArgs(): { limit: number | null; skipDiscovery: boolean } {
  const args = process.argv.slice(2);
  let limit: number | null = null;
  let skipDiscovery = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--limit' && args[i + 1]) {
      limit = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === '--skip-discovery') {
      skipDiscovery = true;
    }
  }

  return { limit, skipDiscovery };
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase 1: Discovery
// ─────────────────────────────────────────────────────────────────────────────

function discoverActs(): ActIndexEntry[] {
  console.log('Phase 1: Building act index from known key laws...\n');

  fs.mkdirSync(SOURCE_DIR, { recursive: true });
  fs.writeFileSync(INDEX_PATH, JSON.stringify(KEY_LAWS, null, 2));
  console.log(`  Index saved with ${KEY_LAWS.length} acts to ${INDEX_PATH}\n`);

  return KEY_LAWS;
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase 2: Content
// ─────────────────────────────────────────────────────────────────────────────

async function fetchAndParseActs(acts: ActIndexEntry[], limit: number | null): Promise<void> {
  const toProcess = limit ? acts.slice(0, limit) : acts;
  console.log(`Phase 2: Fetching content for ${toProcess.length} acts from normattiva.it...\n`);

  fs.mkdirSync(SEED_DIR, { recursive: true });

  let processed = 0;
  let skipped = 0;
  let failed = 0;
  let totalProvisions = 0;

  for (const act of toProcess) {
    const seedFile = path.join(SEED_DIR, `${act.type}_${act.number}_${act.year}.json`);

    if (fs.existsSync(seedFile)) {
      skipped++;
      processed++;
      continue;
    }

    try {
      console.log(`  Fetching: ${act.title} (${act.type}-${act.number}-${act.year})...`);
      const result = await fetchNormattivaAct(act.urn);

      if (result.status !== 200) {
        console.log(`    ERROR: HTTP ${result.status}`);
        const minimalSeed: ParsedAct = {
          id: `${act.type}-${act.number}-${act.year}`,
          type: act.type,
          title: act.title,
          short_name: act.title,
          status: 'in_force',
          issued_date: act.date,
          url: act.url,
          provisions: [],
        };
        fs.writeFileSync(seedFile, JSON.stringify(minimalSeed, null, 2));
        failed++;
      } else {
        const parsed = parseNormattivaHtml(result.body, act.type, act.number, act.year, act.title);
        fs.writeFileSync(seedFile, JSON.stringify(parsed, null, 2));
        totalProvisions += parsed.provisions.length;
        console.log(`    OK: ${parsed.provisions.length} provisions`);
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.log(`    ERROR: ${msg}`);
      failed++;
    }

    processed++;
  }

  console.log(`\nPhase 2 complete:`);
  console.log(`  Processed: ${processed}`);
  console.log(`  Skipped (cached): ${skipped}`);
  console.log(`  Failed: ${failed}`);
  console.log(`  Total provisions: ${totalProvisions}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const { limit, skipDiscovery } = parseArgs();

  console.log('Italian Law MCP — Ingestion Pipeline');
  console.log('=====================================\n');

  if (limit) console.log(`  --limit ${limit}`);
  if (skipDiscovery) console.log(`  --skip-discovery`);
  console.log('');

  let acts: ActIndexEntry[];

  if (skipDiscovery && fs.existsSync(INDEX_PATH)) {
    console.log(`Using cached act index from ${INDEX_PATH}\n`);
    acts = JSON.parse(fs.readFileSync(INDEX_PATH, 'utf-8'));
    console.log(`  ${acts.length} acts in index\n`);
  } else {
    acts = discoverActs();
  }

  await fetchAndParseActs(acts, limit);

  console.log('\nIngestion complete.');
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
