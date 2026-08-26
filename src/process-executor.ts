import { spawn } from "node:child_process";

const DEFAULT_MAX_OUTPUT_BYTES = 10 * 1024 * 1024;
const DEFAULT_TERMINATION_GRACE_MS = 1_000;

export interface ProcessExecutionOptions {
  program: string;
  args: string[];
  cwd: string;
  env: NodeJS.ProcessEnv;
  stdin?: string;
  timeoutMs: number;
  maxOutputBytes?: number;
  terminationGraceMs?: number;
  onStdoutChunk?: (chunk: string, receivedAt: number) => void;
}

export interface ProcessExecutionResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  durationMs: number;
}

export class ProcessExecutionError extends Error {
  constructor(
    message: string,
    readonly stdout: string,
    readonly stderr: string,
  ) {
    super(message);
    this.name = "ProcessExecutionError";
  }
}

/**
 * Executes an argv array without a shell, captures bounded output, and owns the
 * child process group so timeouts do not leave agent descendants running.
 */
export function executeProcess(
  options: ProcessExecutionOptions,
): Promise<ProcessExecutionResult> {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();
    const detached = process.platform !== "win32";
    const child = spawn(options.program, options.args, {
      cwd: options.cwd,
      env: options.env,
      shell: false,
      detached,
      stdio: ["pipe", "pipe", "pipe"],
    });

    const maxOutputBytes = options.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES;
    const terminationGraceMs =
      options.terminationGraceMs ?? DEFAULT_TERMINATION_GRACE_MS;
    let stdout = "";
    let stderr = "";
    let capturedBytes = 0;
    let terminalError: ProcessExecutionError | undefined;
    let killTimer: NodeJS.Timeout | undefined;

    const terminate = () => {
      killProcessTree(child.pid, "SIGTERM");
      killTimer = setTimeout(
        () => killProcessTree(child.pid, "SIGKILL"),
        terminationGraceMs,
      );
      killTimer.unref();
    };

    const capture = (target: "stdout" | "stderr", chunk: Buffer) => {
      if (terminalError) return;
      capturedBytes += chunk.byteLength;
      if (capturedBytes > maxOutputBytes) {
        terminalError = new ProcessExecutionError(
          `Process output exceeded ${maxOutputBytes} bytes`,
          stdout,
          stderr,
        );
        terminate();
        return;
      }
      const text = chunk.toString("utf8");
      if (target === "stdout") {
        stdout += text;
        options.onStdoutChunk?.(text, Date.now());
      } else {
        stderr += text;
      }
    };

    child.stdout.on("data", (chunk: Buffer) => capture("stdout", chunk));
    child.stderr.on("data", (chunk: Buffer) => capture("stderr", chunk));

    const timeout = setTimeout(() => {
      terminalError = new ProcessExecutionError(
        `Process timed out after ${options.timeoutMs}ms`,
        stdout,
        stderr,
      );
      terminate();
    }, options.timeoutMs);
    timeout.unref();

    child.once("error", (error) => {
      clearTimeout(timeout);
      if (killTimer) clearTimeout(killTimer);
      reject(
        new ProcessExecutionError(
          `Failed to start ${options.program}: ${error.message}`,
          stdout,
          stderr,
        ),
      );
    });

    child.once("exit", (exitCode, signal) => {
      clearTimeout(timeout);
      if (killTimer) clearTimeout(killTimer);
      if (terminalError) {
        reject(terminalError);
        return;
      }
      resolve({
        stdout,
        stderr,
        exitCode,
        signal,
        durationMs: Date.now() - startedAt,
      });
    });

    if (options.stdin !== undefined) child.stdin.end(options.stdin);
    else child.stdin.end();
  });
}

function killProcessTree(
  pid: number | undefined,
  signal: NodeJS.Signals,
): void {
  if (pid === undefined) return;
  try {
    if (process.platform === "win32") process.kill(pid, signal);
    else process.kill(-pid, signal);
  } catch {
    // Process already exited.
  }
}
