import { describe, expect, test } from 'vitest'

import { gitBlobHash } from '../../src/core/hash.js'

const encoder = new TextEncoder()

describe('git blob hashes', () => {
  // Reference values produced by `git hash-object`, the format Overleaf stores for file entities.
  test('matches git hash-object rather than plain sha1', () => {
    expect(gitBlobHash(encoder.encode('hello\n'))).toBe(
      'ce013625030ba8dba906f756967f9e9ca394464a'
    )
    expect(gitBlobHash(encoder.encode(''))).toBe(
      'e69de29bb2d1d6434b8b29ae775ad8c2e48c5391'
    )
    expect(gitBlobHash(encoder.encode('\\documentclass{article}\n'))).toBe(
      'afc4251d1f586cdc80598e5234f602a8dd33433c'
    )
  })

  test('hashes raw bytes, so binary content is unaffected by text decoding', () => {
    expect(gitBlobHash(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x00, 0xff]))).toMatch(
      /^[0-9a-f]{40}$/u
    )
  })
})
