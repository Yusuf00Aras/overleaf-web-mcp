# Changelog

All notable changes to this project are documented here. This project follows
[Semantic Versioning](https://semver.org/spec/v2.0.0.html). Until 1.0.0, tool schemas and
result shapes may change in a minor or patch release; each such change is listed below.

## [0.2.0] - 2026-09-10

Project lifecycle. Until now every tool took an existing `projectId`, so an agent could not create,
rename, trash, or configure a project without a person doing it in the web UI. The server now
registers 24 tools. Planned in [ROADMAP.md](https://github.com/mhmdaskari/overleaf-web-mcp/blob/main/ROADMAP.md),
which this release also merges with a second draft into one document with per-stage tasks and
acceptance criteria.

### Added

- **`create_project`**, **`clone_project`**, and **`import_project_zip`** create a project from a
  name, an existing project, or a local `.zip` archive, and return `projectId`, `name`, `url`, and
  (for `create_project`) `rootDocPath`. A blank project still holds Overleaf's stub `main.tex`;
  the descriptions say so and point at `update_project_settings`.
- **`manage_project`** renames, trashes, restores, archives, unarchives, or permanently deletes a
  project. `trash`, `archive`, and `delete` require `confirmName` to equal the current project
  name exactly, and `delete` only succeeds on a project that is already trashed, following
  Overleaf's own trash-first model.
- **`update_project_settings`** persists the root document (`rootFilePath`, which must resolve to
  a text document), `compiler`, TeX Live `imageName`, or `spellCheckLanguage` in the project, so
  the web editor's Recompile follows the change. It returns the settings as re-read from a fresh
  project join.
- **`list_projects` filters**: `query` (case-insensitive substring), `includeArchived`,
  `includeTrashed` (both default `false`), `limit` (default 50, at most 200), and `sort`
  (`lastUpdated`, newest first, or `name`).
- **`RATE_LIMITED`** error code for HTTP 429, retryable, with `details.retryAfterMs` parsed from
  `Retry-After` when Overleaf sends it. Zip import and project creation are the routes Overleaf
  throttles first.
- **`CONFIRMATION_MISMATCH`** error code for every confirm-by-value failure (`confirmPath`,
  `confirmName`). Nothing is changed when it is returned.
- **`outputSchema` and `structuredContent`** on the five new tools and on `list_projects`. The
  JSON text block is still returned for clients that do not read structured results.
- **`get_project_tree` reports `spellCheckLanguage`** alongside `compiler` and `imageName`.
- **[`docs/private-api.md`](https://mhmdaskari.github.io/overleaf-web-mcp/private-api/)**
  catalogues every Overleaf route the server calls, the fields it sends and reads, and the error
  code each failure maps to.
- A gated live test (`RUN_OVERLEAF_LIVE_LIFECYCLE_TESTS=1`) that creates a disposable project,
  sets its root document, compiles it, and trashes it. It never deletes permanently.
- **Usage instructions in the MCP initialize response.** The server now sets the MCP
  `instructions` field, so clients that surface it (Claude Code among them) give the model the
  safety contract, read before write, revision handling, `upload_file` semantics, confirmations,
  compile allowance, and what to do on `AUTH_EXPIRED`, without anyone pasting the README into a
  prompt. Exported as `SERVER_INSTRUCTIONS`; a test keeps it under 450 words.
- **Documentation site** at <https://mhmdaskari.github.io/overleaf-web-mcp/>, built with MkDocs
  Material from `docs/` and deployed by GitHub Actions on every push to `main`. It holds the full
  tool reference, safety model, configuration, internals, development guide, roadmap, and this
  changelog.
- **`AGENTS.md`** for coding agents contributing to the repository, with the rules that must keep
  holding, test expectations, and the release steps. `CLAUDE.md` imports it for Claude Code.

### Changed

- **`list_projects` returns an object instead of a bare array**: `{ projects, totalMatched,
  totalProjects }`, where each project carries `id`, `name`, `accessLevel`, `lastUpdated`,
  `archived`, and `trashed`. Archived and trashed projects are hidden by default, and the default
  order is newest first rather than by name. The list now comes from the dashboard endpoint
  (`POST /api/project`) instead of the legacy `GET /user/projects`, and its shape is validated;
  an unexpected shape surfaces as `PROTOCOL_UNSUPPORTED`.
- **`auth_status.projectCount`** counts every project the account can access, archived and
  trashed included, through the same endpoint.
- **`manage_entity` with a wrong `confirmPath` now fails with `CONFIRMATION_MISMATCH`** instead of
  `INVALID_ARGUMENT`. The message is unchanged.
- The initialize instructions gain a paragraph on project lifecycle and `confirmName`; they
  remain under the 450-word bound the test enforces.
- **README rewritten for people.** It now leads with what you can say to an assistant, a
  three-step install, what the server can do, and how it keeps a project safe, in plain language,
  and links to the site for everything else. The tool tables, the configuration table, the
  protocol notes, and the step-by-step workflows moved to the documentation site.
- The tool-count test now checks the README badge and the docs tool reference instead of two
  places in the README.

### Documentation

- A "from nothing to a compiled PDF" walkthrough in the usage guide that needs no web-UI step.
- The README and site list the lifecycle tools, and the related-projects section states that
  web-session peers also offer tracked changes while Git-bridge servers need a paid plan and
  bypass tracked changes.
- The roadmap is one merged document with a Stage 0 verification checklist, conventions, tool
  signatures, tasks, acceptance criteria, an error taxonomy, and a competitive table.

## [0.1.3] - 2026-09-01

Documentation, metadata, and small additive fixes. No tools were added or removed; the server
still registers 19 tools. Planned in [ROADMAP.md](https://github.com/mhmdaskari/overleaf-web-mcp/blob/main/ROADMAP.md).

### Changed

- **`get_project_tree` now returns an object instead of a bare array.** The entities are under
  `entities`, alongside `rootDocPath`, `compiler`, `imageName`, `trackChangesActive`, and a
  `hashNote` describing the hash format. Callers that iterated the result directly must now
  iterate `result.entities`. This is the only response-shape change in this release.
- **`compile_project.rootFilePath` is now optional.** Omitted, it compiles the root document
  configured in Overleaf itself, matching the web UI's Recompile button. A project with no
  configured root and no `rootFilePath` returns `INVALID_ARGUMENT` instead of failing to
  resolve a path. Its description no longer leaks the internal `rootDoc_id` parameter name.
- **`upload_file` is annotated `destructiveHint: true`.** It replaces an existing entity at the
  destination path in place, so the previous `destructiveHint: false` misdescribed it.
- **`upload_file` returns a normalized result**: `entityId`, `entityType`, `path`, `replaced`,
  and, for binary files, `hash`. Overleaf's raw response is no longer passed through under an
  `upload` key.
- **`compile_project` results now include `rootFilePath`**, the document actually compiled.
- **`download_file` no longer silently overwrites a local file.** It fails with
  `INVALID_ARGUMENT` unless the new `overwrite` parameter is `true`, and returns `localPath`
  alongside `bytes`.

### Added

- **`write_file` accepts `localPath`** as an alternative to `content`, mutually exclusive with
  it. This keeps a whole-file replacement revision-checked and optionally tracked without
  sending the file through the MCP client's tool-argument budget. Non-UTF-8 content is rejected
  rather than written as replacement characters, and a leading byte order mark is stripped.
- **`upload_file` accepts `destinationName`**, so a local file can be stored under a different
  name in the project.
- **Overleaf's upload rejections are translated into actionable errors.** Overleaf reports
  `duplicate_file_name`, `invalid_filename`, `project_has_too_many_files`, and
  `folder_not_found` as HTTP 422; these now surface as `INVALID_ARGUMENT` with an explanation
  and the original code in `details.overleafError`, instead of a bare `REMOTE_ERROR`. Only a
  short lowercase identifier is ever propagated, so no response content can leak through an
  error.
- **Continuous integration on pushes and pull requests** running type-check, lint, tests,
  build, and the packed-file check. Previously these ran only when a release was published.
- **[ROADMAP.md](https://github.com/mhmdaskari/overleaf-web-mcp/blob/main/ROADMAP.md)** describing the planned path from 0.1.3 to 1.0.0.
- **This changelog.**

### Documentation

- The `hash` field is documented as a git blob hash, `sha1("blob " + byteLength + "\0" + content)`,
  identical to `git hash-object <file>`. Plain `sha1sum` never matches. The hash is present only
  on binary `file` entities; Overleaf stores no content hash for `doc` entities.
- `upload_file`'s upsert semantics are documented, including that Overleaf decides `doc` versus
  `file` by extension and UTF-8 validity, that it is a valid way to replace `.tex`, `.bib`, and
  `.bst` documents from disk, and that replacing a document this way is a blind, untracked write.
- A decision table for `write_file` versus `upload_file`, and the real document and update size
  limits, so callers no longer have to guess a size threshold.
- A worked example of the hash-comparison workflow for uploading only changed binaries.
- A test asserts the README's tool count matches the registered tool list, so the badge cannot
  drift.

## [0.1.2] - 2026-07-20

- Project history monitoring through `monitor_project_history`.
- Tracked document writes through `writeMode` on `write_file`, `create_file`, and
  `write_section`.

## [0.1.1] - 2026-07-16

- Documentation and packaging corrections.

## [0.1.0] - 2026-07-15

- First release: browser-assisted session capture, project and file management, revision-checked
  and section-level writing, compilation, and review comments.

[0.2.0]: https://github.com/mhmdaskari/overleaf-web-mcp/releases/tag/v0.2.0
[0.1.4]: https://github.com/mhmdaskari/overleaf-web-mcp/releases/tag/v0.1.4
[0.1.3]: https://github.com/mhmdaskari/overleaf-web-mcp/releases/tag/v0.1.3
[0.1.2]: https://github.com/mhmdaskari/overleaf-web-mcp/releases/tag/v0.1.2
[0.1.1]: https://github.com/mhmdaskari/overleaf-web-mcp/releases/tag/v0.1.1
[0.1.0]: https://github.com/mhmdaskari/overleaf-web-mcp/releases/tag/v0.1.0
