<h1 align="center">Overleaf Web MCP</h1>

<p align="center">Let Claude, Cursor, or any MCP client read, edit, compile, and review your Overleaf projects, signed in as you.</p>

<p align="center">
  <a href="https://www.npmjs.com/package/overleaf-web-mcp"><img alt="npm version" src="https://img.shields.io/npm/v/overleaf-web-mcp?color=1F6FEB"></a>
  <img alt="Node.js 20 or newer" src="https://img.shields.io/badge/Node.js-20%2B-339933?logo=nodedotjs&amp;logoColor=white">
  <img alt="24 MCP tools" src="https://img.shields.io/badge/MCP-24_tools-1F6FEB">
  <a href="https://mhmdaskari.github.io/overleaf-web-mcp/"><img alt="Documentation" src="https://img.shields.io/badge/docs-mhmdaskari.github.io-0F766E"></a>
  <img alt="MIT license" src="https://img.shields.io/badge/License-MIT-0F766E">
</p>

<p align="center">
  <img src="docs/assets/overleaf-web-mcp-workflow.webp" alt="An MCP client connected through an authenticated web session to an Overleaf workspace for project files, LaTeX editing, compilation, and review replies" width="100%">
</p>

Overleaf Web MCP is an unofficial [Model Context Protocol](https://modelcontextprotocol.io) server. It signs in to Overleaf once through a browser window you control, then lets an AI assistant work on your projects the way you would in the web editor: browse files, make revision-checked edits, optionally as tracked changes, compile, and handle review comments. It uses the same browser-facing endpoints the Overleaf editor uses, so no Git integration or premium plan is needed for the core workflow.

## What you can say

Once connected, talk to your assistant in plain language. It picks the tools.

- "List my Overleaf projects and open the one called *CHEERSafe*."
- "Rewrite the introduction of `main.tex` for a general audience, as a tracked change."
- "Compile the paper and tell me whether it built."
- "Which figures in `./figures` differ from what's in the project? Upload only those."
- "Summarize the open review comments and reply to the one about Table 2."

> [!CAUTION]
> This client uses Overleaf's private, browser-facing APIs, which Overleaf may change without notice. Automating `www.overleaf.com` may carry Terms-of-Service and account risk. Start with a disposable project and keep request volume low.

## Get started

You need Node.js 20 or newer, a Chrome-family browser (Chrome, Chromium, Brave, or Edge), and an Overleaf account.

**1. Sign in once.** A dedicated browser window opens. Complete the normal Overleaf login, including SSO or two-factor. Only cookies for the Overleaf origin are saved, to a file only your user can read.

```bash
npx overleaf-web-mcp login
```

**2. Connect your MCP client.** For Claude Code:

```bash
claude mcp add overleaf --scope user -- npx -y overleaf-web-mcp serve
```

For Claude Desktop, Cursor, VS Code, and other clients, add this to their MCP configuration:

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

**3. Restart the client** and ask it to check your Overleaf connection.

Client-by-client steps, self-hosted Overleaf, and troubleshooting, including the "failed to connect" you get when `node` is older than 20, are in the [installation guide](https://mhmdaskari.github.io/overleaf-web-mcp/install/).

## What it can do

- **Browse and organize.** List projects, read the file tree with the configured root document and compiler, create folders and files, rename, move, upload, download, and delete with confirmation.
- **Write safely.** Replace a whole document or a single section. Every edit is checked against the revision you read first, so a collaborator's concurrent change is reported instead of overwritten. Edits can be recorded as Overleaf tracked changes.
- **Work by section.** Parse `\section` headings in a file, read one section, replace one section.
- **Compile.** Build the project's configured root document, or any document you name, and stop a running compile.
- **Review.** List comment threads with their locations, reply, add a comment anchored to exact text, and resolve or reopen threads.
- **Follow history.** Poll recent project history with a version cursor to see who changed what.

## How it keeps your project safe

- Text edits require the revision from a prior read and fail with a conflict if the document changed underneath.
- Tracked changes are opt-in and never silently downgraded to plain edits.
- Deletes require the path to be confirmed. Downloads never overwrite a local file unless asked.
- A write that times out is observed, never resubmitted, so nothing is applied twice.
- Your session cookie stays on your machine in a file only you can read, and is never returned by any tool.
- While a project is open, up to 90 seconds after the last call, you may appear online to collaborators.

## Documentation

| Page | What it covers |
| --- | --- |
| [Install](https://mhmdaskari.github.io/overleaf-web-mcp/install/) | Claude Code, Claude Desktop, Cursor, VS Code, self-hosted Overleaf, troubleshooting |
| [Using it](https://mhmdaskari.github.io/overleaf-web-mcp/using/) | Example prompts and what happens underneath |
| [Tool reference](https://mhmdaskari.github.io/overleaf-web-mcp/tools/) | All 24 tools with parameters and results |
| [Safety model](https://mhmdaskari.github.io/overleaf-web-mcp/safety/) | Revisions, tracked changes, confirmations, error codes |
| [Configuration](https://mhmdaskari.github.io/overleaf-web-mcp/configuration/) | Environment variables and where the session is stored |
| [Internals](https://mhmdaskari.github.io/overleaf-web-mcp/internals/) | Protocol notes, reliability guarantees, related projects |
| [Roadmap](https://mhmdaskari.github.io/overleaf-web-mcp/roadmap/) and [Changelog](https://mhmdaskari.github.io/overleaf-web-mcp/changelog/) | Where this is going and what changed |

## For AI agents

The server sends usage instructions to the MCP client when it connects, and every tool description is self-contained, so an assistant does not need this README to use it correctly. Coding agents contributing to the repository should read [AGENTS.md](AGENTS.md).

## License

[MIT](LICENSE).
