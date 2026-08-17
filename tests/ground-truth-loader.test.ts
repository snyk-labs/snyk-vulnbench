import assert from "node:assert/strict";
import test from "node:test";
import {
  loadEvalTasks,
  loadFixtureMetadata,
  loadVulns,
  validateFixtureMetadata,
} from "../src/evals/loader.js";
import type { AttackerReachableVulnerability } from "../src/types.js";

test("loads and normalizes all curated attacker-reachable ground truth", () => {
  const halloween = loadVulns(
    "app-project-halloween",
    "attacker-reachable",
  ) as AttackerReachableVulnerability[];
  const keystonebank = loadVulns(
    "app-project-keystonebank",
    "attacker-reachable",
  ) as AttackerReachableVulnerability[];
  const sassyreg = loadVulns(
    "app-project-sassyreg",
    "attacker-reachable",
  ) as AttackerReachableVulnerability[];
  const coffeeshop = loadVulns(
    "app-project-coffeeshop",
    "attacker-reachable",
  ) as AttackerReachableVulnerability[];
  const vinylMarketplace = loadVulns(
    "app-project-vinyl-marketplace",
    "attacker-reachable",
  ) as AttackerReachableVulnerability[];
  const saasStarterKit = loadVulns(
    "app-project-saas-starter-kit",
    "attacker-reachable",
  ) as AttackerReachableVulnerability[];

  assert.equal(halloween.length, 3);
  assert.equal(keystonebank.length, 4);
  assert.equal(sassyreg.length, 2);
  assert.equal(coffeeshop.length, 5);
  assert.equal(vinylMarketplace.length, 7);
  assert.equal(saasStarterKit.length, 6);
  assert.deepEqual(
    { file: halloween[0].file, line: halloween[0].line },
    {
      file: halloween[0].filesRelated[0].file,
      line: halloween[0].filesRelated[0].line,
    },
  );
  assert.equal(sassyreg[0].codeFlowMultiLine, "yes");
  assert.equal(keystonebank[0].codeFlowCrossService, "no");
  assert.equal(halloween[0].filesRelated[0].type, "source");
  assert.equal(halloween[0].filesRelated[1].type, "sink");
  assert.equal(sassyreg[0].filesRelated[2].type, "source");
  assert.equal(sassyreg[0].filesRelated[4].type, "sink");
  assert.equal(coffeeshop[0].filesRelated[0].type, "source");
  assert.equal(coffeeshop[0].filesRelated.at(-1)?.type, "sink");
  assert.equal(vinylMarketplace[0].filesRelated[0].type, "source");
  assert.equal(vinylMarketplace[0].filesRelated.at(-1)?.type, "sink");
});

test("task loading defaults V1 and opts attacker-reachable tasks into V2", () => {
  const tasks = loadEvalTasks();
  const v1 = tasks.find((task) => task.id === "app-project-halloween-find-vulns");
  const v2Tasks = tasks.filter((task) =>
    task.category.id === "attacker-reachable-find-vulns"
  );

  assert.equal(v1?.groundTruth, "v1");
  assert.equal(v2Tasks.length, 12);
  assert.ok(v2Tasks.every((task) => task.groundTruth === "attacker-reachable"));
  assert.deepEqual(
    v2Tasks.map((task) => task.knownVulns.length).sort((a, b) => a - b),
    [2, 3, 4, 4, 4, 5, 5, 6, 6, 6, 7, 7],
  );
});

test("loads and validates project-level fixture metadata", () => {
  const { metadata, metadataHash } = loadFixtureMetadata("app-project-goxygen");
  assert.equal(metadata.id, "app-project-goxygen");
  assert.deepEqual(metadata.languages, ["go", "javascript"]);
  assert.equal(metadata.datastores[0], "postgresql");
  assert.match(metadataHash, /^[0-9a-f]{64}$/);

  const task = loadEvalTasks().find((entry) =>
    entry.id === "app-project-goxygen-attacker-reachable-find-vulns"
  );
  assert.equal(task?.fixtureId, "app-project-goxygen");
  assert.equal(task?.fixtureMetadataHash, metadataHash);
  assert.deepEqual(task?.fixtureMetadata, metadata);
});

test("rejects invalid fixture metadata", () => {
  const valid = loadFixtureMetadata("app-project-goxygen").metadata;

  assert.throws(
    () => validateFixtureMetadata("app-project-goxygen", { ...valid, id: "wrong-id" }),
    /id must match the fixture directory name/,
  );
  assert.throws(
    () => validateFixtureMetadata("app-project-goxygen", { ...valid, languages: [""] }),
    /languages must be an array of non-empty strings/,
  );
});
