import { mkdtemp, writeFile } from 'node:fs/promises'

import { describe, expect, test, vi } from 'vitest'

import { FifoQueue } from '../../src/core/queue.js'
import { EntitiesApi } from '../../src/overleaf/entities.js'
import type { ProjectEntity } from '../../src/overleaf/tree.js'

const tree: ProjectEntity[] = [
  {
    id: 'folder',
    name: 'chapters',
    path: 'chapters',
    type: 'folder' as const,
    parentFolderId: 'root',
  },
  {
    id: 'doc',
    name: 'old.tex',
    path: 'chapters/old.tex',
    type: 'doc' as const,
    parentFolderId: 'folder',
  },
]

function harness() {
  const http = {
    postJson: vi.fn(async () => ({ _id: 'new-doc', name: 'new.tex' })),
    deleteJson: vi.fn(async () => ({})),
    postForm: vi.fn(async (path: string, form: FormData) => {
      void path
      void form
      return [{ entity_id: 'upload' }]
    }),
    getBytes: vi.fn(async () => new Uint8Array([1, 2, 3])),
  }
  const connection = {
    queue: new FifoQueue(),
    getTree: () => tree,
    rootFolderId: 'root',
    trackChangesActive: false,
  }
  const connections = {
    withConnection: async <T>(_id: string, operation: (value: typeof connection) => Promise<T>) =>
      await operation(connection),
    invalidate: vi.fn(async () => undefined),
  }
  return { api: new EntitiesApi(http, connections), http, connections }
}

describe('entity API', () => {
  test('creates a document in its resolved parent folder', async () => {
    const { api, http, connections } = harness()

    await api.createEmptyFile('project', 'chapters/new.tex')

    expect(http.postJson).toHaveBeenCalledWith('/project/project/doc', {
      parent_folder_id: 'folder',
      name: 'new.tex',
    })
    expect(connections.invalidate).toHaveBeenCalledWith('project')
  })

  test('requires exact confirmPath before deleting', async () => {
    const { api, http } = harness()

    await expect(
      api.manageEntity('project', {
        action: 'delete',
        path: 'chapters/old.tex',
        confirmPath: 'old.tex',
      })
    ).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' })
    expect(http.deleteJson).not.toHaveBeenCalled()

    const result = await api.manageEntity('project', {
      action: 'delete',
      path: 'chapters/old.tex',
      confirmPath: 'chapters/old.tex',
    })
    expect(http.deleteJson).toHaveBeenCalledWith('/project/project/doc/doc')
    expect(result).toMatchObject({ trackChangesActive: false, writeMode: 'untracked' })
  })

  test('uses fileRef routes for binary files and destination folder IDs for moves', async () => {
    const { api, http } = harness()
    tree.push({
      id: 'binary',
      name: 'plot.png',
      path: 'plot.png',
      type: 'file',
      parentFolderId: 'root',
    })

    await api.manageEntity('project', {
      action: 'move',
      path: 'plot.png',
      destinationFolderPath: 'chapters',
    })

    expect(http.postJson).toHaveBeenCalledWith('/project/project/file/binary/move', {
      folder_id: 'folder',
    })
  })

  test('uploads the multipart filename field required by Overleaf', async () => {
    const { api, http } = harness()
    const directory = await mkdtemp('/tmp/overleaf-upload-')
    const path = `${directory}/plot.png`
    await writeFile(path, 'png')

    await api.uploadFile('project', path)

    const form = http.postForm.mock.calls[0]?.[1]
    expect(form?.get('name')).toBe('plot.png')
    expect(form?.get('qqfile')).toBeInstanceOf(Blob)
  })
})
