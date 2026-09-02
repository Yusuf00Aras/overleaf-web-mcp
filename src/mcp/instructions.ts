/**
 * Usage guidance sent to MCP clients in the initialize response.
 * This, plus the tool descriptions, is what an assistant actually reads at runtime,
 * so it must stand on its own without the README.
 */
export const SERVER_INSTRUCTIONS = `Overleaf Web MCP gives you access to the Overleaf projects of the signed-in account through an unofficial client of Overleaf's private web APIs. Follow these rules.

Find the project first. list_projects returns project ids; every other tool needs a projectId. get_project_tree returns the entities plus rootDocPath, compiler, and imageName. rootDocPath is the document Overleaf compiles by default.

Editing text. Always call read_file before write_file or write_section, and pass back the returned revision unchanged. On REVISION_CONFLICT, read again and reconcile against the new content; never reuse a stale revision and never retry a write blindly. Send the complete replacement text (or localPath for a file already on disk); the server computes a minimal edit. Use writeMode "tracked" when the user wants the edit to appear as an Overleaf tracked change for review; tracked writes never fall back to untracked.

Binaries and whole-file replacement. upload_file replaces whatever exists at the destination path, with no revision check and never as a tracked change. Prefer write_file for text a collaborator might be editing. hash values on binary files are git blob hashes (git hash-object); documents have no hash, so compare text by reading it.

Destructive actions. manage_entity delete requires confirmPath equal to path. download_file refuses to overwrite a local file unless overwrite is true. Confirm with the user before deleting or overwriting anything.

Compiling. compile_project with no rootFilePath builds the project's configured root document. Compiles consume the account's compile allowance, so do not compile in a loop. COMPILE_FAILED carries Overleaf's status in details.

Comments. add_comment needs a fresh revision, 1-based line and UTF-16 column positions, and expectedText equal to the exact selected text. list_comments returns open threads by default.

Errors are JSON with code, message, retryable, and details. AUTH_EXPIRED means the user must run "npx overleaf-web-mcp login" again; tell them and stop rather than retrying. While a project is open the account may appear online to collaborators.

This is an unofficial client. Prefer disposable projects for experiments and keep request volume low.`
