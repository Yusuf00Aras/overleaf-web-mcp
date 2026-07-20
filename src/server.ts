import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'

import { registerOverleafTools, type OverleafToolRuntime } from './mcp/tools.js'
import { SERVER_NAME, SERVER_VERSION } from './version.js'

export { SERVER_NAME, SERVER_VERSION } from './version.js'

/** Creates the transport-agnostic MCP server; the CLI owns transport and runtime cleanup. */
export function createMcpServer(runtime: OverleafToolRuntime): McpServer {
  const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION })
  registerOverleafTools(
    server as unknown as Parameters<typeof registerOverleafTools>[0],
    runtime
  )
  return server
}
