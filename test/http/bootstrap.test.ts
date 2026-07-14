import { describe, expect, test } from 'vitest'

import { parseBootstrapMeta } from '../../src/http/bootstrap.js'

describe('Overleaf bootstrap metadata', () => {
  test('extracts CSRF, user ID, and numeric editor limits without an HTML DOM', () => {
    const html = `<!doctype html><html><head>
      <meta content="csrf&amp;token" name="ol-csrfToken">
      <meta name="ol-user_id" content="user-id">
      <meta name="ol-maxDocLength" data-type="json" content="2097152">
    </head></html>`

    expect(parseBootstrapMeta(html)).toEqual({
      csrfToken: 'csrf&token',
      userId: 'user-id',
      maxDocLength: 2_097_152,
    })
  })
})
