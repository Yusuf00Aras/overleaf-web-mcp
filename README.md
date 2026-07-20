<h1 align="center">Overleaf Web MCP</h1>

<p align="center">Unofficial MCP server for browsing, tracked writing, organizing, compiling, reviewing, and monitoring version history in Overleaf projects through an authenticated web session.</p>

<p align="center">
  <img alt="Node.js 20 or newer" src="https://img.shields.io/badge/Node.js-20%2B-339933?logo=nodedotjs&amp;logoColor=white">
  <img alt="Strict TypeScript" src="https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&amp;logoColor=white">
  <img alt="19 MCP tools" src="https://img.shields.io/badge/MCP-19_tools-1F6FEB">
  <img alt="MIT license" src="https://img.shields.io/badge/License-MIT-0F766E">
</p>

<p align="center">
  <img src="docs/assets/overleaf-web-mcp-workflow.webp" alt="MCP client connected through an authenticated web session to an Overleaf workspace for project files, LaTeX editing, compilation, and review replies" width="100%">
</p>

| Connect | Organize | Write | Compile | Review | History |
| :---: | :---: | :---: | :---: | :---: | :---: |
| Dedicated Chrome-family profile and saved session | Browse projects and manage files, folders, uploads, and downloads | Revision-checked whole-file and section edits, optionally tracked | Build a selected root document and stop active compiles | List, anchor, reply, resolve, and reopen comments | Poll recent project updates with a version cursor |

Overleaf Web MCP is an independent Node.js Model Context Protocol server for complete Overleaf project workflows. It uses browser-facing private REST endpoints plus Socket.IO/OT through a saved web session, without requiring Overleaf Git integration.

> [!CAUTION]
> This is an unofficial client for unsupported private APIs. Overleaf may change these interfaces without notice, and automating `www.overleaf.com` may carry Terms-of-Service and account risk. Start with a disposable project, keep live-test volume low, and review Overleaf's current terms before using an important account.

## Quick start

Requirements:

- Node.js 20 or newer
- Google Chrome, Chromium, Brave, or Microsoft Edge for browser-assisted login
- An Overleaf account with access to the target projects

<details open>
<summary><strong>Install from npm and connect an MCP client</strong></summary>

Capture and verify a session:

```bash
npx overleaf-web-mcp login
```

Configure an MCP client to start the package over stdio:

```json
{
  "mcpServers": {
    "overleaf": {
      "command": "npx",
      "args": ["-y", "overleaf-web-mcp", "serve"]
    }
  }
}
```

The `serve` command is the default and can be omitted.

</details>

<details>
<summary><strong>Run from a source checkout</strong></summary>

From the repository root:

```bash
npm install
npm run build
npm run login
npm start
```

`npm run login` opens a dedicated browser window. Complete the normal Overleaf sign-in flow, including SSO or two-factor authentication when required. The window closes after authentication is detected, and the package saves only cookies applicable to the configured Overleaf origin.

</details>

<details>
<summary><strong>Connect to self-hosted Overleaf</strong></summary>

Use the same origin for login and the MCP server:

```bash
OVERLEAF_BASE_URL=https://overleaf.example.org npx overleaf-web-mcp login
```

```json
{
  "mcpServers": {
    "overleaf": {
      "command": "npx",
      "args": ["-y", "overleaf-web-mcp", "serve"],
      "env": {
        "OVERLEAF_BASE_URL": "https://overleaf.example.org"
      }
    }
  }
}
```

Private API and feature availability varies by Overleaf deployment and edition.

</details>

## Tools

The server registers 19 tools. Expand only the areas you need.

<details>
<summary><strong>Account and connection — 2 tools</strong></summary>

| Tool | Purpose |
| --- | --- |
| `auth_status` | Verify the saved web session without exposing cookies |
| `list_projects` | List projects available to the authenticated account |

</details>

<details open>
<summary><strong>Projects, files, and tracked writing — 7 tools</strong></summary>

| Tool | Purpose |
| --- | --- |
| `get_project_tree` | Return the current file and folder tree with paths and entity IDs |
| `read_file` | Read LF-normalized text and its opaque revision |
| `write_file` | Replace text through a minimal verified OT update; optionally use tracked changes |
| `create_file` | Create a text document and optionally track non-empty initial content |
| `manage_entity` | Create folders and rename, move, or confirmed-delete entities |
| `upload_file` | Upload a local binary file to a project folder |
| `download_file` | Download a document or binary file to an explicit local path |

`write_file` and non-empty `create_file` content accept `writeMode: "untracked" | "tracked"`. The default is `"untracked"` for backward compatibility. Tracked file creation requires non-empty initial content; creating the file entity itself remains a normal project-tree operation.

</details>

<details>
<summary><strong>LaTeX sections — 3 tools</strong></summary>

| Tool | Purpose |
| --- | --- |
| `get_sections` | Parse section headings in one LaTeX file |
| `get_section_content` | Read one parsed section body |
| `write_section` | Replace one section body with a revision-checked tracked or untracked write |

Section parsing is single-file only. It recognizes starred headings and optional titles, ignores `%` comments and common verbatim-like environments, and never follows `\input` or `\include`.

</details>

<details>
<summary><strong>Compilation — 2 tools</strong></summary>

| Tool | Purpose |
| --- | --- |
| `compile_project` | Compile a project using a selected root document |
| `stop_compile` | Stop the active compile for a project |

</details>

<details>
<summary><strong>Review and replies — 4 tools</strong></summary>

| Tool | Purpose |
| --- | --- |
| `list_comments` | List and filter threads with lazy source-range resolution |
| `reply_to_comment` | Reply to an existing thread with timeout deduplication |
| `add_comment` | Create and verify a thread anchored to exact source text |
| `set_comment_status` | Resolve or reopen a thread and verify the resulting state |

`add_comment` uses 1-based line and UTF-16 column positions. The normalized live selection must exactly equal `expectedText`.

</details>

<details>
<summary><strong>Version history — 1 tool</strong></summary>

| Tool | Purpose |
| --- | --- |
| `monitor_project_history` | Poll one recent update window and return entries newer than an optional version cursor |

This is stateless client-driven polling, not a background watcher. Results include `currentVersion`, `nextSinceVersion`, `hasEarlierHistory`, and `gapDetected`, plus normalized update groups with authors, paths, file-tree operations, labels, and origin metadata. Author emails and raw private response fields are omitted.

</details>

Key safety contracts:

- Reads normalize CRLF and lone CR to LF and report `newline: "LF"`.
- Revisions are opaque concurrency tokens containing project and document identity, OT protocol, version, and a SHA-256 content hash. Callers should retain but never construct them.
- Content writes use minimal OT edits and are verified against a freshly joined document. Ambiguous writes are observed during a bounded recovery window and are never retried automatically.
- Explicit tracked writes never silently fall back to untracked writes. They require an authenticated user ID, while `trackChangesActive` separately reports the project state observed at connection time.
- `manage_entity` deletion requires `confirmPath` to exactly equal `path`.

## Common workflows

<details>
<summary><strong>Browse and organize a project</strong></summary>

1. Call `list_projects`, then `get_project_tree`.
2. Use `create_file` for text, or `manage_entity` to create folders and rename, move, or confirmed-delete entities.
3. Use `upload_file` for local binaries and `download_file` to save documents or binaries to explicit local paths.

</details>

<details open>
<summary><strong>Make a safe tracked or untracked edit</strong></summary>

1. Call `read_file` and retain its `revision`.
2. Modify the LF-normalized content.
3. Call `write_file` with the unchanged revision, complete replacement content, and the desired mode:

```json
{
  "projectId": "0123456789abcdef01234567",
  "filePath": "main.tex",
  "revision": "opaque-revision-from-read-file",
  "content": "\\section{Introduction}\nRevised text.\n",
  "writeMode": "tracked"
}
```

4. If `REVISION_CONFLICT` is returned, read again and reconcile against the new content; never reuse the stale revision.

`create_file` and `write_section` accept the same `writeMode` choice and return the resulting revision. A no-op write returns successfully but creates no tracked record.

</details>

<details open>
<summary><strong>Poll recent version history</strong></summary>

Call `monitor_project_history` without a cursor to establish the current window:

```json
{
  "projectId": "0123456789abcdef01234567"
}
```

On the next poll, pass the previous `nextSinceVersion` as `sinceVersion`. Only update groups whose `toVersion` is newer are returned. If `gapDetected` is true, the cursor predates the single returned window; the tool deliberately does not page backward or calculate diffs.

</details>

<details>
<summary><strong>Compile a project</strong></summary>

1. Call `compile_project` with the selected root document.
2. Use `stop_compile` to stop an active compile.

</details>

<details>
<summary><strong>Review and reply to comments</strong></summary>

1. Call `list_comments`; it defaults to open threads and accepts file, status, and author filters.
2. Use `reply_to_comment` for an existing thread.
3. To anchor a new thread, call `read_file`, select an exact range, then pass its revision, UTF-16 positions, `expectedText`, and message to `add_comment`.
4. Pass the latest revision to `set_comment_status` when resolving or reopening an anchored thread.

All review-panel threads include available author metadata. Overleaf does not expose a reliable separate reviewer classification. Review comments and tracked changes require an Overleaf deployment and account entitlement that supports them.

</details>

## Configuration, authentication, and security

The cookie jar is local, never returned by a tool, and protected with restrictive permissions where the filesystem supports them. The server reserves stdout for MCP protocol messages and does not log cookies, filenames, document content, diffs, quoted context, or review-message bodies.

<details>
<summary><strong>Configuration reference</strong></summary>

| Variable | Default | Purpose |
| --- | ---: | --- |
| `OVERLEAF_COOKIE_JAR_FILE` | Platform configuration directory | Saved-session path override |
| `OVERLEAF_BASE_URL` | `https://www.overleaf.com` | Target Overleaf origin |
| `OVERLEAF_BROWSER_PATH` | Auto-detected | Chrome-family executable used by `login` |
| `OVERLEAF_BROWSER_PROFILE_DIR` | Platform configuration directory | Dedicated login profile |
| `OVERLEAF_LOGIN_TIMEOUT_MS` | `300000` | Browser sign-in deadline, capped at 15 minutes |
| `OVERLEAF_PROTOCOL_VERSIONS` | `2` | Comma-separated accepted collaboration protocol versions |
| `OVERLEAF_MAX_DOC_LENGTH` | `2097152` | Fallback maximum UTF-16 document length |
| `OVERLEAF_MAX_UPDATE_CHARS` | `7340032` | Conservative serialized OT update limit |
| `OVERLEAF_SOCKET_CACHE_SIZE` | `2` | Maximum cached project sockets |
| `OVERLEAF_SOCKET_IDLE_TTL_MS` | `90000` | Idle project-socket lifetime |
| `OVERLEAF_REQUEST_TIMEOUT_MS` | `30000` | REST and collaboration-call timeout |
| `OVERLEAF_APPLY_TIMEOUT_MS` | `30000` | OT acknowledgement and application timeout |
| `OVERLEAF_RECOVERY_TIMEOUT_MS` | `30000` | Ambiguous-mutation observation window |
| `OVERLEAF_COMPILE_TIMEOUT_MS` | `120000` | Default compile wait, capped at 15 minutes |

An advertised `ol-maxDocLength` value takes precedence over the fallback. Target content at or above the limit returns `DOC_TOO_LARGE`; an oversized serialized update returns `UPDATE_TOO_LARGE` and must be split into smaller independently revisioned writes.

`compile_project.timeoutMs` accepts 1 second through 15 minutes. It changes only how long the MCP call waits, not the account's server-side compile allowance.

</details>

<details>
<summary><strong>Authentication storage and refresh behavior</strong></summary>

The login command uses a separate browser profile and does not inspect the normal Chrome profile. Session files are stored under `overleaf-web-mcp` in the platform configuration directory:

- Linux: `${XDG_CONFIG_HOME:-~/.config}/overleaf-web-mcp`
- macOS: `~/Library/Application Support/overleaf-web-mcp`
- Windows: `%APPDATA%\overleaf-web-mcp`

Only cookies applicable to `OVERLEAF_BASE_URL` are saved. On POSIX systems, the configuration directory uses mode 0700 and the cookie jar mode 0600; group- or world-readable jars are rejected. Filesystems without meaningful POSIX modes continue with a `permissionsUnchecked` warning.

Cookie refreshes are merged under an advisory lock and written through a protected temporary file followed by atomic replacement. If the session expires, run `npx overleaf-web-mcp login` again.

</details>

## Technical details and ecosystem

<details>
<summary><strong>Connection model and related projects</strong></summary>

The entries below are representative rather than exhaustive, and their capabilities may change over time.

| Implementation | Connection model | Focus |
| --- | --- | --- |
| **This project** | Browser-assisted saved session plus private REST and Socket.IO/OT | Project/file management, tracked writing, compilation, review/replies, and recent history monitoring |
| [`@netique/overleaf-mcp`](https://github.com/netique/overleaf-mcp) | Browser session plus private REST and Socket.IO/OT | A close web/OT peer with review comments and tracked-change workflows |
| [`overleaf-mcp-rt`](https://github.com/DanielHou315/overleaf-mcp-rt) | Session authentication plus native OT | Real-time file and compile tooling focused on self-hosted Community Edition |
| Git-based projects: [`OverleafMCP`](https://github.com/mjyoo2/OverleafMCP), [`overleaf-mcp-server`](https://github.com/YounesBensafia/overleaf-mcp-server), and [`vibeTeX`](https://github.com/oscardvs/vibetex) | Primarily the Overleaf Git bridge | Git-backed synchronization, editing, and history workflows |

Review-range investigation was informed by [`Overleaf Comment Exporter`](https://github.com/salokr/overleaf-comment-exporter). Real-time protocol behavior was informed by [`Overleaf Workshop`](https://github.com/iamhyc/Overleaf-Workshop).

</details>

<details>
<summary><strong>Protocol and reliability notes</strong></summary>

- The collaboration adapter implements the Socket.IO 0.9 wire format used by the targeted Overleaf client family. Project bootstrap rejects unsupported protocol versions.
- ShareJS text OT and history-OT are normalized behind one document interface. Tracked ShareJS writes carry the authenticated author in update metadata; tracked history-OT writes carry author and timestamp metadata on inserted and retained-deletion components.
- Visible history-OT offsets account for tracked deletions retained in the raw snapshot.
- At most two project sockets are cached by default. Active sockets are never evicted, and idle sockets disconnect after 90 seconds. While a project socket remains open, the account may appear online to collaborators.
- All document sessions and tree mutations share a project-wide FIFO because Overleaf's join/leave epoch is socket-wide. Documents are joined for one queued operation and then left.
- A write succeeds only after acknowledgement, matching `otUpdateApplied`, leave/rejoin, and content-hash verification.
- If a write times out, the intended hash means success, the unchanged original revision means timeout, and any third observable state means conflict. The write is never submitted again automatically.
- A comment is created as a REST thread and then attached through OT. Timed-out attachment recovery checks the new thread ID and exact range; orphan cleanup occurs only after the unchanged document proves attachment did not apply.
- A timed-out reply is accepted only when current author, exact normalized content, and the request-time window identify the refreshed message.
- ShareJS comment status uses the dedicated REST action. History-OT comment status is part of the document operation and snapshot.
- History monitoring reads one 25-group update window, strips email fields, and keeps no cursor or background state on the server.

Protocol fixtures under `test/fixtures/protocol` are sanitized: cookies, user data, project and document IDs, and document content are removed.

</details>

<details>
<summary><strong>Review-thread location behavior</strong></summary>

Thread messages, authors, and resolution state come from `/project/:id/threads`. When the deployment exposes `/project/:id/ranges`, that project-wide index identifies the documents containing filtered threads. Only those documents are joined to calculate line and column positions and quoted context.

If a usable project-wide range index is unavailable, a project-wide call returns threads with `positionsUnavailable: true`; it never scans every document silently. Supplying `filePath` joins only that document and resolves its ShareJS ranges or history-OT comment state. Threads without a document range are returned as `unlocated`.

The discussion record and source range are separate Overleaf objects. The thread endpoint provides messages, while live document state provides attachment and status metadata.

</details>

## Development

<details>
<summary><strong>Local verification and gated live tests</strong></summary>

```bash
npm run check
npm run lint
npm test
npm run build
npm pack --dry-run
```

Unit and deterministic integration tests cover revision identity, Unicode positions, section parsing, tracked and untracked OT operations, history normalization, update limits, queue/cache behavior, Socket.IO frames, timeout recovery, comment attachment, file-tree events, and MCP registration.

Live tests are disabled by default and must target a disposable project:

```bash
RUN_OVERLEAF_LIVE_TESTS=1 \
OVERLEAF_LIVE_TEST_PROJECT_ID=0123456789abcdef01234567 \
npm test -- test/live
```

Add `RUN_OVERLEAF_LIVE_REVIEW_TESTS=1` for review reads, `RUN_OVERLEAF_LIVE_TRACKED_WRITE_TESTS=1` for a disposable tracked file create/delete, or `RUN_OVERLEAF_LIVE_HISTORY_TESTS=1` for read-only history normalization. Feature availability depends on the deployment and account. Keep request volume low and treat cleanup failures as test failures.

</details>

<details>
<summary><strong>Current exclusions</strong></summary>

Git workflows, collaborator/account administration, billing, chat, background history watching, backward history pagination, version diffs and restoration, label mutation, and editing or deleting individual comment messages are outside the current release. Private API compatibility is version-specific and maintained on a best-effort basis.

</details>

## License

Licensed under the [MIT License](LICENSE).
