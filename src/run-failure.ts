import type {
  BenchmarkMetrics,
  RunFailure,
  RunFailureKind,
} from "./types.js";

const CLASSIFIERS: Array<{
  kind: RunFailureKind;
  pattern: RegExp;
  retryable: boolean;
  systemic: boolean;
}> = [
  {
    kind: "quota",
    pattern: /(?:quota|insufficient_quota|usage limit|credit balance|budget exceeded)/i,
    retryable: false,
    systemic: true,
  },
  {
    kind: "rate-limit",
    pattern: /(?:rate.?limit|too many requests|\b429\b|overloaded|\b529\b)/i,
    retryable: true,
    systemic: true,
  },
  {
    kind: "authentication",
    pattern: /(?:unauthori[sz]ed|forbidden|authentication|invalid api key|invalid token|\b401\b|\b403\b)/i,
    retryable: false,
    systemic: true,
  },
  {
    kind: "gateway",
    pattern: /(?:litellm|gateway|bad gateway|service unavailable|\b502\b|\b503\b|connection (?:refused|reset))/i,
    retryable: true,
    systemic: true,
  },
  {
    kind: "timeout",
    pattern: /(?:timed? out|timeout|deadline exceeded|aborted)/i,
    retryable: true,
    systemic: false,
  },
  {
    kind: "invalid-output",
    pattern: /(?:without (?:structured findings|a final response|writing its json export)|invalid json|missing findings|unsupported .*contract)/i,
    retryable: false,
    systemic: false,
  },
  {
    kind: "scoring",
    pattern: /(?:scor(?:e|er|ing)|ground.?truth|judge)/i,
    retryable: false,
    systemic: false,
  },
];

export function classifyRunFailure(
  error: unknown,
  metrics?: BenchmarkMetrics,
): RunFailure {
  const message = error instanceof Error ? error.message : String(error);
  const classifier = CLASSIFIERS.find(({ pattern }) => pattern.test(message));
  return {
    kind: classifier?.kind ?? "unknown",
    message,
    retryable: classifier?.retryable ?? false,
    systemic: classifier?.systemic ?? true,
    usageObserved: metrics ? metricsShowUsage(metrics) : false,
  };
}

export function metricsShowUsage(metrics: BenchmarkMetrics): boolean {
  return metrics.totalLogicalInputTokens > 0
    || metrics.totalOutputTokens > 0
    || (metrics.totalCostUsd ?? 0) > 0;
}

export function shouldPauseAfterFailure(failure: RunFailure): boolean {
  return failure.systemic || failure.kind !== "invalid-output";
}

