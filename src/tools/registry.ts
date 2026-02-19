/**
 * Tool registry for Italian Law MCP Server.
 * Shared between stdio (index.ts) and HTTP (api/mcp.ts) entry points.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
import Database from '@ansvar/mcp-sqlite';

import { searchLegislation, SearchLegislationInput } from './search-legislation.js';
import { getProvision, GetProvisionInput } from './get-provision.js';
import { listSources } from './list-sources.js';
import { validateCitationTool, ValidateCitationInput } from './validate-citation.js';
import { buildLegalStance, BuildLegalStanceInput } from './build-legal-stance.js';
import { formatCitationTool, FormatCitationInput } from './format-citation.js';
import { checkCurrency, CheckCurrencyInput } from './check-currency.js';
import { getEUBasis, GetEUBasisInput } from './get-eu-basis.js';
import { getItalianImplementations, GetItalianImplementationsInput } from './get-italian-implementations.js';
import { searchEUImplementations, SearchEUImplementationsInput } from './search-eu-implementations.js';
import { getProvisionEUBasis, GetProvisionEUBasisInput } from './get-provision-eu-basis.js';
import { validateEUCompliance, ValidateEUComplianceInput } from './validate-eu-compliance.js';
import { getAbout, type AboutContext } from './about.js';
export type { AboutContext } from './about.js';

const ABOUT_TOOL: Tool = {
  name: 'about',
  description:
    'Server metadata, dataset statistics, freshness, and provenance. ' +
    'Call this to verify data coverage, currency, and content basis before relying on results.',
  inputSchema: { type: 'object', properties: {} },
};

export const TOOLS: Tool[] = [
  {
    name: 'search_legislation',
    description:
      'Search Italian laws and codes by keyword (in Italian). Returns provision-level results with BM25 relevance ranking. ' +
      'Supports natural language queries (e.g., "protezione dei dati personali") and FTS5 syntax (AND, OR, NOT, "phrase", prefix*). ' +
      'Results include: document ID, title, provision reference, snippet with >>>highlight<<< markers, and relevance score. ' +
      'Use document_id to filter within a single law. Use status to filter by in_force/amended/repealed. ' +
      'Default limit is 10 (max 50). For broad legal research, prefer build_legal_stance instead.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query in Italian. Supports natural language or FTS5 syntax (AND, OR, NOT, "phrase", prefix*). Example: "protezione dei dati" OR "dati personali"',
        },
        document_id: {
          type: 'string',
          description: 'Filter to a specific law by ID (e.g., "dlgs-196-2003") or title (e.g., "Codice Privacy")',
        },
        status: {
          type: 'string',
          enum: ['in_force', 'amended', 'repealed'],
          description: 'Filter by legislative status. Omit to search all statuses.',
        },
        limit: {
          type: 'number',
          description: 'Maximum results to return (default: 10, max: 50). Lower values save tokens.',
          default: 10,
          minimum: 1,
          maximum: 50,
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_provision',
    description:
      'Retrieve the full text of a specific article from an Italian law, or all articles if no article number is specified. ' +
      'Italian provisions use article notation: Art. 1, Art. 4-bis, Art. 615-ter. ' +
      'Pass document_id as either the internal ID (e.g., "dlgs-196-2003"), the short form (e.g., "D.Lgs. 196/2003"), ' +
      'or a common name (e.g., "Codice Privacy", "Codice Penale", "Codice Civile"). ' +
      'Returns: document ID, title, status, provision reference, chapter, section, title, and full content text. ' +
      'Articles with bis/ter/quater suffixes are stored as separate provisions. ' +
      'WARNING: Omitting article returns ALL provisions (capped at 200).',
    inputSchema: {
      type: 'object',
      properties: {
        document_id: {
          type: 'string',
          description: 'Law identifier: internal ID (e.g., "dlgs-196-2003"), short form (e.g., "D.Lgs. 196/2003"), or common name (e.g., "Codice Privacy"). Fuzzy title matching is supported.',
        },
        article: {
          type: 'string',
          description: 'Article number (e.g., "1", "4-bis", "615-ter"). Matched against provision_ref and section columns.',
        },
        provision_ref: {
          type: 'string',
          description: 'Direct provision reference (e.g., "art1", "art615-ter"). Takes precedence over article if both provided.',
        },
      },
      required: ['document_id'],
    },
  },
  {
    name: 'list_sources',
    description:
      'Returns metadata about all data sources backing this server, including jurisdiction, authoritative source details, ' +
      'database tier, schema version, build date, record counts, and known limitations. ' +
      'Call this first to understand data coverage and freshness before relying on other tools.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'validate_citation',
    description:
      'Validate an Italian legal citation against the database. Returns whether the cited law and provision exist. ' +
      'Use this as a zero-hallucination check before presenting legal references to users. ' +
      'Supported formats: "Art. 1, D.Lgs. 196/2003", "Art. 615-ter, Codice Penale", "dlgs-196-2003, art. 1". ' +
      'Returns: valid (boolean), parsed components, warnings about repealed/amended status.',
    inputSchema: {
      type: 'object',
      properties: {
        citation: {
          type: 'string',
          description: 'Italian legal citation to validate. Examples: "Art. 1, D.Lgs. 196/2003", "Art. 615-ter, Codice Penale", "Art. 1, comma 1, D.Lgs. 196/2003"',
        },
      },
      required: ['citation'],
    },
  },
  {
    name: 'build_legal_stance',
    description:
      'Build a comprehensive set of citations for a legal question by searching across all Italian legislation simultaneously. ' +
      'Returns aggregated results from legislation search, cross-referenced with EU law where applicable. ' +
      'Best for broad legal research questions like "Quali leggi italiane regolano il trattamento dei dati personali?" ' +
      'For targeted lookups of a known provision, use get_provision instead.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Legal question or topic to research in Italian (e.g., "obblighi trattamento dati personali")',
        },
        document_id: {
          type: 'string',
          description: 'Optionally limit search to one law by ID or title',
        },
        limit: {
          type: 'number',
          description: 'Max results per category (default: 5, max: 20)',
          default: 5,
          minimum: 1,
          maximum: 20,
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'format_citation',
    description:
      'Format an Italian legal citation per standard conventions. ' +
      'Formats: "full" -> "Art. 1, Decreto legislativo n. 196/2003", ' +
      '"short" -> "Art. 1, D.Lgs. 196/2003", "pinpoint" -> "Art. 1, comma 1". ' +
      'Does NOT validate existence — use validate_citation for that.',
    inputSchema: {
      type: 'object',
      properties: {
        citation: {
          type: 'string',
          description: 'Citation string to format (e.g., "Art. 1, D.Lgs. 196/2003")',
        },
        format: {
          type: 'string',
          enum: ['full', 'short', 'pinpoint'],
          description: 'Output format. "full" (default): formal citation. "short": abbreviated. "pinpoint": article reference only.',
          default: 'full',
        },
      },
      required: ['citation'],
    },
  },
  {
    name: 'check_currency',
    description:
      'Check whether an Italian law or provision is currently in force, amended, or repealed (abrogata). ' +
      'Returns: is_current (boolean), status, dates (issued, in-force), and warnings. ' +
      'Essential before citing legislation — repealed laws should not be cited as current law.',
    inputSchema: {
      type: 'object',
      properties: {
        document_id: {
          type: 'string',
          description: 'Law identifier (e.g., "dlgs-196-2003") or title (e.g., "Codice Privacy")',
        },
        provision_ref: {
          type: 'string',
          description: 'Optional provision reference to check a specific article (e.g., "art1")',
        },
      },
      required: ['document_id'],
    },
  },
  {
    name: 'get_eu_basis',
    description:
      'Get EU legal basis (directives and regulations) for an Italian law. Returns all EU instruments that the Italian law ' +
      'implements, supplements, or references, including CELEX numbers and implementation status. ' +
      'Italy is an EU founding member — EU law integration is deep and comprehensive. ' +
      'Example: D.Lgs. 196/2003 (Codice Privacy) -> implements GDPR (Regulation 2016/679).',
    inputSchema: {
      type: 'object',
      properties: {
        document_id: {
          type: 'string',
          description: 'Italian law identifier (e.g., "dlgs-196-2003") or title (e.g., "Codice Privacy")',
        },
        include_articles: {
          type: 'boolean',
          description: 'Include specific EU article references in the response (default: false)',
          default: false,
        },
        reference_types: {
          type: 'array',
          items: {
            type: 'string',
            enum: ['implements', 'supplements', 'applies', 'references', 'complies_with', 'derogates_from', 'amended_by', 'repealed_by', 'cites_article'],
          },
          description: 'Filter by reference type (e.g., ["implements"]). Omit to return all types.',
        },
      },
      required: ['document_id'],
    },
  },
  {
    name: 'get_italian_implementations',
    description:
      'Find Italian laws that implement a specific EU directive or regulation. ' +
      'Input the EU document ID in "type:year/number" format (e.g., "regulation:2016/679" for GDPR, "directive:2022/2555" for NIS2). ' +
      'Returns matching Italian laws with implementation status and whether each is the primary implementing act.',
    inputSchema: {
      type: 'object',
      properties: {
        eu_document_id: {
          type: 'string',
          description: 'EU document ID in format "type:year/number" (e.g., "regulation:2016/679" for GDPR, "directive:2022/2555" for NIS2)',
        },
        primary_only: {
          type: 'boolean',
          description: 'Return only primary implementing laws (default: false)',
          default: false,
        },
        in_force_only: {
          type: 'boolean',
          description: 'Return only laws currently in force (default: false)',
          default: false,
        },
      },
      required: ['eu_document_id'],
    },
  },
  {
    name: 'search_eu_implementations',
    description:
      'Search for EU directives and regulations that have been implemented or referenced by Italian laws. ' +
      'Search by keyword (e.g., "data protection", "privacy"), filter by type (directive/regulation), ' +
      'or year range. Returns EU documents with counts of Italian laws referencing them.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Keyword search across EU document titles and short names (e.g., "data protection")',
        },
        type: {
          type: 'string',
          enum: ['directive', 'regulation'],
          description: 'Filter by EU document type',
        },
        year_from: { type: 'number', description: 'Filter: EU documents from this year onwards' },
        year_to: { type: 'number', description: 'Filter: EU documents up to this year' },
        has_italian_implementation: {
          type: 'boolean',
          description: 'If true, only return EU documents that have at least one Italian implementing law',
        },
        limit: {
          type: 'number',
          description: 'Max results (default: 20, max: 100)',
          default: 20,
          minimum: 1,
          maximum: 100,
        },
      },
    },
  },
  {
    name: 'get_provision_eu_basis',
    description:
      'Get EU legal basis for a specific provision within an Italian law, with article-level precision. ' +
      'Example: D.Lgs. 196/2003 Art. 1 -> references GDPR (Regulation 2016/679). ' +
      'Use this for pinpoint EU compliance checks at the provision level.',
    inputSchema: {
      type: 'object',
      properties: {
        document_id: {
          type: 'string',
          description: 'Italian law identifier (e.g., "dlgs-196-2003") or title',
        },
        provision_ref: {
          type: 'string',
          description: 'Provision reference (e.g., "art1", "1", "615-ter")',
        },
      },
      required: ['document_id', 'provision_ref'],
    },
  },
  {
    name: 'validate_eu_compliance',
    description:
      'Check EU compliance status for an Italian law or provision. Detects references to repealed EU directives, ' +
      'missing implementations, and outdated references. Returns compliance status: compliant, partial, unclear, or not_applicable. ' +
      'Note: This is Phase 1 validation. Full compliance checking will be expanded in future releases.',
    inputSchema: {
      type: 'object',
      properties: {
        document_id: {
          type: 'string',
          description: 'Italian law identifier (e.g., "dlgs-196-2003") or title',
        },
        provision_ref: {
          type: 'string',
          description: 'Optional: check a specific provision (e.g., "art1")',
        },
        eu_document_id: {
          type: 'string',
          description: 'Optional: check compliance with a specific EU document (e.g., "regulation:2016/679")',
        },
      },
      required: ['document_id'],
    },
  },
];

export function buildTools(context?: AboutContext): Tool[] {
  return context ? [...TOOLS, ABOUT_TOOL] : TOOLS;
}

export function registerTools(
  server: Server,
  db: InstanceType<typeof Database>,
  context?: AboutContext,
): void {
  const allTools = buildTools(context);

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return { tools: allTools };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      let result: unknown;

      switch (name) {
        case 'search_legislation':
          result = await searchLegislation(db, args as unknown as SearchLegislationInput);
          break;
        case 'get_provision':
          result = await getProvision(db, args as unknown as GetProvisionInput);
          break;
        case 'list_sources':
          result = await listSources(db);
          break;
        case 'validate_citation':
          result = await validateCitationTool(db, args as unknown as ValidateCitationInput);
          break;
        case 'build_legal_stance':
          result = await buildLegalStance(db, args as unknown as BuildLegalStanceInput);
          break;
        case 'format_citation':
          result = await formatCitationTool(args as unknown as FormatCitationInput);
          break;
        case 'check_currency':
          result = await checkCurrency(db, args as unknown as CheckCurrencyInput);
          break;
        case 'get_eu_basis':
          result = await getEUBasis(db, args as unknown as GetEUBasisInput);
          break;
        case 'get_italian_implementations':
          result = await getItalianImplementations(db, args as unknown as GetItalianImplementationsInput);
          break;
        case 'search_eu_implementations':
          result = await searchEUImplementations(db, args as unknown as SearchEUImplementationsInput);
          break;
        case 'get_provision_eu_basis':
          result = await getProvisionEUBasis(db, args as unknown as GetProvisionEUBasisInput);
          break;
        case 'validate_eu_compliance':
          result = await validateEUCompliance(db, args as unknown as ValidateEUComplianceInput);
          break;
        case 'about':
          if (context) {
            result = getAbout(db, context);
          } else {
            return {
              content: [{ type: 'text', text: 'About tool not configured.' }],
              isError: true,
            };
          }
          break;
        default:
          return {
            content: [{ type: 'text', text: `Error: Unknown tool "${name}".` }],
            isError: true,
          };
      }

      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        content: [{ type: 'text', text: `Error: ${message}` }],
        isError: true,
      };
    }
  });
}
