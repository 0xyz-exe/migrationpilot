# MigrationPilot System Architecture

MigrationPilot is engineered with strict modularity between static SQL parsing, deterministic rule evaluation, risk scoring, report generation, and presentation layers.

```
┌────────────────────────────────────────────────────────┐
│                   Migration SQL Input                  │
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼
              ┌───────────────────────────┐
              │ Statement Splitter & Lexer │
              │ (Comments, Dollar Quotes) │
              └─────────────┬─────────────┘
                            │
                            ▼
              ┌───────────────────────────┐
              │   PostgreSQL AST Parser   │
              │   (pgsql-ast-parser)      │
              └─────────────┬─────────────┘
                            │
                            ▼
              ┌───────────────────────────┐
              │  Modular Rule Engine (A-J)│
              │  25 Safety Rules Evaluator│
              └─────────────┬─────────────┘
                            │
                            ▼
              ┌───────────────────────────┐
              │  Risk Scorer & Breakdown  │
              │  (0-100 Explainable Score)│
              └─────────────┬─────────────┘
                            │
         ┌──────────────────┴──────────────────┐
         ▼                                     ▼
┌──────────────────┐                  ┌──────────────────┐
│  CLI Executable  │                  │   Web Workspace  │
│  (JSON / SARIF)  │                  │  (React UI + API)│
└──────────────────┘                  └──────────────────┘
```

## Packages

- **`@migrationpilot/analyzer`**: Zero-dependency (no UI, no network, no live DB) core library. Accepts migration SQL and produces deterministic findings and risk scores.
- **`@migrationpilot/cli`**: Node-based CLI (`bin/migrationpilot.js`) for local developer workflows and CI/CD pipelines.
- **`@migrationpilot/web`**: Developer-focused React web app and REST API server with local SQLite persistence for analysis history and comparisons.
