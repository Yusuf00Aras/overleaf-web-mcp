# Tool reference

The server registers 19 tools. Names are `snake_case`. Every tool except `auth_status` and
`list_projects` takes a `projectId` from `list_projects`. Results are JSON. Failures are JSON with
`code`, `message`, `retryable`, and optional `details`; the codes are listed in the
[safety model](safety.md#error-codes).

Each tool declares MCP annotations: **read-only** tools change nothing on Overleaf; **destructive**
tools can replace or remove existing content. Clients may use these to decide when to ask the user.

## Account and connection

### `auth_status` <small>read-only</small>

Verify the saved web session without exposing cookies.

No parameters.

Returns `authenticated: true`, `baseUrl`, the account's `userId` when known, `projectCount`,
`permissionsUnchecked` (true on filesystems without POSIX modes), an optional `warning`, and
`socketPresenceNotice` explaining that an open project connection can show the account as online.
A missing or expired session fails with `AUTH_EXPIRED`.

### `list_projects` <small>read-only</small>

List the projects the account can access.

No parameters.

Returns an array of `{ id, name, accessLevel }` sorted by name. Every project is returned; there
is no filter yet (see the [roadmap](roadmap.md)).

## Projects and files

### `get_project_tree` <small>read-only</small>

Return the file and folder tree together with the project's compile settings.

| Parameter | Required | Meaning |
| --- | :---: | --- |
| `projectId` | yes | Project id |

Returns `entities`, an array of `{ id, name, path, type, parentFolderId, hash? }` where `type` is
`doc` (text), `file` (binary), or `folder`, plus `rootDocPath` (the document Overleaf compiles by
default), `compiler`, `imageName` (the TeX Live image), `trackChangesActive`, and `hashNote`.

`hash` is present only on binary `file` entities and is a git blob hash:
`sha1("blob " + byteLength + "\0" + content)`, exactly what `git hash-object <file>` prints. Plain
`sha1sum` never matches. Text documents have no hash and must be compared by reading them.

### `read_file` <small>read-only</small>

Read a text document.

| Parameter | Required | Meaning |
| --- | :---: | --- |
| `projectId` | yes | Project id |
| `filePath` | yes | Project-relative path with forward slashes |

Returns `content` with line endings normalized to LF, the opaque `revision` needed for any write,
`newline: "LF"`, the document's OT `protocol`, and `trackChangesActive`.

### `write_file` <small>destructive</small>

Replace a text document with a revision-checked, minimal, verified edit.

| Parameter | Required | Meaning |
| --- | :---: | --- |
| `projectId` | yes | Project id |
| `filePath` | yes | Document path |
| `revision` | yes | The revision from a prior `read_file` or write of this document |
| `content` | one of | Complete replacement text |
| `localPath` | one of | Local UTF-8 file holding the complete replacement. Non-UTF-8 content is rejected; a leading byte order mark is stripped |
| `writeMode` | no | `untracked` (default) or `tracked` to record the edit as Overleaf tracked changes |

Exactly one of `content` and `localPath` must be given. Returns the new `revision`, `protocol`,
`trackChangesActive`, `writeMode`, and `recoveredAfterTimeout: true` when the write was confirmed
during the recovery window after a timeout. A no-op write succeeds and records nothing. Fails with
`REVISION_CONFLICT` if the document changed since the revision was read.

### `create_file`

Create a text document, optionally with initial content.

| Parameter | Required | Meaning |
| --- | :---: | --- |
| `projectId` | yes | Project id |
| `filePath` | yes | Path of the new document; parent folders must exist |
| `content` | no | Initial text |
| `writeMode` | no | `untracked` (default) or `tracked`; tracked requires non-empty `content` |

Returns the document's `revision`, `protocol`, `trackChangesActive`, and `writeMode`. Creating the
entity itself is always an ordinary project-tree operation; only the initial content can be
tracked.

### `manage_entity` <small>destructive</small>

Create a folder, or rename, move, or delete an existing document, file, or folder.

| Parameter | Required | Meaning |
| --- | :---: | --- |
| `projectId` | yes | Project id |
| `action` | yes | `create_folder`, `rename`, `move`, or `delete` |
| `path` | yes | For `create_folder`, the folder to create; otherwise the entity to act on |
| `newName` | for `rename` | New name without slashes |
| `destinationFolderPath` | for `move` | Target folder; `""` is the project root |
| `confirmPath` | for `delete` | Must equal `path` exactly, else `CONFIRMATION_MISMATCH` |

Returns the `action`, the affected entity `id` (or the created folder), and `trackChangesActive`.
Deleting a folder removes everything inside it.

### `upload_file` <small>destructive</small>

Upload a local file into a project folder.

| Parameter | Required | Meaning |
| --- | :---: | --- |
| `projectId` | yes | Project id |
| `localPath` | yes | Local file to upload |
| `destinationFolderPath` | no | Target folder; default `""`, the project root |
| `destinationName` | no | Name to store the file under; defaults to the local file name |

If an entity already exists at the destination path, Overleaf replaces its content in place and
keeps its entity id; otherwise a new entity is created. Overleaf, not the caller, decides whether
the result is a text `doc` or a binary `file`, by extension and UTF-8 validity, so this is a valid
way to replace `.tex`, `.bib`, and `.bst` documents from disk. Replacing a document this way is a
blind write: no revision check, never tracked. Uploading text where a binary of the same name
exists, or the reverse, fails with `INVALID_ARGUMENT` rather than replacing it.

Returns `entityId`, `entityType`, `path`, `replaced` (whether something existed at that path), and
for binary files `hash`, computed locally so it can be checked against `get_project_tree` later.

### `download_file` <small>read-only</small>

Save one document or binary file to a local path.

| Parameter | Required | Meaning |
| --- | :---: | --- |
| `projectId` | yes | Project id |
| `filePath` | yes | Entity to download; folders are refused |
| `localPath` | yes | Where to write it |
| `overwrite` | no | Replace `localPath` if it exists; default `false` |

Returns `bytes` and `localPath`. Fails with `INVALID_ARGUMENT` when the local file exists and
`overwrite` is not `true`.

## Choosing between `write_file` and `upload_file`

| Need | Tool | Revision check | Tracked changes | Content source |
| --- | --- | :---: | :---: | --- |
| Small edit, or collaborators may be editing | `write_file` with `content` | yes | optional | inline |
| Replace a large text file safely | `write_file` with `localPath` | yes | optional | disk |
| Replace a binary, or push text when nobody else is editing | `upload_file` | no | never | disk |

Neither is limited by file size in practice: `DOC_TOO_LARGE` applies at the advertised
`ol-maxDocLength` (2,097,152 UTF-16 code units by default) and `UPDATE_TOO_LARGE` at 7,340,032
serialized characters. A 115 KB document uses about 5% of the document limit. The practical
ceiling on inline `content` is the MCP client's tool-argument budget, which `localPath` avoids.

## LaTeX sections

Section tools work on one file at a time. They recognize starred headings and optional titles,
ignore `%` comments and common verbatim-like environments, and never follow `\input` or
`\include`.

### `get_sections` <small>read-only</small>

Parse the section headings of one file.

| Parameter | Required | Meaning |
| --- | :---: | --- |
| `projectId` | yes | Project id |
| `filePath` | yes | Document to parse |

Returns `sections`, `revision`, and `singleFileOnly: true`. Each section has an `id` to pass to
the other two section tools, its `command` (for example `section` or `subsection`), `level`,
`starred`, `title`, optional `shortTitle`, and character offsets `start`, `headingEnd`,
`bodyStart`, and `end` into the LF-normalized content.

### `get_section_content` <small>read-only</small>

Read one section's body.

| Parameter | Required | Meaning |
| --- | :---: | --- |
| `projectId` | yes | Project id |
| `filePath` | yes | Document |
| `sectionId` | yes | From `get_sections` |

Returns `content` (the body text), the matching `section` record, and the document's current
`revision`.

### `write_section` <small>destructive</small>

Replace one section's body with a revision-checked write.

| Parameter | Required | Meaning |
| --- | :---: | --- |
| `projectId` | yes | Project id |
| `filePath` | yes | Document |
| `revision` | yes | From `get_sections`, `get_section_content`, or `read_file` |
| `sectionId` | yes | Section to replace |
| `content` | yes | New body |
| `writeMode` | no | `untracked` (default) or `tracked` |

Returns the same fields as `write_file`. Fails with `REVISION_CONFLICT` if the document changed.

## Compilation

### `compile_project`

Compile the project.

| Parameter | Required | Meaning |
| --- | :---: | --- |
| `projectId` | yes | Project id |
| `rootFilePath` | no | Document to compile for this call only. Omitted, the root document configured in Overleaf is used, the same one the web editor's Recompile button builds |
| `timeoutMs` | no | How long to wait, 1 second to 15 minutes; default 120 seconds |

Returns Overleaf's compile response: `status`, `outputFiles` (each with `path`, `url`, `type`, and
`build`), `rootFilePath` (the document actually compiled), and further fields Overleaf includes
such as `stats` and `timings`. A status other than `success` fails with `COMPILE_FAILED` carrying
the full response in `details.result`. A project with no configured root and no `rootFilePath`
fails with `INVALID_ARGUMENT`. Compiles use the account's compile allowance; `timeoutMs` bounds
only the wait.

### `stop_compile` <small>destructive</small>

Stop the active compile for a project.

| Parameter | Required | Meaning |
| --- | :---: | --- |
| `projectId` | yes | Project id |

Returns `stopped: true`.

## Review

Review comments and tracked changes need an Overleaf deployment and plan that support them.
Positions use 1-based lines and UTF-16 columns.

### `list_comments` <small>read-only</small>

List comment threads, resolving their document positions lazily.

| Parameter | Required | Meaning |
| --- | :---: | --- |
| `projectId` | yes | Project id |
| `filePath` | no | Only threads anchored in this document |
| `status` | no | `open` (default), `resolved`, or `all` |
| `author` | no | Only threads with messages by this author name |

Returns `threads`, each with `id`, `status`, `messages` (author, content, timestamp), and when
located `filePath`, `start`, `end`, and `quotedText`. A thread without a document range has
`unlocated: true`. If the deployment offers no project-wide range index and no `filePath` was
given, the result has `positionsUnavailable: true` rather than scanning every document.

### `reply_to_comment`

Reply in an existing thread.

| Parameter | Required | Meaning |
| --- | :---: | --- |
| `projectId` | yes | Project id |
| `threadId` | yes | From `list_comments` |
| `content` | yes | Message text |

Returns the created message. A reply that timed out is accepted only when the refreshed thread
shows a matching message from the current author within the request window, so no reply is
posted twice.

### `add_comment`

Create a thread anchored to exact text.

| Parameter | Required | Meaning |
| --- | :---: | --- |
| `projectId` | yes | Project id |
| `filePath` | yes | Document |
| `revision` | yes | From a fresh `read_file` |
| `start`, `end` | yes | `{ line, column }`, 1-based, UTF-16 columns |
| `expectedText` | yes | Must equal the normalized text in that range exactly |
| `content` | yes | Comment text |

Returns the new thread's identifier and verification details. The thread is created and then
attached to the range through OT; if attachment cannot be confirmed, the orphaned thread is
cleaned up only after the unchanged document proves it never applied.

### `set_comment_status` <small>destructive</small>

Resolve or reopen a thread.

| Parameter | Required | Meaning |
| --- | :---: | --- |
| `projectId` | yes | Project id |
| `filePath` | yes | Document the thread is anchored in |
| `revision` | yes | Latest revision of that document |
| `threadId` | yes | Thread to change |
| `status` | yes | `open` or `resolved` |

Returns the verified status and resulting revision.

## History

### `monitor_project_history` <small>read-only</small>

Poll one recent window of project history.

| Parameter | Required | Meaning |
| --- | :---: | --- |
| `projectId` | yes | Project id |
| `sinceVersion` | no | Return only update groups newer than this version |

Returns `currentVersion`, `nextSinceVersion` to pass on the next poll, `hasEarlierHistory`,
`gapDetected` (true when the cursor predates the single window returned), and `updates`, each with
`fromVersion`, `toVersion`, `startedAt`, `endedAt`, `authors` (id and display name; emails are
stripped), `paths`, `projectOperations`, `labels`, and `origin`. This is stateless polling, not a
background watcher, and it never pages backward or computes diffs.
