import {
  MigrationAnalysisInput,
  MigrationFinding,
  ParsedStatement,
  RuleCategory,
  Severity,
  Confidence,
} from "../types/index.js";
import { RULES_MAP } from "../catalog/rules.js";

interface RuleContext {
  statement: ParsedStatement;
  input: MigrationAnalysisInput;
  inTransaction: boolean;
  hasLockTimeout: boolean;
  totalStatements: number;
}

export function evaluateRules(
  statements: ParsedStatement[],
  input: MigrationAnalysisInput
): MigrationFinding[] {
  const findings: MigrationFinding[] = [];
  const targetPgVersion = parseInt(input.targetPostgresVersion || "16", 10);
  const isProduction = (input.environment || "production") === "production";
  const disabledRules = new Set(input.options?.disabledRules || []);

  // Global script inspection: does it set lock_timeout?
  const fullSql = input.sql;
  const hasLockTimeout = /set\s+(local\s+)?lock_timeout\s*=/i.test(fullSql);

  let inTransaction = false;
  let txDdlCount = 0;
  let txStartLine = 1;

  for (let idx = 0; idx < statements.length; idx++) {
    const stmt = statements[idx];
    const clean = stmt.cleanSql;
    const upper = clean.toUpperCase();

    // Track transaction boundary
    if (/^(BEGIN|START\s+TRANSACTION)\b/i.test(upper)) {
      inTransaction = true;
      txDdlCount = 0;
      txStartLine = stmt.startLine;
      continue;
    }
    if (/^(COMMIT|ROLLBACK|END)\b/i.test(upper)) {
      if (inTransaction && txDdlCount > 3) {
        // MP051: Multi-statement DDL transaction
        addFinding(findings, "MP051", stmt, {
          evidence: `Transaction spanning lines ${txStartLine}-${stmt.endLine} executed ${txDdlCount} heavy DDL statements`,
          impact: "Locks accumulated across multiple DDL statements remain held until COMMIT, heightening lock contention.",
          mitigationSql: "-- Split DDL statements into separate individual transactions with lock timeouts.",
        });
      }
      inTransaction = false;
      txDdlCount = 0;
      continue;
    }

    const ast = stmt.ast;
    let isDdl = false;

    // --- 1. AST-based Evaluations ---
    if (ast) {
      // A. DROP TABLE
      if (ast.type === "drop table") {
        isDdl = true;
        const tableName = ast.name?.name || "table";
        addFinding(findings, "MP001", stmt, {
          evidence: stmt.cleanSql,
          impact: `All rows and indexes of '${tableName}' will be destroyed immediately.`,
          mitigationSql: `ALTER TABLE ${tableName} RENAME TO ${tableName}_archived;`,
        });
        addFinding(findings, "MP080", stmt, {
          evidence: `Irreversible operation on table '${tableName}'`,
          impact: "Data cannot be recovered without a full database backup or WAL restore.",
        });
      }

      // B. ALTER TABLE
      else if (ast.type === "alter table") {
        isDdl = true;
        const tableName = ast.table?.name || "unknown";

        // Check large-table risk (Rule MP090)
        checkLargeTableRisk(findings, tableName, stmt, input);

        // Check schema dependency (Rule MP070)
        checkSchemaDependency(findings, tableName, stmt, input);

        // Check lock_timeout safety (Rule MP012)
        if (!hasLockTimeout && isProduction) {
          addFinding(findings, "MP012", stmt, {
            evidence: `ALTER TABLE on '${tableName}' without prior SET lock_timeout`,
            impact: "Migration may queue behind long-running queries, blocking other connections.",
            mitigationSql: `SET lock_timeout = '3s';\n${stmt.cleanSql};\nRESET lock_timeout;`,
          });
        }

        const changes = ast.changes || [];
        for (const change of changes) {
          // DROP COLUMN
          if (change.type === "drop column") {
            const colName = change.column?.name || "column";
            addFinding(findings, "MP002", stmt, {
              evidence: `DROP COLUMN ${colName}`,
              impact: `Column '${colName}' data in table '${tableName}' will be deleted permanently.`,
              mitigationSql: `-- Step 1: Remove app references to ${colName}\n-- Step 2: Drop column\nALTER TABLE ${tableName} DROP COLUMN ${colName};`,
            });
            addFinding(findings, "MP061", stmt, {
              evidence: `DROP COLUMN ${colName} on PostgreSQL ${targetPgVersion}`,
              impact: "Physical disk storage will not be reclaimed until vacuuming or table rewrite.",
            });
            addFinding(findings, "MP080", stmt, {
              evidence: `Column data for '${colName}' cannot be recovered after drop without backups.`,
            });
          }

          // ADD COLUMN
          else if (change.type === "add column") {
            const col = change.column;
            const colName = col?.name?.name || "col";
            const constraints = col?.constraints || [];
            const hasNotNull = constraints.some((c: any) => c.type === "not null");
            const hasDefault = constraints.some((c: any) => c.type === "default");

            // ACCESS EXCLUSIVE lock warning (MP010)
            addFinding(findings, "MP010", stmt, {
              evidence: `ALTER TABLE ${tableName} ADD COLUMN ${colName}`,
              impact: `Takes ACCESS EXCLUSIVE lock on '${tableName}', blocking concurrent SELECT, INSERT, UPDATE, and DELETE.`,
            });

            // In older PG (<11) or with volatile default: table rewrite (MP060, MP011)
            if (hasDefault) {
              if (targetPgVersion < 11) {
                addFinding(findings, "MP060", stmt, {
                  evidence: `ADD COLUMN with DEFAULT on PostgreSQL ${targetPgVersion}`,
                  impact: `PostgreSQL < 11 rewrites the whole table '${tableName}' when adding a column with DEFAULT.`,
                  mitigationSql: `ALTER TABLE ${tableName} ADD COLUMN ${colName} ${col?.dataType?.name || "TEXT"};\n-- Backfill\nALTER TABLE ${tableName} ALTER COLUMN ${colName} SET DEFAULT ...;`,
                });
              } else if (/clock_timestamp\(\)|random\(\)|uuid_generate_v4\(\)|gen_random_uuid\(\)/i.test(stmt.cleanSql)) {
                // Volatile default still rewrites in PG 11+
                addFinding(findings, "MP011", stmt, {
                  evidence: `ADD COLUMN with volatile DEFAULT expression`,
                  impact: `Volatile default forces a full table rewrite on '${tableName}'.`,
                  mitigationSql: `ALTER TABLE ${tableName} ADD COLUMN ${colName} ${col?.dataType?.name || "TEXT"};\n-- Backfill in batches`,
                });
              }
            }

            // ADD COLUMN ... NOT NULL without DEFAULT
            if (hasNotNull && !hasDefault) {
              addFinding(findings, "MP030", stmt, {
                evidence: `ADD COLUMN ${colName} NOT NULL without default value`,
                impact: `Fails if '${tableName}' already contains any rows.`,
                mitigationSql: `-- Add nullable first, backfill rows, then add check constraint not valid`,
              });
            }
          }

          // ALTER COLUMN
          else if (change.type === "alter column") {
            const colName = change.column?.name || "column";
            // Type alteration
            if (change.alter?.type === "set data type" || change.dataType || /TYPE\s+/i.test(stmt.cleanSql)) {
              addFinding(findings, "MP031", stmt, {
                evidence: `ALTER COLUMN ${colName} TYPE ...`,
                impact: `Type change rewrites '${tableName}', locking table against reads and writes.`,
                mitigationSql: `-- Safe column type change:\n-- 1. ADD COLUMN ${colName}_new ...\n-- 2. Backfill rows in batches\n-- 3. Swap column names`,
              });
              addFinding(findings, "MP011", stmt, {
                evidence: `Table rewrite triggered by column type modification on '${tableName}'`,
                impact: "Table rewrite can take minutes or hours on large tables, causing timeouts.",
              });
            }
            // SET NOT NULL
            if (/SET\s+NOT\s+NULL/i.test(stmt.cleanSql)) {
              addFinding(findings, "MP030", stmt, {
                evidence: `ALTER COLUMN ${colName} SET NOT NULL`,
                impact: `Full table scan under ACCESS EXCLUSIVE lock to verify non-nullability on '${tableName}'.`,
                mitigationSql: `-- Safe NOT NULL pattern (PostgreSQL 12+):\nALTER TABLE ${tableName} ADD CONSTRAINT check_${colName}_not_null CHECK (${colName} IS NOT NULL) NOT VALID;\nALTER TABLE ${tableName} VALIDATE CONSTRAINT check_${colName}_not_null;\nALTER TABLE ${tableName} ALTER COLUMN ${colName} SET NOT NULL;\nALTER TABLE ${tableName} DROP CONSTRAINT check_${colName}_not_null;`,
              });
            }
            // DROP DEFAULT / SET DEFAULT
            if (/DROP\s+DEFAULT|SET\s+DEFAULT/i.test(stmt.cleanSql)) {
              addFinding(findings, "MP032", stmt, {
                evidence: `Altering default on column ${colName}`,
                impact: "Applications with in-flight transactions or older code may produce unexpected data formats.",
              });
            }
          }

          // ADD CONSTRAINT
          else if (change.type === "add constraint") {
            const isNotValid = /NOT\s+VALID/i.test(stmt.cleanSql);
            // Foreign key
            if (change.constraint?.type === "foreign key" || /FOREIGN\s+KEY/i.test(stmt.cleanSql)) {
              if (!isNotValid) {
                addFinding(findings, "MP040", stmt, {
                  evidence: `ADD FOREIGN KEY without NOT VALID on '${tableName}'`,
                  impact: `Scans '${tableName}' and referenced table with SHARE ROW EXCLUSIVE lock, blocking writes.`,
                  mitigationSql: `${stmt.cleanSql.replace(/;?$/, "")} NOT VALID;\nALTER TABLE ${tableName} VALIDATE CONSTRAINT ...;`,
                });
              }
            }
            // Check constraint
            else if (change.constraint?.type === "check" || /CHECK\s*\(/i.test(stmt.cleanSql)) {
              if (!isNotValid) {
                addFinding(findings, "MP041", stmt, {
                  evidence: `ADD CHECK constraint without NOT VALID on '${tableName}'`,
                  impact: `Scans entire table '${tableName}' under ACCESS EXCLUSIVE lock.`,
                  mitigationSql: `${stmt.cleanSql.replace(/;?$/, "")} NOT VALID;\nALTER TABLE ${tableName} VALIDATE CONSTRAINT ...;`,
                });
              }
            }
            // Unique constraint
            else if (change.constraint?.type === "unique" || /UNIQUE\s*\(/i.test(stmt.cleanSql)) {
              addFinding(findings, "MP042", stmt, {
                evidence: `ADD CONSTRAINT UNIQUE on '${tableName}'`,
                impact: `Creates unique index synchronously, blocking concurrent writes to '${tableName}'.`,
                mitigationSql: `-- 1. Create unique index concurrently:\nCREATE UNIQUE INDEX CONCURRENTLY idx_uniq_${tableName} ON ${tableName}(...);\n-- 2. Attach unique constraint:\nALTER TABLE ${tableName} ADD CONSTRAINT ... UNIQUE USING INDEX idx_uniq_${tableName};`,
              });
            }
          }
        }
      }

      // C. CREATE INDEX
      else if (ast.type === "create index") {
        isDdl = true;
        const isConcurrent = Boolean(ast.concurrently) || /CREATE\s+(UNIQUE\s+)?INDEX\s+CONCURRENTLY/i.test(stmt.cleanSql);
        const tableName = ast.table?.name || "table";

        checkLargeTableRisk(findings, tableName, stmt, input);

        if (!isConcurrent) {
          addFinding(findings, "MP020", stmt, {
            evidence: stmt.cleanSql,
            impact: `Takes SHARE lock on '${tableName}', blocking all INSERT, UPDATE, and DELETE operations until index build completes.`,
            mitigationSql: stmt.cleanSql.replace(/CREATE\s+(UNIQUE\s+)?INDEX/i, (m) => `${m} CONCURRENTLY`),
          });
        }

        if (isConcurrent && inTransaction) {
          addFinding(findings, "MP022", stmt, {
            evidence: `CREATE INDEX CONCURRENTLY executed inside active transaction block`,
            impact: "PostgreSQL will immediately abort execution with error: CREATE INDEX CONCURRENTLY cannot run inside a transaction block.",
            mitigationSql: "-- Remove BEGIN / COMMIT wrappers around concurrent index operations.",
          });
          addFinding(findings, "MP050", stmt, {
            evidence: "Concurrent index command in transaction",
            impact: "Transaction will fail immediately.",
          });
        }
      }

      // D. DROP INDEX
      else if (ast.type === "drop index") {
        isDdl = true;
        const isConcurrent = Boolean(ast.concurrently) || /DROP\s+INDEX\s+CONCURRENTLY/i.test(stmt.cleanSql);
        if (!isConcurrent) {
          addFinding(findings, "MP021", stmt, {
            evidence: stmt.cleanSql,
            impact: "Takes ACCESS EXCLUSIVE lock on the indexed table, blocking queries and updates.",
            mitigationSql: stmt.cleanSql.replace(/DROP\s+INDEX/i, "DROP INDEX CONCURRENTLY"),
          });
        }
      }
    }

    // --- 2. Fallback / Regex / DDL Classifier ---
    // If AST didn't capture or for statements not parsed by AST
    if (/^DROP\s+SCHEMA\b/i.test(upper)) {
      isDdl = true;
      addFinding(findings, "MP003", stmt, {
        evidence: stmt.cleanSql,
        impact: "Destroys schema and potentially all contained database objects.",
      });
      addFinding(findings, "MP080", stmt, {
        evidence: "Irreversible DROP SCHEMA operation",
      });
    } else if (/^DROP\s+DATABASE\b/i.test(upper)) {
      isDdl = true;
      addFinding(findings, "MP004", stmt, {
        evidence: stmt.cleanSql,
        impact: "Destroys entire database catalog. Should not be in application migrations.",
      });
    } else if (/^TRUNCATE\b/i.test(upper)) {
      isDdl = true;
      addFinding(findings, "MP005", stmt, {
        evidence: stmt.cleanSql,
        impact: "Empties table data immediately without firing normal row delete triggers.",
      });
      addFinding(findings, "MP080", stmt, {
        evidence: "Irreversible table truncation",
      });
    } else if (/^VACUUM\b/i.test(upper) || /^CLUSTER\b/i.test(upper)) {
      if (inTransaction) {
        addFinding(findings, "MP050", stmt, {
          evidence: `${upper.split(" ")[0]} inside transaction block`,
          impact: "PostgreSQL rejects VACUUM/CLUSTER commands within transaction blocks.",
        });
      }
    }

    if (inTransaction && isDdl) {
      txDdlCount++;
    }
  }

  // Deduplicate findings by statementIndex + ruleId
  const seen = new Set<string>();
  const deduplicated: MigrationFinding[] = [];

  for (const f of findings) {
    if (disabledRules.has(f.ruleId)) continue;
    const key = `${f.statementIndex}:${f.ruleId}`;
    if (!seen.has(key)) {
      seen.add(key);
      deduplicated.push(f);
    }
  }

  return deduplicated;
}

function addFinding(
  findings: MigrationFinding[],
  ruleId: string,
  stmt: ParsedStatement,
  overrides?: {
    evidence?: string;
    impact?: string;
    mitigationSql?: string;
  }
) {
  const rule = RULES_MAP.get(ruleId);
  if (!rule) return;

  findings.push({
    id: `${ruleId}-${stmt.index + 1}-${findings.length + 1}`,
    ruleId: rule.id,
    title: rule.title,
    description: rule.description,
    severity: rule.defaultSeverity,
    confidence: rule.confidence,
    category: rule.category,
    statementIndex: stmt.index,
    line: stmt.startLine,
    column: stmt.startCol,
    evidence: overrides?.evidence || stmt.cleanSql,
    impact: overrides?.impact || rule.description,
    recommendation: rule.remediation,
    references: [rule.docUrl],
    mitigationSql: overrides?.mitigationSql || rule.exampleGoodSql,
  });
}

function checkLargeTableRisk(
  findings: MigrationFinding[],
  tableName: string,
  stmt: ParsedStatement,
  input: MigrationAnalysisInput
) {
  const tables = input.schemaContext?.tables;
  if (!tables) return;
  const table = tables[tableName] || tables[tableName.toLowerCase()];
  if (!table) return;

  if ((table.rowCount && table.rowCount > 100000) || (table.sizeMb && table.sizeMb > 500)) {
    addFinding(findings, "MP090", stmt, {
      evidence: `Table '${tableName}' has ~${table.rowCount?.toLocaleString() || "unknown"} rows (${table.sizeMb || "unknown"} MB)`,
      impact: `Executing heavy DDL against high-volume table '${tableName}' risks severe lock queueing and failover.`,
    });
  }
}

function checkSchemaDependency(
  findings: MigrationFinding[],
  tableName: string,
  stmt: ParsedStatement,
  input: MigrationAnalysisInput
) {
  const tables = input.schemaContext?.tables;
  if (!tables || Object.keys(tables).length === 0) return;
  const exists = Boolean(tables[tableName] || tables[tableName.toLowerCase()]);
  if (!exists) {
    addFinding(findings, "MP070", stmt, {
      evidence: `Table '${tableName}' not defined in provided schemaContext`,
      impact: `Target table '${tableName}' may not exist yet or depends on an unexecuted prior migration.`,
    });
  }
}
