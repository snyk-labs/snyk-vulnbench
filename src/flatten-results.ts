import { basename, dirname, join, resolve } from "node:path";
import { statSync } from "node:fs";
import {
  readBenchmarkResults,
  writeBenchmarkJsonl,
} from "./results/results-io.js";

function main(): void {
  const args = process.argv.slice(2);
  const input = readFlag(args, "--input")
    ?? args.find((argument) => !argument.startsWith("--"));
  if (!input) {
    throw new Error(
      "Usage: pnpm results:flatten -- --input <execution-dir|results.jsonl> [--output <path>]",
    );
  }
  const output = readFlag(args, "--output") ?? defaultOutput(input);
  const results = readBenchmarkResults(input);
  writeBenchmarkJsonl(output, results);
  console.log(`Flattened ${results.runs.length} run(s) to ${resolve(output)}`);
}

function readFlag(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function defaultOutput(input: string): string {
  if (statSync(input).isDirectory()) {
    return join(dirname(input), `${basename(input)}.jsonl`);
  }
  return join(
    dirname(input),
    `${basename(input).replace(/\.jsonl$/i, "")}-flattened.jsonl`,
  );
}

main();

