import { chmod, mkdtemp, readFile, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { CookieJar } from 'tough-cookie'
import { describe, expect, test } from 'vitest'

import {
  assertCookieFilePermissions,
  CookieStore,
  parseNetscapeCookies,
  writeCookieJar,
} from '../../src/http/cookies.js'

describe('Netscape cookie jars', () => {
  test('turns a missing default jar into actionable login guidance', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'overleaf-cookie-missing-'))
    const path = join(directory, 'cookies.txt')

    await expect(CookieStore.load(path)).rejects.toMatchObject({
      code: 'AUTH_EXPIRED',
      message: expect.stringMatching(/overleaf-web-mcp login/iu),
    })
  })

  test('parses regular and HttpOnly cookie export lines', async () => {
    const jar = await parseNetscapeCookies(`# Netscape HTTP Cookie File
.overleaf.test\tTRUE\t/\tTRUE\t2147483647\toverleaf.sid\tsession
#HttpOnly_.overleaf.test\tTRUE\t/\tTRUE\t2147483647\tcsrf\ttoken
`)

    expect(await jar.getCookieString('https://www.overleaf.test/project')).toContain(
      'overleaf.sid=session'
    )
    expect(await jar.getCookieString('https://www.overleaf.test/project')).toContain(
      'csrf=token'
    )
  })

  test('rejects group/world-readable files on POSIX', async () => {
    if (process.platform === 'win32') return
    const directory = await mkdtemp(join(tmpdir(), 'overleaf-cookie-test-'))
    const path = join(directory, 'cookies.txt')
    await writeFile(path, 'cookies')
    await chmod(path, 0o644)

    await expect(assertCookieFilePermissions(path)).rejects.toThrow(/0600/u)
    await chmod(path, 0o600)
    await expect(assertCookieFilePermissions(path)).resolves.toMatchObject({
      permissionsUnchecked: false,
    })
  })

  test('persists a refreshed cookie without replacing the live jar object', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'overleaf-cookie-refresh-'))
    const path = join(directory, 'cookies.txt')
    await writeFile(
      path,
      '# Netscape HTTP Cookie File\n.overleaf.test\tTRUE\t/\tTRUE\t2147483647\toverleaf.sid\told\n',
      { mode: 0o600 }
    )
    const store = await CookieStore.load(path)
    const liveJar = store.jar

    await store.mergeSetCookies(
      'https://overleaf.test/project',
      ['overleaf.sid=new; Domain=overleaf.test; Path=/; Secure']
    )

    expect(store.jar).toBe(liveJar)
    expect(await liveJar.getCookieString('https://overleaf.test/project')).toContain(
      'overleaf.sid=new'
    )
    expect(await readFile(path, 'utf8')).toContain('overleaf.sid\tnew')
  })

  test('creates a protected Netscape jar in a new config directory', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'overleaf-cookie-login-'))
    const path = join(directory, 'nested', 'cookies.txt')
    const jar = new CookieJar()
    await jar.setCookie(
      'overleaf_session2=session; Domain=overleaf.test; Path=/; Secure; HttpOnly',
      'https://overleaf.test/project'
    )

    await writeCookieJar(path, jar)

    expect(await readFile(path, 'utf8')).toContain('overleaf_session2\tsession')
    if (process.platform !== 'win32') {
      expect((await stat(path)).mode & 0o777).toBe(0o600)
    }
    const loaded = await CookieStore.load(path)
    expect(await loaded.jar.getCookieString('https://overleaf.test/project')).toContain(
      'overleaf_session2=session'
    )
  })
})
