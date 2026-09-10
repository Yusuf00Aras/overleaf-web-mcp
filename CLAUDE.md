@AGENTS.md

## Maintainer conventions

Standing preferences for any assistant working in this repository. They hold for every session; do
not ask about them again.

**Branch names describe the work.** Use `release/<version>-<theme>` for a release branch, and
otherwise `feat/`, `fix/`, `docs/`, or `chore/` plus a short topic, matching the commit prefixes in
[AGENTS.md](AGENTS.md). `release/0.2.0-project-lifecycle` and `fix/compile-root-resolution` are the
shape. A session that starts on a generated placeholder branch renames it before its first push
(`git branch -m`), pushes the descriptive name, and deletes the placeholder from the remote if it
was already pushed. That is standing permission for the rename; there is no need to ask first.

**Nothing in the repository names the assistant that helped write it.** No `Co-Authored-By`
trailers, session links, or generated-with footers on commits or pull requests, and no assistant,
tool, or model name in commit messages, branch names, code, comments, tests, or documentation. This
holds even when tooling offers to add attribution for you. Naming an MCP client in the installation
documentation is a description of what the software supports, not attribution, and is fine.
