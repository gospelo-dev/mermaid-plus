// The TS port gives the same results as the Python scripts in
// scripts/. Skipped without python3.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  deriveLightTint, lowContrastWarning, perceptualLightness, perceptualSaturation, processMarkdown,
} from '../src/index.ts'

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const SCRIPTS = path.join(ROOT, 'scripts')
const CLI = path.join(ROOT, 'src/cli/main.ts')
const hasPython = spawnSync('python3', ['--version']).status === 0
const opts = { skip: hasPython ? false : 'python3 not found' }

function tmpdir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'mermaid-plus-parity-'))
}

// Deterministic sample of colors: corners, greys, near-white, and an LCG walk.
function sampleColors(n) {
  const out = ['#000000', '#FFFFFF', '#808080', '#0D9488', '#FF0000', '#00FF00', '#0000FF', '#FEFEFE', '#F0F0F0', '#FFFF00']
  let x = 12345
  while (out.length < n) {
    x = (x * 1103515245 + 12345) % 2 ** 31
    out.push('#' + (x % 0x1000000).toString(16).toUpperCase().padStart(6, '0'))
  }
  return out
}

test('CIELAB results match apply_theme.py', opts, () => {
  const colors = sampleColors(2000)
  const helper = path.join(ROOT, 'tests/helpers/cielab_dump.py')
  const expected = JSON.parse(execFileSync('python3', ['-I', helper, SCRIPTS], { input: JSON.stringify(colors) }).toString())
  colors.forEach((c, i) => {
    const got = [deriveLightTint(c), perceptualSaturation(c).toFixed(2), perceptualLightness(c).toFixed(2)]
    assert.deepEqual(got, expected[i], c)
  })
})

const DOC = `# Doc

Intro with emoji 🚀 before the blocks.

\`\`\`mermaid
flowchart LR
  subgraph S[Service]
    A["fa:fa-user User"] --> B[API]
  end
  B -.-> C[(DB)]
\`\`\`

Text between.

\`\`\`mermaid
sequenceDiagram
  A->>B: hi
\`\`\`

\`\`\`js
console.log('not mermaid')
\`\`\`
`

// The prompts differ only in the block headers: Python prints code-point
// offsets, the port prints fence lines.
function withoutBlockHeaders(prompt) {
  return prompt.replace(/^### Block (\d+) \(.*\)$/gm, '### Block $1')
}

for (const accent of [null, '#2563EB', "'7c3aed'", '#EEEEEE']) {
  test(`apply-theme prompt matches apply_theme.py (accent ${accent})`, opts, () => {
    const dir = tmpdir()
    const md = path.join(dir, 'doc.md')
    fs.writeFileSync(md, DOC)
    const extra = accent ? ['--accent', accent] : []
    const py = spawnSync('python3', [path.join(SCRIPTS, 'apply_theme.py'), md, ...extra], { encoding: 'utf8' })
    const ts = spawnSync(process.execPath, [CLI, 'apply-theme', md, ...extra], { encoding: 'utf8' })
    assert.equal(ts.status, py.status)
    assert.equal(ts.stderr, py.stderr)
    assert.equal(withoutBlockHeaders(ts.stdout), withoutBlockHeaders(py.stdout))
    assert.match(ts.stdout, /^### Block 1 \(lines 5–11\)$/m)
  })
}

test('apply-theme rejects a bad accent like apply_theme.py', opts, () => {
  const dir = tmpdir()
  const md = path.join(dir, 'doc.md')
  fs.writeFileSync(md, DOC)
  const py = spawnSync('python3', [path.join(SCRIPTS, 'apply_theme.py'), md, '--accent', '#12345'], { encoding: 'utf8' })
  const ts = spawnSync(process.execPath, [CLI, 'apply-theme', md, '--accent', '#12345'], { encoding: 'utf8' })
  assert.equal(ts.status, py.status)
  assert.equal(ts.stderr, py.stderr)
})

test('low-contrast warning text matches', opts, () => {
  assert.match(lowContrastWarning('#EEEEEE'), /^Warning: #EEEEEE has low contrast on white \(saturation=0\.00, lightness=0\.94\)/)
  assert.equal(lowContrastWarning('#0D9488'), null)
})

// A stand-in for mmdc that writes a PNG signature to -o.
function fakeMmdc(dir) {
  const bin = path.join(dir, 'bin')
  fs.mkdirSync(bin)
  const script = path.join(bin, 'mmdc')
  fs.writeFileSync(script, `#!/bin/sh
while [ $# -gt 0 ]; do [ "$1" = "-o" ] && out="$2"; shift; done
printf '\\211PNG\\r\\n\\032\\n' > "$out"
`)
  fs.chmodSync(script, 0o755)
  return bin
}

const fakeRenderer = {
  async render() {
    return { images: [{ png: new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), width: 1, height: 1 }], browser: { path: 'fake', source: 'fake' } }
  },
  async close() {},
}

async function runBoth(doc, { dryRun = false, prepare = () => {} } = {}) {
  const dir = tmpdir()
  const pyDir = path.join(dir, 'py')
  const tsDir = path.join(dir, 'ts')
  for (const d of [pyDir, tsDir]) {
    fs.mkdirSync(d)
    fs.writeFileSync(path.join(d, 'doc.md'), doc)
    prepare(d)
  }
  const bin = fakeMmdc(dir)
  const py = spawnSync('python3', [path.join(SCRIPTS, 'mermaid2png.py'), path.join(pyDir, 'doc.md'), ...(dryRun ? ['--dry-run'] : [])], {
    encoding: 'utf8', env: { ...process.env, PATH: `${bin}:${process.env.PATH}` },
  })
  assert.equal(py.status, 0, py.stderr)
  const lines = []
  await processMarkdown(path.join(tsDir, 'doc.md'), { dryRun, renderer: fakeRenderer, log: (l) => lines.push(l), warn: () => {} })
  const read = (d) => ({
    md: fs.readFileSync(path.join(d, 'doc.md'), 'utf8'),
    images: fs.existsSync(path.join(d, 'images')) ? fs.readdirSync(path.join(d, 'images')).sort() : null,
  })
  return { py: { ...read(pyDir), log: py.stdout }, ts: { ...read(tsDir), log: lines.join('\n') + '\n' } }
}

test('mermaid2png rewrites Markdown like mermaid2png.py', opts, async () => {
  const { py, ts } = await runBoth(DOC)
  assert.equal(ts.md, py.md)
  assert.deepEqual(ts.images, py.images)
  assert.equal(ts.log, py.log)
})

test('mermaid2png single block uses <base>.png like mermaid2png.py', opts, async () => {
  const { py, ts } = await runBoth('```mermaid\ngraph TD\n  A --> B\n```\n')
  assert.equal(ts.md, py.md)
  assert.deepEqual(ts.images, ['doc.png'])
})

test('second run skips converted blocks like mermaid2png.py', opts, async () => {
  const first = await runBoth(DOC)
  const { py, ts } = await runBoth(first.py.md, {
    prepare: (d) => {
      fs.mkdirSync(path.join(d, 'images'))
      fs.writeFileSync(path.join(d, 'images', 'doc-1.png'), 'x') // doc-2.png missing: re-render block 2
    },
  })
  assert.equal(ts.md, py.md)
  assert.equal(ts.log, py.log)
})

test('dry run matches mermaid2png.py and writes nothing', opts, async () => {
  const { py, ts } = await runBoth(DOC, { dryRun: true })
  assert.equal(ts.md, DOC)
  assert.equal(py.md, DOC)
  assert.equal(ts.images, null)
  assert.equal(ts.log, py.log)
})
