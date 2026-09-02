# Using it

You do not call tools yourself. You describe what you want, and the assistant chooses tools and
sequences them. This page shows what to ask for and what happens underneath, so you can predict
and check the assistant's behaviour.

## Example prompts

**Finding things**

- "List my Overleaf projects."
- "Show me the file tree of the *Thesis* project. Which file is the root document?"
- "Read the abstract from `main.tex`."

**Editing**

- "Fix the typos in the introduction of `main.tex`."
- "Replace the Methods section with the text in `~/drafts/methods.tex`, as a tracked change."
- "Create `sections/limitations.tex` with a short limitations paragraph."

**Files and figures**

- "Upload `figures/fig3.pdf` into the project's `figures` folder."
- "Which figures in `./figures` differ from the ones in the project? Upload only those."
- "Download `references.bib` to my desktop."
- "Delete `old_draft.tex`." The assistant will confirm the path with you first.

**Compiling**

- "Compile the paper." Builds the root document configured in Overleaf.
- "Compile with `report.tex` as the root instead."

**Review**

- "List the open comments and summarize them."
- "Reply to the comment about Figure 2 saying the caption is fixed."
- "Add a comment on the sentence starting 'We assume independence' asking for a citation."

**History**

- "What changed in the project since yesterday, and who changed it?"

## What happens underneath

### Browsing and organizing

1. `list_projects` returns project names and ids.
2. `get_project_tree` returns every file and folder with its path, plus `rootDocPath`,
   `compiler`, and `imageName` for the project.
3. `create_file` creates a text document; `manage_entity` creates folders and renames, moves, or
   deletes entities; `upload_file` sends a local file; `download_file` saves one locally.

### Making a safe edit

1. `read_file` returns the LF-normalized content and an opaque `revision`.
2. The assistant edits the content.
3. `write_file` sends the complete replacement with the unchanged `revision` and a `writeMode`.

```json
{
  "projectId": "0123456789abcdef01234567",
  "filePath": "main.tex",
  "revision": "opaque-revision-from-read-file",
  "content": "\\section{Introduction}\nRevised text.\n",
  "writeMode": "tracked"
}
```

If the document changed in the meantime, the result is `REVISION_CONFLICT` and the assistant must
read again and reconcile. It never reuses a stale revision. `write_section` and `create_file`
follow the same pattern, and a write that changes nothing returns successfully without creating a
tracked record.

For a large replacement that already exists on disk, `write_file` accepts `localPath` instead of
`content`. That keeps the revision check and optional tracked changes while avoiding the client's
tool-argument budget. See [choosing between write_file and upload_file](tools.md#choosing-between-write_file-and-upload_file).

### Working by section

`get_sections` parses the headings of one file and returns section ids; `get_section_content`
reads one body; `write_section` replaces one body with the same revision check as `write_file`.
Section parsing never follows `\input` or `\include`.

### Uploading only the binaries that changed

`get_project_tree` reports a git blob hash for every binary file, so a local folder can be
compared with the project without downloading anything:

```bash
# For each local figure, print git's own hash next to the path.
for file in figures/*.png; do
  printf '%s %s\n' "$(git hash-object "$file")" "$file"
done
```

Match each hash against the `hash` of the entity at the same path in the tree, then call
`upload_file` only for paths that differ or are missing. Text documents have no `hash`; compare
those with `read_file`.

### Compiling

`compile_project` with no `rootFilePath` builds the root document configured in the project,
which is what the web editor's Recompile button builds. Passing `rootFilePath` overrides the root
for that call only. `stop_compile` stops a running build. Compiles use your account's compile
allowance, so the assistant should not compile in a loop.

### Reviewing comments

1. `list_comments` returns open threads by default, with file, status, and author filters.
2. `reply_to_comment` adds to an existing thread.
3. `add_comment` anchors a new thread to exact text: it needs a fresh revision, 1-based line and
   UTF-16 column positions, and `expectedText` equal to the selected text.
4. `set_comment_status` resolves or reopens a thread using the latest revision.

Review comments and tracked changes require an Overleaf plan and deployment that support them.

### Following history

Call `monitor_project_history` without a cursor to establish the current window, then pass the
returned `nextSinceVersion` on later polls. Only update groups newer than the cursor come back.
If `gapDetected` is true, the cursor predates the single window returned; the tool does not page
backward or compute diffs.
