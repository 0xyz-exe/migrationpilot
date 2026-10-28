# PostgreSQL Version Compatibility

MigrationPilot models lock behavior and table rewrite semantics across major PostgreSQL versions (12 through 17).

- **PostgreSQL 11+:** `ADD COLUMN ... DEFAULT <constant>` is a fast metadata-only operation and does not rewrite the table. Volatile defaults (e.g. `random()`) still trigger full table rewrites.
- **PostgreSQL 12+:** `ALTER TABLE ... ALTER COLUMN ... SET NOT NULL` is instantaneous if a verified `CHECK (col IS NOT NULL)` constraint already exists.
- **PostgreSQL 15+:** `CREATE OR REPLACE TRIGGER` is supported natively.
- **PostgreSQL 16+:** Logical replication decoding enhancements on table rewrites.
- **PostgreSQL 17+:** Improved memory management during concurrent vacuuming and index builds.
