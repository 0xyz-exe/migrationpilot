# Security Architecture & Threat Model

1. **Zero SQL Execution:** MigrationPilot is strictly a static analysis engine. User-provided SQL is never executed against live databases, nor is it passed to external command shells.
2. **Local-First & Offline:** Analysis runs entirely on local CPU with zero third-party AI APIs or external network calls.
3. **AST Parser Safety:** SQL parsing is handled by `pgsql-ast-parser` with structured AST objects, protecting against SQL injection vulnerabilities in the analysis workflow itself.
4. **Data Isolation:** Uploaded SQL files remain strictly local; persistent SQLite records store analysis history on the local machine only.
