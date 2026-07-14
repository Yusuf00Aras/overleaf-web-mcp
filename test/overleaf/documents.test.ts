import { describe, expect, test, vi } from 'vitest'

import { McpError } from '../../src/core/errors.js'
import { FifoQueue } from '../../src/core/queue.js'
import { createRevision } from '../../src/core/revision.js'
import { DocumentsApi } from '../../src/overleaf/documents.js'
import type { JoinedDocument } from '../../src/protocol/project-connection.js'

const entity = {
  id: 'doc',
  name: 'main.tex',
  path: 'main.tex',
  type: 'doc' as const,
  parentFolderId: 'root',
}

function shareDocument(content: string, version: number): JoinedDocument {
  return {
    docId: 'doc',
    protocol: 'sharejs',
    version,
    content,
    ranges: { comments: [], changes: [] },
    rawSnapshot: content,
  }
}

function createHarness(
  documents: JoinedDocument[],
  submitError?: McpError,
  options: ConstructorParameters<typeof DocumentsApi>[1] = {}
) {
  const joinDocument = vi.fn(async () => {
    const next = documents.shift()
    if (!next) throw new Error('no document fixture')
    return next
  })
  const connection = {
    queue: new FifoQueue(),
    getTree: () => [entity],
    joinDocument,
    leaveDocument: vi.fn(async () => undefined),
    submitUpdate: vi.fn(async () => {
      if (submitError) throw submitError
    }),
    trackChangesActive: true,
  }
  const connections = {
    withConnection: async <T>(
      _projectId: string,
      operation: (value: typeof connection) => Promise<T>
    ) => await operation(connection),
  }
  return { api: new DocumentsApi(connections, options), connection }
}

describe('document API', () => {
  test('reads normalized text with an opaque revision', async () => {
    const { api } = createHarness([shareDocument('a\r\nb', 3)])
    const result = await api.readFile('project', 'main.tex')

    expect(result).toMatchObject({
      content: 'a\nb',
      newline: 'LF',
      protocol: 'sharejs',
    })
    expect(result.revision).toEqual(expect.any(String))
  })

  test('submits a minimal untracked update and verifies the live post-state', async () => {
    const before = shareDocument('old', 3)
    const after = shareDocument('new', 4)
    const { api, connection } = createHarness([before, after])
    const revision = createRevision({
      projectId: 'project',
      docId: 'doc',
      protocol: 'sharejs',
      otVersion: 3,
      content: 'old',
    })

    const result = await api.writeFile('project', 'main.tex', revision, 'new')

    expect(connection.submitUpdate).toHaveBeenCalledWith(
      'doc',
      {
        doc: 'doc',
        v: 3,
        op: [{ p: 0, d: 'old' }, { p: 0, i: 'new' }],
      }
    )
    expect(result).toMatchObject({
      trackChangesActive: true,
      writeMode: 'untracked',
      protocol: 'sharejs',
    })
  })

  test('recovers a timed-out write when the intended hash is live', async () => {
    const timeout = new McpError('TIMEOUT', 'ack timeout')
    const { api } = createHarness(
      [shareDocument('old', 3), shareDocument('new', 4)],
      timeout
    )
    const revision = createRevision({
      projectId: 'project',
      docId: 'doc',
      protocol: 'sharejs',
      otVersion: 3,
      content: 'old',
    })

    await expect(api.writeFile('project', 'main.tex', revision, 'new')).resolves.toMatchObject({
      recoveredAfterTimeout: true,
    })
  })

  test('polls the bounded recovery window when the original revision is initially live', async () => {
    const timeout = new McpError('TIMEOUT', 'ack timeout')
    const { api, connection } = createHarness(
      [
        shareDocument('old', 3),
        shareDocument('old', 3),
        shareDocument('new', 4),
      ],
      timeout,
      {
        recoveryTimeoutMs: 20,
        recoveryPollIntervalMs: 0,
      }
    )
    const revision = createRevision({
      projectId: 'project',
      docId: 'doc',
      protocol: 'sharejs',
      otVersion: 3,
      content: 'old',
    })

    await expect(api.writeFile('project', 'main.tex', revision, 'new')).resolves.toMatchObject({
      recoveredAfterTimeout: true,
    })
    expect(connection.joinDocument).toHaveBeenCalledTimes(3)
  })

  test('reports an unknown conflict instead of retrying a timed-out write', async () => {
    const timeout = new McpError('TIMEOUT', 'ack timeout')
    const { api, connection } = createHarness(
      [shareDocument('old', 3), shareDocument('collaborator', 4)],
      timeout
    )
    const revision = createRevision({
      projectId: 'project',
      docId: 'doc',
      protocol: 'sharejs',
      otVersion: 3,
      content: 'old',
    })

    await expect(api.writeFile('project', 'main.tex', revision, 'new')).rejects.toMatchObject({
      code: 'REVISION_CONFLICT',
      details: expect.objectContaining({ outcome: 'unknown' }),
    })
    expect(connection.submitUpdate).toHaveBeenCalledOnce()
  })
})
