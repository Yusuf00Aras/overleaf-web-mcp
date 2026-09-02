# Configuration

Everything is configured through environment variables set where the MCP client starts the
server, for example in the `env` block of the client's MCP configuration. Defaults suit
`www.overleaf.com`.

## Reference

| Variable | Default | Purpose |
| --- | ---: | --- |
| `OVERLEAF_BASE_URL` | `https://www.overleaf.com` | Target Overleaf origin. Use the same value for `login` and `serve`. |
| `OVERLEAF_COOKIE_JAR_FILE` | Platform configuration directory | Saved-session path override |
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

An `ol-maxDocLength` value advertised by the Overleaf deployment takes precedence over the
fallback. Content at or above the limit returns `DOC_TOO_LARGE`; an oversized serialized update
returns `UPDATE_TOO_LARGE` and must be split into smaller, independently revisioned writes.

`compile_project.timeoutMs` accepts 1 second through 15 minutes. It changes only how long the MCP
call waits, not the account's server-side compile allowance.

## Where the session is stored

The login command uses a separate browser profile and never reads your normal browser profile.
Session files live under `overleaf-web-mcp` in the platform configuration directory:

| Platform | Path |
| --- | --- |
| Linux | `${XDG_CONFIG_HOME:-~/.config}/overleaf-web-mcp` |
| macOS | `~/Library/Application Support/overleaf-web-mcp` |
| Windows | `%APPDATA%\overleaf-web-mcp` |

Only cookies applicable to `OVERLEAF_BASE_URL` are saved. On POSIX systems the directory is
created with mode `0700` and the cookie jar with mode `0600`; a group- or world-readable jar is
rejected. Filesystems without meaningful POSIX modes continue with a `permissionsUnchecked`
warning in `auth_status`.

Cookie refreshes received during normal use are merged under an advisory lock and written through
a protected temporary file followed by an atomic replace. If the session expires, run
`npx overleaf-web-mcp login` again.

## Presence

While a project socket is open, the account may appear online to collaborators in the Overleaf
editor. By default at most two project sockets are cached, active sockets are never evicted, and
idle sockets disconnect after 90 seconds. Lower `OVERLEAF_SOCKET_IDLE_TTL_MS` to shorten that
window at the cost of reconnecting more often.
