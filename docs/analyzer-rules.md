# MigrationPilot Rules Catalog Reference

MigrationPilot implements 25 safety rules categorized across 10 functional groups.

| Rule ID | Category | Default Severity | Description |
|---|---|---|---|
| **MP001** | Destructive | CRITICAL | DROP TABLE destroys table rows, indexes, and constraints. |
| **MP002** | Destructive | HIGH | DROP COLUMN permanently deletes column data. |
| **MP003** | Destructive | CRITICAL | DROP SCHEMA destroys entire namespace and objects. |
| **MP004** | Destructive | CRITICAL | DROP DATABASE destroys database catalog. |
| **MP005** | Destructive | HIGH | TRUNCATE empties all rows and acquires ACCESS EXCLUSIVE lock. |
| **MP010** | Locking | HIGH | ALTER TABLE operation takes heavy ACCESS EXCLUSIVE lock. |
| **MP011** | Locking | HIGH | Operation triggers full table rewrite holding heavy lock. |
| **MP012** | Locking | MEDIUM | Migration lacks `SET lock_timeout` safeguard. |
| **MP020** | Index | HIGH | CREATE INDEX without `CONCURRENTLY` blocks table writes. |
| **MP021** | Index | MEDIUM | DROP INDEX without `CONCURRENTLY` acquires heavy table lock. |
| **MP022** | Index | CRITICAL | `CREATE INDEX CONCURRENTLY` inside transaction block aborts execution. |
| **MP023** | Index | LOW | Redundant duplicate index on identical leading columns. |
| **MP030** | Column | HIGH | `SET NOT NULL` scans entire table under exclusive lock. |
| **MP031** | Column | HIGH | Changing column data types causes table rewrite. |
| **MP032** | Column | LOW | Changing or dropping column default value. |
| **MP040** | Constraint | HIGH | ADD FOREIGN KEY without `NOT VALID` blocks writes. |
| **MP041** | Constraint | MEDIUM | ADD CHECK constraint without `NOT VALID` scans table. |
| **MP042** | Constraint | HIGH | ADD CONSTRAINT UNIQUE creates index synchronously. |
| **MP050** | Transaction | CRITICAL | Disallowed command inside transaction block (VACUUM, CONCURRENTLY). |
| **MP051** | Transaction | MEDIUM | Long-running transaction accumulating multiple heavy DDL locks. |
| **MP060** | Compatibility | MEDIUM | ADD COLUMN with DEFAULT causes table rewrite in older PostgreSQL (<11). |
| **MP061** | Compatibility | INFO | DROP COLUMN leaves disk space unreclaimed until vacuuming. |
| **MP070** | Dependency | MEDIUM | Target table not declared in provided schema context. |
| **MP080** | Reversibility | HIGH | Irreversible schema operation that cannot be rolled back automatically. |
| **MP090** | Large Table | CRITICAL | Heavy DDL targeting high-volume table (>100k rows or >500MB). |
