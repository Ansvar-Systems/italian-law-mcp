# Italian Law MCP

<!-- ANSVAR-CTA-BEGIN -->
> **The Italian law corpus is now served through the Ansvar Gateway.** Connect your AI assistant (Claude, Copilot, Cursor, custom MCP client) to `https://gateway.ansvar.eu/mcp` — one OAuth connection, free tier available, covering this corpus plus EU regulations, national law across 28 audited jurisdictions, and CVE/security intelligence, every result with a verbatim source citation. Start at https://ansvar.eu/docs/quickstart

### Connect

**Claude Code** (one line):

```bash
claude mcp add ansvar --transport http https://gateway.ansvar.eu/mcp
```

**Claude Desktop / Cursor** — add to `claude_desktop_config.json` (or `mcp.json`):

```json
{
  "mcpServers": {
    "ansvar": {
      "type": "url",
      "url": "https://gateway.ansvar.eu/mcp"
    }
  }
}
```

**Claude.ai** — Settings → Connectors → Add custom connector → paste `https://gateway.ansvar.eu/mcp`

First request opens an OAuth signup flow (setup details: [ansvar.eu/docs/quickstart](https://ansvar.eu/docs/quickstart)). After signup, your client is bound to your account; tier (free / premium / team / company) determines fan-out, quota, and which downstream MCPs are reachable.

---

## Self-host this MCP

You can also clone this repo and build the corpus yourself. The schema,
fetcher, and tool implementations all live here. What is not in the repo is
the pre-built database — TDM and standards-licensing constraints on the
upstream sources mean we host the corpus on Ansvar infrastructure rather
than redistribute it as a public artifact.

Build your own: run this repo's ingestion script (entry-point varies per
repo — typically `scripts/ingest.sh`, `npm run ingest`, or `make ingest`;
check the repo root).
<!-- ANSVAR-CTA-END -->


MCP server for Italian law — statutes from www.normattiva.it with EU implementation
mapping. Indexes the Codice Civile, Codice Penale, Codice Privacy (D.Lgs. 196/2003 +
D.Lgs. 101/2018), the NIS2 transposition (D.Lgs. 138/2024), D.Lgs. 231/2001 corporate
liability framework, and the Codice dell'Amministrazione Digitale.

[![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)
[![MCP](https://img.shields.io/badge/MCP-spec--compliant-green.svg)](https://modelcontextprotocol.io)
[![Jurisdiction](https://img.shields.io/badge/Jurisdiction-IT-informational.svg)](#coverage)

## What this is

This server indexes the legal materials listed under **Sources** below and exposes them
via the Model Context Protocol. Part of the Ansvar MCP fleet — source-available servers
published for self-hosting.

It makes no outbound network calls except to the upstream sources during ingestion —
no analytics, no phone-home.

## Coverage

- **Corpus target:** 58,985 statutes, 267,838 provisions from Normattiva (the consolidated
  national legislative database)
- **Premium overlay:** 759,592 preparatory works from the Italian Senate (Akoma Ntoso XML,
  CC-BY-4.0)
- **Jurisdiction code:** `IT`
- **Languages:** Italian only — no official translations

The corpus is rebuilt from the upstream sources by `scripts/build-db.ts`; re-run
`npm run build:db` periodically to refresh. The current free-tier ship contains a
partial-ingestion snapshot (~361 statutes); full re-ingestion is tracked as separate
work.

See **Sources** below for source URLs, terms, and reuse conditions.

## Why this exists

LLMs answering compliance, security, or legal questions from training data alone will
fabricate citations — confidently producing article numbers, statute names, and source
URLs that do not exist, or that do not say what the model claims. This MCP exists so an
agent can call a tool that returns the real text, the real identifier, and the real
source URL straight from the indexed materials — and ground an answer rather than recall
it.

One MCP, one corpus. The point is composition.

The **Ansvar Gateway** ([ansvar.eu](https://ansvar.eu)) joins this MCP with the rest of
the Ansvar fleet behind a single authenticated endpoint — 300+ servers covering legal
jurisdictions, EU regulations, security frameworks, sector regulators, privacy-pattern
catalogues, and risk-scoring tools. That lets an agent run cross-domain workflows that
no single MCP can serve alone:

- **Threat model and TARA.** Threat enumeration → known component vulnerabilities →
  severity scoring → applicable AI, cybersecurity, and automotive obligations → privacy
  threats. Every finding traceable to its source.
- **Gap analysis.** Target framework requirements → current-state evidence → unmet
  obligations → remediation guidance and authority opinions. Every gap traceable to the
  specific requirement that flagged it.
- **Data Protection Impact Assessment.** Privacy regulation articles → national DPA
  guidance (Garante per la protezione dei dati personali) → privacy-pattern catalogue →
  applicable case law.

### Getting high-quality citations

Citation accuracy degrades when an agent's context fills up. Long inputs cause
retrieval-stage drift — the model recalls claim text correctly but misattributes the
source. Two practices keep accuracy high:

1. **Focused first pass, checking-agent second pass.** Query a small, relevant set of
   MCPs first, then run a separate agent whose only job is to re-resolve each citation
   against the source MCP and flag any that no longer match. The checking agent uses the
   same MCP tools as the synthesis agent.
2. **Pull the source text verbatim when in doubt.** Every citation an agent emits points
   back to a tool call against this server. You — or another agent — can call the same
   tool with the same identifier and read the raw statute, article, or standard text
   directly. If the verbatim text doesn't support what the agent claimed, the citation
   was misused, regardless of whether the identifier was real.

Both patterns work the same way self-hosted or through the gateway.

## Tools

| Tool | Description |
|---|---|
| `about` | Server metadata, dataset statistics, freshness, and provenance |
| `search_legislation` | Search Italian laws and codes by keyword (in Italian); BM25 ranking, provision-level results |
| `get_provision` | Retrieve the full text of a specific article from an Italian law (or all articles if no article number) |
| `list_sources` | Returns metadata about data sources backing this server (jurisdiction, authority, license) |
| `validate_citation` | Validate an Italian legal citation against the database — does the cited law and provision exist? |
| `build_legal_stance` | Build a citation set for a legal question by searching across all Italian legislation |
| `format_citation` | Format an Italian legal citation per standard conventions |
| `check_currency` | Is an Italian law or provision in force, amended, or repealed (abrogata)? |
| `get_eu_basis` | Get EU legal basis (directives, regulations) for an Italian law |
| `get_italian_implementations` | Find Italian laws that implement a specific EU directive or regulation |
| `search_eu_implementations` | Search for EU instruments that have been implemented or referenced by Italian laws |
| `get_provision_eu_basis` | Get EU legal basis for a specific provision within an Italian law (article-level) |
| `validate_eu_compliance` | Check EU compliance status — detects references to repealed EU directives |

## Two ways to use it

**Self-host (free, Apache 2.0)** — clone this repo, run the build to compile the local
SQLite database from the included data, point your MCP client at the local server.
Instructions below.

**Use the hosted gateway** — for production use against the curated, kept-fresh corpus
across the full Ansvar MCP fleet, with citation enrichment and multi-jurisdiction
fan-out — see [ansvar.eu](https://ansvar.eu).

## Self-hosting

### Requirements

- Node.js 20 or newer
- ~500 MB free disk for the built database (free tier)

### Install

```bash
git clone https://github.com/Ansvar-Systems/italian-law-mcp.git
cd italian-law-mcp
npm install
```

### Build the database

```bash
npm run build
npm run build:db
```

`build:db` compiles `data/source/` into `data/database.db` (the runtime SQLite the MCP
queries). To refresh against the latest Normattiva snapshot, the ingestion script
(`scripts/ingest.ts`) fetches from the upstream sources listed under **Sources** below;
review the source's published terms before running ingestion in a commercial
deployment.

Ingestion is a snapshot — your local copy goes stale until you re-run it. The hosted
gateway corpus is refreshed continuously.

### Configure your MCP client

```json
{
  "mcpServers": {
    "italian-law-mcp": {
      "command": "node",
      "args": ["/abs/path/to/italian-law-mcp/dist/index.js"]
    }
  }
}
```

For HTTP transport (Docker / Kubernetes), the runtime entry point is
`dist/http-server.js` listening on `PORT` (default 3000) at `/mcp`.

## Sources

| Source | Source URL | Terms / license URL | License basis | Attribution required | Commercial use | Redistribution / caching | Notes |
|---|---|---|---|---|---|---|---|
| Normattiva — consolidated Italian legislation | https://www.normattiva.it/ | [Note legali](https://www.normattiva.it/static/note_legali.html) | Public domain — Italian Copyright Law (Legge 633/1941) Art. 5 excludes official acts of the State from copyright | Recommended | Conditional | Conditional | Italian statutes themselves are not copyrighted; Normattiva's site terms restrict bulk reuse of the database structure. Verify use case. |
| Italian Senate — preparatory works (Akoma Ntoso XML) | https://dati.senato.it/ | [License](https://dati.senato.it/) | CC-BY-4.0 | Required | Yes | Yes | 759,592 preparatory works; included only in the premium overlay |

### Upstream license constraints

Ansvar attribution code: **`Italian-LDA-Art-5`** (declared in
`infrastructure/attribution-licenses.json` in the Ansvar architecture-documentation
repo). The publisher (Normattiva) also declares **CC-BY-4.0** as an overlay since
2026-01-01.

- **Normattiva.** Italian official acts (statutes, decrees) fall outside copyright under
  Art. 5 Legge 633/1941 — `atti ufficiali dello Stato e delle Amministrazioni pubbliche`.
  Normattiva's published terms (`note_legali.html`) restrict bulk reuse of the *database
  structure*; reproducing the underlying legislative texts is permitted, but bulk
  re-publication of Normattiva's curated/consolidated database may not be. The included
  ingestion script extracts legislative text, not the database structure.
- **Italian Senate (premium overlay).** Akoma Ntoso XML feeds at `dati.senato.it` are
  licensed CC-BY-4.0. Attribution is required; commercial reuse and redistribution are
  permitted. The premium overlay is not redistributed under this repository's Apache 2.0
  license — see [ansvar.eu](https://ansvar.eu) for the hosted gateway corpus.

### Coverage scope (narrow carve-out)

Italian Art. 5 is **NARROW**. Coverage is asymmetric across material types:

- **IN-SCOPE under Art. 5:** statutes (`leggi`), decrees (`decreti legislativi`,
  `decreti-legge`), official acts of the State, decrees and decisions of public
  administrations in their administrative-act capacity, ministerial circulars.
- **OUT-OF-SCOPE under Art. 5:** court judgments (`sentenze`) — Italian doctrine
  consistently treats court judgments as outside `atti ufficiali` for Art. 5
  purposes. A court-decisions tier would need a separate basis (D.Lgs. 36/2006
  PSI implementing the EU PSI Directive, or court-specific terms).
- **Why this matters:** This MCP currently ships the statute tier (Normattiva)
  under `Italian-LDA-Art-5`. Case-law tier (Cassazione, Corte Costituzionale,
  giustizia amministrativa) is not in scope and would require a separate
  licensing declaration before ingestion.

See `docs/audits/2026-05-17-eu-copyright-statutory-works-batch-1b-DE-IE-IT-NL-ES.md`
§3 in the Ansvar architecture-documentation repo for the verbatim Art. 5 text
and the coverage analysis.

## What this repository does not provide

This repository's source — the MCP server code, schema, and ingestion script — is
licensed under Apache 2.0. The license below covers the code in this repository only;
it does not extend to the upstream legal materials.

Running ingestion may download, cache, transform, and index materials from the listed
upstream sources. You are responsible for confirming that your use of those materials
complies with the source terms, attribution requirements, robots/rate limits, database
rights, copyright rules, and any commercial-use or redistribution limits that apply in
your jurisdiction.

## License

Apache 2.0 — see [LICENSE](LICENSE). Commercial use, modification, and redistribution of
**the source code in this repository** are permitted under that license. The license
does not extend to upstream legal materials downloaded by the ingestion script; those
remain governed by the source jurisdictions' own publishing terms (see Sources above).

## The Ansvar gateway

If you'd rather not self-host, [ansvar.eu](https://ansvar.eu) provides this MCP plus the
full Ansvar fleet through a single authenticated endpoint, with the curated production
corpus, multi-MCP query orchestration, and citation enrichment.

---

Issues: [github.com/Ansvar-Systems/italian-law-mcp/issues](https://github.com/Ansvar-Systems/italian-law-mcp/issues) · Security: <security@ansvar.eu>
