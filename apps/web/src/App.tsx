import React, { useState, useEffect } from "react";
import {
  Shield,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Database,
  FileCode,
  History,
  BookOpen,
  ArrowRight,
  Download,
  Copy,
  Check,
  Search,
  ExternalLink,
  Layers,
  Terminal,
  Activity,
  Play,
  RotateCcw,
  Sparkles,
} from "lucide-react";

interface Finding {
  id: string;
  ruleId: string;
  title: string;
  description: string;
  severity: "critical" | "high" | "medium" | "low" | "info";
  confidence: "high" | "medium" | "low";
  category: string;
  statementIndex: number;
  line?: number;
  column?: number;
  evidence: string;
  impact: string;
  recommendation: string;
  references?: string[];
  mitigationSql?: string;
}

interface AnalysisResult {
  id?: string;
  migrationName?: string;
  summary: {
    totalStatements: number;
    totalFindings: number;
    critical: number;
    high: number;
    medium: number;
    low: number;
    informational: number;
    blocked: boolean;
    riskScore: number;
    riskLevel: string;
    breakdown: {
      availability: number;
      dataLoss: number;
      lockContention: number;
      compatibility: number;
    };
  };
  findings: Finding[];
  diagnostics: Array<{ level: string; message: string; line?: number }>;
  metadata: {
    analyzerVersion: string;
    targetPostgresVersion: string;
    environment: string;
    analyzedAt: string;
  };
}

interface RuleItem {
  id: string;
  name: string;
  title: string;
  category: string;
  defaultSeverity: string;
  confidence: string;
  description: string;
  remediation: string;
  docUrl: string;
  exampleBadSql: string;
  exampleGoodSql: string;
}

const PRESETS = [
  {
    name: "Destructive DROP",
    desc: "DROP TABLE & DROP COLUMN without transition",
    sql: `-- Destructive migration example\nALTER TABLE users DROP COLUMN phone_number;\nDROP TABLE audit_logs_2024;\nTRUNCATE TABLE session_store;`,
  },
  {
    name: "Blocking Index",
    desc: "Non-concurrent index creation in transaction",
    sql: `-- Blocking and transactionally invalid index migration\nBEGIN;\nCREATE INDEX idx_orders_customer ON orders(customer_id);\nCREATE INDEX CONCURRENTLY idx_orders_created ON orders(created_at);\nCOMMIT;`,
  },
  {
    name: "Staged Safe Pattern",
    desc: "CONCURRENTLY + NOT VALID + lock_timeout",
    sql: `-- Safe zero-downtime migration\nSET lock_timeout = '3s';\n\n-- 1. Create index concurrently outside transaction\nCREATE INDEX CONCURRENTLY idx_users_active_email ON users(email) WHERE is_active = true;\n\n-- 2. Add foreign key with NOT VALID to prevent write lockup\nALTER TABLE orders ADD CONSTRAINT fk_orders_customer FOREIGN KEY (customer_id) REFERENCES customers(id) NOT VALID;\n\n-- 3. Validate constraint asynchronously\nALTER TABLE orders VALIDATE CONSTRAINT fk_orders_customer;\n\nRESET lock_timeout;`,
  },
  {
    name: "Column Type Rewrite",
    desc: "Altering type causing full table rewrite",
    sql: `ALTER TABLE products ALTER COLUMN description TYPE VARCHAR(255);\nALTER TABLE users ALTER COLUMN status SET NOT NULL;`,
  },
];

export default function App() {
  const [activeTab, setActiveTab] = useState<"workspace" | "dashboard" | "rules" | "history" | "docs">("workspace");

  // Workspace States
  const [migrationName, setMigrationName] = useState("20261028_schema_upgrade.sql");
  const [sql, setSql] = useState(PRESETS[0].sql);
  const [pgVersion, setPgVersion] = useState("16");
  const [environment, setEnvironment] = useState<"production" | "staging" | "development">("production");
  const [showSchemaContext, setShowSchemaContext] = useState(false);
  const [schemaContextJson, setSchemaContextJson] = useState(`{\n  "tables": {\n    "users": { "rowCount": 2500000, "sizeMb": 1200 }\n  }\n}`);

  const [analyzing, setAnalyzing] = useState(false);
  const [currentResult, setCurrentResult] = useState<AnalysisResult | null>(null);
  const [severityFilter, setSeverityFilter] = useState<string>("all");
  const [searchFilter, setSearchFilter] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // History & Rules States
  const [analysesList, setAnalysesList] = useState<any[]>([]);
  const [rulesCatalog, setRulesCatalog] = useState<RuleItem[]>([]);
  const [rulesSearch, setRulesSearch] = useState("");
  const [selectedRuleCategory, setSelectedRuleCategory] = useState("all");
  const [compareSourceId, setCompareSourceId] = useState<string>("");
  const [compareTargetId, setCompareTargetId] = useState<string>("");
  const [compareDiff, setCompareDiff] = useState<any>(null);

  // Initial Data Load
  useEffect(() => {
    fetchHistory();
    fetchRules();
    // Run initial analysis
    runAnalysis(PRESETS[0].sql);
  }, []);

  const fetchHistory = async () => {
    try {
      const res = await fetch("/api/v1/analyses");
      const data = await res.json();
      if (data.analyses) setAnalysesList(data.analyses);
    } catch (e) {
      console.error("Failed to fetch analyses:", e);
    }
  };

  const fetchRules = async () => {
    try {
      const res = await fetch("/api/v1/rules");
      const data = await res.json();
      if (data.rules) setRulesCatalog(data.rules);
    } catch (e) {
      console.error("Failed to fetch rules:", e);
    }
  };

  const runAnalysis = async (inputSql?: string) => {
    const targetSql = inputSql !== undefined ? inputSql : sql;
    if (!targetSql.trim()) return;

    setAnalyzing(true);
    let parsedContext = undefined;
    if (showSchemaContext && schemaContextJson.trim()) {
      try {
        parsedContext = JSON.parse(schemaContextJson);
      } catch (e) {
        alert("Invalid Schema Context JSON: " + (e as any).message);
        setAnalyzing(false);
        return;
      }
    }

    try {
      const res = await fetch("/api/v1/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          migrationName,
          sql: targetSql,
          targetPostgresVersion: pgVersion,
          environment,
          schemaContext: parsedContext,
        }),
      });
      const data = await res.json();
      setCurrentResult(data);
      fetchHistory();
    } catch (err) {
      console.error("Analysis failed:", err);
    } finally {
      setAnalyzing(false);
    }
  };

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleExport = (type: "json" | "markdown" | "sarif" | "html") => {
    if (!currentResult) return;
    let content = "";
    let filename = `${migrationName.replace(".sql", "")}-report.${type}`;

    if (type === "json") {
      content = JSON.stringify(currentResult, null, 2);
    } else if (type === "sarif") {
      filename = `${migrationName.replace(".sql", "")}.sarif`;
      content = JSON.stringify(currentResult, null, 2);
    } else if (type === "markdown") {
      content = `# MigrationPilot Safety Report: ${currentResult.migrationName}\nRisk Score: ${currentResult.summary.riskScore}/100\nVerdict: ${currentResult.summary.blocked ? "BLOCKED" : "APPROVED"}\n\n## Findings (${currentResult.findings.length})\n` +
        currentResult.findings.map(f => `### [${f.ruleId}] ${f.title} (${f.severity.toUpperCase()})\n${f.impact}\n\nEvidence:\n\`\`\`sql\n${f.evidence}\n\`\`\`\n\nSafe Fix:\n\`\`\`sql\n${f.recommendation}\n\`\`\`\n`).join("\n---\n");
    } else if (type === "html") {
      content = `<!DOCTYPE html><html><head><title>${currentResult.migrationName} Safety Report</title><style>body{background:#020617;color:#f8fafc;font-family:sans-serif;padding:2rem;}pre{background:#0f172a;padding:1rem;border-radius:6px;}</style></head><body><h1>🛡️ MigrationPilot Report</h1><p>Risk Score: ${currentResult.summary.riskScore}/100</p><hr/>${currentResult.findings.map(f=>`<h3>[${f.ruleId}] ${f.title}</h3><p>${f.impact}</p><pre>${f.evidence}</pre>`).join("")}</body></html>`;
    }

    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const runCompare = async () => {
    if (!compareSourceId || !compareTargetId) {
      alert("Please select both a Baseline and a Target migration to compare.");
      return;
    }
    try {
      const res = await fetch("/api/v1/analyses/compare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceId: compareSourceId, targetId: compareTargetId }),
      });
      const data = await res.json();
      setCompareDiff(data);
    } catch (e) {
      console.error("Comparison failed:", e);
    }
  };

  // Filtered Findings
  const filteredFindings = currentResult?.findings.filter((f) => {
    if (severityFilter !== "all" && f.severity !== severityFilter) return false;
    if (searchFilter) {
      const q = searchFilter.toLowerCase();
      return (
        f.title.toLowerCase().includes(q) ||
        f.ruleId.toLowerCase().includes(q) ||
        f.evidence.toLowerCase().includes(q) ||
        f.recommendation.toLowerCase().includes(q)
      );
    }
    return true;
  }) || [];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* Top Header */}
      <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur sticky top-0 z-50 px-6 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-sky-500/10 border border-sky-500/30 flex items-center justify-center text-sky-400 shadow-inner">
            <Shield className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold tracking-tight text-base text-slate-100">MigrationPilot</span>
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-sky-950 text-sky-400 border border-sky-800 font-mono">
                v1.0.0 OSS
              </span>
            </div>
            <p className="text-xs text-slate-400">PostgreSQL Zero-Downtime Migration Safety Analyzer</p>
          </div>
        </div>

        {/* Navigation Tabs */}
        <nav className="flex items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800 text-xs font-medium">
          <button
            onClick={() => setActiveTab("workspace")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition ${
              activeTab === "workspace" ? "bg-slate-800 text-sky-400 font-semibold shadow-sm" : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <FileCode className="h-3.5 w-3.5" />
            Safety Workspace
          </button>
          <button
            onClick={() => setActiveTab("dashboard")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition ${
              activeTab === "dashboard" ? "bg-slate-800 text-sky-400 font-semibold shadow-sm" : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <Activity className="h-3.5 w-3.5" />
            Dashboard
          </button>
          <button
            onClick={() => setActiveTab("rules")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition ${
              activeTab === "rules" ? "bg-slate-800 text-sky-400 font-semibold shadow-sm" : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <Layers className="h-3.5 w-3.5" />
            Rules Catalog ({rulesCatalog.length})
          </button>
          <button
            onClick={() => setActiveTab("history")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition ${
              activeTab === "history" ? "bg-slate-800 text-sky-400 font-semibold shadow-sm" : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <History className="h-3.5 w-3.5" />
            History & Diff
          </button>
          <button
            onClick={() => setActiveTab("docs")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition ${
              activeTab === "docs" ? "bg-slate-800 text-sky-400 font-semibold shadow-sm" : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <BookOpen className="h-3.5 w-3.5" />
            Documentation
          </button>
        </nav>

        {/* Engine Status Tag */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 text-xs text-emerald-400 bg-emerald-950/60 border border-emerald-800/50 px-2.5 py-1 rounded-md font-mono">
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse"></span>
            Local Engine Active (PG 12-17)
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 overflow-auto">
        {/* TAB 1: WORKSPACE */}
        {activeTab === "workspace" && (
          <div className="grid grid-cols-12 h-full divide-x divide-slate-800">
            {/* LEFT PANEL: SQL EDITOR & CONTROLS */}
            <div className="col-span-12 lg:col-span-6 p-6 flex flex-col space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                    <Database className="h-4 w-4 text-sky-400" />
                    Migration SQL Workspace
                  </h2>
                  <p className="text-xs text-slate-400">Target dialect: PostgreSQL DDL with safe AST lock inspection</p>
                </div>

                {/* Target Configuration Dropdowns */}
                <div className="flex items-center gap-2">
                  <select
                    value={pgVersion}
                    onChange={(e) => setPgVersion(e.target.value)}
                    className="bg-slate-900 border border-slate-700 text-slate-200 text-xs rounded-md px-2.5 py-1.5 focus:outline-none focus:border-sky-500 font-mono"
                  >
                    <option value="17">PostgreSQL 17</option>
                    <option value="16">PostgreSQL 16</option>
                    <option value="15">PostgreSQL 15</option>
                    <option value="14">PostgreSQL 14</option>
                    <option value="13">PostgreSQL 13</option>
                    <option value="12">PostgreSQL 12</option>
                  </select>

                  <select
                    value={environment}
                    onChange={(e) => setEnvironment(e.target.value as any)}
                    className="bg-slate-900 border border-slate-700 text-slate-200 text-xs rounded-md px-2.5 py-1.5 focus:outline-none focus:border-sky-500 capitalize"
                  >
                    <option value="production">Production</option>
                    <option value="staging">Staging</option>
                    <option value="development">Development</option>
                  </select>
                </div>
              </div>

              {/* Preset Selector */}
              <div className="bg-slate-900/60 border border-slate-800/80 rounded-lg p-2.5 flex items-center gap-2 overflow-x-auto">
                <span className="text-xs text-slate-400 flex items-center gap-1 pl-1 font-medium whitespace-nowrap">
                  <Sparkles className="h-3 w-3 text-amber-400" /> Presets:
                </span>
                {PRESETS.map((p, idx) => (
                  <button
                    key={idx}
                    onClick={() => {
                      setSql(p.sql);
                      runAnalysis(p.sql);
                    }}
                    className="text-xs px-2.5 py-1 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition whitespace-nowrap border border-slate-700/50"
                  >
                    {p.name}
                  </button>
                ))}
              </div>

              {/* Migration Name Input */}
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Migration Filename</label>
                <input
                  type="text"
                  value={migrationName}
                  onChange={(e) => setMigrationName(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-md px-3 py-1.5 text-xs text-slate-200 font-mono focus:outline-none focus:border-sky-500"
                />
              </div>

              {/* SQL Textarea Editor */}
              <div className="flex-1 flex flex-col min-h-[340px]">
                <div className="bg-slate-900/90 border border-slate-800 rounded-t-md px-3 py-1.5 flex items-center justify-between text-xs text-slate-400 border-b-0">
                  <span className="font-mono">SQL Editor</span>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => handleCopy(sql, "full-sql")}
                      className="hover:text-slate-200 flex items-center gap-1 text-[11px]"
                    >
                      {copiedId === "full-sql" ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                      Copy
                    </button>
                    <button
                      onClick={() => setShowSchemaContext(!showSchemaContext)}
                      className={`text-[11px] hover:text-slate-200 ${showSchemaContext ? "text-sky-400 font-semibold" : ""}`}
                    >
                      {showSchemaContext ? "Hide Table Metadata" : "+ Schema Context"}
                    </button>
                  </div>
                </div>
                <textarea
                  value={sql}
                  onChange={(e) => setSql(e.target.value)}
                  spellCheck={false}
                  placeholder="Paste PostgreSQL migration SQL statements here..."
                  className="flex-1 w-full bg-slate-950 border border-slate-800 rounded-b-md p-3.5 text-xs font-mono text-slate-200 focus:outline-none focus:border-sky-500 leading-relaxed resize-y min-h-[280px]"
                />
              </div>

              {/* Optional Schema Context Drawer */}
              {showSchemaContext && (
                <div className="bg-slate-900/80 border border-slate-800 rounded-lg p-3 text-xs space-y-2">
                  <div className="flex items-center justify-between text-slate-300 font-medium">
                    <span>Schema Metadata (Table size & row estimates)</span>
                    <span className="text-[10px] text-slate-500">JSON Format</span>
                  </div>
                  <textarea
                    value={schemaContextJson}
                    onChange={(e) => setSchemaContextJson(e.target.value)}
                    rows={4}
                    className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-xs font-mono text-slate-300 focus:outline-none focus:border-sky-500"
                  />
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex items-center justify-between pt-2">
                <button
                  onClick={() => {
                    setSql("");
                    setCurrentResult(null);
                  }}
                  className="px-3 py-2 rounded-md bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-slate-200 text-xs flex items-center gap-1.5 transition border border-slate-800"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Clear
                </button>

                <button
                  onClick={() => runAnalysis()}
                  disabled={analyzing || !sql.trim()}
                  className="px-5 py-2.5 rounded-md bg-sky-600 hover:bg-sky-500 text-white font-semibold text-xs flex items-center gap-2 transition shadow-lg shadow-sky-950 disabled:opacity-50"
                >
                  <Play className={`h-3.5 w-3.5 fill-current ${analyzing ? "animate-spin" : ""}`} />
                  {analyzing ? "Analyzing Migration..." : "Run Safety Analysis"}
                </button>
              </div>
            </div>

            {/* RIGHT PANEL: INSPECTION & FINDINGS */}
            <div className="col-span-12 lg:col-span-6 p-6 flex flex-col space-y-5 bg-slate-950/50">
              {currentResult ? (
                <>
                  {/* Risk Overview Header */}
                  <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div
                          className={`h-16 w-16 rounded-xl flex flex-col items-center justify-center font-bold font-mono border ${
                            currentResult.summary.riskScore >= 60
                              ? "bg-rose-950/60 border-rose-700/80 text-rose-400"
                              : currentResult.summary.riskScore >= 30
                              ? "bg-amber-950/60 border-amber-700/80 text-amber-400"
                              : "bg-emerald-950/60 border-emerald-700/80 text-emerald-400"
                          }`}
                        >
                          <span className="text-2xl leading-none">{currentResult.summary.riskScore}</span>
                          <span className="text-[9px] uppercase tracking-wider text-slate-400">Score</span>
                        </div>

                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="text-base font-bold text-slate-100">
                              {currentResult.summary.riskLevel.toUpperCase()} RISK
                            </h3>
                            <span
                              className={`text-xs px-2.5 py-0.5 rounded-full font-semibold border ${
                                currentResult.summary.blocked
                                  ? "bg-rose-950 text-rose-300 border-rose-800"
                                  : "bg-emerald-950 text-emerald-300 border-emerald-800"
                              }`}
                            >
                              {currentResult.summary.blocked ? "BLOCKED BY POLICY" : "APPROVED"}
                            </span>
                          </div>
                          <p className="text-xs text-slate-400 mt-1">
                            {currentResult.summary.totalStatements} statements evaluated | {currentResult.findings.length} safety findings
                          </p>
                        </div>
                      </div>

                      {/* Export Dropdown */}
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => handleExport("markdown")}
                          className="px-2.5 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs flex items-center gap-1 transition border border-slate-700"
                          title="Export Markdown Report"
                        >
                          <Download className="h-3 w-3" />
                          MD
                        </button>
                        <button
                          onClick={() => handleExport("sarif")}
                          className="px-2.5 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs flex items-center gap-1 transition border border-slate-700"
                          title="Export SARIF for GitHub"
                        >
                          <Download className="h-3 w-3" />
                          SARIF
                        </button>
                        <button
                          onClick={() => handleExport("json")}
                          className="px-2.5 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs flex items-center gap-1 transition border border-slate-700"
                          title="Export JSON"
                        >
                          <Download className="h-3 w-3" />
                          JSON
                        </button>
                      </div>
                    </div>

                    {/* Risk Dimensions Breakdown Bars */}
                    <div className="grid grid-cols-4 gap-2 pt-1 border-t border-slate-800/80 text-[11px]">
                      <div>
                        <div className="text-slate-400">Availability</div>
                        <div className="font-mono font-semibold text-slate-200 mt-0.5">
                          {currentResult.summary.breakdown.availability}%
                        </div>
                        <div className="w-full bg-slate-800 h-1.5 rounded-full mt-1 overflow-hidden">
                          <div
                            className="bg-amber-400 h-full"
                            style={{ width: `${currentResult.summary.breakdown.availability}%` }}
                          ></div>
                        </div>
                      </div>
                      <div>
                        <div className="text-slate-400">Data Loss</div>
                        <div className="font-mono font-semibold text-slate-200 mt-0.5">
                          {currentResult.summary.breakdown.dataLoss}%
                        </div>
                        <div className="w-full bg-slate-800 h-1.5 rounded-full mt-1 overflow-hidden">
                          <div
                            className="bg-rose-500 h-full"
                            style={{ width: `${currentResult.summary.breakdown.dataLoss}%` }}
                          ></div>
                        </div>
                      </div>
                      <div>
                        <div className="text-slate-400">Locking</div>
                        <div className="font-mono font-semibold text-slate-200 mt-0.5">
                          {currentResult.summary.breakdown.lockContention}%
                        </div>
                        <div className="w-full bg-slate-800 h-1.5 rounded-full mt-1 overflow-hidden">
                          <div
                            className="bg-sky-400 h-full"
                            style={{ width: `${currentResult.summary.breakdown.lockContention}%` }}
                          ></div>
                        </div>
                      </div>
                      <div>
                        <div className="text-slate-400">Compatibility</div>
                        <div className="font-mono font-semibold text-slate-200 mt-0.5">
                          {currentResult.summary.breakdown.compatibility}%
                        </div>
                        <div className="w-full bg-slate-800 h-1.5 rounded-full mt-1 overflow-hidden">
                          <div
                            className="bg-indigo-400 h-full"
                            style={{ width: `${currentResult.summary.breakdown.compatibility}%` }}
                          ></div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Findings Filters & Search */}
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-1.5 overflow-x-auto text-xs">
                      {["all", "critical", "high", "medium", "low"].map((sev) => (
                        <button
                          key={sev}
                          onClick={() => setSeverityFilter(sev)}
                          className={`px-2.5 py-1 rounded-md capitalize transition ${
                            severityFilter === sev
                              ? "bg-slate-800 text-sky-400 font-semibold border border-slate-700"
                              : "text-slate-400 hover:text-slate-200"
                          }`}
                        >
                          {sev}
                        </button>
                      ))}
                    </div>

                    <div className="relative w-48">
                      <Search className="h-3.5 w-3.5 absolute left-2.5 top-2.5 text-slate-500" />
                      <input
                        type="text"
                        placeholder="Search findings..."
                        value={searchFilter}
                        onChange={(e) => setSearchFilter(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-800 rounded-md pl-8 pr-2 py-1 text-xs text-slate-200 focus:outline-none focus:border-sky-500"
                      />
                    </div>
                  </div>

                  {/* Findings List */}
                  <div className="flex-1 space-y-3 overflow-y-auto pr-1">
                    {filteredFindings.length === 0 ? (
                      <div className="bg-slate-900/60 border border-slate-800/80 rounded-lg p-8 text-center space-y-2">
                        <CheckCircle2 className="h-8 w-8 text-emerald-400 mx-auto" />
                        <h4 className="text-sm font-semibold text-slate-200">No Safety Warnings Detected</h4>
                        <p className="text-xs text-slate-400 max-w-sm mx-auto">
                          The analyzed SQL satisfies PostgreSQL zero-downtime rules and will not block reads or writes.
                        </p>
                      </div>
                    ) : (
                      filteredFindings.map((finding) => (
                        <div
                          key={finding.id}
                          className="bg-slate-900 border border-slate-800 rounded-lg p-4 space-y-3 transition hover:border-slate-700"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <span
                                  className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase font-mono ${
                                    finding.severity === "critical"
                                      ? "bg-rose-950 text-rose-300 border border-rose-800"
                                      : finding.severity === "high"
                                      ? "bg-amber-950 text-amber-300 border border-amber-800"
                                      : "bg-sky-950 text-sky-300 border border-sky-800"
                                  }`}
                                >
                                  {finding.severity}
                                </span>
                                <span className="text-xs font-mono text-slate-400 font-semibold">
                                  {finding.ruleId}
                                </span>
                                <span className="text-xs text-slate-500 font-mono">
                                  Line {finding.line || 1}
                                </span>
                              </div>
                              <h4 className="text-sm font-bold text-slate-100">{finding.title}</h4>
                            </div>

                            {finding.references?.[0] && (
                              <a
                                href={finding.references[0]}
                                target="_blank"
                                rel="noreferrer"
                                className="text-slate-400 hover:text-sky-400 transition"
                                title="View official PostgreSQL documentation"
                              >
                                <ExternalLink className="h-3.5 w-3.5" />
                              </a>
                            )}
                          </div>

                          <p className="text-xs text-slate-300 leading-relaxed">{finding.impact}</p>

                          {/* Evidence */}
                          <div className="bg-slate-950 border border-slate-800 rounded p-2 text-xs font-mono text-slate-300 overflow-x-auto">
                            <code>{finding.evidence}</code>
                          </div>

                          {/* Remediation Guidance */}
                          <div className="bg-slate-950/80 border border-sky-900/40 rounded p-3 text-xs space-y-2">
                            <div className="flex items-center justify-between text-sky-400 font-medium">
                              <span className="flex items-center gap-1.5">
                                <CheckCircle2 className="h-3.5 w-3.5" />
                                Remediation Recommendation:
                              </span>
                              {finding.mitigationSql && (
                                <button
                                  onClick={() => handleCopy(finding.mitigationSql!, finding.id)}
                                  className="text-[11px] text-slate-400 hover:text-slate-200 flex items-center gap-1 font-mono"
                                >
                                  {copiedId === finding.id ? (
                                    <Check className="h-3 w-3 text-emerald-400" />
                                  ) : (
                                    <Copy className="h-3 w-3" />
                                  )}
                                  Copy Fix
                                </button>
                              )}
                            </div>
                            <p className="text-slate-300 text-xs">{finding.recommendation}</p>

                            {finding.mitigationSql && (
                              <pre className="bg-slate-900 border border-slate-800 text-emerald-400 p-2 rounded text-[11px] font-mono overflow-x-auto">
                                <code>{finding.mitigationSql}</code>
                              </pre>
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-center p-8 space-y-3">
                  <Database className="h-10 w-10 text-slate-600" />
                  <h3 className="text-sm font-semibold text-slate-300">Ready to Analyze</h3>
                  <p className="text-xs text-slate-500 max-w-sm">
                    Enter your migration SQL on the left panel or pick a preset to run risk scoring and lock analysis.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 2: DASHBOARD */}
        {activeTab === "dashboard" && (
          <div className="p-8 max-w-6xl mx-auto space-y-6">
            <div>
              <h2 className="text-xl font-bold text-slate-100">Migration Safety Dashboard</h2>
              <p className="text-xs text-slate-400 mt-1">Aggregate telemetry and recent migration risk statistics</p>
            </div>

            {/* Metrics Grid */}
            <div className="grid grid-cols-4 gap-4">
              <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl">
                <span className="text-xs text-slate-400">Total Migrations Analyzed</span>
                <div className="text-2xl font-bold font-mono text-slate-100 mt-1">{analysesList.length}</div>
                <span className="text-[10px] text-sky-400 mt-1 block">Local SQLite Persistence</span>
              </div>
              <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl">
                <span className="text-xs text-slate-400">Critical / High Violations</span>
                <div className="text-2xl font-bold font-mono text-rose-400 mt-1">
                  {analysesList.reduce((acc, a) => acc + (a.critical_count || 0) + (a.high_count || 0), 0)}
                </div>
                <span className="text-[10px] text-rose-400/80 mt-1 block">Requires staged migration</span>
              </div>
              <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl">
                <span className="text-xs text-slate-400">Zero-Downtime Pass Rate</span>
                <div className="text-2xl font-bold font-mono text-emerald-400 mt-1">
                  {analysesList.length > 0
                    ? Math.round(
                        (analysesList.filter((a) => !a.blocked).length / analysesList.length) * 100
                      )
                    : 100}
                  %
                </div>
                <span className="text-[10px] text-emerald-400/80 mt-1 block">Approved for production</span>
              </div>
              <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl">
                <span className="text-xs text-slate-400">Rules Engine Version</span>
                <div className="text-2xl font-bold font-mono text-sky-400 mt-1">v1.0.0</div>
                <span className="text-[10px] text-slate-400 mt-1 block">25 Safety Rules Active</span>
              </div>
            </div>

            {/* Recent Analyses History Table */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
              <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-200">Recent Migration Analyses</h3>
                <button
                  onClick={() => setActiveTab("workspace")}
                  className="text-xs text-sky-400 hover:text-sky-300 flex items-center gap-1 font-medium"
                >
                  Analyze New <ArrowRight className="h-3 w-3" />
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-950 text-slate-400 border-b border-slate-800 font-mono">
                    <tr>
                      <th className="py-2.5 px-4">Migration File</th>
                      <th className="py-2.5 px-4">Postgres</th>
                      <th className="py-2.5 px-4">Verdict</th>
                      <th className="py-2.5 px-4">Score</th>
                      <th className="py-2.5 px-4">Violations</th>
                      <th className="py-2.5 px-4">Analyzed At</th>
                      <th className="py-2.5 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800 text-slate-300">
                    {analysesList.map((item) => (
                      <tr key={item.id} className="hover:bg-slate-800/40">
                        <td className="py-3 px-4 font-mono font-medium text-slate-200">{item.migration_name}</td>
                        <td className="py-3 px-4 font-mono">PG {item.target_postgres_version}</td>
                        <td className="py-3 px-4">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase font-mono ${
                              item.blocked ? "bg-rose-950 text-rose-300" : "bg-emerald-950 text-emerald-300"
                            }`}
                          >
                            {item.blocked ? "BLOCKED" : "APPROVED"}
                          </span>
                        </td>
                        <td className="py-3 px-4 font-mono font-bold">{item.risk_score}/100</td>
                        <td className="py-3 px-4 font-mono">
                          {item.critical_count}c / {item.high_count}h / {item.medium_count}m
                        </td>
                        <td className="py-3 px-4 text-slate-400">
                          {new Date(item.created_at).toLocaleTimeString()}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <button
                            onClick={async () => {
                              const res = await fetch(`/api/v1/analyses/${item.id}`);
                              const detail = await res.json();
                              setMigrationName(detail.migration_name);
                              setSql(detail.sql_content);
                              setCurrentResult(detail.result);
                              setActiveTab("workspace");
                            }}
                            className="text-sky-400 hover:text-sky-300 font-medium"
                          >
                            Inspect
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: RULES CATALOG */}
        {activeTab === "rules" && (
          <div className="p-8 max-w-6xl mx-auto space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-slate-100">PostgreSQL Migration Safety Rules</h2>
                <p className="text-xs text-slate-400 mt-1">
                  Catalog of {rulesCatalog.length} deterministic rules protecting production availability and data integrity
                </p>
              </div>

              <div className="flex items-center gap-3">
                <input
                  type="text"
                  placeholder="Search rules..."
                  value={rulesSearch}
                  onChange={(e) => setRulesSearch(e.target.value)}
                  className="bg-slate-900 border border-slate-800 rounded-md px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-sky-500 w-64"
                />
              </div>
            </div>

            {/* Rules Category Filters */}
            <div className="flex items-center gap-2 overflow-x-auto text-xs">
              {[
                "all",
                "destructive",
                "locking",
                "index",
                "column",
                "constraint",
                "transaction",
                "compatibility",
                "reversibility",
                "large_table",
              ].map((cat) => (
                <button
                  key={cat}
                  onClick={() => setSelectedRuleCategory(cat)}
                  className={`px-3 py-1.5 rounded-md capitalize transition font-medium ${
                    selectedRuleCategory === cat
                      ? "bg-slate-800 text-sky-400 border border-slate-700"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  {cat.replace("_", " ")}
                </button>
              ))}
            </div>

            {/* Rules Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {rulesCatalog
                .filter((r) => {
                  if (selectedRuleCategory !== "all" && r.category !== selectedRuleCategory) return false;
                  if (rulesSearch) {
                    const q = rulesSearch.toLowerCase();
                    return r.title.toLowerCase().includes(q) || r.id.toLowerCase().includes(q) || r.description.toLowerCase().includes(q);
                  }
                  return true;
                })
                .map((rule) => (
                  <div key={rule.id} className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-3">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold text-sky-400 px-2 py-0.5 rounded bg-sky-950 border border-sky-800">
                          {rule.id}
                        </span>
                        <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                          {rule.defaultSeverity}
                        </span>
                        <span className="text-[10px] text-slate-400 capitalize">{rule.category}</span>
                      </div>
                      <a
                        href={rule.docUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-slate-500 hover:text-sky-400 transition"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    </div>

                    <h4 className="text-sm font-bold text-slate-100">{rule.title}</h4>
                    <p className="text-xs text-slate-300 leading-relaxed">{rule.description}</p>

                    <div className="space-y-2 pt-2 border-t border-slate-800 text-xs">
                      <div>
                        <span className="text-rose-400 font-semibold block text-[11px] mb-1">❌ Dangerous Pattern:</span>
                        <pre className="bg-slate-950 border border-slate-800/80 text-rose-300 p-2 rounded text-[11px] font-mono overflow-x-auto">
                          <code>{rule.exampleBadSql}</code>
                        </pre>
                      </div>
                      <div>
                        <span className="text-emerald-400 font-semibold block text-[11px] mb-1">✅ Safe Alternative:</span>
                        <pre className="bg-slate-950 border border-slate-800/80 text-emerald-300 p-2 rounded text-[11px] font-mono overflow-x-auto">
                          <code>{rule.exampleGoodSql}</code>
                        </pre>
                      </div>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        )}

        {/* TAB 4: HISTORY & DIFF */}
        {activeTab === "history" && (
          <div className="p-8 max-w-5xl mx-auto space-y-6">
            <div>
              <h2 className="text-xl font-bold text-slate-100">Migration Comparison & Diff Tool</h2>
              <p className="text-xs text-slate-400 mt-1">Compare baseline vs candidate migrations to verify risk mitigation</p>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-slate-400 block mb-1.5 font-medium">1. Baseline Migration</label>
                  <select
                    value={compareSourceId}
                    onChange={(e) => setCompareSourceId(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-md p-2 text-xs text-slate-200 focus:outline-none focus:border-sky-500 font-mono"
                  >
                    <option value="">Select baseline migration...</option>
                    {analysesList.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.migration_name} (Risk: {a.risk_score}/100)
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs text-slate-400 block mb-1.5 font-medium">2. Candidate Migration</label>
                  <select
                    value={compareTargetId}
                    onChange={(e) => setCompareTargetId(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-md p-2 text-xs text-slate-200 focus:outline-none focus:border-sky-500 font-mono"
                  >
                    <option value="">Select candidate migration...</option>
                    {analysesList.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.migration_name} (Risk: {a.risk_score}/100)
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  onClick={runCompare}
                  className="px-4 py-2 rounded-md bg-sky-600 hover:bg-sky-500 text-white font-semibold text-xs flex items-center gap-2 transition"
                >
                  Compare Migrations
                </button>
              </div>

              {compareDiff && (
                <div className="mt-4 pt-4 border-t border-slate-800 space-y-4">
                  <div className="grid grid-cols-3 gap-4 text-center">
                    <div className="bg-slate-950 p-4 rounded-lg border border-slate-800">
                      <span className="text-xs text-slate-400">Risk Score Delta</span>
                      <div
                        className={`text-2xl font-bold font-mono mt-1 ${
                          compareDiff.scoreDelta <= 0 ? "text-emerald-400" : "text-rose-400"
                        }`}
                      >
                        {compareDiff.scoreDelta > 0 ? `+${compareDiff.scoreDelta}` : compareDiff.scoreDelta}
                      </div>
                      <span className="text-[10px] text-slate-400">
                        {compareDiff.scoreDelta <= 0 ? "Risk Reduced" : "Risk Increased"}
                      </span>
                    </div>

                    <div className="bg-slate-950 p-4 rounded-lg border border-slate-800">
                      <span className="text-xs text-slate-400">Findings Count Delta</span>
                      <div
                        className={`text-2xl font-bold font-mono mt-1 ${
                          compareDiff.findingsDelta <= 0 ? "text-emerald-400" : "text-rose-400"
                        }`}
                      >
                        {compareDiff.findingsDelta > 0 ? `+${compareDiff.findingsDelta}` : compareDiff.findingsDelta}
                      </div>
                      <span className="text-[10px] text-slate-400">Violations difference</span>
                    </div>

                    <div className="bg-slate-950 p-4 rounded-lg border border-slate-800">
                      <span className="text-xs text-slate-400">Candidate Verdict</span>
                      <div
                        className={`text-2xl font-bold font-mono mt-1 ${
                          compareDiff.target.result.summary.blocked ? "text-rose-400" : "text-emerald-400"
                        }`}
                      >
                        {compareDiff.target.result.summary.blocked ? "BLOCKED" : "APPROVED"}
                      </div>
                      <span className="text-[10px] text-slate-400">Policy Evaluation</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 5: DOCUMENTATION */}
        {activeTab === "docs" && (
          <div className="p-8 max-w-4xl mx-auto space-y-6">
            <div>
              <h2 className="text-xl font-bold text-slate-100">MigrationPilot Documentation</h2>
              <p className="text-xs text-slate-400 mt-1">Zero-downtime PostgreSQL schema migration handbook and CLI guide</p>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-6 text-sm text-slate-300 leading-relaxed">
              <section className="space-y-2">
                <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
                  <Terminal className="h-4 w-4 text-sky-400" /> CLI Integration
                </h3>
                <p className="text-xs text-slate-400">
                  Analyze migrations in CI/CD before running them against production databases.
                </p>
                <pre className="bg-slate-950 text-sky-300 p-3 rounded font-mono text-xs overflow-x-auto">
                  <code># Analyze a single file
migrationpilot analyze ./migrations/001_orders.sql

# Analyze entire migrations directory with SARIF output for GitHub Actions
migrationpilot analyze ./migrations --format sarif --output migrationpilot.sarif --fail-on high</code>
                </pre>
              </section>

              <section className="space-y-2 pt-4 border-t border-slate-800">
                <h3 className="text-base font-bold text-slate-100">Key PostgreSQL Zero-Downtime Principles</h3>
                <ul className="list-disc pl-5 space-y-1 text-xs text-slate-300">
                  <li>
                    <strong>Always use CONCURRENTLY for indexes:</strong> Standard CREATE INDEX acquires a SHARE lock, halting all incoming INSERT, UPDATE, and DELETE queries.
                  </li>
                  <li>
                    <strong>Add Foreign Keys with NOT VALID:</strong> Adding constraints without NOT VALID acquires strong locks across both referenced and referencing tables.
                  </li>
                  <li>
                    <strong>Set lock_timeout on DDL:</strong> Prevents migrations from queueing behind read-heavy queries and starving connection pools.
                  </li>
                  <li>
                    <strong>Never run CREATE INDEX CONCURRENTLY inside transactions:</strong> PostgreSQL rejects concurrent index creation inside explicit `BEGIN ... COMMIT` blocks.
                  </li>
                </ul>
              </section>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
