# Contributing to MigrationPilot

Thank you for contributing to MigrationPilot! We welcome pull requests, bug reports, and rule improvements.

## Development Setup

1. Prerequisites: Node.js >= 20, pnpm >= 9.
2. Clone repository:
   ```bash
   git clone https://github.com/0xyz-exe/migrationpilot.git
   cd migrationpilot
   ```
3. Install dependencies:
   ```bash
   pnpm install
   ```
4. Build packages:
   ```bash
   pnpm build
   ```
5. Run tests:
   ```bash
   pnpm test
   ```

## Adding a New Safety Rule

1. Open `packages/analyzer/src/catalog/rules.ts` and add rule metadata to `RULES_CATALOG`.
2. Implement AST or fallback detection logic in `packages/analyzer/src/rules/engine.ts`.
3. Add positive and negative unit test cases in `packages/analyzer/tests/analyzer.test.ts`.
4. Ensure `pnpm test` passes.
