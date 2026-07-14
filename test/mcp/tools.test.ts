import { describe, expect, test, vi } from 'vitest'

import { McpError } from '../../src/core/errors.js'
import { TOOL_NAMES, registerOverleafTools } from '../../src/mcp/tools.js'

function fakeRuntime() {
  return {
    authStatus: vi.fn(async () => ({ authenticated: true })),
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
  }
}

describe('MCP tool registration', () => {
  test('registers the complete standalone tool surface', () => {
    const registered = new Map<string, { config: any; handler: (...args: any[]) => any }>()
    const server = {
      registerTool: (name: string, config: any, handler: (...args: any[]) => any) => {
        registered.set(name, { config, handler })
      },
    }

    registerOverleafTools(server, fakeRuntime())

    expect([...registered.keys()]).toEqual(TOOL_NAMES)
    expect(registered.get('write_file')?.config.description).toMatch(/untracked/i)
    expect(registered.get('write_section')?.config.description).toMatch(/single file/i)
  })

  test('returns structured tool errors without leaking stack traces', async () => {
    const runtime = fakeRuntime()
    runtime.documents.readFile.mockRejectedValue(
      new McpError('AUTH_EXPIRED', 'Re-export cookies.')
    )
    const registered = new Map<string, (...args: any[]) => any>()
    registerOverleafTools(
      {
        registerTool: (name: string, _config: any, handler: (...args: any[]) => any) => {
          registered.set(name, handler)
        },
      },
      runtime
    )

    const result = await registered.get('read_file')?.({
      projectId: 'project',
      filePath: 'main.tex',
    })

    expect(result).toMatchObject({ isError: true })
    expect(JSON.parse(result.content[0].text)).toMatchObject({ code: 'AUTH_EXPIRED' })
    expect(result.content[0].text).not.toContain('stack')
  })
})
