import { Command } from "commander";
import * as fs from "node:fs";
import * as path from "node:path";
import {
  analyzeMigration,
  getRulesCatalog,
  explainRule,
  formatMarkdownReport,
  formatSarifReport,
  formatHtmlReport,
  MigrationAnalysisResult,
  Severity,
  Environment,
} from "@migrationpilot/analyzer";

export function createCli(): Command {
  const program = new Command();

  program
    .name("migrationpilot")
    .description("MigrationPilot - Production PostgreSQL Migration Safety Analyzer")
    .version("1.0.0");

  program
    .command("analyze")
    .description("Analyze a single SQL migration file or a directory of migrations")
    .argument("<targetPath>", "Path to SQL file or directory of .sql files")
    .option("-f, --format <format>", "Output format: console, json, markdown, sarif, html", "console")
    .option("-o, --output <file>", "Write report output to specified file path")
    .option("-e, --environment <env>", "Target environment: development, staging, production", "production")
    .option("-p, --postgres-version <version>", "Target PostgreSQL major version (12..17)", "16")
    .option("--fail-on <severity>", "Threshold severity that triggers failure exit code: critical, high, medium, low", "high")
    .option("-s, --schema-context <path>", "Path to schema context JSON file")
    .action(async (targetPath: string, options: any) => {
      try {
        const resolvedPath = path.resolve(process.cwd(), targetPath);
        if (!fs.existsSync(resolvedPath)) {
          console.error(`[Error] Target path not found: ${resolvedPath}`);
          process.exit(2);
        }

        let schemaContext: any = undefined;
        if (options.schemaContext) {
          const scPath = path.resolve(process.cwd(), options.schemaContext);
          if (!fs.existsSync(scPath)) {
            console.error(`[Error] Schema context file not found: ${scPath}`);
            process.exit(2);
          }
          try {
            schemaContext = JSON.parse(fs.readFileSync(scPath, "utf-8"));
          } catch (e: any) {
            console.error(`[Error] Invalid JSON in schema context file: ${e.message}`);
            process.exit(2);
          }
        }

        const stat = fs.statSync(resolvedPath);
        const sqlFiles: string[] = [];

        if (stat.isDirectory()) {
          const entries = fs.readdirSync(resolvedPath).sort();
          for (const entry of entries) {
            if (entry.endsWith(".sql")) {
              sqlFiles.push(path.join(resolvedPath, entry));
            }
          }
          if (sqlFiles.length === 0) {
            console.warn(`[Warning] No .sql files discovered in directory: ${resolvedPath}`);
            process.exit(0);
          }
        } else {
          sqlFiles.push(resolvedPath);
        }

        const results: MigrationAnalysisResult[] = [];
        let anyBlocked = false;

        for (const file of sqlFiles) {
          const sql = fs.readFileSync(file, "utf-8");
          const relName = path.relative(process.cwd(), file);
          const result = analyzeMigration({
            migrationName: relName,
            sql,
            targetPostgresVersion: options.postgresVersion,
            environment: options.environment as Environment,
            schemaContext,
            options: {
              failOn: options.failOn as Severity,
            },
          });

          results.push(result);
          if (result.summary.blocked) {
            anyBlocked = true;
          }
        }

        // Render Output
        const format = options.format.toLowerCase();
        let renderedOutput = "";

        if (format === "json") {
          renderedOutput = JSON.stringify(results.length === 1 ? results[0] : results, null, 2);
        } else if (format === "markdown") {
          renderedOutput = results.map(formatMarkdownReport).join("\n\n---\n\n");
        } else if (format === "sarif") {
          renderedOutput = formatSarifReport(results[0]);
        } else if (format === "html") {
          renderedOutput = formatHtmlReport(results[0]);
        } else {
          // Console table output
          renderedOutput = renderConsoleReport(results, options.failOn);
        }

        if (options.output) {
          const outPath = path.resolve(process.cwd(), options.output);
          fs.writeFileSync(outPath, renderedOutput, "utf-8");
          console.log(`Report successfully written to ${outPath}`);
        } else {
          console.log(renderedOutput);
        }

        if (anyBlocked) {
          process.exit(1);
        } else {
          process.exit(0);
        }
      } catch (err: any) {
        console.error(`[Fatal Analyzer Error] ${err.stack || err.message}`);
        process.exit(3);
      }
    });

  program
    .command("rules")
    .description("Inspect safety rules catalog")
    .argument("[action]", "list or explain", "list")
    .argument("[ruleId]", "Rule identifier (e.g. MP001)")
    .action((action: string, ruleId?: string) => {
      if (action === "explain" || (action && action.startsWith("MP"))) {
        const targetId = (ruleId || action).toUpperCase();
        const rule = explainRule(targetId);
        if (!rule) {
          console.error(`[Error] Unknown rule ID: ${targetId}`);
          process.exit(2);
        }

        console.log(`\n======================================================`);
        console.log(`Rule: [${rule.id}] ${rule.title}`);
        console.log(`======================================================`);
        console.log(`Category:    ${rule.category}`);
        console.log(`Severity:    ${rule.defaultSeverity.toUpperCase()}`);
        console.log(`Confidence:  ${rule.confidence.toUpperCase()}`);
        console.log(`Doc URL:     ${rule.docUrl}\n`);
        console.log(`Description:\n  ${rule.description}\n`);
        console.log(`Remediation:\n  ${rule.remediation}\n`);
        console.log(`Example Dangerous SQL:\n${rule.exampleBadSql.split("\n").map(l => "  " + l).join("\n")}\n`);
        console.log(`Recommended Safe Pattern:\n${rule.exampleGoodSql.split("\n").map(l => "  " + l).join("\n")}\n`);
        process.exit(0);
      }

      // Default: list all rules
      const catalog = getRulesCatalog();
      console.log(`\n🛡️  MigrationPilot Safety Rules Catalog (${catalog.length} rules):\n`);
      console.log(
        `${"ID".padEnd(8)} ${"SEVERITY".padEnd(10)} ${"CATEGORY".padEnd(14)} ${"TITLE"}`
      );
      console.log("-".repeat(80));
      for (const r of catalog) {
        console.log(
          `${r.id.padEnd(8)} ${r.defaultSeverity.toUpperCase().padEnd(10)} ${r.category.padEnd(14)} ${r.title}`
        );
      }
      console.log(`\nRun 'migrationpilot rules explain <RULE_ID>' for deep architectural explanation.\n`);
      process.exit(0);
    });

  return program;
}

function renderConsoleReport(results: MigrationAnalysisResult[], failOn: string): string {
  let out = `\n🛡️  MigrationPilot Analysis Summary\n`;
  out += `================================================================================\n`;

  for (const res of results) {
    const s = res.summary;
    const verdict = s.blocked ? `\x1b[31m[FAILED - EXCEEDED THRESHOLD]\x1b[0m` : `\x1b[32m[PASSED]\x1b[0m`;
    out += `Migration: ${res.migrationName || "inline.sql"}\n`;
    out += `Verdict:   ${verdict} | Risk Score: ${s.riskScore}/100 (${s.riskLevel.toUpperCase()})\n`;
    out += `Metrics:   ${s.totalStatements} statements | ${s.critical} critical | ${s.high} high | ${s.medium} medium | ${s.low} low\n`;

    if (res.findings.length > 0) {
      out += `\nFindings:\n`;
      for (const f of res.findings) {
        const color = f.severity === "critical" ? "\x1b[31m" : f.severity === "high" ? "\x1b[33m" : "\x1b[36m";
        out += `  - ${color}[${f.ruleId}]\x1b[0m Line ${f.line || 1}: ${f.title} (${f.severity.toUpperCase()})\n`;
        out += `    Evidence: ${f.evidence.replace(/\n/g, " ").slice(0, 75)}\n`;
        out += `    Safe fix: ${f.recommendation.slice(0, 100)}\n`;
      }
    } else {
      out += `  ✨ No risks detected. Safe for zero-downtime execution.\n`;
    }
    out += `--------------------------------------------------------------------------------\n`;
  }

  return out;
}
