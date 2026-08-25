export const DEFAULT_PROMPT_TEMPLATE_ID = "default";

const PROMPT_TEMPLATE_APPENDICES = {
  default: "",
  "snyk-mcp": `Before completing your analysis, you MUST invoke the Snyk MCP \`snyk_code_scan\` tool exactly once against this fixture's project root. Use its findings as evidence alongside your independent code review. Do not merely describe the scan: invoke the tool, then return the required final response format.`,
} as const;

export type PromptTemplateId = keyof typeof PROMPT_TEMPLATE_APPENDICES;

export function isPromptTemplateId(value: unknown): value is PromptTemplateId {
  return typeof value === "string" && value in PROMPT_TEMPLATE_APPENDICES;
}

export function resolvePromptTemplate(
  taskPrompt: string,
  promptTemplateId: PromptTemplateId = DEFAULT_PROMPT_TEMPLATE_ID,
): string {
  const appendix = PROMPT_TEMPLATE_APPENDICES[promptTemplateId];
  return appendix ? `${taskPrompt}\n\n${appendix}` : taskPrompt;
}
