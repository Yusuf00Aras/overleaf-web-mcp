import { z } from 'zod'

import { asMcpError, McpError } from '../core/errors.js'
import { resolveTextContent } from '../core/local-file.js'
import {
  DEFAULT_PROJECT_LIMIT,
  MAX_PROJECT_LIMIT,
  type AccountApi,
  type ListProjectsOptions,
} from '../overleaf/account.js'
import type { AddCommentInput, CommentsApi } from '../overleaf/comments.js'
import type { CompileApi } from '../overleaf/compile.js'
import type { DocumentsApi, WriteMode } from '../overleaf/documents.js'
import type { EntitiesApi, EntityAction } from '../overleaf/entities.js'
import type { HistoryApi } from '../overleaf/history.js'
import type { SectionsApi } from '../overleaf/sections-api.js'

export const TOOL_NAMES = [
  'auth_status',
  'list_projects',
  'get_project_tree',
  'read_file',
  'write_file',
  'create_file',
  'manage_entity',
  'upload_file',
  'download_file',
  'get_sections',
  'get_section_content',
  'write_section',
  'compile_project',
  'stop_compile',
  'list_comments',
  'reply_to_comment',
  'add_comment',
  'set_comment_status',
  'monitor_project_history',
] as const

export interface OverleafToolRuntime {
  authStatus(): Promise<unknown>
  account: Pick<AccountApi, 'listProjects'>
  entities: Pick<
    EntitiesApi,
    'getProjectTree' | 'manageEntity' | 'uploadFile' | 'downloadFile'
  >
  documents: Pick<DocumentsApi, 'readFile' | 'writeFile'>
  createFile(
    projectId: string,
    filePath: string,
    content?: string,
    writeMode?: WriteMode
  ): Promise<unknown>
  sections: Pick<SectionsApi, 'getSections' | 'getSectionContent' | 'writeSection'>
  compile: Pick<CompileApi, 'compileProject' | 'stopCompile'>
  comments: Pick<
    CommentsApi,
    'listComments' | 'replyToComment' | 'addComment' | 'setCommentStatus'
  >
  history: Pick<HistoryApi, 'monitorProjectHistory'>
}

interface ToolRegistrar {
  registerTool(
    name: string,
    config: Record<string, unknown>,
    handler: (args: any) => Promise<Record<string, unknown>>
  ): unknown
}

const projectId = z.string().min(1).describe('Overleaf project ID')
const filePath = z.string().min(1).describe('Project-relative path using forward slashes')
const revision = z.string().min(1).describe('Opaque revision returned by a prior read or write')
const writeMode = z.enum(['untracked', 'tracked']).default('untracked').describe(
  'Use tracked to record inserted and deleted text as Overleaf tracked changes; defaults to untracked'
)
const position = z.object({
  line: z.number().int().positive(),
  column: z.number().int().positive(),
})

function success(value: unknown): Record<string, unknown> {
  return {
    content: [{ type: 'text', text: JSON.stringify(value, null, 2) }],
  }
}

function failure(error: unknown): Record<string, unknown> {
  const normalized = asMcpError(error)
  return {
    isError: true,
    content: [{ type: 'text', text: JSON.stringify(normalized.toJSON(), null, 2) }],
  }
}

function handler<T>(operation: (args: T) => Promise<unknown>): (args: T) => Promise<Record<string, unknown>> {
  return async args => {
    try {
      return success(await operation(args))
    } catch (error) {
      return failure(error)
    }
  }
}

/**
 * Like `handler`, for tools that declare an `outputSchema`: the result is returned both as
 * `structuredContent` and as the JSON text block older clients read.
 */
function structured<T>(
  operation: (args: T) => Promise<Record<string, unknown>>
): (args: T) => Promise<Record<string, unknown>> {
  return async args => {
    try {
      const value = await operation(args)
      return { ...success(value), structuredContent: value }
    } catch (error) {
      return failure(error)
    }
  }
}

const projectSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  accessLevel: z.string(),
  lastUpdated: z.string().optional(),
  archived: z.boolean(),
  trashed: z.boolean(),
})

export function registerOverleafTools(server: ToolRegistrar, runtime: OverleafToolRuntime): void {
  server.registerTool(
    'auth_status',
    {
      description: 'Verify the saved Overleaf web session without exposing cookies.',
      annotations: { readOnlyHint: true },
    },
    handler(async () => await runtime.authStatus())
  )
  server.registerTool(
    'list_projects',
    {
      description:
        'List the projects the account can access, newest first by default. Archived and trashed projects are hidden unless includeArchived or includeTrashed is set. Returns projects with id, name, accessLevel, lastUpdated, archived, and trashed, plus totalMatched (before limit) and totalProjects (everything the account can access).',
      inputSchema: {
        query: z
          .string()
          .min(1)
          .optional()
          .describe('Case-insensitive substring of the project name'),
        includeArchived: z.boolean().default(false),
        includeTrashed: z.boolean().default(false),
        limit: z
          .number()
          .int()
          .min(1)
          .max(MAX_PROJECT_LIMIT)
          .default(DEFAULT_PROJECT_LIMIT)
          .describe(`Maximum projects returned, at most ${MAX_PROJECT_LIMIT}`),
        sort: z
          .enum(['lastUpdated', 'name'])
          .default('lastUpdated')
          .describe('lastUpdated is newest first; name is alphabetical'),
      },
      outputSchema: {
        projects: z.array(projectSummarySchema),
        totalMatched: z.number().int(),
        totalProjects: z.number().int(),
      },
      annotations: { readOnlyHint: true },
    },
    structured(async (args: ListProjectsOptions) => ({
      ...(await runtime.account.listProjects(args)),
    }))
  )
  server.registerTool(
    'get_project_tree',
    {
      description:
        'Return the project file/folder tree with entity IDs and paths, plus the root document, compiler, and TeX Live image Overleaf compiles with. Each binary file entity carries hash, a git blob hash equal to `git hash-object <file>`; text documents have no hash and must be compared by reading their content.',
      inputSchema: { projectId },
      annotations: { readOnlyHint: true },
    },
    handler(async ({ projectId }: { projectId: string }) =>
      await runtime.entities.getProjectTree(projectId)
    )
  )
  server.registerTool(
    'read_file',
    {
      description: 'Read a text document as LF-normalized content and return its opaque revision.',
      inputSchema: { projectId, filePath },
      annotations: { readOnlyHint: true },
    },
    handler(async (args: { projectId: string; filePath: string }) =>
      await runtime.documents.readFile(args.projectId, args.filePath)
    )
  )
  server.registerTool(
    'write_file',
    {
      description:
        'Replace a text document using a minimal verified OT edit, optionally recorded as tracked changes. Supply the new text either inline through content or from disk through localPath, never both; localPath keeps a whole-file replacement revision-checked without sending the file through the tool call.',
      inputSchema: {
        projectId,
        filePath,
        revision,
        content: z.string().optional().describe('Complete replacement text, mutually exclusive with localPath'),
        localPath: z
          .string()
          .min(1)
          .optional()
          .describe('Local UTF-8 text file holding the complete replacement, mutually exclusive with content'),
        writeMode,
      },
      annotations: { destructiveHint: true, idempotentHint: false },
    },
    handler(async (args: {
      projectId: string
      filePath: string
      revision: string
      content?: string
      localPath?: string
      writeMode: WriteMode
    }) =>
      await runtime.documents.writeFile(
        args.projectId,
        args.filePath,
        args.revision,
        await resolveTextContent(args),
        args.writeMode
      )
    )
  )
  server.registerTool(
    'create_file',
    {
      description:
        'Create a text document and optionally record non-empty initial content as tracked changes.',
      inputSchema: { projectId, filePath, content: z.string().optional(), writeMode },
      annotations: { destructiveHint: false, idempotentHint: false },
    },
    handler(async (args: {
      projectId: string
      filePath: string
      content?: string
      writeMode: WriteMode
    }) =>
      await runtime.createFile(args.projectId, args.filePath, args.content, args.writeMode)
    )
  )
  server.registerTool(
    'manage_entity',
    {
      description:
        'Create a folder, rename, move, or delete an entity. Deletion requires confirmPath to exactly equal path.',
      inputSchema: {
        projectId,
        action: z.enum(['create_folder', 'rename', 'move', 'delete']),
        path: filePath,
        newName: z.string().min(1).optional(),
        destinationFolderPath: z.string().optional(),
        confirmPath: z.string().optional(),
      },
      annotations: { destructiveHint: true, idempotentHint: false },
    },
    handler(async (args: {
      projectId: string
      action: EntityAction['action']
      path: string
      newName?: string
      destinationFolderPath?: string
      confirmPath?: string
    }) => {
      let action: EntityAction
      if (args.action === 'create_folder') action = { action: args.action, path: args.path }
      else if (args.action === 'rename' && args.newName !== undefined) {
        action = { action: args.action, path: args.path, newName: args.newName }
      } else if (args.action === 'move' && args.destinationFolderPath !== undefined) {
        action = {
          action: args.action,
          path: args.path,
          destinationFolderPath: args.destinationFolderPath,
        }
      } else if (args.action === 'delete' && args.confirmPath !== undefined) {
        action = { action: args.action, path: args.path, confirmPath: args.confirmPath }
      } else {
        throw new McpError('INVALID_ARGUMENT', `Missing fields for ${args.action}.`)
      }
      return await runtime.entities.manageEntity(args.projectId, action)
    })
  )
  server.registerTool(
    'upload_file',
    {
      description:
        'Upload a local file into a project folder, replacing any entity already at that path in place and keeping its entity ID. Works for text documents as well as binaries; Overleaf decides which by extension and UTF-8 validity. Replacing a document this way is a blind write with no revision check that is never tracked, so prefer write_file when a collaborator may be editing.',
      inputSchema: {
        projectId,
        localPath: z.string().min(1),
        destinationFolderPath: z.string().default(''),
        destinationName: z
          .string()
          .min(1)
          .optional()
          .describe('Name to store the file under; defaults to the local file name'),
      },
      annotations: { destructiveHint: true, idempotentHint: false },
    },
    handler(async (args: {
      projectId: string
      localPath: string
      destinationFolderPath: string
      destinationName?: string
    }) =>
      await runtime.entities.uploadFile(
        args.projectId,
        args.localPath,
        args.destinationFolderPath,
        args.destinationName
      )
    )
  )
  server.registerTool(
    'download_file',
    {
      description:
        'Download one Overleaf document or binary file to an explicit local path. Refuses to replace an existing local file unless overwrite is set.',
      inputSchema: {
        projectId,
        filePath,
        localPath: z.string().min(1),
        overwrite: z.boolean().default(false).describe('Replace localPath if it already exists'),
      },
      annotations: { readOnlyHint: true },
    },
    handler(async (args: {
      projectId: string
      filePath: string
      localPath: string
      overwrite: boolean
    }) =>
      await runtime.entities.downloadFile(
        args.projectId,
        args.filePath,
        args.localPath,
        args.overwrite
      )
    )
  )
  server.registerTool(
    'get_sections',
    {
      description:
        'Parse LaTeX section headings in one file only; this never follows input/include directives.',
      inputSchema: { projectId, filePath },
      annotations: { readOnlyHint: true },
    },
    handler(async (args: { projectId: string; filePath: string }) =>
      await runtime.sections.getSections(args.projectId, args.filePath)
    )
  )
  server.registerTool(
    'get_section_content',
    {
      description: 'Read one parsed section body from a single file.',
      inputSchema: { projectId, filePath, sectionId: z.string().min(1) },
      annotations: { readOnlyHint: true },
    },
    handler(async (args: { projectId: string; filePath: string; sectionId: string }) =>
      await runtime.sections.getSectionContent(args.projectId, args.filePath, args.sectionId)
    )
  )
  server.registerTool(
    'write_section',
    {
      description:
        'Replace one section body in a single file using a revision-checked write, optionally recorded as tracked changes. Included files are not traversed.',
      inputSchema: {
        projectId,
        filePath,
        revision,
        sectionId: z.string().min(1),
        content: z.string(),
        writeMode,
      },
      annotations: { destructiveHint: true, idempotentHint: false },
    },
    handler(async (args: {
      projectId: string
      filePath: string
      revision: string
      sectionId: string
      content: string
      writeMode: WriteMode
    }) =>
      await runtime.sections.writeSection(
        args.projectId,
        args.filePath,
        args.revision,
        args.sectionId,
        args.content,
        args.writeMode
      )
    )
  )
  server.registerTool(
    'compile_project',
    {
      description:
        "Compile a project. Omit rootFilePath to build the root document configured in Overleaf, which is what the web UI's Recompile button uses; pass it to build a different document for this call only.",
      inputSchema: {
        projectId,
        rootFilePath: filePath.optional(),
        timeoutMs: z.number().int().min(1_000).max(15 * 60_000).optional(),
      },
      annotations: { destructiveHint: false, idempotentHint: false },
    },
    handler(async (args: { projectId: string; rootFilePath?: string; timeoutMs?: number }) =>
      await runtime.compile.compileProject(args.projectId, args.rootFilePath, args.timeoutMs)
    )
  )
  server.registerTool(
    'stop_compile',
    {
      description: 'Stop the active Overleaf compile for a project.',
      inputSchema: { projectId },
      annotations: { destructiveHint: true, idempotentHint: true },
    },
    handler(async ({ projectId }: { projectId: string }) =>
      await runtime.compile.stopCompile(projectId)
    )
  )
  server.registerTool(
    'list_comments',
    {
      description:
        'List reviewer-thread messages and lazily resolve document ranges. Defaults to open threads.',
      inputSchema: {
        projectId,
        filePath: z.string().min(1).optional(),
        status: z.enum(['open', 'resolved', 'all']).default('open'),
        author: z.string().min(1).optional(),
      },
      annotations: { readOnlyHint: true },
    },
    handler(async (args: {
      projectId: string
      filePath?: string
      status: 'open' | 'resolved' | 'all'
      author?: string
    }) =>
      await runtime.comments.listComments(args.projectId, {
        status: args.status,
        ...(args.filePath === undefined ? {} : { filePath: args.filePath }),
        ...(args.author === undefined ? {} : { author: args.author }),
      })
    )
  )
  server.registerTool(
    'reply_to_comment',
    {
      description: 'Reply to an existing Overleaf review thread with timeout deduplication.',
      inputSchema: { projectId, threadId: z.string().min(1), content: z.string().min(1) },
      annotations: { destructiveHint: false, idempotentHint: false },
    },
    handler(async (args: { projectId: string; threadId: string; content: string }) =>
      await runtime.comments.replyToComment(args.projectId, args.threadId, args.content)
    )
  )
  server.registerTool(
    'add_comment',
    {
      description:
        'Add and verify an anchored review comment using UTF-16 positions and expectedText.',
      inputSchema: {
        projectId,
        filePath,
        revision,
        start: position,
        end: position,
        expectedText: z.string().min(1),
        content: z.string().min(1),
      },
      annotations: { destructiveHint: false, idempotentHint: false },
    },
    handler(async (args: AddCommentInput) => await runtime.comments.addComment(args))
  )
  server.registerTool(
    'set_comment_status',
    {
      description: 'Resolve or reopen a review thread and verify its resulting document revision.',
      inputSchema: {
        projectId,
        filePath,
        revision,
        threadId: z.string().min(1),
        status: z.enum(['open', 'resolved']),
      },
      annotations: { destructiveHint: true, idempotentHint: true },
    },
    handler(async (args: {
      projectId: string
      filePath: string
      revision: string
      threadId: string
      status: 'open' | 'resolved'
    }) => await runtime.comments.setCommentStatus(args))
  )
  server.registerTool(
    'monitor_project_history',
    {
      description:
        'Poll one recent project-history window and return updates newer than an optional version cursor.',
      inputSchema: {
        projectId,
        sinceVersion: z.number().int().nonnegative().optional(),
      },
      annotations: { readOnlyHint: true },
    },
    handler(async (args: { projectId: string; sinceVersion?: number }) =>
      await runtime.history.monitorProjectHistory(args.projectId, args.sinceVersion)
    )
  )
}
