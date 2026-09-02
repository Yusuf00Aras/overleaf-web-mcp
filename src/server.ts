import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'

import { SERVER_INSTRUCTIONS } from './mcp/instructions.js'
import { registerOverleafTools, type OverleafToolRuntime } from './mcp/tools.js'
import { SERVER_NAME, SERVER_VERSION } from './version.js'

export { SERVER_INSTRUCTIONS } from './mcp/instructions.js'
export { SERVER_NAME, SERVER_VERSION } from './version.js'

/**
 * Creates the transport-agnostic MCP server; the CLI owns transport and runtime cleanup.
 * The initialize response carries usage instructions so clients that surface them give the
 * model the safety contract without reading the documentation.
 */
export function createMcpServer(runtime: OverleafToolRuntime): McpServer {
  const server = new McpServer(
    { name: SERVER_NAME, version: SERVER_VERSION },
    { instructions: SERVER_INSTRUCTIONS }
  )
  registerOverleafTools(
    server as unknown as Parameters<typeof registerOverleafTools>[0],
    runtime
  )
  return server
}
