#!/usr/bin/env tsx
/**
 * Italian Law MCP — Census-Driven Ingestion Pipeline
 *
 * Article-by-article ingestion from normattiva.it, driven by census.json:
 *   1. Read census.json for the complete list of ingestable acts
 *   2. For each act not yet ingested, fetch the landing page to get session + TOC
 *   3. Extract individual article URLs from the TOC
 *   4. Fetch each article via the caricaArticolo AJAX endpoint
 *   5. Parse AKN HTML to extract article number, heading, and text
 *   6. Write seed JSON files for build-db.ts
 *   7. Update census.json with ingestion results
 *
 * Usage:
 *   npm run ingest                         # Ingest all pending acts from census
 *   npm run ingest -- --limit 50           # Ingest at most 50 acts
 *   npm run ingest -- --force              # Re-fetch even if seed exists
 *   npm run ingest -- --type dlgs          # Ingest only decreti legislativi
 *   npm run ingest -- --id dlgs-196-2003   # Ingest a single act by ID
 *   npm run ingest -- --from 2020          # Ingest acts from 2020 onwards
 *
 * Data is sourced from normattiva.it (Italian Government Open Data).
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { fetchAllArticles } from './lib/fetcher.js';
import { parseArticleHtml, parseAttachmentArticleHtml, type ParsedAct } from './lib/parser.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SEED_DIR = path.resolve(__dirname, '../data/seed');
const CENSUS_PATH = path.resolve(__dirname, '../data/census.json');
const DATA_DIR = path.resolve(__dirname, '../data');

// ─────────────────────────────────────────────────────────────────────────────
// Types from census
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

interface CensusFile {
  schema_version: string;
  jurisdiction: string;
  jurisdiction_name: string;
  portal: string;
  census_date: string;
  agent: string;
  year_range: { from: number; to: number };
  summary: {
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
  };
  laws: CensusLaw[];
}

// ─────────────────────────────────────────────────────────────────────────────
// CLI argument parsing
// ─────────────────────────────────────────────────────────────────────────────

interface CliArgs {
  limit: number | null;
  force: boolean;
  type: string | null;
  id: string | null;
  fromYear: number | null;
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  let limit: number | null = null;
  let force = false;
  let type: string | null = null;
  let id: string | null = null;
  let fromYear: number | null = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--limit' && args[i + 1]) {
      limit = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === '--force') {
      force = true;
    } else if (args[i] === '--type' && args[i + 1]) {
      type = args[i + 1];
      i++;
    } else if (args[i] === '--id' && args[i + 1]) {
      id = args[i + 1];
      i++;
    } else if (args[i] === '--from' && args[i + 1]) {
      fromYear = parseInt(args[i + 1], 10);
      i++;
    }
  }

  return { limit, force, type, id, fromYear };
}

// ─────────────────────────────────────────────────────────────────────────────
// Main ingestion
// ─────────────────────────────────────────────────────────────────────────────

async function ingestAct(law: CensusLaw): Promise<{ provisions: number; failed: boolean }> {
  const seedFile = path.join(SEED_DIR, `${law.type}_${law.number}_${law.year}.json`);

  try {
    // Fetch all articles for this act
    const articles = await fetchAllArticles(law.urn);

    if (articles.length === 0) {
      console.log(`    WARNING: No articles fetched, writing empty seed`);
      const emptySeed: ParsedAct = {
        id: law.id,
        type: law.type,
        title: law.title,
        short_name: law.title,
        status: 'in_force',
        issued_date: law.date,
        url: law.url,
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
      id: law.id,
      type: law.type,
      title: law.title,
      short_name: law.title,
      status: 'in_force',
      issued_date: law.date,
      url: law.url,
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
      id: law.id,
      type: law.type,
      title: law.title,
      short_name: law.title,
      status: 'in_force',
      issued_date: law.date,
      url: law.url,
      provisions: [],
    };
    fs.writeFileSync(seedFile, JSON.stringify(emptySeed, null, 2));
    return { provisions: 0, failed: true };
  }
}

function updateCensus(census: CensusFile, lawId: string, provisionCount: number): void {
  const law = census.laws.find(l => l.id === lawId);
  if (law) {
    law.ingested = provisionCount > 0;
    law.provision_count = provisionCount;
    law.ingestion_date = new Date().toISOString().slice(0, 10);
  }
  // Update summary counts
  census.summary.ingested = census.laws.filter(l => l.ingested).length;
}

async function main(): Promise<void> {
  const { limit, force, type, id, fromYear } = parseArgs();

  // Load census
  if (!fs.existsSync(CENSUS_PATH)) {
    console.error('ERROR: census.json not found. Run census first: npx tsx scripts/census.ts');
    process.exit(1);
  }

  const census: CensusFile = JSON.parse(fs.readFileSync(CENSUS_PATH, 'utf-8'));

  console.log('Italian Law MCP — Census-Driven Ingestion Pipeline');
  console.log('===================================================\n');
  console.log(`  Census: ${census.summary.total_laws} total, ${census.summary.ingestable} ingestable, ${census.summary.ingested} already ingested`);
  console.log('  Strategy: Article-by-article fetch via caricaArticolo AJAX');
  if (limit) console.log(`  --limit ${limit}`);
  if (force) console.log(`  --force (re-fetching all)`);
  if (type) console.log(`  --type ${type}`);
  if (id) console.log(`  --id ${id}`);
  if (fromYear) console.log(`  --from ${fromYear}`);
  console.log('');

  fs.mkdirSync(SEED_DIR, { recursive: true });

  // Filter acts to process
  let toProcess = census.laws.filter(l =>
    l.classification === 'ingestable' || l.classification === 'pre_republic'
  );

  if (id) {
    toProcess = toProcess.filter(l => l.id === id);
  }
  if (type) {
    toProcess = toProcess.filter(l => l.type === type);
  }
  if (fromYear) {
    toProcess = toProcess.filter(l => l.year >= fromYear);
  }

  // Sort: newer acts first (more relevant), then smaller acts first (faster)
  toProcess.sort((a, b) => {
    if (a.year !== b.year) return b.year - a.year;
    return a.number - b.number;
  });

  if (limit) {
    toProcess = toProcess.slice(0, limit);
  }

  console.log(`  Acts to process: ${toProcess.length}\n`);

  let totalProvisions = 0;
  let processed = 0;
  let skipped = 0;
  let failed = 0;
  let ingestedCount = 0;
  const startTime = Date.now();

  for (const law of toProcess) {
    const seedFile = path.join(SEED_DIR, `${law.type}_${law.number}_${law.year}.json`);

    // Skip if seed exists and not forcing (resume support)
    if (!force && fs.existsSync(seedFile)) {
      const existing = JSON.parse(fs.readFileSync(seedFile, 'utf-8'));
      if (existing.provisions && existing.provisions.length > 0) {
        totalProvisions += existing.provisions.length;
        // Update census if it wasn't marked as ingested
        if (!law.ingested) {
          updateCensus(census, law.id, existing.provisions.length);
        }
        skipped++;
        processed++;
        continue;
      }
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
    const rate = processed > 0 ? (processed / (parseFloat(elapsed) || 1) * 60).toFixed(1) : '---';
    console.log(`  [${processed + 1}/${toProcess.length}] ${law.title.substring(0, 80)} (${law.type.toUpperCase()} ${law.number}/${law.year}) [${elapsed}s, ${rate} acts/min]`);

    const result = await ingestAct(law);
    totalProvisions += result.provisions;

    if (result.failed) {
      failed++;
    } else {
      ingestedCount++;
    }

    // Update census
    updateCensus(census, law.id, result.provisions);
    processed++;

    // Save census periodically (every 10 acts)
    if (processed % 10 === 0) {
      fs.writeFileSync(CENSUS_PATH, JSON.stringify(census, null, 2));
    }

    // Pause between acts to be respectful
    if (processed < toProcess.length) {
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }

  // Final census save
  fs.writeFileSync(CENSUS_PATH, JSON.stringify(census, null, 2));

  const elapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);

  console.log('\n\nIngestion complete:');
  console.log(`  Acts processed: ${processed}`);
  console.log(`  Acts skipped (cached): ${skipped}`);
  console.log(`  Acts ingested: ${ingestedCount}`);
  console.log(`  Acts failed: ${failed}`);
  console.log(`  Total provisions: ${totalProvisions}`);
  console.log(`  Time: ${elapsed} min`);
  console.log(`\n  Census: ${census.summary.ingested}/${census.summary.ingestable} ingested`);
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
