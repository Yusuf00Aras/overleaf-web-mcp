import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { describe, expect, test, vi } from 'vitest'

import { TOOL_NAMES } from '../src/mcp/tools.js'
import { createMcpServer } from '../src/server.js'

function fakeRuntime() {
  return {
    authStatus: vi.fn(),
    account: { listProjects: vi.fn() },
    entities: {
      getProjectTree: vi.fn(),
      manageEntity: vi.fn(),
      uploadFile: vi.fn(),
      downloadFile: vi.fn(),
    },
    documents: { readFile: vi.fn(), writeFile: vi.fn() },
    createFile: vi.fn(),
    sections: {
      getSections: vi.fn(),
      getSectionContent: vi.fn(),
      writeSection: vi.fn(),
    },
    compile: { compileProject: vi.fn(), stopCompile: vi.fn() },
    comments: {
      listComments: vi.fn(),
      replyToComment: vi.fn(),
      addComment: vi.fn(),
      setCommentStatus: vi.fn(),
    },
    history: { monitorProjectHistory: vi.fn() },
  }
}

describe('MCP server', () => {
  test('constructs the SDK server with the full tool surface', () => {
    const server = createMcpServer(fakeRuntime())

    expect(server).toBeInstanceOf(McpServer)
    const registered = (server as unknown as { _registeredTools: Record<string, unknown> })
      ._registeredTools
    expect(Object.keys(registered)).toEqual(TOOL_NAMES)
  })

  test('lists all tools over an MCP transport handshake', async () => {
    const server = createMcpServer(fakeRuntime())
    const client = new Client({ name: 'smoke-client', version: '1.0.0' })
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()

    await Promise.all([
      server.connect(serverTransport),
      client.connect(clientTransport),
    ])
    const result = await client.listTools()

    expect(result.tools.map(tool => tool.name)).toEqual(TOOL_NAMES)
    await client.close()
    await server.close()
  })
})
