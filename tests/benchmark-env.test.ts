import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createBenchmarkEnvironment, isIsolatedBenchmarkWorker } from "../src/benchmark-env.js";

test("repository dotenv values override inherited values while preserving runtime variables", () => {
  const directory = mkdtempSync(join(tmpdir(), "vulnbench-env-"));
  const dotenvPath = join(directory, ".env");
  writeFileSync(dotenvPath, 'SNYK_TOKEN="from-file"\nSNYK_CFG_ORG=benchmark\n');

  try {
    const environment = createBenchmarkEnvironment(
      { SNYK_TOKEN: "from-shell", SNYK_CFG_ORG: "shell-org", PATH: "/bin", HOME: "/home/node" },
      dotenvPath,
    );

    assert.equal(environment.SNYK_TOKEN, "from-file");
    assert.equal(environment.SNYK_CFG_ORG, "benchmark");
    assert.equal(environment.PATH, "/bin");
    assert.equal(environment.HOME, "/home/node");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("missing dotenv leaves inherited environment unchanged", () => {
  const environment = createBenchmarkEnvironment(
    { PATH: "/bin", SNYK_TOKEN: "from-shell" },
    join(tmpdir(), "missing-vulnbench-env"),
  );

  assert.deepEqual(environment, { PATH: "/bin", SNYK_TOKEN: "from-shell" });
});

test("isolated worker sentinel only activates for the bootstrap value", () => {
  assert.equal(isIsolatedBenchmarkWorker({}), false);
  assert.equal(isIsolatedBenchmarkWorker({ VULNBENCH_ISOLATED_WORKER: "0" }), false);
  assert.equal(isIsolatedBenchmarkWorker({ VULNBENCH_ISOLATED_WORKER: "1" }), true);
});
