# Known Limitations

1. **Static Inference Only:** Without an optional `schemaContext`, MigrationPilot evaluates DDL statements based on generic PostgreSQL lock semantics rather than live production table row counts.
2. **Third-Party Extensions:** Syntax specific to non-core PostgreSQL extensions (e.g., Citus distributed tables or Timescale hypertables) falls back to token and regex classification.
3. **External Transaction Wrappers:** Migration runners (such as Flyway, Prisma, or Liquibase) may inject transactional wrappers outside the SQL migration file.
