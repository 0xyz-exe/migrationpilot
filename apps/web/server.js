import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import {
  analyzeMigration,
  getRulesCatalog,
  explainRule,
  formatMarkdownReport,
  formatSarifReport,
  formatHtmlReport,
} from "@migrationpilot/analyzer";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_PATH = path.resolve(__dirname, "../../migrationpilot.db");
const DIST_PATH = path.resolve(__dirname, "./dist");

// Initialize SQLite Schema
const db = new DatabaseSync(DB_PATH);
db.exec(`
  CREATE TABLE IF NOT EXISTS analyses (
    id TEXT PRIMARY KEY,
    migration_name TEXT,
    sql_content TEXT,
    target_postgres_version TEXT,
    environment TEXT,
    risk_score INTEGER,
    risk_level TEXT,
    blocked INTEGER,
    total_statements INTEGER,
    total_findings INTEGER,
    critical_count INTEGER,
    high_count INTEGER,
    medium_count INTEGER,
    low_count INTEGER,
    result_json TEXT,
    created_at TEXT
  );
`);

// Pre-seed with demo analyses if empty
const countRow = db.prepare("SELECT COUNT(*) as cnt FROM analyses").get();
if (countRow.cnt === 0) {
  const seedDemo = (name, sql, env = "production") => {
    const res = analyzeMigration({ migrationName: name, sql, environment: env });
    const id = "mp-" + Math.random().toString(36).substring(2, 9);
    db.prepare(`
      INSERT INTO analyses (
        id, migration_name, sql_content, target_postgres_version, environment,
        risk_score, risk_level, blocked, total_statements, total_findings,
        critical_count, high_count, medium_count, low_count, result_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      name,
      sql,
      "16",
      env,
      res.summary.riskScore,
      res.summary.riskLevel,
      res.summary.blocked ? 1 : 0,
      res.summary.totalStatements,
      res.summary.totalFindings,
      res.summary.critical,
      res.summary.high,
      res.summary.medium,
      res.summary.low,
      JSON.stringify(res),
      new Date().toISOString()
    );
  };

  seedDemo(
    "20261028_drop_user_column.sql",
    "ALTER TABLE users DROP COLUMN phone_number;\nDROP TABLE legacy_sessions;"
  );
  seedDemo(
    "20261028_blocking_orders_index.sql",
    "BEGIN;\nCREATE INDEX idx_orders_customer ON orders(customer_id);\nCREATE INDEX CONCURRENTLY idx_orders_time ON orders(created_at);\nCOMMIT;"
  );
  seedDemo(
    "20261028_safe_customer_foreign_key.sql",
    "SET lock_timeout = '3s';\nCREATE INDEX CONCURRENTLY idx_customers_email ON customers(email);\nALTER TABLE orders ADD CONSTRAINT fk_cust FOREIGN KEY (customer_id) REFERENCES customers(id) NOT VALID;\nALTER TABLE orders VALIDATE CONSTRAINT fk_cust;\nRESET lock_timeout;"
  );
}

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });
  res.end(JSON.stringify(data));
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 5 * 1024 * 1024) {
        reject(new Error("Request payload exceeds limit of 5MB"));
      }
    });
    req.on("end", () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch (e) {
        reject(new Error("Malformed JSON payload"));
      }
    });
    req.on("error", reject);
  });
}

const server = http.createServer(async (req, res) => {
  // CORS Preflight
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    });
    res.end();
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const pathname = url.pathname;

  // --- API Endpoints ---
  if (pathname === "/api/v1/health" && req.method === "GET") {
    return sendJson(res, 200, {
      status: "ok",
      analyzerVersion: "1.0.0",
      timestamp: new Date().toISOString(),
    });
  }

  if (pathname === "/api/v1/rules" && req.method === "GET") {
    return sendJson(res, 200, { rules: getRulesCatalog() });
  }

  if (pathname.startsWith("/api/v1/rules/") && req.method === "GET") {
    const ruleId = pathname.replace("/api/v1/rules/", "").toUpperCase();
    const rule = explainRule(ruleId);
    if (!rule) {
      return sendJson(res, 404, { error: `Rule ${ruleId} not found` });
    }
    return sendJson(res, 200, rule);
  }

  if (pathname === "/api/v1/analyze" && req.method === "POST") {
    try {
      const payload = await parseBody(req);
      if (!payload.sql || typeof payload.sql !== "string") {
        return sendJson(res, 400, { error: "Missing required 'sql' string field" });
      }

      const result = analyzeMigration({
        migrationName: payload.migrationName || "unnamed_migration.sql",
        sql: payload.sql,
        targetPostgresVersion: payload.targetPostgresVersion || "16",
        environment: payload.environment || "production",
        schemaContext: payload.schemaContext,
        options: payload.options,
      });

      // Save to persistence
      const id = "mp-" + Math.random().toString(36).substring(2, 9);
      db.prepare(`
        INSERT INTO analyses (
          id, migration_name, sql_content, target_postgres_version, environment,
          risk_score, risk_level, blocked, total_statements, total_findings,
          critical_count, high_count, medium_count, low_count, result_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        payload.migrationName || "unnamed_migration.sql",
        payload.sql,
        payload.targetPostgresVersion || "16",
        payload.environment || "production",
        result.summary.riskScore,
        result.summary.riskLevel,
        result.summary.blocked ? 1 : 0,
        result.summary.totalStatements,
        result.summary.totalFindings,
        result.summary.critical,
        result.summary.high,
        result.summary.medium,
        result.summary.low,
        JSON.stringify(result),
        new Date().toISOString()
      );

      return sendJson(res, 200, { id, ...result });
    } catch (err) {
      return sendJson(res, 500, { error: err.message });
    }
  }

  if (pathname === "/api/v1/analyses" && req.method === "GET") {
    const rows = db.prepare(`
      SELECT id, migration_name, target_postgres_version, environment,
             risk_score, risk_level, blocked, total_statements, total_findings,
             critical_count, high_count, medium_count, low_count, created_at
      FROM analyses
      ORDER BY created_at DESC
      LIMIT 100
    `).all();
    return sendJson(res, 200, { analyses: rows });
  }

  if (pathname.startsWith("/api/v1/analyses/") && req.method === "GET") {
    const id = pathname.replace("/api/v1/analyses/", "");
    const row = db.prepare("SELECT * FROM analyses WHERE id = ?").get(id);
    if (!row) {
      return sendJson(res, 404, { error: `Analysis ${id} not found` });
    }
    return sendJson(res, 200, {
      ...row,
      result: JSON.parse(row.result_json),
    });
  }

  if (pathname.startsWith("/api/v1/analyses/") && req.method === "DELETE") {
    const id = pathname.replace("/api/v1/analyses/", "");
    db.prepare("DELETE FROM analyses WHERE id = ?").run(id);
    return sendJson(res, 200, { success: true, deletedId: id });
  }

  if (pathname === "/api/v1/analyses/compare" && req.method === "POST") {
    try {
      const payload = await parseBody(req);
      const { sourceId, targetId } = payload;
      const row1 = db.prepare("SELECT * FROM analyses WHERE id = ?").get(sourceId);
      const row2 = db.prepare("SELECT * FROM analyses WHERE id = ?").get(targetId);

      if (!row1 || !row2) {
        return sendJson(res, 404, { error: "One or both comparison analysis IDs were not found" });
      }

      const r1 = JSON.parse(row1.result_json);
      const r2 = JSON.parse(row2.result_json);

      return sendJson(res, 200, {
        source: { id: row1.id, name: row1.migration_name, result: r1 },
        target: { id: row2.id, name: row2.migration_name, result: r2 },
        scoreDelta: r2.summary.riskScore - r1.summary.riskScore,
        findingsDelta: r2.summary.totalFindings - r1.summary.totalFindings,
      });
    } catch (err) {
      return sendJson(res, 500, { error: err.message });
    }
  }

  // --- Static Frontend File Serving ---
  if (fs.existsSync(DIST_PATH)) {
    let filePath = path.join(DIST_PATH, pathname === "/" ? "index.html" : pathname);
    if (!fs.existsSync(filePath)) {
      filePath = path.join(DIST_PATH, "index.html"); // SPA fallback
    }

    const ext = path.extname(filePath);
    const contentTypeMap = {
      ".html": "text/html",
      ".js": "application/javascript",
      ".css": "text/css",
      ".json": "application/json",
      ".png": "image/png",
      ".svg": "image/svg+xml",
      ".ico": "image/x-icon",
    };
    const contentType = contentTypeMap[ext] || "application/octet-stream";

    try {
      const content = fs.readFileSync(filePath);
      res.writeHead(200, { "Content-Type": contentType });
      res.end(content);
      return;
    } catch (e) {
      // Fall through to 404
    }
  }

  // Default 404
  sendJson(res, 404, { error: "Not Found", path: pathname });
});

const PORT = process.env.PORT || 3080;
server.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 MigrationPilot API & Web Server listening on http://127.0.0.1:${PORT}`);
});
