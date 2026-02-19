#!/usr/bin/env tsx
/**
 * Check normattiva.it for recently updated Italian legislation.
 *
 * Exits:
 *   0 = no updates
 *   1 = updates found
 *   2 = check failed
 */

import Database from 'better-sqlite3';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = resolve(__dirname, '../data/database.db');
const INDEX_PATH = resolve(__dirname, '../data/source/act-index.json');

const USER_AGENT = 'Italian-Law-MCP/1.0';
const REQUEST_TIMEOUT_MS = 15_000;

interface LocalIndexEntry {
  title: string;
  type: string;
  number: number;
  year: number;
  date: string;
  urn: string;
  url: string;
  updated: string;
}

interface UpdateHit {
  document_id: string;
  title: string;
  urn: string;
}

function toDocumentId(entry: Pick<LocalIndexEntry, 'type' | 'number' | 'year'>): string {
  return `${entry.type}-${entry.number}-${entry.year}`;
}

async function checkActAvailability(urn: string): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const url = `https://www.normattiva.it/uri-res/N2Ls?${urn}`;
    const response = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT },
      signal: controller.signal,
      method: 'HEAD',
    });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

async function main(): Promise<void> {
  console.log('Italian Law MCP - Update checker');
  console.log('');

  if (!existsSync(DB_PATH)) {
    console.error(`Database not found: ${DB_PATH}`);
    process.exit(2);
  }

  const db = new Database(DB_PATH, { readonly: true });
  const localDocs = new Set<string>(
    (db.prepare('SELECT id FROM legal_documents').all() as { id: string }[]).map(r => r.id),
  );
  db.close();

  if (!existsSync(INDEX_PATH)) {
    console.log('No act index found. Run ingest first.');
    process.exit(0);
  }

  const localIndex: LocalIndexEntry[] = JSON.parse(readFileSync(INDEX_PATH, 'utf-8'));
  console.log(`Checking ${localIndex.length} indexed acts...\n`);

  const newActs: UpdateHit[] = [];
  const reachableActs: UpdateHit[] = [];

  for (const entry of localIndex) {
    const documentId = toDocumentId(entry);

    if (!localDocs.has(documentId)) {
      newActs.push({
        document_id: documentId,
        title: entry.title,
        urn: entry.urn,
      });
      continue;
    }

    const isReachable = await checkActAvailability(entry.urn);
    if (isReachable) {
      reachableActs.push({
        document_id: documentId,
        title: entry.title,
        urn: entry.urn,
      });
    }
  }

  console.log(`Reachable acts: ${reachableActs.length}/${localIndex.length}`);

  if (newActs.length > 0) {
    console.log(`\nNew acts missing locally: ${newActs.length}`);
    for (const hit of newActs) {
      console.log(`  - ${hit.document_id} (${hit.title})`);
    }
    process.exit(1);
  }

  console.log('\nNo missing acts detected.');
}

main().catch((error) => {
  console.error(`Update check failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(2);
});
