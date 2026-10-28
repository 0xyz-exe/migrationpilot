import { describe, it, expect } from "vitest";
import {
  analyzeMigration,
  getRulesCatalog,
  explainRule,
  formatMarkdownReport,
  formatSarifReport,
  formatHtmlReport,
} from "../src/index.js";

describe("MigrationPilot Core Analyzer", () => {
  it("Test 1: detects destructive DROP TABLE (MP001 & MP080)", () => {
    const res = analyzeMigration({
      sql: "DROP TABLE users;",
    });

    expect(res.findings.length).toBeGreaterThan(0);
    const mp001 = res.findings.find((f) => f.ruleId === "MP001");
    expect(mp001).toBeDefined();
    expect(mp001?.severity).toBe("critical");
    expect(mp001?.category).toBe("destructive");

    const mp080 = res.findings.find((f) => f.ruleId === "MP080");
    expect(mp080).toBeDefined();
    expect(res.summary.blocked).toBe(true);
    expect(res.summary.riskScore).toBeGreaterThanOrEqual(60);
  });

  it("Test 2: does NOT flag CREATE INDEX CONCURRENTLY as blocking writes", () => {
    const res = analyzeMigration({
      sql: "CREATE INDEX CONCURRENTLY idx_orders_status ON orders(status);",
    });

    const mp020 = res.findings.find((f) => f.ruleId === "MP020");
    expect(mp020).toBeUndefined();
    expect(res.summary.blocked).toBe(false);
  });

  it("Test 3: detects CREATE INDEX CONCURRENTLY inside explicit transaction block (MP022 & MP050)", () => {
    const sql = `
      BEGIN;
      CREATE INDEX CONCURRENTLY idx_orders_status ON orders(status);
      COMMIT;
    `;
    const res = analyzeMigration({ sql });

    const mp022 = res.findings.find((f) => f.ruleId === "MP022");
    expect(mp022).toBeDefined();
    expect(mp022?.severity).toBe("critical");

    const mp050 = res.findings.find((f) => f.ruleId === "MP050");
    expect(mp050).toBeDefined();
    expect(res.summary.blocked).toBe(true);
  });

  it("Test 4: detects ALTER TABLE users DROP COLUMN email (MP002)", () => {
    const res = analyzeMigration({
      sql: "ALTER TABLE users DROP COLUMN email;",
    });

    const mp002 = res.findings.find((f) => f.ruleId === "MP002");
    expect(mp002).toBeDefined();
    expect(mp002?.severity).toBe("high");
    expect(mp002?.mitigationSql).toContain("DROP COLUMN");
  });

  it("Test 5: flags non-concurrent CREATE INDEX (MP020)", () => {
    const res = analyzeMigration({
      sql: "CREATE INDEX idx_orders_status ON orders(status);",
    });

    const mp020 = res.findings.find((f) => f.ruleId === "MP020");
    expect(mp020).toBeDefined();
    expect(mp020?.severity).toBe("high");
    expect(mp020?.mitigationSql).toContain("CREATE INDEX CONCURRENTLY");
  });

  it("Test 6: flags ADD FOREIGN KEY without NOT VALID (MP040)", () => {
    const sql = "ALTER TABLE orders ADD CONSTRAINT fk_user FOREIGN KEY (user_id) REFERENCES users(id);";
    const res = analyzeMigration({ sql });

    const mp040 = res.findings.find((f) => f.ruleId === "MP040");
    expect(mp040).toBeDefined();
    expect(mp040?.mitigationSql).toContain("NOT VALID");
  });

  it("Test 7: permits ADD FOREIGN KEY with NOT VALID", () => {
    const sql = "ALTER TABLE orders ADD CONSTRAINT fk_user FOREIGN KEY (user_id) REFERENCES users(id) NOT VALID;";
    const res = analyzeMigration({ sql });

    const mp040 = res.findings.find((f) => f.ruleId === "MP040");
    expect(mp040).toBeUndefined();
  });

  it("Test 8: flags ADD CHECK constraint without NOT VALID (MP041)", () => {
    const sql = "ALTER TABLE items ADD CONSTRAINT check_pos CHECK (price > 0);";
    const res = analyzeMigration({ sql });

    const mp041 = res.findings.find((f) => f.ruleId === "MP041");
    expect(mp041).toBeDefined();
  });

  it("Test 9: flags column type changes that rewrite table (MP031 & MP011)", () => {
    const sql = "ALTER TABLE products ALTER COLUMN description TYPE VARCHAR(255);";
    const res = analyzeMigration({ sql });

    expect(res.findings.some((f) => f.ruleId === "MP031")).toBe(true);
    expect(res.findings.some((f) => f.ruleId === "MP011")).toBe(true);
  });

  it("Test 10: flags large table risks when schemaContext has high row counts (MP090)", () => {
    const sql = "ALTER TABLE big_events ADD COLUMN payload JSONB;";
    const res = analyzeMigration({
      sql,
      schemaContext: {
        tables: {
          big_events: {
            columns: ["id", "timestamp"],
            rowCount: 2500000,
            sizeMb: 1200,
          },
        },
      },
    });

    const mp090 = res.findings.find((f) => f.ruleId === "MP090");
    expect(mp090).toBeDefined();
    expect(mp090?.severity).toBe("critical");
  });

  it("Test 11: flags missing tables in schemaContext (MP070)", () => {
    const sql = "ALTER TABLE nonexistent_table ADD COLUMN note TEXT;";
    const res = analyzeMigration({
      sql,
      schemaContext: {
        tables: {
          existing_table: { columns: ["id"] },
        },
      },
    });

    const mp070 = res.findings.find((f) => f.ruleId === "MP070");
    expect(mp070).toBeDefined();
  });

  it("Test 12: handles comments, dollar quoting, and multiline SQL cleanly", () => {
    const sql = `
      -- Set lock timeout for production safety
      SET lock_timeout = '2s';

      /* Create audit function with dollar quote block */
      CREATE OR REPLACE FUNCTION log_event() RETURNS trigger AS $$
      BEGIN
        INSERT INTO audit_log(event_name) VALUES ('triggered');
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;

      -- Add column with check
      ALTER TABLE accounts ADD COLUMN status VARCHAR(20) NOT NULL DEFAULT 'active';
    `;
    const res = analyzeMigration({ sql });
    expect(res.summary.totalStatements).toBeGreaterThanOrEqual(2);
  });

  it("Test 13: generates Markdown, SARIF, and HTML reports correctly", () => {
    const res = analyzeMigration({
      sql: "ALTER TABLE users DROP COLUMN token; CREATE INDEX idx_users_email ON users(email);",
      migrationName: "20261028_user_changes.sql",
    });

    const md = formatMarkdownReport(res);
    expect(md).toContain("MigrationPilot Safety Report");
    expect(md).toContain("MP002");
    expect(md).toContain("MP020");

    const sarifStr = formatSarifReport(res);
    const sarif = JSON.parse(sarifStr);
    expect(sarif.version).toBe("2.1.0");
    expect(sarif.runs[0].results.length).toBeGreaterThan(0);

    const html = formatHtmlReport(res);
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("MigrationPilot Safety Report");
  });

  it("Test 14: rules catalog and rule explanation lookups", () => {
    const catalog = getRulesCatalog();
    expect(catalog.length).toBeGreaterThanOrEqual(15);

    const rule001 = explainRule("MP001");
    expect(rule001).toBeDefined();
    expect(rule001?.name).toBe("drop-table");

    const rule020 = explainRule("mp020");
    expect(rule020).toBeDefined();
    expect(rule020?.name).toBe("create-index-non-concurrent");
  });
});
