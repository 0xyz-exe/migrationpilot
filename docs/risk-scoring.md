# MigrationPilot Risk Scoring Model

MigrationPilot calculates an explainable risk score normalized between **0 and 100**.

## Severity Weights

- **Critical:** 35 points
- **High:** 20 points
- **Medium:** 10 points
- **Low:** 4 points
- **Info:** 1 point

## Modifiers

- **Confidence Factor:** High = 1.0, Medium = 0.8, Low = 0.5.
- **Environment Multiplier:** Production = 1.25, Staging = 1.0, Development = 0.7.
- **Repeat Deduplication:** Diminishing returns apply to repeated instances of the same rule on the same statement:
  $$\text{Multiplier} = \frac{1}{1 + 0.3 \times (\text{count} - 1)}$$

## Qualitative Levels

- **0–19: Low Risk** (Approved for automatic deployment)
- **20–39: Moderate Risk** (Requires review or staging verification)
- **40–59: Elevated Risk** (Requires DBA review and off-peak execution)
- **60–79: High Risk** (Blocks standard CI/CD deployment)
- **80–100: Critical Risk** (Blocked by policy; causes outage or data loss)
