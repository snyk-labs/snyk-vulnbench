# Fixture Metadata Manifest

Read this reference whenever adding or onboarding a fixture. The manifest
describes the project under test; findings files describe vulnerabilities and
code flows; task files describe how the benchmark runs it.

## Location and boundary

Create:

```text
fixtures/<fixture-name>/fixture.json
```

Keep it beside `project/` and the selected `findings*.json`, never inside
`project/`. The agent receives only `project/` as its working directory, so
root-level metadata and answer keys remain hidden by the benchmark sandbox.

The manifest ID must exactly match the fixture directory name. Do not include
vulnerability types, finding IDs, payloads, source/sink locations, or secrets.

## Schema

Use this shape, omitting fields that cannot be verified:

```json
{
  "schemaVersion": 1,
  "id": "app-project-example",
  "name": "Example Application",
  "kind": "web-app",
  "languages": ["typescript"],
  "frameworks": ["express"],
  "runtimes": [
    {
      "name": "node",
      "version": "22"
    }
  ],
  "datastores": ["postgresql"],
  "source": {
    "repository": "https://github.com/example/project",
    "baseCommit": "<verified-base-revision>"
  },
  "provenance": {
    "origin": "real-repository",
    "seeded": true
  }
}
```

`todos` is optional. Add it for unresolved metadata questions and omit it once
the questions are resolved:

```json
"todos": [
  "Confirm the runtime version.",
  "Confirm whether vulnerable behavior was inherited or introduced."
]
```

## Field semantics

- `schemaVersion`: positive integer; use `1`.
- `id`: exact fixture directory name.
- `name`: concise human-readable project name.
- `kind`: stable project shape such as `web-app`, `api-service`, or
  `llm-integration`.
- `languages`, `frameworks`, and `datastores`: lowercase, stable arrays.
- `runtimes`: objects with a required `name` and optional verified `version`.
- `source.repository`: URL from the user, repository metadata, or README.
- `source.baseCommit`: exact source revision used before benchmark changes.
- `provenance.origin`: one of `real-repository`, `benchmark-created`,
  `synthetic`, or `unknown`.
- `provenance.seeded`: `true` when benchmark authors introduced the vulnerable
  behavior; `false` only when it is confirmed to have existed in the baseline.
  Omit it when unknown.
- `provenance.seedCommit`: optional seeded-change commit, only when one exists.
- `todos`: optional non-empty strings for unresolved questions.

Use `real-repository` for imported upstream code, `benchmark-created` for a
realistic app authored or assembled for the benchmark, and `synthetic` for a
minimal artificial reproduction. Do not use `origin: "author"`; it is not a
valid loader value.

## Workflow

1. Establish the fixture name and source path.
2. Inspect package manifests, lockfiles, README files, Docker/Compose files,
   and source layout. Record only verified technology and runtime facts.
3. Capture the baseline revision when available. For a cloned repository,
   record the pristine upstream SHA before source edits or vulnerability
   seeding.
4. Create or update `fixture.json` before authoring findings. If the benchmark
   intentionally adds vulnerable behavior, set `provenance.seeded` to `true`
   after the additions are made. Do not invent a `seedCommit`.
5. Add the selected findings file and task descriptors.
6. Run `pnpm run benchmark -- --dry-run`. This validates the manifest, checks
   that its `id` matches the fixture directory, and loads the selected ground
   truth.
7. Resolve or remove `todos` before treating the metadata as authoritative.

For an imported repository whose vulnerabilities are inherited, use
`origin: "real-repository"` and `seeded: false` only after confirming that
against the baseline. For a benchmark-authored realistic app, use
`origin: "benchmark-created"`; for a small vulnerability demonstration, use
`origin: "synthetic"`.
