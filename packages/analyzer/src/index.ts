import {
  MigrationAnalysisInput,
  MigrationAnalysisResult,
  RuleDefinition,
} from "./types/index.js";
import { parseStatements } from "./parser/index.js";
import { evaluateRules } from "./rules/engine.js";
import { calculateRiskSummary } from "./risk/scorer.js";
import { RULES_CATALOG, RULES_MAP } from "./catalog/rules.js";

export * from "./types/index.js";
export * from "./catalog/rules.js";
export * from "./reports/index.js";
export * from "./parser/index.js";

export const ANALYZER_VERSION = "1.0.0";

/**
 * Analyzes PostgreSQL migration SQL statements and produces structured safety findings.
 */
export function analyzeMigration(input: MigrationAnalysisInput): MigrationAnalysisResult {
  const { statements, diagnostics } = parseStatements(input.sql);
  const findings = evaluateRules(statements, input);

  const failOn = input.options?.failOn || "high";
  const environment = input.environment || "production";
  const summary = calculateRiskSummary(findings, statements.length, environment, failOn);

  return {
    migrationName: input.migrationName,
    summary,
    findings,
    diagnostics,
    metadata: {
      analyzerVersion: ANALYZER_VERSION,
      targetPostgresVersion: input.targetPostgresVersion || "16",
      environment,
      analyzedAt: new Date().toISOString(),
    },
  };
}

/**
 * Retrieve all registered safety rules.
 */
export function getRulesCatalog(): RuleDefinition[] {
  return RULES_CATALOG;
}

/**
 * Look up rule definition by rule ID.
 */
export function explainRule(ruleId: string): RuleDefinition | undefined {
  return RULES_MAP.get(ruleId.toUpperCase());
}
