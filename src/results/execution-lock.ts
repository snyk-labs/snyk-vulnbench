import {
  closeSync,
  existsSync,
  openSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { hostname } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

interface ExecutionLockMetadata {
  pid: number;
  hostname: string;
  startedAt: string;
  ownerToken: string;
}

export interface ExecutionLock {
  path: string;
  metadata: ExecutionLockMetadata;
  release(): void;
}

export function acquireExecutionLock(executionDir: string): ExecutionLock {
  const path = join(executionDir, ".execution.lock");
  if (existsSync(path)) {
    const existing = readLock(path);
    if (existing && isLiveOwner(existing)) {
      throw new Error(
        `Execution is already active on ${existing.hostname} with PID ${existing.pid}`,
      );
    }
    rmSync(path, { force: true });
  }

  const metadata: ExecutionLockMetadata = {
    pid: process.pid,
    hostname: hostname(),
    startedAt: new Date().toISOString(),
    ownerToken: randomUUID(),
  };
  const descriptor = openSync(path, "wx", 0o600);
  try {
    writeFileSync(descriptor, `${JSON.stringify(metadata, null, 2)}\n`, "utf8");
  } finally {
    closeSync(descriptor);
  }

  let released = false;
  return {
    path,
    metadata,
    release() {
      if (released) return;
      released = true;
      const current = readLock(path);
      if (current?.ownerToken === metadata.ownerToken) {
        rmSync(path, { force: true });
      }
    },
  };
}

function readLock(path: string): ExecutionLockMetadata | null {
  try {
    const value = JSON.parse(readFileSync(path, "utf8")) as ExecutionLockMetadata;
    return typeof value.pid === "number"
      && typeof value.hostname === "string"
      && typeof value.ownerToken === "string"
      ? value
      : null;
  } catch {
    return null;
  }
}

function isLiveOwner(metadata: ExecutionLockMetadata): boolean {
  if (metadata.hostname !== hostname()) return true;
  try {
    process.kill(metadata.pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

