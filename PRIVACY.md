# Privacy & Client Confidentiality

**IMPORTANT READING FOR LEGAL PROFESSIONALS**

This document addresses privacy and confidentiality considerations when using this Tool, with particular attention to professional obligations under Italian legal professional rules.

---

## Executive Summary

**Key Risks:**
- Queries through Claude API flow via Anthropic cloud infrastructure
- Query content may reveal client matters and privileged information
- Consiglio Nazionale Forense (CNF) rules require strict confidentiality (segreto professionale) and data handling controls

**Safe Use Options:**
1. **General Legal Research**: Use Tool for non-client-specific queries
2. **Local npm Package**: Install `@ansvar/italian-law-mcp` locally — database queries stay on your machine
3. **Remote Endpoint**: Vercel Streamable HTTP endpoint — queries transit Vercel infrastructure
4. **On-Premise Deployment**: Self-host with local LLM for privileged matters

---

## Data Flows and Infrastructure

### MCP (Model Context Protocol) Architecture

This Tool uses the **Model Context Protocol (MCP)** to communicate with AI clients:

```
User Query -> MCP Client (Claude Desktop/Cursor/API) -> Anthropic Cloud -> MCP Server -> Database
```

### Deployment Options

#### 1. Local npm Package (Most Private)

```bash
npx @ansvar/italian-law-mcp
```

- Database is local SQLite file on your machine
- No data transmitted to external servers (except to AI client for LLM processing)
- Full control over data at rest

#### 2. Remote Endpoint (Vercel)

```
Endpoint: https://italian-law-mcp.vercel.app/mcp
```

- Queries transit Vercel infrastructure
- Tool responses return through the same path
- Subject to Vercel's privacy policy

### What Gets Transmitted

When you use this Tool through an AI client:

- **Query Text**: Your search queries and tool parameters
- **Tool Responses**: Statute text, provision content, search results
- **Metadata**: Timestamps, request identifiers

**What Does NOT Get Transmitted:**
- Files on your computer
- Your full conversation history (depends on AI client configuration)

---

## Professional Obligations (Italy)

### CNF Code of Conduct and Professional Law

Italian lawyers (avvocati) are bound by strict confidentiality rules under the Codice Deontologico Forense (CNF Code of Professional Conduct) and Law 247/2012 (Nuova disciplina dell'ordinamento della professione forense).

#### Segreto Professionale (Professional Secrecy)

- All client communications are protected by segreto professionale (Articles 6 and 28 of the Codice Deontologico)
- Professional secrecy is also protected under the Italian Criminal Code (Article 622)
- Client identity may be confidential in sensitive matters
- Case strategy and legal analysis are protected
- Information that could identify clients or matters must be safeguarded

### GDPR and D.Lgs. 196/2003 — Client Data Processing

Under the **GDPR** and the Italian **Privacy Code (D.Lgs. 196/2003, as amended by D.Lgs. 101/2018)**:

- You are the **Titolare del Trattamento** (data controller) when processing client personal data
- AI service providers (Anthropic, Vercel) may be **Responsabili del Trattamento** (data processors)
- A **Data Processing Agreement (DPA)** is required under Article 28 GDPR
- Ensure adequate technical and organizational measures
- The **Garante per la Protezione dei Dati Personali** oversees compliance

---

## Risk Assessment by Use Case

### LOW RISK: General Legal Research

**Safe to use through any deployment:**

```
Example: "What does the Codice Civile say about contractual obligations?"
```

- No client identity involved
- No case-specific facts
- Publicly available legal information

### MEDIUM RISK: Anonymized Queries

**Use with caution:**

```
Example: "What are the penalties for market abuse under Italian financial law?"
```

- Query pattern may reveal you are working on a market abuse matter
- Anthropic/Vercel logs may link queries to your API key

### HIGH RISK: Client-Specific Queries

**DO NOT USE through cloud AI services:**

- Remove ALL identifying details
- Use the local npm package with a self-hosted LLM
- Or use commercial legal databases with proper DPAs

---

## Data Collection by This Tool

### What This Tool Collects

**Nothing.** This Tool:

- Does NOT log queries
- Does NOT store user data
- Does NOT track usage
- Does NOT use analytics
- Does NOT set cookies

The database is read-only. No user data is written to disk.

### What Third Parties May Collect

- **Anthropic** (if using Claude): Subject to [Anthropic Privacy Policy](https://www.anthropic.com/legal/privacy)
- **Vercel** (if using remote endpoint): Subject to [Vercel Privacy Policy](https://vercel.com/legal/privacy-policy)

---

## Recommendations

### For Solo Practitioners / Small Firms

1. Use local npm package for maximum privacy
2. General research: Cloud AI is acceptable for non-client queries
3. Client matters: Use commercial legal databases (De Jure, Lex24, Pluris)

### For Large Firms / Corporate Legal

1. Negotiate DPAs with AI service providers under GDPR Article 28
2. Consider on-premise deployment with self-hosted LLM
3. Train staff on safe vs. unsafe query patterns

### For Government / Public Sector

1. Use self-hosted deployment, no external APIs
2. Follow Italian government information security requirements (AgID guidelines)
3. Air-gapped option available for classified matters

---

## Questions and Support

- **Privacy Questions**: Open issue on [GitHub](https://github.com/Ansvar-Systems/italian-law-mcp/issues)
- **Anthropic Privacy**: Contact privacy@anthropic.com
- **CNF Guidance**: Consult Consiglio Nazionale Forense ethics guidance

---

**Last Updated**: 2026-02-22
**Tool Version**: 1.0.0
