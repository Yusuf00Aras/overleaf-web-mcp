# Changelog

All notable changes to this project are documented here. This project follows
[Semantic Versioning](https://semver.org/spec/v2.0.0.html). Until 1.0.0, tool schemas and
result shapes may change in a minor or patch release; each such change is listed below.

## [0.1.4] - 2026-09-01

Documentation restructure and runtime instructions for MCP clients. No tool was added, removed,
or changed in schema or result shape; the server still registers 19 tools.

### Added

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

- **README rewritten for people.** It now leads with what you can say to an assistant, a
  three-step install, what the server can do, and how it keeps a project safe, in plain language,
  and links to the site for everything else. The 19-row tool tables, the configuration table, the
  protocol notes, and the step-by-step workflows moved to the documentation site.
- The tool-count test now checks the README badge and the docs tool reference instead of two
  places in the README.

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

[0.1.4]: https://github.com/mhmdaskari/overleaf-web-mcp/releases/tag/v0.1.4
[0.1.3]: https://github.com/mhmdaskari/overleaf-web-mcp/releases/tag/v0.1.3
[0.1.2]: https://github.com/mhmdaskari/overleaf-web-mcp/releases/tag/v0.1.2
[0.1.1]: https://github.com/mhmdaskari/overleaf-web-mcp/releases/tag/v0.1.1
[0.1.0]: https://github.com/mhmdaskari/overleaf-web-mcp/releases/tag/v0.1.0
