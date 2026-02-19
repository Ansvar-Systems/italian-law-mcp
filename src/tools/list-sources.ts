/**
 * list_sources — Returns metadata about data sources, coverage, and freshness.
 */

import type { Database } from '@ansvar/mcp-sqlite';
import { generateResponseMetadata, type ToolResponse } from '../utils/metadata.js';

export interface ListSourcesResult {
  jurisdiction: string;
  sources: Array<{
    name: string;
    authority: string;
    url: string;
    license: string;
    coverage: string;
    languages: string[];
  }>;
  database: {
    tier: string;
    schema_version: string;
    built_at: string;
    document_count: number;
    provision_count: number;
    eu_document_count: number;
  };
  limitations: string[];
}

function safeCount(db: Database, sql: string): number {
  try {
    const row = db.prepare(sql).get() as { count: number } | undefined;
    return row ? Number(row.count) : 0;
  } catch {
    return 0;
  }
}

function safeMetaValue(db: Database, key: string): string {
  try {
    const row = db.prepare('SELECT value FROM db_metadata WHERE key = ?').get(key) as { value: string } | undefined;
    return row?.value ?? 'unknown';
  } catch {
    return 'unknown';
  }
}

export async function listSources(db: Database): Promise<ToolResponse<ListSourcesResult>> {
  const documentCount = safeCount(db, 'SELECT COUNT(*) as count FROM legal_documents');
  const provisionCount = safeCount(db, 'SELECT COUNT(*) as count FROM legal_provisions');
  const euDocumentCount = safeCount(db, 'SELECT COUNT(*) as count FROM eu_documents');

  return {
    results: {
      jurisdiction: 'Italy (IT)',
      sources: [
        {
          name: 'normattiva.it',
          authority: 'Istituto Poligrafico e Zecca dello Stato / Presidenza del Consiglio dei Ministri',
          url: 'https://www.normattiva.it',
          license: 'Italian Government Open Data (legal texts are public domain under Italian law)',
          coverage: 'Italian legislation including Codice Privacy (D.Lgs. 196/2003), NIS2 transposition (D.Lgs. 138/2024), Codice Civile, Codice Penale (cybercrime), D.Lgs. 231/2001 (corporate liability), CAD (D.Lgs. 82/2005). Consolidated (vigente) versions.',
          languages: ['it'],
        },
        {
          name: 'EUR-Lex',
          authority: 'Publications Office of the European Union',
          url: 'https://eur-lex.europa.eu',
          license: 'Commission Decision 2011/833/EU (reuse of EU documents)',
          coverage: 'EU directive and regulation references extracted from Italian statute text for cross-referencing.',
          languages: ['it', 'en'],
        },
      ],
      database: {
        tier: safeMetaValue(db, 'tier'),
        schema_version: safeMetaValue(db, 'schema_version'),
        built_at: safeMetaValue(db, 'built_at'),
        document_count: documentCount,
        provision_count: provisionCount,
        eu_document_count: euDocumentCount,
      },
      limitations: [
        `Covers ${documentCount.toLocaleString()} Italian laws and codes. Regional legislation is not yet included.`,
        'Italian language only. No official English translations available.',
        'Articles with bis/ter/quater suffixes are stored as separate provisions.',
        'EU cross-references are auto-extracted from statute text and may not capture all indirect references.',
        'Garante per la protezione dei dati personali decisions are not yet included (Professional tier).',
        'Always verify against official Gazzetta Ufficiale publications when legal certainty is required.',
      ],
    },
    _metadata: generateResponseMetadata(db),
  };
}
