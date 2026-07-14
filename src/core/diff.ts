export interface TextEdit {
  position: number
  deleteText: string
  insertText: string
}

function isHighSurrogate(value: number): boolean {
  return value >= 0xd800 && value <= 0xdbff
}

function isLowSurrogate(value: number): boolean {
  return value >= 0xdc00 && value <= 0xdfff
}

export function createMinimalTextEdit(before: string, after: string): TextEdit | null {
  if (before === after) return null

  let prefix = 0
  const prefixLimit = Math.min(before.length, after.length)
  while (prefix < prefixLimit && before[prefix] === after[prefix]) prefix += 1
  // JavaScript offsets are UTF-16 code units; widen the edit rather than split an astral character.
  if (
    prefix > 0 &&
    (isHighSurrogate(before.charCodeAt(prefix - 1)) ||
      isHighSurrogate(after.charCodeAt(prefix - 1)))
  ) {
    prefix -= 1
  }

  let beforeEnd = before.length
  let afterEnd = after.length
  while (
    beforeEnd > prefix &&
    afterEnd > prefix &&
    before[beforeEnd - 1] === after[afterEnd - 1]
  ) {
    beforeEnd -= 1
    afterEnd -= 1
  }
  // The suffix boundary needs the corresponding low-surrogate guard.
  if (
    beforeEnd < before.length &&
    (isLowSurrogate(before.charCodeAt(beforeEnd)) ||
      isLowSurrogate(after.charCodeAt(afterEnd)))
  ) {
    beforeEnd += 1
    afterEnd += 1
  }

  return {
    position: prefix,
    deleteText: before.slice(prefix, beforeEnd),
    insertText: after.slice(prefix, afterEnd),
  }
}

export function applyTextEdit(content: string, edit: TextEdit | null): string {
  if (edit === null) return content
  const actual = content.slice(edit.position, edit.position + edit.deleteText.length)
  if (actual !== edit.deleteText) throw new Error('Delete text does not match content.')
  return (
    content.slice(0, edit.position) +
    edit.insertText +
    content.slice(edit.position + edit.deleteText.length)
  )
}
