import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { readConfig } from '../../src/config.js'
import { McpError } from '../../src/core/errors.js'
import { OverleafRuntime } from '../../src/runtime.js'

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
})
