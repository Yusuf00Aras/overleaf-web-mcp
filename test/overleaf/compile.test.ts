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
})
