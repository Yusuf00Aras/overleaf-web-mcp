import { readFileSync } from 'node:fs'

import { describe, expect, test } from 'vitest'

import { SERVER_NAME, SERVER_VERSION, USER_AGENT } from '../src/version.js'

describe('package identity', () => {
  test('keeps MCP and transport identity aligned with package metadata', () => {
    const packageJson = JSON.parse(
      readFileSync(new URL('../package.json', import.meta.url), 'utf8')
    ) as { name: string; version: string }

    expect(SERVER_NAME).toBe(packageJson.name)
    expect(SERVER_VERSION).toBe(packageJson.version)
    expect(USER_AGENT).toBe(`${packageJson.name}/${packageJson.version}`)
  })
})
