import { McpError } from '../core/errors.js'
import { findSections, replaceSection, type LatexSection } from '../core/sections.js'
import { normalizeLf } from '../core/text.js'
import type { ReadFileResult, WriteFileResult, WriteMode } from './documents.js'

interface SectionDocuments {
  readFile(projectId: string, filePath: string): Promise<ReadFileResult>
  writeFile(
    projectId: string,
    filePath: string,
    revision: string,
    content: string,
    writeMode?: WriteMode
  ): Promise<WriteFileResult>
}

export class SectionsApi {
  readonly #documents: SectionDocuments

  constructor(documents: SectionDocuments) {
    this.#documents = documents
  }

  async getSections(
    projectId: string,
    filePath: string
  ): Promise<{ sections: LatexSection[]; revision: string; singleFileOnly: true }> {
    const file = await this.#documents.readFile(projectId, filePath)
    return {
      sections: findSections(file.content),
      revision: file.revision,
      singleFileOnly: true,
    }
  }

  async getSectionContent(
    projectId: string,
    filePath: string,
    sectionId: string
  ): Promise<{ content: string; section: LatexSection; revision: string }> {
    const file = await this.#documents.readFile(projectId, filePath)
    const section = findSections(file.content).find(candidate => candidate.id === sectionId)
    if (!section) throw new McpError('NOT_FOUND', `Section ${sectionId} was not found.`)
    return {
      content: file.content.slice(section.bodyStart, section.end),
      section,
      revision: file.revision,
    }
  }

  async writeSection(
    projectId: string,
    filePath: string,
    revision: string,
    sectionId: string,
    content: string,
    writeMode: WriteMode = 'untracked'
  ): Promise<WriteFileResult> {
    const file = await this.#documents.readFile(projectId, filePath)
    const updated = replaceSection(file.content, sectionId, normalizeLf(content))
    return await this.#documents.writeFile(projectId, filePath, revision, updated, writeMode)
  }
}
