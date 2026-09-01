import type { EvalTask, RunConfig } from "../types.js";

export function configSupportsTask(
  config: RunConfig,
  task: EvalTask,
): boolean {
  return !config.supportedCategories
    || config.supportedCategories.some((category) =>
      category === task.category.id
    );
}
