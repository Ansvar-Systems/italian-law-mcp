export type CitationFormat = 'full' | 'short' | 'pinpoint';

/**
 * Italian document type abbreviations.
 * legge = ordinary law, dlgs = decreto legislativo,
 * dl = decreto-legge, dpr = decreto del Presidente della Repubblica,
 * rd = regio decreto (historical), codice = codified law
 */
export type ItalianDocumentType = 'legge' | 'dlgs' | 'dl' | 'dpr' | 'rd' | 'codice' | 'unknown';

export interface ParsedCitation {
  valid: boolean;
  type: ItalianDocumentType;
  title?: string;
  year?: number;
  number?: number;
  article?: string;
  comma?: string;
  /** bis/ter/quater/etc. suffix on article number */
  suffix?: string;
  document_id?: string;
  error?: string;
}

export interface ValidationResult {
  citation: ParsedCitation;
  document_exists: boolean;
  provision_exists: boolean;
  document_title?: string;
  status?: string;
  warnings: string[];
}
