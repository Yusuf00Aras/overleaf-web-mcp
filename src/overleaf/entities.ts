import { readFile, writeFile } from 'node:fs/promises'
import { basename, posix } from 'node:path'

import { McpError } from '../core/errors.js'
import type { FifoQueue } from '../core/queue.js'
import {
  normalizeProjectPath,
  parentPath,
  resolveProjectPath,
  type ProjectEntity,
} from './tree.js'

interface EntityHttp {
  postJson(path: string, body?: unknown): Promise<unknown>
  deleteJson(path: string): Promise<unknown>
  postForm(path: string, form: FormData): Promise<unknown>
  getBytes(path: string): Promise<Uint8Array>
}

interface TreeConnection {
  queue: FifoQueue
  getTree(): ProjectEntity[]
  rootFolderId: string
  trackChangesActive: boolean
}

interface EntityConnections {
  withConnection<T>(projectId: string, operation: (connection: TreeConnection) => Promise<T>): Promise<T>
  invalidate(projectId: string): Promise<void>
}

export type EntityAction =
  | { action: 'create_folder'; path: string }
  | { action: 'rename'; path: string; newName: string }
  | { action: 'move'; path: string; destinationFolderPath: string }
  | { action: 'delete'; path: string; confirmPath: string }

function endpointType(entity: ProjectEntity): string {
  return entity.type === 'file' ? 'file' : entity.type
}

function validateName(name: string): void {
  if (!name || name === '.' || name === '..' || name.includes('/') || name.includes('\\')) {
    throw new McpError('INVALID_ARGUMENT', `Invalid entity name: ${name}`)
  }
}

function resolveFolderId(connection: TreeConnection, path: string): string {
  if (path === '') return connection.rootFolderId
  return resolveProjectPath(connection.getTree(), path, 'folder').id
}

export class EntitiesApi {
  readonly #http: EntityHttp
  readonly #connections: EntityConnections

  constructor(http: EntityHttp, connections: EntityConnections) {
    this.#http = http
    this.#connections = connections
  }

  async getProjectTree(projectId: string): Promise<ProjectEntity[]> {
    return await this.#connections.withConnection(projectId, async connection =>
      await connection.queue.run(() => connection.getTree())
    )
  }

  async createEmptyFile(projectId: string, filePath: string): Promise<unknown> {
    const normalized = normalizeProjectPath(filePath)
    const name = posix.basename(normalized)
    validateName(name)
    const created = await this.#connections.withConnection(projectId, async connection =>
      await connection.queue.run(async () => {
        const parentFolderId = resolveFolderId(connection, parentPath(normalized))
        return await this.#http.postJson(`/project/${projectId}/doc`, {
          parent_folder_id: parentFolderId,
          name,
        })
      })
    )
    await this.#connections.invalidate(projectId)
    return created
  }

  async manageEntity(projectId: string, input: EntityAction): Promise<Record<string, unknown>> {
    const normalized = normalizeProjectPath(input.path)
    const result = await this.#connections.withConnection(projectId, async connection =>
      await connection.queue.run(async () => {
        if (input.action === 'create_folder') {
          const name = posix.basename(normalized)
          validateName(name)
          const parentFolderId = resolveFolderId(connection, parentPath(normalized))
          const created = await this.#http.postJson(`/project/${projectId}/folder`, {
            parent_folder_id: parentFolderId,
            name,
          })
          return {
            action: input.action,
            created,
            trackChangesActive: connection.trackChangesActive,
            writeMode: 'untracked',
          }
        }

        const entity = resolveProjectPath(connection.getTree(), normalized)
        const type = endpointType(entity)
        if (input.action === 'rename') {
          validateName(input.newName)
          await this.#http.postJson(`/project/${projectId}/${type}/${entity.id}/rename`, {
            name: input.newName,
          })
          return {
            action: input.action,
            id: entity.id,
            trackChangesActive: connection.trackChangesActive,
            writeMode: 'untracked',
          }
        }
        if (input.action === 'move') {
          const folderId = resolveFolderId(
            connection,
            input.destinationFolderPath === ''
              ? ''
              : normalizeProjectPath(input.destinationFolderPath)
          )
          await this.#http.postJson(`/project/${projectId}/${type}/${entity.id}/move`, {
            folder_id: folderId,
          })
          return {
            action: input.action,
            id: entity.id,
            trackChangesActive: connection.trackChangesActive,
            writeMode: 'untracked',
          }
        }
        if (normalizeProjectPath(input.confirmPath) !== normalized || input.confirmPath !== input.path) {
          throw new McpError(
            'INVALID_ARGUMENT',
            'confirmPath must exactly match path before an entity can be deleted.'
          )
        }
        await this.#http.deleteJson(`/project/${projectId}/${type}/${entity.id}`)
        return {
          action: input.action,
          id: entity.id,
          trackChangesActive: connection.trackChangesActive,
          writeMode: 'untracked',
        }
      })
    )
    await this.#connections.invalidate(projectId)
    return result
  }

  async uploadFile(
    projectId: string,
    localPath: string,
    destinationFolderPath = ''
  ): Promise<Record<string, unknown>> {
    const bytes = await readFile(localPath)
    const result = await this.#connections.withConnection(projectId, async connection =>
      await connection.queue.run(async () => {
        const folderId = resolveFolderId(
          connection,
          destinationFolderPath === '' ? '' : normalizeProjectPath(destinationFolderPath)
        )
        const form = new FormData()
        const name = basename(localPath)
        form.append('qqfile', new Blob([bytes]), name)
        form.append('name', name)
        const upload = await this.#http.postForm(
          `/project/${projectId}/upload?folder_id=${encodeURIComponent(folderId)}`,
          form
        )
        return {
          upload,
          trackChangesActive: connection.trackChangesActive,
          writeMode: 'untracked',
        }
      })
    )
    await this.#connections.invalidate(projectId)
    return result
  }

  async downloadFile(projectId: string, filePath: string, localPath: string): Promise<{ bytes: number }> {
    const bytes = await this.#connections.withConnection(projectId, async connection =>
      await connection.queue.run(async () => {
        const entity = resolveProjectPath(connection.getTree(), filePath)
        if (entity.type === 'folder') {
          throw new McpError('INVALID_ARGUMENT', 'Folders cannot be downloaded with download_file.')
        }
        const route =
          entity.type === 'doc'
            ? `/Project/${projectId}/doc/${entity.id}/download`
            : `/Project/${projectId}/file/${entity.id}`
        return await this.#http.getBytes(route)
      })
    )
    await writeFile(localPath, bytes)
    return { bytes: bytes.byteLength }
  }
}
