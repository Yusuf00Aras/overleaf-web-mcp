import { createMinimalTextEdit } from '../core/diff.js'
import type { OtProtocol } from '../core/revision.js'

export interface RawRange {
  pos: number
  length: number
}

export interface HistorySnapshot {
  content: string
  comments?: Array<{ id: string; ranges: RawRange[]; resolved?: boolean }>
  trackedChanges?: Array<{
    range: RawRange
    tracking: { type: 'insert' | 'delete'; userId: string; ts: string }
  }>
}

export type ShareJsComponent = { p: number; i?: string; d?: string; c?: string; t?: string }
export type HistoryOperation = Record<string, unknown>

function deletedRanges(snapshot: HistorySnapshot): RawRange[] {
  return (snapshot.trackedChanges ?? [])
    .filter(change => change.tracking.type === 'delete')
    .map(change => change.range)
    .sort((left, right) => left.pos - right.pos)
}

export function historyVisibleContent(snapshot: HistorySnapshot): string {
  let cursor = 0
  let output = ''
  for (const range of deletedRanges(snapshot)) {
    output += snapshot.content.slice(cursor, range.pos)
    cursor = range.pos + range.length
  }
  return output + snapshot.content.slice(cursor)
}

/** Maps editor-visible UTF-16 offsets into snapshots that still contain tracked deletions. */
export function visibleToSnapshotOffset(snapshot: HistorySnapshot, visibleOffset: number): number {
  let deletedBefore = 0
  for (const range of deletedRanges(snapshot)) {
    const visiblePosition = range.pos - deletedBefore
    if (visibleOffset > visiblePosition) deletedBefore += range.length
    else break
  }
  return visibleOffset + deletedBefore
}

/** Maps raw history-OT offsets back into the editor view, collapsing tracked deletions. */
export function snapshotToVisibleOffset(snapshot: HistorySnapshot, snapshotOffset: number): number {
  let deletedBefore = 0
  for (const range of deletedRanges(snapshot)) {
    if (snapshotOffset < range.pos) break
    if (snapshotOffset < range.pos + range.length) return range.pos - deletedBefore
    deletedBefore += range.length
  }
  return snapshotOffset - deletedBefore
}

export function buildShareJsOperation(before: string, after: string): ShareJsComponent[] {
  const edit = createMinimalTextEdit(before, after)
  if (!edit) return []
  const op: ShareJsComponent[] = []
  if (edit.deleteText) op.push({ p: edit.position, d: edit.deleteText })
  if (edit.insertText) op.push({ p: edit.position, i: edit.insertText })
  return op
}

export function buildHistoryTextOperation(
  snapshot: HistorySnapshot,
  targetVisibleContent: string
): HistoryOperation[] {
  const visible = historyVisibleContent(snapshot)
  const edit = createMinimalTextEdit(visible, targetVisibleContent)
  if (!edit) return []
  const start = visibleToSnapshotOffset(snapshot, edit.position)
  const end = visibleToSnapshotOffset(snapshot, edit.position + edit.deleteText.length)
  const raw: Array<number | string> = []
  if (start > 0) raw.push(start)
  if (edit.insertText) raw.push(edit.insertText)
  if (end > start) raw.push(-(end - start))
  if (snapshot.content.length > end) raw.push(snapshot.content.length - end)
  return [{ textOperation: raw }]
}

export function buildCommentOperation(
  protocol: OtProtocol,
  threadId: string,
  start: number,
  end: number,
  selectedText: string
): Array<ShareJsComponent | HistoryOperation> {
  if (protocol === 'sharejs') return [{ p: start, c: selectedText, t: threadId }]
  return [{ commentId: threadId, ranges: [{ pos: start, length: end - start }] }]
}

export function buildStatusOperation(
  protocol: OtProtocol,
  threadId: string,
  resolved: boolean
): Array<HistoryOperation> {
  if (protocol === 'sharejs') return []
  return [{ commentId: threadId, resolved }]
}

export function makeUpdate(
  docId: string,
  version: number,
  operation: unknown[],
  protocol: OtProtocol,
  trackingMetadata?: Record<string, unknown>
): Record<string, unknown> {
  if (protocol !== 'sharejs' && protocol !== 'history-ot') {
    throw new TypeError('Unsupported OT protocol.')
  }
  return {
    doc: docId,
    v: version,
    op: operation,
    // V1 callers omit metadata for untracked writes; the hook preserves a future tracked-write path.
    ...(trackingMetadata === undefined ? {} : { meta: trackingMetadata }),
  }
}
