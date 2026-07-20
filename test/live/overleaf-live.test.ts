import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { readConfig } from '../../src/config.js'
import { McpError } from '../../src/core/errors.js'
import { OverleafRuntime } from '../../src/runtime.js'
import type { HistorySnapshot } from '../../src/protocol/ot.js'
import { resolveProjectPath } from '../../src/overleaf/tree.js'

const enabled = process.env.RUN_OVERLEAF_LIVE_TESTS === '1'

describe.skipIf(!enabled)('disposable Overleaf live project', () => {
  let runtime: OverleafRuntime
  let projectId: string

  beforeAll(async () => {
    projectId = process.env.OVERLEAF_LIVE_TEST_PROJECT_ID ?? ''
    if (!projectId) {
      throw new McpError(
        'INVALID_ARGUMENT',
        'OVERLEAF_LIVE_TEST_PROJECT_ID is required when RUN_OVERLEAF_LIVE_TESTS=1.'
      )
    }
    runtime = await OverleafRuntime.create(readConfig())
  })

  afterAll(async () => {
    await runtime?.close()
  })

  test('authenticates and joins the configured disposable project', async () => {
    await expect(runtime.authStatus()).resolves.toMatchObject({ authenticated: true })
    const tree = await runtime.entities.getProjectTree(projectId)
    expect(Array.isArray(tree)).toBe(true)
  })

  test.skipIf(process.env.RUN_OVERLEAF_LIVE_REVIEW_TESTS !== '1')(
    'reads review threads without mutating them when the deployment supports comments',
    async () => {
    const result = await runtime.comments.listComments(projectId, { status: 'all' })
    expect(Array.isArray(result.threads)).toBe(true)
    }
  )

  test.skipIf(process.env.RUN_OVERLEAF_LIVE_TRACKED_WRITE_TESTS !== '1')(
    'creates and verifies disposable tracked initial content',
    async () => {
      const filePath = `mcp-tracked-${Date.now()}.tex`
      try {
        const written = await runtime.createFile(
          projectId,
          filePath,
          '\\section{Tracked}\nDisposable live-test content.\n',
          'tracked'
        )
        expect(written).toMatchObject({ writeMode: 'tracked' })
        await expect(runtime.documents.readFile(projectId, filePath)).resolves.toMatchObject({
          content: '\\section{Tracked}\nDisposable live-test content.\n',
        })
        const trackingObserved = await runtime.connections.withConnection(
          projectId,
          async connection => await connection.queue.run(async () => {
            const entity = resolveProjectPath(connection.getTree(), filePath, 'doc')
            const document = await connection.joinDocument(entity.id)
            try {
              if (document.protocol === 'history-ot') {
                const snapshot = document.rawSnapshot as HistorySnapshot
                return snapshot.trackedChanges?.some(
                  change =>
                    change.tracking.type === 'insert' &&
                    change.tracking.userId === runtime.userId
                ) ?? false
              }
              const changes = (document.ranges as { changes?: unknown[] } | undefined)?.changes ?? []
              return changes.length > 0 && JSON.stringify(changes).includes(runtime.userId ?? '')
            } finally {
              await connection.leaveDocument(entity.id)
            }
          })
        )
        expect(trackingObserved).toBe(true)
      } finally {
        const tree = await runtime.entities.getProjectTree(projectId)
        if (tree.some(entity => entity.path === filePath)) {
          await runtime.entities.manageEntity(projectId, {
            action: 'delete',
            path: filePath,
            confirmPath: filePath,
          })
        }
      }
    }
  )
})
