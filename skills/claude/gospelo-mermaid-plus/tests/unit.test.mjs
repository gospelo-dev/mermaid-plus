import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { mermaidBlocks } from '@gospelo/mermaid-arch'
import {
  applyAccentToScheme, buildThemePrompt, DEFAULT_SCHEME, deriveGroupBorder, deriveLightTint, deriveNodeColors, hexToLab,
  normalizeAccent, processMarkdown, readScheme, usesIcons,
} from '../src/index.ts'

test('normalizeAccent', () => {
  assert.equal(normalizeAccent("'0d9488'"), '#0D9488')
  assert.equal(normalizeAccent(' "#abcdef" '), '#ABCDEF')
  assert.equal(normalizeAccent('#abcde'), null)
  assert.equal(normalizeAccent('red'), null)
})

test('deriveLightTint keeps grey neutral', () => {
  assert.equal(deriveLightTint('#808080'), '#F9F9F9')
})

test('deriveGroupBorder gives the default border back for its own hue', () => {
  assert.equal(deriveGroupBorder('#C7C7F1'), '#C7C7F1')
})

test('deriveGroupBorder keeps the lightness of the default border', () => {
  for (const accent of ['#0D9488', '#E11D48', '#2563EB', '#FACC15', '#808080']) {
    const [L] = hexToLab(deriveGroupBorder(accent))
    assert.ok(Math.abs(L - 81.48) < 0.6, `${accent} -> L* ${L}`)
  }
  const [, a, b] = hexToLab(deriveGroupBorder('#808080'))
  assert.ok(Math.hypot(a, b) < 0.5, 'grey stays neutral')
})

test('deriveNodeColors keeps the lightness of the default periwinkle colors', () => {
  for (const accent of ['#0D9488', '#E11D48', '#2563EB', '#808080']) {
    const { fill, border, text } = deriveNodeColors(accent)
    assert.ok(Math.abs(hexToLab(fill)[0] - 95.54) < 0.6, `${accent} fill ${fill}`)
    assert.ok(Math.abs(hexToLab(border)[0] - 74.62) < 0.6, `${accent} border ${border}`)
    assert.ok(Math.abs(hexToLab(text)[0] - 13.03) < 0.6, `${accent} text ${text}`)
  }
  const [, a, b] = hexToLab(deriveNodeColors('#808080').border)
  assert.ok(Math.hypot(a, b) < 0.5, 'grey stays neutral')
})

test('--accent recolors solid links, the group border and periwinkle nodes, not dashed links, text or icon nodes', () => {
  const scheme = applyAccentToScheme(readScheme(DEFAULT_SCHEME), '#E11D48')
  const border = deriveGroupBorder('#E11D48')
  const node = deriveNodeColors('#E11D48')
  assert.match(scheme, /linkStyle 0,1,2 stroke:#E11D48,stroke-width:2px/)
  assert.match(scheme, /linkStyle 3 {5}stroke:#2C2C2C,stroke-width:1\.5px,stroke-dasharray:4 4/)
  assert.ok(scheme.includes(`style Main fill:none,stroke:${border},stroke-width:2px,stroke-dasharray:8 8,color:#2C2C2C`))
  assert.ok(scheme.includes(`classDef node fill:${node.fill},stroke:${node.border},stroke-width:1.5px,color:${node.text}`))
  assert.ok(scheme.includes('classDef node fill:#FFFFFF,stroke:#666666,stroke-width:1.5px,color:#2C2C2C'), 'icon-diagram nodes stay white')
  assert.doesNotMatch(scheme, /#333333|#C7C7F1|#EEF2FF|#A5B4FC|#1E1B4B/i)
  assert.match(scheme, /Accent color — normal data\/control flow/)
  assert.match(scheme, /Light accent tint — diagrams without icons/)
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
