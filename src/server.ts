import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'

import { registerOverleafTools, type OverleafToolRuntime } from './mcp/tools.js'

export const SERVER_NAME = 'overleaf-web-mcp'
export const SERVER_VERSION = '0.1.0'

/** Creates the transport-agnostic MCP server; the CLI owns transport and runtime cleanup. */
export function createMcpServer(runtime: OverleafToolRuntime): McpServer {
  const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION })
  registerOverleafTools(
    server as unknown as Parameters<typeof registerOverleafTools>[0],
    runtime
  )
  return server
}
