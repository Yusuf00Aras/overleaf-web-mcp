import { describe, expect, test, vi } from 'vitest'

import { AccountApi } from '../../src/overleaf/account.js'

describe('account API', () => {
  test('normalizes and sorts the project list', async () => {
    const http = {
      getJson: vi.fn(async () => ({
        projects: [
          { _id: 'b', name: 'Zulu', accessLevel: 'readOnly' },
          { _id: 'a', name: 'Alpha', accessLevel: 'owner' },
        ],
      })),
    }
    const api = new AccountApi(http)

    await expect(api.listProjects()).resolves.toEqual([
      { id: 'a', name: 'Alpha', accessLevel: 'owner' },
      { id: 'b', name: 'Zulu', accessLevel: 'readOnly' },
    ])
    expect(http.getJson).toHaveBeenCalledWith('/user/projects')
  })
})
