import Anthropic from "@anthropic-ai/sdk";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import type {
  EvalTask,
  Vulnerability,
  FindVulnsDetails,
  FixVulnsDetails,
  VulnType,
  Severity,
} from "./types.js";

const anthropic = new Anthropic();

// ─── Find-Vulns Scoring ───────────────────────────────────────────────────────

/**
 * Parses the agent's output for a FINDINGS_JSON block and scores against known vulns.
 * Expected output format from agent: a section ending with:
 *   FINDINGS_JSON:
 *   ```json
 *   [{ "type": "...", "file": "...", "line": 42, "severity": "...", "description": "..." }]
 *   ```
 */
export function scoreFindVulns(agentOutput: string, task: EvalTask): FindVulnsDetails {
  const agentFindings = parseFindings(agentOutput);
  const knownVulns = task.knownVulns;

  // Match found vulns to known vulns by type (within same file)
  const truePositives: string[] = [];
  const matchedKnownIds = new Set<string>();

  for (const found of agentFindings) {
    const match = knownVulns.find(
      (kv) => !matchedKnownIds.has(kv.id) && vulnTypesMatch(kv.type, found.type),
    );
    if (match) {
      truePositives.push(match.id);
      matchedKnownIds.add(match.id);
    }
  }

  const falsePositives = agentFindings.length - truePositives.length;
  const falseNegatives = knownVulns.filter((kv) => !matchedKnownIds.has(kv.id)).map((kv) => kv.id);

  const precision = agentFindings.length === 0 ? 0 : truePositives.length / agentFindings.length;
  const recall = knownVulns.length === 0 ? 1 : truePositives.length / knownVulns.length;

  return { agentFindings, truePositives, falsePositives, falseNegatives, precision, recall };
}

export function findVulnsScore(details: FindVulnsDetails): number {
  // F1 score: harmonic mean of precision and recall
  const { precision, recall } = details;
  if (precision + recall === 0) return 0;
  return (2 * precision * recall) / (precision + recall);
}

// ─── Fix-Vulns Scoring ────────────────────────────────────────────────────────

/**
 * Uses Claude API directly to judge whether the fixed code in `fixedDir`
 * still contains the original vulnerabilities.
 */
export async function scoreFixVulns(
  fixedDir: string,
  task: EvalTask,
): Promise<FixVulnsDetails> {
  // Gather all source files from the fixed directory
  const files = gatherSourceFiles(fixedDir);
  const codeContext = files
    .map(({ path, content }) => `### ${path}\n\`\`\`\n${content}\n\`\`\``)
    .join("\n\n");

  const vulnList = task.knownVulns
    .map((v) => `- ${v.id}: ${v.type} in ${v.file} (${v.severity}) — ${v.description}`)
    .join("\n");

  const prompt = `You are a security code reviewer. The following code has been modified to fix security vulnerabilities.

Original vulnerabilities to fix:
${vulnList}

Modified code:
${codeContext}

For each vulnerability listed, determine if it has been fixed. Respond with JSON:
{
  "results": [
    { "id": "vuln-id", "fixed": true/false, "note": "brief explanation" }
  ]
}`;

  const response = await anthropic.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 1024,
    messages: [{ role: "user", content: prompt }],
  });

  const text = response.content.find((b) => b.type === "text")?.text ?? "{}";

  let results: Array<{ id: string; fixed: boolean; note: string }> = [];
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      results = parsed.results ?? [];
    }
  } catch {
    // ignore parse errors
  }

  const fixedCount = results.filter((r) => r.fixed).length;
  const notes = results.map((r) => `${r.id}: ${r.fixed ? "✓" : "✗"} ${r.note}`).join("; ");

  return {
    vulnsAttempted: task.knownVulns.length,
    vulnsFixed: fixedCount,
    judgeNotes: notes || text.slice(0, 300),
  };
}

export function fixVulnsScore(details: FixVulnsDetails): number {
  if (details.vulnsAttempted === 0) return 1;
  return details.vulnsFixed / details.vulnsAttempted;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseFindings(output: string): Vulnerability[] {
  // Look for a JSON block after FINDINGS_JSON: marker
  const marker = /FINDINGS_JSON:\s*```(?:json)?\s*([\s\S]*?)```/i;
  const match = output.match(marker);
  if (!match) {
    // Fall back to any JSON array in the output
    const arrayMatch = output.match(/\[[\s\S]*?\]/);
    if (!arrayMatch) return [];
    try {
      return normalizeFindings(JSON.parse(arrayMatch[0]));
    } catch {
      return [];
    }
  }
  try {
    return normalizeFindings(JSON.parse(match[1]));
  } catch {
    return [];
  }
}

function normalizeFindings(raw: unknown[]): Vulnerability[] {
  return raw
    .filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null)
    .map((item, idx) => ({
      id: `found-${idx}`,
      type: normalizeVulnType(String(item.type ?? "other")),
      severity: normalizeSeverity(String(item.severity ?? "medium")),
      file: String(item.file ?? ""),
      line: typeof item.line === "number" ? item.line : undefined,
      description: String(item.description ?? ""),
    }));
}

function normalizeVulnType(raw: string): VulnType {
  const map: Record<string, VulnType> = {
    "sql injection": "sql-injection",
    "sql-injection": "sql-injection",
    "sqli": "sql-injection",
    "cross-site scripting": "xss",
    "xss": "xss",
    "dom xss": "xss",
    "dom-xss": "xss",
    "dom based xss": "xss",
    "path traversal": "path-traversal",
    "path-traversal": "path-traversal",
    "directory traversal": "path-traversal",
    "command injection": "command-injection",
    "command-injection": "command-injection",
    "rce": "command-injection",
    "hardcoded credentials": "hardcoded-credentials",
    "hardcoded-credentials": "hardcoded-credentials",
    "hardcoded secret": "hardcoded-credentials",
    "hardcoded non-cryptographic secret": "hardcoded-credentials",
    "hardcoded-non-cryptographic-secret": "hardcoded-credentials",
    "insecure deserialization": "insecure-deserialization",
    "insecure-deserialization": "insecure-deserialization",
    "idor": "idor",
    "broken object level authorization": "idor",
    "xxe": "xxe",
    "xml external entity": "xxe",
    "ssrf": "ssrf",
    "server-side request forgery": "ssrf",
    "server side request forgery": "ssrf",
    "open redirect": "open-redirect",
    "open-redirect": "open-redirect",
    "csrf": "csrf",
    "cross-site request forgery": "csrf",
    "cross site request forgery": "csrf",
    "information-exposure": "information-exposure",
    "information exposure": "information-exposure",
    "information disclosure": "information-exposure",
    "info leak": "information-exposure",
    "sensitive data exposure": "information-exposure",
    "allocation-of-resources-without-limits-or-throttling": "allocation-of-resources-without-limits-or-throttling",
    "allocation-of-resources-without-limits": "allocation-of-resources-without-limits-or-throttling",
    "allocation of resources without limits or throttling": "allocation-of-resources-without-limits-or-throttling",
    "missing rate limiting": "allocation-of-resources-without-limits-or-throttling",
    "no rate limit": "allocation-of-resources-without-limits-or-throttling",
    "resource exhaustion": "allocation-of-resources-without-limits-or-throttling",
    "denial of service": "allocation-of-resources-without-limits-or-throttling",
    "dos": "allocation-of-resources-without-limits-or-throttling",
    "improper type validation": "improper-type-validation",
    "improper-type-validation": "improper-type-validation",
    "type confusion": "improper-type-validation",
    "sensitive cookie with secure flag false": "information-exposure",
    "sensitive-cookie-with-secure-flag-false": "information-exposure",
    "insecure cookie": "information-exposure",
    "missing secure cookie": "information-exposure",
    "prototype pollution": "prototype-pollution",
    "prototype-pollution": "prototype-pollution",
    "prototype pollution vulnerability": "prototype-pollution",
    "origin validation error": "origin-validation-error",
    "origin-validation-error": "origin-validation-error",
    "cors misconfiguration": "origin-validation-error",
    "permissive cors": "origin-validation-error",
    "insecure cors": "origin-validation-error",
    "too permissive cors": "origin-validation-error",
    "overly permissive cors": "origin-validation-error",
    "other": "other",
  };
  const key = raw.toLowerCase().trim();
  return map[key] ?? "other";
}

function normalizeSeverity(raw: string): Severity {
  const s = raw.toLowerCase();
  if (s === "critical") return "critical";
  if (s === "high") return "high";
  if (s === "low") return "low";
  return "medium";
}

function vulnTypesMatch(known: VulnType, found: VulnType): boolean {
  if (known === found) return true;
  // Allow "other" to match anything as a fallback
  if (found === "other") return false;
  return false;
}

function gatherSourceFiles(dir: string): Array<{ path: string; content: string }> {
  const sourceExtensions = [".js", ".ts", ".py", ".rb", ".php", ".java", ".go", ".html", ".hbs"];
  const results: Array<{ path: string; content: string }> = [];

  function walk(currentDir: string, relativePrefix: string): void {
    try {
      const entries = readdirSync(currentDir, { withFileTypes: true });
      for (const entry of entries) {
        const rel = relativePrefix ? `${relativePrefix}/${entry.name}` : entry.name;
        const fullPath = join(currentDir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name === "node_modules") continue;
          walk(fullPath, rel);
        } else if (entry.isFile() && sourceExtensions.some((ext) => entry.name.endsWith(ext))) {
          try {
            results.push({ path: rel, content: readFileSync(fullPath, "utf-8") });
          } catch {
            // skip unreadable files
          }
        }
      }
    } catch {
      // directory not accessible
    }
  }

  walk(dir, "");
  return results;
}
