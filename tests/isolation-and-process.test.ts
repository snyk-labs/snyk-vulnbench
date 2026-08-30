import assert from "node:assert/strict";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import test from "node:test";
import { resolveCommand } from "../src/command-runner.js";
import {
  createIsolatedWorkspace,
  prepareSecurityReviewGitWorkspace,
  pruneIgnoredFilesForScan,
} from "../src/isolated-workspace.js";
import {
  executeProcess,
  ProcessExecutionError,
} from "../src/process-executor.js";

test("isolated workspace copies project files without fixture ground truth", () => {
  const fixtureRoot = mkdtempSync(join(tmpdir(), "vulnbench-fixture-"));
  const project = join(fixtureRoot, "project");
  mkdirSync(project);
  writeFileSync(join(project, "app.js"), "console.log('ok');\n");
  writeFileSync(join(fixtureRoot, "findings.json"), "ANSWER_KEY_SENTINEL\n");

  const workspace = createIsolatedWorkspace(project);
  try {
    assert.equal(
      readFileSync(join(workspace.projectDir, "app.js"), "utf8"),
      "console.log('ok');\n",
    );
    assert.equal(existsSync(join(workspace.rootDir, "findings.json")), false);
    assert.equal(existsSync(join(workspace.projectDir, "findings.json")), false);
    assert.notEqual(workspace.rootDir, fixtureRoot);
  } finally {
    workspace.cleanup();
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test("isolated workspace cleanup is idempotent", () => {
  const source = mkdtempSync(join(tmpdir(), "vulnbench-project-"));
  writeFileSync(join(source, "app.py"), "print('ok')\n");
  const workspace = createIsolatedWorkspace(source);
  workspace.cleanup();
  workspace.cleanup();
  assert.equal(existsSync(workspace.rootDir), false);
  rmSync(source, { recursive: true, force: true });
});

test("security review workspace exposes the whole project as a branch change", () => {
  const source = mkdtempSync(join(tmpdir(), "vulnbench-project-"));
  writeFileSync(join(source, "app.js"), "console.log('review me');\n");
  writeFileSync(join(source, ".gitignore"), "node_modules/\n");
  mkdirSync(join(source, "node_modules"));
  writeFileSync(join(source, "node_modules", "dependency.js"), "ignored\n");
  const workspace = createIsolatedWorkspace(source);

  try {
    prepareSecurityReviewGitWorkspace(workspace.projectDir);
    const git = (args: string[]) =>
      execFileSync("git", args, {
        cwd: workspace.projectDir,
        encoding: "utf8",
      }).trim();

    assert.match(git(["log", "--oneline", "origin/HEAD..."]), /VulnBench fixture snapshot/);
    assert.equal(
      git(["diff", "--name-only", "origin/HEAD...HEAD"]),
      ".gitignore\napp.js",
    );
    assert.equal(
      existsSync(join(workspace.projectDir, "node_modules", "dependency.js")),
      true,
    );
    pruneIgnoredFilesForScan(workspace.projectDir);
    assert.equal(
      existsSync(join(workspace.projectDir, "node_modules", "dependency.js")),
      false,
    );
    assert.equal(existsSync(join(workspace.projectDir, "app.js")), true);
  } finally {
    workspace.cleanup();
    rmSync(source, { recursive: true, force: true });
  }
});

test("structured command resolution preserves argument boundaries", () => {
  const invocation = resolveCommand({
    type: "command",
    id: "scanner",
    name: "Scanner",
    executable: "scanner",
    args: ["scan", "{fixturePath}", "--format=json"],
    parser: "snyk-code",
  }, "/tmp/project with spaces");

  assert.deepEqual(invocation, {
    program: "scanner",
    args: ["scan", "/tmp/project with spaces", "--format=json"],
  });
});

test("process executor captures output without invoking a shell", async () => {
  const result = await executeProcess({
    program: process.execPath,
    args: ["-e", "process.stdout.write(process.argv[1])", "hello world"],
    cwd: process.cwd(),
    env: process.env,
    timeoutMs: 5_000,
  });

  assert.equal(result.exitCode, 0);
  assert.equal(result.stdout, "hello world");
});

test("process executor terminates timed-out process groups", async () => {
  await assert.rejects(
    executeProcess({
      program: process.execPath,
      args: ["-e", "setInterval(() => {}, 1000)"],
      cwd: process.cwd(),
      env: process.env,
      timeoutMs: 25,
      terminationGraceMs: 10,
    }),
    (error: unknown) =>
      error instanceof ProcessExecutionError
      && /timed out/.test(error.message),
  );
});
