import { readFile } from 'node:fs/promises'
import { basename } from 'node:path'

import { z } from 'zod'

import { McpError } from '../core/errors.js'
import type { EntityType, ProjectEntity, ProjectTree } from './tree.js'

interface ProjectsHttp {
  postJson(path: string, body?: unknown): Promise<unknown>
  deleteJson(path: string): Promise<unknown>
  postForm(path: string, form: FormData): Promise<unknown>
}

export interface ProjectsApiOptions {
  http: ProjectsHttp
  /** Origin the web UI lives at, used to build the `url` of created projects. */
  baseUrl: string
  findProject(projectId: string): Promise<{ name: string; archived: boolean; trashed: boolean }>
  resolvePath(projectId: string, path: string, type: EntityType): Promise<ProjectEntity>
  getProjectTree(projectId: string): Promise<ProjectTree>
  /** Drops the cached project socket, whose join snapshot holds the settings and name. */
  invalidate(projectId: string): Promise<void>
}

export const COMPILERS = ['pdflatex', 'latex', 'xelatex', 'lualatex'] as const
export type Compiler = (typeof COMPILERS)[number]

export type ProjectTemplate = 'blank' | 'example'

export type ProjectAction =
  | { action: 'rename'; newName: string }
  | { action: 'trash' | 'archive' | 'delete'; confirmName: string }
  | { action: 'restore' | 'unarchive' }

export interface ProjectSettingsInput {
  rootFilePath?: string | undefined
  compiler?: Compiler | undefined
  imageName?: string | undefined
  /** Overleaf language code, for example `en` or `de`; an empty string turns spell checking off. */
  spellCheckLanguage?: string | undefined
}

export interface CreatedProject {
  projectId: string
  name: string
  url: string
  /** Absent only if Overleaf created the project without a root document. */
  rootDocPath?: string
}

export interface ProjectSettings {
  projectId: string
  rootDocPath?: string
  compiler?: string
  imageName?: string
  spellCheckLanguage?: string
}

/** Overleaf's own limit on project names, enforced client-side to fail before the request. */
const MAX_PROJECT_NAME_LENGTH = 150

/** Overleaf reports zip import rejections as HTTP 422 with a machine-readable code. */
const ZIP_ERRORS: Record<string, string> = {
  invalid_zip_file: 'Overleaf could not read the archive as a zip file.',
  empty_zip_file: 'The zip archive contains no files Overleaf can import.',
  zip_contents_too_large: 'The extracted archive exceeds the project size Overleaf allows.',
  invalid_filename:
    'The archive holds a file name Overleaf rejects. Names are limited to 150 characters and may not use reserved names or path separators.',
  project_has_too_many_files: 'The archive holds more files than a project may contain.',
}

const createdProjectSchema = z.object({ project_id: z.string().min(1) })

function validateProjectName(name: string): void {
  if (name.trim() === '' || name.length > MAX_PROJECT_NAME_LENGTH || /[/\\]/u.test(name)) {
    throw new McpError(
      'INVALID_ARGUMENT',
      `Invalid project name. Names must be 1 to ${MAX_PROJECT_NAME_LENGTH} characters without slashes.`
    )
  }
}

function zipFailure(code: string | undefined): McpError {
  const detail = code === undefined ? undefined : ZIP_ERRORS[code]
  return new McpError(
    'INVALID_ARGUMENT',
    detail ?? 'Overleaf rejected the zip archive.',
    code === undefined ? {} : { details: { overleafError: code } }
  )
}

/**
 * Creates, clones, imports, renames, trashes, archives, deletes, and configures projects through
 * the same browser-facing routes the Overleaf web UI uses.
 *
 * Destructive actions follow Overleaf's own model: trash first, permanent delete only from the
 * trash, and both require the caller to repeat the project's current name.
 */
export class ProjectsApi {
  readonly #options: ProjectsApiOptions

  constructor(options: ProjectsApiOptions) {
    this.#options = options
  }

  #projectUrl(projectId: string): string {
    return `${this.#options.baseUrl}/project/${encodeURIComponent(projectId)}`
  }

  #parseCreated(response: unknown, what: string): string {
    try {
      return createdProjectSchema.parse(response).project_id
    } catch (error) {
      throw new McpError(
        'PROTOCOL_UNSUPPORTED',
        `Overleaf returned an unsupported ${what} response.`,
        { cause: error }
      )
    }
  }

  /**
   * Creates a project. "blank" is Overleaf's basic project, which still ships a stub `main.tex`
   * as the root document; callers importing their own root should point the project at it with
   * `updateProjectSettings` or delete the stub.
   */
  async createProject(name: string, template: ProjectTemplate = 'blank'): Promise<CreatedProject> {
    validateProjectName(name)
    const response = await this.#options.http.postJson('/project/new', {
      projectName: name,
      template: template === 'example' ? 'example' : 'none',
    })
    const projectId = this.#parseCreated(response, 'project creation')
    let tree: ProjectTree
    try {
      tree = await this.#options.getProjectTree(projectId)
    } catch (error) {
      // The project exists; hand back its id so the caller does not create a duplicate.
      throw new McpError(
        'REMOTE_ERROR',
        'The project was created but its tree could not be read. Call get_project_tree with the projectId in details.',
        { details: { projectId }, cause: error }
      )
    }
    return {
      projectId,
      name,
      url: this.#projectUrl(projectId),
      ...(tree.rootDocPath === undefined ? {} : { rootDocPath: tree.rootDocPath }),
    }
  }

  async cloneProject(sourceProjectId: string, name: string): Promise<CreatedProject> {
    validateProjectName(name)
    const response = await this.#options.http.postJson(
      `/Project/${encodeURIComponent(sourceProjectId)}/clone`,
      { projectName: name }
    )
    const projectId = this.#parseCreated(response, 'project clone')
    return { projectId, name, url: this.#projectUrl(projectId) }
  }

  /**
   * Imports a local zip archive as a new project. Overleaf rate-limits this route, so a
   * `RATE_LIMITED` error with `retryAfterMs` is expected under repeated use.
   */
  async importProjectZip(localZipPath: string, name?: string): Promise<CreatedProject> {
    const fileName = basename(localZipPath)
    if (!/\.zip$/iu.test(fileName)) {
      throw new McpError('INVALID_ARGUMENT', 'localZipPath must point to a .zip archive.')
    }
    const projectName = name ?? fileName.replace(/\.zip$/iu, '')
    validateProjectName(projectName)
    const bytes = await readFile(localZipPath).catch((error: unknown) => {
      throw new McpError('NOT_FOUND', `Local file could not be read: ${localZipPath}`, {
        cause: error,
      })
    })
    const form = new FormData()
    form.append('qqfile', new Blob([bytes], { type: 'application/zip' }), fileName)
    form.append('name', projectName)
    let response: unknown
    try {
      response = await this.#options.http.postForm('/project/new/upload', form)
    } catch (error) {
      if (error instanceof McpError) {
        const status = (error.details as { status?: number } | undefined)?.status
        if (status === 422) {
          throw zipFailure((error.details as { overleafError?: string }).overleafError)
        }
        if (error.code === 'UPDATE_TOO_LARGE') {
          throw new McpError(
            'UPDATE_TOO_LARGE',
            'The zip archive exceeds the upload size Overleaf allows (50 MB on overleaf.com).',
            { cause: error }
          )
        }
      }
      throw error
    }
    const body = response as { success?: boolean; error?: string } | null
    if (body?.success === false) throw zipFailure(body.error)
    const projectId = this.#parseCreated(response, 'project import')
    return { projectId, name: projectName, url: this.#projectUrl(projectId) }
  }

  async manageProject(
    projectId: string,
    input: ProjectAction
  ): Promise<{ action: ProjectAction['action']; projectId: string; name: string }> {
    const project = await this.#options.findProject(projectId)
    const id = encodeURIComponent(projectId)
    let name = project.name
    switch (input.action) {
      case 'rename':
        validateProjectName(input.newName)
        await this.#options.http.postJson(`/project/${id}/rename`, { newProjectName: input.newName })
        name = input.newName
        break
      case 'trash':
      case 'archive':
      case 'delete': {
        if (input.confirmName !== project.name) {
          throw new McpError(
            'CONFIRMATION_MISMATCH',
            `confirmName must exactly match the current project name before a project can be ${
              input.action === 'trash' ? 'trashed' : input.action === 'archive' ? 'archived' : 'deleted'
            }.`
          )
        }
        if (input.action === 'trash') await this.#options.http.postJson(`/project/${id}/trash`)
        else if (input.action === 'archive') await this.#options.http.postJson(`/Project/${id}/archive`)
        else {
          if (!project.trashed) {
            throw new McpError(
              'INVALID_ARGUMENT',
              'Permanent deletion requires the project to be trashed first. Use action "trash", then "delete".'
            )
          }
          await this.#options.http.deleteJson(`/Project/${id}`)
        }
        break
      }
      case 'restore':
        await this.#options.http.deleteJson(`/project/${id}/trash`)
        break
      case 'unarchive':
        await this.#options.http.deleteJson(`/Project/${id}/archive`)
        break
    }
    await this.#options.invalidate(projectId)
    return { action: input.action, projectId, name }
  }

  /**
   * Persists root document, compiler, TeX Live image, or spell-check language in the project's
   * own settings, so the web UI's Recompile follows the change too. Returns the settings as
   * re-read from a fresh project join.
   */
  async updateProjectSettings(
    projectId: string,
    settings: ProjectSettingsInput
  ): Promise<ProjectSettings> {
    const body: Record<string, string> = {}
    if (settings.rootFilePath !== undefined) {
      body.rootDocId = (await this.#options.resolvePath(projectId, settings.rootFilePath, 'doc')).id
    }
    if (settings.compiler !== undefined) body.compiler = settings.compiler
    if (settings.imageName !== undefined) body.imageName = settings.imageName
    if (settings.spellCheckLanguage !== undefined) {
      body.spellCheckLanguage = settings.spellCheckLanguage
    }
    if (Object.keys(body).length === 0) {
      throw new McpError(
        'INVALID_ARGUMENT',
        'Provide at least one of rootFilePath, compiler, imageName, or spellCheckLanguage.'
      )
    }
    await this.#options.http.postJson(`/project/${encodeURIComponent(projectId)}/settings`, body)
    // The cached join snapshot never learns about settings changes; re-join to report the truth.
    await this.#options.invalidate(projectId)
    const tree = await this.#options.getProjectTree(projectId)
    return {
      projectId,
      ...(tree.rootDocPath === undefined ? {} : { rootDocPath: tree.rootDocPath }),
      ...(tree.compiler === undefined ? {} : { compiler: tree.compiler }),
      ...(tree.imageName === undefined ? {} : { imageName: tree.imageName }),
      ...(tree.spellCheckLanguage === undefined
        ? {}
        : { spellCheckLanguage: tree.spellCheckLanguage }),
    }
  }
}
