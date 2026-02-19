# Italian Law MCP

[![npm](https://img.shields.io/npm/v/@ansvar/italian-law-mcp)](https://www.npmjs.com/package/@ansvar/italian-law-mcp)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)
[![CI](https://github.com/Ansvar-Systems/italian-law-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/Ansvar-Systems/italian-law-mcp/actions/workflows/ci.yml)
[![MCP Registry](https://img.shields.io/badge/MCP-Registry-green)](https://registry.modelcontextprotocol.io/)
[![OpenSSF Scorecard](https://img.shields.io/ossf-scorecard/github.com/Ansvar-Systems/italian-law-mcp)](https://securityscorecards.dev/viewer/?uri=github.com/Ansvar-Systems/italian-law-mcp)

A Model Context Protocol (MCP) server providing comprehensive access to Italian legislation, including data protection (Codice Privacy / GDPR), cybercrime (Codice Penale), corporate liability (D.Lgs. 231/2001), digital administration (CAD), and NIS2 transposition with Italian full-text search.

**MCP Registry:** `eu.ansvar/italian-law-mcp`
**npm:** `@ansvar/italian-law-mcp`
**License:** Apache-2.0

---

## Deployment Tier

**MEDIUM** -- dual tier, free database bundled in npm package.

| Tier | Platform | Database | Content |
|------|----------|----------|---------|
| **Free** | Vercel (Hobby) / npm (stdio) | Core legislation (~120-200 MB) | Key laws (Codice Privacy, Codice Penale cybercrime, Codice Civile, D.Lgs. 231/2001, CAD, NIS2 transposition), FTS search, EU cross-references |
| **Professional** | Azure Container Apps / Docker / Local | Full database (~600 MB - 1 GB) | + All decreti legislativi and leggi, Garante decisions and guidance, Corte di Cassazione summaries, regional legislation references |

The full database is larger due to the comprehensive scope of Italian legislation and the extensive body of Garante enforcement decisions. The free tier contains all key data protection, cybercrime, corporate liability, and digital administration legislation from Normattiva.

---

## Data Sources

| Source | Authority | Method | Update Frequency | License | Coverage |
|--------|-----------|--------|-----------------|---------|----------|
| [Normattiva](https://www.normattiva.it) | Istituto Poligrafico e Zecca dello Stato | HTML Scrape | Weekly | Government Open Data | All Italian legislation (consolidated and historical versions), codes, decreti, and leggi |

> Full provenance metadata: [`sources.yml`](./sources.yml)

---

## Quick Start

### Claude Desktop / Cursor (stdio)

```json
{
  "mcpServers": {
    "italian-law": {
      "command": "npx",
      "args": ["-y", "@ansvar/italian-law-mcp"]
    }
  }
}
```

### Vercel Streamable HTTP (ChatGPT / Claude.ai)

Once deployed, the public endpoint will be available at:

```
https://italian-law-mcp.vercel.app/api/mcp
```

---

## Tools

| Tool | Description | Free Tier | Professional |
|------|-------------|-----------|-------------|
| `get_provision` | Retrieve a specific article from an Italian law or code | Yes | Yes |
| `search_legislation` | Full-text search across all Italian legislation (Italian) | Yes | Yes |
| `list_laws` | List all available laws with metadata | Yes | Yes |
| `get_law_structure` | Get table of contents / structure of a law or code | Yes | Yes |
| `get_provision_eu_basis` | Cross-reference Italian law to EU directives/regulations | Yes | Yes |
| `search_decreti` | Search decreti legislativi and decreti-legge | No (upgrade) | Yes |
| `get_garante_guidance` | Retrieve Garante decisions and guidance | No (upgrade) | Yes |

---

## Key Legislation Covered

| Law | Identifier | Domain | Key Topics |
|-----|-----------|--------|------------|
| **Codice Privacy** | D.Lgs. 196/2003 (amended by D.Lgs. 101/2018) | Data Protection | Personal data processing, Garante oversight, consent, data subject rights, GDPR implementation, international transfers |
| **NIS2 Transposition** | D.Lgs. 138/2024 | Cybersecurity | Essential/important entity obligations, incident reporting, ACN oversight, supply chain security |
| **Codice Penale (cybercrime)** | Arts. 615-ter to 615-quinquies | Cybercrime | Unauthorized access (615-ter), credential theft (615-quater), malware distribution (615-quinquies) |
| **D.Lgs. 231/2001** | Corporate Criminal Liability | Corporate Governance | Organizational models, compliance programs, whistleblowing, cyber crime liability for companies |
| **CAD** | D.Lgs. 82/2005 | Digital Administration | SPID/CIE digital identity, PEC certified email, digital documents, e-government services |
| **Codice Civile** | R.D. 262/1942 | Civil Law | Legal capacity, obligations, contracts, property, personality rights |

---

## Database Estimates

| Component | Free Tier | Full (Professional) |
|-----------|-----------|---------------------|
| Core codes and key laws | ~80-140 MB | ~80-140 MB |
| All decreti and leggi | -- | ~400-600 MB |
| Garante decisions and guidance | -- | ~80-150 MB |
| Case law summaries | -- | ~80-150 MB |
| Cross-references and metadata | ~5 MB | ~15 MB |
| **Total** | **~120-200 MB** | **~600 MB - 1 GB** |

**Delivery strategy:** Free-tier DB bundled in npm package (Strategy A -- fits within Vercel 250 MB function limit). If final size exceeds 250 MB after ingestion, switch to Strategy B (runtime download from GitHub Releases).

---

## Regulatory Context

- **Supervisory Authority:** Garante per la protezione dei dati personali -- very active enforcement, significant fines and corrective measures
- **Codice Privacy** (D.Lgs. 196/2003) was substantially amended by D.Lgs. 101/2018 to implement GDPR, retaining the original decreto structure
- **D.Lgs. 231/2001** is a uniquely Italian framework establishing corporate criminal liability, including for cyber crimes -- critical for compliance programs
- **ACN** (Agenzia per la Cybersicurezza Nazionale) is the national cybersecurity authority overseeing NIS2 compliance
- **SPID** and **CIE** provide national digital identity infrastructure, governed by CAD
- **Normattiva** provides consolidated (vigente) versions with amendment tracking
- Italy is a founding EU member and GDPR compliance is a core regulatory requirement

---

## Development

```bash
# Clone the repository
git clone https://github.com/Ansvar-Systems/italian-law-mcp.git
cd italian-law-mcp

# Install dependencies
npm install

# Build
npm run build

# Run tests
npm test

# Run contract tests
npm run test:contract

# Build database (requires raw data in data/ directory)
npm run build:db

# Build free-tier database
npm run build:db:free

# Run drift detection
npm run drift:detect

# Full validation
npm run validate
```

---

## Architecture

```
italian-law-mcp/
├── .github/
│   ├── workflows/
│   │   ├── ci.yml                    # Test + lint + security scan
│   │   ├── publish.yml               # npm publish on version tags
│   │   ├── check-source-updates.yml  # Data freshness monitoring
│   │   └── drift-detect.yml          # Upstream drift detection
│   ├── SECURITY.md
│   ├── SECURITY-SETUP.md
│   └── ISSUE_TEMPLATE/
│       └── data-error.md
├── data/
│   └── .gitkeep
├── fixtures/
│   ├── golden-tests.json             # 12 contract tests
│   ├── golden-hashes.json            # 6 drift detection anchors
│   └── README.md
├── scripts/
│   ├── build-db.ts
│   ├── build-db-free.ts
│   ├── download-free-db.sh
│   ├── ingest.ts
│   ├── drift-detect.ts
│   └── check-source-updates.ts
├── src/
│   ├── server.ts
│   ├── db.ts
│   └── tools/
│       ├── get-provision.ts
│       ├── search-legislation.ts
│       ├── list-laws.ts
│       ├── get-law-structure.ts
│       ├── get-provision-eu-basis.ts
│       ├── search-decreti.ts
│       └── get-garante-guidance.ts
├── __tests__/
│   ├── unit/
│   ├── contract/
│   │   └── golden.test.ts
│   └── integration/
├── sources.yml
├── server.json
├── package.json
├── tsconfig.json
├── vercel.json
├── CHANGELOG.md
├── LICENSE
└── README.md
```

---

## Notes on Italian Data Protection Landscape

**Codice Privacy** (D.Lgs. 196/2003) was one of the first comprehensive data protection laws in the EU:

- Amended by **D.Lgs. 101/2018** to align with GDPR, retaining the original legislative structure
- **Garante** is one of the most active DPAs in Europe with significant enforcement actions
- Italy maintains **additional protections** for health data, genetic data, and judicial data beyond GDPR minimums

**D.Lgs. 231/2001** (Corporate Criminal Liability) is unique and critical:
- Companies can be held **criminally liable** for crimes committed by employees
- Includes **cyber crimes** (Arts. 24-bis) -- unauthorized access, data damage, computer fraud
- Requires **organizational models** (modelli organizzativi) for compliance
- Companies must demonstrate **adequate prevention measures** to avoid liability

Italy is the **EU's third largest economy** and GDPR compliance combined with D.Lgs. 231/2001 organizational models creates a distinctive compliance landscape.

---

## Related Documents

- [MCP Quality Standard](../../mcp-quality-standard.md) -- quality requirements for all Ansvar MCPs
- [MCP Infrastructure Blueprint](../../mcp-infrastructure-blueprint.md) -- infrastructure implementation templates
- [MCP Deployment Tiers](../../mcp-deployment-tiers.md) -- free vs. professional tier strategy
- [MCP Server Registry](../../mcp-server-registry.md) -- operational registry of all MCPs
- [MCP Remote Access](../../mcp-remote-access.md) -- public Vercel endpoint URLs

---

## Security

Report vulnerabilities to **security@ansvar.eu** (48-hour acknowledgment SLA).

See [SECURITY.md](.github/SECURITY.md) for full disclosure policy.

---

**Maintained by:** Ansvar Systems Engineering
**Contact:** hello@ansvar.eu
