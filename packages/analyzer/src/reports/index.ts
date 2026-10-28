import { MigrationAnalysisResult, MigrationFinding } from "../types/index.js";

/**
 * Formats analysis result as Markdown report.
 */
export function formatMarkdownReport(result: MigrationAnalysisResult): string {
  const { summary, findings, metadata, migrationName } = result;
  const statusEmoji = summary.blocked ? "❌ FAILED" : "✅ PASSED";

  let md = `# 🛡️ MigrationPilot Safety Report\n\n`;
  md += `**Migration:** \`${migrationName || "unnamed_migration.sql"}\`  \n`;
  md += `**Status:** ${statusEmoji} (Risk Score: **${summary.riskScore}/100** - **${summary.riskLevel.toUpperCase()}**)  \n`;
  md += `**Analyzed At:** ${metadata.analyzedAt}  \n`;
  md += `**Target PostgreSQL Version:** ${metadata.targetPostgresVersion} | **Environment:** ${metadata.environment}\n\n`;

  md += `## 📊 Executive Summary\n\n`;
  md += `| Metric | Count |\n|---|---|\n`;
  md += `| Total Statements Analyzed | ${summary.totalStatements} |\n`;
  md += `| Total Findings | ${summary.totalFindings} |\n`;
  md += `| 🔴 Critical Severity | ${summary.critical} |\n`;
  md += `| 🟠 High Severity | ${summary.high} |\n`;
  md += `| 🟡 Medium Severity | ${summary.medium} |\n`;
  md += `| 🔵 Low Severity | ${summary.low} |\n`;
  md += `| ⚪ Informational | ${summary.informational} |\n`;
  md += `| 🚫 Blocked by Policy | **${summary.blocked ? "YES" : "NO"}** |\n\n`;

  md += `### Risk Dimension Breakdown\n`;
  md += `- **Availability Impact:** ${summary.breakdown.availability}/100\n`;
  md += `- **Data Loss Risk:** ${summary.breakdown.dataLoss}/100\n`;
  md += `- **Lock Contention Risk:** ${summary.breakdown.lockContention}/100\n`;
  md += `- **Compatibility Risk:** ${summary.breakdown.compatibility}/100\n\n`;

  if (findings.length === 0) {
    md += `> ✨ No safety violations detected. This migration conforms to zero-downtime PostgreSQL best practices.\n\n`;
    return md;
  }

  md += `## ⚠️ Detailed Findings\n\n`;
  for (let i = 0; i < findings.length; i++) {
    const f = findings[i];
    const sevBadge = f.severity === "critical" ? "🔴 CRITICAL" : f.severity === "high" ? "🟠 HIGH" : f.severity === "medium" ? "🟡 MEDIUM" : "🔵 LOW";

    md += `### ${i + 1}. [${f.ruleId}] ${f.title}\n\n`;
    md += `- **Severity:** \`${sevBadge}\` | **Confidence:** \`${f.confidence.toUpperCase()}\` | **Category:** \`${f.category}\`\n`;
    md += `- **Location:** Line ${f.line || 1}${f.column ? `, Col ${f.column}` : ""} (Statement #${f.statementIndex + 1})\n\n`;
    md += `**Evidence:**\n\`\`\`sql\n${f.evidence}\n\`\`\`\n\n`;
    md += `**Impact:**\n${f.impact}\n\n`;
    md += `**Remediation Recommendation:**\n${f.recommendation}\n\n`;

    if (f.mitigationSql) {
      md += `**Suggested Safe SQL:**\n\`\`\`sql\n${f.mitigationSql}\n\`\`\`\n\n`;
    }

    if (f.references && f.references.length > 0) {
      md += `**Documentation:** [PostgreSQL Official Docs](${f.references[0]})\n\n`;
    }
    md += `---\n\n`;
  }

  return md;
}

/**
 * Formats analysis result as SARIF v2.1.0 for GitHub Code Scanning.
 */
export function formatSarifReport(result: MigrationAnalysisResult): string {
  const sarifRules: any[] = [];
  const sarifResults: any[] = [];
  const seenRules = new Set<string>();

  for (const f of result.findings) {
    if (!seenRules.has(f.ruleId)) {
      seenRules.add(f.ruleId);
      sarifRules.push({
        id: f.ruleId,
        name: f.ruleId,
        shortDescription: { text: f.title },
        fullDescription: { text: f.description },
        help: { text: f.recommendation },
        helpUri: f.references?.[0] || "https://www.postgresql.org/docs/current/",
        properties: {
          category: f.category,
          precision: f.confidence,
        },
      });
    }

    const levelMap: Record<string, string> = {
      critical: "error",
      high: "error",
      medium: "warning",
      low: "note",
      info: "note",
    };

    sarifResults.push({
      ruleId: f.ruleId,
      level: levelMap[f.severity] || "warning",
      message: { text: `${f.title}: ${f.impact}` },
      locations: [
        {
          physicalLocation: {
            artifactLocation: {
              uri: result.migrationName || "migration.sql",
            },
            region: {
              startLine: f.line || 1,
              startColumn: f.column || 1,
            },
          },
        },
      ],
    });
  }

  const sarif = {
    $schema: "https://json.schemastore.org/sarif-2.1.0.json",
    version: "2.1.0",
    runs: [
      {
        tool: {
          driver: {
            name: "MigrationPilot",
            version: result.metadata.analyzerVersion,
            informationUri: "https://github.com/0xyz-exe/migrationpilot",
            rules: sarifRules,
          },
        },
        results: sarifResults,
      },
    ],
  };

  return JSON.stringify(sarif, null, 2);
}

/**
 * Formats analysis result as standalone HTML report.
 */
export function formatHtmlReport(result: MigrationAnalysisResult): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>MigrationPilot Safety Report - ${result.migrationName || "migration.sql"}</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { background-color: #020617; color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; margin: 0; padding: 2rem; }
    .container { max-width: 900px; margin: 0 auto; }
    .card { background-color: #0f172a; border: 1px solid #1e293b; border-radius: 8px; padding: 1.25rem; margin-bottom: 1rem; }
    .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 1rem; margin-bottom: 1.5rem; }
    .badge { display: inline-block; padding: 0.2rem 0.5rem; border-radius: 4px; font-size: 0.75rem; font-weight: bold; text-transform: uppercase; background: #334155; }
    .badge-critical { background: #e11d48; color: white; }
    .badge-high { background: #ea580c; color: white; }
    .badge-medium { background: #d97706; color: white; }
    .badge-low { background: #2563eb; color: white; }
    pre { background: #020617; padding: 0.75rem; border-radius: 6px; overflow-x: auto; font-size: 0.85rem; border: 1px solid #1e293b; }
    .tip { background: #064e3b; color: #6ee7b7; padding: 0.75rem; border-radius: 6px; font-size: 0.85rem; margin-top: 0.5rem; }
  </style>
</head>
<body>
  <div class="container">
    <header style="border-bottom: 1px solid #1e293b; padding-bottom: 1rem; margin-bottom: 1.5rem;">
      <h1 style="margin: 0; font-size: 1.8rem;">🛡️ MigrationPilot Safety Report</h1>
      <p style="color: #94a3b8; margin: 0.5rem 0 0 0;">Target: PostgreSQL ${result.metadata.targetPostgresVersion} | Environment: ${result.metadata.environment}</p>
    </header>
    <div class="grid">
      <div class="card">
        <div style="font-size: 0.8rem; color: #94a3b8;">Risk Score</div>
        <div style="font-size: 1.5rem; font-weight: bold; color: ${result.summary.riskScore > 50 ? '#f43f5e' : '#10b981'};">${result.summary.riskScore}/100</div>
      </div>
      <div class="card">
        <div style="font-size: 0.8rem; color: #94a3b8;">Critical / High</div>
        <div style="font-size: 1.5rem; font-weight: bold; color: #f43f5e;">${result.summary.critical + result.summary.high}</div>
      </div>
      <div class="card">
        <div style="font-size: 0.8rem; color: #94a3b8;">Total Statements</div>
        <div style="font-size: 1.5rem; font-weight: bold;">${result.summary.totalStatements}</div>
      </div>
      <div class="card">
        <div style="font-size: 0.8rem; color: #94a3b8;">Policy Verdict</div>
        <div style="font-size: 1.5rem; font-weight: bold; color: ${result.summary.blocked ? '#f43f5e' : '#10b981'};">${result.summary.blocked ? 'BLOCKED' : 'APPROVED'}</div>
      </div>
    </div>
    <div class="card">
      <h2 style="margin-top: 0; border-bottom: 1px solid #1e293b; padding-bottom: 0.75rem;">Findings (${result.findings.length})</h2>
      ${result.findings.map(f => `
        <div style="background: #020617; border: 1px solid #1e293b; padding: 1rem; border-radius: 6px; margin-bottom: 1rem;">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <strong style="color: #fbbf24;">[${f.ruleId}] ${f.title}</strong>
            <span class="badge badge-${f.severity}">${f.severity}</span>
          </div>
          <p style="font-size: 0.9rem; color: #cbd5e1; margin: 0.5rem 0;">${f.impact}</p>
          <pre><code>${f.evidence}</code></pre>
          <div class="tip">💡 Safe Fix: ${f.recommendation}</div>
        </div>
      `).join("")}
    </div>
  </div>
</body>
</html>`;
}
