import { McpError } from '../core/errors.js'
import type { ProjectEntity } from './tree.js'

export interface JsonPoster {
  postJson(
    path: string,
    body?: unknown,
    options?: { timeoutMs?: number }
  ): Promise<unknown>
}

export interface CompileResult {
  status: string
  outputFiles: Array<Record<string, unknown>>
  clsiServerId?: string
  validationProblems?: unknown
}

export class CompileApi {
  readonly #http: JsonPoster
  readonly #resolvePath: (projectId: string, path: string, type: 'doc') => Promise<ProjectEntity>
  readonly #defaultTimeoutMs: number

  constructor(
    http: JsonPoster,
    resolvePath: (projectId: string, path: string, type: 'doc') => Promise<ProjectEntity>,
    defaultTimeoutMs = 120_000
  ) {
    this.#http = http
    this.#resolvePath = resolvePath
    this.#defaultTimeoutMs = defaultTimeoutMs
  }

  async compileProject(
    projectId: string,
    rootFilePath: string,
    timeoutMs = this.#defaultTimeoutMs
  ): Promise<CompileResult> {
    const boundedTimeout = Math.max(1_000, Math.min(timeoutMs, 15 * 60_000))
    const root = await this.#resolvePath(projectId, rootFilePath, 'doc')
    const result = await this.#http.postJson(
      `/project/${projectId}/compile`,
      {
        rootDoc_id: root.id,
        check: 'silent',
        incrementalCompilesEnabled: true,
      },
      { timeoutMs: boundedTimeout }
    ) as CompileResult
    if (result.status !== 'success') {
      throw new McpError('COMPILE_FAILED', `Overleaf compile finished with status ${result.status}.`, {
        details: { result },
      })
    }
    return result
  }

  async stopCompile(projectId: string): Promise<{ stopped: true }> {
    await this.#http.postJson(`/project/${projectId}/compile/stop`, {})
    return { stopped: true }
  }
}
