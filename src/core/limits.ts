import { McpError } from './errors.js'

export function enforceDocumentLimit(content: string, maxDocLength: number): void {
  if (content.length >= maxDocLength) {
    throw new McpError(
      'DOC_TOO_LARGE',
      `The resulting document is ${content.length} UTF-16 code units; it must be smaller than ${maxDocLength}. Split the edit into smaller documents.`,
      { details: { actual: content.length, limit: maxDocLength } }
    )
  }
}

export function enforceUpdateLimit(serializedUpdate: string, maxUpdateChars: number): void {
  if (serializedUpdate.length > maxUpdateChars) {
    throw new McpError(
      'UPDATE_TOO_LARGE',
      `The serialized update is ${serializedUpdate.length} characters; the configured limit is ${maxUpdateChars}. Split the change into smaller write_file or write_section calls, using a fresh revision for each call.`,
      { details: { actual: serializedUpdate.length, limit: maxUpdateChars } }
    )
  }
}

export const assertDocumentSize = enforceDocumentLimit

export function assertUpdateSize(update: unknown, maxUpdateChars: number): void {
  enforceUpdateLimit(JSON.stringify(update), maxUpdateChars)
}
