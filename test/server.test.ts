import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { describe, expect, test, vi } from 'vitest'

import { SERVER_INSTRUCTIONS } from '../src/mcp/instructions.js'
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

async function connectedPair() {
  const server = createMcpServer(fakeRuntime())
  const client = new Client({ name: 'smoke-client', version: '1.0.0' })
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)])
  return { server, client }
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
    const { server, client } = await connectedPair()
    const result = await client.listTools()

    expect(result.tools.map(tool => tool.name)).toEqual(TOOL_NAMES)
    await client.close()
    await server.close()
  })

  test('sends bounded usage instructions in the initialize response', async () => {
    const { server, client } = await connectedPair()
    const instructions = client.getInstructions()

    expect(instructions).toBe(SERVER_INSTRUCTIONS)
    // The contract an assistant must know without reading the docs.
    for (const term of ['read_file', 'revision', 'REVISION_CONFLICT', 'upload_file', 'confirmPath', 'AUTH_EXPIRED']) {
      expect(instructions).toContain(term)
    }
    // Instructions ride along on every session; keep them short enough to be read.
    expect(instructions!.split(/\s+/u).length).toBeLessThan(450)
    await client.close()
    await server.close()
  })
})
