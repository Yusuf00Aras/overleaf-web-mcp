import { chmod, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, test } from 'vitest'

import { readConfig } from '../src/config.js'
import { OverleafRuntime } from '../src/runtime.js'

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
        if (url.endsWith('/project')) {
          return new Response(
            '<meta name="ol-csrfToken" content="csrf"><meta name="ol-user_id" content="user">'
          )
        }
        if (url.endsWith('/user/projects')) {
          return new Response(
            JSON.stringify({ projects: [{ _id: 'p', name: 'Paper', accessLevel: 'owner' }] }),
            { headers: { 'content-type': 'application/json' } }
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
    })
    await runtime.close()
  })
})
