import {
  MigrationFinding,
  Severity,
  Confidence,
  Environment,
  RiskLevel,
  RiskBreakdown,
  AnalysisSummary,
} from "../types/index.js";

const SEVERITY_WEIGHTS: Record<Severity, number> = {
  critical: 35,
  high: 20,
  medium: 10,
  low: 4,
  info: 1,
};

const CONFIDENCE_WEIGHTS: Record<Confidence, number> = {
  high: 1.0,
  medium: 0.8,
  low: 0.5,
};

const ENVIRONMENT_FACTORS: Record<Environment, number> = {
  production: 1.25,
  staging: 1.0,
  development: 0.7,
};

export function calculateRiskSummary(
  findings: MigrationFinding[],
  totalStatements: number,
  environment: Environment = "production",
  failOnThreshold: Severity = "high"
): AnalysisSummary {
  let criticalCount = 0;
  let highCount = 0;
  let mediumCount = 0;
  let lowCount = 0;
  let infoCount = 0;

  const ruleCounts: Record<string, number> = {};

  let availabilityScore = 0;
  let dataLossScore = 0;
  let lockContentionScore = 0;
  let compatibilityScore = 0;

  let rawTotal = 0;

  for (const f of findings) {
    switch (f.severity) {
      case "critical":
        criticalCount++;
        break;
      case "high":
        highCount++;
        break;
      case "medium":
        mediumCount++;
        break;
      case "low":
        lowCount++;
        break;
      case "info":
        infoCount++;
        break;
    }

    const count = (ruleCounts[f.ruleId] || 0) + 1;
    ruleCounts[f.ruleId] = count;

    // Diminishing returns for repeated instances of same rule
    const repeatDiscount = 1 / (1 + 0.3 * (count - 1));
    const baseWeight = SEVERITY_WEIGHTS[f.severity] || 5;
    const confWeight = CONFIDENCE_WEIGHTS[f.confidence] || 1.0;
    const itemScore = baseWeight * confWeight * repeatDiscount;

    rawTotal += itemScore;

    // Categorical breakdown
    if (f.category === "locking" || f.category === "index") {
      availabilityScore += itemScore;
    } else if (f.category === "destructive" || f.category === "reversibility") {
      dataLossScore += itemScore;
    } else if (f.category === "transaction" || f.category === "compatibility") {
      compatibilityScore += itemScore;
    } else {
      lockContentionScore += itemScore;
    }
  }

  // Adjust for environment
  const envFactor = ENVIRONMENT_FACTORS[environment] || 1.0;
  const scaledScore = Math.min(100, Math.round(rawTotal * envFactor));

  // Determine qualitative risk level
  let riskLevel: RiskLevel = "low";
  if (scaledScore >= 80 || criticalCount > 0) {
    riskLevel = "critical";
  } else if (scaledScore >= 60 || highCount > 0) {
    riskLevel = "high";
  } else if (scaledScore >= 40) {
    riskLevel = "elevated";
  } else if (scaledScore >= 20) {
    riskLevel = "moderate";
  } else {
    riskLevel = "low";
  }

  // Determine if blocked based on failOn threshold
  const severityRank: Record<Severity, number> = {
    info: 0,
    low: 1,
    medium: 2,
    high: 3,
    critical: 4,
  };

  const thresholdRank = severityRank[failOnThreshold] ?? 3; // default high
  let blocked = false;

  for (const f of findings) {
    if (severityRank[f.severity] >= thresholdRank) {
      blocked = true;
      break;
    }
  }

  const breakdown: RiskBreakdown = {
    availability: Math.min(100, Math.round(availabilityScore * envFactor)),
    dataLoss: Math.min(100, Math.round(dataLossScore * envFactor)),
    lockContention: Math.min(100, Math.round(lockContentionScore * envFactor)),
    compatibility: Math.min(100, Math.round(compatibilityScore * envFactor)),
  };

  return {
    totalStatements,
    totalFindings: findings.length,
    critical: criticalCount,
    high: highCount,
    medium: mediumCount,
    low: lowCount,
    informational: infoCount,
    blocked,
    riskScore: scaledScore,
    riskLevel,
    breakdown,
  };
}
