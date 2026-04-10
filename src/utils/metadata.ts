/**
 * Response metadata for Italian Law MCP tool responses.
 */

import type Database from '@ansvar/mcp-sqlite';

export interface ResponseMetadata {
  data_age: string;
  disclaimer: string;
  copyright: string;
  source_url: string;
  note?: string;
  query_strategy?: string;
}

export interface ToolResponse<T> {
  results: T;
  _meta: ResponseMetadata;
  _error_type?: string;
  _citation?: import('./citation.js').CitationMetadata;
}

const STALENESS_THRESHOLD_DAYS = 30;

export function generateResponseMeta(
  db?: InstanceType<typeof Database>
): ResponseMetadata {
  let dataAge = 'unknown';

  if (db) {
    try {
      const row = db.prepare("SELECT value FROM db_metadata WHERE key = 'built_at'").get() as { value: string } | undefined;
      if (row?.value) {
        const builtDate = new Date(row.value);
        // ISO 8601 YYYY-MM-DD
        dataAge = builtDate.toISOString().slice(0, 10);
        const daysSince = Math.floor((Date.now() - builtDate.getTime()) / (1000 * 60 * 60 * 24));
        if (daysSince > STALENESS_THRESHOLD_DAYS) {
          dataAge = `${dataAge} (WARNING: ${daysSince} days old — data may be outdated)`;
        }
      }
    } catch {
      // Ignore metadata read errors
    }
  }

  return {
    data_age: dataAge,
    disclaimer:
      'This data is derived from normattiva.it (official Italian legislation portal). ' +
      'Verify against official Gazzetta Ufficiale publications when legal certainty is required.',
    copyright: '© Istituto Poligrafico e Zecca dello Stato — normattiva.it',
    source_url: 'https://www.normattiva.it',
  };
}

/** @deprecated Use generateResponseMeta */
export const generateResponseMetadata = generateResponseMeta;
