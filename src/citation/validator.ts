/**
 * Italian legal citation validator.
 *
 * Validates a citation string against the database to ensure the document
 * and provision actually exist (zero-hallucination enforcement).
 */

import type { Database } from '@ansvar/mcp-sqlite';
import type { ValidationResult } from '../types/index.js';
import { parseCitation } from './parser.js';
import { resolveExistingStatuteId } from '../utils/statute-id.js';

export function validateCitation(db: Database, citation: string): ValidationResult {
  const parsed = parseCitation(citation);
  const warnings: string[] = [];

  if (!parsed.valid) {
    return {
      citation: parsed,
      document_exists: false,
      provision_exists: false,
      warnings: [parsed.error ?? 'Invalid citation format'],
    };
  }

  // Resolve document
  let docId: string | null = null;

  if (parsed.document_id) {
    docId = resolveExistingStatuteId(db, parsed.document_id);
  }

  if (!docId && parsed.title) {
    docId = resolveExistingStatuteId(db, parsed.title);
  }

  if (!docId) {
    const searchTerm = parsed.document_id ?? parsed.title ?? `${parsed.type}-${parsed.number}-${parsed.year}`;
    return {
      citation: parsed,
      document_exists: false,
      provision_exists: false,
      warnings: [`Document "${searchTerm}" not found in database`],
    };
  }

  const doc = db.prepare(
    "SELECT id, title, status FROM legal_documents WHERE id = ?"
  ).get(docId) as { id: string; title: string; status: string } | undefined;

  if (!doc) {
    return {
      citation: parsed,
      document_exists: false,
      provision_exists: false,
      warnings: [`Document "${docId}" not found in database`],
    };
  }

  if (doc.status === 'repealed') {
    warnings.push('This law has been repealed');
  }

  // Check provision existence
  let provisionExists = false;
  if (parsed.article) {
    const articleRef = parsed.suffix
      ? `${parsed.article}-${parsed.suffix}`
      : parsed.article;

    const provRef = `art${articleRef}`;

    const prov = db.prepare(
      `SELECT 1
       FROM legal_provisions
       WHERE document_id = ?
         AND (
           provision_ref = ?
           OR section = ?
           OR provision_ref = ?
           OR section = ?
         )`
    ).get(
      doc.id,
      provRef,
      articleRef,
      articleRef,
      provRef,
    );
    provisionExists = !!prov;

    if (!provisionExists) {
      warnings.push(`Article ${articleRef} not found in ${doc.title}`);
    }
  }

  return {
    citation: parsed,
    document_exists: true,
    provision_exists: provisionExists,
    document_title: doc.title,
    status: doc.status,
    warnings,
  };
}
