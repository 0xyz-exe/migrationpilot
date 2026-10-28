# MigrationPilot CLI Guide

```bash
# Analyze a single migration file
migrationpilot analyze ./migrations/001_add_orders.sql

# Analyze entire directory with JSON output
migrationpilot analyze ./migrations --format json --output report.json

# Analyze with SARIF format for GitHub Code Scanning
migrationpilot analyze ./migrations --format sarif --output migrationpilot.sarif --fail-on high

# List all safety rules
migrationpilot rules list

# Inspect specific rule architecture and remediations
migrationpilot rules explain MP020
```

## Exit Codes

- `0`: Analysis clean, no findings exceeding the threshold.
- `1`: Findings exceeded threshold (migration blocked).
- `2`: Invalid CLI configuration or missing file.
- `3`: Internal parser error.
