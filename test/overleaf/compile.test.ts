import { describe, expect, test, vi } from 'vitest'

import { CompileApi } from '../../src/overleaf/compile.js'

describe('compile API', () => {
  test('maps rootFilePath to rootDoc_id and posts a bounded compile request', async () => {
    const http = {
      postJson: vi.fn(async () => ({ status: 'success', outputFiles: [] })),
    }
    const api = new CompileApi(http, async () => ({
      id: 'root-doc',
      path: 'main.tex',
      name: 'main.tex',
      type: 'doc' as const,
      parentFolderId: 'root',
    }))

    await expect(
      api.compileProject('project', 'main.tex', 30_000)
    ).resolves.toMatchObject({ status: 'success' })
    expect(http.postJson).toHaveBeenCalledWith(
      '/project/project/compile',
      expect.objectContaining({ rootDoc_id: 'root-doc' }),
      { timeoutMs: 30_000 }
    )
  })

  test('distinguishes completed compile failures from request timeouts', async () => {
    const http = {
      postJson: vi.fn(async () => ({ status: 'failure', outputFiles: [] })),
    }
    const api = new CompileApi(http, async () => ({
      id: 'root-doc',
      path: 'main.tex',
      name: 'main.tex',
      type: 'doc' as const,
      parentFolderId: 'root',
    }))

    await expect(api.compileProject('project', 'main.tex')).rejects.toMatchObject({
      code: 'COMPILE_FAILED',
    })
  })

  test("defaults to the project's configured root document when no path is given", async () => {
    const http = {
      postJson: vi.fn(async () => ({ status: 'success', outputFiles: [] })),
    }
    const resolvePath = vi.fn()
    const api = new CompileApi(http, resolvePath, 120_000, async () => ({
      id: 'configured-root',
      path: '0_main.tex',
      name: '0_main.tex',
      type: 'doc' as const,
      parentFolderId: 'root',
    }))

    // A blank project ships with a stub main.tex, so the configured root is the honest default.
    await expect(api.compileProject('project')).resolves.toMatchObject({
      status: 'success',
      rootFilePath: '0_main.tex',
    })
    expect(resolvePath).not.toHaveBeenCalled()
    expect(http.postJson).toHaveBeenCalledWith(
      '/project/project/compile',
      expect.objectContaining({ rootDoc_id: 'configured-root' }),
      { timeoutMs: 120_000 }
    )
  })

  test('asks for a root path when the project has none configured', async () => {
    const http = { postJson: vi.fn() }
    const api = new CompileApi(http, vi.fn(), 120_000, async () => undefined)

    await expect(api.compileProject('project')).rejects.toMatchObject({
      code: 'INVALID_ARGUMENT',
    })
    expect(http.postJson).not.toHaveBeenCalled()
  })
})
