/**
 * get_provision — Retrieve a specific provision (article) from an Italian law.
 */

import type { Database } from '@ansvar/mcp-sqlite';
import { resolveExistingStatuteId } from '../utils/statute-id.js';
import { generateResponseMetadata, type ToolResponse } from '../utils/metadata.js';

export interface GetProvisionInput {
  document_id: string;
  article?: string;
  section?: string;
  provision_ref?: string;
}

export interface ProvisionResult {
  document_id: string;
  document_title: string;
  document_status: string;
  provision_ref: string;
  chapter: string | null;
  section: string;
  title: string | null;
  content: string;
}

interface ProvisionRow {
  document_id: string;
  document_title: string;
  document_status: string;
  provision_ref: string;
  chapter: string | null;
  section: string;
  title: string | null;
  content: string;
}

const MAX_ALL_PROVISIONS = 200;

export async function getProvision(
  db: Database,
  input: GetProvisionInput
): Promise<ToolResponse<ProvisionResult | ProvisionResult[] | { provisions: ProvisionResult[]; truncated: boolean; total: number } | null>> {
  if (!input.document_id) {
    throw new Error('document_id is required');
  }

  const resolvedDocumentId = resolveExistingStatuteId(db, input.document_id) ?? input.document_id;

  // Determine the provision reference to search for
  const provisionRef = input.provision_ref ?? input.article ?? input.section;

  if (!provisionRef) {
    const countRow = db.prepare(
      'SELECT COUNT(*) as count FROM legal_provisions WHERE document_id = ?'
    ).get(resolvedDocumentId) as { count: number } | undefined;
    const total = countRow?.count ?? 0;

    const rows = db.prepare(`
      SELECT
        lp.document_id,
        ld.title as document_title,
        ld.status as document_status,
        lp.provision_ref,
        lp.chapter,
        lp.section,
        lp.title,
        lp.content
      FROM legal_provisions lp
      JOIN legal_documents ld ON ld.id = lp.document_id
      WHERE lp.document_id = ?
      ORDER BY lp.id
      LIMIT ?
    `).all(resolvedDocumentId, MAX_ALL_PROVISIONS) as ProvisionRow[];

    if (total > MAX_ALL_PROVISIONS) {
      return {
        results: {
          provisions: rows,
          truncated: true,
          total,
        },
        _metadata: generateResponseMetadata(db),
      };
    }

    return {
      results: rows,
      _metadata: generateResponseMetadata(db)
    };
  }

  // Build multiple search variants for Italian article references
  // Users might say "1", "art1", "Art. 1", "615-ter", etc.
  const searchVariants = [
    provisionRef,
    `art${provisionRef}`,
    `Art. ${provisionRef}`,
  ];

  // Try exact match with each variant
  for (const variant of searchVariants) {
    const row = db.prepare(`
      SELECT
        lp.document_id,
        ld.title as document_title,
        ld.status as document_status,
        lp.provision_ref,
        lp.chapter,
        lp.section,
        lp.title,
        lp.content
      FROM legal_provisions lp
      JOIN legal_documents ld ON ld.id = lp.document_id
      WHERE lp.document_id = ? AND (lp.provision_ref = ? OR lp.section = ?)
    `).get(resolvedDocumentId, variant, variant) as ProvisionRow | undefined;

    if (row) {
      return {
        results: row,
        _metadata: generateResponseMetadata(db)
      };
    }
  }

  // Try LIKE match for partial references
  const likeRow = db.prepare(`
    SELECT
      lp.document_id,
      ld.title as document_title,
      ld.status as document_status,
      lp.provision_ref,
      lp.chapter,
      lp.section,
      lp.title,
      lp.content
    FROM legal_provisions lp
    JOIN legal_documents ld ON ld.id = lp.document_id
    WHERE lp.document_id = ? AND (lp.provision_ref LIKE ? OR lp.section LIKE ?)
    LIMIT 1
  `).get(resolvedDocumentId, `%${provisionRef}%`, `%${provisionRef}%`) as ProvisionRow | undefined;

  if (likeRow) {
    return {
      results: likeRow,
      _metadata: generateResponseMetadata(db)
    };
  }

  return {
    results: null,
    _metadata: generateResponseMetadata(db)
  };
}
