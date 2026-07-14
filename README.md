<h1 align="center">Overleaf Web MCP</h1>

<p align="center">Revision-checked Overleaf editing, compilation, and review threads over an authenticated browser session.</p>

<p align="center">
  <img alt="Node.js 20 or newer" src="https://img.shields.io/badge/Node.js-20%2B-339933?logo=nodedotjs&amp;logoColor=white">
  <img alt="Strict TypeScript" src="https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&amp;logoColor=white">
  <img alt="18 MCP tools" src="https://img.shields.io/badge/MCP-18_tools-1F6FEB">
  <img alt="MIT license" src="https://img.shields.io/badge/License-MIT-0F766E">
</p>

<p align="center">
  <img src="docs/assets/overleaf-web-mcp-workflow.webp" alt="Workflow from an MCP client through an authenticated web session to a LaTeX project and its review threads" width="100%">
</p>

| Browser login | Revision-checked editing | Review threads | Compilation |
| :---: | :---: | :---: | :---: |
| Dedicated Chrome profile; no cookie extension | Minimal, verified ShareJS and history-OT updates | List, anchor, reply, resolve, and reopen | Compile a selected root document and stop active builds |

Overleaf Web MCP is an independent Node.js server for working with Overleaf projects through the Model Context Protocol. It covers project trees, files, LaTeX sections, compilation, and anchored review discussions.

The package does not use Overleaf Git integration. It communicates with browser-facing private REST endpoints and the Socket.IO/OT collaboration protocol using a saved Overleaf web session.

## How this implementation fits

Overleaf MCP integrations use several connection models. The entries below are representative rather than exhaustive, and their capabilities may change over time.

| Implementation | Connection model | Focus |
| --- | --- | --- |
| **This project** | Browser-assisted saved session plus private REST and Socket.IO/OT | Revision-checked file, tree, section, compile, and review-thread operations; writes are untracked in V1 |
| [`@netique/overleaf-mcp`](https://github.com/netique/overleaf-mcp) | Browser session plus private REST and Socket.IO/OT | A close web/OT peer with review comments and tracked-change workflows |
| [`overleaf-mcp-rt`](https://github.com/DanielHou315/overleaf-mcp-rt) | Session authentication plus native OT | Real-time file and compile tooling focused on self-hosted Community Edition |
| Git-based projects: [`OverleafMCP`](https://github.com/mjyoo2/OverleafMCP), [`overleaf-mcp-server`](https://github.com/YounesBensafia/overleaf-mcp-server), and [`vibeTeX`](https://github.com/oscardvs/vibetex) | Primarily the Overleaf Git bridge | Git-backed synchronization, editing, and history workflows |

Review-range investigation was informed by [`Overleaf Comment Exporter`](https://github.com/salokr/overleaf-comment-exporter). Real-time protocol behavior was informed by [`Overleaf Workshop`](https://github.com/iamhyc/Overleaf-Workshop).

> [!CAUTION]
> This is an unofficial client for unsupported private APIs. Overleaf may change these interfaces without notice, and automating `www.overleaf.com` may carry Terms-of-Service and account risk. Start with a disposable project, keep live-test volume low, and review Overleaf's current terms before using an important account. Review comments and track changes require Overleaf SaaS or Server Pro; Community Edition does not provide them.

> [!NOTE]
> V1 mutations are deliberately untracked, even when review mode is active. Results disclose `trackChangesActive` and `writeMode: "untracked"`. Plain edits still require editor permission.

## Quick start

Requirements:

- Node.js 20 or newer
- Google Chrome, Chromium, Brave, or Microsoft Edge for browser-assisted login
- An Overleaf account with access to the target projects

### From a source checkout

Run these commands from the repository root:

```bash
npm install
npm run build
npm run login
```

`npm run login` opens a dedicated browser window. Complete the normal Overleaf sign-in flow, including SSO or two-factor authentication when required. The window closes after authentication is detected, and the package saves only cookies applicable to the configured Overleaf origin.

Start the stdio server directly with:

```bash
npm start
```

### From an installed package

Capture and verify a session with:

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

The `serve` command is the default and can be omitted. For a self-hosted deployment, use the same origin for login and the server:

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

## Tools

The server registers 18 tools.

| Area | Tool | Purpose |
| --- | --- | --- |
| Account | `auth_status` | Verify the saved web session without exposing cookies |
| Account | `list_projects` | List projects available to the authenticated account |
| Account | `get_project_tree` | Return the current file and folder tree with paths and entity IDs |
| Files | `read_file` | Read LF-normalized text and its opaque revision |
| Files | `write_file` | Replace text through a minimal, verified, revision-checked OT update |
| Files | `create_file` | Create a text document and return its resulting revision |
| Files | `manage_entity` | Create folders and rename, move, or confirmed-delete entities |
| Files | `upload_file` | Upload a local binary file to a project folder |
| Files | `download_file` | Download a document or binary file to an explicit local path |
| Sections | `get_sections` | Parse section headings in one LaTeX file |
| Sections | `get_section_content` | Read one parsed section body |
| Sections | `write_section` | Replace one section body with a revision-checked write |
| Compilation | `compile_project` | Compile a project using a selected root document |
| Compilation | `stop_compile` | Stop the active compile for a project |
| Review | `list_comments` | List and filter threads, with lazy source-range resolution |
| Review | `reply_to_comment` | Reply to an existing thread with timeout deduplication |
| Review | `add_comment` | Create and verify a thread anchored to exact source text |
| Review | `set_comment_status` | Resolve or reopen a thread and verify the resulting state |

Key contracts:

- Reads normalize CRLF and lone CR to LF and report `newline: "LF"`.
- Revisions are opaque concurrency tokens containing project and document identity, OT protocol, version, and a SHA-256 content hash. They are not authentication credentials and should not be constructed by callers.
- `add_comment` uses 1-based line and UTF-16 column positions. The normalized live selection must exactly equal `expectedText`.
- Content writes use minimal OT edits and are verified against a freshly joined document. Ambiguous writes are observed during a bounded recovery window and are never retried automatically.
- `manage_entity` deletion requires `confirmPath` to exactly equal `path`.
- Section parsing is single-file only. It recognizes starred headings and optional titles, ignores `%` comments and common verbatim-like environments, and never follows `\input` or `\include`.

### Safe edit workflow

1. Call `read_file` and retain its `revision`.
2. Modify the returned LF-normalized content.
3. Call `write_file` with the unchanged revision and complete replacement content.
4. If `REVISION_CONFLICT` is returned, read the file again and reconcile against the new content; do not reuse the stale revision.

`create_file` and `write_section` also return the resulting revision, allowing the next mutation to proceed without an extra read.

### Review workflow

1. Call `list_comments`; it defaults to open threads and accepts file, status, and author filters.
2. Use `reply_to_comment` for an existing thread.
3. To anchor a new thread, call `read_file`, select an exact range, then pass its revision, UTF-16 positions, `expectedText`, and message to `add_comment`.
4. Pass the latest revision to `set_comment_status` when resolving or reopening an anchored thread.

All review-panel threads are returned with available author metadata. Overleaf does not expose a reliable separate reviewer classification.

## Configuration

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

An advertised `ol-maxDocLength` value takes precedence over the fallback. Target content at or above the limit returns `DOC_TOO_LARGE`. An oversized serialized update returns `UPDATE_TOO_LARGE`; V1 requires smaller, independently revisioned writes instead of internally chunking an operation.

The `compile_project` tool also accepts `timeoutMs` from 1 second to 15 minutes. This controls how long the MCP call waits and does not change the account's server-side compile allowance.

## Authentication and security

The login command uses a separate browser profile and does not inspect the normal Chrome profile. By default, session files are stored under `overleaf-web-mcp` in the platform configuration directory:

- Linux: `${XDG_CONFIG_HOME:-~/.config}/overleaf-web-mcp`
- macOS: `~/Library/Application Support/overleaf-web-mcp`
- Windows: `%APPDATA%\overleaf-web-mcp`

Only cookies applicable to `OVERLEAF_BASE_URL` are saved. The cookie jar is local and is never returned by a tool. On POSIX systems, the configuration directory is created with mode 0700 and the cookie jar with mode 0600; group- or world-readable jars are rejected. Filesystems without meaningful POSIX modes continue with a `permissionsUnchecked` warning.

Cookie refreshes are merged under an advisory lock and written through a protected temporary file followed by atomic replacement. If the session is missing or expired, sign in through Chrome again with `npx overleaf-web-mcp login`.

The server reserves stdout for MCP protocol messages. Logs do not include cookies, filenames, document content, diffs, quoted context, or review-message bodies.

<details>
<summary><strong>Review-thread location behavior</strong></summary>

Thread messages, authors, and resolution state come from `/project/:id/threads`. When the deployment exposes `/project/:id/ranges`, that project-wide index identifies the documents containing filtered threads. Only those documents are joined to calculate line and column positions and quoted context.

If a usable project-wide range index is unavailable, a project-wide call returns threads with `positionsUnavailable: true`; it never scans every document silently. Supplying `filePath` joins only that document and resolves its ShareJS ranges or history-OT comment state. Threads without a document range are returned as `unlocated`.

The discussion record and source range are separate Overleaf objects. The thread endpoint provides messages, while live document state provides the attachment and status metadata.

</details>

<details>
<summary><strong>Protocol and reliability notes</strong></summary>

- The collaboration adapter implements the Socket.IO 0.9 wire format used by the targeted Overleaf client family. Project bootstrap rejects unsupported protocol versions.
- ShareJS text OT and history-OT are normalized behind one document interface. Visible history-OT offsets account for tracked deletions retained in the raw snapshot.
- At most two project sockets are cached by default. Active sockets are never evicted, and idle sockets disconnect after 90 seconds. While a project socket remains open, the account may appear online to collaborators.
- All document sessions and tree mutations share a project-wide FIFO because Overleaf's join/leave epoch is socket-wide. Documents are joined for one queued operation and then left.
- A write succeeds only after its acknowledgement, matching `otUpdateApplied` event, leave and rejoin, and content-hash verification.
- If a write times out, the intended hash means success, the unchanged original revision means timeout, and any third observable state means conflict. The write is never submitted a second time automatically.
- A comment is created as a REST thread and then attached through OT. Timed-out attachment recovery checks the new thread ID and exact range; orphan cleanup occurs only after the unchanged document positively proves that attachment did not apply.
- A timed-out reply is accepted only when current author, exact normalized content, and the request-time window identify the refreshed message.
- ShareJS comment status uses the dedicated REST action. History-OT comment status is part of the document operation and snapshot.

Protocol fixtures under `test/fixtures/protocol` are sanitized: cookies, user data, project and document IDs, and document content are removed.

</details>

## Development

```bash
npm run check
npm run lint
npm test
npm run build
npm pack --dry-run
```

Unit and deterministic integration tests cover revision identity, Unicode positions, section parsing, OT operations, update limits, queue and cache behavior, Socket.IO frames, timeout recovery, comment attachment, file-tree events, and MCP registration.

### Gated live testing

Live tests are disabled by default and should target disposable projects:

```bash
RUN_OVERLEAF_LIVE_TESTS=1 \
OVERLEAF_LIVE_TEST_PROJECT_ID=0123456789abcdef01234567 \
npm test -- test/live
```

Set `RUN_OVERLEAF_LIVE_REVIEW_TESTS=1` only for a disposable SaaS or Server Pro project. Community Edition can cover file, tree, section, and compile checks, but not comments or track changes. Live tests should keep request volume low, restore changed content, and report cleanup failures.

## V1 exclusions

Git workflows, collaborator and account administration, billing, chat, history restoration, tracked-write generation, and editing or deleting individual comment messages are outside V1. Private API compatibility is version-specific and maintained on a best-effort basis.

## License

Licensed under the [MIT License](LICENSE).
