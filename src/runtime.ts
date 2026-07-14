import type { AppConfig } from './config.js'
import { AUTH_LOGIN_INSTRUCTION, McpError } from './core/errors.js'
import { parseBootstrapMeta } from './http/bootstrap.js'
import { OverleafHttpClient } from './http/client.js'
import { CookieStore } from './http/cookies.js'
import type { OverleafToolRuntime } from './mcp/tools.js'
import { AccountApi } from './overleaf/account.js'
import { CommentsApi } from './overleaf/comments.js'
import { CompileApi } from './overleaf/compile.js'
import { DocumentsApi } from './overleaf/documents.js'
import { EntitiesApi } from './overleaf/entities.js'
import { SectionsApi } from './overleaf/sections-api.js'
import { resolveProjectPath } from './overleaf/tree.js'
import { ProjectConnectionCache } from './protocol/connection-cache.js'
import { openProjectConnection } from './protocol/connect.js'
import type { ProjectConnection } from './protocol/project-connection.js'

type Fetcher = (input: string | URL | Request, init?: RequestInit) => Promise<Response>

export interface RuntimeDependencies {
  fetcher?: Fetcher
  connectionFactory?: (projectId: string) => Promise<ProjectConnection>
}

/**
 * Composes authenticated HTTP, cached collaboration sockets, and the domain APIs used by MCP tools.
 * Callers must close the runtime so cached sockets do not outlive the server process.
 */
export class OverleafRuntime implements OverleafToolRuntime {
  readonly config: AppConfig
  readonly cookieStore: CookieStore
  readonly http: OverleafHttpClient
  readonly account: AccountApi
  readonly entities: EntitiesApi
  readonly documents: DocumentsApi
  readonly sections: SectionsApi
  readonly compile: CompileApi
  readonly comments: CommentsApi
  readonly connections: ProjectConnectionCache<ProjectConnection>
  readonly userId?: string

  private constructor(options: {
    config: AppConfig
    cookieStore: CookieStore
    http: OverleafHttpClient
    account: AccountApi
    entities: EntitiesApi
    documents: DocumentsApi
    sections: SectionsApi
    compile: CompileApi
    comments: CommentsApi
    connections: ProjectConnectionCache<ProjectConnection>
    userId?: string
  }) {
    this.config = options.config
    this.cookieStore = options.cookieStore
    this.http = options.http
    this.account = options.account
    this.entities = options.entities
    this.documents = options.documents
    this.sections = options.sections
    this.compile = options.compile
    this.comments = options.comments
    this.connections = options.connections
    if (options.userId !== undefined) this.userId = options.userId
  }

  static async create(
    config: AppConfig,
    dependencies: RuntimeDependencies = {}
  ): Promise<OverleafRuntime> {
    const cookieStore = await CookieStore.load(config.cookieJarFile)
    const csrf = { token: undefined as string | undefined }
    const http = new OverleafHttpClient({
      baseUrl: config.baseUrl,
      jar: cookieStore.jar,
      defaultTimeoutMs: config.requestTimeoutMs,
      csrfToken: () => csrf.token,
      persistSetCookies: async (url, values) => await cookieStore.mergeSetCookies(url, values),
      ...(dependencies.fetcher === undefined ? {} : { fetcher: dependencies.fetcher }),
    })

    const bootstrapResponse = await http.request('GET', '/project')
    const bootstrap = parseBootstrapMeta(await bootstrapResponse.text())
    csrf.token = bootstrap.csrfToken
    if (!csrf.token) {
      throw new McpError(
        'AUTH_EXPIRED',
        `Overleaf did not expose an authenticated CSRF token. ${AUTH_LOGIN_INSTRUCTION}`
      )
    }

    // Sockets are cached per project, while each document is freshly joined inside its queued call.
    const factory = dependencies.connectionFactory ?? (async (projectId: string) =>
      await openProjectConnection({
        baseUrl: config.baseUrl,
        projectId,
        jar: cookieStore.jar,
        supportedProtocolVersions: config.supportedProtocolVersions,
        timeoutMs: config.requestTimeoutMs,
        applyTimeoutMs: config.applyTimeoutMs,
        ...(bootstrap.userId === undefined ? {} : { currentUserId: bootstrap.userId }),
        ...(dependencies.fetcher === undefined ? {} : { fetcher: dependencies.fetcher }),
      }))
    const connections = new ProjectConnectionCache<ProjectConnection>({
      capacity: config.socketCacheSize,
      idleTtlMs: config.socketIdleTtlMs,
      factory,
    })
    const account = new AccountApi(http)
    const documents = new DocumentsApi(connections, {
      maxDocLength: bootstrap.maxDocLength ?? config.maxDocLength,
      maxUpdateChars: config.maxUpdateChars,
      recoveryTimeoutMs: config.recoveryTimeoutMs,
    })
    const entities = new EntitiesApi(http, connections)
    const sections = new SectionsApi(documents)
    const compile = new CompileApi(
      http,
      async (projectId, path, type) => {
        await connections.invalidate(projectId)
        return await connections.withConnection(projectId, async connection =>
          await connection.queue.run(() => resolveProjectPath(connection.getTree(), path, type))
        )
      },
      config.compileTimeoutMs
    )
    const comments = new CommentsApi(http, connections, {
      maxUpdateChars: config.maxUpdateChars,
      recoveryTimeoutMs: config.recoveryTimeoutMs,
      ...(bootstrap.userId === undefined ? {} : { currentUserId: bootstrap.userId }),
    })

    return new OverleafRuntime({
      config,
      cookieStore,
      http,
      account,
      entities,
      documents,
      sections,
      compile,
      comments,
      connections,
      ...(bootstrap.userId === undefined ? {} : { userId: bootstrap.userId }),
    })
  }

  async authStatus(): Promise<{
    authenticated: true
    baseUrl: string
    userId?: string
    projectCount: number
    permissionsUnchecked: boolean
    warning?: string
    socketPresenceNotice: string
  }> {
    const projects = await this.account.listProjects()
    return {
      authenticated: true,
      baseUrl: this.config.baseUrl,
      ...(this.userId === undefined ? {} : { userId: this.userId }),
      projectCount: projects.length,
      permissionsUnchecked: this.cookieStore.permissions.permissionsUnchecked,
      ...(this.cookieStore.permissions.warning === undefined
        ? {}
        : { warning: this.cookieStore.permissions.warning }),
      socketPresenceNotice:
        'An active cached project socket can make this account appear online to collaborators until the idle timeout.',
    }
  }

  async createFile(projectId: string, filePath: string, content = ''): Promise<unknown> {
    await this.entities.createEmptyFile(projectId, filePath)
    const created = await this.documents.readFile(projectId, filePath)
    if (content !== '') {
      return await this.documents.writeFile(projectId, filePath, created.revision, content)
    }
    return {
      revision: created.revision,
      protocol: created.protocol,
      trackChangesActive: created.trackChangesActive,
      writeMode: 'untracked' as const,
    }
  }

  async close(): Promise<void> {
    await this.connections.closeAll()
  }
}
