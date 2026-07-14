import { posix } from 'node:path'

import { McpError } from '../core/errors.js'

export type EntityType = 'doc' | 'file' | 'folder'

export interface RawEntity {
  _id: string
  name: string
  hash?: string
}

export interface RawFolder extends RawEntity {
  docs?: RawEntity[]
  fileRefs?: RawEntity[]
  folders?: RawFolder[]
}

export interface ProjectEntity {
  id: string
  name: string
  path: string
  type: EntityType
  parentFolderId: string
  hash?: string
}

export function normalizeProjectPath(path: string): string {
  const slashPath = path.replace(/\\/gu, '/')
  const normalized = posix.normalize(slashPath).replace(/^\.\//u, '').replace(/^\//u, '')
  if (
    !path ||
    path.startsWith('/') ||
    normalized === '..' ||
    normalized.startsWith('../') ||
    normalized.includes('/../')
  ) {
    throw new McpError('INVALID_ARGUMENT', `invalid project path: ${path}`)
  }
  return normalized
}

export function flattenProjectTree(input: RawFolder[] | RawFolder): ProjectEntity[] {
  const roots = Array.isArray(input) ? input : [input]
  const output: ProjectEntity[] = []

  const visit = (folder: RawFolder, prefix: string, includeFolder: boolean): void => {
    const folderPath = includeFolder ? normalizeProjectPath(posix.join(prefix, folder.name)) : prefix
    if (includeFolder) {
      output.push({
        id: folder._id,
        name: folder.name,
        path: folderPath,
        type: 'folder',
        parentFolderId: roots[0]?._id ?? folder._id,
      })
    }
    for (const doc of folder.docs ?? []) {
      output.push({
        id: doc._id,
        name: doc.name,
        path: normalizeProjectPath(posix.join(folderPath, doc.name)),
        type: 'doc',
        parentFolderId: folder._id,
      })
    }
    for (const file of folder.fileRefs ?? []) {
      output.push({
        id: file._id,
        name: file.name,
        path: normalizeProjectPath(posix.join(folderPath, file.name)),
        type: 'file',
        parentFolderId: folder._id,
        ...(file.hash === undefined ? {} : { hash: file.hash }),
      })
    }
    for (const child of folder.folders ?? []) visit(child, folderPath, true)
  }

  for (const root of roots) visit(root, '', false)
  return output
}

export function resolveProjectPath(
  tree: ProjectEntity[],
  path: string,
  expectedType?: EntityType
): ProjectEntity {
  const normalized = normalizeProjectPath(path)
  const entity = tree.find(candidate => candidate.path === normalized)
  if (!entity) throw new McpError('NOT_FOUND', `Project path was not found: ${normalized}`)
  if (expectedType && entity.type !== expectedType) {
    throw new McpError(
      'INVALID_ARGUMENT',
      `${normalized} is a ${entity.type}, not a ${expectedType}.`
    )
  }
  return entity
}

export function parentPath(path: string): string {
  const normalized = normalizeProjectPath(path)
  const parent = posix.dirname(normalized)
  return parent === '.' ? '' : parent
}
