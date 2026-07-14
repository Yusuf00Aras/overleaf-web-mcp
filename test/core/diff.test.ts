import { describe, expect, test } from 'vitest'

import { applyTextEdit, createMinimalTextEdit } from '../../src/core/diff.js'

describe('minimal text diff', () => {
  test('returns no edit when content is unchanged', () => {
    expect(createMinimalTextEdit('same', 'same')).toBeNull()
  })

  test('preserves the common prefix and suffix', () => {
    const edit = createMinimalTextEdit('alpha middle omega', 'alpha revised omega')

    expect(edit).toEqual({ position: 6, deleteText: 'middle', insertText: 'revised' })
    expect(applyTextEdit('alpha middle omega', edit)).toBe('alpha revised omega')
  })

  test('does not split surrogate pairs', () => {
    const before = 'A😀B'
    const edit = createMinimalTextEdit(before, 'A😎B')
    if (!edit) throw new Error('expected a text edit')

    expect(applyTextEdit(before, edit)).toBe('A😎B')
    expect(edit.position).toBe(1)
    expect(edit.deleteText).toBe('😀')
  })
})
