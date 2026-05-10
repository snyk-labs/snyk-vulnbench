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
  // Snyk: javascript/Sqli (abbrev.) and full SqlInjection-style ids
  if (/sqli|sqlinjection/.test(id)) return "sql-injection";
  // Snyk: javascript/DOMXSS — DOM XSS; hits domxss before the generic /xss/ branch below
  if (/domxss|dom\.xss/.test(id)) return "xss";
  // Snyk: javascript/XSS and other rule ids containing "xss" (e.g. reflected XSS)
  if (/xss/.test(id)) return "xss";
  // Snyk: javascript/PT — Path Traversal abbreviated; "pathtraversal" covers longer rule ids
  if (/pathtraversal|pt$/.test(id)) return "path-traversal";
  if (/commandinjection/.test(id)) return "command-injection";
  // Snyk: javascript/UseCsurfForExpress — missing CSRF middleware; substring "csrf" matches
  if (/csrf/.test(id)) return "csrf";
  // Snyk: javascript/OR — Open Redirect uses abbreviated rule id (message text says "Open Redirect")
  if (/openredirect|\/or$/.test(id)) return "open-redirect";
  // Snyk: javascript/Ssrf (PascalCase) → lowercase still contains substring "ssrf"
  if (/ssrf/.test(id)) return "ssrf";
  if (/xxe|xmlexternalentity/.test(id)) return "xxe";
  // Snyk: javascript/HTTPSourceWithUncheckedType — HTTP-derived values used without type/safety checks
  if (/impropertype|typevalidation|uncheckedtype|withuncheckedtype/.test(id))
    return "improper-type-validation";
  // Snyk: javascript/WebCookieSecureDisabledExplicitly — id contains "cookiesecure" → matches cookie.*secure
  if (/cookie.*secure|sensitivecookie|insecurecookie/.test(id)) return "information-exposure";
  // Snyk: javascript/HardcodedNonCryptoSecret (abbreviated) vs HardcodedNonCryptographicSecret / NonCryptographicSecret
  if (/hardcodednoncryptographic|hardcodednoncryptosecret|noncryptographicsecret/.test(id))
    return "hardcoded-credentials";
  // Snyk: javascript/NoHardcodedPasswords and other *Hardcoded* rules — substring "hardcoded"
  if (/hardcoded/.test(id)) return "hardcoded-credentials";
  if (/deserializ/.test(id)) return "insecure-deserialization";
  if (/idor|insecuredirectobject/.test(id)) return "idor";
  // Snyk Code: javascript/DisablePoweredBy (X-Powered-By fingerprinting) — not covered by "x-powered-by" substring alone
  if (/informationexposure|infoleak|sensitivedata|x-powered-by|disablepoweredby|enablepoweredby/.test(id))
    return "information-exposure";
  // Snyk: javascript/NoRateLimitingForExpensiveWebOperation — substring "ratelimit" already matches; listed explicitly for discoverability
  if (/ratelimit|nothrottle|resourceexhaust|noratelimitingforexpensiveweboperation/.test(id))
    return "allocation-of-resources-without-limits-or-throttling";
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
 *
 * The CLI emits SARIF. Findings are read from `runs[0].results`. For each element,
 * **`ruleId`** is the SARIF standard property (`result.ruleId` in SARIF 2.1.0) whose
 * string value we pass to `mapRuleId()` to produce our `type` field — there is no
 * separate Snyk-only field name for that mapping. Results without `ruleId` are skipped.
 *
 * Quick verification on saved JSON: JSONPath `$.runs[0].results[*].ruleId`, or
 * JSON Pointer `/runs/0/results/0/ruleId` for the first finding’s rule id.
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
