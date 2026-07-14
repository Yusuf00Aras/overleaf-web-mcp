import { describe, expect, test } from 'vitest'

import { findSections, replaceSection } from '../../src/core/sections.js'

const source = String.raw`% \section{Ignored}
\section[Short]{Introduction}
Intro text.
\begin{verbatim}
\section{Also ignored}
\end{verbatim}
\subsection*{Background}
Background text.
\input{details}
\section{Methods}
Methods text.
`

describe('single-file LaTeX sections', () => {
  test('parses balanced braces in long titles', () => {
    const [section] = findSections(String.raw`\section[Short]{First {Nested} Title}
Body
`)

    expect(section?.title).toBe('First {Nested} Title')
  })

  test('recognizes starred and optional-title headings outside ignored regions', () => {
    const sections = findSections(source)

    expect(sections.map(section => [section.command, section.starred, section.title])).toEqual([
      ['section', false, 'Introduction'],
      ['subsection', true, 'Background'],
      ['section', false, 'Methods'],
    ])
  })

  test('scopes a section through the next heading at the same or higher level', () => {
    const sections = findSections(source)
    expect(source.slice(sections[0]!.start, sections[0]!.end)).toContain(
      '\\subsection*{Background}'
    )
    expect(source.slice(sections[0]!.start, sections[0]!.end)).not.toContain(
      '\\section{Methods}'
    )
  })

  test('replaces a section by stable index without traversing input files', () => {
    const sectionId = findSections(source)[1]!.id
    const result = replaceSection(source, sectionId, 'New text.\n\\input{details}\n')
    expect(result).toContain('New text.')
    expect(result).toContain('\\input{details}')
    expect(result).toContain('\\section{Methods}')
  })
})
