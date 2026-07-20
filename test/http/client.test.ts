import { CookieJar } from 'tough-cookie'
import { describe, expect, test, vi } from 'vitest'

import { OverleafHttpClient } from '../../src/http/client.js'

describe('authenticated HTTP client', () => {
  test('adds cookies and parses JSON responses', async () => {
    const jar = new CookieJar()
    await jar.setCookie('overleaf.sid=session; Path=/; Secure', 'https://overleaf.test')
    const fetcher = vi.fn(async (_url: string, init?: RequestInit) => {
      expect(new Headers(init?.headers).get('cookie')).toContain('overleaf.sid=session')
      expect(new Headers(init?.headers).get('user-agent')).toBe('overleaf-web-mcp/0.1.2')
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    })
    const client = new OverleafHttpClient({
      baseUrl: 'https://overleaf.test',
      jar,
      fetcher,
    })

    await expect(client.getJson('/user/projects')).resolves.toEqual({ ok: true })
  })

  test('turns login redirects and 401 responses into actionable AUTH_EXPIRED', async () => {
    const client = new OverleafHttpClient({
      baseUrl: 'https://overleaf.test',
      jar: new CookieJar(),
      fetcher: async () => new Response('unauthorized', { status: 401 }),
    })

    await expect(client.getJson('/user/projects')).rejects.toMatchObject({
      code: 'AUTH_EXPIRED',
      message: expect.stringMatching(/overleaf-web-mcp login/i),
    })
  })

  test('enforces an explicit request deadline', async () => {
    const client = new OverleafHttpClient({
      baseUrl: 'https://overleaf.test',
      jar: new CookieJar(),
      fetcher: async (_url, init) =>
        await new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(init.signal?.reason))
        }),
    })

    await expect(client.getJson('/slow', { timeoutMs: 5 })).rejects.toMatchObject({
      code: 'TIMEOUT',
    })
  })
})
