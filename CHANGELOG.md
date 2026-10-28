# Changelog

All notable changes to this project will be documented in this file.

## [1.0.0] - 2026-10-28

### Added
- Core PostgreSQL AST analysis engine powered by `pgsql-ast-parser` with regex fallback.
- 25 deterministic safety rules spanning Groups A through J (destructive, locking, indexes, columns, constraints, transactions, compatibility, dependencies, reversibility, large tables).
- Explainable risk-scoring system (0-100) with availability, data loss, locking, and compatibility dimension breakdown.
- CLI tool `migrationpilot` supporting file/dir analysis, rule catalog inspection, and Markdown/JSON/SARIF/HTML output.
- Web Application featuring live two-panel SQL analysis workspace, preset migrations, risk gauges, findings filter, and safe SQL remediation copy.
- Persistent analysis history and comparison diff tool powered by built-in SQLite.
- GitHub Actions workflows for continuous integration and pull-request SARIF scanning.
