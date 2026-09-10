import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

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
    history: { monitorProjectHistory: vi.fn() },
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
    expect(registered.get('write_file')?.config.description).toMatch(/tracked/i)
    expect(registered.get('write_section')?.config.description).toMatch(/single file/i)
  })

  test('documents the tool count in the README badge and the docs reference so neither can drift', async () => {
    const readme = await readFile(new URL('../../README.md', import.meta.url), 'utf8')
    const reference = await readFile(new URL('../../docs/tools.md', import.meta.url), 'utf8')
    const badge = /alt="(\d+) MCP tools"/u.exec(readme)?.[1]
    const prose = /The server registers (\d+) tools/u.exec(reference)?.[1]

    expect(badge).toBe(String(TOOL_NAMES.length))
    expect(prose).toBe(String(TOOL_NAMES.length))
  })

  test('marks an in-place upload as destructive and lets a compile default its root', () => {
    const registered = new Map<string, { config: any }>()
    registerOverleafTools(
      {
        registerTool: (name: string, config: any) => {
          registered.set(name, { config })
        },
      },
      fakeRuntime()
    )

    // upload_file replaces an existing entity in place, so it must not advertise itself as safe.
    expect(registered.get('upload_file')?.config.annotations).toMatchObject({
      destructiveHint: true,
    })
    expect(registered.get('compile_project')?.config.description).not.toMatch(/rootDoc_id/u)
    const rootFilePathSchema = registered.get('compile_project')?.config.inputSchema
      .rootFilePath as { safeParse: (value: unknown) => { success: boolean } }
    expect(rootFilePathSchema.safeParse(undefined).success).toBe(true)
  })

  test('accepts write_file content from disk and refuses ambiguous sources', async () => {
    const runtime = fakeRuntime()
    const registered = new Map<string, (...args: any[]) => any>()
    registerOverleafTools(
      {
        registerTool: (name: string, _config: any, handler: (...args: any[]) => any) => {
          registered.set(name, handler)
        },
      },
      runtime
    )
    const directory = await mkdtemp(join(tmpdir(), 'overleaf-tool-'))
    const localPath = join(directory, 'main.tex')
    await writeFile(localPath, '\\section{From disk}\n')

    await registered.get('write_file')?.({
      projectId: 'project',
      filePath: 'main.tex',
      revision: 'revision',
      localPath,
      writeMode: 'untracked',
    })
    expect(runtime.documents.writeFile).toHaveBeenCalledWith(
      'project',
      'main.tex',
      'revision',
      '\\section{From disk}\n',
      'untracked'
    )

    const ambiguous = await registered.get('write_file')?.({
      projectId: 'project',
      filePath: 'main.tex',
      revision: 'revision',
      content: 'inline',
      localPath,
      writeMode: 'untracked',
    })
    expect(ambiguous).toMatchObject({ isError: true })
    expect(JSON.parse(ambiguous.content[0].text)).toMatchObject({ code: 'INVALID_ARGUMENT' })
    expect(runtime.documents.writeFile).toHaveBeenCalledTimes(1)
  })

  test('forwards explicit tracked mode through every text-writing tool', async () => {
    const runtime = fakeRuntime()
    const registered = new Map<string, (...args: any[]) => any>()
    registerOverleafTools(
      {
        registerTool: (name: string, _config: any, handler: (...args: any[]) => any) => {
          registered.set(name, handler)
        },
      },
      runtime
    )

    await registered.get('write_file')?.({
      projectId: 'project',
      filePath: 'main.tex',
      revision: 'revision',
      content: 'content',
      writeMode: 'tracked',
    })
    await registered.get('write_section')?.({
      projectId: 'project',
      filePath: 'main.tex',
      revision: 'revision',
      sectionId: 'section',
      content: 'content',
      writeMode: 'tracked',
    })
    await registered.get('create_file')?.({
      projectId: 'project',
      filePath: 'chapter.tex',
      content: 'content',
      writeMode: 'tracked',
    })

    expect(runtime.documents.writeFile).toHaveBeenCalledWith(
      'project',
      'main.tex',
      'revision',
      'content',
      'tracked'
    )
    expect(runtime.sections.writeSection).toHaveBeenCalledWith(
      'project',
      'main.tex',
      'revision',
      'section',
      'content',
      'tracked'
    )
    expect(runtime.createFile).toHaveBeenCalledWith(
      'project',
      'chapter.tex',
      'content',
      'tracked'
    )
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

  test('forwards list_projects filters and mirrors the listing as structuredContent', async () => {
    const runtime = fakeRuntime()
    const listing = { projects: [], totalMatched: 0, totalProjects: 3 }
    runtime.account.listProjects.mockResolvedValue(listing)
    const registered = new Map<string, { config: any; handler: (...args: any[]) => any }>()
    registerOverleafTools(
      {
        registerTool: (name: string, config: any, handler: (...args: any[]) => any) => {
          registered.set(name, { config, handler })
        },
      },
      runtime
    )

    const tool = registered.get('list_projects')
    expect(tool?.config.annotations).toEqual({ readOnlyHint: true })
    expect(tool?.config.outputSchema).toHaveProperty('projects')
    const result = await tool?.handler({ query: 'thesis', includeTrashed: true, limit: 5, sort: 'name' })
    expect(runtime.account.listProjects).toHaveBeenCalledWith({
      query: 'thesis',
      includeTrashed: true,
      limit: 5,
      sort: 'name',
    })
    expect(result.structuredContent).toEqual(listing)
    expect(JSON.parse(result.content[0].text)).toEqual(listing)
  })

  test('registers a read-only history monitor and forwards its cursor', async () => {
    const runtime = fakeRuntime()
    const registered = new Map<string, { config: any; handler: (...args: any[]) => any }>()
    registerOverleafTools(
      {
        registerTool: (name: string, config: any, handler: (...args: any[]) => any) => {
          registered.set(name, { config, handler })
        },
      },
      runtime
    )

    expect(registered.get('monitor_project_history')?.config.annotations).toEqual({
      readOnlyHint: true,
    })
    await registered.get('monitor_project_history')?.handler({
      projectId: 'project',
      sinceVersion: 12,
    })
    expect(runtime.history.monitorProjectHistory).toHaveBeenCalledWith('project', 12)
  })
})
