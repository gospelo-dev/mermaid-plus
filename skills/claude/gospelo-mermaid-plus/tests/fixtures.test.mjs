// The TS CLI gives the same results as the Python scripts it replaced.
// tests/fixtures/ holds their outputs, recorded before the scripts were
// removed (apply_theme.py, mermaid2png.py; mmdc stubbed out).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  deriveLightTint, lowContrastWarning, perceptualLightness, perceptualSaturation, processMarkdown,
} from '../src/index.ts'

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const FIXTURES = path.join(ROOT, 'tests/fixtures')
const CLI = path.join(ROOT, 'src/cli/main.ts')
const fixture = (name) => fs.readFileSync(path.join(FIXTURES, name), 'utf8')
const DOC = fixture('doc.md')
const THEME = JSON.parse(fixture('apply-theme.json'))
const M2P = JSON.parse(fixture('mermaid2png.json'))

function tmpdir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'mermaid-plus-fixtures-'))
}

test('CIELAB results match the recorded values', () => {
  for (const [c, tint, sat, light] of JSON.parse(fixture('cielab.json'))) {
    const got = [deriveLightTint(c), perceptualSaturation(c).toFixed(2), perceptualLightness(c).toFixed(2)]
    assert.deepEqual(got, [tint, sat, light], c)
  }
})

// The recorded prompts have the block headers reduced to "### Block N":
// Python printed code-point offsets, the TS CLI prints fence lines.
function withoutBlockHeaders(prompt) {
  return prompt.replace(/^### Block (\d+) \(.*\)$/gm, '### Block $1')
}

function applyTheme(extra) {
  const md = path.join(tmpdir(), 'doc.md')
  fs.writeFileSync(md, DOC)
  return spawnSync(process.execPath, [CLI, 'apply-theme', md, ...extra], { encoding: 'utf8' })
}

for (const accent of ['none', '#2563EB', "'7c3aed'", '#EEEEEE']) {
  test(`apply-theme prompt matches the recorded one (accent ${accent})`, () => {
    const ts = applyTheme(accent === 'none' ? [] : ['--accent', accent])
    const want = THEME[accent]
    assert.equal(ts.status, want.status)
    assert.equal(ts.stderr, want.stderr)
    assert.equal(withoutBlockHeaders(ts.stdout), want.stdout)
    assert.match(ts.stdout, /^### Block 1 \(lines 5–11\)$/m)
  })
}

test('apply-theme rejects a bad accent with the recorded error', () => {
  const ts = applyTheme(['--accent', '#12345'])
  const want = THEME['#12345']
  assert.equal(ts.status, want.status)
  assert.equal(ts.stderr, want.stderr)
})

test('low-contrast warning text', () => {
  assert.match(lowContrastWarning('#EEEEEE'), /^Warning: #EEEEEE has low contrast on white \(saturation=0\.00, lightness=0\.94\)/)
  assert.equal(lowContrastWarning('#0D9488'), null)
})

const fakeRenderer = {
  async render() {
    return { images: [{ png: new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), width: 1, height: 1 }], browser: { path: 'fake', source: 'fake' } }
  },
  async close() {},
}

async function run(doc, { dryRun = false, prepare = () => {} } = {}) {
  const dir = tmpdir()
  fs.writeFileSync(path.join(dir, 'doc.md'), doc)
  prepare(dir)
  const lines = []
  await processMarkdown(path.join(dir, 'doc.md'), { dryRun, renderer: fakeRenderer, log: (l) => lines.push(l), warn: () => {} })
  return {
    md: fs.readFileSync(path.join(dir, 'doc.md'), 'utf8'),
    images: fs.existsSync(path.join(dir, 'images')) ? fs.readdirSync(path.join(dir, 'images')).sort() : null,
    log: lines.join('\n') + '\n',
  }
}

test('mermaid2png rewrites Markdown as recorded', async () => {
  assert.deepEqual(await run(DOC), M2P.full)
})

test('mermaid2png single block uses <base>.png', async () => {
  const { input, ...want } = M2P.single
  assert.deepEqual(await run(input), want)
  assert.deepEqual(want.images, ['doc.png'])
})

// The Python version wrapped a converted block a second time, inside its
// own <details>, when the block's PNG was missing. Not recorded: fixed here.
test('second run skips converted blocks and re-renders a missing PNG in place', async () => {
  let dir
  const ts = await run(M2P.full.md, {
    prepare: (d) => {
      dir = d
      fs.mkdirSync(path.join(d, 'images'))
      fs.writeFileSync(path.join(d, 'images', 'doc-1.png'), 'x') // doc-2.png missing: re-render block 2
    },
  })
  assert.equal(ts.md, M2P.full.md) // no second fold
  assert.deepEqual(ts.images, ['doc-1.png', 'doc-2.png'])
  assert.equal(fs.readFileSync(path.join(dir, 'images', 'doc-1.png'), 'utf8'), 'x') // skipped
  assert.equal(ts.log, [
    'Found 2 mermaid block(s) in doc.md',
    '  Block 2: image missing, re-rendering → images/doc-2.png',
    '  Block 1: already converted, skipping',
    '',
    'Done: 1/2 block(s) converted.',
    '',
  ].join('\n'))
})

test('a missing PNG is written to the path the fold references', async () => {
  const md = M2P.single.md.replace('images/doc.png', 'img/custom name.png')
  let dir
  const ts = await run(md, { prepare: (d) => { dir = d } })
  assert.equal(ts.md, md)
  assert.ok(fs.statSync(path.join(dir, 'img', 'custom name.png')).isFile())
})

test('a plain block right after a converted one is rendered', async () => {
  const md = M2P.single.md + '\n```mermaid\ngraph TD\n  C --> D\n```\n'
  const ts = await run(md, {
    prepare: (d) => {
      fs.mkdirSync(path.join(d, 'images'))
      fs.writeFileSync(path.join(d, 'images', 'doc.png'), 'x')
    },
  })
  assert.match(ts.log, /Block 2: rendering → images\/doc-2\.png/)
  assert.match(ts.log, /Block 1: already converted, skipping/)
  assert.equal((ts.md.match(/<details>/g) || []).length, 2)
  assert.match(ts.md, /!\[diagram\]\(images\/doc-2\.png\)\n\n<details><summary>Mermaid source<\/summary>\n\n```mermaid\ngraph TD\n  C --> D\n```/)
})

test('dry run reports a missing PNG as a re-render', async () => {
  const ts = await run(M2P.full.md, { dryRun: true })
  assert.match(ts.log, /Block 1: would re-render \(image missing\) → images\/doc-1\.png/)
  assert.equal(ts.md, M2P.full.md)
})

test('dry run writes nothing and logs as recorded', async () => {
  const ts = await run(DOC, { dryRun: true })
  assert.equal(ts.md, DOC)
  assert.equal(ts.images, null)
  assert.equal(M2P.dryRun.md, DOC)
  assert.equal(ts.log, M2P.dryRun.log)
})
