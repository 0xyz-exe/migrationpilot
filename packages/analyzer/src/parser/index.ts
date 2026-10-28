import { parse as pgsqlParse } from "pgsql-ast-parser";
import { ParsedStatement, AnalysisDiagnostic } from "../types/index.js";

/**
 * Splits a PostgreSQL script into individual statements, respecting comments,
 * string literals, and dollar-quoted blocks, tracking exact line & column offsets.
 */
export function splitStatements(sql: string): { statements: ParsedStatement[]; diagnostics: AnalysisDiagnostic[] } {
  const statements: ParsedStatement[] = [];
  const diagnostics: AnalysisDiagnostic[] = [];

  let currentStart = 0;
  let currentLine = 1;
  let currentCol = 1;
  let stmtStartLine = 1;
  let stmtStartCol = 1;

  let inSingleQuote = false;
  let inBlockComment = false;
  let inLineComment = false;
  let dollarTag: string | null = null;

  const len = sql.length;
  let i = 0;

  function advance(char: string) {
    if (char === "\n") {
      currentLine++;
      currentCol = 1;
    } else {
      currentCol++;
    }
  }

  while (i < len) {
    const ch = sql[i];
    const nextCh = i + 1 < len ? sql[i + 1] : "";

    // If we're at the beginning of a new statement, skip leading whitespace
    if (currentStart === i && /\s/.test(ch)) {
      advance(ch);
      i++;
      currentStart = i;
      stmtStartLine = currentLine;
      stmtStartCol = currentCol;
      continue;
    }

    // 1. Single line comment
    if (inLineComment) {
      if (ch === "\n") {
        inLineComment = false;
      }
      advance(ch);
      i++;
      continue;
    }

    // 2. Block comment
    if (inBlockComment) {
      if (ch === "*" && nextCh === "/") {
        advance(ch);
        advance(nextCh);
        i += 2;
        inBlockComment = false;
        continue;
      }
      advance(ch);
      i++;
      continue;
    }

    // 3. Single quote string literal
    if (inSingleQuote) {
      if (ch === "'") {
        if (nextCh === "'") {
          // escaped quote ''
          advance(ch);
          advance(nextCh);
          i += 2;
          continue;
        } else {
          inSingleQuote = false;
        }
      }
      advance(ch);
      i++;
      continue;
    }

    // 4. Dollar quoting $$ ... $$ or $tag$ ... $tag$
    if (dollarTag !== null) {
      if (ch === "$") {
        const potentialTag = sql.slice(i, i + dollarTag.length);
        if (potentialTag === dollarTag) {
          for (let k = 0; k < dollarTag.length; k++) {
            advance(sql[i + k]);
          }
          i += dollarTag.length;
          dollarTag = null;
          continue;
        }
      }
      advance(ch);
      i++;
      continue;
    }

    // Check entry into comments or quotes
    if (ch === "-" && nextCh === "-") {
      inLineComment = true;
      advance(ch);
      advance(nextCh);
      i += 2;
      continue;
    }

    if (ch === "/" && nextCh === "*") {
      inBlockComment = true;
      advance(ch);
      advance(nextCh);
      i += 2;
      continue;
    }

    if (ch === "'") {
      inSingleQuote = true;
      advance(ch);
      i++;
      continue;
    }

    // Dollar quote opening: $[A-Za-z0-9_]*$
    if (ch === "$") {
      const match = sql.slice(i).match(/^\$([A-Za-z0-9_]*)\$/);
      if (match) {
        dollarTag = match[0];
        for (let k = 0; k < dollarTag.length; k++) {
          advance(sql[i + k]);
        }
        i += dollarTag.length;
        continue;
      }
    }

    // Statement boundary: semicolon
    if (ch === ";") {
      const raw = sql.slice(currentStart, i);
      const clean = stripComments(raw).trim();
      if (clean.length > 0) {
        statements.push({
          index: statements.length,
          rawSql: raw.trim(),
          cleanSql: clean,
          startLine: stmtStartLine,
          startCol: stmtStartCol,
          endLine: currentLine,
        });
      }
      advance(ch);
      i++;
      currentStart = i;
      stmtStartLine = currentLine;
      stmtStartCol = currentCol;
      continue;
    }

    advance(ch);
    i++;
  }

  // Trailing statement without semicolon
  if (currentStart < len) {
    const raw = sql.slice(currentStart);
    const clean = stripComments(raw).trim();
    if (clean.length > 0) {
      statements.push({
        index: statements.length,
        rawSql: raw.trim(),
        cleanSql: clean,
        startLine: stmtStartLine,
        startCol: stmtStartCol,
        endLine: currentLine,
      });
    }
  }

  return { statements, diagnostics };
}

/**
 * Remove SQL comments to simplify token/regex inspection
 */
export function stripComments(sql: string): string {
  // Remove block comments /* */ and line comments --
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/--.*$/gm, "")
    .trim();
}

/**
 * Parses statement using pgsql-ast-parser with fallback.
 */
export function parseStatements(sql: string): { statements: ParsedStatement[]; diagnostics: AnalysisDiagnostic[] } {
  const { statements, diagnostics } = splitStatements(sql);

  for (const stmt of statements) {
    try {
      const parsedAst = pgsqlParse(stmt.cleanSql);
      if (parsedAst && parsedAst.length > 0) {
        stmt.ast = parsedAst[0];
      }
    } catch (err: any) {
      stmt.parseError = err.message || "Failed to parse statement";
      // Log diagnostic for unparsed statements
      diagnostics.push({
        level: "info",
        message: `Statement ${stmt.index + 1} parsed with fallback analyzer: ${(stmt.parseError || "").split("\n")[0]}`,
        line: stmt.startLine,
        column: stmt.startCol,
      });
    }
  }

  return { statements, diagnostics };
}
