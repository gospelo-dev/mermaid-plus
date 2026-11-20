import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { mermaidBlocks } from '@gospelo/mermaid-arch'
import { buildThemePrompt, deriveLightTint, normalizeAccent, processMarkdown, usesIcons } from '../src/index.ts'

test('normalizeAccent', () => {
  assert.equal(normalizeAccent("'0d9488'"), '#0D9488')
  assert.equal(normalizeAccent(' "#abcdef" '), '#ABCDEF')
  assert.equal(normalizeAccent('#abcde'), null)
  assert.equal(normalizeAccent('red'), null)
})

test('deriveLightTint keeps grey neutral', () => {
  assert.equal(deriveLightTint('#808080'), '#F9F9F9')
})

const ICON_DOC = '```mermaid\nflowchart LR\n  fn@{ icon: "aws:lambda", label: "Fn" } --> db@{ icon: "aws:dynamodb" }\n```\n'

test('icon rules appear only when blocks use icons', () => {
  const plain = mermaidBlocks('```mermaid\ngraph LR\n  A --> B\n```\n', 'a.md')
  const icons = mermaidBlocks(ICON_DOC, 'b.md')
  const arch = mermaidBlocks('```mermaid\narchitecture-beta\n  service s(aws:lambda)[S]\n```\n', 'c.md')
  assert.equal(usesIcons(plain), false)
  assert.equal(usesIcons(icons), true)
  assert.equal(usesIcons(arch), true)
  assert.doesNotMatch(buildThemePrompt('a.md', 'S', plain), /## Icon nodes/)
  assert.match(buildThemePrompt('b.md', 'S', icons), /## Icon nodes/)
})

test('icon category colors are listed', () => {
  const blocks = mermaidBlocks(ICON_DOC, 'b.md')
  const iconColors = new Map([
    ['lambda', { category: 'compute', color: '#ED7100' }],
    ['dynamodb', { category: 'databases', color: '#C925D1' }],
  ])
  const prompt = buildThemePrompt('b.md', 'S', blocks, { iconColors })
  assert.match(prompt, /\| `aws:dynamodb` \| databases \| #C925D1 \|\n\| `aws:lambda` \| compute \| #ED7100 \|/)
})

test('a block that fails to render is kept and counted', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mermaid-plus-unit-'))
  const md = path.join(dir, 'doc.md')
  const doc = '```mermaid\ngraph LR\n  A --> B\n```\n\n```mermaid\nnot a diagram\n```\n'
  fs.writeFileSync(md, doc)
  let n = 0
  const renderer = {
    async render() {
      if (n++ === 0) throw new Error('parse error') // last block first
      return { images: [{ png: new Uint8Array([1]), width: 1, height: 1 }], browser: { path: '', source: '' } }
    },
    async close() {},
  }
  const warnings = []
  const result = await processMarkdown(md, { renderer, log: () => {}, warn: (l) => warnings.push(l) })
  assert.deepEqual(result, { blocks: 2, converted: 1, failed: 1 })
  const out = fs.readFileSync(md, 'utf8')
  assert.match(out, /^!\[diagram\]\(images\/doc-1\.png\)/)
  assert.match(out, /```mermaid\nnot a diagram\n```\n$/)
  assert.ok(warnings.some((w) => w.includes('parse error')))
})

test('unclosed block is an error', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mermaid-plus-unit-'))
  const md = path.join(dir, 'doc.md')
  fs.writeFileSync(md, '```mermaid\ngraph LR\n')
  await assert.rejects(processMarkdown(md, { log: () => {} }), { code: 'unclosed-mermaid-block' })
})
