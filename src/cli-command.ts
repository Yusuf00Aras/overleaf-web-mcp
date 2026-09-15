import { McpError } from './core/errors.js'

export type CliCommand = 'serve' | 'login' | 'keepalive' | 'help'

export function parseCliCommand(argv: string[]): CliCommand {
  if (argv.length === 0 || (argv.length === 1 && argv[0] === 'serve')) return 'serve'
  if (argv.length === 1 && argv[0] === 'login') return 'login'
  if (argv.length === 1 && argv[0] === 'keepalive') return 'keepalive'
  if (argv.length === 1 && (argv[0] === '--help' || argv[0] === '-h' || argv[0] === 'help')) {
    return 'help'
  }
  throw new McpError(
    'INVALID_ARGUMENT',
    `Unknown command. Run \`overleaf-web-mcp --help\`; use \`overleaf-web-mcp login\` to authenticate.`
  )
}

export function renderHelp(): string {
  return `Overleaf Web MCP

Usage:
  overleaf-web-mcp serve      Start the MCP stdio server (default)
  overleaf-web-mcp login      Open Chrome and save an authenticated Overleaf session
  overleaf-web-mcp keepalive  Refresh the saved session so it does not expire; schedule it daily
  overleaf-web-mcp --help     Show this help
`
}
