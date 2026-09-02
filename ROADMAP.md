# Roadmap

The planned path from `0.1.3` to `1.0.0`. Every item below comes from a real end-to-end session
against `overleaf-web-mcp@0.1.2` (authenticating, listing 127 projects, inspecting a tree,
overwriting three text documents, uploading a figure, deleting 20 stale entities one at a time,
compiling, and round-tripping files to verify uploads), cross-checked against Overleaf's
open-source web service (`overleaf/overleaf`, `services/web/app/src/router.mjs` and its
controllers), so every endpoint named here is confirmed to exist rather than assumed.

Each stage assumes the previous one shipped. Tool names follow the existing snake_case convention.

| Stage | Theme | New tools | The thing it fixes |
| --- | --- | :---: | --- |
| v0.1.3 | Documentation, metadata, small additive fixes | 0 | Behaviour that had to be reverse-engineered |
| v0.2.0 | Project lifecycle | 5 | No way to create, rename, trash, or configure a project |
| v0.3.0 | Bulk and sync | 5 | 24 one-at-a-time calls to sync one folder |
| v0.4.0 | Compile and build ergonomics | 2 | Success inferred from counters; no PDF or log access |
| v0.5.0 | Multi-file documents | 1 | Section tools stop at `\input` boundaries |
| v1.0.0 | Hardening | 0 | Failure modes that are not yet legible |

**v0.1.3 shipped on 1 September 2026**, followed the same day by **v0.1.4**, a documentation release: a human-first README, the documentation site at <https://mhmdaskari.github.io/overleaf-web-mcp/>, and usage instructions sent to MCP clients at connect time. See the [changelog](https://github.com/mhmdaskari/overleaf-web-mcp/blob/main/CHANGELOG.md) for what landed.

After v1.0.0 the server would register 32 tools (19 today). Every tool description costs the MCP
client context on every turn, so the lifecycle stage below deliberately reuses the
`manage_entity` action-enum pattern instead of adding one tool per verb.

## What already works well (keep these patterns)

- **`manage_entity`'s `confirmPath === path` requirement on delete.** It caught nothing dangerous in the session, but it is the right shape for a destructive action, and later stages reuse it (`confirmName` on project trash/delete, a delete-count confirmation on mirror sync).
- **`upload_file` overwrites in place by path**, keeping the same `entity_id` across re-uploads. This is what made replacing `main.tex` wholesale possible without a `read_file` → revision → `write_file` round trip.
- **`get_sections` is honest about its own limits.** Its description states outright that it never follows `\input`/`\include`. Keep this practice when multi-file support lands in v0.5.0.
- **`write_file` requiring a `revision` from a prior `read_file`** is the right default against blind clobbers of text a human might be editing concurrently.
- **the error model already exists.** `McpError` carries a typed `code` (13 codes today), a `retryable` flag, and structured `details`. v1.0.0 should extend this, not replace it.
- **writes are never retried automatically.** The README documents that a timed-out write is observed, never re-submitted. Every bulk tool below must inherit that invariant.
- **all project mutations run through one per-project FIFO.** Bulk tools are compositions over that queue; they reduce tool calls and context, not wall-clock time. Say so in their descriptions.

---

## v0.1.3 — Documentation, metadata, and small additive fixes (shipped)

**Motivation:** a meaningful fraction of the session went into reverse-engineering behaviour that should have been documented, most expensively the hash format. Two of the items below are one-line code changes with outsized payoff; ship them even if the documentation pass takes longer.

1. **Document the hash field format precisely.** Comparing `get_project_tree`'s `hash` against plain `sha1sum` produced 9 false "differs" out of 9 real matches. The actual format is a **git blob hash**: `sha1("blob " + byteLength + "\0" + content)`, i.e. exactly `git hash-object <file>`. This is confirmed in Overleaf's `FileHashManager.mjs`. State the formula wherever a `hash` field appears.

   `hash` exists **only on binary `file` entities** (Overleaf's `fileRefs`). `src/overleaf/tree.ts` copies it for `fileRefs` and for nothing else, and Overleaf does not store a content hash for `doc` entities in the tree at all. So the hash workflow covers figures, PDFs, and other binaries; `.tex`, `.bib`, and `.bst` documents can only be compared by reading their content. Document this alongside the formula, because it changes the design of `plan_sync` in v0.3.0.

2. **Document `upload_file`'s overwrite semantics, and fix its annotation.** The current description ("Upload a local binary file into an Overleaf project folder") undersells what it does. Overleaf's upload handler (`FileSystemImportManager.addEntity` → `upsertDoc` / `upsertFile`) replaces an existing entity at the same path in place; otherwise it creates one. Document:

   - **Type is decided by Overleaf, not by the caller.** `FileTypeManager` classifies by extension list and valid UTF-8; text files larger than three times the document limit are stored as binary `file` entities. a same-named entity of the *other* type (uploading text where a binary already exists, or vice versa) is expected to fail with Overleaf's `duplicate_file_name` error rather than replace; map that to `INVALID_ARGUMENT` with a clear message.
   - **Doc replacement is blind and untracked.** Upserting a `doc` goes through the document updater with no revision check and never as tracked changes. A collaborator's concurrent edit is overwritten. This is the trade-off against `write_file`.
   - the tool is registered with `destructiveHint: false`, which is wrong for an in-place overwrite. Set `destructiveHint: true`.
   - the remote name is always `basename(localPath)`; there is no way to upload `fig_v3.png` as `figures/fig.png`. Add an optional `destinationName`.
   - normalise the response. Today it passes Overleaf's raw `{ success, entity_id, entity_type }` through under `upload`. Return `{ entityId, entityType, path, replaced, hash }`, where `replaced` comes from a tree lookup before the upload and `hash` is the git blob hash computed locally from the bytes sent, so callers can verify against `get_project_tree` later without a round trip.

3. **Document that `upload_file` works for text documents, not just binaries.** `main.tex`, `ref.bib`, and `elsarticle-num.bst` (all `doc` entities) were replaced successfully via `localPath`. Fold this into item 2's "type is decided by Overleaf" paragraph and keep the concrete example.

4. **State a practical size guideline for `write_file`'s `content` vs `upload_file`'s `localPath`.** The session self-imposed "115 KB is too large for a tool parameter" with no number to go on.

   the server-side limits are already in the code and are far away: `DOC_TOO_LARGE` at the advertised `ol-maxDocLength` (fallback 2,097,152 UTF-16 code units) and `UPDATE_TOO_LARGE` at 7,340,032 serialised characters. A 115 KB file is roughly 5% of the document limit. The real ceiling is the MCP client's tool-argument budget and the token cost of echoing a whole file through the model. Document that plainly.

   accept `localPath` as an alternative to `content` on `write_file` (mutually exclusive, same revision check, same `writeMode`). That gives the one combination neither tool offers today: a revision-checked, optionally tracked, whole-file replacement from disk. It is a parameter addition, not a new tool, so it fits this stage.

5. **Add a decision table to the README.** Three rows instead of two once item 4 lands:

   | Need | Tool | Revision check | Tracked changes | Content source |
   | --- | --- | :---: | :---: | --- |
   | Small edit, or concurrent humans possible | `write_file` with `content` | yes | optional | inline |
   | Replace a large text file safely | `write_file` with `localPath` | yes | optional | disk |
   | Replace a binary, or push text when nobody else is editing | `upload_file` | no | never | disk |

6. **Include a worked example of the hash-comparison workflow** (loop local files → `git hash-object` → compare to `get_project_tree` `hash` → upload only what differs), with the caveat from item 1 that it applies to binaries only. `plan_sync` formalises this in v0.3.0; until then, document the manual version.

7. **expose the project's root document now.** The `joinProject` payload the server already receives declares `rootDoc_id` (see `JoinProjectData` in `src/protocol/project-connection.ts`); Overleaf also sends `compiler`, `imageName`, and `spellCheckLanguage` in the same payload. The server discards all of them. Surface `rootDocPath`, `compiler`, and `imageName` in `get_project_tree`'s result, and make `compile_project.rootFilePath` optional, defaulting to the project's root doc and failing with `INVALID_ARGUMENT` only when neither is set. In the session the real manuscript lived in `0_main.tex` while Overleaf's root was a 13-line stub `main.tex`; one field in the tree response would have shown that on the first call. Also reword `compile_project`'s description, which currently leaks the internal parameter name `rootDoc_id`.

8. **`download_file` overwrites the local path silently** (`writeFile(localPath, bytes)`). Either document it or add `overwrite` defaulting to `false`.

9. **repository hygiene.** `publish.yml` runs check/lint/test only when a release is published; nothing runs on pushes or pull requests. Add a `ci.yml` that runs the same three steps plus `npm pack --dry-run`. Commit this file as `ROADMAP.md`, start a `CHANGELOG.md`, and turn each numbered item here into a GitHub issue under a milestone per stage (the repository currently has zero issues, so contributors have nothing to pick up). The "19 tools" badge and sentence in the README will drift with each stage; assert the count in `test/mcp/tools.test.ts` or generate it.

**Acceptance:** a fresh reader of the README can predict hash values and overwrite behaviour without probing empirically; `get_project_tree` shows which file Overleaf compiles by default; pull requests run the test suite.

---

## v0.2.0 — Project lifecycle

**Motivation:** the hard blocker of the session. Every one of the 19 tools takes an existing `projectId`; there is no way to create a project through the MCP at all. A human had to create a blank project in the web UI and paste back its URL before anything else could happen.

**the endpoints exist and are confirmed in Overleaf's router.** All are ordinary browser-facing routes protected by the same session cookie and CSRF token the server already uses.

| Operation | Route | Body / result |
| --- | --- | --- |
| Create | `POST /project/new` | `{ projectName, template }`; `template: "example"` seeds the example project, anything else creates the basic project with Overleaf's stub `main.tex`. Returns `{ project_id }`. |
| Clone | `POST /Project/:id/clone` | `{ projectName }` → `{ project_id }` |
| Import zip | `POST /project/new/upload` | multipart `qqfile` + `name` → `{ project_id }`; rate-limited server-side |
| Rename | `POST /project/:id/rename` | `{ newProjectName }` |
| Settings | `POST /project/:id/settings` | any of `rootDocId`, `compiler`, `imageName`, `spellCheckLanguage` |
| Trash / restore | `POST` / `DELETE /project/:id/trash` | recoverable, matches the web UI |
| Archive / unarchive | `POST` / `DELETE /Project/:id/archive` | |
| Permanent delete | `DELETE /Project/:id` | the web UI only offers this from the Trashed view |
| List | `POST /api/project` | `{ totalSize, projects: [{ name, lastUpdated, archived, trashed, accessLevel, owner_ref, … }] }`; this is what the current project dashboard calls, `GET /user/projects` (used today) is the legacy list |

**New tools:**

- **`create_project({ name, template: "blank" | "example" })`** → `{ projectId, url, rootDocPath }`. note in the description that "blank" still contains Overleaf's stub `main.tex`, which is exactly the placeholder root the session tripped over; callers who import their own root should follow up with `update_project_settings` or delete the stub.
- **`clone_project({ sourceProjectId, name })`** → `{ projectId, url }`. Starting from a lab or journal template project is the most common way real Overleaf projects begin.
- **`import_project_zip({ localZipPath, name? })`** → `{ projectId, url }`. One call from "folder on disk" to "project on Overleaf"; v0.3.0's sync covers subsequent updates. Surface the server-side rate limit as `RATE_LIMITED` (v1.0.0) rather than a raw HTTP 429.
- **`manage_project({ projectId, action: "rename" | "trash" | "restore" | "archive" | "unarchive" | "delete", newName?, confirmName? })`**, mirroring `manage_entity`'s action enum so five verbs cost one tool description. `trash`, `archive`, and `delete` require `confirmName` to equal the current project name exactly. the first draft proposed `delete_project` as the destructive primitive. Overleaf's own model is trash first, permanent delete only from the trash. Follow it: `delete` succeeds only when the project is already trashed, and the description points callers at `trash` as the normal path. Trash is recoverable, which matters when the caller is an agent, and it is what makes v1.0.0's automated smoke test safe to run.
- **`update_project_settings({ projectId, rootFilePath?, compiler?, imageName?, spellCheckLanguage? })`** instead of `set_root_document`. `rootFilePath` is resolved through the tree and must be a `doc`; the change persists in the project's own settings, so the web UI's Recompile targets the right file too. `compiler` (`pdflatex` | `latex` | `xelatex` | `lualatex`) and the TeX Live `imageName` are exactly the two settings an agent needs when a compile fails on a font or engine mismatch; they ride on the same endpoint for free.
- **filter `list_projects` instead of adding `search_projects`.** Switch to `POST /api/project`, add `query` (case-insensitive substring on name), `includeArchived` and `includeTrashed` (default `false`), `limit` (default 50) and `sort: "lastUpdated" | "name"` (default `lastUpdated`, newest first), and return `lastUpdated`, `archived`, `trashed`, and `totalMatched`. With 127 projects, "the ten most recently updated" or "anything containing CHEERSafe" is what every caller actually wants, and neither is possible today. `auth_status` also lists every project just to count them; the new endpoint's `totalSize` makes that cheap.

**Acceptance:** a fresh Overleaf account with zero projects can go from nothing to a compiled project using only these tools plus v0.1 tools, with no web UI step, and never has to guess which file is the root.

---

## v0.3.0 — Bulk and sync operations

**Motivation:** almost everything after authentication in the session was one-file-at-a-time: 3 text overwrites, 1 binary upload, and **20 individual `manage_entity` delete calls**, each needing its own `confirmPath`. Before that, a hand-rolled diff over 9 local figures established that none of them needed re-uploading. That comparison is generically useful and should not be reinvented per caller.

**design constraints the first draft did not account for.**

- **Two comparison paths.** Binary files compare by the git blob hash already in the tree, at zero cost. Documents have no remote hash (v0.1.3 item 1), so `plan_sync` must `read_file` each remote doc and compare LF-normalised content against the local file with the same normalisation. Report `comparedBy: "hash" | "content"` per entry. Each doc comparison is one document join through the per-project FIFO; that is fine for tens of documents and should be stated in the description.
- **Documents sync through revision-checked writes, not uploads.** `sync_directory` should replace a changed `doc` with `write_file` semantics (using `localPath` from v0.1.3 item 4), passing the revision `plan_sync` observed, and upload only binaries. A collaborator's edit between plan and sync then yields a per-file `REVISION_CONFLICT` instead of a silently lost edit, and `writeMode: "tracked"` becomes available for projects in review mode. New documents go through the upload path, where Overleaf classifies them as docs by extension.
- **Ignore rules.** Ship a default ignore list (`.git/`, `.DS_Store`, `__MACOSX/`, `*.aux`, `*.log`, `*.bbl`, `*.blg`, `*.out`, `*.toc`, `*.synctex.gz`, `*.fdb_latexmk`, `*.fls`) plus an `ignore: string[]` of globs. Overleaf enforces a 150-character name limit and its own reserved names (`FileTypeManager.shouldIgnore`); map its `invalid_filename` to `INVALID_ARGUMENT`.
- **Folder deletes are recursive.** `DELETE /project/:id/folder/:id` removes a subtree in one request. Mirror mode should collapse `remoteOnly` entries to their highest remote-only ancestor, present that collapsed list, and count `confirmDeleteCount` against it. State which count the caller is confirming.
- **Partial failure is the normal case.** Return per-file outcomes `{ path, action: "uploaded" | "written" | "created" | "deleted" | "skipped" | "failed", entityId?, error? }` and continue past individual failures unless `stopOnError` is set. The existing `PARTIAL_CLEANUP` code shows the pattern.
- **Bound the response.** `identical` on a real project can be hundreds of paths. Return counts plus the first N, with `verbose` to get everything.

**New tools:**

- **`plan_sync({ projectId, localFolderPath, ignore? })`** → `{ toUpload: [{ path, reason: "new" | "changed", comparedBy }], identical: { count, paths? }, remoteOnly: [...collapsed...], planToken }`. Side-effect-free. `planToken` carries the per-doc revisions `sync_directory` needs.
- **`sync_directory({ projectId, localFolderPath, mode: "additive" | "mirror", planToken?, confirmDeleteCount?, ignore?, writeMode?, stopOnError? })`.** In `mirror` mode `confirmDeleteCount` must equal the collapsed `remoteOnly` count or nothing is deleted. Without a `planToken` the tool plans internally first.
- **`batch_upload({ projectId, files: [{ localPath, destinationPath }] })`** for callers with a known file list and no directory semantics. `destinationPath` includes the file name, which needs `destinationName` from v0.1.3.
- **`delete_entities({ projectId, paths: [...], confirmCount })`.** Composes `manage_entity`'s delete; would have collapsed the session's 20 calls into one even without a local mirror.
- **`download_project_zip({ projectId, localPath })`**, via `GET /Project/:id/download/zip`. The reverse direction of sync: it replaces per-file round-trip verification with one call, and its description should recommend it as the backup step before any `mirror` sync.

Keep `manage_entity` and `upload_file` exactly as they are underneath; every tool here is a composition of existing primitives.

**Acceptance:** re-running the session's cleanup (upload 4 changed files, delete 20 stale ones, leave 9 identical figures untouched) is two calls, `plan_sync` then `sync_directory`, instead of 24; and a human edit made during the sync surfaces as one file's `REVISION_CONFLICT`, never as lost text.

---

## v0.4.0 — Compile and build ergonomics

**Motivation:** `compile_project` returns a large JSON blob of build-artifact URLs plus a `stats` object. The session concluded success from `stats["latexmk-errors"] === 0`, never fetched `output.log`, and had no tool to do so. There is also no way to pull the compiled PDF to a local path; `download_file` is for project source entities only.

**what the code does today, and why the failure path matters more than the success path.** `src/overleaf/compile.ts` throws `COMPILE_FAILED` for **every** non-`success` status and buries the whole response, including the `output.log` URL, under `details.result`. So on the most common failure, a LaTeX error, the caller receives an error object with the evidence hidden inside it. Overleaf's web client distinguishes these non-success statuses: `failure`, `timedout`, `terminated`, `too-recently-compiled`, `rate-limited`, `autocompile-backoff`, `compile-in-progress`, `project-too-large`, `validation-problems`, `clsi-maintenance`, `clsi-unavailable`. Output files are fetched from the `url` each `outputFiles` entry already carries (`/project/:id/build/:buildId/output/:file`), adding `clsiserverid` as a query parameter when the response includes one.

**Changes:**

- **Return a parsed summary on success and on `failure` alike.** When a build produced a log, return rather than throw: `{ status, buildId, errors: [{ file, line, message }], warnings, undefinedReferences, undefinedCitations, missingFiles, pageCount, pdfBytes, outputFiles }`. Throw only when there is no build output, and map the statuses: `too-recently-compiled`, `rate-limited`, `autocompile-backoff`, `compile-in-progress` → `COMPILE_RATE_LIMITED` (retryable, with `retryAfterMs`); `timedout` → `COMPILE_TIMEOUT`; `validation-problems` → `COMPILE_FAILED` carrying `validationProblems`; the rest → `COMPILE_FAILED` with the status.
- **licence constraint on the log parser.** Overleaf's own `latex-log-parser.ts` and `bib-log-parser.ts` are AGPL-3.0; this package is MIT. Do not vendor them. Write an independent parser for the handful of patterns that matter (`! ` error lines with `l.<n>`, `LaTeX Warning: Reference … undefined`, `Citation … undefined`, `File … not found`, `Output written on output.pdf (N pages`, and the `.blg` "I didn't find a database entry" lines), keep it pure, and unit-test it against fixture logs in the same style as `test/fixtures`.
- **`download_compile_output({ projectId, file, localPath, buildId? })`** instead of a PDF-only tool; `file` defaults to `output.pdf` and accepts any path in `outputFiles` (`output.log`, `output.blg`, `output.synctex.gz`).
- **`get_compile_log({ projectId, buildId?, kind: "latex" | "bibtex", tail? })`** for when the summary is not enough. Logs run to hundreds of KB; default to a bounded tail and document the bound.
- **expose `stopOnFirstError` and `draft`.** Both are accepted by Overleaf's compile endpoint today alongside the `check` and `incrementalCompilesEnabled` fields the server already sends. `stopOnFirstError` gives agents a short log with the one error that matters; `draft` speeds up text-only iteration.

**Acceptance:** verifying a compile is `errorCount === 0` on a typed field plus one call to pull the PDF; a failed compile returns structured `{ file, line, message }` errors instead of an opaque `COMPILE_FAILED`.

---

## v0.5.0 — Multi-file document support

**Motivation:** `get_sections` / `get_section_content` / `write_section` are explicitly single-file. The project in the session was, until recently, split across `0_main.tex` plus eight `sec: *.tex` files stitched together with `\input`. Plenty of real Overleaf projects stay organised this way permanently, and section tools that stop at `\input` boundaries can only partially help with them.

**resolution rules to decide up front.** `\input{x}` tries `x` then `x.tex`; `\include{x}` always means `x.tex`, implies a page break, and interacts with `\includeonly` (respect it, or at least flag it in the result). Cover `\subfile{}` and `\import{dir}{file}` / `\subimport`, which many multi-file projects use instead. Skip directives inside `%` comments (the section parser already does this; reuse it). Detect cycles and cap depth. A missing target is reported under `unresolved`, not thrown. A target that is a binary `file` rather than a `doc` is skipped and reported.

**New tools:**

- **`get_full_document({ projectId, rootFilePath? })`** → the flattened text plus a source map. each map entry must carry `{ flattenedStart, flattenedEnd, filePath, docId, originalStart, originalEnd, revision }`, including the per-file `revision`, so an edit decided on in the flattened view can be routed back through `write_file` or `write_section` with the correct revision for that file. `rootFilePath` defaults to the project root doc from v0.1.3 item 7.
- **Extend `get_sections` / `get_section_content` with `followIncludes: true`**, built on `get_full_document`. every section then carries `filePath`, and `sectionId` encodes the file so `write_section` stays single-file underneath. A section whose heading and body straddle a file boundary is reported with `spansFiles: true` and refused by `write_section` with a clear `INVALID_ARGUMENT` rather than partially written.

Keep the honesty pattern: update the "never follows `\input`" sentence to say exactly what is and is not followed; do not delete it.

**Acceptance:** a project split across `\input`s can be section-browsed and section-edited with the same tools as a single-file project, opt-in via one flag, and no write ever lands in the wrong file.

---

## v1.0.0 — Hardening

**Motivation:** this wraps undocumented private endpoints, as the README says. At 1.0 the highest-leverage investment is making failure modes legible, not adding surface area.

- **retry with backoff for reads only.** Retry `retryable: true` failures on GET requests and document joins, never on OT submissions, uploads, or deletes, so the README's "never re-submitted automatically" guarantee survives and the bulk tools inherit it. map HTTP 429, which `src/http/client.ts` currently reports as a generic `REMOTE_ERROR` with `status: 429`, to a `RATE_LIMITED` code carrying `retryAfterMs` from the `Retry-After` header. Overleaf rate-limits uploads and compiles per endpoint, so v0.3.0's bulk tools will meet this in practice.
- **`API_SHAPE_CHANGED` instead of a raw parse exception.** Today a moved private API surfaces as a `REMOTE_ERROR` from `asMcpError` or as a bare `TypeError`. Validate responses at the boundary with zod, already a dependency, for the project list, the `joinProject` payload, the upload response, and the compile response. On mismatch, return `API_SHAPE_CHANGED` with `{ endpoint, expectedKeys, receivedKeys }` and nothing else, honouring the README's rule against logging response bodies.
- **do not add cursor pagination to `list_projects`.** Overleaf has no server-side pagination; `/api/project` returns every project and the dashboard paginates in the browser. A cursor would be theatre. v0.2.0's `query`, `limit`, `sort`, and `totalMatched` are the right fix; keep them.
- **automated smoke test against Community Edition, not `www.overleaf.com`.** A CI job that logs into the public service conflicts with the README's own Terms-of-Service caution and needs a long-lived session cookie stored as a CI secret. Instead run `create_project → sync_directory → compile_project → download_compile_output → manage_project(trash)` against Overleaf Community Edition in a Docker service container on a pinned image tag. That also pins the private-API version the suite is tested against. Comments and tracked changes are Server Pro features, so the existing env-gated live tests for those stay manual and opt-in.
- **schema stability commitment.** 1.0 means tool names, input schemas, result shapes, and error codes are governed by SemVer, deprecations are announced one minor version ahead with both names registered during the overlap, and `CHANGELOG.md` records every change to any of them. MCP clients cannot discover this on their own; write it down.
- **release checks.** The publish workflow's tag-equals-version check is good. Add the `npm pack --dry-run` file-list check from v0.1.3 and fail the release if the README's tool count disagrees with `TOOL_NAMES`.

**Deliberately not scoped here** (not exercised in the session, so there is no direct evidence of friction): `add_comment`, `list_comments`, `reply_to_comment`, `set_comment_status`, `monitor_project_history`. Worth a dedicated review pass once the above ships, from someone who has used the review workflow end to end. The README's "Current exclusions" list (Git workflows, collaborator administration, billing, chat, background history watching, history pagination and restoration, label mutation, editing or deleting individual comment messages) stands.

---

## Sequencing rationale

`v0.2.0` (lifecycle) is ordered before `v0.3.0` (sync) even though the sync friction produced more individual tool calls, because the lifecycle gap was a **hard stop** that pulled a human into the loop mid-task, while the sync friction was merely tedious. Fix what blocks autonomous use before what is merely inefficient.

two items in `v0.1.3` are one-line changes with the best payoff-to-effort ratio in this document: surfacing `rootDocPath` in `get_project_tree` (item 7) and correcting `upload_file`'s `destructiveHint` (item 2). Ship those first, even ahead of the documentation pass. And `v0.2.0`'s trash-first design is not only safer for agents; it is what lets `v1.0.0`'s smoke test create and dispose of projects without a permanent delete anywhere in the automated path.
