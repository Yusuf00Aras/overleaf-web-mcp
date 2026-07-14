import { chmod, mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises'
import { dirname, basename, join } from 'node:path'

import lockfile from 'proper-lockfile'
import { Cookie, CookieJar } from 'tough-cookie'

import { AUTH_LOGIN_INSTRUCTION, McpError } from '../core/errors.js'

export interface PermissionCheck {
  permissionsUnchecked: boolean
  warning?: string
}

export async function assertCookieFilePermissions(path: string): Promise<PermissionCheck> {
  if (process.platform === 'win32') {
    return {
      permissionsUnchecked: true,
      warning: 'Cookie file permissions could not be checked on this filesystem.',
    }
  }
  const metadata = await stat(path)
  if ((metadata.mode & 0o077) !== 0) {
    throw new McpError(
      'PERMISSION_DENIED',
      `Cookie jar ${path} must be owner-only. Run: chmod 0600 ${path}`
    )
  }
  return { permissionsUnchecked: false }
}

export async function parseNetscapeCookies(text: string): Promise<CookieJar> {
  const jar = new CookieJar()
  for (const originalLine of text.split(/\r?\n/u)) {
    if (!originalLine || (originalLine.startsWith('#') && !originalLine.startsWith('#HttpOnly_'))) {
      continue
    }
    const httpOnly = originalLine.startsWith('#HttpOnly_')
    const line = httpOnly ? originalLine.slice('#HttpOnly_'.length) : originalLine
    const fields = line.split('\t')
    if (fields.length < 7) continue
    const [domain, , path, secure, expires, name, ...valueParts] = fields
    if (!domain || !path || !name) continue
    const value = valueParts.join('\t')
    const cookie = new Cookie({
      key: name,
      value,
      domain: domain.replace(/^\./u, ''),
      path,
      secure: secure === 'TRUE',
      httpOnly,
      expires:
        expires && expires !== '0' ? new Date(Number(expires) * 1000) : 'Infinity',
    })
    const protocol = cookie.secure ? 'https:' : 'http:'
    await jar.setCookie(cookie, `${protocol}//${cookie.domain}${cookie.path}`)
  }
  return jar
}

function cookieToNetscape(cookie: Cookie): string {
  const domain = cookie.domain ?? ''
  const prefix = cookie.httpOnly ? '#HttpOnly_' : ''
  const includeSubdomains = domain.startsWith('.') ? 'TRUE' : 'FALSE'
  const expires =
    cookie.expires === 'Infinity' || cookie.expires === undefined || cookie.expires === null
      ? '0'
      : String(Math.floor(cookie.expires.getTime() / 1000))
  return [
    `${prefix}${domain}`,
    includeSubdomains,
    cookie.path ?? '/',
    cookie.secure ? 'TRUE' : 'FALSE',
    expires,
    cookie.key,
    cookie.value,
  ].join('\t')
}

function serializeJar(jar: CookieJar): string {
  const serialized = jar.serializeSync()
  const cookies = (serialized?.cookies ?? [])
    .map(value => Cookie.fromJSON(value))
    .filter((value): value is Cookie => value !== null)
  return `# Netscape HTTP Cookie File\n# Updated by overleaf-web-mcp\n${cookies
    .map(cookieToNetscape)
    .join('\n')}\n`
}

/** Persists a complete cookie jar under an advisory lock with owner-only permissions. */
export async function writeCookieJar(path: string, jar: CookieJar): Promise<void> {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 })
  // proper-lockfile needs a stable target; create it with safe permissions before locking.
  try {
    await writeFile(path, '', { flag: 'wx', mode: 0o600 })
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
  }
  if (process.platform !== 'win32') await chmod(path, 0o600)

  let release: (() => Promise<void>) | undefined
  try {
    release = await lockfile.lock(path, {
      retries: { retries: 5, minTimeout: 50, maxTimeout: 250 },
      stale: 10_000,
    })
    const temporary = join(
      dirname(path),
      `.${basename(path)}.${process.pid}.${Date.now()}.tmp`
    )
    await writeFile(temporary, serializeJar(jar), { mode: 0o600 })
    // Same-directory rename prevents readers from observing a partially written jar.
    await rename(temporary, path)
  } catch (error) {
    throw new McpError('PARTIAL_CLEANUP', 'Could not safely persist browser login cookies.', {
      cause: error,
    })
  } finally {
    await release?.()
  }
}

/**
 * Owns the process-wide cookie jar and durably merges cookies refreshed by Overleaf.
 * The in-memory object remains stable because HTTP and socket clients share its identity.
 */
export class CookieStore {
  readonly path: string
  jar: CookieJar
  readonly permissions: PermissionCheck

  private constructor(path: string, jar: CookieJar, permissions: PermissionCheck) {
    this.path = path
    this.jar = jar
    this.permissions = permissions
  }

  static async load(path: string): Promise<CookieStore> {
    try {
      const permissions = await assertCookieFilePermissions(path)
      const jar = await parseNetscapeCookies(await readFile(path, 'utf8'))
      return new CookieStore(path, jar, permissions)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new McpError(
          'AUTH_EXPIRED',
          `No saved Overleaf web session was found. ${AUTH_LOGIN_INSTRUCTION}`,
          { cause: error }
        )
      }
      throw error
    }
  }

  async mergeSetCookies(url: string, setCookies: string[]): Promise<void> {
    for (const value of setCookies) await this.jar.setCookie(value, url)
    if (setCookies.length === 0) return

    let release: (() => Promise<void>) | undefined
    try {
      release = await lockfile.lock(this.path, {
        retries: { retries: 5, minTimeout: 50, maxTimeout: 250 },
        stale: 10_000,
      })
      // Reload under the lock so concurrent server processes do not overwrite each other's refreshes.
      const latest = await parseNetscapeCookies(await readFile(this.path, 'utf8'))
      for (const value of setCookies) await latest.setCookie(value, url)
      await this.jar.removeAllCookies()
      for (const cookie of latest.serializeSync()?.cookies ?? []) {
        const parsed = Cookie.fromJSON(cookie)
        if (parsed) {
          const protocol = parsed.secure ? 'https:' : 'http:'
          await this.jar.setCookie(parsed, `${protocol}//${parsed.domain}${parsed.path ?? '/'}`)
        }
      }
      const temporary = join(
        dirname(this.path),
        `.${basename(this.path)}.${process.pid}.${Date.now()}.tmp`
      )
      await writeFile(temporary, serializeJar(this.jar), { mode: 0o600 })
      await rename(temporary, this.path)
    } catch (error) {
      throw new McpError('PARTIAL_CLEANUP', 'Could not safely persist refreshed cookies.', {
        cause: error,
      })
    } finally {
      await release?.()
    }
  }
}
