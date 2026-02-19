# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.0.0] - 2026-XX-XX
### Added
- Initial release of Italian Law MCP
- `search_legislation` tool for full-text search across all Italian legislation (Italian)
- `get_provision` tool for retrieving specific articles
- `get_provision_eu_basis` tool for EU cross-references (Codice Privacy to GDPR)
- `list_laws` tool for browsing available legislation
- `get_law_structure` tool for law table of contents
- `search_decreti` tool for decreti legislativi and decreti-legge (Professional tier)
- `get_garante_guidance` tool for Garante decisions and guidance (Professional tier)
- Contract tests with 12 golden test cases
- Drift detection with 6 stable provision anchors
- Health and version endpoints
- Vercel deployment (dual tier bundled free)
- npm package with stdio transport
- MCP Registry publishing
- Italian language full-text search support
- Normattiva structured HTML integration

[Unreleased]: https://github.com/Ansvar-Systems/italian-law-mcp/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/Ansvar-Systems/italian-law-mcp/releases/tag/v1.0.0
