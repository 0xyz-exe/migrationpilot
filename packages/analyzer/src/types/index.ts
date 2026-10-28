export type Severity = "critical" | "high" | "medium" | "low" | "info";
export type Confidence = "high" | "medium" | "low";
export type Environment = "development" | "staging" | "production";
export type RiskLevel = "low" | "moderate" | "elevated" | "high" | "critical";

export type RuleCategory =
  | "destructive"
  | "locking"
  | "index"
  | "column"
  | "constraint"
  | "transaction"
  | "compatibility"
  | "dependency"
  | "reversibility"
  | "large_table";

export interface TableContext {
  columns: string[];
  indexes?: string[];
  foreignKeys?: Array<{ column: string; targetTable: string; targetColumn: string }>;
  rowCount?: number;
  sizeMb?: number;
}

export interface SchemaContext {
  tables?: Record<string, TableContext>;
}

export interface AnalysisOptions {
  failOn?: Severity;
  disabledRules?: string[];
  enabledRules?: string[];
  strictTransactions?: boolean;
}

export interface MigrationAnalysisInput {
  migrationName?: string;
  sql: string;
  targetPostgresVersion?: string; // e.g. "12", "14", "16"
  environment?: Environment;
  schemaContext?: SchemaContext;
  options?: AnalysisOptions;
}

export interface MigrationFinding {
  id: string;
  ruleId: string;
  title: string;
  description: string;
  severity: Severity;
  confidence: Confidence;
  category: RuleCategory;
  statementIndex: number;
  line?: number;
  column?: number;
  evidence: string;
  impact: string;
  recommendation: string;
  references?: string[];
  mitigationSql?: string;
}

export interface AnalysisDiagnostic {
  level: "error" | "warning" | "info";
  message: string;
  line?: number;
  column?: number;
}

export interface RiskBreakdown {
  availability: number;
  dataLoss: number;
  lockContention: number;
  compatibility: number;
}

export interface AnalysisSummary {
  totalStatements: number;
  totalFindings: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
  informational: number;
  blocked: boolean;
  riskScore: number;
  riskLevel: RiskLevel;
  breakdown: RiskBreakdown;
}

export interface MigrationAnalysisResult {
  migrationName?: string;
  summary: AnalysisSummary;
  findings: MigrationFinding[];
  diagnostics: AnalysisDiagnostic[];
  metadata: {
    analyzerVersion: string;
    targetPostgresVersion: string;
    environment: Environment;
    analyzedAt: string;
  };
}

export interface RuleDefinition {
  id: string;
  name: string;
  title: string;
  category: RuleCategory;
  defaultSeverity: Severity;
  confidence: Confidence;
  description: string;
  remediation: string;
  docUrl: string;
  exampleBadSql: string;
  exampleGoodSql: string;
  supportedVersions?: string[];
}

export interface ParsedStatement {
  index: number;
  rawSql: string;
  cleanSql: string;
  startLine: number;
  startCol: number;
  endLine: number;
  ast?: any;
  parseError?: string;
}
