import type { FindingRecord } from "./index.js";

// SARIF structure emitted by `snyk code test --json`
interface SarifOutput {
  runs?: Array<{
    results?: Array<{
      ruleId?: string;
      level?: string;
      message?: { text?: string };
      locations?: Array<{
        physicalLocation?: {
          artifactLocation?: { uri?: string };
          region?: { startLine?: number };
        };
      }>;
    }>;
  }>;
}

/**
 * Maps a Snyk Code ruleId (e.g. "javascript/SqlInjection") to our VulnType enum.
 * Mirrors the jq mapping used in manual analysis.
 */
function mapRuleId(ruleId: string): string {
  const id = ruleId.toLowerCase();
  if (/sqli|sqlinjection/.test(id)) return "sql-injection";
  if (/domxss|dom\.xss/.test(id)) return "xss";
  if (/xss/.test(id)) return "xss";
  // "PT" suffix pattern covers javascript/PT; "pathtraversal" covers longer names
  if (/pathtraversal|pt$/.test(id)) return "path-traversal";
  if (/commandinjection/.test(id)) return "command-injection";
  if (/csrf/.test(id)) return "csrf";
  if (/openredirect/.test(id)) return "open-redirect";
  if (/ssrf/.test(id)) return "ssrf";
  if (/xxe|xmlexternalentity/.test(id)) return "xxe";
  if (/impropertype|typevalidation/.test(id)) return "improper-type-validation";
  if (/cookie.*secure|sensitivecookie|insecurecookie/.test(id)) return "information-exposure";
  if (/hardcodednoncryptographic|noncryptographicsecret/.test(id)) return "hardcoded-credentials";
  if (/hardcoded/.test(id)) return "hardcoded-credentials";
  if (/deserializ/.test(id)) return "insecure-deserialization";
  if (/idor|insecuredirectobject/.test(id)) return "idor";
  if (/informationexposure|infoleak|sensitivedata|x-powered-by/.test(id)) return "information-exposure";
  // Snyk Code flags missing rate limiting as NoRateLimiting or similar; original jq noted these fell to "other"
  if (/ratelimit|nothrottle|resourceexhaust/.test(id)) return "allocation-of-resources-without-limits-or-throttling";
  return "other";
}

/**
 * Maps SARIF severity level to our Severity enum.
 * Snyk Code uses error/warning/note — it does not emit "critical".
 */
function mapLevel(level: string): string {
  if (level === "error") return "high";
  if (level === "warning") return "medium";
  if (level === "note") return "low";
  return "medium";
}

/**
 * Parses the JSON output of `snyk code test --json` into FindingRecord[].
 * Handles both zero-exit (no findings) and non-zero-exit (findings present) stdout.
 */
export function parseSnykCodeOutput(stdout: string): FindingRecord[] {
  if (!stdout.trim()) return [];

  let sarif: SarifOutput;
  try {
    sarif = JSON.parse(stdout);
  } catch {
    return [];
  }

  const results = sarif.runs?.[0]?.results;
  if (!Array.isArray(results)) return [];

  return results
    .filter((r) => r.ruleId)
    .map((r) => ({
      type: mapRuleId(r.ruleId!),
      file: r.locations?.[0]?.physicalLocation?.artifactLocation?.uri ?? "",
      line: r.locations?.[0]?.physicalLocation?.region?.startLine,
      severity: mapLevel(r.level ?? ""),
      description: r.message?.text ?? "",
    }));
}
