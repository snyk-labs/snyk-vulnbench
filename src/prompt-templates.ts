export const DEFAULT_PROMPT_TEMPLATE_ID = "default";
export type PromptTemplateRunnerId = "claude-code" | "codex-cli";

const PROMPT_TEMPLATES = {
  default: {
    mode: "append",
    content: "",
    supportedRunners: ["claude-code", "codex-cli"],
  },
  "snyk-mcp": {
    mode: "append",
    content: `Before completing your analysis, you MUST invoke the Snyk MCP \`snyk_code_scan\` tool exactly once against this fixture's project root. Use its findings as evidence alongside your independent code review. Do not merely describe the scan: invoke the tool, then return the required final response format.`,
    supportedRunners: ["claude-code", "codex-cli"],
  },
  "security-review": {
    mode: "replace",
    content: "/security-review",
    supportedRunners: ["claude-code"],
  },
} as const satisfies Record<string, {
  mode: "append" | "replace";
  content: string;
  supportedRunners: readonly PromptTemplateRunnerId[];
}>;

export type PromptTemplateId = keyof typeof PROMPT_TEMPLATES;

export function isPromptTemplateId(value: unknown): value is PromptTemplateId {
  return typeof value === "string" && value in PROMPT_TEMPLATES;
}

export function isPromptTemplateSupported(
  promptTemplateId: PromptTemplateId,
  runnerId: PromptTemplateRunnerId,
): boolean {
  return (PROMPT_TEMPLATES[promptTemplateId].supportedRunners as readonly PromptTemplateRunnerId[])
    .includes(runnerId);
}

export function resolvePromptTemplate(
  taskPrompt: string,
  promptTemplateId: PromptTemplateId = DEFAULT_PROMPT_TEMPLATE_ID,
): string {
  const template = PROMPT_TEMPLATES[promptTemplateId];
  if (template.mode === "replace") return template.content;
  return template.content ? `${taskPrompt}\n\n${template.content}` : taskPrompt;
}
