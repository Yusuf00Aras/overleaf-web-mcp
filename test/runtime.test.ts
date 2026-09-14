import { chmod, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, test, vi } from 'vitest'

import { readConfig } from '../src/config.js'
import { OverleafRuntime } from '../src/runtime.js'

function runtimeWithWrites(userId: string | null = 'user') {
  const entities = { createEmptyFile: vi.fn(async () => undefined) }
  const documents = {
    readFile: vi.fn(async () => ({
      content: '',
      revision: 'revision',
      newline: 'LF' as const,
      protocol: 'sharejs' as const,
      trackChangesActive: false,
    })),
    writeFile: vi.fn(async () => ({
      revision: 'new-revision',
      protocol: 'sharejs' as const,
      trackChangesActive: false,
      writeMode: 'tracked' as const,
    })),
  }
  const runtime = Object.assign(Object.create(OverleafRuntime.prototype), {
    entities,
    documents,
    ...(userId === null ? {} : { userId }),
  }) as OverleafRuntime
  return { runtime, entities, documents }
}

describe('runtime bootstrap', () => {
  test('loads a protected browser cookie jar and discovers account metadata', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'overleaf-runtime-'))
    const cookiePath = join(directory, 'cookies.txt')
    await writeFile(
      cookiePath,
      '# Netscape HTTP Cookie File\n.overleaf.test\tTRUE\t/\tTRUE\t2147483647\toverleaf.sid\tsession\n'
    )
    if (process.platform !== 'win32') await chmod(cookiePath, 0o600)
    const config = readConfig({
      OVERLEAF_COOKIE_JAR_FILE: cookiePath,
      OVERLEAF_BASE_URL: 'https://overleaf.test',
    })
    const runtime = await OverleafRuntime.create(config, {
      fetcher: async input => {
        const url = String(input)
        if (url.endsWith('/api/project')) {
          return new Response(
            JSON.stringify({ totalSize: 1, projects: [{ _id: 'p', name: 'Paper', accessLevel: 'owner' }] }),
            { headers: { 'content-type': 'application/json' } }
          )
        }
        if (url.endsWith('/project')) {
          return new Response(
            '<meta name="ol-csrfToken" content="csrf"><meta name="ol-user_id" content="user">'
          )
        }
        throw new Error(`unexpected URL ${url}`)
      },
      connectionFactory: async () => {
        throw new Error('socket should not be opened by auth_status')
      },
    })

    await expect(runtime.authStatus()).resolves.toMatchObject({
      authenticated: true,
      userId: 'user',
      projectCount: 1,
      baseUrl: 'https://overleaf.test',
      sessionExpiresAt: '2038-01-19T03:14:07.000Z',
    })
    await runtime.close()
  })

  test('tracks non-empty initial file content when requested', async () => {
    const { runtime, documents } = runtimeWithWrites()

    await runtime.createFile('project', 'chapter.tex', 'Tracked content', 'tracked')

    expect(documents.writeFile).toHaveBeenCalledWith(
      'project',
      'chapter.tex',
      'revision',
      'Tracked content',
      'tracked'
    )
  })

  test('rejects tracked empty file creation before creating an entity', async () => {
    const { runtime, entities } = runtimeWithWrites()

    await expect(
      runtime.createFile('project', 'chapter.tex', '', 'tracked')
    ).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' })
    expect(entities.createEmptyFile).not.toHaveBeenCalled()
  })

  test('rejects tracked file creation without a user identity before creating an entity', async () => {
    const { runtime, entities } = runtimeWithWrites(null)

    await expect(
      runtime.createFile('project', 'chapter.tex', 'Tracked content', 'tracked')
    ).rejects.toMatchObject({ code: 'PROTOCOL_UNSUPPORTED' })
    expect(entities.createEmptyFile).not.toHaveBeenCalled()
  })
})
