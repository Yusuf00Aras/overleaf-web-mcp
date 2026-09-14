import { describe, expect, test } from 'vitest'

import { parseCliCommand, renderHelp } from '../src/cli-command.js'

describe('CLI command routing', () => {
  test.each([
    [[], 'serve'],
    [['serve'], 'serve'],
    [['login'], 'login'],
    [['keepalive'], 'keepalive'],
    [['--help'], 'help'],
    [['-h'], 'help'],
  ] as const)('maps %j to %s', (argv, expected) => {
    expect(parseCliCommand([...argv])).toBe(expected)
  })

  test('rejects unknown commands with login discoverability', () => {
    expect(() => parseCliCommand(['unknown'])).toThrow(/login/u)
  })

  test('documents the server, browser login, and keepalive commands', () => {
    expect(renderHelp()).toContain('overleaf-web-mcp login')
    expect(renderHelp()).toContain('overleaf-web-mcp serve')
    expect(renderHelp()).toContain('overleaf-web-mcp keepalive')
  })
})
