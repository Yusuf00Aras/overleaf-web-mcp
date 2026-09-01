import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, test } from 'vitest'

import { resolveTextContent } from '../../src/core/local-file.js'

async function scratchFile(name: string, bytes: Uint8Array | string): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'overleaf-local-'))
  const path = join(directory, name)
  await writeFile(path, bytes)
  return path
}

describe('local write sources', () => {
  test('requires exactly one of content and localPath', async () => {
    await expect(resolveTextContent({})).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' })
    await expect(
      resolveTextContent({ content: 'text', localPath: '/tmp/whatever.tex' })
    ).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' })
  })

  test('passes inline content through untouched, including empty content', async () => {
    await expect(resolveTextContent({ content: '' })).resolves.toBe('')
    await expect(resolveTextContent({ content: '\\section{One}' })).resolves.toBe(
      '\\section{One}'
    )
  })

  test('reads UTF-8 files and strips a byte order mark', async () => {
    const path = await scratchFile('main.tex', '\uFEFF\\section{Ünïcode}\n')
    await expect(resolveTextContent({ localPath: path })).resolves.toBe(
      '\\section{Ünïcode}\n'
    )
  })

  test('rejects binary content instead of writing replacement characters', async () => {
    const path = await scratchFile('plot.png', new Uint8Array([0x89, 0x50, 0xff, 0xfe]))
    await expect(resolveTextContent({ localPath: path })).rejects.toMatchObject({
      code: 'INVALID_ARGUMENT',
    })
  })

  test('reports a missing file as NOT_FOUND', async () => {
    await expect(
      resolveTextContent({ localPath: '/nonexistent/overleaf-web-mcp/main.tex' })
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })
})
