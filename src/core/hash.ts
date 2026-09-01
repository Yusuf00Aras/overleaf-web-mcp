import { createHash } from 'node:crypto'

/**
 * Computes the git blob hash Overleaf stores for binary file entities.
 *
 * Overleaf's `FileHashManager` hashes `"blob " + byteLength + "\0" + content` with SHA-1,
 * which is byte-for-byte what `git hash-object <file>` produces. Plain `sha1sum` output
 * never matches, because it omits the header.
 *
 * Only binary `file` entities carry this hash. Overleaf stores no content hash for `doc`
 * entities, so text documents can only be compared by reading their content.
 */
export function gitBlobHash(content: Uint8Array): string {
  return createHash('sha1')
    .update(`blob ${content.byteLength}\0`, 'utf8')
    .update(content)
    .digest('hex')
}
