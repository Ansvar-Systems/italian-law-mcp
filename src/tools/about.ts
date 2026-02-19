import type Database from '@ansvar/mcp-sqlite';

export interface AboutContext {
  version: string;
  fingerprint: string;
  dbBuilt: string;
}

export interface AboutResult {
  server: {
    name: string;
    package: string;
    version: string;
    suite: string;
    repository: string;
  };
  dataset: {
    fingerprint: string;
    built: string;
    jurisdiction: string;
    content_basis: string;
    counts: Record<string, number>;
  };
  provenance: {
    sources: string[];
    license: string;
    authenticity_note: string;
  };
  security: {
    access_model: string;
    network_access: boolean;
    filesystem_access: boolean;
    arbitrary_code: boolean;
  };
}

function safeCount(db: InstanceType<typeof Database>, sql: string): number {
  try {
    const row = db.prepare(sql).get() as { count: number } | undefined;
    return row ? Number(row.count) : 0;
  } catch {
    return 0;
  }
}

export function getAbout(
  db: InstanceType<typeof Database>,
  context: AboutContext
): AboutResult {
  return {
    server: {
      name: 'Italian Law MCP',
      package: '@ansvar/italian-law-mcp',
      version: context.version,
      suite: 'Ansvar Compliance Suite',
      repository: 'https://github.com/Ansvar-Systems/italian-law-mcp',
    },
    dataset: {
      fingerprint: context.fingerprint,
      built: context.dbBuilt,
      jurisdiction: 'Italy (IT)',
      content_basis:
        'Italian statute text from normattiva.it. ' +
        'Covers data protection (Codice Privacy), cybercrime (Codice Penale), ' +
        'corporate liability (D.Lgs. 231/2001), digital administration (CAD), and NIS2 transposition.',
      counts: {
        legal_documents: safeCount(db, 'SELECT COUNT(*) as count FROM legal_documents'),
        legal_provisions: safeCount(db, 'SELECT COUNT(*) as count FROM legal_provisions'),
        eu_documents: safeCount(db, 'SELECT COUNT(*) as count FROM eu_documents'),
        eu_references: safeCount(db, 'SELECT COUNT(*) as count FROM eu_references'),
      },
    },
    provenance: {
      sources: [
        'normattiva.it (Italian legislation, consolidated versions)',
        'EUR-Lex (EU directive and regulation references)',
      ],
      license:
        'Apache-2.0 (server code). Legal texts are public domain under Italian law.',
      authenticity_note:
        'Statute text is derived from normattiva.it open data. ' +
        'Verify against official Gazzetta Ufficiale publications when legal certainty is required.',
    },
    security: {
      access_model: 'read-only',
      network_access: false,
      filesystem_access: false,
      arbitrary_code: false,
    },
  };
}
